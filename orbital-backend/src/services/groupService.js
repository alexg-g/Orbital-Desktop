/**
 * Group Service
 *
 * Centralized business logic for group management:
 * - Group creation with invite codes
 * - Single-use, 24-hour expiring invite codes
 * - Max 10 members per group enforcement
 * - Invite code regeneration
 */

const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../utils/logger');
const quotaService = require('./quotaService');
const { normalizeEmail, isValidEmail } = require('../utils/emailNormalization');

// Constants
const MAX_MEMBERS = 10;
const INVITE_CODE_EXPIRATION_DAYS = 1; // Reduced from 7 days for security (CISA advisory)
const INVITE_CODE_LENGTH = 8;

/**
 * Generate cryptographically secure 8-character alphanumeric invite code
 * Uses uppercase letters and numbers for readability
 */
function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomBytes = crypto.randomBytes(INVITE_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += chars[randomBytes[i] % chars.length];
  }
  return code;
}

/**
 * Calculate invite code expiration date (24 hours from now)
 */
function getExpirationDate() {
  const date = new Date();
  date.setDate(date.getDate() + INVITE_CODE_EXPIRATION_DAYS);
  return date;
}

/**
 * Create a new group with an invite code
 * @param {string} userId - Creator's user ID
 * @param {string} encryptedName - Encrypted group name (client-side encrypted)
 * @param {string} encryptedGroupKey - Encrypted group key for the creator
 * @returns {Promise<Object>} - Created group with invite code
 */
async function createGroup(userId, encryptedName, encryptedGroupKey) {
  if (!userId) throw new Error('userId is required');
  if (!encryptedName) throw new Error('encryptedName is required');
  if (!encryptedGroupKey) throw new Error('encryptedGroupKey is required');

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Create the group (use placeholder invite_code for legacy compatibility)
    const groupResult = await client.query(
      `INSERT INTO groups (encrypted_name, created_by, invite_code, max_members)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [encryptedName, userId, 'LEGACY00', MAX_MEMBERS]
    );

    const group = groupResult.rows[0];

    // Generate unique invite code
    let inviteCode;
    let attempts = 0;
    while (attempts < 10) {
      inviteCode = generateInviteCode();
      const existing = await client.query(
        'SELECT 1 FROM invite_codes WHERE code = $1',
        [inviteCode]
      );
      if (existing.rowCount === 0) break;
      attempts++;
    }

    if (attempts === 10) {
      throw new Error('Failed to generate unique invite code');
    }

    // Create the invite code
    const expiresAt = getExpirationDate();
    await client.query(
      `INSERT INTO invite_codes (group_id, code, expires_at)
       VALUES ($1, $2, $3)`,
      [group.id, inviteCode, expiresAt]
    );

    // Update the legacy invite_code field for backwards compatibility
    await client.query(
      'UPDATE groups SET invite_code = $1 WHERE id = $2',
      [inviteCode, group.id]
    );

    // Add creator as first member
    await client.query(
      `INSERT INTO members (group_id, user_id, encrypted_group_key)
       VALUES ($1, $2, $3)`,
      [group.id, userId, encryptedGroupKey]
    );

    // Initialize group quota
    await quotaService.initializeQuota(group.id, client);

    await client.query('COMMIT');

    logger.info('Group created', {
      groupId: group.id,
      creatorId: userId,
      inviteCode
    });

    return {
      group_id: group.id,
      invite_code: inviteCode,
      expires_at: expiresAt.toISOString(),
      created_at: group.created_at
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create group', {
      userId,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Generate a new invite code for an existing group
 * Only the group creator can regenerate codes
 * @param {string} groupId - Group ID
 * @param {string} userId - User requesting new code (must be creator)
 * @param {string} targetEmail - Email address the invite is for
 * @returns {Promise<Object>} - New invite code with expiration
 */
async function regenerateInviteCode(groupId, userId, targetEmail) {
  if (!groupId) throw new Error('groupId is required');
  if (!userId) throw new Error('userId is required');
  if (!targetEmail) throw new Error('targetEmail is required');

  // Validate email format
  if (!isValidEmail(targetEmail)) {
    throw new Error('INVALID_EMAIL_FORMAT');
  }

  // Normalize the email for consistent comparison
  const normalizedEmail = normalizeEmail(targetEmail);

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Verify user is group creator
    const groupResult = await client.query(
      'SELECT created_by FROM groups WHERE id = $1',
      [groupId]
    );

    if (groupResult.rowCount === 0) {
      throw new Error('GROUP_NOT_FOUND');
    }

    if (groupResult.rows[0].created_by !== userId) {
      throw new Error('FORBIDDEN_NOT_CREATOR');
    }

    // Generate unique invite code
    let inviteCode;
    let attempts = 0;
    while (attempts < 10) {
      inviteCode = generateInviteCode();
      const existing = await client.query(
        'SELECT 1 FROM invite_codes WHERE code = $1',
        [inviteCode]
      );
      if (existing.rowCount === 0) break;
      attempts++;
    }

    if (attempts === 10) {
      throw new Error('Failed to generate unique invite code');
    }

    // Create new invite code with target email
    const expiresAt = getExpirationDate();
    await client.query(
      `INSERT INTO invite_codes (group_id, code, expires_at, target_email, normalized_target_email)
       VALUES ($1, $2, $3, $4, $5)`,
      [groupId, inviteCode, expiresAt, targetEmail.toLowerCase().trim(), normalizedEmail]
    );

    // Update the legacy invite_code field
    await client.query(
      'UPDATE groups SET invite_code = $1 WHERE id = $2',
      [inviteCode, groupId]
    );

    await client.query('COMMIT');

    logger.info('Invite code regenerated', {
      groupId,
      userId,
      inviteCode,
      targetEmail: targetEmail.toLowerCase().trim()
    });

    return {
      invite_code: inviteCode,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
      target_email: targetEmail.toLowerCase().trim()
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to regenerate invite code', {
      groupId,
      userId,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Join a group using an invite code
 * Validates that the user's email matches the invite's target email.
 * @param {string} userId - User joining
 * @param {string} inviteCode - Invite code
 * @param {string} encryptedGroupKey - Encrypted group key for this user
 * @returns {Promise<Object>} - Group info after joining
 */
async function joinGroup(userId, inviteCode, encryptedGroupKey) {
  if (!userId) throw new Error('userId is required');
  if (!inviteCode) throw new Error('inviteCode is required');
  if (!encryptedGroupKey) throw new Error('encryptedGroupKey is required');

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Get user's normalized email
    const userResult = await client.query(
      'SELECT normalized_email FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rowCount === 0) {
      throw new Error('USER_NOT_FOUND');
    }

    const userNormalizedEmail = userResult.rows[0].normalized_email;

    // Find the invite code (check not expired, not used)
    // Also get the group key from the creator's member record
    const codeResult = await client.query(
      `SELECT ic.id, ic.group_id, ic.expires_at, ic.used_by, ic.normalized_target_email,
              g.encrypted_name, g.max_members, g.created_by,
              m.encrypted_group_key as creator_group_key
       FROM invite_codes ic
       INNER JOIN groups g ON g.id = ic.group_id
       LEFT JOIN members m ON m.group_id = g.id AND m.user_id = g.created_by
       WHERE ic.code = $1
       FOR UPDATE OF ic, g`,
      [inviteCode.toUpperCase()]
    );

    if (codeResult.rowCount === 0) {
      throw new Error('INVALID_INVITE_CODE');
    }

    const code = codeResult.rows[0];

    // Check if code is already used
    if (code.used_by) {
      throw new Error('INVITE_CODE_ALREADY_USED');
    }

    // Check if code is expired
    if (new Date(code.expires_at) < new Date()) {
      throw new Error('INVITE_CODE_EXPIRED');
    }

    // Check if user's email matches the invite's target email
    if (code.normalized_target_email && code.normalized_target_email !== userNormalizedEmail) {
      logger.warn('Join group attempt with mismatched email', {
        userId,
        userNormalizedEmail,
        targetNormalizedEmail: code.normalized_target_email,
        inviteCode: inviteCode.toUpperCase()
      });
      throw new Error('EMAIL_MISMATCH');
    }

    const groupId = code.group_id;

    // Check if user is already a member
    const memberCheck = await client.query(
      'SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );

    if (memberCheck.rowCount > 0) {
      throw new Error('ALREADY_MEMBER');
    }

    // Check member count (max 10)
    const countResult = await client.query(
      'SELECT COUNT(*) as count FROM members WHERE group_id = $1',
      [groupId]
    );

    const currentCount = parseInt(countResult.rows[0].count, 10);
    const maxMembers = code.max_members || MAX_MEMBERS;

    if (currentCount >= maxMembers) {
      throw new Error('GROUP_FULL');
    }

    // Mark invite code as used
    await client.query(
      `UPDATE invite_codes
       SET used_by = $1, used_at = NOW()
       WHERE id = $2`,
      [userId, code.id]
    );

    // Add user as member
    await client.query(
      `INSERT INTO members (group_id, user_id, encrypted_group_key)
       VALUES ($1, $2, $3)`,
      [groupId, userId, encryptedGroupKey]
    );

    await client.query('COMMIT');

    logger.info('User joined group', {
      groupId,
      userId,
      inviteCode
    });

    // DEBUG: Log key prefix for key transfer verification
    const keyPrefix = code.creator_group_key ? code.creator_group_key.substring(0, 8) : 'NULL';
    logger.info('[KEY-TRANSFER-DEBUG] joinGroup: Returning key prefix', {
      keyPrefix: keyPrefix + '...',
      groupId,
      hasKey: !!code.creator_group_key
    });
    console.log(`[KEY-TRANSFER-DEBUG] Backend joinGroup: Returning key prefix: ${keyPrefix}... for group ${groupId}`);

    return {
      group_id: groupId,
      encrypted_name: code.encrypted_name,
      member_count: currentCount + 1,
      joined_at: new Date().toISOString(),
      // Return the group key so the joining user can decrypt content
      // For MVP, this is the plaintext key from the creator's record
      group_key: code.creator_group_key
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to join group', {
      userId,
      inviteCode,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get groups for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - List of user's groups
 */
async function getUserGroups(userId) {
  if (!userId) throw new Error('userId is required');

  // FIX: Always return the CREATOR's group key, not the joiner's key
  // The creator's key is the one used for encryption, all members must use it
  const result = await db.query(
    `SELECT g.id, g.encrypted_name, g.created_by, g.max_members,
            m.joined_at,
            creator_member.encrypted_group_key as encrypted_group_key,
            COUNT(m2.user_id) as member_count,
            (SELECT code FROM invite_codes ic
             WHERE ic.group_id = g.id AND ic.used_by IS NULL AND ic.expires_at > NOW()
             ORDER BY ic.created_at DESC LIMIT 1) as active_invite_code
     FROM groups g
     INNER JOIN members m ON m.group_id = g.id
     LEFT JOIN members m2 ON m2.group_id = g.id
     LEFT JOIN members creator_member ON creator_member.group_id = g.id AND creator_member.user_id = g.created_by
     WHERE m.user_id = $1
     GROUP BY g.id, m.joined_at, creator_member.encrypted_group_key
     ORDER BY m.joined_at DESC`,
    [userId]
  );

  return result.rows.map(row => ({
    group_id: row.id,
    encrypted_name: row.encrypted_name,
    encrypted_group_key: row.encrypted_group_key,
    member_count: parseInt(row.member_count, 10),
    max_members: row.max_members,
    is_creator: row.created_by === userId,
    active_invite_code: row.active_invite_code,
    joined_at: row.joined_at
  }));
}

/**
 * Get members of a group
 * @param {string} groupId - Group ID
 * @param {string} userId - Requesting user ID (must be member)
 * @returns {Promise<Array>} - List of group members
 */
async function getGroupMembers(groupId, userId) {
  if (!groupId) throw new Error('groupId is required');
  if (!userId) throw new Error('userId is required');

  // Verify user is member
  const memberCheck = await db.query(
    'SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );

  if (memberCheck.rowCount === 0) {
    throw new Error('FORBIDDEN_NOT_MEMBER');
  }

  const result = await db.query(
    `SELECT u.id, u.username, u.public_key, m.joined_at
     FROM members m
     INNER JOIN users u ON u.id = m.user_id
     WHERE m.group_id = $1
     ORDER BY m.joined_at ASC`,
    [groupId]
  );

  return result.rows.map(row => ({
    user_id: row.id,
    username: row.username,
    public_key: row.public_key,
    joined_at: row.joined_at
  }));
}

/**
 * Get active invite codes for a group
 * Only returns codes that are unused and not expired
 * @param {string} groupId - Group ID
 * @param {string} userId - Requesting user ID (must be creator)
 * @returns {Promise<Array>} - List of active invite codes
 */
async function getActiveInviteCodes(groupId, userId) {
  if (!groupId) throw new Error('groupId is required');
  if (!userId) throw new Error('userId is required');

  // Verify user is creator
  const groupResult = await db.query(
    'SELECT created_by FROM groups WHERE id = $1',
    [groupId]
  );

  if (groupResult.rowCount === 0) {
    throw new Error('GROUP_NOT_FOUND');
  }

  if (groupResult.rows[0].created_by !== userId) {
    throw new Error('FORBIDDEN_NOT_CREATOR');
  }

  const result = await db.query(
    `SELECT id, code, created_at, expires_at, target_email
     FROM invite_codes
     WHERE group_id = $1 AND used_by IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [groupId]
  );

  return result.rows.map(row => ({
    id: row.id,
    code: row.code,
    created_at: row.created_at,
    expires_at: row.expires_at,
    target_email: row.target_email
  }));
}

/**
 * Get invite history for a group (including used and expired)
 * Returns all invite codes with their computed status
 * @param {string} groupId - Group ID
 * @param {string} userId - Requesting user ID (must be creator)
 * @returns {Promise<Array>} - List of all invite codes with status
 */
async function getInviteHistory(groupId, userId) {
  if (!groupId) throw new Error('groupId is required');
  if (!userId) throw new Error('userId is required');

  // Verify user is creator
  const groupResult = await db.query(
    'SELECT created_by FROM groups WHERE id = $1',
    [groupId]
  );

  if (groupResult.rowCount === 0) {
    throw new Error('GROUP_NOT_FOUND');
  }

  if (groupResult.rows[0].created_by !== userId) {
    throw new Error('FORBIDDEN_NOT_CREATOR');
  }

  // Get all invite codes for this group (last 30 days for history)
  const result = await db.query(
    `SELECT id, code, created_at, expires_at, target_email, used_by, used_at
     FROM invite_codes
     WHERE group_id = $1 AND created_at > NOW() - INTERVAL '30 days'
     ORDER BY created_at DESC
     LIMIT 50`,
    [groupId]
  );

  const now = new Date();

  return result.rows.map(row => {
    // Compute status
    let status;
    if (row.used_by) {
      status = 'accepted';
    } else if (new Date(row.expires_at) < now) {
      status = 'expired';
    } else {
      status = 'pending';
    }

    return {
      id: row.id,
      code: row.code,
      created_at: row.created_at,
      expires_at: row.expires_at,
      target_email: row.target_email,
      status,
      used_at: row.used_at
    };
  });
}

/**
 * Get all member IDs for a group
 * Used for WebSocket broadcast operations
 * @param {string} groupId - Group ID
 * @returns {Promise<Array<string>>} - Array of user IDs
 */
async function getGroupMemberIds(groupId) {
  if (!groupId) throw new Error('groupId is required');

  const result = await db.query(
    'SELECT user_id FROM members WHERE group_id = $1',
    [groupId]
  );

  return result.rows.map(row => row.user_id);
}

/**
 * Clean up expired invite codes
 * Called by a scheduled job
 * @returns {Promise<number>} - Number of codes deleted
 */
async function cleanupExpiredCodes() {
  const result = await db.query(
    `DELETE FROM invite_codes
     WHERE expires_at < NOW() AND used_by IS NULL
     RETURNING id`
  );

  const count = result.rowCount;
  if (count > 0) {
    logger.info('Cleaned up expired invite codes', { count });
  }

  return count;
}

module.exports = {
  createGroup,
  regenerateInviteCode,
  joinGroup,
  getUserGroups,
  getGroupMembers,
  getGroupMemberIds,
  getActiveInviteCodes,
  getInviteHistory,
  cleanupExpiredCodes,
  generateInviteCode,
  MAX_MEMBERS,
  INVITE_CODE_EXPIRATION_DAYS
};
