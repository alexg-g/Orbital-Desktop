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
import { encryptAesGcm, decryptAesGcm, getRandomBytes } from '../Crypto.node.js';
import * as Bytes from '../Bytes.std.js';

const log = createLogger('OrbitalThreads');

/**
 * Orbital API base URL
 */
const ORBITAL_API_URL = process.env.ORBITAL_API_URL || 'https://api.orbitl.org';

/**
 * AES-GCM IV length (12 bytes recommended by NIST for GCM)
 */
const AES_GCM_IV_LENGTH = 12;

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

// =============================================================================
// ENCRYPTION HELPERS
// =============================================================================

/**
 * Get the group encryption key from SQLCipher storage
 *
 * @param groupId Group/orbit ID
 * @returns Group key as Uint8Array or null if not found
 */
async function getGroupKey(groupId: string): Promise<Uint8Array | null> {
  try {
    const { itemStorage } = await import('../textsecure/Storage.preload.js');
    const keys = itemStorage.get('orbitalGroupKeys');
    if (!keys || !keys[groupId]) {
      log.error(`getGroupKey: No key found for group ${groupId}`);
      return null;
    }
    return Bytes.fromBase64(keys[groupId]);
  } catch (error) {
    log.error('getGroupKey: Failed to retrieve group key:', Errors.toLogFormat(error));
    return null;
  }
}

/**
 * Encrypt text content with group key using AES-256-GCM
 *
 * @param groupId Group ID (used as AAD for binding)
 * @param plaintext Plain text to encrypt
 * @returns Object with encrypted content (base64) and IV (base64)
 */
async function encryptContent(
  groupId: string,
  plaintext: string
): Promise<{ encrypted: string; iv: string }> {
  const groupKey = await getGroupKey(groupId);
  if (!groupKey) {
    throw new Error('No group key found. Cannot encrypt content.');
  }

  // Convert plaintext to bytes
  const plaintextBytes = Bytes.fromString(plaintext);

  // Generate random 12-byte IV (NIST recommendation for GCM)
  const iv = getRandomBytes(AES_GCM_IV_LENGTH);

  // Use groupId as AAD to bind encryption to this specific group
  // Prevents cross-group message manipulation
  const aad = Bytes.fromString(groupId);

  // Encrypt with AES-256-GCM
  const ciphertext = encryptAesGcm(groupKey, iv, plaintextBytes, aad);

  return {
    encrypted: Bytes.toBase64(ciphertext),
    iv: Bytes.toBase64(iv),
  };
}

/**
 * Decrypt text content with group key using AES-256-GCM
 *
 * @param groupId Group ID (used as AAD for verification)
 * @param encryptedBase64 Encrypted content (base64)
 * @param ivBase64 Initialization vector (base64)
 * @returns Decrypted plaintext or empty string on failure
 */
async function decryptContent(
  groupId: string,
  encryptedBase64: string,
  ivBase64: string
): Promise<string> {
  try {
    const groupKey = await getGroupKey(groupId);
    if (!groupKey) {
      log.warn('decryptContent: No group key found');
      return '[Encrypted - Key Not Available]';
    }

    // Convert from base64
    const ciphertext = Bytes.fromBase64(encryptedBase64);
    const iv = Bytes.fromBase64(ivBase64);

    // Use groupId as AAD to verify message was encrypted for this group
    const aad = Bytes.fromString(groupId);

    // Decrypt with AES-256-GCM
    const plaintextBytes = decryptAesGcm(groupKey, iv, ciphertext, aad);
    return Bytes.toString(plaintextBytes);
  } catch (error) {
    log.error('decryptContent: Decryption failed:', Errors.toLogFormat(error));
    return '[Decryption Failed]';
  }
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Sync progress information
 */
export type SyncProgress = {
  phase: 'threads' | 'complete';
  current: number;
  total: number;
  percent: number;
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
  media?: MediaInfo[]; // Optional media info (available from detailed thread list)
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
  parentReplyId?: string | null; // ID of the reply this is responding to (null = top-level reply)
  level?: number; // Nesting depth: 0 = top-level reply to thread, 1+ = nested reply
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
  media?: MediaInfo[]; // Thread-level media (not per-reply)
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
    // Decrypt title and body if they have IVs (encrypted), otherwise pass through (legacy plaintext)
    const threads: ThreadInfo[] = await Promise.all(
      localThreads.map(async (t: OrbitalThreadType) => {
        let decryptedTitle = t.encryptedTitle;
        let decryptedBody = t.encryptedBody;

        // If IVs exist, content is encrypted - decrypt it
        if (t.titleIv && t.titleIv.length > 0) {
          decryptedTitle = await decryptContent(t.groupId, t.encryptedTitle, t.titleIv);
        }
        if (t.bodyIv && t.bodyIv.length > 0) {
          decryptedBody = await decryptContent(t.groupId, t.encryptedBody, t.bodyIv);
        }

        return {
          threadId: t.id,
          groupId: t.groupId,
          authorId: t.authorId,
          authorUsername: t.authorUsername || '', // Use stored username from sync
          encryptedTitle: decryptedTitle, // Now contains decrypted plaintext
          encryptedBody: decryptedBody,   // Now contains decrypted plaintext
          replyCount: t.replyCount,
          createdAt: new Date(t.createdAt).toISOString(),
          mediaCount: t.mediaCount,
        };
      })
    );

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

        const syncedResult: ThreadInfo[] = await Promise.all(
          syncedThreads.map(async (t: OrbitalThreadType) => {
            let decryptedTitle = t.encryptedTitle;
            let decryptedBody = t.encryptedBody;

            // Decrypt if encrypted
            if (t.titleIv && t.titleIv.length > 0) {
              decryptedTitle = await decryptContent(t.groupId, t.encryptedTitle, t.titleIv);
            }
            if (t.bodyIv && t.bodyIv.length > 0) {
              decryptedBody = await decryptContent(t.groupId, t.encryptedBody, t.bodyIv);
            }

            return {
              threadId: t.id,
              groupId: t.groupId,
              authorId: t.authorId,
              authorUsername: t.authorUsername || '',
              encryptedTitle: decryptedTitle,
              encryptedBody: decryptedBody,
              replyCount: t.replyCount,
              createdAt: new Date(t.createdAt).toISOString(),
              mediaCount: t.mediaCount,
            };
          })
        );

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
      authorUsername: data.author_display_name || data.author_username,
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

  // Require body OR media (allow media-only threads with title)
  const hasBody = body && body.trim().length > 0;
  const hasMedia = mediaIds && mediaIds.length > 0;
  if (!hasBody && !hasMedia) {
    throw new Error('Thread must have text content or attached media');
  }

  if (body && body.length > THREAD_LIMITS.BODY_MAX_LENGTH) {
    throw new Error(`Thread body must be ${THREAD_LIMITS.BODY_MAX_LENGTH} characters or less`);
  }

  try {
    // 1. Generate thread ID locally
    const threadId = uuidv4();
    const createdAt = Date.now();

    // 2. Encrypt title and body with group key
    const { encrypted: encryptedTitle, iv: titleIv } = await encryptContent(groupId, title);
    const { encrypted: encryptedBody, iv: bodyIv } = await encryptContent(groupId, body || '');

    log.info(`${logId}: Content encrypted - title IV: ${titleIv.substring(0, 16)}..., body IV: ${bodyIv.substring(0, 16)}...`);

    // Get current user ID and username for author
    const { getUserId, getUsername } = await import('./orbitalAuth.preload.js');
    const authorId = await getUserId() || 'unknown';
    const authorUsername = await getUsername() || '';

    // 3. Store in local SQLCipher FIRST (source of truth)
    const thread: OrbitalThreadType = {
      id: threadId,
      groupId,
      authorId,
      authorUsername,
      encryptedTitle,
      encryptedBody,
      titleIv,
      bodyIv,
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

    // 4. Return immediately with local data
    const result: CreateThreadResult = {
      threadId,
      groupId,
      createdAt: new Date(createdAt).toISOString(),
    };

    // 5. Sync to server in background (non-blocking)
    syncThreadToServer(threadId, groupId, encryptedTitle, encryptedBody, titleIv, bodyIv, mediaIds)
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
    // Get the thread to find the groupId (needed for decryption)
    const thread = await DataReader.getOrbitalThread(threadId);
    if (!thread) {
      throw new Error('Thread not found. Cannot decrypt replies.');
    }
    const groupId = thread.groupId;

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

    // Decrypt reply bodies if they have IVs
    const replies: ReplyInfo[] = await Promise.all(
      (data.replies || []).map(async (r: any) => {
        let decryptedBody = r.encrypted_body;

        // If body_iv exists, decrypt the body
        if (r.body_iv && r.body_iv.length > 0) {
          decryptedBody = await decryptContent(groupId, r.encrypted_body, r.body_iv);
        }

        return {
          replyId: r.reply_id,
          threadId: r.thread_id,
          authorId: r.author_id,
          authorUsername: r.author_display_name || r.author_username,
          encryptedBody: decryptedBody, // Now contains decrypted plaintext
          createdAt: r.created_at,
          parentReplyId: r.parent_reply_id || null,
          level: r.level ?? 0, // Backend calculates level from parent chain; 0 = top-level reply
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
        };
      })
    );

    // Parse thread-level media from backend response
    const threadMedia: MediaInfo[] = (data.media || []).map((m: any) => ({
      mediaId: m.media_id,
      encryptedMetadata: m.encrypted_metadata,
      sizeBytes: m.size_bytes,
      uploadedAt: m.uploaded_at,
      expiresAt: m.expires_at,
    }));

    const result: ListRepliesResult = {
      replies,
      totalCount: data.total_count || replies.length,
      hasMore: data.has_more || false,
      media: threadMedia.length > 0 ? threadMedia : undefined,
    };

    log.info(`${logId}: Retrieved ${replies.length} replies, ${threadMedia.length} media items`);

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
 * @param parentReplyId Optional ID of the reply being responded to (for nested threading)
 * @returns Created reply information
 */
export async function createReply(
  threadId: string,
  body: string,
  mediaIds?: string[],
  parentReplyId?: string
): Promise<CreateReplyResult> {
  const logId = `createReply(${threadId})`;

  // Validation
  if (!threadId) {
    throw new Error('Thread ID is required');
  }

  // Require body OR media (allow media-only replies)
  const hasBody = body && body.trim().length > 0;
  const hasMedia = mediaIds && mediaIds.length > 0;
  if (!hasBody && !hasMedia) {
    throw new Error('Reply must have text content or attached media');
  }

  if (body && body.length > THREAD_LIMITS.BODY_MAX_LENGTH) {
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
    const thread = await DataReader.getOrbitalThread(threadId);
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
    let groupIdForSync: string = thread.groupId || '';
    if (!groupIdForSync) {
      const { getSelectedGroupId } = await import('./orbitalGroups.preload.js');
      const selectedGroupId = await getSelectedGroupId();
      if (!selectedGroupId) {
        throw new Error('Cannot create reply: No group ID available. Please select an orbit first.');
      }
      groupIdForSync = selectedGroupId;
      log.info(`${logId}: Using selected group ID as fallback: ${groupIdForSync}`);
    }

    log.info(`${logId}: Sync data - title: "${encryptedTitleForSync.substring(0, 20)}...", body: "${encryptedBodyForSync.substring(0, 20)}..." (body length: ${encryptedBodyForSync.length}), groupId: ${groupIdForSync}`);

    const syncResult = await syncThreadToServer(
      threadId,  // Use threadId parameter, not thread.id (which may be undefined from SQLite row mapping)
      groupIdForSync,
      encryptedTitleForSync,
      encryptedBodyForSync,
      thread.titleIv || undefined,
      thread.bodyIv || undefined
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

    // Encrypt reply body with group key
    const { encrypted: encryptedBody, iv: bodyIv } = await encryptContent(groupIdForSync, body);
    log.info(`${logId}: Reply body encrypted - IV: ${bodyIv.substring(0, 16)}...`);

    const requestBody = JSON.stringify({
      encrypted_body: encryptedBody,
      body_iv: bodyIv, // Send IV so server can relay it to other clients
      ...(mediaIds && mediaIds.length > 0 && { media_ids: mediaIds }),
      ...(parentReplyId && { parent_reply_id: parentReplyId }),
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

    // Update local SQLCipher reply count so sidebar stays in sync
    const updatedThread = await DataReader.getOrbitalThread(threadId);
    if (updatedThread) {
      const newReplyCount = (updatedThread.replyCount || 0) + 1;
      DataWriter.updateOrbitalThreadReplyCount(threadId, newReplyCount, Date.now());
      log.info(`${logId}: Updated SQLCipher reply count to ${newReplyCount}`);
    }

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
 * Send OrbitalMediaSyncMessage to group members
 *
 * This shares media encryption keys with other orbit members so they can
 * download and decrypt the media. Keys are sent via Signal Protocol encrypted
 * group messages (server cannot read them).
 *
 * @param groupId Group/orbit ID
 * @param threadId Thread ID the media belongs to
 * @param mediaIds Array of media IDs to sync
 */
export async function sendMediaSyncMessages(
  groupId: string,
  threadId: string,
  mediaIds: string[]
): Promise<void> {
  const logId = `sendMediaSyncMessages(${groupId}, ${threadId})`;

  try {
    // Get user info for uploadedBy field
    const { getUserId } = await import('./orbitalAuth.preload.js');
    const uploadedBy = await getUserId() || 'unknown';

    // Get the conversation for this group
    const conversation = window.ConversationController?.get(groupId);
    if (!conversation) {
      log.error(`${logId}: Group conversation not found: ${groupId}`);
      return;
    }

    for (const mediaId of mediaIds) {
      try {
        // Fetch the media record from local SQLCipher
        const media = await DataReader.getOrbitalMediaById(mediaId);
        if (!media) {
          log.warn(`${logId}: Media ${mediaId} not found in local storage, skipping sync message`);
          continue;
        }

        // Construct the OrbitalMediaSyncMessage
        const syncMessage: import('../types/OrbitalMedia.std.js').OrbitalMediaSyncMessage = {
          type: 'orbital-media-sync',
          id: media.id,
          mediaId: media.mediaId,
          threadId,
          attachmentKeys: media.attachmentKeys, // Base64 string
          plaintextHash: media.plaintextHash,
          digest: media.digest,
          incrementalMac: media.incrementalMac,
          chunkSize: media.chunkSize,
          size: media.size,
          contentType: media.contentType,
          fileName: media.fileName,
          blurHash: media.blurHash,
          width: media.width,
          height: media.height,
          duration: media.duration,
          caption: media.caption,
          expiresAt: media.expiresAt,
          uploadedBy,
          createdAt: media.createdAt,
        };

        // Serialize the sync message to JSON
        const messageBody = JSON.stringify(syncMessage);

        // Send via Signal Protocol using ConversationController
        // This ensures proper E2E encryption through Signal's infrastructure
        await conversation.queueJob('sendMediaSyncMessage', async () => {
          await conversation.sendMessage({
            body: messageBody,
            // No attachments - metadata is in the body
            // Signal Protocol handles encryption
          });
        });

        log.info(`${logId}: Sent media sync message for ${mediaId}`);
      } catch (mediaError) {
        log.error(`${logId}: Failed to send media sync message for ${mediaId}:`, Errors.toLogFormat(mediaError));
        // Continue with other media - don't fail the entire operation
      }
    }

    log.info(`${logId}: Completed sending ${mediaIds.length} media sync messages`);
  } catch (error) {
    log.error(`${logId}: Failed to send media sync messages:`, Errors.toLogFormat(error));
    // Don't throw - media sync is a best-effort operation
  }
}

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
  titleIv?: string,
  bodyIv?: string,
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
      ...(titleIv && { title_iv: titleIv }),
      ...(bodyIv && { body_iv: bodyIv }),
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

      // Update local orbital_media records with the correct threadId
      if (mediaIds && mediaIds.length > 0) {
        log.info(`${logId}: Updating threadId for ${mediaIds.length} media attachments`);
        for (const mediaId of mediaIds) {
          try {
            await DataWriter.updateOrbitalMediaThreadId(mediaId, threadId);
            log.info(`${logId}: Updated media ${mediaId} with threadId ${threadId}`);
          } catch (mediaError) {
            log.error(`${logId}: Failed to update media ${mediaId}:`, Errors.toLogFormat(mediaError));
          }
        }

        // Send OrbitalMediaSyncMessage to group members for each media attachment
        // This shares encryption keys so other users can decrypt the media
        await sendMediaSyncMessages(groupId, threadId, mediaIds);
      }

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

    // Merge: add threads we don't have locally, update reply counts for existing threads
    let addedCount = 0;
    let updatedCount = 0;
    for (const serverThread of serverThreads) {
      const existingThread = await DataReader.getOrbitalThread(serverThread.thread_id);

      if (!existingThread) {
        // New thread from another orbit member - save locally
        const thread: OrbitalThreadType = {
          id: serverThread.thread_id,
          groupId: serverThread.group_id,
          authorId: serverThread.author_id,
          authorUsername: serverThread.author_display_name || serverThread.author_username || '',
          encryptedTitle: serverThread.encrypted_title || '',
          encryptedBody: serverThread.encrypted_body || '',
          titleIv: serverThread.title_iv || '',
          bodyIv: serverThread.body_iv || '',
          createdAt: new Date(serverThread.created_at).getTime(),
          lastReplyAt: serverThread.last_reply_at ? new Date(serverThread.last_reply_at).getTime() : undefined,
          replyCount: serverThread.reply_count || 0,
          mediaCount: serverThread.media_count || 0,
          pendingSync: false, // Already on server
        };

        await DataWriter.saveOrbitalThread(thread);
        addedCount++;
        log.info(`${logId}: Added thread ${thread.id} from server`);
      } else {
        // Existing thread - update reply count if server has newer data
        const serverReplyCount = serverThread.reply_count || 0;
        const localReplyCount = existingThread.replyCount || 0;
        if (serverReplyCount !== localReplyCount) {
          const lastReplyAt = serverThread.last_reply_at
            ? new Date(serverThread.last_reply_at).getTime()
            : undefined;
          DataWriter.updateOrbitalThreadReplyCount(
            serverThread.thread_id,
            serverReplyCount,
            lastReplyAt
          );
          updatedCount++;
          log.info(`${logId}: Updated reply count for thread ${serverThread.thread_id}: ${localReplyCount} -> ${serverReplyCount}`);
        }
      }
    }

    if (addedCount > 0) {
      log.info(`${logId}: Added ${addedCount} new threads from server`);
      // TODO: Emit event to trigger UI refresh
    }
    if (updatedCount > 0) {
      log.info(`${logId}: Updated reply counts for ${updatedCount} existing threads`);
    }
  } catch (error) {
    log.error(`${logId}: Failed to sync threads from server`, Errors.toLogFormat(error));
  }
}

/**
 * Sync full orbit history with progress tracking
 *
 * Used when a new member joins an orbit to sync all historical threads.
 * Reports progress via callback for UI updates.
 *
 * @param groupId - The orbit/group ID to sync
 * @param onProgress - Optional callback for progress updates
 * @returns Sync statistics
 */
export async function syncOrbitHistory(
  groupId: string,
  onProgress?: (progress: {
    phase: 'threads' | 'complete';
    current: number;
    total: number;
    percent: number;
  }) => void
): Promise<{
  threadsAdded: number;
  threadsFailed: number;
  totalThreads: number;
}> {
  const logId = `syncOrbitHistory(${groupId})`;

  try {
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      log.warn(`${logId}: No JWT token, cannot sync`);
      return { threadsAdded: 0, threadsFailed: 0, totalThreads: 0 };
    }

    // Report starting
    onProgress?.({ phase: 'threads', current: 0, total: 0, percent: 0 });

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/threads/groups/${groupId}/threads`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    if (response.status === 404) {
      log.info(`${logId}: Group not found on backend, nothing to sync`);
      onProgress?.({ phase: 'complete', current: 0, total: 0, percent: 100 });
      return { threadsAdded: 0, threadsFailed: 0, totalThreads: 0 };
    }

    if (response.status !== 200) {
      log.warn(`${logId}: Server returned status ${response.status}`);
      return { threadsAdded: 0, threadsFailed: 0, totalThreads: 0 };
    }

    const data = JSON.parse(response.data);
    const serverThreads = data.threads || [];
    const totalThreads = serverThreads.length;

    log.info(`${logId}: Received ${totalThreads} threads from server`);

    let threadsAdded = 0;
    let threadsFailed = 0;

    // Process each thread and report progress
    for (let i = 0; i < serverThreads.length; i++) {
      const serverThread = serverThreads[i];

      try {
        const existingThread = await DataReader.getOrbitalThread(serverThread.thread_id);

        if (!existingThread) {
          // New thread from another orbit member - save locally
          const thread: OrbitalThreadType = {
            id: serverThread.thread_id,
            groupId: serverThread.group_id,
            authorId: serverThread.author_id,
            authorUsername: serverThread.author_display_name || serverThread.author_username || '',
            encryptedTitle: serverThread.encrypted_title || '',
            encryptedBody: serverThread.encrypted_body || '',
            titleIv: serverThread.title_iv || '',
            bodyIv: serverThread.body_iv || '',
            createdAt: new Date(serverThread.created_at).getTime(),
            lastReplyAt: serverThread.last_reply_at ? new Date(serverThread.last_reply_at).getTime() : undefined,
            replyCount: serverThread.reply_count || 0,
            mediaCount: serverThread.media_count || 0,
            pendingSync: false,
          };

          await DataWriter.saveOrbitalThread(thread);
          threadsAdded++;
          log.info(`${logId}: Added thread ${thread.id} from server`);
        }
      } catch (error) {
        threadsFailed++;
        log.error(`${logId}: Failed to save thread`, Errors.toLogFormat(error));
      }

      // Report progress
      const percent = Math.round(((i + 1) / totalThreads) * 100);
      onProgress?.({ phase: 'threads', current: i + 1, total: totalThreads, percent });
    }

    // Report completion
    onProgress?.({ phase: 'complete', current: totalThreads, total: totalThreads, percent: 100 });

    log.info(`${logId}: Sync complete. Added: ${threadsAdded}, Failed: ${threadsFailed}, Total: ${totalThreads}`);

    return { threadsAdded, threadsFailed, totalThreads };
  } catch (error) {
    log.error(`${logId}: Failed to sync orbit history`, Errors.toLogFormat(error));
    return { threadsAdded: 0, threadsFailed: 0, totalThreads: 0 };
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
        thread.encryptedBody,
        thread.titleIv || undefined,
        thread.bodyIv || undefined
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
 * Increment reply count for a thread in SQLCipher
 * Called when receiving WebSocket new_reply events from other users
 */
export async function incrementThreadReplyCount(
  threadId: string,
  lastReplyAt?: number
): Promise<void> {
  const logId = `incrementThreadReplyCount(${threadId})`;

  const thread = await DataReader.getOrbitalThread(threadId);
  if (thread) {
    const newReplyCount = (thread.replyCount || 0) + 1;
    DataWriter.updateOrbitalThreadReplyCount(threadId, newReplyCount, lastReplyAt);
    log.info(`${logId}: Incremented SQLCipher reply count to ${newReplyCount}`);
  } else {
    log.warn(`${logId}: Thread not found in SQLCipher, skipping reply count update`);
  }
}

/**
 * Update author username for all threads by a given author in SQLCipher
 * Called when receiving WebSocket display_name_changed events from other users
 */
export async function updateThreadsAuthorUsername(
  authorId: string,
  newUsername: string
): Promise<number> {
  const logId = `updateThreadsAuthorUsername(${authorId})`;

  const updatedCount = DataWriter.updateOrbitalThreadsAuthorUsername(authorId, newUsername);
  log.info(`${logId}: Updated ${updatedCount} threads with new username: ${newUsername}`);
  return updatedCount;
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
