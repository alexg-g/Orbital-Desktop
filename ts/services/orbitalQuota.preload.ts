// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2025 Orbital

/**
 * Orbital Quota Service
 *
 * Handles quota checking and management for Orbital groups.
 *
 * Features:
 * - Check group quota status before uploads
 * - Get quota usage details
 * - Calculate if upload would exceed quota
 * - Provide user-friendly error messages
 *
 * Quota Limits (per group):
 * - Storage: 10GB
 * - Files: 100
 * - Warning threshold: 80%
 */

import * as https from 'node:https';
import * as http from 'node:http';
import { URL } from 'node:url';
import { createLogger } from '../logging/log.std.js';
import * as Errors from '../types/errors.std.js';
import { handleOrbitalAPIError } from './orbitalErrorHandler.preload.js';

const log = createLogger('OrbitalQuota');

/**
 * Orbital API base URL
 */
const ORBITAL_API_URL = process.env.ORBITAL_API_URL || 'https://api.orbitl.org';

/**
 * Quota limits
 */
export const QUOTA_LIMITS = {
  STORAGE_BYTES: 10 * 1024 * 1024 * 1024, // 10GB
  MAX_FILES: 100,
  WARNING_THRESHOLD: 0.8, // 80%
};

/**
 * Quota information from server
 */
export type QuotaInfo = {
  groupId: string;
  storageUsed: number; // bytes
  storageLimit: number; // bytes
  filesUsed: number;
  filesLimit: number;
  storagePercentUsed: number; // 0-100
  filesPercentUsed: number; // 0-100
  isNearLimit: boolean; // true if >= 80%
  canUpload: boolean; // false if at limit
};

/**
 * Check upload result
 */
export type UploadCheckResult = {
  allowed: boolean;
  reason?: string;
  quotaInfo: QuotaInfo;
};

/**
 * Get quota information for a group
 *
 * @param groupId Group ID
 * @returns Quota information
 * @throws Error if request fails
 */
export async function getQuotaInfo(groupId: string): Promise<QuotaInfo> {
  const logId = `getQuotaInfo(${groupId})`;

  try {
    // Get JWT token for authentication
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/groups/${groupId}/quota`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    if (response.status !== 200) {
      throw new Error(
        `Failed to get quota: ${response.status} ${response.statusText}: ${response.data}`
      );
    }

    const data = JSON.parse(response.data);

    const quotaInfo: QuotaInfo = {
      groupId,
      storageUsed: data.storage_used || 0,
      storageLimit: data.storage_limit || QUOTA_LIMITS.STORAGE_BYTES,
      filesUsed: data.files_used || 0,
      filesLimit: data.files_limit || QUOTA_LIMITS.MAX_FILES,
      storagePercentUsed: data.storage_percent_used || 0,
      filesPercentUsed: data.files_percent_used || 0,
      isNearLimit:
        data.storage_percent_used >= QUOTA_LIMITS.WARNING_THRESHOLD * 100 ||
        data.files_percent_used >= QUOTA_LIMITS.WARNING_THRESHOLD * 100,
      canUpload: data.can_upload !== false,
    };

    log.info(
      `${logId}: Storage ${quotaInfo.storagePercentUsed.toFixed(
        1
      )}%, Files ${quotaInfo.filesPercentUsed.toFixed(1)}%`
    );

    return quotaInfo;
  } catch (error) {
    log.error(`${logId}: Failed to get quota`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Check if an upload would be allowed
 *
 * @param groupId Group ID
 * @param fileSizeBytes Size of file to upload
 * @returns Check result with reason if not allowed
 */
export async function checkUploadAllowed(
  groupId: string,
  fileSizeBytes: number
): Promise<UploadCheckResult> {
  const logId = `checkUploadAllowed(${groupId}, ${fileSizeBytes} bytes)`;

  try {
    const quotaInfo = await getQuotaInfo(groupId);

    // Check if adding one more file would exceed file limit
    if (quotaInfo.filesUsed >= quotaInfo.filesLimit) {
      return {
        allowed: false,
        reason: `File limit reached (${quotaInfo.filesUsed}/${quotaInfo.filesLimit} files). Delete old media to free space.`,
        quotaInfo,
      };
    }

    // Check if adding this file would exceed storage limit
    const newStorageUsed = quotaInfo.storageUsed + fileSizeBytes;
    if (newStorageUsed > quotaInfo.storageLimit) {
      const available = quotaInfo.storageLimit - quotaInfo.storageUsed;
      return {
        allowed: false,
        reason: `Storage quota exceeded. Available: ${formatBytes(
          available
        )}, Required: ${formatBytes(
          fileSizeBytes
        )}. Delete old media to free space.`,
        quotaInfo,
      };
    }

    // Upload allowed
    log.info(`${logId}: Upload allowed`);
    return {
      allowed: true,
      quotaInfo,
    };
  } catch (error) {
    log.error(`${logId}: Failed to check upload`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Delete media to free quota
 *
 * @param mediaId Media ID to delete
 * @returns Updated quota info
 */
export async function deleteMedia(mediaId: string): Promise<void> {
  const logId = `deleteMedia(${mediaId})`;

  try {
    // Get JWT token for authentication
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/media/${mediaId}`,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    if (response.status !== 200) {
      throw new Error(
        `Failed to delete media: ${response.status} ${response.statusText}: ${response.data}`
      );
    }

    log.info(`${logId}: Media deleted successfully`);
  } catch (error) {
    log.error(`${logId}: Failed to delete media`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Helper to make HTTP/HTTPS requests using Node.js built-in modules
 */
function makeRequest(options: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: Buffer;
  signal?: AbortSignal;
}): Promise<{ status: number; statusText: string; data: string }> {
  return new Promise((resolve, reject) => {
    const { url, method, headers, body, signal } = options;

    // Parse URL to determine protocol
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: headers || {},
    };

    const request = httpModule.request(requestOptions, response => {
      let responseData = '';

      response.on('data', chunk => {
        responseData += chunk.toString();
      });

      response.on('end', () => {
        signal?.removeEventListener('abort', abortHandler);
        resolve({
          status: response.statusCode || 0,
          statusText: response.statusMessage || '',
          data: responseData,
        });
      });

      response.on('error', error => {
        signal?.removeEventListener('abort', abortHandler);
        reject(error);
      });
    });

    // Handle abort signal
    const abortHandler = () => {
      request.destroy();
      reject(new Error('Request aborted'));
    };
    signal?.addEventListener('abort', abortHandler);

    request.on('error', error => {
      signal?.removeEventListener('abort', abortHandler);
      reject(error);
    });

    // Write body if present
    if (body) {
      request.write(body);
    }

    request.end();
  });
}
