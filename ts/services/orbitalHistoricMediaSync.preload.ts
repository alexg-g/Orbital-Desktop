// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Historic Media Sync Service
 *
 * Issue #79: Async peer-to-peer recovery for expired media.
 *
 * This service handles the frontend logic for requesting and fulfilling
 * historic media sync requests. When media expires from the server (7 days),
 * users can request it from other orbit members who have it locally.
 *
 * Flow (Requestor):
 * 1. User creates sync request via createSyncRequest()
 * 2. Server creates request + sync items for expired media
 * 3. Other members upload their copies via WebSocket notification
 * 4. Requestor downloads ready items via downloadSyncItem()
 *
 * Flow (Provider):
 * 1. Receive WebSocket notification of new sync request
 * 2. Call getItemsNeededForRequest() to see what we can provide
 * 3. Upload media via uploadItemForSync()
 *
 * Security:
 * - Keys already backfilled via orbitalMediaKeysBackfill.preload.ts
 * - Only encrypted blobs uploaded to server
 * - Requestor decrypts with keys from SQLCipher
 */

import { createLogger } from '../logging/log.std.js';
import * as Errors from '../types/errors.std.js';
import { DataReader } from '../sql/Client.preload.js';
import type {
  MediaSyncRequest,
  MediaSyncTimeRange,
  SyncItemNeeded,
  SyncItemReady,
  CreateSyncRequestResponse,
  ListSyncRequestsResponse,
  PendingItemsResponse,
} from '../types/OrbitalMediaSync.std.js';

const log = createLogger('OrbitalHistoricMediaSync');

// API base URL (set by esbuild based on --prod flag)
declare const ORBITAL_API_URL: string | undefined;
const API_BASE = typeof ORBITAL_API_URL !== 'undefined' ? ORBITAL_API_URL : 'http://localhost:3000';

/**
 * Get auth token for API requests
 */
async function getAuthToken(): Promise<string> {
  // Get the session token from storage
  const Storage = await import('../textsecure/Storage.preload.js');
  const session = Storage.get('orbital_session');
  if (!session || typeof session !== 'object' || !('token' in session)) {
    throw new Error('No session token available');
  }
  return (session as { token: string }).token;
}

// ============================================================================
// Requestor Functions
// ============================================================================

/**
 * Create a new historic media sync request
 *
 * Creates a request on the server for expired media from a specific time range.
 * Other orbit members will be notified and can upload their copies.
 *
 * @param params Request parameters
 * @returns The created sync request
 */
export async function createSyncRequest(params: {
  groupId: string;
  timeRange: MediaSyncTimeRange;
  maxBytes?: number;
}): Promise<MediaSyncRequest> {
  const { groupId, timeRange, maxBytes = 10737418240 } = params; // 10GB default
  const logId = `createSyncRequest(${groupId}, ${timeRange})`;

  try {
    log.info(`${logId}: Creating sync request`);

    const token = await getAuthToken();

    const response = await fetch(`${API_BASE}/api/media-sync/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        group_id: groupId,
        time_range: timeRange,
        max_bytes: maxBytes,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const data: CreateSyncRequestResponse = await response.json();

    log.info(`${logId}: Sync request created`, {
      requestId: data.request_id,
      itemsCount: data.items_count,
      totalBytes: data.total_bytes,
      membersNotified: data.members_notified,
    });

    // Save to local SQLCipher for tracking
    await saveLocalSyncRequest({
      id: data.request_id,
      groupId,
      sinceDate: calculateSinceDate(timeRange),
      maxBytes,
      bytesDownloaded: 0,
      status: 'pending',
      itemsTotal: data.items_count,
      itemsCompleted: 0,
      itemsReady: 0,
      createdAt: new Date(data.created_at).getTime(),
      expiresAt: new Date(data.expires_at).getTime(),
    });

    return {
      id: data.request_id,
      groupId,
      requestorId: '', // Filled by server
      sinceDate: calculateSinceDate(timeRange),
      maxBytes,
      bytesUploaded: 0,
      bytesDownloaded: 0,
      status: 'pending',
      itemsTotal: data.items_count,
      itemsCompleted: 0,
      itemsReady: 0,
      createdAt: new Date(data.created_at).getTime(),
      expiresAt: new Date(data.expires_at).getTime(),
    };
  } catch (error) {
    log.error(`${logId}: Failed to create sync request`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Get all active sync requests for the current user
 */
export async function getActiveSyncRequests(): Promise<MediaSyncRequest[]> {
  const logId = 'getActiveSyncRequests';

  try {
    const token = await getAuthToken();

    const response = await fetch(`${API_BASE}/api/media-sync/requests`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const data: ListSyncRequestsResponse = await response.json();

    return data.requests.map(r => ({
      id: r.id,
      groupId: r.group_id,
      requestorId: '', // Not returned in list
      sinceDate: new Date(r.since_date).getTime(),
      maxBytes: r.max_bytes,
      bytesUploaded: r.bytes_uploaded,
      bytesDownloaded: r.bytes_downloaded,
      status: r.status,
      itemsTotal: r.items_total,
      itemsCompleted: r.items_completed,
      itemsReady: r.items_ready,
      createdAt: new Date(r.created_at).getTime(),
      expiresAt: new Date(r.expires_at).getTime(),
      completedAt: r.completed_at ? new Date(r.completed_at).getTime() : undefined,
    }));
  } catch (error) {
    log.error(`${logId}: Failed to get sync requests`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Get items ready for download in a sync request
 */
export async function getReadyItems(requestId: string): Promise<SyncItemReady[]> {
  const logId = `getReadyItems(${requestId})`;

  try {
    const token = await getAuthToken();

    const response = await fetch(`${API_BASE}/api/media-sync/ready-items/${requestId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const data = await response.json();

    return data.items.map((item: any) => ({
      itemId: item.item_id,
      requestId: item.request_id,
      mediaId: item.media_id,
      groupId: item.group_id,
      sizeBytes: item.size_bytes,
      uploadedAt: item.uploaded_at,
    }));
  } catch (error) {
    log.error(`${logId}: Failed to get ready items`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Download a sync item (as requestor)
 *
 * Downloads an encrypted blob from the server and decrypts it using
 * the keys we already have in SQLCipher (from key backfill).
 *
 * @param params Download parameters
 */
export async function downloadSyncItem(params: {
  itemId: string;
  mediaId: string;
  getAbsoluteAttachmentPath: (relativePath: string) => string;
}): Promise<void> {
  const { itemId, mediaId, getAbsoluteAttachmentPath } = params;
  const logId = `downloadSyncItem(${itemId}, ${mediaId})`;

  try {
    log.info(`${logId}: Starting download`);

    // Get the media record with keys from SQLCipher
    const media = await DataReader.getOrbitalMedia(mediaId);
    if (!media) {
      throw new Error(`Media not found in local database: ${mediaId}`);
    }

    if (media.downloaded === 1) {
      log.info(`${logId}: Media already downloaded, skipping`);
      return;
    }

    const token = await getAuthToken();

    // Download encrypted blob
    const response = await fetch(`${API_BASE}/api/media-sync/download/${itemId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const encryptedBlob = await response.arrayBuffer();
    const encryptedData = new Uint8Array(encryptedBlob);

    log.info(`${logId}: Downloaded ${encryptedData.length} bytes, decrypting...`);

    // Use the existing decryption logic from orbitalMediaDownload
    const { decryptAndSaveMedia } = await import('./orbitalMediaDownload.preload.js');

    await decryptAndSaveMedia({
      media,
      encryptedData,
      getAbsoluteAttachmentPath,
    });

    // Mark as downloaded on server
    await fetch(`${API_BASE}/api/media-sync/mark-downloaded/${itemId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    log.info(`${logId}: Download complete`);
  } catch (error) {
    log.error(`${logId}: Failed to download sync item`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Download all ready items for a sync request
 *
 * Convenience function to download all items that have been uploaded
 * by providers and are ready for download.
 *
 * @param requestId The sync request ID
 */
export async function downloadReadyItems(requestId: string): Promise<void> {
  const logId = `downloadReadyItems(${requestId})`;

  try {
    log.info(`${logId}: Getting ready items`);

    // Get list of items ready for download
    const readyItems = await getReadyItems(requestId);

    if (readyItems.length === 0) {
      log.info(`${logId}: No items ready for download`);
      return;
    }

    log.info(`${logId}: Downloading ${readyItems.length} items`);

    // Download each item
    // Use window.getAbsoluteAttachmentPath from preload
    const getAbsoluteAttachmentPath = (relativePath: string): string => {
      // In Electron preload context, we have access to window helpers
      if (typeof window !== 'undefined' && (window as any).getAbsoluteAttachmentPath) {
        return (window as any).getAbsoluteAttachmentPath(relativePath);
      }
      // Fallback: return relative path
      return relativePath;
    };

    for (const item of readyItems) {
      try {
        await downloadSyncItem({
          itemId: item.itemId,
          mediaId: item.mediaId,
          getAbsoluteAttachmentPath,
        });
      } catch (itemError) {
        log.error(`${logId}: Failed to download item ${item.itemId}`, Errors.toLogFormat(itemError));
        // Continue with other items even if one fails
      }
    }

    log.info(`${logId}: Finished downloading ready items`);
  } catch (error) {
    log.error(`${logId}: Failed to download ready items`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Cancel a sync request
 */
export async function cancelSyncRequest(requestId: string): Promise<void> {
  const logId = `cancelSyncRequest(${requestId})`;

  try {
    log.info(`${logId}: Cancelling sync request`);

    const token = await getAuthToken();

    const response = await fetch(`${API_BASE}/api/media-sync/request/${requestId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    log.info(`${logId}: Sync request cancelled`);
  } catch (error) {
    log.error(`${logId}: Failed to cancel sync request`, Errors.toLogFormat(error));
    throw error;
  }
}

// ============================================================================
// Provider Functions
// ============================================================================

/**
 * Get items needed for a sync request (as provider)
 *
 * Returns the list of media items that we have locally and can upload
 * to help fulfill another user's sync request.
 *
 * @param requestId The sync request ID
 * @returns Array of items we can provide
 */
export async function getItemsNeededForRequest(requestId: string): Promise<SyncItemNeeded[]> {
  const logId = `getItemsNeededForRequest(${requestId})`;

  try {
    const token = await getAuthToken();

    const response = await fetch(`${API_BASE}/api/media-sync/pending-items/${requestId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const data: PendingItemsResponse = await response.json();

    // Filter to only items we have locally
    const itemsWeHave: SyncItemNeeded[] = [];

    for (const item of data.items) {
      const localMedia = await DataReader.getOrbitalMedia(item.media_id);
      if (localMedia && localMedia.downloaded === 1 && localMedia.localPath) {
        itemsWeHave.push({
          itemId: item.item_id,
          requestId: item.request_id,
          mediaId: item.media_id,
          requestorId: item.requestor_id,
          groupId: item.group_id,
          sizeBytes: item.size_bytes,
          contentType: item.content_type,
          fileName: item.file_name,
        });
      }
    }

    log.info(`${logId}: Found ${itemsWeHave.length}/${data.items.length} items we can provide`);

    return itemsWeHave;
  } catch (error) {
    log.error(`${logId}: Failed to get items needed`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Upload a local media file to fulfill a sync request (as provider)
 *
 * Reads the local encrypted file and uploads it to the server
 * so the requestor can download it.
 *
 * @param params Upload parameters
 */
export async function uploadItemForSync(params: {
  itemId: string;
  mediaId: string;
  getAbsoluteAttachmentPath: (relativePath: string) => string;
}): Promise<void> {
  const { itemId, mediaId, getAbsoluteAttachmentPath } = params;
  const logId = `uploadItemForSync(${itemId}, ${mediaId})`;

  try {
    log.info(`${logId}: Starting upload`);

    // Get local media record
    const media = await DataReader.getOrbitalMedia(mediaId);
    if (!media || !media.localPath || media.downloaded !== 1) {
      throw new Error(`Media not available locally: ${mediaId}`);
    }

    // Read the local file (already encrypted)
    const absolutePath = getAbsoluteAttachmentPath(media.localPath);
    const fs = await import('fs');
    const fileData = fs.readFileSync(absolutePath);

    const token = await getAuthToken();

    // Upload in chunks (5MB each)
    const CHUNK_SIZE = 5 * 1024 * 1024;
    const totalChunks = Math.ceil(fileData.length / CHUNK_SIZE);

    log.info(`${logId}: Uploading ${fileData.length} bytes in ${totalChunks} chunks`);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileData.length);
      const chunk = fileData.slice(start, end);

      const formData = new FormData();
      formData.append('chunk', new Blob([chunk]));
      formData.append('chunk_index', chunkIndex.toString());
      formData.append('total_chunks', totalChunks.toString());

      const chunkResponse = await fetch(`${API_BASE}/api/media-sync/upload/${itemId}/chunk`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!chunkResponse.ok) {
        const error = await chunkResponse.json().catch(() => ({}));
        throw new Error(`Chunk ${chunkIndex} upload failed: ${error.message || chunkResponse.status}`);
      }

      log.debug(`${logId}: Uploaded chunk ${chunkIndex + 1}/${totalChunks}`);
    }

    // Finalize upload
    const completeResponse = await fetch(`${API_BASE}/api/media-sync/upload/${itemId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        total_bytes: fileData.length,
        digest: media.digest,
      }),
    });

    if (!completeResponse.ok) {
      const error = await completeResponse.json().catch(() => ({}));
      throw new Error(`Upload completion failed: ${error.message || completeResponse.status}`);
    }

    log.info(`${logId}: Upload complete`);
  } catch (error) {
    log.error(`${logId}: Failed to upload sync item`, Errors.toLogFormat(error));
    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate since date from time range
 */
function calculateSinceDate(timeRange: MediaSyncTimeRange): number {
  const now = Date.now();
  switch (timeRange) {
    case 'last_month':
      return now - (30 * 24 * 60 * 60 * 1000);
    case 'last_6_months':
      return now - (180 * 24 * 60 * 60 * 1000);
    case 'all_time':
      // Orbital launch date
      return new Date('2020-01-01').getTime();
    default:
      return now - (30 * 24 * 60 * 60 * 1000);
  }
}

/**
 * Save sync request to local SQLCipher for tracking
 */
async function saveLocalSyncRequest(request: {
  id: string;
  groupId: string;
  sinceDate: number;
  maxBytes: number;
  bytesDownloaded: number;
  status: string;
  itemsTotal: number;
  itemsCompleted: number;
  itemsReady: number;
  createdAt: number;
  expiresAt: number;
}): Promise<void> {
  // Note: This requires adding a DAL method to Server.node.ts
  // For now, we'll use a raw query or skip local storage
  // The server is the source of truth for sync requests
  log.debug('saveLocalSyncRequest: Local tracking not implemented yet', { requestId: request.id });
}

/**
 * Update local sync request progress
 */
export async function updateLocalSyncProgress(requestId: string, updates: {
  itemsCompleted?: number;
  itemsReady?: number;
  bytesDownloaded?: number;
  status?: string;
}): Promise<void> {
  log.debug('updateLocalSyncProgress: Local tracking not implemented yet', { requestId, updates });
}
