/**
 * Quota Service
 *
 * Centralized quota management for group storage.
 * Enforces 10GB storage and 100 file limits per group.
 */

const db = require('../config/database');
const logger = require('../utils/logger');

// Constants
const MAX_STORAGE_BYTES = 10 * 1024 * 1024 * 1024; // 10GB
const MAX_FILE_COUNT = 100;
const WARNING_THRESHOLD_PERCENT = 80; // 80%

/**
 * Check if group has quota available for upload
 * @param {string} groupId - Group UUID
 * @param {number} fileSize - Size of file to upload in bytes
 * @param {Object} client - Optional database client for transactions
 * @returns {Promise<Object>} - { allowed: boolean, currentUsage: {...}, reason?: string }
 */
async function checkQuotaAvailable(groupId, fileSize, client = null) {
  const dbClient = client || db;

  // Validate inputs
  if (!groupId) {
    throw new Error('groupId is required');
  }

  if (typeof fileSize !== 'number' || fileSize <= 0) {
    throw new Error('fileSize must be a positive number');
  }

  try {
    // Fetch current quota
    const result = await dbClient.query(
      `SELECT total_bytes, media_count, max_bytes, max_media_count
       FROM group_quotas
       WHERE group_id = $1`,
      [groupId]
    );

    let quota;

    if (result.rowCount === 0) {
      // Initialize quota if missing (shouldn't happen, but defensive)
      logger.warn('Group quota not found, initializing', { groupId });

      await dbClient.query(
        `INSERT INTO group_quotas (group_id, total_bytes, media_count, max_bytes, max_media_count)
         VALUES ($1, 0, 0, $2, $3)
         ON CONFLICT (group_id) DO NOTHING`,
        [groupId, MAX_STORAGE_BYTES, MAX_FILE_COUNT]
      );

      quota = {
        total_bytes: 0,
        media_count: 0,
        max_bytes: MAX_STORAGE_BYTES,
        max_media_count: MAX_FILE_COUNT
      };
    } else {
      quota = result.rows[0];
    }

    const currentBytes = parseInt(quota.total_bytes, 10);
    const currentCount = parseInt(quota.media_count, 10);
    const maxBytes = parseInt(quota.max_bytes, 10);
    const maxCount = parseInt(quota.max_media_count, 10);

    // Calculate projected totals
    const projectedBytes = currentBytes + fileSize;
    const projectedCount = currentCount + 1;

    // Check storage quota
    if (projectedBytes > maxBytes) {
      const availableBytes = maxBytes - currentBytes;
      const availableMB = (availableBytes / (1024 * 1024)).toFixed(2);
      const neededMB = (fileSize / (1024 * 1024)).toFixed(2);

      return {
        allowed: false,
        currentUsage: {
          storage_bytes: currentBytes,
          max_bytes: maxBytes,
          file_count: currentCount,
          max_files: maxCount,
          storage_percent: Math.round((currentBytes / maxBytes) * 100),
          files_percent: Math.round((currentCount / maxCount) * 100)
        },
        reason: `Storage quota exceeded. Available: ${availableMB}MB, Required: ${neededMB}MB. Delete old media to free up space.`
      };
    }

    // Check file count quota
    if (projectedCount > maxCount) {
      return {
        allowed: false,
        currentUsage: {
          storage_bytes: currentBytes,
          max_bytes: maxBytes,
          file_count: currentCount,
          max_files: maxCount,
          storage_percent: Math.round((currentBytes / maxBytes) * 100),
          files_percent: Math.round((currentCount / maxCount) * 100)
        },
        reason: `File count quota exceeded. Current: ${currentCount}/${maxCount} files. Delete old media to add more.`
      };
    }

    // Quota check passed
    return {
      allowed: true,
      currentUsage: {
        storage_bytes: currentBytes,
        max_bytes: maxBytes,
        file_count: currentCount,
        max_files: maxCount,
        storage_percent: Math.round((currentBytes / maxBytes) * 100),
        files_percent: Math.round((currentCount / maxCount) * 100),
        is_warning: (currentBytes / maxBytes) >= (WARNING_THRESHOLD_PERCENT / 100) ||
                    (currentCount / maxCount) >= (WARNING_THRESHOLD_PERCENT / 100)
      }
    };
  } catch (error) {
    logger.error('Failed to check quota availability', {
      groupId,
      fileSize,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get quota information for a group
 * @param {string} groupId - Group UUID
 * @returns {Promise<Object>} - Quota information with usage percentages
 */
async function getQuotaInfo(groupId) {
  if (!groupId) {
    throw new Error('groupId is required');
  }

  try {
    const result = await db.query(
      `SELECT total_bytes, media_count, max_bytes, max_media_count, updated_at
       FROM group_quotas
       WHERE group_id = $1`,
      [groupId]
    );

    if (result.rowCount === 0) {
      // Initialize quota if missing
      await db.query(
        `INSERT INTO group_quotas (group_id, total_bytes, media_count, max_bytes, max_media_count)
         VALUES ($1, 0, 0, $2, $3)`,
        [groupId, MAX_STORAGE_BYTES, MAX_FILE_COUNT]
      );

      return {
        group_id: groupId,
        storage: {
          used: 0,
          limit: MAX_STORAGE_BYTES,
          percentage: 0,
          warning: false
        },
        files: {
          count: 0,
          limit: MAX_FILE_COUNT,
          percentage: 0,
          warning: false
        },
        last_updated: new Date().toISOString()
      };
    }

    const quota = result.rows[0];
    const totalBytes = parseInt(quota.total_bytes, 10);
    const mediaCount = parseInt(quota.media_count, 10);
    const maxBytes = parseInt(quota.max_bytes, 10);
    const maxMediaCount = parseInt(quota.max_media_count, 10);

    const storagePercent = (totalBytes / maxBytes) * 100;
    const filesPercent = (mediaCount / maxMediaCount) * 100;

    return {
      group_id: groupId,
      storage: {
        used: totalBytes,
        limit: maxBytes,
        percentage: Math.round(storagePercent * 100) / 100, // 2 decimal places
        warning: storagePercent >= WARNING_THRESHOLD_PERCENT
      },
      files: {
        count: mediaCount,
        limit: maxMediaCount,
        percentage: Math.round(filesPercent * 100) / 100, // 2 decimal places
        warning: filesPercent >= WARNING_THRESHOLD_PERCENT
      },
      last_updated: quota.updated_at
    };
  } catch (error) {
    logger.error('Failed to get quota info', {
      groupId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Increment quota after successful upload
 * @param {string} groupId - Group UUID
 * @param {number} fileSize - Size of uploaded file in bytes
 * @param {Object} client - Optional database client for transactions
 * @returns {Promise<Object>} - Updated quota info
 */
async function incrementQuota(groupId, fileSize, client = null) {
  if (!groupId) {
    throw new Error('groupId is required');
  }

  if (typeof fileSize !== 'number' || fileSize <= 0) {
    throw new Error('fileSize must be a positive number');
  }

  const dbClient = client || db;

  try {
    const result = await dbClient.query(
      `UPDATE group_quotas
       SET total_bytes = total_bytes + $1,
           media_count = media_count + 1,
           updated_at = NOW()
       WHERE group_id = $2
       RETURNING total_bytes, media_count, max_bytes, max_media_count`,
      [fileSize, groupId]
    );

    if (result.rowCount === 0) {
      throw new Error('Failed to increment quota: group not found');
    }

    const quota = result.rows[0];

    logger.info('Quota incremented', {
      groupId,
      fileSize,
      newTotal: quota.total_bytes,
      newCount: quota.media_count
    });

    return {
      total_bytes: parseInt(quota.total_bytes, 10),
      media_count: parseInt(quota.media_count, 10),
      max_bytes: parseInt(quota.max_bytes, 10),
      max_media_count: parseInt(quota.max_media_count, 10)
    };
  } catch (error) {
    logger.error('Failed to increment quota', {
      groupId,
      fileSize,
      error: error.message
    });
    throw error;
  }
}

/**
 * Decrement quota after file deletion
 * @param {string} groupId - Group UUID
 * @param {number} fileSize - Size of deleted file in bytes
 * @param {Object} client - Optional database client for transactions
 * @returns {Promise<Object>} - Updated quota info
 */
async function decrementQuota(groupId, fileSize, client = null) {
  if (!groupId) {
    throw new Error('groupId is required');
  }

  if (typeof fileSize !== 'number' || fileSize <= 0) {
    throw new Error('fileSize must be a positive number');
  }

  const dbClient = client || db;

  try {
    const result = await dbClient.query(
      `UPDATE group_quotas
       SET total_bytes = GREATEST(0, total_bytes - $1),
           media_count = GREATEST(0, media_count - 1),
           updated_at = NOW()
       WHERE group_id = $2
       RETURNING total_bytes, media_count, max_bytes, max_media_count`,
      [fileSize, groupId]
    );

    if (result.rowCount === 0) {
      throw new Error('Failed to decrement quota: group not found');
    }

    const quota = result.rows[0];

    logger.info('Quota decremented', {
      groupId,
      fileSize,
      newTotal: quota.total_bytes,
      newCount: quota.media_count
    });

    return {
      total_bytes: parseInt(quota.total_bytes, 10),
      media_count: parseInt(quota.media_count, 10),
      max_bytes: parseInt(quota.max_bytes, 10),
      max_media_count: parseInt(quota.max_media_count, 10)
    };
  } catch (error) {
    logger.error('Failed to decrement quota', {
      groupId,
      fileSize,
      error: error.message
    });
    throw error;
  }
}

/**
 * Initialize quota for a new group
 * @param {string} groupId - Group UUID
 * @param {Object} client - Optional database client for transactions
 * @returns {Promise<Object>} - Initial quota info
 */
async function initializeQuota(groupId, client = null) {
  if (!groupId) {
    throw new Error('groupId is required');
  }

  const dbClient = client || db;

  try {
    const result = await dbClient.query(
      `INSERT INTO group_quotas (group_id, total_bytes, media_count, max_bytes, max_media_count)
       VALUES ($1, 0, 0, $2, $3)
       ON CONFLICT (group_id) DO NOTHING
       RETURNING total_bytes, media_count, max_bytes, max_media_count`,
      [groupId, MAX_STORAGE_BYTES, MAX_FILE_COUNT]
    );

    logger.info('Quota initialized for group', { groupId });

    if (result.rowCount > 0) {
      return {
        total_bytes: 0,
        media_count: 0,
        max_bytes: MAX_STORAGE_BYTES,
        max_media_count: MAX_FILE_COUNT
      };
    }

    // Already exists, fetch current
    return getQuotaInfo(groupId);
  } catch (error) {
    logger.error('Failed to initialize quota', {
      groupId,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  checkQuotaAvailable,
  getQuotaInfo,
  incrementQuota,
  decrementQuota,
  initializeQuota,
  MAX_STORAGE_BYTES,
  MAX_FILE_COUNT,
  WARNING_THRESHOLD_PERCENT
};
