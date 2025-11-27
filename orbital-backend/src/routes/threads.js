const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, validationError, forbiddenError, notFoundError } = require('../middleware/errorHandler');
const db = require('../config/database');
const logger = require('../utils/logger');
const { broadcastToConversation } = require('../websocket/signalWebSocket');
const { getGroupMemberIds } = require('../services/groupService');

const router = express.Router();

/**
 * Threading API Endpoints
 *
 * Manages discussion threads and replies within groups.
 * All content is encrypted client-side with group Sender Key (Signal Protocol).
 */

/**
 * POST /api/threads
 * Create new discussion thread
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { thread_id, group_id, encrypted_title, encrypted_body, root_message_id, media_ids } = req.body;

  // Validate required fields
  // Note: encrypted_body can be empty string (threads with title only)
  if (!group_id || !encrypted_title || encrypted_body === undefined || encrypted_body === null) {
    throw validationError('Missing required fields: group_id, encrypted_title, encrypted_body');
  }

  // Validate media_ids if provided
  if (media_ids !== undefined && !Array.isArray(media_ids)) {
    throw validationError('media_ids must be an array');
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

    // Validate media_ids if provided
    let validatedMediaIds = [];
    if (media_ids && media_ids.length > 0) {
      // Verify all media IDs exist and belong to the correct group
      const mediaCheck = await client.query(
        `SELECT id, group_id, thread_id
         FROM media
         WHERE id = ANY($1::uuid[])`,
        [media_ids]
      );

      if (mediaCheck.rowCount !== media_ids.length) {
        const foundIds = mediaCheck.rows.map(r => r.id);
        const missingIds = media_ids.filter(id => !foundIds.includes(id));
        throw notFoundError(`Media not found: ${missingIds.join(', ')}`);
      }

      // Verify all media belongs to the same group
      const wrongGroupMedia = mediaCheck.rows.filter(m => m.group_id !== group_id);
      if (wrongGroupMedia.length > 0) {
        throw forbiddenError(`Media ${wrongGroupMedia.map(m => m.id).join(', ')} belongs to a different group`);
      }

      // Verify media isn't already associated with another thread
      const alreadyAssociated = mediaCheck.rows.filter(m => m.thread_id !== null);
      if (alreadyAssociated.length > 0) {
        const error = new Error(`Media already associated with another thread: ${alreadyAssociated.map(m => m.id).join(', ')}`);
        error.statusCode = 409;
        throw error;
      }

      validatedMediaIds = mediaCheck.rows.map(m => m.id);
    }

    // Create thread (optionally linked to Signal message)
    // Use client-specified thread_id if provided, otherwise let database generate one
    // This supports local-first architecture where client generates IDs
    const result = await client.query(
      thread_id
        ? `INSERT INTO threads (id, group_id, root_message_id, author_id, encrypted_title, encrypted_body)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             encrypted_title = EXCLUDED.encrypted_title,
             encrypted_body = EXCLUDED.encrypted_body
           RETURNING id, created_at`
        : `INSERT INTO threads (group_id, root_message_id, author_id, encrypted_title, encrypted_body)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, created_at`,
      thread_id
        ? [thread_id, group_id, root_message_id || null, req.user.userId, encrypted_title, encrypted_body]
        : [group_id, root_message_id || null, req.user.userId, encrypted_title, encrypted_body]
    );

    const thread = result.rows[0];

    // Associate media with thread if provided
    let associatedMedia = [];
    if (validatedMediaIds.length > 0) {
      await client.query(
        `UPDATE media
         SET thread_id = $1
         WHERE id = ANY($2::uuid[])`,
        [thread.id, validatedMediaIds]
      );

      // Fetch media metadata to return in response
      const mediaResult = await client.query(
        `SELECT id, encrypted_metadata, size_bytes, uploaded_at, expires_at
         FROM media
         WHERE id = ANY($1::uuid[])
         ORDER BY uploaded_at ASC`,
        [validatedMediaIds]
      );

      associatedMedia = mediaResult.rows.map(row => ({
        media_id: row.id,
        encrypted_metadata: row.encrypted_metadata,
        size_bytes: parseInt(row.size_bytes, 10),
        uploaded_at: row.uploaded_at,
        expires_at: row.expires_at
      }));
    }

    await client.query('COMMIT');

    logger.info('Thread created', {
      threadId: thread.id,
      groupId: group_id,
      authorId: req.user.userId,
      mediaCount: associatedMedia.length
    });

    res.status(201).json({
      thread_id: thread.id,
      group_id: group_id,
      created_at: thread.created_at,
      media: associatedMedia
    });

    // Broadcast to WebSocket clients in group (fire and forget)
    getGroupMemberIds(group_id).then(memberIds => {
      // Filter out the author
      const recipients = memberIds.filter(id => id !== req.user.userId);

      if (recipients.length > 0) {
        broadcastToConversation(group_id, recipients, {
          type: 'new_thread',
          thread_id: thread.id,
          group_id: group_id,
          author_id: req.user.userId,
          encrypted_title: encrypted_title,
          encrypted_body: encrypted_body,
          created_at: thread.created_at,
          media: associatedMedia
        });
      }
    }).catch(err => {
      logger.error('Failed to broadcast new thread to WebSocket clients', {
        groupId: group_id,
        threadId: thread.id,
        error: err.message
      });
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/groups/:groupId/threads
 * List threads in group (paginated)
 */
router.get('/groups/:groupId/threads', authenticate, asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { limit = 50, offset = 0, sort = 'created_desc' } = req.query;

  // Verify user is member of group
  const memberCheck = await db.query(
    'SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2',
    [groupId, req.user.userId]
  );

  if (memberCheck.rowCount === 0) {
    throw forbiddenError('Not a member of this group');
  }

  // Parse pagination
  const pageLimit = Math.min(parseInt(limit, 10) || 50, 100);
  const pageOffset = parseInt(offset, 10) || 0;

  // Determine sort order
  const sortOrder = sort === 'created_asc' ? 'ASC' : 'DESC';

  // Fetch threads with reply counts
  const result = await db.query(
    `SELECT
       t.id, t.group_id, t.author_id, t.encrypted_title, t.encrypted_body,
       t.created_at,
       u.username as author_username,
       COUNT(r.id) as reply_count
     FROM threads t
     LEFT JOIN users u ON u.id = t.author_id
     LEFT JOIN replies r ON r.thread_id = t.id
     WHERE t.group_id = $1
     GROUP BY t.id, u.username
     ORDER BY t.created_at ${sortOrder}
     LIMIT $2 OFFSET $3`,
    [groupId, pageLimit, pageOffset]
  );

  // Get total count
  const countResult = await db.query(
    'SELECT COUNT(*) as total FROM threads WHERE group_id = $1',
    [groupId]
  );

  const threads = result.rows.map(row => ({
    thread_id: row.id,
    group_id: row.group_id,
    author_id: row.author_id,
    author_username: row.author_username,
    encrypted_title: row.encrypted_title,
    encrypted_body: row.encrypted_body,
    reply_count: parseInt(row.reply_count, 10),
    created_at: row.created_at
  }));

  const totalCount = parseInt(countResult.rows[0].total, 10);
  const hasMore = pageOffset + pageLimit < totalCount;

  res.status(200).json({
    threads,
    total_count: totalCount,
    has_more: hasMore
  });
}));

/**
 * GET /api/threads/:threadId
 * Get single thread with details
 */
router.get('/:threadId', authenticate, asyncHandler(async (req, res) => {
  const { threadId } = req.params;

  // Fetch thread
  const result = await db.query(
    `SELECT t.id, t.group_id, t.author_id, t.encrypted_title, t.encrypted_body,
            t.created_at, u.username as author_username
     FROM threads t
     LEFT JOIN users u ON u.id = t.author_id
     WHERE t.id = $1`,
    [threadId]
  );

  if (result.rowCount === 0) {
    throw notFoundError('Thread not found');
  }

  const thread = result.rows[0];

  // Verify user is member of group
  const memberCheck = await db.query(
    'SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2',
    [thread.group_id, req.user.userId]
  );

  if (memberCheck.rowCount === 0) {
    throw forbiddenError('Not a member of this group');
  }

  // Get reply count
  const countResult = await db.query(
    'SELECT COUNT(*) as count FROM replies WHERE thread_id = $1',
    [threadId]
  );

  res.status(200).json({
    thread_id: thread.id,
    group_id: thread.group_id,
    author_id: thread.author_id,
    author_username: thread.author_username,
    encrypted_title: thread.encrypted_title,
    encrypted_body: thread.encrypted_body,
    reply_count: parseInt(countResult.rows[0].count, 10),
    created_at: thread.created_at
  });
}));

/**
 * GET /api/threads/:threadId/replies
 * Get replies to thread
 */
router.get('/:threadId/replies', authenticate, asyncHandler(async (req, res) => {
  const { threadId } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  // Verify thread exists and user has access
  const threadCheck = await db.query(
    `SELECT t.group_id FROM threads t WHERE t.id = $1`,
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

  // Parse pagination
  const pageLimit = Math.min(parseInt(limit, 10) || 50, 100);
  const pageOffset = parseInt(offset, 10) || 0;

  // Fetch replies
  const result = await db.query(
    `SELECT r.id, r.thread_id, r.author_id, r.encrypted_body, r.created_at,
            u.username as author_username
     FROM replies r
     LEFT JOIN users u ON u.id = r.author_id
     WHERE r.thread_id = $1
     ORDER BY r.created_at ASC
     LIMIT $2 OFFSET $3`,
    [threadId, pageLimit, pageOffset]
  );

  // Get total count
  const countResult = await db.query(
    'SELECT COUNT(*) as total FROM replies WHERE thread_id = $1',
    [threadId]
  );

  const replies = result.rows.map(row => ({
    reply_id: row.id,
    thread_id: row.thread_id,
    author_id: row.author_id,
    author_username: row.author_username,
    encrypted_body: row.encrypted_body,
    created_at: row.created_at
  }));

  const totalCount = parseInt(countResult.rows[0].total, 10);
  const hasMore = pageOffset + pageLimit < totalCount;

  res.status(200).json({
    replies,
    total_count: totalCount,
    has_more: hasMore
  });
}));

/**
 * POST /api/threads/:threadId/replies
 * Post reply to thread
 */
router.post('/:threadId/replies', authenticate, asyncHandler(async (req, res) => {
  const { threadId } = req.params;
  const { encrypted_body, message_id, media_ids } = req.body;

  if (!encrypted_body) {
    throw validationError('Missing required field: encrypted_body');
  }

  // Validate media_ids if provided
  if (media_ids !== undefined && !Array.isArray(media_ids)) {
    throw validationError('media_ids must be an array');
  }

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

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Validate media_ids if provided
    let validatedMediaIds = [];
    if (media_ids && media_ids.length > 0) {
      // Verify all media IDs exist and belong to the correct group
      const mediaCheck = await client.query(
        `SELECT id, group_id, thread_id
         FROM media
         WHERE id = ANY($1::uuid[])`,
        [media_ids]
      );

      if (mediaCheck.rowCount !== media_ids.length) {
        const foundIds = mediaCheck.rows.map(r => r.id);
        const missingIds = media_ids.filter(id => !foundIds.includes(id));
        throw notFoundError(`Media not found: ${missingIds.join(', ')}`);
      }

      // Verify all media belongs to the same group
      const wrongGroupMedia = mediaCheck.rows.filter(m => m.group_id !== groupId);
      if (wrongGroupMedia.length > 0) {
        throw forbiddenError(`Media ${wrongGroupMedia.map(m => m.id).join(', ')} belongs to a different group`);
      }

      // Verify media isn't already associated with another thread
      const alreadyAssociated = mediaCheck.rows.filter(m => m.thread_id !== null);
      if (alreadyAssociated.length > 0) {
        const error = new Error(`Media already associated with another thread: ${alreadyAssociated.map(m => m.id).join(', ')}`);
        error.statusCode = 409;
        throw error;
      }

      validatedMediaIds = mediaCheck.rows.map(m => m.id);
    }

    // Create reply
    const result = await client.query(
      `INSERT INTO replies (thread_id, message_id, author_id, encrypted_body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [threadId, message_id || null, req.user.userId, encrypted_body]
    );

    const reply = result.rows[0];

    // Associate media with the parent thread (replies don't have their own media, they attach to thread)
    let associatedMedia = [];
    if (validatedMediaIds.length > 0) {
      await client.query(
        `UPDATE media
         SET thread_id = $1
         WHERE id = ANY($2::uuid[])`,
        [threadId, validatedMediaIds]
      );

      // Fetch media metadata to return in response
      const mediaResult = await client.query(
        `SELECT id, encrypted_metadata, size_bytes, uploaded_at, expires_at
         FROM media
         WHERE id = ANY($1::uuid[])
         ORDER BY uploaded_at ASC`,
        [validatedMediaIds]
      );

      associatedMedia = mediaResult.rows.map(row => ({
        media_id: row.id,
        encrypted_metadata: row.encrypted_metadata,
        size_bytes: parseInt(row.size_bytes, 10),
        uploaded_at: row.uploaded_at,
        expires_at: row.expires_at
      }));
    }

    await client.query('COMMIT');

    logger.info('Reply created', {
      replyId: reply.id,
      threadId,
      authorId: req.user.userId,
      mediaCount: associatedMedia.length
    });

    res.status(201).json({
      reply_id: reply.id,
      thread_id: threadId,
      created_at: reply.created_at,
      media: associatedMedia
    });

    // Broadcast to WebSocket clients in group (fire and forget)
    getGroupMemberIds(groupId).then(memberIds => {
      // Filter out the author
      const recipients = memberIds.filter(id => id !== req.user.userId);

      if (recipients.length > 0) {
        broadcastToConversation(groupId, recipients, {
          type: 'new_reply',
          reply_id: reply.id,
          thread_id: threadId,
          group_id: groupId,
          author_id: req.user.userId,
          encrypted_body: encrypted_body,
          created_at: reply.created_at,
          media: associatedMedia
        });
      }
    }).catch(err => {
      logger.error('Failed to broadcast new reply to WebSocket clients', {
        groupId: groupId,
        threadId: threadId,
        replyId: reply.id,
        error: err.message
      });
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

module.exports = router;
