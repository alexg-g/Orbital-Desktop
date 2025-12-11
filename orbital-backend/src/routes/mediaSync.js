const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, validationError, forbiddenError, notFoundError, conflictError } = require('../middleware/errorHandler');
const db = require('../config/database');
const logger = require('../utils/logger');
const { broadcastToConversation, sendToUser } = require('../websocket/signalWebSocket');
const { getGroupMemberIds } = require('../services/groupService');

const router = express.Router();

/**
 * Historic Media Sync API Endpoints
 *
 * Issue #79: Enable async peer-to-peer recovery of expired media.
 * Users can request expired media from other orbit members.
 * Any member with the file locally can provide it.
 */

// Time range presets (days)
const TIME_RANGES = {
  'last_month': 30,
  'last_6_months': 180,
  'all_time': null, // No limit
};

// Configure multer for chunked uploads (5MB max per chunk)
const chunkStorage = multer.memoryStorage();
const chunkUpload = multer({
  storage: chunkStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max chunk size
    files: 1
  }
});

/**
 * POST /api/media-sync/request
 * Create a new historic media sync request
 *
 * Body params:
 * - group_id: UUID
 * - time_range: 'last_month' | 'last_6_months' | 'all_time'
 * - max_bytes: Number (optional, default 10GB)
 */
router.post('/request', authenticate, asyncHandler(async (req, res) => {
  const { group_id, time_range, max_bytes = 10737418240 } = req.body;
  const requestorId = req.user.userId;

  // Validate required fields
  if (!group_id || !time_range) {
    throw validationError('Missing required fields: group_id, time_range');
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(group_id)) {
    throw validationError('Invalid group_id format');
  }

  if (!TIME_RANGES.hasOwnProperty(time_range)) {
    throw validationError('Invalid time_range. Must be: last_month, last_6_months, or all_time');
  }

  // Validate max_bytes
  const maxBytesNum = parseInt(max_bytes, 10);
  if (isNaN(maxBytesNum) || maxBytesNum <= 0 || maxBytesNum > 10737418240) {
    throw validationError('max_bytes must be between 1 and 10737418240 (10GB)');
  }

  // Verify user is member of group
  const memberCheck = await db.query(
    'SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2',
    [group_id, requestorId]
  );

  if (memberCheck.rowCount === 0) {
    throw forbiddenError('Not a member of this group');
  }

  // Check for existing active request
  const existingRequest = await db.query(
    `SELECT id FROM media_sync_requests
     WHERE group_id = $1 AND requestor_id = $2 AND status IN ('pending', 'in_progress')`,
    [group_id, requestorId]
  );

  if (existingRequest.rowCount > 0) {
    throw conflictError('You already have an active sync request for this group');
  }

  // Calculate since_date from time_range
  let sinceDate;
  if (time_range === 'all_time') {
    sinceDate = new Date('2020-01-01'); // Orbital launch date
  } else {
    const days = TIME_RANGES[time_range];
    sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
  }

  // Calculate expires_at (7 days)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Create sync request
    const requestResult = await client.query(
      `INSERT INTO media_sync_requests
       (requestor_id, group_id, since_date, max_bytes, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [requestorId, group_id, sinceDate, maxBytesNum, expiresAt]
    );
    const request = requestResult.rows[0];

    // Find expired media that needs to be synced:
    // 1. It's in this group
    // 2. It was created after since_date
    // 3. Server copy has expired (expires_at < NOW())
    // 4. Requestor didn't upload it (they'd already have it)
    const expiredMedia = await client.query(
      `SELECT m.id, m.size_bytes
       FROM media m
       WHERE m.group_id = $1
         AND m.uploaded_at >= $2
         AND m.expires_at < NOW()
         AND m.author_id != $3
       ORDER BY m.uploaded_at ASC`,
      [group_id, sinceDate, requestorId]
    );

    // Create sync items for each media (up to max_bytes)
    let totalBytes = 0;
    let itemsCreated = 0;

    for (const media of expiredMedia.rows) {
      const sizeBytes = parseInt(media.size_bytes, 10);
      if (totalBytes + sizeBytes > maxBytesNum) break;

      await client.query(
        `INSERT INTO media_sync_items
         (request_id, media_id, size_bytes)
         VALUES ($1, $2, $3)`,
        [request.id, media.id, sizeBytes]
      );

      totalBytes += sizeBytes;
      itemsCreated++;
    }

    await client.query('COMMIT');

    logger.info('Media sync request created', {
      requestId: request.id,
      requestorId,
      groupId: group_id,
      timeRange: time_range,
      itemsCount: itemsCreated,
      totalBytes
    });

    // Notify all other group members via WebSocket
    const memberIds = await getGroupMemberIds(group_id);
    const recipients = memberIds.filter(id => id !== requestorId);

    if (recipients.length > 0) {
      broadcastToConversation(group_id, recipients, {
        type: 'media_sync_request',
        request_id: request.id,
        requestor_id: requestorId,
        group_id,
        items_count: itemsCreated,
        total_bytes: totalBytes,
        timestamp: Date.now()
      });
    }

    res.status(201).json({
      request_id: request.id,
      items_count: itemsCreated,
      total_bytes: totalBytes,
      members_notified: recipients.length,
      expires_at: expiresAt.toISOString(),
      created_at: request.created_at
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/media-sync/requests
 * List my sync requests (as requestor)
 */
router.get('/requests', authenticate, asyncHandler(async (req, res) => {
  const requestorId = req.user.userId;

  const result = await db.query(
    `SELECT
       r.id,
       r.group_id,
       r.since_date,
       r.max_bytes,
       r.bytes_uploaded,
       r.bytes_downloaded,
       r.status,
       r.created_at,
       r.expires_at,
       r.completed_at,
       COUNT(i.id) as items_total,
       COUNT(i.id) FILTER (WHERE i.status = 'downloaded') as items_completed,
       COUNT(i.id) FILTER (WHERE i.status = 'uploaded') as items_ready
     FROM media_sync_requests r
     LEFT JOIN media_sync_items i ON i.request_id = r.id
     WHERE r.requestor_id = $1
     GROUP BY r.id
     ORDER BY r.created_at DESC`,
    [requestorId]
  );

  const requests = result.rows.map(row => ({
    id: row.id,
    group_id: row.group_id,
    since_date: row.since_date,
    max_bytes: parseInt(row.max_bytes, 10),
    bytes_uploaded: parseInt(row.bytes_uploaded, 10),
    bytes_downloaded: parseInt(row.bytes_downloaded, 10),
    status: row.status,
    items_total: parseInt(row.items_total, 10),
    items_completed: parseInt(row.items_completed, 10),
    items_ready: parseInt(row.items_ready, 10),
    created_at: row.created_at,
    expires_at: row.expires_at,
    completed_at: row.completed_at
  }));

  res.status(200).json({ requests });
}));

/**
 * GET /api/media-sync/pending-items/:requestId
 * Get items still needed for a sync request (for any member to fulfill)
 */
router.get('/pending-items/:requestId', authenticate, asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const userId = req.user.userId;

  // Verify request exists and user is member of the group
  const requestResult = await db.query(
    `SELECT r.id, r.group_id, r.requestor_id, r.status, r.expires_at
     FROM media_sync_requests r
     WHERE r.id = $1`,
    [requestId]
  );

  if (requestResult.rowCount === 0) {
    throw notFoundError('Sync request not found');
  }

  const request = requestResult.rows[0];

  // Check if expired
  if (new Date(request.expires_at) < new Date()) {
    throw notFoundError('Sync request has expired');
  }

  // Verify user is member of the group
  const memberCheck = await db.query(
    'SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2',
    [request.group_id, userId]
  );

  if (memberCheck.rowCount === 0) {
    throw forbiddenError('Not a member of this group');
  }

  // Get pending items (not yet uploaded)
  const itemsResult = await db.query(
    `SELECT
       i.id as item_id,
       i.request_id,
       i.media_id,
       i.size_bytes,
       m.encrypted_metadata
     FROM media_sync_items i
     INNER JOIN media m ON m.id = i.media_id
     WHERE i.request_id = $1 AND i.status = 'pending'
     ORDER BY i.size_bytes ASC`,
    [requestId]
  );

  const items = itemsResult.rows.map(row => {
    let metadata = {};
    try {
      metadata = JSON.parse(row.encrypted_metadata);
    } catch (error) {
      // Ignore parse errors
    }

    return {
      item_id: row.item_id,
      request_id: row.request_id,
      media_id: row.media_id,
      requestor_id: request.requestor_id,
      group_id: request.group_id,
      size_bytes: parseInt(row.size_bytes, 10),
      content_type: metadata.contentType,
      file_name: metadata.fileName
    };
  });

  res.status(200).json({
    request_id: requestId,
    requestor_id: request.requestor_id,
    group_id: request.group_id,
    status: request.status,
    expires_at: request.expires_at,
    items
  });
}));

/**
 * POST /api/media-sync/upload/:itemId/chunk
 * Upload a chunk for a sync item (any member can provide)
 *
 * Body params:
 * - chunk_index: Integer (0-based)
 * - total_chunks: Integer
 * - chunk: File (multipart, max 5MB)
 */
router.post('/upload/:itemId/chunk', authenticate, chunkUpload.single('chunk'), asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  const userId = req.user.userId;

  if (!req.file) {
    throw validationError('No chunk uploaded');
  }

  const { chunk_index, total_chunks } = req.body;

  if (chunk_index === undefined || !total_chunks) {
    throw validationError('Missing required fields: chunk_index, total_chunks');
  }

  const chunkIdx = parseInt(chunk_index, 10);
  const totalChunks = parseInt(total_chunks, 10);

  if (isNaN(chunkIdx) || isNaN(totalChunks) || chunkIdx < 0 || chunkIdx >= totalChunks) {
    throw validationError('Invalid chunk_index or total_chunks');
  }

  // Verify item exists and is pending
  const itemResult = await db.query(
    `SELECT
       i.id, i.request_id, i.media_id, i.status, i.size_bytes,
       r.group_id, r.requestor_id, r.expires_at
     FROM media_sync_items i
     INNER JOIN media_sync_requests r ON r.id = i.request_id
     WHERE i.id = $1`,
    [itemId]
  );

  if (itemResult.rowCount === 0) {
    throw notFoundError('Sync item not found');
  }

  const item = itemResult.rows[0];

  // Check if expired
  if (new Date(item.expires_at) < new Date()) {
    throw notFoundError('Sync request has expired');
  }

  // Check if already uploaded
  if (item.status !== 'pending') {
    throw conflictError('This item has already been uploaded by another member');
  }

  // Verify user is member of group (and not the requestor)
  const memberCheck = await db.query(
    'SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2',
    [item.group_id, userId]
  );

  if (memberCheck.rowCount === 0) {
    throw forbiddenError('Not a member of this group');
  }

  // Save chunk to disk
  const uploadDir = process.env.MEDIA_STORAGE_PATH || './uploads';
  const syncDir = path.join(uploadDir, 'sync', itemId);
  await fs.mkdir(syncDir, { recursive: true });

  const chunkPath = path.join(syncDir, `chunk-${chunkIdx}`);
  await fs.writeFile(chunkPath, req.file.buffer);

  // Track chunk progress (simple file-based tracking)
  const progressFile = path.join(syncDir, 'progress.json');
  let progress = { chunks: [], totalChunks, uploadedBy: userId };

  try {
    const progressData = await fs.readFile(progressFile, 'utf8');
    progress = JSON.parse(progressData);

    // Verify same uploader (first to start wins)
    if (progress.uploadedBy !== userId) {
      // Clean up this chunk
      await fs.unlink(chunkPath).catch(() => {});
      throw conflictError('Another member has already started uploading this item');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // First chunk
  }

  if (!progress.chunks.includes(chunkIdx)) {
    progress.chunks.push(chunkIdx);
    progress.chunks.sort((a, b) => a - b);
  }

  await fs.writeFile(progressFile, JSON.stringify(progress));

  const isComplete = progress.chunks.length === totalChunks;

  logger.info('Sync chunk uploaded', {
    itemId,
    chunkIndex: chunkIdx,
    totalChunks,
    chunksReceived: progress.chunks.length,
    uploadedBy: userId
  });

  res.status(200).json({
    item_id: itemId,
    chunk_index: chunkIdx,
    chunks_received: progress.chunks.length,
    total_chunks: totalChunks,
    progress: (progress.chunks.length / totalChunks * 100).toFixed(2) + '%',
    complete: isComplete
  });
}));

/**
 * POST /api/media-sync/upload/:itemId/complete
 * Finalize sync item upload
 */
router.post('/upload/:itemId/complete', authenticate, asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  const userId = req.user.userId;

  // Verify item exists
  const itemResult = await db.query(
    `SELECT
       i.id, i.request_id, i.media_id, i.status, i.size_bytes,
       r.group_id, r.requestor_id, r.expires_at
     FROM media_sync_items i
     INNER JOIN media_sync_requests r ON r.id = i.request_id
     WHERE i.id = $1`,
    [itemId]
  );

  if (itemResult.rowCount === 0) {
    throw notFoundError('Sync item not found');
  }

  const item = itemResult.rows[0];

  if (item.status !== 'pending') {
    throw conflictError('This item has already been uploaded');
  }

  // Verify user is member of group
  const memberCheck = await db.query(
    'SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2',
    [item.group_id, userId]
  );

  if (memberCheck.rowCount === 0) {
    throw forbiddenError('Not a member of this group');
  }

  // Read progress file
  const uploadDir = process.env.MEDIA_STORAGE_PATH || './uploads';
  const syncDir = path.join(uploadDir, 'sync', itemId);
  const progressFile = path.join(syncDir, 'progress.json');

  let progress;
  try {
    const progressData = await fs.readFile(progressFile, 'utf8');
    progress = JSON.parse(progressData);
  } catch (error) {
    throw validationError('No upload progress found for this item');
  }

  // Verify uploader
  if (progress.uploadedBy !== userId) {
    throw forbiddenError('Only the uploader can finalize this upload');
  }

  // Verify all chunks received
  if (progress.chunks.length !== progress.totalChunks) {
    throw validationError(
      `Upload incomplete: ${progress.chunks.length}/${progress.totalChunks} chunks received`
    );
  }

  // Concatenate chunks
  const { v4: uuidv4 } = require('uuid');
  const finalFilename = `sync-${uuidv4()}.enc`;
  const finalPath = path.join(uploadDir, 'sync-files', finalFilename);

  await fs.mkdir(path.dirname(finalPath), { recursive: true });

  const writeStream = fsSync.createWriteStream(finalPath);

  for (let i = 0; i < progress.totalChunks; i++) {
    const chunkPath = path.join(syncDir, `chunk-${i}`);
    try {
      const chunkData = await fs.readFile(chunkPath);
      await new Promise((resolve, reject) => {
        writeStream.write(chunkData, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      writeStream.close();
      await fs.unlink(finalPath).catch(() => {});
      throw new Error(`Failed to read chunk ${i}: ${error.message}`);
    }
  }

  await new Promise((resolve, reject) => {
    writeStream.end((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Get final file size
  const stats = await fs.stat(finalPath);
  const finalSize = stats.size;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Update sync item
    await client.query(
      `UPDATE media_sync_items
       SET status = 'uploaded', uploaded_by = $1, storage_url = $2, uploaded_at = NOW()
       WHERE id = $3`,
      [userId, finalPath, itemId]
    );

    // Update request bytes_uploaded
    await client.query(
      `UPDATE media_sync_requests
       SET bytes_uploaded = bytes_uploaded + $1,
           status = CASE
             WHEN status = 'pending' THEN 'in_progress'
             ELSE status
           END
       WHERE id = $2`,
      [finalSize, item.request_id]
    );

    await client.query('COMMIT');

    // Clean up chunks in background
    fs.rm(syncDir, { recursive: true, force: true }).catch((err) => {
      logger.error('Failed to clean up sync chunks', {
        itemId,
        syncDir,
        error: err.message
      });
    });

    logger.info('Sync item upload complete', {
      itemId,
      mediaId: item.media_id,
      uploadedBy: userId,
      sizeBytes: finalSize
    });

    // Notify requestor
    sendToUser(item.requestor_id, {
      type: 'media_sync_item_ready',
      request_id: item.request_id,
      item_id: itemId,
      media_id: item.media_id,
      size_bytes: finalSize,
      uploaded_by: userId,
      timestamp: Date.now()
    });

    // Check if all items are uploaded
    const remainingResult = await db.query(
      `SELECT COUNT(*) as pending FROM media_sync_items
       WHERE request_id = $1 AND status = 'pending'`,
      [item.request_id]
    );

    const pendingCount = parseInt(remainingResult.rows[0].pending, 10);

    if (pendingCount === 0) {
      // Notify requestor that all items are ready
      sendToUser(item.requestor_id, {
        type: 'media_sync_all_ready',
        request_id: item.request_id,
        timestamp: Date.now()
      });
    }

    res.status(200).json({
      item_id: itemId,
      media_id: item.media_id,
      size_bytes: finalSize,
      uploaded_at: new Date().toISOString(),
      items_remaining: pendingCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    // Clean up final file on error
    await fs.unlink(finalPath).catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/media-sync/download/:itemId
 * Download a sync item (as requestor)
 */
router.get('/download/:itemId', authenticate, asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  const userId = req.user.userId;

  // Verify item exists and user is requestor
  const itemResult = await db.query(
    `SELECT
       i.id, i.request_id, i.media_id, i.status, i.storage_url, i.size_bytes,
       r.group_id, r.requestor_id
     FROM media_sync_items i
     INNER JOIN media_sync_requests r ON r.id = i.request_id
     WHERE i.id = $1`,
    [itemId]
  );

  if (itemResult.rowCount === 0) {
    throw notFoundError('Sync item not found');
  }

  const item = itemResult.rows[0];

  // Verify user is requestor
  if (item.requestor_id !== userId) {
    throw forbiddenError('Only the requestor can download sync items');
  }

  // Check status
  if (item.status !== 'uploaded') {
    throw validationError(`Item not ready for download. Current status: ${item.status}`);
  }

  // Validate storage path
  const baseUploadDir = path.resolve(process.env.MEDIA_STORAGE_PATH || './uploads');
  const resolvedPath = path.resolve(item.storage_url);

  if (!resolvedPath.startsWith(baseUploadDir)) {
    logger.error('Path traversal attempt in sync download', {
      itemId,
      storagePath: item.storage_url,
      resolvedPath,
      baseUploadDir
    });
    throw forbiddenError('Invalid file path');
  }

  // Check file exists
  try {
    await fs.access(resolvedPath);
  } catch (error) {
    logger.error('Sync file not found on disk', {
      itemId,
      storagePath: resolvedPath
    });
    throw notFoundError('Sync file not found');
  }

  logger.info('Sync item download started', {
    itemId,
    mediaId: item.media_id,
    requestorId: userId,
    sizeBytes: item.size_bytes
  });

  // Set headers
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="media.enc"');
  res.setHeader('Content-Length', item.size_bytes);
  res.setHeader('X-Media-Id', item.media_id);

  // Stream file
  const fileStream = fsSync.createReadStream(resolvedPath);
  fileStream.pipe(res);
}));

/**
 * POST /api/media-sync/mark-downloaded/:itemId
 * Mark item as downloaded (cleanup)
 */
router.post('/mark-downloaded/:itemId', authenticate, asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  const userId = req.user.userId;

  // Verify item exists and user is requestor
  const itemResult = await db.query(
    `SELECT
       i.id, i.request_id, i.media_id, i.status, i.storage_url, i.size_bytes,
       r.group_id, r.requestor_id
     FROM media_sync_items i
     INNER JOIN media_sync_requests r ON r.id = i.request_id
     WHERE i.id = $1`,
    [itemId]
  );

  if (itemResult.rowCount === 0) {
    throw notFoundError('Sync item not found');
  }

  const item = itemResult.rows[0];

  if (item.requestor_id !== userId) {
    throw forbiddenError('Only the requestor can mark items as downloaded');
  }

  if (item.status !== 'uploaded') {
    throw validationError(`Cannot mark as downloaded. Current status: ${item.status}`);
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Update item status
    await client.query(
      `UPDATE media_sync_items
       SET status = 'downloaded', downloaded_at = NOW()
       WHERE id = $1`,
      [itemId]
    );

    // Update request bytes_downloaded
    const sizeBytes = parseInt(item.size_bytes, 10);
    await client.query(
      `UPDATE media_sync_requests
       SET bytes_downloaded = bytes_downloaded + $1
       WHERE id = $2`,
      [sizeBytes, item.request_id]
    );

    // Delete the sync file (no longer needed)
    if (item.storage_url) {
      await fs.unlink(item.storage_url).catch((err) => {
        logger.warn('Failed to delete sync file after download', {
          itemId,
          storagePath: item.storage_url,
          error: err.message
        });
      });
    }

    // Check if all items downloaded
    const remainingResult = await client.query(
      `SELECT COUNT(*) as remaining FROM media_sync_items
       WHERE request_id = $1 AND status != 'downloaded'`,
      [item.request_id]
    );

    const remainingCount = parseInt(remainingResult.rows[0].remaining, 10);

    if (remainingCount === 0) {
      // Mark request as completed
      await client.query(
        `UPDATE media_sync_requests
         SET status = 'completed', completed_at = NOW()
         WHERE id = $1`,
        [item.request_id]
      );
    }

    await client.query('COMMIT');

    logger.info('Sync item marked as downloaded', {
      itemId,
      mediaId: item.media_id,
      requestorId: userId,
      isComplete: remainingCount === 0
    });

    res.status(200).json({
      item_id: itemId,
      media_id: item.media_id,
      status: 'downloaded',
      request_complete: remainingCount === 0,
      items_remaining: remainingCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * DELETE /api/media-sync/request/:requestId
 * Cancel a sync request (as requestor)
 */
router.delete('/request/:requestId', authenticate, asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const userId = req.user.userId;

  // Verify request exists and user is requestor
  const requestResult = await db.query(
    `SELECT id, requestor_id, group_id, status
     FROM media_sync_requests
     WHERE id = $1`,
    [requestId]
  );

  if (requestResult.rowCount === 0) {
    throw notFoundError('Sync request not found');
  }

  const request = requestResult.rows[0];

  if (request.requestor_id !== userId) {
    throw forbiddenError('Only the requestor can cancel this request');
  }

  if (request.status === 'completed' || request.status === 'cancelled') {
    throw validationError(`Cannot cancel request with status: ${request.status}`);
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Get all sync file paths for cleanup
    const filesResult = await client.query(
      `SELECT storage_url FROM media_sync_items
       WHERE request_id = $1 AND storage_url IS NOT NULL`,
      [requestId]
    );

    // Update request status
    await client.query(
      `UPDATE media_sync_requests
       SET status = 'cancelled'
       WHERE id = $1`,
      [requestId]
    );

    await client.query('COMMIT');

    // Clean up files in background
    for (const row of filesResult.rows) {
      fs.unlink(row.storage_url).catch((err) => {
        logger.warn('Failed to delete sync file on cancel', {
          requestId,
          storagePath: row.storage_url,
          error: err.message
        });
      });
    }

    logger.info('Sync request cancelled', {
      requestId,
      requestorId: userId,
      filesDeleted: filesResult.rowCount
    });

    res.status(200).json({
      request_id: requestId,
      status: 'cancelled'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/media-sync/ready-items
 * Get items ready for download (as requestor) - all requests
 */
router.get('/ready-items', authenticate, asyncHandler(async (req, res) => {
  const requestorId = req.user.userId;

  const result = await db.query(
    `SELECT
       i.id as item_id,
       i.request_id,
       i.media_id,
       i.size_bytes,
       i.uploaded_at,
       r.group_id
     FROM media_sync_items i
     INNER JOIN media_sync_requests r ON r.id = i.request_id
     WHERE r.requestor_id = $1
       AND r.status IN ('pending', 'in_progress')
       AND i.status = 'uploaded'
     ORDER BY i.uploaded_at ASC`,
    [requestorId]
  );

  const items = result.rows.map(row => ({
    item_id: row.item_id,
    request_id: row.request_id,
    media_id: row.media_id,
    group_id: row.group_id,
    size_bytes: parseInt(row.size_bytes, 10),
    uploaded_at: row.uploaded_at
  }));

  res.status(200).json({ items });
}));

/**
 * GET /api/media-sync/ready-items/:requestId
 * Get items ready for download for a specific request (as requestor)
 */
router.get('/ready-items/:requestId', authenticate, asyncHandler(async (req, res) => {
  const requestorId = req.user.userId;
  const { requestId } = req.params;

  // Verify request exists and user is requestor
  const requestResult = await db.query(
    `SELECT id, requestor_id FROM media_sync_requests WHERE id = $1`,
    [requestId]
  );

  if (requestResult.rowCount === 0) {
    throw notFoundError('Sync request not found');
  }

  const request = requestResult.rows[0];

  if (request.requestor_id !== requestorId) {
    throw forbiddenError('Only the requestor can view ready items');
  }

  const result = await db.query(
    `SELECT
       i.id as item_id,
       i.request_id,
       i.media_id,
       i.size_bytes,
       i.uploaded_at,
       r.group_id
     FROM media_sync_items i
     INNER JOIN media_sync_requests r ON r.id = i.request_id
     WHERE i.request_id = $1
       AND i.status = 'uploaded'
     ORDER BY i.uploaded_at ASC`,
    [requestId]
  );

  const items = result.rows.map(row => ({
    item_id: row.item_id,
    request_id: row.request_id,
    media_id: row.media_id,
    group_id: row.group_id,
    size_bytes: parseInt(row.size_bytes, 10),
    uploaded_at: row.uploaded_at
  }));

  res.status(200).json({ items });
}));

module.exports = router;
