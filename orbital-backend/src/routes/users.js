const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authenticate } = require('../middleware/auth');
const { asyncHandler, validationError, forbiddenError, notFoundError } = require('../middleware/errorHandler');
const db = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * User Profile API Endpoints
 *
 * Handles user profile management:
 * - Avatar upload/removal
 * - Profile information retrieval
 */

// Configure multer for avatar uploads
const avatarStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const avatarDir = process.env.AVATAR_STORAGE_PATH || './uploads/avatars';
    try {
      await fs.mkdir(avatarDir, { recursive: true });
      cb(null, avatarDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Generate unique filename: userId-timestamp.ext
    const ext = path.extname(file.originalname);
    const filename = `${req.user.userId}-${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max avatar size
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'));
    }
  }
});

/**
 * POST /api/users/avatar
 * Upload a new avatar image
 *
 * Multipart form data:
 * - avatar: File (image file, max 5MB)
 *
 * Response:
 * - avatarUrl: string (relative path to avatar)
 */
router.post('/avatar', authenticate, avatarUpload.single('avatar'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw validationError('No avatar file uploaded');
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Get user's current avatar for cleanup
    const userResult = await client.query(
      'SELECT avatar_url FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rowCount === 0) {
      throw notFoundError('User not found');
    }

    const oldAvatarUrl = userResult.rows[0].avatar_url;

    // Generate avatar URL (relative path)
    const avatarUrl = `/avatars/${req.file.filename}`;

    // Update user's avatar_url
    await client.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2',
      [avatarUrl, req.user.userId]
    );

    await client.query('COMMIT');

    // Clean up old avatar file in background (if exists)
    if (oldAvatarUrl) {
      const oldAvatarPath = path.join(
        process.env.AVATAR_STORAGE_PATH || './uploads/avatars',
        path.basename(oldAvatarUrl)
      );
      fs.unlink(oldAvatarPath).catch((err) => {
        logger.warn('Failed to delete old avatar file', {
          userId: req.user.userId,
          oldAvatarUrl,
          error: err.message
        });
      });
    }

    logger.info('Avatar uploaded successfully', {
      userId: req.user.userId,
      avatarUrl,
      fileSize: req.file.size
    });

    res.status(200).json({
      avatarUrl,
      message: 'Avatar uploaded successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    // Clean up uploaded file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * DELETE /api/users/avatar
 * Remove the user's avatar
 *
 * Response:
 * - success: boolean
 * - message: string
 */
router.delete('/avatar', authenticate, asyncHandler(async (req, res) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Get user's current avatar
    const userResult = await client.query(
      'SELECT avatar_url FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rowCount === 0) {
      throw notFoundError('User not found');
    }

    const avatarUrl = userResult.rows[0].avatar_url;

    if (!avatarUrl) {
      // No avatar to delete
      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        message: 'No avatar to delete'
      });
    }

    // Remove avatar_url from database
    await client.query(
      'UPDATE users SET avatar_url = NULL WHERE id = $1',
      [req.user.userId]
    );

    await client.query('COMMIT');

    // Delete avatar file from disk in background
    const avatarPath = path.join(
      process.env.AVATAR_STORAGE_PATH || './uploads/avatars',
      path.basename(avatarUrl)
    );
    fs.unlink(avatarPath).catch((err) => {
      logger.warn('Failed to delete avatar file', {
        userId: req.user.userId,
        avatarUrl,
        error: err.message
      });
    });

    logger.info('Avatar removed successfully', {
      userId: req.user.userId,
      avatarUrl
    });

    res.status(200).json({
      success: true,
      message: 'Avatar removed successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/users/:userId/avatar
 * Get avatar URL for a user
 *
 * Response:
 * - avatarUrl: string | null
 */
router.get('/:userId/avatar', authenticate, asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const result = await db.query(
    'SELECT avatar_url FROM users WHERE id = $1',
    [userId]
  );

  if (result.rowCount === 0) {
    throw notFoundError('User not found');
  }

  res.status(200).json({
    avatarUrl: result.rows[0].avatar_url
  });
}));

/**
 * GET /api/users/me
 * Get current user's profile information
 *
 * Response:
 * - id: string (UUID)
 * - username: string
 * - avatarUrl: string | null
 * - displayName: string (falls back to username if not set)
 * - createdAt: string (ISO timestamp)
 */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const result = await db.query(
    'SELECT id, username, avatar_url, display_name, created_at FROM users WHERE id = $1',
    [req.user.userId]
  );

  if (result.rowCount === 0) {
    throw notFoundError('User not found');
  }

  const user = result.rows[0];

  res.status(200).json({
    id: user.id,
    username: user.username,
    avatarUrl: user.avatar_url,
    displayName: user.display_name || user.username,
    createdAt: user.created_at
  });
}));

/**
 * GET /api/users/:userId
 * Get another user's public profile information
 * (Only accessible to users in the same groups)
 *
 * Response:
 * - id: string (UUID)
 * - username: string
 * - avatarUrl: string | null
 * - displayName: string (falls back to username if not set)
 */
router.get('/:userId', authenticate, asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Verify requester shares at least one group with target user
  const sharedGroupCheck = await db.query(
    `SELECT COUNT(*) as count
     FROM members m1
     INNER JOIN members m2 ON m1.group_id = m2.group_id
     WHERE m1.user_id = $1 AND m2.user_id = $2`,
    [req.user.userId, userId]
  );

  const sharedGroups = parseInt(sharedGroupCheck.rows[0].count, 10);

  if (sharedGroups === 0) {
    throw forbiddenError('Cannot view profile of users not in your groups');
  }

  // Fetch user profile
  const result = await db.query(
    'SELECT id, username, avatar_url, display_name FROM users WHERE id = $1',
    [userId]
  );

  if (result.rowCount === 0) {
    throw notFoundError('User not found');
  }

  const user = result.rows[0];

  res.status(200).json({
    id: user.id,
    username: user.username,
    avatarUrl: user.avatar_url,
    displayName: user.display_name || user.username
  });
}));

/**
 * PUT /api/users/display-name
 * Update user's display name and broadcast to orbit members
 *
 * Request body:
 * - display_name: string (1-15 characters, alphanumeric + spaces + underscores)
 *
 * Response:
 * - displayName: string
 * - message: string
 */
router.put('/display-name', authenticate, asyncHandler(async (req, res) => {
  const { display_name } = req.body;

  // Validate display name
  if (!display_name || display_name.trim().length === 0) {
    throw validationError('Display name is required');
  }

  if (display_name.length > 15) {
    throw validationError('Display name must be 15 characters or less');
  }

  // Validate characters (alphanumeric, spaces, underscores only)
  const validPattern = /^[a-zA-Z0-9_ ]+$/;
  if (!validPattern.test(display_name)) {
    throw validationError('Display name can only contain letters, numbers, spaces, and underscores');
  }

  // Update in database
  await db.query(
    'UPDATE users SET display_name = $1 WHERE id = $2',
    [display_name.trim(), req.user.userId]
  );

  logger.info('Display name updated', {
    userId: req.user.userId,
    displayName: display_name.trim()
  });

  res.status(200).json({
    displayName: display_name.trim(),
    message: 'Display name updated successfully'
  });

  // Broadcast to all orbit members (fire and forget)
  broadcastDisplayNameChange(req.user.userId, display_name.trim());
}));

/**
 * Broadcast display name change to all orbits the user is in
 * Runs asynchronously after response is sent to client
 * @param {string} userId - User ID who changed their name
 * @param {string} displayName - New display name
 */
async function broadcastDisplayNameChange(userId, displayName) {
  try {
    const { getUserGroups, getGroupMemberIds } = require('../services/groupService');
    const { broadcastToConversation } = require('../websocket/signalWebSocket');

    // Get all groups (orbits) user is a member of
    const groups = await getUserGroups(userId);

    for (const group of groups) {
      const memberIds = await getGroupMemberIds(group.group_id);
      // Filter out the user who changed their name
      const recipients = memberIds.filter(id => id !== userId);

      if (recipients.length > 0) {
        broadcastToConversation(group.group_id, recipients, {
          type: 'display_name_changed',
          user_id: userId,
          display_name: displayName,
          timestamp: Date.now()
        });
      }
    }

    logger.info('Display name change broadcasted', {
      userId,
      groupCount: groups.length
    });
  } catch (error) {
    logger.error('Failed to broadcast display name change', {
      userId,
      error: error.message
    });
  }
}

module.exports = router;
