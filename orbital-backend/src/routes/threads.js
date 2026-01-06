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
 * Helper: Parse media metadata for WebSocket broadcast
 * Extracts display fields from encrypted_metadata JSON
 */
function formatMediaForBroadcast(mediaRows) {
  return mediaRows.map(row => {
    let metadata = {};
    try {
      metadata = JSON.parse(row.encrypted_metadata);
    } catch (error) {
      logger.warn('Failed to parse encrypted_metadata', {
        mediaId: row.id,
        error: error.message
      });
    }

    return {
      media_id: row.id,
      encrypted_metadata: row.encrypted_metadata,
      size_bytes: parseInt(row.size_bytes, 10),
      uploaded_at: row.uploaded_at,
      expires_at: row.expires_at,
      // Display fields from metadata
      content_type: metadata.contentType,
      file_name: metadata.fileName,
      blur_hash: metadata.blurHash,
      width: metadata.width,
      height: metadata.height,
      duration: metadata.duration
    };
  });
}

/**
 * POST /api/threads
 * Create new discussion thread
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { thread_id, group_id, encrypted_title, encrypted_body, title_iv, body_iv, root_message_id, media_ids } = req.body;

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
        ? `INSERT INTO threads (id, group_id, root_message_id, author_id, encrypted_title, encrypted_body, title_iv, body_iv)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             encrypted_title = EXCLUDED.encrypted_title,
             encrypted_body = EXCLUDED.encrypted_body,
             title_iv = EXCLUDED.title_iv,
             body_iv = EXCLUDED.body_iv
           RETURNING id, created_at`
        : `INSERT INTO threads (group_id, root_message_id, author_id, encrypted_title, encrypted_body, title_iv, body_iv)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, created_at`,
      thread_id
        ? [thread_id, group_id, root_message_id || null, req.user.userId, encrypted_title, encrypted_body, title_iv || null, body_iv || null]
        : [group_id, root_message_id || null, req.user.userId, encrypted_title, encrypted_body, title_iv || null, body_iv || null]
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

      // Fetch media metadata to return in response (with full metadata for WebSocket)
      const mediaResult = await client.query(
        `SELECT id, encrypted_metadata, size_bytes, uploaded_at, expires_at
         FROM media
         WHERE id = ANY($1::uuid[])
         ORDER BY uploaded_at ASC`,
        [validatedMediaIds]
      );

      // Format media with extracted display fields for WebSocket broadcast
      associatedMedia = formatMediaForBroadcast(mediaResult.rows);
    }

    // Get author username for WebSocket broadcast
    const authorResult = await client.query(
      'SELECT username FROM users WHERE id = $1',
      [req.user.userId]
    );
    const authorUsername = authorResult.rows[0]?.username || null;

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
          author_name: authorUsername,
          encrypted_title: encrypted_title,
          encrypted_body: encrypted_body,
          title_iv: title_iv || null,
          body_iv: body_iv || null,
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

  // Fetch threads with reply counts and media counts
  const result = await db.query(
    `SELECT
       t.id, t.group_id, t.author_id, t.encrypted_title, t.encrypted_body,
       t.title_iv, t.body_iv, t.created_at,
       u.username as author_username,
       u.display_name as author_display_name,
       COUNT(DISTINCT r.id) as reply_count,
       COUNT(DISTINCT m.id) as media_count
     FROM threads t
     LEFT JOIN users u ON u.id = t.author_id
     LEFT JOIN replies r ON r.thread_id = t.id
     LEFT JOIN media m ON m.thread_id = t.id AND m.expires_at > NOW()
     WHERE t.group_id = $1
     GROUP BY t.id, u.username, u.display_name
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
    author_display_name: row.author_display_name || row.author_username,
    encrypted_title: row.encrypted_title,
    encrypted_body: row.encrypted_body,
    title_iv: row.title_iv,
    body_iv: row.body_iv,
    reply_count: parseInt(row.reply_count, 10),
    media_count: parseInt(row.media_count, 10),
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
            t.title_iv, t.body_iv, t.created_at, u.username as author_username,
            u.display_name as author_display_name
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

  // Get media for this thread
  const mediaResult = await db.query(
    `SELECT id, encrypted_metadata, size_bytes, uploaded_at, expires_at
     FROM media
     WHERE thread_id = $1 AND expires_at > NOW()
     ORDER BY uploaded_at ASC`,
    [threadId]
  );

  const media = formatMediaForBroadcast(mediaResult.rows);

  res.status(200).json({
    thread_id: thread.id,
    group_id: thread.group_id,
    author_id: thread.author_id,
    author_username: thread.author_username,
    author_display_name: thread.author_display_name || thread.author_username,
    encrypted_title: thread.encrypted_title,
    encrypted_body: thread.encrypted_body,
    title_iv: thread.title_iv,
    body_iv: thread.body_iv,
    reply_count: parseInt(countResult.rows[0].count, 10),
    created_at: thread.created_at,
    media: media
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

  // Fetch replies with parent_reply_id and calculated level using recursive CTE
  // Level 0 = replies to thread (no parent), Level 1+ = replies to specific comments
  // Uses tree_path array for Reddit-style depth-first ordering (children under parent)
  const result = await db.query(
    `WITH RECURSIVE reply_tree AS (
       -- Base case: replies without parent (top-level, level 0)
       -- tree_path starts with just this reply's timestamp for sorting siblings
       SELECT r.id, r.thread_id, r.author_id, r.encrypted_body, r.body_iv,
              r.created_at, r.parent_reply_id, 0 as level,
              ARRAY[r.created_at] as tree_path
       FROM replies r
       WHERE r.thread_id = $1 AND r.parent_reply_id IS NULL

       UNION ALL

       -- Recursive case: replies with parent (nested, level = parent + 1)
       -- tree_path extends parent's path with this reply's timestamp
       SELECT r.id, r.thread_id, r.author_id, r.encrypted_body, r.body_iv,
              r.created_at, r.parent_reply_id, rt.level + 1 as level,
              rt.tree_path || r.created_at as tree_path
       FROM replies r
       INNER JOIN reply_tree rt ON r.parent_reply_id = rt.id
       WHERE r.thread_id = $1
     )
     SELECT rt.id, rt.thread_id, rt.author_id, rt.encrypted_body, rt.body_iv,
            rt.created_at, rt.parent_reply_id, rt.level,
            u.username as author_username,
            u.display_name as author_display_name
     FROM reply_tree rt
     LEFT JOIN users u ON u.id = rt.author_id
     ORDER BY rt.tree_path ASC
     LIMIT $2 OFFSET $3`,
    [threadId, pageLimit, pageOffset]
  );

  // Get total count
  const countResult = await db.query(
    'SELECT COUNT(*) as total FROM replies WHERE thread_id = $1',
    [threadId]
  );

  // Fetch media associated with this thread (including reply_id for per-reply association)
  const mediaResult = await db.query(
    `SELECT id, reply_id, encrypted_metadata, size_bytes, uploaded_at, expires_at
     FROM media
     WHERE thread_id = $1
     ORDER BY uploaded_at ASC`,
    [threadId]
  );

  // Group media by reply_id (null = original post, UUID = specific reply)
  const mediaByReplyId = new Map();
  const threadLevelMedia = []; // Media with reply_id = NULL (original post)

  for (const row of mediaResult.rows) {
    const formattedMedia = formatMediaForBroadcast([row])[0];
    if (row.reply_id) {
      if (!mediaByReplyId.has(row.reply_id)) {
        mediaByReplyId.set(row.reply_id, []);
      }
      mediaByReplyId.get(row.reply_id).push(formattedMedia);
    } else {
      threadLevelMedia.push(formattedMedia);
    }
  }

  const replies = result.rows.map(row => ({
    reply_id: row.id,
    thread_id: row.thread_id,
    author_id: row.author_id,
    author_username: row.author_username,
    author_display_name: row.author_display_name || row.author_username,
    encrypted_body: row.encrypted_body,
    body_iv: row.body_iv,
    created_at: row.created_at,
    parent_reply_id: row.parent_reply_id || null,
    level: row.level,
    media: mediaByReplyId.get(row.id) || [] // Attach media to each reply
  }));

  const totalCount = parseInt(countResult.rows[0].total, 10);
  const hasMore = pageOffset + pageLimit < totalCount;

  res.status(200).json({
    replies,
    media: threadLevelMedia, // Thread-level media (original post)
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
  const { encrypted_body, body_iv, message_id, media_ids, parent_reply_id } = req.body;

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

    // Validate parent_reply_id if provided (must belong to same thread)
    if (parent_reply_id) {
      const parentCheck = await client.query(
        'SELECT id FROM replies WHERE id = $1 AND thread_id = $2',
        [parent_reply_id, threadId]
      );
      if (parentCheck.rowCount === 0) {
        throw validationError('Invalid parent_reply_id: reply not found or belongs to different thread');
      }
    }

    // Create reply
    const result = await client.query(
      `INSERT INTO replies (thread_id, message_id, author_id, encrypted_body, body_iv, parent_reply_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [threadId, message_id || null, req.user.userId, encrypted_body, body_iv || null, parent_reply_id || null]
    );

    const reply = result.rows[0];

    // Associate media with both the parent thread AND this specific reply
    let associatedMedia = [];
    if (validatedMediaIds.length > 0) {
      await client.query(
        `UPDATE media
         SET thread_id = $1, reply_id = $2
         WHERE id = ANY($3::uuid[])`,
        [threadId, reply.id, validatedMediaIds]
      );

      // Fetch media metadata to return in response (with full metadata for WebSocket)
      const mediaResult = await client.query(
        `SELECT id, encrypted_metadata, size_bytes, uploaded_at, expires_at
         FROM media
         WHERE id = ANY($1::uuid[])
         ORDER BY uploaded_at ASC`,
        [validatedMediaIds]
      );

      // Format media with extracted display fields for WebSocket broadcast
      associatedMedia = formatMediaForBroadcast(mediaResult.rows);
    }

    // Get author username for WebSocket broadcast
    const authorResult = await client.query(
      'SELECT username FROM users WHERE id = $1',
      [req.user.userId]
    );
    const authorUsername = authorResult.rows[0]?.username || null;

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
          author_name: authorUsername,
          encrypted_body: encrypted_body,
          body_iv: body_iv || null,
          parent_reply_id: parent_reply_id || null,
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
