const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, validationError, forbiddenError, notFoundError } = require('../middleware/errorHandler');
const db = require('../config/database');
const logger = require('../utils/logger');
const quotaService = require('../services/quotaService');

const router = express.Router();

/**
 * Media Upload/Download API Endpoints
 *
 * Handles encrypted media relay with 7-day expiration.
 * All media is encrypted client-side before upload.
 */

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = process.env.MEDIA_STORAGE_PATH || './uploads';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Generate unique filename (UUID + .enc extension)
    const { v4: uuidv4 } = require('uuid');
    const filename = `${uuidv4()}.enc`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Accept only encrypted files (all files accepted since already encrypted)
    cb(null, true);
  }
});

// Configure multer for chunked uploads (5MB max per chunk)
const chunkStorage = multer.memoryStorage(); // Store chunks in memory temporarily

const chunkUpload = multer({
  storage: chunkStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max chunk size
    files: 1
  }
});

/**
 * POST /api/media/upload/chunk
 * Upload a single chunk of a large file
 *
 * Body params:
 * - media_id: UUID (client-generated, consistent across chunks)
 * - group_id: UUID
 * - chunk_index: Integer (0-based)
 * - total_chunks: Integer
 * - encrypted_metadata: String (only required on first chunk)
 * - encryption_iv: String (only required on first chunk)
 * - plaintext_hash: String (optional, for integrity verification)
 * - chunk: File (multipart, max 5MB)
 */
router.post('/upload/chunk', authenticate, chunkUpload.single('chunk'), asyncHandler(async (req, res) => {
  const { v4: uuidv4 } = require('uuid');

  if (!req.file) {
    throw validationError('No chunk uploaded');
  }

  const {
    media_id,
    group_id,
    chunk_index,
    total_chunks,
    encrypted_metadata,
    encryption_iv,
    plaintext_hash
  } = req.body;

  // Validate required fields
  if (!media_id || !group_id || chunk_index === undefined || !total_chunks) {
    throw validationError('Missing required fields: media_id, group_id, chunk_index, total_chunks');
  }

  const chunkIdx = parseInt(chunk_index, 10);
  const totalChunks = parseInt(total_chunks, 10);

  // Validate chunk parameters
  if (isNaN(chunkIdx) || isNaN(totalChunks) || chunkIdx < 0 || chunkIdx >= totalChunks) {
    throw validationError('Invalid chunk_index or total_chunks');
  }

  if (totalChunks > 100) {
    throw validationError('Maximum 100 chunks allowed (500MB file ÷ 5MB chunks)');
  }

  // Verify user is member of group
  const memberCheck = await db.query(
    'SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2',
    [group_id, req.user.userId]
  );

  if (memberCheck.rowCount === 0) {
    throw forbiddenError('Not a member of this group');
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Check if this is the first chunk or continuing upload
    let tempUpload = await client.query(
      'SELECT * FROM temp_uploads WHERE media_id = $1',
      [media_id]
    );

    if (tempUpload.rowCount === 0) {
      // First chunk - create temp_uploads record
      if (chunkIdx !== 0) {
        throw validationError('First chunk must have chunk_index = 0');
      }

      if (!encrypted_metadata || !encryption_iv) {
        throw validationError('First chunk must include encrypted_metadata and encryption_iv');
      }

      // Check group quota before starting (estimate based on max chunk size)
      const estimatedSize = totalChunks * 5 * 1024 * 1024; // Estimate 5MB per chunk
      const quotaCheck = await quotaService.checkQuotaAvailable(group_id, estimatedSize, client);

      if (!quotaCheck.allowed) {
        throw new Error(quotaCheck.reason);
      }

      // Create temp_uploads record
      await client.query(
        `INSERT INTO temp_uploads
         (media_id, group_id, user_id, total_chunks, chunks_received, chunk_bitmap,
          encrypted_metadata, encryption_iv, plaintext_hash, total_size_bytes)
         VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, $9)`,
        [media_id, group_id, req.user.userId, totalChunks, '0',
         encrypted_metadata, encryption_iv, plaintext_hash || null, req.file.size]
      );

      logger.info('Started chunked upload', {
        mediaId: media_id,
        groupId: group_id,
        userId: req.user.userId,
        totalChunks,
        chunkIndex: chunkIdx,
        chunkSize: req.file.size
      });
    } else {
      // Continuing upload
      const upload = tempUpload.rows[0];

      // Verify user owns this upload
      if (upload.user_id !== req.user.userId) {
        throw forbiddenError('Cannot upload chunks for another user\'s upload session');
      }

      // Verify total_chunks matches
      if (upload.total_chunks !== totalChunks) {
        throw validationError(`total_chunks mismatch: expected ${upload.total_chunks}, got ${totalChunks}`);
      }

      // Check if chunk already received
      const bitmap = upload.chunk_bitmap.split(',').filter(x => x).map(x => parseInt(x, 10));
      if (bitmap.includes(chunkIdx)) {
        // Chunk already received - idempotent response
        logger.info('Duplicate chunk received (idempotent)', {
          mediaId: media_id,
          chunkIndex: chunkIdx
        });

        await client.query('COMMIT');

        return res.status(200).json({
          media_id,
          chunk_index: chunkIdx,
          chunks_received: upload.chunks_received,
          total_chunks: upload.total_chunks,
          progress: (upload.chunks_received / upload.total_chunks * 100).toFixed(2) + '%',
          complete: upload.chunks_received === upload.total_chunks
        });
      }

      // Update bitmap and counts
      bitmap.push(chunkIdx);
      bitmap.sort((a, b) => a - b);
      const newBitmap = bitmap.join(',');
      const newChunksReceived = bitmap.length;
      const newTotalSize = upload.total_size_bytes + req.file.size;

      await client.query(
        `UPDATE temp_uploads
         SET chunks_received = $1, chunk_bitmap = $2, total_size_bytes = $3, updated_at = NOW()
         WHERE media_id = $4`,
        [newChunksReceived, newBitmap, newTotalSize, media_id]
      );

      logger.info('Chunk received', {
        mediaId: media_id,
        chunkIndex: chunkIdx,
        chunksReceived: newChunksReceived,
        totalChunks,
        progress: (newChunksReceived / totalChunks * 100).toFixed(2) + '%'
      });
    }

    // Save chunk to disk
    const uploadDir = process.env.MEDIA_STORAGE_PATH || './uploads';
    const tempDir = path.join(uploadDir, 'temp', media_id);

    await fs.mkdir(tempDir, { recursive: true });

    const chunkPath = path.join(tempDir, `chunk-${chunkIdx}`);
    await fs.writeFile(chunkPath, req.file.buffer);

    await client.query('COMMIT');

    // Fetch updated stats
    const updatedUpload = await db.query(
      'SELECT chunks_received, total_chunks FROM temp_uploads WHERE media_id = $1',
      [media_id]
    );

    const chunksReceived = updatedUpload.rows[0].chunks_received;
    const isComplete = chunksReceived === totalChunks;

    res.status(200).json({
      media_id,
      chunk_index: chunkIdx,
      chunks_received: chunksReceived,
      total_chunks: totalChunks,
      progress: (chunksReceived / totalChunks * 100).toFixed(2) + '%',
      complete: isComplete
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * POST /api/media/upload/complete
 * Finalize chunked upload by concatenating chunks into final file
 *
 * Body params:
 * - media_id: UUID
 */
router.post('/upload/complete', authenticate, asyncHandler(async (req, res) => {
  const { media_id } = req.body;

  if (!media_id) {
    throw validationError('Missing required field: media_id');
  }

  // Fetch temp_upload record
  const tempUploadResult = await db.query(
    `SELECT tu.*
     FROM temp_uploads tu
     WHERE tu.media_id = $1`,
    [media_id]
  );

  if (tempUploadResult.rowCount === 0) {
    throw notFoundError('Upload session not found');
  }

  const tempUpload = tempUploadResult.rows[0];

  // Verify user owns this upload
  if (tempUpload.user_id !== req.user.userId) {
    throw forbiddenError('Cannot finalize another user\'s upload session');
  }

  // Verify all chunks received
  if (tempUpload.chunks_received !== tempUpload.total_chunks) {
    throw validationError(
      `Upload incomplete: ${tempUpload.chunks_received}/${tempUpload.total_chunks} chunks received`
    );
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Concatenate chunks into final file
    const uploadDir = process.env.MEDIA_STORAGE_PATH || './uploads';
    const tempDir = path.join(uploadDir, 'temp', media_id);
    const { v4: uuidv4 } = require('uuid');
    const finalFilename = `${uuidv4()}.enc`;
    const finalPath = path.join(uploadDir, finalFilename);

    // Create write stream for final file
    const writeStream = fsSync.createWriteStream(finalPath);

    // Read chunks in order and concatenate
    for (let i = 0; i < tempUpload.total_chunks; i++) {
      const chunkPath = path.join(tempDir, `chunk-${i}`);

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

    // Close write stream
    await new Promise((resolve, reject) => {
      writeStream.end((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Get final file size
    const stats = await fs.stat(finalPath);
    const finalSize = stats.size;

    // Verify size matches expected
    if (finalSize !== tempUpload.total_size_bytes) {
      await fs.unlink(finalPath).catch(() => {});
      throw new Error(
        `Size mismatch: expected ${tempUpload.total_size_bytes} bytes, got ${finalSize} bytes`
      );
    }

    // Check group quota with actual size
    const quotaCheck = await quotaService.checkQuotaAvailable(tempUpload.group_id, finalSize, client);

    if (!quotaCheck.allowed) {
      await fs.unlink(finalPath).catch(() => {});
      throw new Error(quotaCheck.reason);
    }

    // Calculate expiration (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create media record (thread_id is null, will be set when creating thread/reply)
    const mediaResult = await client.query(
      `INSERT INTO media
       (group_id, thread_id, author_id, encrypted_metadata, storage_url, encryption_iv, size_bytes, expires_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)
       RETURNING id, uploaded_at, expires_at`,
      [
        tempUpload.group_id,
        tempUpload.user_id,
        tempUpload.encrypted_metadata,
        finalPath,
        tempUpload.encryption_iv,
        finalSize,
        expiresAt
      ]
    );

    const media = mediaResult.rows[0];

    // Update group quota
    await quotaService.incrementQuota(tempUpload.group_id, finalSize, client);

    // Delete temp_uploads record
    await client.query(
      'DELETE FROM temp_uploads WHERE media_id = $1',
      [media_id]
    );

    await client.query('COMMIT');

    // Clean up temporary chunks in background
    fs.rm(tempDir, { recursive: true, force: true }).catch((err) => {
      logger.error('Failed to clean up temp chunks', {
        mediaId: media_id,
        tempDir,
        error: err.message
      });
    });

    logger.info('Chunked upload finalized', {
      mediaId: media.id,
      groupId: tempUpload.group_id,
      userId: tempUpload.user_id,
      sizeBytes: finalSize,
      chunks: tempUpload.total_chunks
    });

    // TODO: Send WebSocket notification to group members
    // This would be implemented once WebSocket notification system is ready

    res.status(201).json({
      media_id: media.id,
      size_bytes: finalSize,
      uploaded_at: media.uploaded_at,
      expires_at: media.expires_at,
      chunks_uploaded: tempUpload.total_chunks
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * POST /api/media/upload
 * Upload encrypted media file (legacy single-request upload)
 */
router.post('/upload', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw validationError('No file uploaded');
  }

  const { group_id, encrypted_metadata, encryption_iv } = req.body;

  if (!group_id || !encrypted_metadata || !encryption_iv) {
    // Clean up uploaded file
    await fs.unlink(req.file.path);
    throw validationError('Missing required fields: group_id, encrypted_metadata, encryption_iv');
  }

  // Verify user is member of group
  const memberCheck = await db.query(
    'SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2',
    [group_id, req.user.userId]
  );

  if (memberCheck.rowCount === 0) {
    await fs.unlink(req.file.path);
    throw forbiddenError('Not a member of this group');
  }

  // Check group quota
  const quotaCheck = await quotaService.checkQuotaAvailable(group_id, req.file.size);

  if (!quotaCheck.allowed) {
    await fs.unlink(req.file.path);
    const error = new Error(quotaCheck.reason);
    error.statusCode = 413; // Payload Too Large
    error.quotaInfo = quotaCheck.currentUsage;
    throw error;
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Calculate expiration (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Store media metadata (thread_id is null, will be set when creating thread/reply)
    const result = await client.query(
      `INSERT INTO media (group_id, thread_id, author_id, encrypted_metadata, storage_url, encryption_iv, size_bytes, expires_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)
       RETURNING id, uploaded_at, expires_at`,
      [group_id, req.user.userId, encrypted_metadata, req.file.path, encryption_iv, req.file.size, expiresAt]
    );

    const media = result.rows[0];

    // Update group quota
    await quotaService.incrementQuota(group_id, req.file.size, client);

    await client.query('COMMIT');

    logger.info('Media uploaded', {
      mediaId: media.id,
      groupId: group_id,
      authorId: req.user.userId,
      sizeBytes: req.file.size
    });

    res.status(201).json({
      media_id: media.id,
      size_bytes: req.file.size,
      uploaded_at: media.uploaded_at,
      expires_at: media.expires_at
    });
  } catch (error) {
    await client.query('ROLLBACK');
    // Clean up file on error
    await fs.unlink(req.file.path).catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/media/:mediaId/download
 * Download encrypted media file
 */
router.get('/:mediaId/download', authenticate, asyncHandler(async (req, res) => {
  const { mediaId } = req.params;

  // Fetch media metadata
  const result = await db.query(
    `SELECT m.id, m.group_id, m.thread_id, m.storage_url, m.encryption_iv, m.size_bytes, m.expires_at
     FROM media m
     WHERE m.id = $1`,
    [mediaId]
  );

  if (result.rowCount === 0) {
    throw notFoundError('Media not found');
  }

  const media = result.rows[0];

  // Check if expired
  if (new Date(media.expires_at) < new Date()) {
    throw notFoundError('Media has expired (past 7-day retention)');
  }

  // Verify user is member of group
  const memberCheck = await db.query(
    'SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2',
    [media.group_id, req.user.userId]
  );

  if (memberCheck.rowCount === 0) {
    throw forbiddenError('Not a member of this group');
  }

  // SECURITY: Validate storage path to prevent path traversal attacks
  const baseUploadDir = path.resolve(process.env.MEDIA_STORAGE_PATH || './uploads');
  const resolvedPath = path.resolve(media.storage_url);

  if (!resolvedPath.startsWith(baseUploadDir)) {
    logger.error('Path traversal attempt detected', {
      mediaId,
      storagePath: media.storage_url,
      resolvedPath,
      baseUploadDir
    });
    throw forbiddenError('Invalid file path');
  }

  // Check if file exists
  try {
    await fs.access(resolvedPath);
  } catch (error) {
    logger.error('Media file not found on disk', {
      mediaId,
      storagePath: resolvedPath
    });
    throw notFoundError('Media file not found');
  }

  // Track download
  await db.query(
    `INSERT INTO media_downloads (media_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (media_id, user_id) DO NOTHING`,
    [mediaId, req.user.userId]
  );

  logger.info('Media downloaded', {
    mediaId,
    userId: req.user.userId
  });

  // Set headers
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="media.enc"`);
  res.setHeader('Content-Length', media.size_bytes);
  res.setHeader('X-Encryption-IV', media.encryption_iv);
  res.setHeader('X-Expires-At', media.expires_at);

  // Stream file to response (using validated resolvedPath)
  const fileStream = require('fs').createReadStream(resolvedPath);
  fileStream.pipe(res);
}));

/**
 * GET /api/media/:mediaId/info
 * Get media metadata without downloading
 */
router.get('/:mediaId/info', authenticate, asyncHandler(async (req, res) => {
  const { mediaId } = req.params;

  const result = await db.query(
    `SELECT m.id, m.group_id, m.thread_id, m.encrypted_metadata, m.encryption_iv, m.size_bytes,
            m.uploaded_at, m.expires_at
     FROM media m
     WHERE m.id = $1`,
    [mediaId]
  );

  if (result.rowCount === 0) {
    throw notFoundError('Media not found');
  }

  const media = result.rows[0];

  // Verify user is member
  const memberCheck = await db.query(
    'SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2',
    [media.group_id, req.user.userId]
  );

  if (memberCheck.rowCount === 0) {
    throw forbiddenError('Not a member of this group');
  }

  res.status(200).json({
    media_id: media.id,
    group_id: media.group_id,
    thread_id: media.thread_id,
    encrypted_metadata: media.encrypted_metadata,
    size_bytes: parseInt(media.size_bytes, 10),
    encryption_iv: media.encryption_iv,
    uploaded_at: media.uploaded_at,
    expires_at: media.expires_at,
    download_url: `/api/media/${media.id}/download`
  });
}));

/**
 * GET /api/threads/:threadId/media
 * List all media in thread
 */
router.get('/threads/:threadId/media', authenticate, asyncHandler(async (req, res) => {
  const { threadId } = req.params;

  // Verify thread exists and user has access
  const threadCheck = await db.query(
    'SELECT group_id FROM threads WHERE id = $1',
    [threadId]
  );

  if (threadCheck.rowCount === 0) {
    throw notFoundError('Thread not found');
  }

  const groupId = threadCheck.rows[0].group_id;

  // Verify membership
  const memberCheck = await db.query(
    'SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2',
    [groupId, req.user.userId]
  );

  if (memberCheck.rowCount === 0) {
    throw forbiddenError('Not a member of this group');
  }

  // Fetch media
  const result = await db.query(
    `SELECT id, encrypted_metadata, size_bytes, uploaded_at, expires_at
     FROM media
     WHERE thread_id = $1 AND expires_at > NOW()
     ORDER BY uploaded_at DESC`,
    [threadId]
  );

  const mediaList = result.rows.map(row => ({
    media_id: row.id,
    encrypted_metadata: row.encrypted_metadata,
    size_bytes: parseInt(row.size_bytes, 10),
    uploaded_at: row.uploaded_at,
    expires_at: row.expires_at
  }));

  res.status(200).json({ media: mediaList });
}));

/**
 * DELETE /api/media/:mediaId
 * Delete media file and free up quota
 * Only the author or group creator can delete media
 */
router.delete('/:mediaId', authenticate, asyncHandler(async (req, res) => {
  const { mediaId } = req.params;

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Fetch media with author, group info, and file path
    const result = await client.query(
      `SELECT m.id, m.author_id, m.storage_url, m.size_bytes, t.group_id, g.created_by as group_creator
       FROM media m
       INNER JOIN threads t ON t.id = m.thread_id
       INNER JOIN groups g ON g.id = t.group_id
       WHERE m.id = $1
       FOR UPDATE`,
      [mediaId]
    );

    if (result.rowCount === 0) {
      throw notFoundError('Media not found');
    }

    const media = result.rows[0];

    // Verify user is either the author or group creator
    const isAuthor = media.author_id === req.user.userId;
    const isGroupCreator = media.group_creator === req.user.userId;

    if (!isAuthor && !isGroupCreator) {
      throw forbiddenError('Only the uploader or group creator can delete media');
    }

    // Delete file from disk
    try {
      await fs.unlink(media.storage_url);
      logger.info('Media file deleted from disk', {
        mediaId,
        filePath: media.storage_url
      });
    } catch (error) {
      // Log but don't fail if file already deleted
      logger.warn('Failed to delete media file from disk', {
        mediaId,
        filePath: media.storage_url,
        error: error.message
      });
    }

    // Delete database record
    await client.query('DELETE FROM media WHERE id = $1', [mediaId]);

    // Decrement quota
    const fileSize = parseInt(media.size_bytes, 10);
    await quotaService.decrementQuota(media.group_id, fileSize, client);

    await client.query('COMMIT');

    logger.info('Media deleted successfully', {
      mediaId,
      groupId: media.group_id,
      deletedBy: req.user.userId,
      sizeBytes: fileSize
    });

    res.status(200).json({
      message: 'Media deleted successfully',
      media_id: mediaId,
      quota_freed_bytes: fileSize
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

module.exports = router;
