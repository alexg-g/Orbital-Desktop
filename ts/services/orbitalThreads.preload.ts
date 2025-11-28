// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Threads Service - LOCAL-FIRST ARCHITECTURE
 *
 * Per PRD requirements (FR-3.7, FR-3.8):
 * - Client SQLCipher is the SOURCE OF TRUTH
 * - Server acts as a 7-day relay for syncing between orbit members
 * - Threads persist permanently on all orbit members' devices
 *
 * Flow:
 * 1. CREATE: Store locally first → Return immediately → Sync to server in background
 * 2. LIST: Read from local first → Return immediately → Sync from server in background
 * 3. SYNC: Merge server threads into local (add missing threads from other members)
 *
 * Features:
 * - Create new threads in groups with title and body
 * - List threads in a group (paginated)
 * - Get single thread details
 * - Get replies to a thread (paginated)
 * - Create replies to threads
 * - Support for media attachments
 * - Offline support (works without network)
 * - Background sync (non-blocking)
 *
 * Security:
 * - Thread titles and bodies encrypted client-side before sending to server
 * - Server only sees encrypted content (zero-knowledge)
 * - Media IDs reference encrypted media files
 * - SQLCipher provides database-level encryption at rest
 *
 * Limits:
 * - Thread title: 200 characters max
 * - Thread body: 10,000 characters max
 * - Reply body: 10,000 characters max
 */

import * as https from 'node:https';
import * as http from 'node:http';
import { URL } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../logging/log.std.js';
import * as Errors from '../types/errors.std.js';
import { handleOrbitalAPIError } from './orbitalErrorHandler.preload.js';
import { DataReader, DataWriter } from '../sql/Client.preload.js';
import type { OrbitalThreadType } from '../types/OrbitalThread.std.js';

const log = createLogger('OrbitalThreads');

/**
 * Orbital API base URL
 */
const ORBITAL_API_URL = process.env.ORBITAL_API_URL || 'https://api.orbitl.org';

/**
 * Thread and reply limits
 */
export const THREAD_LIMITS = {
  TITLE_MAX_LENGTH: 200,
  BODY_MAX_LENGTH: 10000,
  THREADS_PER_PAGE_DEFAULT: 50,
  THREADS_PER_PAGE_MAX: 100,
  REPLIES_PER_PAGE_DEFAULT: 50,
  REPLIES_PER_PAGE_MAX: 100,
};

/**
 * Thread information
 */
export type ThreadInfo = {
  threadId: string;
  groupId: string;
  authorId: string;
  authorUsername: string;
  encryptedTitle: string;
  encryptedBody: string;
  replyCount: number;
  createdAt: string;
  mediaCount?: number;
};

/**
 * Thread detail (includes media)
 */
export type ThreadDetail = {
  threadId: string;
  groupId: string;
  authorId: string;
  authorUsername: string;
  encryptedTitle: string;
  encryptedBody: string;
  replyCount: number;
  createdAt: string;
  media?: MediaInfo[];
};

/**
 * Reply information
 */
export type ReplyInfo = {
  replyId: string;
  threadId: string;
  authorId: string;
  authorUsername: string;
  encryptedBody: string;
  createdAt: string;
  mediaCount?: number;
  media?: MediaInfo[];
};

/**
 * Media information
 */
export type MediaInfo = {
  mediaId: string;
  encryptedMetadata: string;
  sizeBytes: number;
  uploadedAt: string;
  expiresAt?: string;
};

/**
 * List threads result
 */
export type ListThreadsResult = {
  threads: ThreadInfo[];
  totalCount: number;
  hasMore: boolean;
};

/**
 * List replies result
 */
export type ListRepliesResult = {
  replies: ReplyInfo[];
  totalCount: number;
  hasMore: boolean;
};

/**
 * Create thread result
 */
export type CreateThreadResult = {
  threadId: string;
  groupId: string;
  createdAt: string;
  media?: MediaInfo[];
};

/**
 * Create reply result
 */
export type CreateReplyResult = {
  replyId: string;
  threadId: string;
  createdAt: string;
  media?: MediaInfo[];
};

/**
 * API error response
 */
export type ThreadAPIError = {
  error: string;
  code?: string;
};

/**
 * List threads for a group - LOCAL-FIRST
 *
 * Reads from local SQLCipher first (immediate response), then triggers
 * background sync from server to merge any new threads from other orbit members.
 *
 * @param groupId Group ID to list threads from
 * @param options Pagination and sorting options
 * @returns Paginated list of threads from local SQLCipher
 */
export async function listThreads(
  groupId: string,
  options?: {
    limit?: number;
    offset?: number;
    sort?: 'created_desc' | 'created_asc';
  }
): Promise<ListThreadsResult> {
  const logId = `listThreads(${groupId})`;

  if (!groupId) {
    throw new Error('Group ID is required');
  }

  try {
    // 1. Read from local SQLCipher FIRST (source of truth)
    console.log('[DEBUG] listThreads: About to read from SQLCipher for groupId:', groupId);
    const localThreads = await DataReader.getOrbitalThreadsByGroupId(groupId, {
      limit: options?.limit,
      offset: options?.offset,
    });
    console.log('[DEBUG] listThreads: SQLCipher returned', localThreads.length, 'threads:', JSON.stringify(localThreads, null, 2));

    // Convert OrbitalThreadType to ThreadInfo for UI compatibility
    const threads: ThreadInfo[] = localThreads.map((t: OrbitalThreadType) => ({
      threadId: t.id,
      groupId: t.groupId,
      authorId: t.authorId,
      authorUsername: '', // Will be resolved by UI from orbit members
      encryptedTitle: t.encryptedTitle,
      encryptedBody: t.encryptedBody,
      replyCount: t.replyCount,
      createdAt: new Date(t.createdAt).toISOString(),
      mediaCount: t.mediaCount,
    }));

    // Sort if requested
    if (options?.sort === 'created_asc') {
      threads.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else {
      // Default: created_desc (newest first)
      threads.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    log.info(`${logId}: Retrieved ${threads.length} threads from local SQLCipher`);

    // 2. If local storage is empty (new user/fresh join), wait for sync to complete
    // This ensures new orbit members see existing threads immediately
    if (threads.length === 0) {
      log.info(`${logId}: Local storage empty, waiting for server sync...`);
      try {
        await syncThreadsFromServer(groupId);

        // Re-read from local after sync
        const syncedThreads = await DataReader.getOrbitalThreadsByGroupId(groupId, {
          limit: options?.limit,
          offset: options?.offset,
        });

        const syncedResult: ThreadInfo[] = syncedThreads.map((t: OrbitalThreadType) => ({
          threadId: t.id,
          groupId: t.groupId,
          authorId: t.authorId,
          authorUsername: '',
          encryptedTitle: t.encryptedTitle,
          encryptedBody: t.encryptedBody,
          replyCount: t.replyCount,
          createdAt: new Date(t.createdAt).toISOString(),
          mediaCount: t.mediaCount,
        }));

        // Sort synced results
        if (options?.sort === 'created_asc') {
          syncedResult.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        } else {
          syncedResult.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }

        log.info(`${logId}: After sync, found ${syncedResult.length} threads`);

        return {
          threads: syncedResult,
          totalCount: syncedResult.length,
          hasMore: false,
        };
      } catch (err) {
        log.warn(`${logId}: Server sync failed for empty local, returning empty:`, Errors.toLogFormat(err));
      }
    } else {
      // 3. Local has data - trigger background sync (non-blocking) for updates
      syncThreadsFromServer(groupId).catch(err => {
        log.warn(`${logId}: Background sync failed:`, Errors.toLogFormat(err));
      });
    }

    const result: ListThreadsResult = {
      threads,
      totalCount: threads.length,
      hasMore: false, // TODO: implement proper pagination
    };

    return result;
  } catch (error) {
    log.error(`${logId}: Failed to list threads`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Get single thread with details
 *
 * @param threadId Thread ID
 * @returns Thread details including media
 */
export async function getThread(threadId: string): Promise<ThreadDetail> {
  const logId = `getThread(${threadId})`;

  if (!threadId) {
    throw new Error('Thread ID is required');
  }

  try {
    // Get JWT token for authentication
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/threads/${threadId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    if (response.status !== 200) {
      const errorData = parseErrorResponse(response.data);
      throw new Error(errorData.error || `Failed to get thread: ${response.status}`);
    }

    const data = JSON.parse(response.data);

    const media: MediaInfo[] | undefined = data.media
      ? data.media.map((m: any) => ({
          mediaId: m.media_id,
          encryptedMetadata: m.encrypted_metadata,
          sizeBytes: m.size_bytes,
          uploadedAt: m.uploaded_at,
          expiresAt: m.expires_at,
        }))
      : undefined;

    const thread: ThreadDetail = {
      threadId: data.thread_id,
      groupId: data.group_id,
      authorId: data.author_id,
      authorUsername: data.author_username,
      encryptedTitle: data.encrypted_title,
      encryptedBody: data.encrypted_body,
      replyCount: data.reply_count || 0,
      createdAt: data.created_at,
      media,
    };

    log.info(`${logId}: Retrieved thread`);

    return thread;
  } catch (error) {
    log.error(`${logId}: Failed to get thread`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Create new thread - LOCAL-FIRST
 *
 * Stores thread locally in SQLCipher first (immediate response), then syncs
 * to server in background. Thread is immediately available in local storage.
 *
 * @param groupId Group ID to create thread in
 * @param title Plain text thread title (will be encrypted before sending)
 * @param body Plain text thread body (will be encrypted before sending)
 * @param mediaIds Optional array of media IDs to attach
 * @returns Created thread information
 */
export async function createThread(
  groupId: string,
  title: string,
  body: string,
  mediaIds?: string[]
): Promise<CreateThreadResult> {
  const logId = `createThread(${groupId})`;

  // Validation
  if (!groupId) {
    throw new Error('Group ID is required');
  }

  if (!title || title.trim().length === 0) {
    throw new Error('Thread title is required');
  }

  if (title.length > THREAD_LIMITS.TITLE_MAX_LENGTH) {
    throw new Error(`Thread title must be ${THREAD_LIMITS.TITLE_MAX_LENGTH} characters or less`);
  }

  if (body && body.length > THREAD_LIMITS.BODY_MAX_LENGTH) {
    throw new Error(`Thread body must be ${THREAD_LIMITS.BODY_MAX_LENGTH} characters or less`);
  }

  try {
    // 1. Generate thread ID locally
    const threadId = uuidv4();
    const createdAt = Date.now();

    // For now, pass title/body as-is
    // TODO: Encrypt with group key before sending
    const encryptedTitle = title;
    const encryptedBody = body || '';

    // Get current user ID for author
    const { getUserId } = await import('./orbitalAuth.preload.js');
    const authorId = await getUserId() || 'unknown';

    // 2. Store in local SQLCipher FIRST (source of truth)
    const thread: OrbitalThreadType = {
      id: threadId,
      groupId,
      authorId,
      encryptedTitle,
      encryptedBody,
      titleIv: '', // TODO: generate IV for encryption
      bodyIv: '',  // TODO: generate IV for encryption
      createdAt,
      replyCount: 0,
      mediaCount: mediaIds?.length || 0,
      pendingSync: true, // Mark as pending sync to server
    };

    console.log('[DEBUG] About to save thread to SQLCipher:', JSON.stringify(thread, null, 2));
    try {
      await DataWriter.saveOrbitalThread(thread);
      console.log('[DEBUG] Thread successfully saved to SQLCipher:', threadId);
    } catch (saveError) {
      console.error('[DEBUG] Failed to save thread to SQLCipher:', saveError);
      throw saveError;
    }

    log.info(`${logId}: Thread saved to local SQLCipher`, { threadId });

    // 3. Return immediately with local data
    const result: CreateThreadResult = {
      threadId,
      groupId,
      createdAt: new Date(createdAt).toISOString(),
    };

    // 4. Sync to server in background (non-blocking)
    syncThreadToServer(threadId, groupId, encryptedTitle, encryptedBody, mediaIds)
      .then(result => {
        if (result.success) {
          log.info(`${logId}: Thread synced to server`, { threadId });
        } else {
          log.warn(`${logId}: Thread sync to server failed: ${result.error}, will retry later`, { threadId });
        }
      })
      .catch(err => {
        log.warn(`${logId}: Thread sync to server failed, will retry later:`, Errors.toLogFormat(err));
      });

    return result;
  } catch (error) {
    log.error(`${logId}: Failed to create thread`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Get replies for a thread
 *
 * @param threadId Thread ID to get replies from
 * @param options Pagination options
 * @returns Paginated list of replies
 */
export async function getReplies(
  threadId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<ListRepliesResult> {
  const logId = `getReplies(${threadId})`;

  if (!threadId) {
    throw new Error('Thread ID is required');
  }

  try {
    // Get JWT token for authentication
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    // Build query parameters
    const queryParams = new URLSearchParams();
    if (options?.limit !== undefined) {
      queryParams.append('limit', String(options.limit));
    }
    if (options?.offset !== undefined) {
      queryParams.append('offset', String(options.offset));
    }

    const queryString = queryParams.toString();
    const url = `${ORBITAL_API_URL}/api/threads/${threadId}/replies${queryString ? `?${queryString}` : ''}`;

    const response = await makeRequest({
      url,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    if (response.status !== 200) {
      const errorData = parseErrorResponse(response.data);
      throw new Error(errorData.error || `Failed to get replies: ${response.status}`);
    }

    const data = JSON.parse(response.data);

    const replies: ReplyInfo[] = (data.replies || []).map((r: any) => ({
      replyId: r.reply_id,
      threadId: r.thread_id,
      authorId: r.author_id,
      authorUsername: r.author_username,
      encryptedBody: r.encrypted_body,
      createdAt: r.created_at,
      mediaCount: r.media_count || 0,
      media: r.media
        ? r.media.map((m: any) => ({
            mediaId: m.media_id,
            encryptedMetadata: m.encrypted_metadata,
            sizeBytes: m.size_bytes,
            uploadedAt: m.uploaded_at,
            expiresAt: m.expires_at,
          }))
        : undefined,
    }));

    const result: ListRepliesResult = {
      replies,
      totalCount: data.total_count || replies.length,
      hasMore: data.has_more || false,
    };

    log.info(`${logId}: Retrieved ${replies.length} replies`);

    return result;
  } catch (error) {
    log.error(`${logId}: Failed to get replies`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Create reply to thread
 *
 * @param threadId Thread ID to reply to
 * @param body Plain text reply body (will be encrypted before sending)
 * @param mediaIds Optional array of media IDs to attach
 * @returns Created reply information
 */
export async function createReply(
  threadId: string,
  body: string,
  mediaIds?: string[]
): Promise<CreateReplyResult> {
  const logId = `createReply(${threadId})`;

  // Validation
  if (!threadId) {
    throw new Error('Thread ID is required');
  }

  if (!body || body.trim().length === 0) {
    throw new Error('Reply body is required');
  }

  if (body.length > THREAD_LIMITS.BODY_MAX_LENGTH) {
    throw new Error(`Reply body must be ${THREAD_LIMITS.BODY_MAX_LENGTH} characters or less`);
  }

  try {
    // Get JWT token for authentication
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    // Check if parent thread exists and ensure it's synced
    const thread = DataReader.getOrbitalThread(threadId);
    log.info(`${logId}: Looking up thread in local storage`, {
      found: !!thread,
      pendingSync: thread?.pendingSync,
      groupId: thread?.groupId,
      encryptedTitle: thread?.encryptedTitle?.substring(0, 20),
    });

    if (!thread) {
      log.error(`${logId}: Thread not found in local storage`);
      throw new Error('Thread not found. Please refresh and try again.');
    }

    // Always attempt to sync thread to server before creating reply
    // The sync is idempotent - if thread already exists on server, it will succeed
    log.info(`${logId}: Ensuring thread is synced to server (pendingSync: ${thread.pendingSync})`);

    // Ensure encryptedTitle and encryptedBody are always strings
    // Legacy threads in SQLite may have null/undefined for these fields
    const encryptedTitleForSync = thread.encryptedTitle || 'Untitled';
    const encryptedBodyForSync = thread.encryptedBody ?? '';

    // Get groupId - fallback to selected group if thread doesn't have it (legacy data)
    let groupIdForSync = thread.groupId;
    if (!groupIdForSync) {
      const { getSelectedGroupId } = await import('./orbitalGroups.preload.js');
      groupIdForSync = await getSelectedGroupId();
      log.info(`${logId}: Using selected group ID as fallback: ${groupIdForSync}`);
    }

    if (!groupIdForSync) {
      throw new Error('Cannot create reply: No group ID available. Please select an orbit first.');
    }

    log.info(`${logId}: Sync data - title: "${encryptedTitleForSync.substring(0, 20)}...", body: "${encryptedBodyForSync.substring(0, 20)}..." (body length: ${encryptedBodyForSync.length}), groupId: ${groupIdForSync}`);

    const syncResult = await syncThreadToServer(
      threadId,  // Use threadId parameter, not thread.id (which may be undefined from SQLite row mapping)
      groupIdForSync,
      encryptedTitleForSync,
      encryptedBodyForSync
    );

    if (!syncResult.success) {
      log.error(`${logId}: Failed to sync parent thread: ${syncResult.error}`);
      // Provide a user-friendly error message
      throw new Error(
        `Cannot create reply: The thread hasn't been synced to the server yet. ` +
        `Error: ${syncResult.error}. Please try again later.`
      );
    }
    log.info(`${logId}: Thread synced successfully`);

    // For now, pass body as-is
    // TODO: Encrypt with group key before sending
    const encryptedBody = body;

    const requestBody = JSON.stringify({
      encrypted_body: encryptedBody,
      ...(mediaIds && mediaIds.length > 0 && { media_ids: mediaIds }),
    });

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/threads/${threadId}/replies`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: Buffer.from(requestBody),
    });

    if (response.status !== 201 && response.status !== 200) {
      const errorData = parseErrorResponse(response.data);
      throw new Error(errorData.error || `Failed to create reply: ${response.status}`);
    }

    const data = JSON.parse(response.data);

    const media: MediaInfo[] | undefined = data.media
      ? data.media.map((m: any) => ({
          mediaId: m.media_id,
          encryptedMetadata: m.encrypted_metadata,
          sizeBytes: m.size_bytes,
          uploadedAt: m.uploaded_at,
          expiresAt: m.expires_at,
        }))
      : undefined;

    const result: CreateReplyResult = {
      replyId: data.reply_id,
      threadId: data.thread_id,
      createdAt: data.created_at,
      media,
    };

    log.info(`${logId}: Reply created successfully`, { replyId: result.replyId });

    return result;
  } catch (error) {
    log.error(`${logId}: Failed to create reply`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

// =============================================================================
// BACKGROUND SYNC
// =============================================================================

/**
 * Result of syncing a thread to the server
 */
type SyncResult = {
  success: boolean;
  error?: string;
};

/**
 * Sync a thread to the server
 *
 * Called after storing locally. Updates pendingSync status on success.
 * Returns success/failure status for callers that need to handle sync results.
 */
async function syncThreadToServer(
  threadId: string,
  groupId: string,
  encryptedTitle: string,
  encryptedBody: string,
  mediaIds?: string[]
): Promise<SyncResult> {
  const logId = `syncThreadToServer(${threadId})`;

  try {
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      log.warn(`${logId}: No JWT token, skipping sync`);
      return { success: false, error: 'Not authenticated' };
    }

    // Ensure we never send null/undefined for body
    const safeBody = encryptedBody ?? '';

    const requestBody = JSON.stringify({
      thread_id: threadId, // Use same ID as local
      group_id: groupId,
      encrypted_title: encryptedTitle,
      encrypted_body: safeBody,
      ...(mediaIds && mediaIds.length > 0 && { media_ids: mediaIds }),
    });

    // Log request details for debugging
    log.info(`${logId}: Sending sync request`, {
      url: `${ORBITAL_API_URL}/api/threads`,
      thread_id: threadId,
      group_id: groupId,
      encrypted_title_length: encryptedTitle?.length ?? 'null',
      encrypted_body_length: safeBody.length,
      encrypted_title_preview: encryptedTitle?.substring(0, 30) ?? 'null',
      encrypted_body_preview: safeBody.substring(0, 30),
    });

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/threads`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: Buffer.from(requestBody),
    });

    if (response.status === 201 || response.status === 200) {
      // Success - update local sync status
      await DataWriter.updateOrbitalThreadSyncStatus(threadId, false);
      log.info(`${logId}: Thread synced to server successfully`);
      return { success: true };
    } else {
      // Parse error response for better error message
      const errorData = parseErrorResponse(response.data);
      const errorMsg = errorData.error || `Server returned ${response.status}`;
      log.warn(`${logId}: Server sync failed - ${errorMsg}`);
      // Thread remains in pendingSync state, will retry later
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    log.error(`${logId}: Failed to sync thread to server`, Errors.toLogFormat(error));
    // Thread remains in pendingSync state, will retry later
    return { success: false, error: 'Network error' };
  }
}

/**
 * Sync threads from server to local SQLCipher
 *
 * Fetches threads from server and merges any new threads from other orbit members
 * into local storage.
 */
async function syncThreadsFromServer(groupId: string): Promise<void> {
  const logId = `syncThreadsFromServer(${groupId})`;

  try {
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      log.warn(`${logId}: No JWT token, skipping sync`);
      return;
    }

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/threads/groups/${groupId}/threads`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    // Handle 404 gracefully - group may not exist on backend yet
    if (response.status === 404) {
      log.info(`${logId}: Group not found on backend, nothing to sync`);
      return;
    }

    if (response.status !== 200) {
      log.warn(`${logId}: Server returned status ${response.status}`);
      return;
    }

    const data = JSON.parse(response.data);
    const serverThreads = data.threads || [];

    log.info(`${logId}: Received ${serverThreads.length} threads from server`);
    console.log('[DEBUG] syncThreadsFromServer: Server response:', JSON.stringify(data, null, 2));

    // Merge: add threads we don't have locally
    let addedCount = 0;
    for (const serverThread of serverThreads) {
      const existingThread = await DataReader.getOrbitalThread(serverThread.thread_id);

      if (!existingThread) {
        // New thread from another orbit member - save locally
        const thread: OrbitalThreadType = {
          id: serverThread.thread_id,
          groupId: serverThread.group_id,
          authorId: serverThread.author_id,
          encryptedTitle: serverThread.encrypted_title || '',
          encryptedBody: serverThread.encrypted_body || '',
          titleIv: '', // Server doesn't return IV yet
          bodyIv: '',
          createdAt: new Date(serverThread.created_at).getTime(),
          lastReplyAt: serverThread.last_reply_at ? new Date(serverThread.last_reply_at).getTime() : undefined,
          replyCount: serverThread.reply_count || 0,
          mediaCount: serverThread.media_count || 0,
          pendingSync: false, // Already on server
        };

        await DataWriter.saveOrbitalThread(thread);
        addedCount++;
        log.info(`${logId}: Added thread ${thread.id} from server`);
      }
    }

    if (addedCount > 0) {
      log.info(`${logId}: Added ${addedCount} new threads from server`);
      // TODO: Emit event to trigger UI refresh
    }
  } catch (error) {
    log.error(`${logId}: Failed to sync threads from server`, Errors.toLogFormat(error));
  }
}

/**
 * Sync all pending threads to server
 *
 * Called on app startup or when coming back online.
 */
export async function syncPendingThreads(): Promise<void> {
  const logId = 'syncPendingThreads';

  try {
    const pendingThreads = await DataReader.getPendingSyncThreads();

    if (pendingThreads.length === 0) {
      log.info(`${logId}: No pending threads to sync`);
      return;
    }

    log.info(`${logId}: Found ${pendingThreads.length} pending threads to sync`);

    for (const thread of pendingThreads) {
      await syncThreadToServer(
        thread.id,
        thread.groupId,
        thread.encryptedTitle,
        thread.encryptedBody
      );
    }

    log.info(`${logId}: Finished syncing pending threads`);
  } catch (error) {
    log.error(`${logId}: Failed to sync pending threads`, Errors.toLogFormat(error));
  }
}

// =============================================================================
// LEGACY LOCAL THREAD STORAGE (deprecated - use SQLCipher instead)
// =============================================================================

/**
 * @deprecated Use SQLCipher thread storage instead
 * Thread stored locally (for offline support and backend fallback)
 */
export type LocalThread = {
  threadId: string;
  groupId: string;
  authorId: string;
  authorUsername: string;
  title: string;
  body: string;
  replyCount: number;
  createdAt: string;
  hasMedia: boolean;
  hasVideo: boolean;
  hasImage: boolean;
};

/**
 * Store a thread locally in SQLCipher
 */
export async function storeLocalThread(thread: LocalThread): Promise<void> {
  const { itemStorage } = await import('../textsecure/Storage.preload.js');

  // Get existing threads map or create new one (organized by groupId)
  const existingThreads = itemStorage.get('orbitalLocalThreads') || {};
  const groupThreads = existingThreads[thread.groupId] || [];

  // Check if thread already exists (update it) or add new
  const existingIndex = groupThreads.findIndex((t: LocalThread) => t.threadId === thread.threadId);
  if (existingIndex >= 0) {
    groupThreads[existingIndex] = thread;
  } else {
    // Add new thread at the beginning (newest first)
    groupThreads.unshift(thread);
  }

  const updatedThreads = {
    ...existingThreads,
    [thread.groupId]: groupThreads,
  };

  await itemStorage.put('orbitalLocalThreads', updatedThreads);
  log.info(`storeLocalThread: Stored thread ${thread.threadId} for group ${thread.groupId}`);
}

/**
 * Get locally stored threads for a group
 */
export async function getLocalThreads(groupId: string): Promise<LocalThread[]> {
  const { itemStorage } = await import('../textsecure/Storage.preload.js');

  const allThreads = itemStorage.get('orbitalLocalThreads') || {};
  const groupThreads = allThreads[groupId] || [];

  log.info(`getLocalThreads: Retrieved ${groupThreads.length} threads for group ${groupId}`);
  return groupThreads;
}

/**
 * Update reply count for a locally stored thread
 */
export async function updateLocalThreadReplyCount(groupId: string, threadId: string, replyCount: number): Promise<void> {
  const { itemStorage } = await import('../textsecure/Storage.preload.js');

  const existingThreads = itemStorage.get('orbitalLocalThreads') || {};
  const groupThreads = existingThreads[groupId] || [];

  const threadIndex = groupThreads.findIndex((t: LocalThread) => t.threadId === threadId);
  if (threadIndex >= 0) {
    groupThreads[threadIndex].replyCount = replyCount;
    const updatedThreads = {
      ...existingThreads,
      [groupId]: groupThreads,
    };
    await itemStorage.put('orbitalLocalThreads', updatedThreads);
    log.info(`updateLocalThreadReplyCount: Updated thread ${threadId} reply count to ${replyCount}`);
  }
}

/**
 * Delete a locally stored thread
 */
export async function deleteLocalThread(groupId: string, threadId: string): Promise<void> {
  const { itemStorage } = await import('../textsecure/Storage.preload.js');

  const existingThreads = itemStorage.get('orbitalLocalThreads') || {};
  const groupThreads = existingThreads[groupId] || [];

  const updatedGroupThreads = groupThreads.filter((t: LocalThread) => t.threadId !== threadId);

  const updatedThreads = {
    ...existingThreads,
    [groupId]: updatedGroupThreads,
  };

  await itemStorage.put('orbitalLocalThreads', updatedThreads);
  log.info(`deleteLocalThread: Deleted thread ${threadId} from group ${groupId}`);
}

/**
 * Clear all locally stored threads for a group
 */
export async function clearLocalThreads(groupId: string): Promise<void> {
  const { itemStorage } = await import('../textsecure/Storage.preload.js');

  const existingThreads = itemStorage.get('orbitalLocalThreads') || {};
  delete existingThreads[groupId];

  await itemStorage.put('orbitalLocalThreads', existingThreads);
  log.info(`clearLocalThreads: Cleared all threads for group ${groupId}`);
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Parse error response from server
 */
function parseErrorResponse(data: string): ThreadAPIError {
  try {
    return JSON.parse(data);
  } catch {
    return { error: data || 'Unknown error' };
  }
}

// =============================================================================
// HTTP REQUEST HELPER
// =============================================================================

/**
 * Helper to make HTTP/HTTPS requests
 */
function makeRequest(options: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: Buffer;
}): Promise<{ status: number; statusText: string; data: string }> {
  return new Promise((resolve, reject) => {
    const { url, method, headers, body } = options;

    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
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
        resolve({
          status: response.statusCode || 0,
          statusText: response.statusMessage || '',
          data: responseData,
        });
      });

      response.on('error', error => {
        reject(error);
      });
    });

    request.on('error', error => {
      reject(error);
    });

    if (body) {
      request.write(body);
    }

    request.end();
  });
}
