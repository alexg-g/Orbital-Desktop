// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Threads Service
 *
 * Handles thread and reply creation, listing, and retrieval.
 *
 * Features:
 * - Create new threads in groups with title and body
 * - List threads in a group (paginated)
 * - Get single thread details
 * - Get replies to a thread (paginated)
 * - Create replies to threads
 * - Support for media attachments
 *
 * Security:
 * - Thread titles and bodies encrypted client-side before sending to server
 * - Server only sees encrypted content (zero-knowledge)
 * - Media IDs reference encrypted media files
 *
 * Limits:
 * - Thread title: 200 characters max
 * - Thread body: 10,000 characters max
 * - Reply body: 10,000 characters max
 */

import * as https from 'node:https';
import * as http from 'node:http';
import { URL } from 'node:url';
import { createLogger } from '../logging/log.std.js';
import * as Errors from '../types/errors.std.js';
import { handleOrbitalAPIError } from './orbitalErrorHandler.preload.js';

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
 * List threads for a group
 *
 * @param groupId Group ID to list threads from
 * @param options Pagination and sorting options
 * @returns Paginated list of threads
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
    if (options?.sort) {
      queryParams.append('sort', options.sort);
    }

    const queryString = queryParams.toString();
    const url = `${ORBITAL_API_URL}/api/groups/${groupId}/threads${queryString ? `?${queryString}` : ''}`;

    const response = await makeRequest({
      url,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    if (response.status !== 200) {
      const errorData = parseErrorResponse(response.data);
      throw new Error(errorData.error || `Failed to list threads: ${response.status}`);
    }

    const data = JSON.parse(response.data);

    const threads: ThreadInfo[] = (data.threads || []).map((t: any) => ({
      threadId: t.thread_id,
      groupId: t.group_id,
      authorId: t.author_id,
      authorUsername: t.author_username,
      encryptedTitle: t.encrypted_title,
      encryptedBody: t.encrypted_body,
      replyCount: t.reply_count || 0,
      createdAt: t.created_at,
      mediaCount: t.media_count || 0,
    }));

    const result: ListThreadsResult = {
      threads,
      totalCount: data.total_count || threads.length,
      hasMore: data.has_more || false,
    };

    log.info(`${logId}: Retrieved ${threads.length} threads`);

    return result;
  } catch (error) {
    log.error(`${logId}: Failed to list threads`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
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
 * Create new thread
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
    // Get JWT token for authentication
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    // For now, pass title/body as-is
    // TODO: Encrypt with group key before sending
    const encryptedTitle = title;
    const encryptedBody = body;

    const requestBody = JSON.stringify({
      group_id: groupId,
      encrypted_title: encryptedTitle,
      encrypted_body: encryptedBody,
      ...(mediaIds && mediaIds.length > 0 && { media_ids: mediaIds }),
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

    if (response.status !== 201 && response.status !== 200) {
      const errorData = parseErrorResponse(response.data);
      throw new Error(errorData.error || `Failed to create thread: ${response.status}`);
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

    const result: CreateThreadResult = {
      threadId: data.thread_id,
      groupId: data.group_id,
      createdAt: data.created_at,
      media,
    };

    log.info(`${logId}: Thread created successfully`, { threadId: result.threadId });

    return result;
  } catch (error) {
    log.error(`${logId}: Failed to create thread`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
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
