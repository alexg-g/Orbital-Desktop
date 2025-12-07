const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, validationError, forbiddenError, notFoundError } = require('../middleware/errorHandler');
const db = require('../config/database');
const logger = require('../utils/logger');
const groupService = require('../services/groupService');
const { isValidEmail } = require('../utils/emailNormalization');

const router = express.Router();

/**
 * Invite Code Management API Endpoints
 *
 * Handles invite code generation and status checking.
 * Features:
 * - Generate new invite codes
 * - Generate shareable invite links
 * - Check invite code status
 */

/**
 * POST /api/invites/generate
 * Generate a new invite code for a group
 * Only group creator can generate codes
 *
 * Request body:
 * - groupId: string (UUID)
 * - targetEmail: string (email address the invite is for)
 *
 * Response:
 * - code: string (8-char alphanumeric)
 * - expiresAt: number (Unix timestamp in milliseconds)
 * - createdAt: number (Unix timestamp in milliseconds)
 * - targetEmail: string (email address)
 */
router.post('/generate', authenticate, asyncHandler(async (req, res) => {
  const { groupId, targetEmail } = req.body;

  if (!groupId) {
    throw validationError('Missing required field: groupId');
  }

  if (!targetEmail) {
    throw validationError('Missing required field: targetEmail');
  }

  if (!isValidEmail(targetEmail)) {
    throw validationError('Invalid email format');
  }

  try {
    const result = await groupService.regenerateInviteCode(groupId, req.user.userId, targetEmail);

    logger.info('Invite code generated via API', {
      groupId,
      userId: req.user.userId,
      code: result.invite_code,
      targetEmail: result.target_email
    });

    // Convert ISO timestamps to Unix timestamps (milliseconds)
    const expiresAt = new Date(result.expires_at).getTime();
    const createdAt = new Date(result.created_at).getTime();

    res.status(201).json({
      code: result.invite_code,
      expiresAt,
      createdAt,
      targetEmail: result.target_email
    });
  } catch (error) {
    if (error.message === 'GROUP_NOT_FOUND') {
      throw notFoundError('Group not found');
    }
    if (error.message === 'FORBIDDEN_NOT_CREATOR') {
      throw forbiddenError('Only group creator can generate invite codes');
    }
    if (error.message === 'INVALID_EMAIL_FORMAT') {
      throw validationError('Invalid email format');
    }
    throw error;
  }
}));

/**
 * POST /api/invites/generate-link
 * Generate a shareable invite link
 * Only group creator can generate links
 *
 * Request body:
 * - groupId: string (UUID)
 * - targetEmail: string (email address the invite is for)
 * - linkType: 'orbital' | 'web' (optional, defaults to 'orbital')
 *
 * Response:
 * - link: string (shareable URL)
 * - code: string (8-char alphanumeric)
 * - expiresAt: number (Unix timestamp in milliseconds)
 * - createdAt: number (Unix timestamp in milliseconds)
 * - targetEmail: string (email address)
 */
router.post('/generate-link', authenticate, asyncHandler(async (req, res) => {
  const { groupId, targetEmail, linkType = 'orbital' } = req.body;

  if (!groupId) {
    throw validationError('Missing required field: groupId');
  }

  if (!targetEmail) {
    throw validationError('Missing required field: targetEmail');
  }

  if (!isValidEmail(targetEmail)) {
    throw validationError('Invalid email format');
  }

  if (!['orbital', 'web'].includes(linkType)) {
    throw validationError('linkType must be either "orbital" or "web"');
  }

  try {
    // Generate invite code with target email
    const result = await groupService.regenerateInviteCode(groupId, req.user.userId, targetEmail);

    // Generate link based on type
    let link;
    if (linkType === 'orbital') {
      // Deep link for Orbital app
      link = `orbital://invite/${result.invite_code}`;
    } else {
      // Web link (could redirect to app download or web interface)
      const webDomain = process.env.WEB_DOMAIN || 'https://orbitl.org';
      link = `${webDomain}/invite/${result.invite_code}`;
    }

    logger.info('Invite link generated via API', {
      groupId,
      userId: req.user.userId,
      code: result.invite_code,
      targetEmail: result.target_email,
      linkType,
      link
    });

    // Convert ISO timestamps to Unix timestamps (milliseconds)
    const expiresAt = new Date(result.expires_at).getTime();
    const createdAt = new Date(result.created_at).getTime();

    res.status(201).json({
      link,
      code: result.invite_code,
      expiresAt,
      createdAt,
      targetEmail: result.target_email
    });
  } catch (error) {
    if (error.message === 'GROUP_NOT_FOUND') {
      throw notFoundError('Group not found');
    }
    if (error.message === 'FORBIDDEN_NOT_CREATOR') {
      throw forbiddenError('Only group creator can generate invite links');
    }
    if (error.message === 'INVALID_EMAIL_FORMAT') {
      throw validationError('Invalid email format');
    }
    throw error;
  }
}));

/**
 * GET /api/invites/status/:code
 * Check the status of an invite code
 * Anyone can check invite code status
 *
 * Response:
 * - status: 'pending' | 'accepted' | 'expired'
 * - createdAt: number (Unix timestamp in milliseconds)
 * - expiresAt: number (Unix timestamp in milliseconds)
 * - usedAt: number | null (Unix timestamp in milliseconds if used)
 * - usedBy: string | null (user ID if used)
 */
router.get('/status/:code', authenticate, asyncHandler(async (req, res) => {
  const { code } = req.params;

  if (!code || code.length !== 8) {
    throw validationError('Invalid invite code format');
  }

  // Fetch invite code details
  const result = await db.query(
    `SELECT ic.id, ic.code, ic.created_at, ic.expires_at, ic.used_by, ic.used_at, ic.group_id
     FROM invite_codes ic
     WHERE ic.code = $1`,
    [code.toUpperCase()]
  );

  if (result.rowCount === 0) {
    throw notFoundError('Invite code not found');
  }

  const invite = result.rows[0];

  // Determine status
  let status;
  if (invite.used_by) {
    status = 'accepted';
  } else if (new Date(invite.expires_at) < new Date()) {
    status = 'expired';
  } else {
    status = 'pending';
  }

  // Convert timestamps to Unix milliseconds
  const createdAt = new Date(invite.created_at).getTime();
  const expiresAt = new Date(invite.expires_at).getTime();
  const usedAt = invite.used_at ? new Date(invite.used_at).getTime() : null;

  logger.info('Invite code status checked', {
    code,
    status,
    userId: req.user.userId
  });

  res.status(200).json({
    status,
    createdAt,
    expiresAt,
    usedAt,
    usedBy: invite.used_by
  });
}));

/**
 * GET /api/invites/group/:groupId
 * Get invite history for a group (including used and expired)
 * Only group creator can view all codes
 *
 * Response:
 * - inviteCodes: Array of {
 *     id: string,
 *     code: string,
 *     createdAt: number,
 *     expiresAt: number,
 *     status: 'pending' | 'accepted' | 'expired',
 *     targetEmail: string
 *   }
 */
router.get('/group/:groupId', authenticate, asyncHandler(async (req, res) => {
  const { groupId } = req.params;

  try {
    // Use getInviteHistory to get all invites with status
    const codes = await groupService.getInviteHistory(groupId, req.user.userId);

    // Convert to expected format with Unix timestamps
    const inviteCodes = codes.map(code => ({
      id: code.id,
      code: code.code,
      createdAt: new Date(code.created_at).getTime(),
      expiresAt: new Date(code.expires_at).getTime(),
      status: code.status, // 'pending', 'accepted', or 'expired'
      targetEmail: code.target_email
    }));

    res.status(200).json({
      inviteCodes
    });
  } catch (error) {
    if (error.message === 'GROUP_NOT_FOUND') {
      throw notFoundError('Group not found');
    }
    if (error.message === 'FORBIDDEN_NOT_CREATOR') {
      throw forbiddenError('Only group creator can view invite codes');
    }
    throw error;
  }
}));

module.exports = router;
