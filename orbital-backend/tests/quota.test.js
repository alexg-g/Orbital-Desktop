/**
 * Quota System Tests
 *
 * Comprehensive tests for group storage quota system:
 * - Quota checking and enforcement
 * - Quota increments on upload
 * - Quota decrements on deletion
 * - Warning thresholds
 * - Concurrent upload handling
 */

const quotaService = require('../src/services/quotaService');
const db = require('../src/config/database');

describe('Quota Service', () => {
  let testGroupId;

  beforeAll(async () => {
    // Ensure database connection
    await db.testConnection();
  });

  beforeEach(async () => {
    // Create test group and initialize quota
    const { v4: uuidv4 } = require('uuid');
    testGroupId = uuidv4();

    await db.query(
      `INSERT INTO groups (id, encrypted_name, created_by, invite_code)
       VALUES ($1, 'test_group', $1, 'TEST1234')`,
      [testGroupId]
    );

    await quotaService.initializeQuota(testGroupId);
  });

  afterEach(async () => {
    // Clean up test data
    if (testGroupId) {
      await db.query('DELETE FROM groups WHERE id = $1', [testGroupId]);
    }
  });

  afterAll(async () => {
    await db.closePool();
  });

  describe('checkQuotaAvailable', () => {
    test('should allow upload when quota is available', async () => {
      const fileSize = 1024 * 1024; // 1MB
      const result = await quotaService.checkQuotaAvailable(testGroupId, fileSize);

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBeDefined();
      expect(result.currentUsage.storage_bytes).toBe(0);
      expect(result.currentUsage.file_count).toBe(0);
      expect(result.currentUsage.storage_percent).toBe(0);
    });

    test('should block upload when storage quota would be exceeded', async () => {
      // Fill quota to near limit
      const nearLimit = quotaService.MAX_STORAGE_BYTES - (100 * 1024 * 1024); // Leave 100MB
      await quotaService.incrementQuota(testGroupId, nearLimit);

      // Try to upload 200MB (would exceed)
      const largeFile = 200 * 1024 * 1024;
      const result = await quotaService.checkQuotaAvailable(testGroupId, largeFile);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Storage quota exceeded');
      expect(result.currentUsage.storage_bytes).toBeGreaterThan(0);
    });

    test('should block upload when file count quota would be exceeded', async () => {
      // Add 100 files (max limit)
      for (let i = 0; i < quotaService.MAX_FILE_COUNT; i++) {
        await quotaService.incrementQuota(testGroupId, 1024); // 1KB each
      }

      // Try to add one more
      const result = await quotaService.checkQuotaAvailable(testGroupId, 1024);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('File count quota exceeded');
      expect(result.currentUsage.file_count).toBe(quotaService.MAX_FILE_COUNT);
    });

    test('should handle invalid inputs', async () => {
      await expect(
        quotaService.checkQuotaAvailable(null, 1024)
      ).rejects.toThrow('groupId is required');

      await expect(
        quotaService.checkQuotaAvailable(testGroupId, -1)
      ).rejects.toThrow('fileSize must be a positive number');

      await expect(
        quotaService.checkQuotaAvailable(testGroupId, 0)
      ).rejects.toThrow('fileSize must be a positive number');
    });

    test('should initialize missing quota automatically', async () => {
      const { v4: uuidv4 } = require('uuid');
      const newGroupId = uuidv4();

      // Create group without quota
      await db.query(
        `INSERT INTO groups (id, encrypted_name, created_by, invite_code)
         VALUES ($1, 'test_group_2', $1, 'TEST5678')`,
        [newGroupId]
      );

      // Check quota (should auto-initialize)
      const result = await quotaService.checkQuotaAvailable(newGroupId, 1024);

      expect(result.allowed).toBe(true);
      expect(result.currentUsage.storage_bytes).toBe(0);

      // Cleanup
      await db.query('DELETE FROM groups WHERE id = $1', [newGroupId]);
    });
  });

  describe('getQuotaInfo', () => {
    test('should return correct quota information', async () => {
      const result = await quotaService.getQuotaInfo(testGroupId);

      expect(result).toHaveProperty('group_id', testGroupId);
      expect(result).toHaveProperty('storage');
      expect(result).toHaveProperty('files');
      expect(result.storage.used).toBe(0);
      expect(result.storage.limit).toBe(quotaService.MAX_STORAGE_BYTES);
      expect(result.files.count).toBe(0);
      expect(result.files.limit).toBe(quotaService.MAX_FILE_COUNT);
    });

    test('should calculate percentages correctly', async () => {
      // Add 5GB (50% of 10GB limit)
      const halfLimit = 5 * 1024 * 1024 * 1024;
      await quotaService.incrementQuota(testGroupId, halfLimit);

      const result = await quotaService.getQuotaInfo(testGroupId);

      expect(result.storage.percentage).toBeCloseTo(50, 1);
      expect(result.storage.warning).toBe(false); // < 80%
    });

    test('should set warning flag at 80% threshold', async () => {
      // Add 8.5GB (85% of 10GB)
      const overThreshold = 8.5 * 1024 * 1024 * 1024;
      await quotaService.incrementQuota(testGroupId, overThreshold);

      const result = await quotaService.getQuotaInfo(testGroupId);

      expect(result.storage.percentage).toBeGreaterThanOrEqual(80);
      expect(result.storage.warning).toBe(true);
    });

    test('should handle missing group', async () => {
      await expect(
        quotaService.getQuotaInfo(null)
      ).rejects.toThrow('groupId is required');
    });
  });

  describe('incrementQuota', () => {
    test('should increment quota correctly', async () => {
      const fileSize = 5 * 1024 * 1024; // 5MB

      const result = await quotaService.incrementQuota(testGroupId, fileSize);

      expect(result.total_bytes).toBe(fileSize);
      expect(result.media_count).toBe(1);
    });

    test('should handle multiple increments', async () => {
      const fileSize = 10 * 1024 * 1024; // 10MB

      await quotaService.incrementQuota(testGroupId, fileSize);
      await quotaService.incrementQuota(testGroupId, fileSize);
      const result = await quotaService.incrementQuota(testGroupId, fileSize);

      expect(result.total_bytes).toBe(fileSize * 3);
      expect(result.media_count).toBe(3);
    });

    test('should handle invalid inputs', async () => {
      await expect(
        quotaService.incrementQuota(null, 1024)
      ).rejects.toThrow('groupId is required');

      await expect(
        quotaService.incrementQuota(testGroupId, -1)
      ).rejects.toThrow('fileSize must be a positive number');
    });
  });

  describe('decrementQuota', () => {
    test('should decrement quota correctly', async () => {
      const fileSize = 5 * 1024 * 1024; // 5MB

      // First increment
      await quotaService.incrementQuota(testGroupId, fileSize);

      // Then decrement
      const result = await quotaService.decrementQuota(testGroupId, fileSize);

      expect(result.total_bytes).toBe(0);
      expect(result.media_count).toBe(0);
    });

    test('should not go below zero', async () => {
      // Decrement when quota is already 0
      const result = await quotaService.decrementQuota(testGroupId, 1024);

      expect(result.total_bytes).toBe(0);
      expect(result.media_count).toBe(0);
    });

    test('should handle partial decrements', async () => {
      // Add 3 files
      await quotaService.incrementQuota(testGroupId, 10 * 1024 * 1024);
      await quotaService.incrementQuota(testGroupId, 20 * 1024 * 1024);
      await quotaService.incrementQuota(testGroupId, 30 * 1024 * 1024);

      // Remove middle one
      const result = await quotaService.decrementQuota(testGroupId, 20 * 1024 * 1024);

      expect(result.total_bytes).toBe(40 * 1024 * 1024); // 10 + 30
      expect(result.media_count).toBe(2);
    });

    test('should handle invalid inputs', async () => {
      await expect(
        quotaService.decrementQuota(null, 1024)
      ).rejects.toThrow('groupId is required');

      await expect(
        quotaService.decrementQuota(testGroupId, -1)
      ).rejects.toThrow('fileSize must be a positive number');
    });
  });

  describe('Warning Threshold', () => {
    test('should trigger warning at 80% storage', async () => {
      // Add 8GB (80% of 10GB)
      const warningThreshold = 8 * 1024 * 1024 * 1024;
      await quotaService.incrementQuota(testGroupId, warningThreshold);

      const check = await quotaService.checkQuotaAvailable(testGroupId, 1024);

      expect(check.currentUsage.storage_percent).toBe(80);
      expect(check.currentUsage.is_warning).toBe(true);
    });

    test('should trigger warning at 80% file count', async () => {
      // Add 80 files (80% of 100)
      for (let i = 0; i < 80; i++) {
        await quotaService.incrementQuota(testGroupId, 1024);
      }

      const check = await quotaService.checkQuotaAvailable(testGroupId, 1024);

      expect(check.currentUsage.files_percent).toBe(80);
      expect(check.currentUsage.is_warning).toBe(true);
    });

    test('should not trigger warning below 80%', async () => {
      // Add 7GB (70% of 10GB)
      const belowThreshold = 7 * 1024 * 1024 * 1024;
      await quotaService.incrementQuota(testGroupId, belowThreshold);

      const check = await quotaService.checkQuotaAvailable(testGroupId, 1024);

      expect(check.currentUsage.storage_percent).toBe(70);
      expect(check.currentUsage.is_warning).toBe(false);
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent increments correctly', async () => {
      const fileSize = 1 * 1024 * 1024; // 1MB

      // Simulate 10 concurrent uploads
      const operations = Array(10).fill(null).map(() =>
        quotaService.incrementQuota(testGroupId, fileSize)
      );

      await Promise.all(operations);

      const info = await quotaService.getQuotaInfo(testGroupId);

      expect(info.storage.used).toBe(fileSize * 10);
      expect(info.files.count).toBe(10);
    });

    test('should handle concurrent quota checks', async () => {
      const fileSize = 1 * 1024 * 1024; // 1MB

      // Simulate 5 concurrent quota checks
      const checks = Array(5).fill(null).map(() =>
        quotaService.checkQuotaAvailable(testGroupId, fileSize)
      );

      const results = await Promise.all(checks);

      // All should be allowed initially
      results.forEach(result => {
        expect(result.allowed).toBe(true);
      });
    });

    test('should handle race condition at quota limit', async () => {
      // Fill quota to just below limit (leave room for 1 small file)
      const nearLimit = quotaService.MAX_STORAGE_BYTES - (1 * 1024 * 1024); // Leave 1MB
      await quotaService.incrementQuota(testGroupId, nearLimit);

      // Try to upload 2 x 1MB files concurrently (only one should succeed in real scenario)
      const fileSize = 1 * 1024 * 1024;

      const check1 = await quotaService.checkQuotaAvailable(testGroupId, fileSize);
      const check2 = await quotaService.checkQuotaAvailable(testGroupId, fileSize);

      // At this point, both checks might say "allowed" because quota hasn't been incremented yet
      // This is expected - the actual enforcement happens in a transaction in the upload endpoint
      expect(check1.allowed).toBe(true);
      expect(check2.allowed).toBe(true);

      // But after incrementing once, the second should fail
      await quotaService.incrementQuota(testGroupId, fileSize);
      const check3 = await quotaService.checkQuotaAvailable(testGroupId, fileSize);

      expect(check3.allowed).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle exact quota limit', async () => {
      // Fill to exact limit
      await quotaService.incrementQuota(testGroupId, quotaService.MAX_STORAGE_BYTES);

      // Try to add 1 more byte
      const result = await quotaService.checkQuotaAvailable(testGroupId, 1);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Storage quota exceeded');
    });

    test('should handle very large file sizes', async () => {
      const veryLargeFile = 20 * 1024 * 1024 * 1024; // 20GB (larger than limit)

      const result = await quotaService.checkQuotaAvailable(testGroupId, veryLargeFile);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Storage quota exceeded');
    });

    test('should handle very small file sizes', async () => {
      const tinyFile = 1; // 1 byte

      const result = await quotaService.checkQuotaAvailable(testGroupId, tinyFile);

      expect(result.allowed).toBe(true);
    });

    test('should handle quota for group with exactly 100 files', async () => {
      // Add exactly 100 files (1KB each)
      for (let i = 0; i < quotaService.MAX_FILE_COUNT; i++) {
        await quotaService.incrementQuota(testGroupId, 1024);
      }

      const info = await quotaService.getQuotaInfo(testGroupId);
      expect(info.files.count).toBe(100);
      expect(info.files.percentage).toBe(100);

      // Try to add one more
      const result = await quotaService.checkQuotaAvailable(testGroupId, 1024);
      expect(result.allowed).toBe(false);
    });
  });

  describe('Transaction Support', () => {
    test('should work with database transactions', async () => {
      const client = await db.getClient();

      try {
        await client.query('BEGIN');

        const fileSize = 5 * 1024 * 1024;
        await quotaService.incrementQuota(testGroupId, fileSize, client);

        await client.query('COMMIT');

        const info = await quotaService.getQuotaInfo(testGroupId);
        expect(info.storage.used).toBe(fileSize);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });

    test('should rollback quota on transaction failure', async () => {
      const client = await db.getClient();

      try {
        await client.query('BEGIN');

        const fileSize = 5 * 1024 * 1024;
        await quotaService.incrementQuota(testGroupId, fileSize, client);

        // Simulate error
        throw new Error('Simulated transaction error');
      } catch (error) {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      // Quota should remain at 0
      const info = await quotaService.getQuotaInfo(testGroupId);
      expect(info.storage.used).toBe(0);
    });
  });
});
