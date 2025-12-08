const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, validationError, forbiddenError, notFoundError, conflictError } = require('../middleware/errorHandler');
const db = require('../config/database');
const logger = require('../utils/logger');
const quotaService = require('../services/quotaService');
const groupService = require('../services/groupService');

const router = express.Router();

/**
 * Group Management API Endpoints
 *
 * Handles group creation, joining via invite codes, and member management.
 * Features:
 * - Single-use invite codes with 7-day expiration
 * - Max 10 members per group
 * - Regeneratable invite codes (creator only)
 */

/**
 * POST /api/groups
 * Create new group with invite code
 *
 * Request body:
 * - encrypted_name: string (client-side encrypted)
 * - encrypted_group_key: string (encrypted key for creator)
 *
 * Response:
 * - group_id: string (UUID)
 * - invite_code: string (8-char alphanumeric)
 * - expires_at: string (ISO timestamp)
 * - created_at: string (ISO timestamp)
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { encrypted_name, encrypted_group_key } = req.body;

  if (!encrypted_name || !encrypted_group_key) {
    throw validationError('Missing required fields: encrypted_name, encrypted_group_key');
  }

  const result = await groupService.createGroup(
    req.user.userId,
    encrypted_name,
    encrypted_group_key
  );

  res.status(201).json(result);
}));

/**
 * POST /api/groups/:groupId/invite-codes
 * Generate new invite code for existing group
 * Only group creator can generate new codes
 *
 * Response:
 * - invite_code: string (8-char alphanumeric)
 * - expires_at: string (ISO timestamp)
 * - created_at: string (ISO timestamp)
 */
router.post('/:groupId/invite-codes', authenticate, asyncHandler(async (req, res) => {
  const { groupId } = req.params;

  try {
    const result = await groupService.regenerateInviteCode(groupId, req.user.userId);
    res.status(201).json(result);
  } catch (error) {
    if (error.message === 'GROUP_NOT_FOUND') {
      throw notFoundError('Group not found');
    }
    if (error.message === 'FORBIDDEN_NOT_CREATOR') {
      throw forbiddenError('Only group creator can generate new invite codes');
    }
    throw error;
  }
}));

/**
 * GET /api/groups/:groupId/invite-codes
 * Get active (unused, unexpired) invite codes for a group
 * Only group creator can view codes
 *
 * Response:
 * - invite_codes: Array of { id, code, created_at, expires_at }
 */
router.get('/:groupId/invite-codes', authenticate, asyncHandler(async (req, res) => {
  const { groupId } = req.params;

  try {
    const codes = await groupService.getActiveInviteCodes(groupId, req.user.userId);
    res.status(200).json({ invite_codes: codes });
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

/**
 * POST /api/groups/join
 * Join existing group via invite code
 *
 * Request body:
 * - invite_code: string (8-char alphanumeric)
 * - encrypted_group_key: string (encrypted key for this user)
 *
 * Response:
 * - group_id: string (UUID)
 * - encrypted_name: string (client-side encrypted)
 * - member_count: number
 * - joined_at: string (ISO timestamp)
 */
router.post('/join', authenticate, asyncHandler(async (req, res) => {
  const { invite_code, encrypted_group_key } = req.body;

  if (!invite_code || !encrypted_group_key) {
    throw validationError('Missing required fields: invite_code, encrypted_group_key');
  }

  try {
    const result = await groupService.joinGroup(
      req.user.userId,
      invite_code,
      encrypted_group_key
    );
    res.status(200).json(result);
  } catch (error) {
    switch (error.message) {
      case 'INVALID_INVITE_CODE':
        throw notFoundError('Invalid invite code');
      case 'INVITE_CODE_ALREADY_USED':
        throw validationError('This invite code has already been used');
      case 'INVITE_CODE_EXPIRED':
        throw validationError('This invite code has expired');
      case 'ALREADY_MEMBER':
        throw conflictError('Already a member of this group');
      case 'GROUP_FULL':
        throw validationError(`Group has reached maximum capacity of ${groupService.MAX_MEMBERS} members`);
      default:
        throw error;
    }
  }
}));

/**
 * GET /api/groups
 * List user's groups
 *
 * Response:
 * - groups: Array of group objects with member counts
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const groups = await groupService.getUserGroups(req.user.userId);
  res.status(200).json({ groups });
}));

/**
 * GET /api/groups/:groupId/members
 * List group members
 *
 * Response:
 * - members: Array of member objects
 */
router.get('/:groupId/members', authenticate, asyncHandler(async (req, res) => {
  const { groupId } = req.params;

  try {
    const members = await groupService.getGroupMembers(groupId, req.user.userId);
    res.status(200).json({ members });
  } catch (error) {
    if (error.message === 'FORBIDDEN_NOT_MEMBER') {
      throw forbiddenError('Not a member of this group');
    }
    throw error;
  }
}));

/**
 * GET /api/groups/:groupId/key
 * Get the group encryption key for the current user
 * Used to sync/repair local key storage
 *
 * Response:
 * - group_key: string (the encryption key from user's member record)
 */
router.get('/:groupId/key', authenticate, asyncHandler(async (req, res) => {
  const { groupId } = req.params;

  // Fetch user's group key from members table
  const result = await db.query(
    `SELECT m.encrypted_group_key
     FROM members m
     WHERE m.group_id = $1 AND m.user_id = $2`,
    [groupId, req.user.userId]
  );

  if (result.rowCount === 0) {
    throw forbiddenError('Not a member of this group');
  }

  const groupKey = result.rows[0].encrypted_group_key;

  logger.info('Group key fetched for sync', {
    groupId,
    userId: req.user.userId,
    hasKey: !!groupKey
  });

  res.status(200).json({
    group_key: groupKey
  });
}));

/**
 * GET /api/groups/:groupId/quota
 * Get group storage quota status
 *
 * Response:
 * - group_id: string
 * - storage: { used, limit, percentage, warning }
 * - files: { count, limit, percentage, warning }
 */
router.get('/:groupId/quota', authenticate, asyncHandler(async (req, res) => {
  const { groupId } = req.params;

  // Verify user is member
  const memberCheck = await db.query(
    'SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2',
    [groupId, req.user.userId]
  );

  if (memberCheck.rowCount === 0) {
    throw forbiddenError('Not a member of this group');
  }

  // Use quotaService to get quota info
  const quotaInfo = await quotaService.getQuotaInfo(groupId);

  res.status(200).json({
    group_id: groupId,
    ...quotaInfo
  });
}));

/**
 * DELETE /api/groups/:groupId/members/:userId
 * Remove member from group (creator only)
 */
router.delete('/:groupId/members/:userId', authenticate, asyncHandler(async (req, res) => {
  const { groupId, userId } = req.params;

  // Verify requester is group creator
  const groupCheck = await db.query(
    'SELECT created_by FROM groups WHERE id = $1',
    [groupId]
  );

  if (groupCheck.rowCount === 0) {
    throw notFoundError('Group not found');
  }

  if (groupCheck.rows[0].created_by !== req.user.userId) {
    throw forbiddenError('Only group creator can remove members');
  }

  // Don't allow removing creator
  if (userId === req.user.userId) {
    throw validationError('Cannot remove group creator');
  }

  // Remove member
  const result = await db.query(
    'DELETE FROM members WHERE group_id = $1 AND user_id = $2 RETURNING user_id',
    [groupId, userId]
  );

  if (result.rowCount === 0) {
    throw notFoundError('Member not found in group');
  }

  logger.info('Member removed from group', {
    groupId,
    removedUserId: userId,
    removedBy: req.user.userId
  });

  res.status(204).send();
}));

// =============================================================================
// DM (Direct Message) Group Endpoints - Issue #75
// DMs are implemented as 2-person groups with group_type = 'dm'
// =============================================================================

/**
 * POST /api/groups/dm
 * Create or get existing DM group with another user
 *
 * Request body:
 * - recipient_id: string (UUID of user to DM)
 * - encrypted_group_key: string (encryption key for the DM)
 *
 * Response:
 * - group_id: string (UUID of DM group)
 * - is_new: boolean (true if newly created, false if existing)
 * - group_key: string (encryption key to use)
 * - recipient: { id, username }
 */
router.post('/dm', authenticate, asyncHandler(async (req, res) => {
  const { recipient_id, encrypted_group_key } = req.body;

  if (!recipient_id) {
    throw validationError('Missing required field: recipient_id');
  }

  if (!encrypted_group_key) {
    throw validationError('Missing required field: encrypted_group_key');
  }

  // Don't allow DM to self
  if (recipient_id === req.user.userId) {
    throw validationError('Cannot create DM with yourself');
  }

  // Verify recipient exists
  const recipientCheck = await db.query(
    'SELECT id FROM users WHERE id = $1',
    [recipient_id]
  );

  if (recipientCheck.rowCount === 0) {
    throw notFoundError('Recipient user not found');
  }

  try {
    const result = await groupService.createDMGroup(
      req.user.userId,
      recipient_id,
      encrypted_group_key
    );
    res.status(result.is_new ? 201 : 200).json(result);
  } catch (error) {
    logger.error('Failed to create DM group', {
      userId: req.user.userId,
      recipientId: recipient_id,
      error: error.message,
    });
    throw error;
  }
}));

/**
 * GET /api/groups/dms
 * List user's DM conversations
 *
 * Response:
 * - dms: Array of DM group objects
 *   Each object contains:
 *   - group_id: string (UUID)
 *   - recipient: { id, username }
 *   - encrypted_group_key: string
 *   - last_message_at: string (ISO timestamp, may be null)
 *   - created_at: string (ISO timestamp)
 */
router.get('/dms', authenticate, asyncHandler(async (req, res) => {
  const dms = await groupService.getDMGroups(req.user.userId);
  res.status(200).json({ dms });
}));

module.exports = router;
