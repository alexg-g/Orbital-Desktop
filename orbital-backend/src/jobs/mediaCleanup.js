/**
 * Media Cleanup Cron Job
 *
 * Runs hourly to:
 * 1. Delete expired media files (7-day retention)
 * 2. Update group quotas
 * 3. Clean up abandoned temp uploads (>24 hours old)
 * 4. Clean up orphaned files
 */

const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Delete expired media files
 * @returns {Promise<Object>} Cleanup stats
 */
async function cleanupExpiredMedia() {
  const client = await db.getClient();
  const stats = {
    mediaDeleted: 0,
    filesDeleted: 0,
    bytesFreed: 0,
    errors: 0
  };

  try {
    await client.query('BEGIN');

    // Find expired media
    const expiredMedia = await client.query(
      `SELECT m.id, m.storage_url, m.size_bytes, m.thread_id, t.group_id
       FROM media m
       INNER JOIN threads t ON t.id = m.thread_id
       WHERE m.expires_at < NOW()
       ORDER BY m.expires_at ASC`,
      []
    );

    if (expiredMedia.rowCount === 0) {
      await client.query('COMMIT');
      logger.info('No expired media to clean up');
      return stats;
    }

    logger.info(`Found ${expiredMedia.rowCount} expired media files to delete`);

    // Process each expired media
    for (const media of expiredMedia.rows) {
      try {
        // Delete file from disk
        try {
          await fs.unlink(media.storage_url);
          stats.filesDeleted++;
          stats.bytesFreed += parseInt(media.size_bytes, 10);
        } catch (fileError) {
          if (fileError.code !== 'ENOENT') {
            logger.error('Failed to delete media file', {
              mediaId: media.id,
              path: media.storage_url,
              error: fileError.message
            });
            stats.errors++;
          }
          // Continue even if file doesn't exist
        }

        // Update group quota (decrement)
        await client.query(
          `UPDATE group_quotas
           SET total_bytes = GREATEST(0, total_bytes - $1),
               media_count = GREATEST(0, media_count - 1),
               updated_at = NOW()
           WHERE group_id = $2`,
          [media.size_bytes, media.group_id]
        );

        // Delete media record
        await client.query(
          'DELETE FROM media WHERE id = $1',
          [media.id]
        );

        stats.mediaDeleted++;

        logger.debug('Deleted expired media', {
          mediaId: media.id,
          sizeBytes: media.size_bytes,
          groupId: media.group_id
        });
      } catch (error) {
        logger.error('Failed to clean up media record', {
          mediaId: media.id,
          error: error.message
        });
        stats.errors++;
        // Continue with next media
      }
    }

    await client.query('COMMIT');

    logger.info('Expired media cleanup complete', stats);
    return stats;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Expired media cleanup failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clean up abandoned temporary uploads (>24 hours old)
 * @returns {Promise<Object>} Cleanup stats
 */
async function cleanupAbandonedUploads() {
  const client = await db.getClient();
  const stats = {
    uploadsDeleted: 0,
    chunksDeleted: 0,
    errors: 0
  };

  try {
    await client.query('BEGIN');

    // Find abandoned uploads (created > 24 hours ago)
    const abandonedUploads = await client.query(
      `SELECT media_id, chunks_received, total_chunks
       FROM temp_uploads
       WHERE created_at < NOW() - INTERVAL '24 hours'
       ORDER BY created_at ASC`,
      []
    );

    if (abandonedUploads.rowCount === 0) {
      await client.query('COMMIT');
      logger.info('No abandoned uploads to clean up');
      return stats;
    }

    logger.info(`Found ${abandonedUploads.rowCount} abandoned uploads to delete`);

    const uploadDir = process.env.MEDIA_STORAGE_PATH || './uploads';

    // Process each abandoned upload
    for (const upload of abandonedUploads.rows) {
      try {
        // Delete temp chunks directory
        const tempDir = path.join(uploadDir, 'temp', upload.media_id);

        try {
          await fs.rm(tempDir, { recursive: true, force: true });
          stats.chunksDeleted += upload.chunks_received;
        } catch (dirError) {
          if (dirError.code !== 'ENOENT') {
            logger.error('Failed to delete temp upload directory', {
              mediaId: upload.media_id,
              tempDir,
              error: dirError.message
            });
            stats.errors++;
          }
        }

        // Delete temp_uploads record
        await client.query(
          'DELETE FROM temp_uploads WHERE media_id = $1',
          [upload.media_id]
        );

        stats.uploadsDeleted++;

        logger.debug('Deleted abandoned upload', {
          mediaId: upload.media_id,
          chunksReceived: upload.chunks_received,
          totalChunks: upload.total_chunks
        });
      } catch (error) {
        logger.error('Failed to clean up abandoned upload', {
          mediaId: upload.media_id,
          error: error.message
        });
        stats.errors++;
        // Continue with next upload
      }
    }

    await client.query('COMMIT');

    logger.info('Abandoned uploads cleanup complete', stats);
    return stats;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Abandoned uploads cleanup failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clean up orphaned files (files on disk not in database)
 * @returns {Promise<Object>} Cleanup stats
 */
async function cleanupOrphanedFiles() {
  const stats = {
    filesScanned: 0,
    orphansDeleted: 0,
    bytesFreed: 0,
    errors: 0
  };

  try {
    const uploadDir = process.env.MEDIA_STORAGE_PATH || './uploads';

    // Get all .enc files from uploads directory
    const files = await fs.readdir(uploadDir);
    const encFiles = files.filter(f => f.endsWith('.enc'));

    stats.filesScanned = encFiles.length;

    if (encFiles.length === 0) {
      logger.info('No files to scan for orphans');
      return stats;
    }

    // Get all storage URLs from database
    const mediaFiles = await db.query(
      'SELECT storage_url FROM media',
      []
    );

    const validPaths = new Set(
      mediaFiles.rows.map(row => row.storage_url)
    );

    // Check each file
    for (const file of encFiles) {
      const filePath = path.join(uploadDir, file);

      if (!validPaths.has(filePath)) {
        try {
          const fileStat = await fs.stat(filePath);
          await fs.unlink(filePath);
          stats.orphansDeleted++;
          stats.bytesFreed += fileStat.size;

          logger.debug('Deleted orphaned file', {
            path: filePath,
            sizeBytes: fileStat.size
          });
        } catch (error) {
          logger.error('Failed to delete orphaned file', {
            path: filePath,
            error: error.message
          });
          stats.errors++;
        }
      }
    }

    logger.info('Orphaned files cleanup complete', stats);
    return stats;
  } catch (error) {
    logger.error('Orphaned files cleanup failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Run all cleanup tasks
 * @returns {Promise<Object>} Combined stats
 */
async function runMediaCleanup() {
  logger.info('Starting media cleanup job...');

  const startTime = Date.now();

  try {
    // Run all cleanup tasks
    const [expiredStats, abandonedStats, orphanedStats] = await Promise.all([
      cleanupExpiredMedia(),
      cleanupAbandonedUploads(),
      cleanupOrphanedFiles()
    ]);

    const duration = Date.now() - startTime;

    const totalStats = {
      duration: `${duration}ms`,
      expired: expiredStats,
      abandoned: abandonedStats,
      orphaned: orphanedStats,
      totalBytesFreed: expiredStats.bytesFreed + orphanedStats.bytesFreed,
      totalErrors: expiredStats.errors + abandonedStats.errors + orphanedStats.errors
    };

    logger.info('Media cleanup job complete', totalStats);

    return totalStats;
  } catch (error) {
    logger.error('Media cleanup job failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Schedule media cleanup to run hourly
 * @param {Object} scheduler - Node-cron or similar scheduler
 * @returns {Object} Scheduled job
 */
function scheduleMediaCleanup() {
  // Run immediately on startup (after 10 seconds delay)
  setTimeout(() => {
    runMediaCleanup().catch((error) => {
      logger.error('Initial media cleanup failed', {
        error: error.message
      });
    });
  }, 10000);

  // Run every hour
  const intervalMs = 60 * 60 * 1000; // 1 hour

  const intervalId = setInterval(() => {
    runMediaCleanup().catch((error) => {
      logger.error('Scheduled media cleanup failed', {
        error: error.message
      });
    });
  }, intervalMs);

  logger.info('Media cleanup job scheduled (runs hourly)');

  return {
    stop: () => {
      clearInterval(intervalId);
      logger.info('Media cleanup job stopped');
    }
  };
}

module.exports = {
  runMediaCleanup,
  scheduleMediaCleanup,
  cleanupExpiredMedia,
  cleanupAbandonedUploads,
  cleanupOrphanedFiles
};
