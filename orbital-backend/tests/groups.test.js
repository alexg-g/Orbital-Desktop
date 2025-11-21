/**
 * Group Management Tests
 *
 * Comprehensive tests for group creation, invite codes, and member management:
 * - Group creation with invite codes
 * - Single-use, 7-day expiring invite codes
 * - Max 10 members enforcement
 * - Invite code regeneration
 * - Error handling for all failure cases
 */

const groupService = require('../src/services/groupService');
const db = require('../src/config/database');
const { v4: uuidv4 } = require('uuid');

describe('Group Service', () => {
  let testUserId;
  let testUsername;

  beforeAll(async () => {
    await db.testConnection();
  });

  beforeEach(async () => {
    // Create test user
    testUserId = uuidv4();
    testUsername = `testuser_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    await db.query(
      `INSERT INTO users (id, username, password_hash, public_key)
       VALUES ($1, $2, $3, $4)`,
      [testUserId, testUsername, 'hash_placeholder', '{}']
    );
  });

  afterEach(async () => {
    // Clean up test data
    if (testUserId) {
      // Delete invite codes first (due to foreign key)
      await db.query(
        `DELETE FROM invite_codes WHERE group_id IN (
          SELECT id FROM groups WHERE created_by = $1
        )`,
        [testUserId]
      );
      // Delete groups (cascade will delete members and quotas)
      await db.query('DELETE FROM groups WHERE created_by = $1', [testUserId]);
      await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
  });

  afterAll(async () => {
    await db.closePool();
  });

  describe('generateInviteCode', () => {
    test('should generate 8-character alphanumeric code', () => {
      const code = groupService.generateInviteCode();
      expect(code).toMatch(/^[A-Z0-9]{8}$/);
      expect(code.length).toBe(8);
    });

    test('should generate unique codes', () => {
      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        codes.add(groupService.generateInviteCode());
      }
      // With crypto-random, 100 codes should all be unique
      expect(codes.size).toBe(100);
    });
  });

  describe('createGroup', () => {
    test('should create group with invite code', async () => {
      const result = await groupService.createGroup(
        testUserId,
        'encrypted_name_test',
        'encrypted_key_test'
      );

      expect(result).toHaveProperty('group_id');
      expect(result).toHaveProperty('invite_code');
      expect(result).toHaveProperty('expires_at');
      expect(result).toHaveProperty('created_at');

      // Verify invite code format
      expect(result.invite_code).toMatch(/^[A-Z0-9]{8}$/);

      // Verify expiration is ~7 days from now
      const expiresAt = new Date(result.expires_at);
      const now = new Date();
      const diffDays = (expiresAt - now) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(6.9);
      expect(diffDays).toBeLessThan(7.1);
    });

    test('should add creator as first member', async () => {
      const result = await groupService.createGroup(
        testUserId,
        'encrypted_name_test',
        'encrypted_key_test'
      );

      // Verify creator is member
      const memberCheck = await db.query(
        'SELECT * FROM members WHERE group_id = $1 AND user_id = $2',
        [result.group_id, testUserId]
      );

      expect(memberCheck.rowCount).toBe(1);
      expect(memberCheck.rows[0].encrypted_group_key).toBe('encrypted_key_test');
    });

    test('should initialize group quota', async () => {
      const result = await groupService.createGroup(
        testUserId,
        'encrypted_name_test',
        'encrypted_key_test'
      );

      // Verify quota exists
      const quotaCheck = await db.query(
        'SELECT * FROM group_quotas WHERE group_id = $1',
        [result.group_id]
      );

      expect(quotaCheck.rowCount).toBe(1);
      expect(quotaCheck.rows[0].total_bytes).toBe('0');
      expect(quotaCheck.rows[0].media_count).toBe(0);
    });

    test('should create invite code in invite_codes table', async () => {
      const result = await groupService.createGroup(
        testUserId,
        'encrypted_name_test',
        'encrypted_key_test'
      );

      // Verify invite code in table
      const codeCheck = await db.query(
        'SELECT * FROM invite_codes WHERE group_id = $1',
        [result.group_id]
      );

      expect(codeCheck.rowCount).toBe(1);
      expect(codeCheck.rows[0].code).toBe(result.invite_code);
      expect(codeCheck.rows[0].used_by).toBeNull();
    });

    test('should reject missing required fields', async () => {
      await expect(
        groupService.createGroup(null, 'name', 'key')
      ).rejects.toThrow('userId is required');

      await expect(
        groupService.createGroup(testUserId, null, 'key')
      ).rejects.toThrow('encryptedName is required');

      await expect(
        groupService.createGroup(testUserId, 'name', null)
      ).rejects.toThrow('encryptedGroupKey is required');
    });
  });

  describe('regenerateInviteCode', () => {
    let groupId;

    beforeEach(async () => {
      const group = await groupService.createGroup(
        testUserId,
        'test_group',
        'test_key'
      );
      groupId = group.group_id;
    });

    test('should generate new invite code', async () => {
      const result = await groupService.regenerateInviteCode(groupId, testUserId);

      expect(result).toHaveProperty('invite_code');
      expect(result).toHaveProperty('expires_at');
      expect(result.invite_code).toMatch(/^[A-Z0-9]{8}$/);
    });

    test('should reject non-creator', async () => {
      // Create another user
      const otherUserId = uuidv4();
      await db.query(
        `INSERT INTO users (id, username, password_hash, public_key)
         VALUES ($1, $2, $3, $4)`,
        [otherUserId, `other_${Date.now()}`, 'hash', '{}']
      );

      await expect(
        groupService.regenerateInviteCode(groupId, otherUserId)
      ).rejects.toThrow('FORBIDDEN_NOT_CREATOR');

      // Clean up
      await db.query('DELETE FROM users WHERE id = $1', [otherUserId]);
    });

    test('should reject non-existent group', async () => {
      const fakeGroupId = uuidv4();
      await expect(
        groupService.regenerateInviteCode(fakeGroupId, testUserId)
      ).rejects.toThrow('GROUP_NOT_FOUND');
    });
  });

  describe('joinGroup', () => {
    let groupId;
    let inviteCode;
    let joinUserId;

    beforeEach(async () => {
      const group = await groupService.createGroup(
        testUserId,
        'test_group',
        'test_key'
      );
      groupId = group.group_id;
      inviteCode = group.invite_code;

      // Create user to join
      joinUserId = uuidv4();
      await db.query(
        `INSERT INTO users (id, username, password_hash, public_key)
         VALUES ($1, $2, $3, $4)`,
        [joinUserId, `joiner_${Date.now()}`, 'hash', '{}']
      );
    });

    afterEach(async () => {
      if (joinUserId) {
        await db.query('DELETE FROM users WHERE id = $1', [joinUserId]);
      }
    });

    test('should join group with valid code', async () => {
      const result = await groupService.joinGroup(
        joinUserId,
        inviteCode,
        'joiner_key'
      );

      expect(result.group_id).toBe(groupId);
      expect(result.member_count).toBe(2);
      expect(result).toHaveProperty('joined_at');
    });

    test('should mark invite code as used', async () => {
      await groupService.joinGroup(joinUserId, inviteCode, 'joiner_key');

      // Check code is marked as used
      const codeCheck = await db.query(
        'SELECT used_by, used_at FROM invite_codes WHERE code = $1',
        [inviteCode]
      );

      expect(codeCheck.rows[0].used_by).toBe(joinUserId);
      expect(codeCheck.rows[0].used_at).not.toBeNull();
    });

    test('should reject already used code', async () => {
      // First join succeeds
      await groupService.joinGroup(joinUserId, inviteCode, 'joiner_key');

      // Create another user to try the same code
      const anotherUserId = uuidv4();
      await db.query(
        `INSERT INTO users (id, username, password_hash, public_key)
         VALUES ($1, $2, $3, $4)`,
        [anotherUserId, `another_${Date.now()}`, 'hash', '{}']
      );

      await expect(
        groupService.joinGroup(anotherUserId, inviteCode, 'another_key')
      ).rejects.toThrow('INVITE_CODE_ALREADY_USED');

      // Clean up
      await db.query('DELETE FROM users WHERE id = $1', [anotherUserId]);
    });

    test('should reject expired code', async () => {
      // Manually expire the code
      await db.query(
        `UPDATE invite_codes SET expires_at = NOW() - INTERVAL '1 day' WHERE code = $1`,
        [inviteCode]
      );

      await expect(
        groupService.joinGroup(joinUserId, inviteCode, 'joiner_key')
      ).rejects.toThrow('INVITE_CODE_EXPIRED');
    });

    test('should reject invalid code', async () => {
      await expect(
        groupService.joinGroup(joinUserId, 'INVALID1', 'joiner_key')
      ).rejects.toThrow('INVALID_INVITE_CODE');
    });

    test('should reject already member', async () => {
      await groupService.joinGroup(joinUserId, inviteCode, 'joiner_key');

      // Generate new code and try to join again
      const newCode = await groupService.regenerateInviteCode(groupId, testUserId);

      await expect(
        groupService.joinGroup(joinUserId, newCode.invite_code, 'joiner_key')
      ).rejects.toThrow('ALREADY_MEMBER');
    });

    test('should reject when group is full (10 members)', async () => {
      // Add 9 more members to reach 10 (creator is first)
      for (let i = 0; i < 9; i++) {
        const newCode = await groupService.regenerateInviteCode(groupId, testUserId);
        const userId = uuidv4();
        await db.query(
          `INSERT INTO users (id, username, password_hash, public_key)
           VALUES ($1, $2, $3, $4)`,
          [userId, `member_${i}_${Date.now()}`, 'hash', '{}']
        );
        await groupService.joinGroup(userId, newCode.invite_code, `key_${i}`);
      }

      // Generate another code
      const finalCode = await groupService.regenerateInviteCode(groupId, testUserId);

      // 11th member should be rejected
      await expect(
        groupService.joinGroup(joinUserId, finalCode.invite_code, 'joiner_key')
      ).rejects.toThrow('GROUP_FULL');
    });

    test('should handle case-insensitive invite codes', async () => {
      const lowerCode = inviteCode.toLowerCase();
      const result = await groupService.joinGroup(
        joinUserId,
        lowerCode,
        'joiner_key'
      );

      expect(result.group_id).toBe(groupId);
    });
  });

  describe('getUserGroups', () => {
    test('should return user groups', async () => {
      // Create a group
      await groupService.createGroup(testUserId, 'group1', 'key1');

      const groups = await groupService.getUserGroups(testUserId);

      expect(groups.length).toBe(1);
      expect(groups[0]).toHaveProperty('group_id');
      expect(groups[0]).toHaveProperty('encrypted_name', 'group1');
      expect(groups[0]).toHaveProperty('member_count', 1);
      expect(groups[0]).toHaveProperty('is_creator', true);
    });

    test('should return multiple groups', async () => {
      await groupService.createGroup(testUserId, 'group1', 'key1');
      await groupService.createGroup(testUserId, 'group2', 'key2');

      const groups = await groupService.getUserGroups(testUserId);

      expect(groups.length).toBe(2);
    });

    test('should return empty array for user with no groups', async () => {
      const groups = await groupService.getUserGroups(testUserId);
      expect(groups).toEqual([]);
    });

    test('should include active invite code for creator', async () => {
      await groupService.createGroup(testUserId, 'group1', 'key1');

      const groups = await groupService.getUserGroups(testUserId);

      expect(groups[0]).toHaveProperty('active_invite_code');
      expect(groups[0].active_invite_code).toMatch(/^[A-Z0-9]{8}$/);
    });
  });

  describe('getGroupMembers', () => {
    let groupId;

    beforeEach(async () => {
      const group = await groupService.createGroup(
        testUserId,
        'test_group',
        'test_key'
      );
      groupId = group.group_id;
    });

    test('should return group members', async () => {
      const members = await groupService.getGroupMembers(groupId, testUserId);

      expect(members.length).toBe(1);
      expect(members[0]).toHaveProperty('user_id', testUserId);
      expect(members[0]).toHaveProperty('username', testUsername);
      expect(members[0]).toHaveProperty('public_key');
      expect(members[0]).toHaveProperty('joined_at');
    });

    test('should reject non-member', async () => {
      const nonMemberId = uuidv4();
      await db.query(
        `INSERT INTO users (id, username, password_hash, public_key)
         VALUES ($1, $2, $3, $4)`,
        [nonMemberId, `nonmember_${Date.now()}`, 'hash', '{}']
      );

      await expect(
        groupService.getGroupMembers(groupId, nonMemberId)
      ).rejects.toThrow('FORBIDDEN_NOT_MEMBER');

      // Clean up
      await db.query('DELETE FROM users WHERE id = $1', [nonMemberId]);
    });
  });

  describe('getActiveInviteCodes', () => {
    let groupId;

    beforeEach(async () => {
      const group = await groupService.createGroup(
        testUserId,
        'test_group',
        'test_key'
      );
      groupId = group.group_id;
    });

    test('should return active invite codes', async () => {
      const codes = await groupService.getActiveInviteCodes(groupId, testUserId);

      expect(codes.length).toBe(1);
      expect(codes[0]).toHaveProperty('code');
      expect(codes[0]).toHaveProperty('expires_at');
    });

    test('should not return used codes', async () => {
      // Use the initial code
      const joinUserId = uuidv4();
      await db.query(
        `INSERT INTO users (id, username, password_hash, public_key)
         VALUES ($1, $2, $3, $4)`,
        [joinUserId, `joiner_${Date.now()}`, 'hash', '{}']
      );

      const groups = await groupService.getUserGroups(testUserId);
      const inviteCode = groups[0].active_invite_code;
      await groupService.joinGroup(joinUserId, inviteCode, 'key');

      // Generate new code
      await groupService.regenerateInviteCode(groupId, testUserId);

      const codes = await groupService.getActiveInviteCodes(groupId, testUserId);

      // Should only return the new unused code
      expect(codes.length).toBe(1);

      // Clean up
      await db.query('DELETE FROM users WHERE id = $1', [joinUserId]);
    });

    test('should reject non-creator', async () => {
      const nonCreatorId = uuidv4();
      await db.query(
        `INSERT INTO users (id, username, password_hash, public_key)
         VALUES ($1, $2, $3, $4)`,
        [nonCreatorId, `noncreator_${Date.now()}`, 'hash', '{}']
      );

      await expect(
        groupService.getActiveInviteCodes(groupId, nonCreatorId)
      ).rejects.toThrow('FORBIDDEN_NOT_CREATOR');

      // Clean up
      await db.query('DELETE FROM users WHERE id = $1', [nonCreatorId]);
    });
  });

  describe('Edge Cases', () => {
    test('should handle concurrent group creation', async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          groupService.createGroup(testUserId, `group_${i}`, `key_${i}`)
        );
      }

      const results = await Promise.all(promises);

      // All groups should be created with unique invite codes
      const inviteCodes = results.map(r => r.invite_code);
      const uniqueCodes = new Set(inviteCodes);
      expect(uniqueCodes.size).toBe(5);
    });

    test('should handle concurrent join attempts to same code', async () => {
      const group = await groupService.createGroup(testUserId, 'group', 'key');

      // Create multiple users
      const userIds = [];
      for (let i = 0; i < 3; i++) {
        const userId = uuidv4();
        await db.query(
          `INSERT INTO users (id, username, password_hash, public_key)
           VALUES ($1, $2, $3, $4)`,
          [userId, `concurrent_${i}_${Date.now()}`, 'hash', '{}']
        );
        userIds.push(userId);
      }

      // All try to join with same code (only one should succeed)
      const promises = userIds.map((userId, i) =>
        groupService.joinGroup(userId, group.invite_code, `key_${i}`)
          .catch(e => ({ error: e.message }))
      );

      const results = await Promise.all(promises);

      // Count successes and failures
      const successes = results.filter(r => !r.error);
      const failures = results.filter(r => r.error);

      // Only one should succeed (single-use code)
      expect(successes.length).toBe(1);
      expect(failures.length).toBe(2);
      expect(failures.every(f => f.error === 'INVITE_CODE_ALREADY_USED')).toBe(true);

      // Clean up
      for (const userId of userIds) {
        await db.query('DELETE FROM users WHERE id = $1', [userId]);
      }
    });
  });
});
