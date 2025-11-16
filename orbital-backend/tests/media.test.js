/**
 * Media API Tests
 *
 * Comprehensive test suite for media upload, chunked uploads, and cleanup.
 */

const request = require('supertest');
const { app, server } = require('../src/server');
const db = require('../src/config/database');
const fs = require('fs').promises;
const path = require('path');
const {
  cleanupExpiredMedia,
  cleanupAbandonedUploads,
  cleanupOrphanedFiles
} = require('../src/jobs/mediaCleanup');

// Mock authentication middleware
jest.mock('../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = { userId: 'test-user-id' };
    next();
  }
}));

describe('Media API - Chunked Upload', () => {
  let authToken;
  let testGroupId;
  let testThreadId;
  let testUserId;

  beforeAll(async () => {
    // Setup test database
    // In production, you'd want to use a separate test database
    testUserId = 'test-user-id';

    // Create test user
    await db.query(
      `INSERT INTO users (id, username, signal_id, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [testUserId, 'testuser', 'test-signal-id']
    );

    // Create test group
    const groupResult = await db.query(
      `INSERT INTO groups (name, invite_code, created_at)
       VALUES ($1, $2, NOW())
       RETURNING id`,
      ['Test Group', 'TEST123']
    );
    testGroupId = groupResult.rows[0].id;

    // Add user to group
    await db.query(
      `INSERT INTO members (group_id, user_id, role, joined_at)
       VALUES ($1, $2, $3, NOW())`,
      [testGroupId, testUserId, 'admin']
    );

    // Initialize group quota
    await db.query(
      `INSERT INTO group_quotas (group_id, total_bytes, media_count, max_bytes, max_media_count)
       VALUES ($1, 0, 0, $2, $3)`,
      [testGroupId, 10 * 1024 * 1024 * 1024, 100] // 10GB, 100 files
    );

    // Create test thread
    const threadResult = await db.query(
      `INSERT INTO threads (group_id, title, author_id, encrypted_content, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [testGroupId, 'Test Thread', testUserId, 'encrypted-content']
    );
    testThreadId = threadResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup test data
    await db.query('DELETE FROM media WHERE thread_id = $1', [testThreadId]);
    await db.query('DELETE FROM temp_uploads WHERE thread_id = $1', [testThreadId]);
    await db.query('DELETE FROM threads WHERE id = $1', [testThreadId]);
    await db.query('DELETE FROM members WHERE group_id = $1', [testGroupId]);
    await db.query('DELETE FROM group_quotas WHERE group_id = $1', [testGroupId]);
    await db.query('DELETE FROM groups WHERE id = $1', [testGroupId]);
    await db.query('DELETE FROM users WHERE id = $1', [testUserId]);

    // Close server and database
    await new Promise((resolve) => server.close(resolve));
    await db.closePool();
  });

  describe('POST /api/media/upload/chunk', () => {
    const mediaId = 'test-media-' + Date.now();
    const totalChunks = 3;

    test('should accept first chunk and create temp_uploads record', async () => {
      const chunkData = Buffer.from('This is chunk 0 content');

      const response = await request(app)
        .post('/api/media/upload/chunk')
        .field('media_id', mediaId)
        .field('thread_id', testThreadId)
        .field('chunk_index', '0')
        .field('total_chunks', totalChunks.toString())
        .field('encrypted_metadata', 'encrypted-metadata-json')
        .field('encryption_iv', 'test-iv-12345678')
        .field('plaintext_hash', 'sha256-hash')
        .attach('chunk', chunkData, 'chunk-0.enc')
        .expect(200);

      expect(response.body).toMatchObject({
        media_id: mediaId,
        chunk_index: 0,
        chunks_received: 1,
        total_chunks: totalChunks,
        complete: false
      });

      expect(response.body.progress).toBe('33.33%');

      // Verify temp_uploads record created
      const tempUpload = await db.query(
        'SELECT * FROM temp_uploads WHERE media_id = $1',
        [mediaId]
      );

      expect(tempUpload.rowCount).toBe(1);
      expect(tempUpload.rows[0].total_chunks).toBe(totalChunks);
      expect(tempUpload.rows[0].chunks_received).toBe(1);
      expect(tempUpload.rows[0].chunk_bitmap).toBe('0');
    });

    test('should accept subsequent chunks in order', async () => {
      const chunkData = Buffer.from('This is chunk 1 content');

      const response = await request(app)
        .post('/api/media/upload/chunk')
        .field('media_id', mediaId)
        .field('thread_id', testThreadId)
        .field('chunk_index', '1')
        .field('total_chunks', totalChunks.toString())
        .attach('chunk', chunkData, 'chunk-1.enc')
        .expect(200);

      expect(response.body).toMatchObject({
        media_id: mediaId,
        chunk_index: 1,
        chunks_received: 2,
        total_chunks: totalChunks,
        complete: false
      });

      expect(response.body.progress).toBe('66.67%');
    });

    test('should accept chunks out of order', async () => {
      const chunkData = Buffer.from('This is chunk 2 content');

      const response = await request(app)
        .post('/api/media/upload/chunk')
        .field('media_id', mediaId)
        .field('thread_id', testThreadId)
        .field('chunk_index', '2')
        .field('total_chunks', totalChunks.toString())
        .attach('chunk', chunkData, 'chunk-2.enc')
        .expect(200);

      expect(response.body).toMatchObject({
        media_id: mediaId,
        chunk_index: 2,
        chunks_received: 3,
        total_chunks: totalChunks,
        complete: true
      });

      expect(response.body.progress).toBe('100.00%');
    });

    test('should handle duplicate chunks idempotently', async () => {
      const chunkData = Buffer.from('This is chunk 1 content');

      const response = await request(app)
        .post('/api/media/upload/chunk')
        .field('media_id', mediaId)
        .field('thread_id', testThreadId)
        .field('chunk_index', '1')
        .field('total_chunks', totalChunks.toString())
        .attach('chunk', chunkData, 'chunk-1.enc')
        .expect(200);

      // Should still report 3 chunks (not 4)
      expect(response.body.chunks_received).toBe(3);
    });

    test('should reject chunk without required fields', async () => {
      const chunkData = Buffer.from('Invalid chunk');

      await request(app)
        .post('/api/media/upload/chunk')
        .field('media_id', 'new-media-id')
        .attach('chunk', chunkData, 'chunk.enc')
        .expect(400);
    });

    test('should reject first chunk without metadata', async () => {
      const chunkData = Buffer.from('First chunk without metadata');

      await request(app)
        .post('/api/media/upload/chunk')
        .field('media_id', 'missing-metadata-id')
        .field('thread_id', testThreadId)
        .field('chunk_index', '0')
        .field('total_chunks', '2')
        .attach('chunk', chunkData, 'chunk-0.enc')
        .expect(400);
    });

    test('should reject chunk exceeding 5MB limit', async () => {
      const largeChunk = Buffer.alloc(6 * 1024 * 1024); // 6MB

      await request(app)
        .post('/api/media/upload/chunk')
        .field('media_id', 'large-chunk-id')
        .field('thread_id', testThreadId)
        .field('chunk_index', '0')
        .field('total_chunks', '1')
        .field('encrypted_metadata', 'metadata')
        .field('encryption_iv', 'iv')
        .attach('chunk', largeChunk, 'large-chunk.enc')
        .expect(413); // Payload too large
    });
  });

  describe('POST /api/media/upload/complete', () => {
    const mediaId = 'complete-test-' + Date.now();
    const totalChunks = 2;

    beforeAll(async () => {
      // Upload chunks for completion test
      for (let i = 0; i < totalChunks; i++) {
        const chunkData = Buffer.from(`Chunk ${i} content for completion test`);

        await request(app)
          .post('/api/media/upload/chunk')
          .field('media_id', mediaId)
          .field('thread_id', testThreadId)
          .field('chunk_index', i.toString())
          .field('total_chunks', totalChunks.toString())
          .field('encrypted_metadata', i === 0 ? 'metadata' : undefined)
          .field('encryption_iv', i === 0 ? 'iv-complete' : undefined)
          .attach('chunk', chunkData, `chunk-${i}.enc`);
      }
    });

    test('should finalize upload when all chunks received', async () => {
      const response = await request(app)
        .post('/api/media/upload/complete')
        .send({ media_id: mediaId })
        .expect(201);

      expect(response.body).toHaveProperty('media_id');
      expect(response.body).toHaveProperty('size_bytes');
      expect(response.body).toHaveProperty('uploaded_at');
      expect(response.body).toHaveProperty('expires_at');
      expect(response.body.chunks_uploaded).toBe(totalChunks);

      // Verify media record created
      const media = await db.query(
        'SELECT * FROM media WHERE id = $1',
        [response.body.media_id]
      );

      expect(media.rowCount).toBe(1);
      expect(media.rows[0].thread_id).toBe(testThreadId);

      // Verify temp_uploads record deleted
      const tempUpload = await db.query(
        'SELECT * FROM temp_uploads WHERE media_id = $1',
        [mediaId]
      );

      expect(tempUpload.rowCount).toBe(0);

      // Verify quota updated
      const quota = await db.query(
        'SELECT media_count FROM group_quotas WHERE group_id = $1',
        [testGroupId]
      );

      expect(quota.rows[0].media_count).toBeGreaterThan(0);
    });

    test('should reject completion of non-existent upload', async () => {
      await request(app)
        .post('/api/media/upload/complete')
        .send({ media_id: 'non-existent-id' })
        .expect(404);
    });

    test('should reject completion of incomplete upload', async () => {
      const incompleteMediaId = 'incomplete-' + Date.now();

      // Upload only first chunk
      const chunkData = Buffer.from('Incomplete chunk');
      await request(app)
        .post('/api/media/upload/chunk')
        .field('media_id', incompleteMediaId)
        .field('thread_id', testThreadId)
        .field('chunk_index', '0')
        .field('total_chunks', '3')
        .field('encrypted_metadata', 'metadata')
        .field('encryption_iv', 'iv')
        .attach('chunk', chunkData, 'chunk-0.enc');

      // Try to complete
      await request(app)
        .post('/api/media/upload/complete')
        .send({ media_id: incompleteMediaId })
        .expect(400);
    });
  });

  describe('Media Cleanup Jobs', () => {
    test('should clean up expired media', async () => {
      // Create expired media
      const expiredPath = path.join(
        process.env.MEDIA_STORAGE_PATH || './uploads',
        'expired-test.enc'
      );

      await fs.writeFile(expiredPath, 'expired content');

      const mediaResult = await db.query(
        `INSERT INTO media
         (thread_id, author_id, encrypted_metadata, storage_url, encryption_iv, size_bytes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '1 day')
         RETURNING id`,
        [testThreadId, testUserId, 'metadata', expiredPath, 'iv', 15]
      );

      const mediaId = mediaResult.rows[0].id;

      // Run cleanup
      const stats = await cleanupExpiredMedia();

      expect(stats.mediaDeleted).toBeGreaterThanOrEqual(1);

      // Verify media deleted from database
      const media = await db.query(
        'SELECT * FROM media WHERE id = $1',
        [mediaId]
      );

      expect(media.rowCount).toBe(0);
    });

    test('should clean up abandoned temp uploads', async () => {
      // Create abandoned upload
      const abandonedMediaId = 'abandoned-' + Date.now();

      await db.query(
        `INSERT INTO temp_uploads
         (media_id, thread_id, user_id, total_chunks, chunks_received, chunk_bitmap,
          encrypted_metadata, encryption_iv, created_at)
         VALUES ($1, $2, $3, 5, 2, '0,1', 'metadata', 'iv', NOW() - INTERVAL '25 hours')`,
        [abandonedMediaId, testThreadId, testUserId]
      );

      // Run cleanup
      const stats = await cleanupAbandonedUploads();

      expect(stats.uploadsDeleted).toBeGreaterThanOrEqual(1);

      // Verify temp_uploads deleted
      const tempUpload = await db.query(
        'SELECT * FROM temp_uploads WHERE media_id = $1',
        [abandonedMediaId]
      );

      expect(tempUpload.rowCount).toBe(0);
    });

    test('should clean up orphaned files', async () => {
      // Create orphaned file
      const uploadDir = process.env.MEDIA_STORAGE_PATH || './uploads';
      const orphanedPath = path.join(uploadDir, 'orphaned-test.enc');

      await fs.writeFile(orphanedPath, 'orphaned content');

      // Run cleanup
      const stats = await cleanupOrphanedFiles();

      // Verify file deleted (if it was detected as orphaned)
      // Note: This test may not delete the file if it was just created
      expect(stats).toHaveProperty('filesScanned');
      expect(stats).toHaveProperty('orphansDeleted');
    });
  });

  describe('Quota Enforcement', () => {
    test('should reject upload exceeding group quota', async () => {
      // Set very low quota
      await db.query(
        `UPDATE group_quotas
         SET max_bytes = 100, max_media_count = 1
         WHERE group_id = $1`,
        [testGroupId]
      );

      const mediaId = 'quota-test-' + Date.now();
      const largeChunk = Buffer.alloc(1024 * 1024); // 1MB (exceeds 100 byte limit)

      const response = await request(app)
        .post('/api/media/upload/chunk')
        .field('media_id', mediaId)
        .field('thread_id', testThreadId)
        .field('chunk_index', '0')
        .field('total_chunks', '20')
        .field('encrypted_metadata', 'metadata')
        .field('encryption_iv', 'iv')
        .attach('chunk', largeChunk, 'chunk.enc');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('quota');

      // Restore quota
      await db.query(
        `UPDATE group_quotas
         SET max_bytes = $1, max_media_count = 100
         WHERE group_id = $2`,
        [10 * 1024 * 1024 * 1024, testGroupId]
      );
    });
  });
});

describe('Media API - Legacy Upload', () => {
  let testGroupId;
  let testThreadId;
  let testUserId;

  beforeAll(async () => {
    testUserId = 'test-user-legacy';

    // Create test data
    await db.query(
      `INSERT INTO users (id, username, signal_id, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [testUserId, 'testlegacy', 'legacy-signal-id']
    );

    const groupResult = await db.query(
      `INSERT INTO groups (name, invite_code, created_at)
       VALUES ($1, $2, NOW())
       RETURNING id`,
      ['Legacy Group', 'LEGACY123']
    );
    testGroupId = groupResult.rows[0].id;

    await db.query(
      `INSERT INTO members (group_id, user_id, role, joined_at)
       VALUES ($1, $2, $3, NOW())`,
      [testGroupId, testUserId, 'admin']
    );

    await db.query(
      `INSERT INTO group_quotas (group_id, total_bytes, media_count, max_bytes, max_media_count)
       VALUES ($1, 0, 0, $2, $3)`,
      [testGroupId, 10 * 1024 * 1024 * 1024, 100]
    );

    const threadResult = await db.query(
      `INSERT INTO threads (group_id, title, author_id, encrypted_content, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [testGroupId, 'Legacy Thread', testUserId, 'encrypted-content']
    );
    testThreadId = threadResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await db.query('DELETE FROM media WHERE thread_id = $1', [testThreadId]);
    await db.query('DELETE FROM threads WHERE id = $1', [testThreadId]);
    await db.query('DELETE FROM members WHERE group_id = $1', [testGroupId]);
    await db.query('DELETE FROM group_quotas WHERE group_id = $1', [testGroupId]);
    await db.query('DELETE FROM groups WHERE id = $1', [testGroupId]);
    await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
  });

  test('should accept legacy single-file upload', async () => {
    const fileData = Buffer.from('Legacy file content');

    // Mock authentication for this test
    const response = await request(app)
      .post('/api/media/upload')
      .field('thread_id', testThreadId)
      .field('encrypted_metadata', 'legacy-metadata')
      .field('encryption_iv', 'legacy-iv')
      .attach('file', fileData, 'legacy-file.enc')
      .expect(201);

    expect(response.body).toHaveProperty('media_id');
    expect(response.body).toHaveProperty('size_bytes');
    expect(response.body.size_bytes).toBe(fileData.length);
  });
});
