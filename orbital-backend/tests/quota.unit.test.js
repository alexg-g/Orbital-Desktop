/**
 * Quota Service Unit Tests
 *
 * Unit tests for quota logic without database dependencies.
 * Uses mocks to test business logic in isolation.
 */

const quotaService = require('../src/services/quotaService');

// Mock the database module
jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  testConnection: jest.fn(),
  closePool: jest.fn()
}));

// Mock the logger
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const db = require('../src/config/database');
const logger = require('../src/utils/logger');

describe('Quota Service - Unit Tests', () => {
  const testGroupId = 'test-group-id-123';

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('checkQuotaAvailable', () => {
    test('should allow upload when quota is available', async () => {
      // Mock database response with empty quota
      db.query.mockResolvedValue({
        rowCount: 1,
        rows: [{
          total_bytes: '0',
          media_count: '0',
          max_bytes: `${quotaService.MAX_STORAGE_BYTES}`,
          max_media_count: `${quotaService.MAX_FILE_COUNT}`
        }]
      });

      const fileSize = 1024 * 1024; // 1MB
      const result = await quotaService.checkQuotaAvailable(testGroupId, fileSize);

      expect(result.allowed).toBe(true);
      expect(result.currentUsage.storage_bytes).toBe(0);
      expect(result.currentUsage.file_count).toBe(0);
      expect(result.currentUsage.storage_percent).toBe(0);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [testGroupId]
      );
    });

    test('should block upload when storage quota would be exceeded', async () => {
      const nearLimit = quotaService.MAX_STORAGE_BYTES - (100 * 1024 * 1024);

      db.query.mockResolvedValue({
        rowCount: 1,
        rows: [{
          total_bytes: `${nearLimit}`,
          media_count: '50',
          max_bytes: `${quotaService.MAX_STORAGE_BYTES}`,
          max_media_count: `${quotaService.MAX_FILE_COUNT}`
        }]
      });

      const largeFile = 200 * 1024 * 1024; // 200MB (would exceed)
      const result = await quotaService.checkQuotaAvailable(testGroupId, largeFile);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Storage quota exceeded');
      expect(result.currentUsage.storage_bytes).toBe(nearLimit);
    });

    test('should block upload when file count quota would be exceeded', async () => {
      db.query.mockResolvedValue({
        rowCount: 1,
        rows: [{
          total_bytes: '1073741824', // 1GB
          media_count: `${quotaService.MAX_FILE_COUNT}`,
          max_bytes: `${quotaService.MAX_STORAGE_BYTES}`,
          max_media_count: `${quotaService.MAX_FILE_COUNT}`
        }]
      });

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
      // First call returns no quota
      db.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      // Second call for insert
      db.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const result = await quotaService.checkQuotaAvailable(testGroupId, 1024);

      expect(result.allowed).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        'Group quota not found, initializing',
        { groupId: testGroupId }
      );
    });

    test('should set warning flag at 80% storage threshold', async () => {
      const eightyPercent = quotaService.MAX_STORAGE_BYTES * 0.8;

      db.query.mockResolvedValue({
        rowCount: 1,
        rows: [{
          total_bytes: `${eightyPercent}`,
          media_count: '50',
          max_bytes: `${quotaService.MAX_STORAGE_BYTES}`,
          max_media_count: `${quotaService.MAX_FILE_COUNT}`
        }]
      });

      const result = await quotaService.checkQuotaAvailable(testGroupId, 1024);

      expect(result.allowed).toBe(true);
      expect(result.currentUsage.is_warning).toBe(true);
      expect(result.currentUsage.storage_percent).toBe(80);
    });

    test('should set warning flag at 80% file count threshold', async () => {
      const eightyFiles = Math.floor(quotaService.MAX_FILE_COUNT * 0.8);

      db.query.mockResolvedValue({
        rowCount: 1,
        rows: [{
          total_bytes: '1073741824', // 1GB
          media_count: `${eightyFiles}`,
          max_bytes: `${quotaService.MAX_STORAGE_BYTES}`,
          max_media_count: `${quotaService.MAX_FILE_COUNT}`
        }]
      });

      const result = await quotaService.checkQuotaAvailable(testGroupId, 1024);

      expect(result.allowed).toBe(true);
      expect(result.currentUsage.is_warning).toBe(true);
      expect(result.currentUsage.files_percent).toBe(80);
    });
  });

  describe('getQuotaInfo', () => {
    test('should return correct quota information', async () => {
      const testDate = new Date().toISOString();

      db.query.mockResolvedValue({
        rowCount: 1,
        rows: [{
          total_bytes: '5368709120', // 5GB
          media_count: '50',
          max_bytes: `${quotaService.MAX_STORAGE_BYTES}`,
          max_media_count: `${quotaService.MAX_FILE_COUNT}`,
          updated_at: testDate
        }]
      });

      const result = await quotaService.getQuotaInfo(testGroupId);

      expect(result).toHaveProperty('group_id', testGroupId);
      expect(result.storage.used).toBe(5368709120);
      expect(result.storage.limit).toBe(quotaService.MAX_STORAGE_BYTES);
      expect(result.storage.percentage).toBe(50);
      expect(result.files.count).toBe(50);
      expect(result.files.limit).toBe(quotaService.MAX_FILE_COUNT);
      expect(result.files.percentage).toBe(50);
    });

    test('should initialize quota if missing', async () => {
      db.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      db.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const result = await quotaService.getQuotaInfo(testGroupId);

      expect(result.storage.used).toBe(0);
      expect(result.storage.limit).toBe(quotaService.MAX_STORAGE_BYTES);
      expect(result.files.count).toBe(0);
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

      db.query.mockResolvedValue({
        rowCount: 1,
        rows: [{
          total_bytes: `${fileSize}`,
          media_count: '1',
          max_bytes: `${quotaService.MAX_STORAGE_BYTES}`,
          max_media_count: `${quotaService.MAX_FILE_COUNT}`
        }]
      });

      const result = await quotaService.incrementQuota(testGroupId, fileSize);

      expect(result.total_bytes).toBe(fileSize);
      expect(result.media_count).toBe(1);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE group_quotas'),
        [fileSize, testGroupId]
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Quota incremented',
        expect.objectContaining({ groupId: testGroupId, fileSize })
      );
    });

    test('should handle invalid inputs', async () => {
      await expect(
        quotaService.incrementQuota(null, 1024)
      ).rejects.toThrow('groupId is required');

      await expect(
        quotaService.incrementQuota(testGroupId, -1)
      ).rejects.toThrow('fileSize must be a positive number');
    });

    test('should throw error if group not found', async () => {
      db.query.mockResolvedValue({ rowCount: 0, rows: [] });

      await expect(
        quotaService.incrementQuota(testGroupId, 1024)
      ).rejects.toThrow('Failed to increment quota: group not found');
    });
  });

  describe('decrementQuota', () => {
    test('should decrement quota correctly', async () => {
      const fileSize = 5 * 1024 * 1024; // 5MB

      db.query.mockResolvedValue({
        rowCount: 1,
        rows: [{
          total_bytes: '0',
          media_count: '0',
          max_bytes: `${quotaService.MAX_STORAGE_BYTES}`,
          max_media_count: `${quotaService.MAX_FILE_COUNT}`
        }]
      });

      const result = await quotaService.decrementQuota(testGroupId, fileSize);

      expect(result.total_bytes).toBe(0);
      expect(result.media_count).toBe(0);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE group_quotas'),
        [fileSize, testGroupId]
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Quota decremented',
        expect.objectContaining({ groupId: testGroupId, fileSize })
      );
    });

    test('should not go below zero (database handles with GREATEST)', async () => {
      db.query.mockResolvedValue({
        rowCount: 1,
        rows: [{
          total_bytes: '0',
          media_count: '0',
          max_bytes: `${quotaService.MAX_STORAGE_BYTES}`,
          max_media_count: `${quotaService.MAX_FILE_COUNT}`
        }]
      });

      const result = await quotaService.decrementQuota(testGroupId, 1024);

      expect(result.total_bytes).toBe(0);
      expect(result.media_count).toBe(0);
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

  describe('initializeQuota', () => {
    test('should initialize quota for new group', async () => {
      db.query.mockResolvedValue({
        rowCount: 1,
        rows: [{
          total_bytes: '0',
          media_count: '0',
          max_bytes: `${quotaService.MAX_STORAGE_BYTES}`,
          max_media_count: `${quotaService.MAX_FILE_COUNT}`
        }]
      });

      const result = await quotaService.initializeQuota(testGroupId);

      expect(result.total_bytes).toBe(0);
      expect(result.media_count).toBe(0);
      expect(result.max_bytes).toBe(quotaService.MAX_STORAGE_BYTES);
      expect(result.max_media_count).toBe(quotaService.MAX_FILE_COUNT);
      expect(logger.info).toHaveBeenCalledWith(
        'Quota initialized for group',
        { groupId: testGroupId }
      );
    });

    test('should handle conflict (already exists)', async () => {
      // Mock INSERT returning 0 rows (conflict)
      db.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      // Mock getQuotaInfo call
      db.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          total_bytes: '1000',
          media_count: '1',
          max_bytes: `${quotaService.MAX_STORAGE_BYTES}`,
          max_media_count: `${quotaService.MAX_FILE_COUNT}`,
          updated_at: new Date().toISOString()
        }]
      });

      const result = await quotaService.initializeQuota(testGroupId);

      expect(result).toBeDefined();
    });

    test('should handle invalid inputs', async () => {
      await expect(
        quotaService.initializeQuota(null)
      ).rejects.toThrow('groupId is required');
    });
  });

  describe('Constants', () => {
    test('should export correct constants', () => {
      expect(quotaService.MAX_STORAGE_BYTES).toBe(10 * 1024 * 1024 * 1024); // 10GB
      expect(quotaService.MAX_FILE_COUNT).toBe(100);
      expect(quotaService.WARNING_THRESHOLD_PERCENT).toBe(80);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      db.query.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        quotaService.checkQuotaAvailable(testGroupId, 1024)
      ).rejects.toThrow('Database connection failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to check quota availability',
        expect.objectContaining({
          groupId: testGroupId,
          fileSize: 1024,
          error: 'Database connection failed'
        })
      );
    });

    test('should handle database errors in incrementQuota', async () => {
      db.query.mockRejectedValue(new Error('Connection timeout'));

      await expect(
        quotaService.incrementQuota(testGroupId, 1024)
      ).rejects.toThrow('Connection timeout');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to increment quota',
        expect.objectContaining({ error: 'Connection timeout' })
      );
    });
  });

  describe('Transaction Support', () => {
    test('should accept optional client parameter', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({
          rowCount: 1,
          rows: [{
            total_bytes: '1024',
            media_count: '1',
            max_bytes: `${quotaService.MAX_STORAGE_BYTES}`,
            max_media_count: `${quotaService.MAX_FILE_COUNT}`
          }]
        })
      };

      const result = await quotaService.incrementQuota(testGroupId, 1024, mockClient);

      expect(result.total_bytes).toBe(1024);
      expect(mockClient.query).toHaveBeenCalled();
      expect(db.query).not.toHaveBeenCalled();
    });
  });
});
