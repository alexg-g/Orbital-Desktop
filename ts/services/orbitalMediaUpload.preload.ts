// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2025 Orbital

/**
 * Orbital Media Upload Service
 *
 * Handles chunked upload of encrypted media to Orbital relay server.
 *
 * Flow:
 * 1. Generate Signal attachment keys (64 bytes)
 * 2. Encrypt attachment to temp disk using Signal's AES-256-CBC + HMAC-SHA256
 * 3. Split encrypted file into 5MB chunks
 * 4. Upload chunks sequentially to server
 * 5. Finalize upload and save metadata to SQLCipher
 * 6. Clean up temp files
 *
 * Security:
 * - Attachment keys never leave client in plaintext
 * - Server receives only encrypted blob + metadata (no keys)
 * - Keys stored in SQLCipher, encrypted at rest
 * - Keys shared with orbit members via Signal Protocol encrypted messages
 */

import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
// TODO: Add streaming support for large files
// import { createReadStream } from 'node:fs';
// TODO: Add file metadata validation
// import { stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import * as https from 'node:https';
import * as http from 'node:http';
import { URL } from 'node:url';

import type { AttachmentWithHydratedData } from '../types/Attachment.std.js';
import type { OrbitalMediaAttachmentForIpc } from '../types/OrbitalMedia.std.js';
import {
  generateAttachmentKeys,
  encryptAttachmentV2ToDisk,
  safeUnlink,
} from '../AttachmentCrypto.node.js';
import { createLogger } from '../logging/log.std.js';
import * as Errors from '../types/errors.std.js';
import { strictAssert } from '../util/assert.std.js';
import { toBase64 } from '../Bytes.std.js';
import { DataWriter } from '../sql/Client.preload.js';
import { handleOrbitalAPIError } from './orbitalErrorHandler.preload.js';

const log = createLogger('OrbitalMediaUpload');

/**
 * Orbital API base URL
 */
const ORBITAL_API_URL = process.env.ORBITAL_API_URL || 'https://api.orbitl.org';

/**
 * Chunk size: 5MB (matches backend configuration)
 */
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Maximum file size: 500MB
 */
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

/**
 * Retry configuration
 */
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * Upload progress callback
 */
export type UploadProgressCallback = (progress: number) => void;

/**
 * Upload options
 */
export type UploadMediaOptions = {
  /**
   * Attachment data to upload
   */
  attachment: AttachmentWithHydratedData;

  /**
   * Group ID this media belongs to (backend expects group_id)
   */
  groupId: string;

  /**
   * Progress callback (0-100)
   */
  onProgress?: UploadProgressCallback;

  /**
   * Abort signal for cancellation
   */
  signal?: AbortSignal;

  /**
   * Function to get absolute attachment path from relative path
   */
  getAbsoluteAttachmentPath: (relativePath: string) => string;

  /**
   * Optional caption
   */
  caption?: string;

  /**
   * Uploader's member ID
   */
  uploadedBy?: string;
};

/**
 * Upload response from server
 */
type UploadChunkResponse = {
  success: boolean;
  chunkIndex: number;
  totalChunks: number;
};

type FinalizeUploadResponse = {
  media_id: string;
  expires_at: string; // ISO date string from backend
  uploaded_at: string; // ISO date string from backend
};

/**
 * Upload media to Orbital relay server
 *
 * This function:
 * 1. Generates Signal attachment keys (64 bytes)
 * 2. Encrypts attachment to temp disk
 * 3. Splits into 5MB chunks and uploads sequentially
 * 4. Finalizes upload on server
 * 5. Saves metadata to SQLCipher
 * 6. Cleans up temp files
 *
 * @param options Upload configuration
 * @returns OrbitalMediaAttachment with all metadata
 * @throws Error if upload fails, quota exceeded, or file too large
 */
export async function uploadMediaToOrbital(
  options: UploadMediaOptions
): Promise<OrbitalMediaAttachmentForIpc> {
  const {
    attachment,
    groupId,
    onProgress,
    signal,
    getAbsoluteAttachmentPath,
    caption,
    uploadedBy,
  } = options;

  const logId = 'uploadMediaToOrbital';

  // Validate file size
  const fileSize = attachment.size;
  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(
      `${logId}: File too large (${fileSize} bytes). Maximum is ${MAX_FILE_SIZE} bytes (500MB).`
    );
  }

  // Check abort signal
  if (signal?.aborted) {
    throw new Error(`${logId}: Upload aborted before starting`);
  }

  // Generate client-side UUID
  const id = uuidv4();

  log.info(`${logId}: Starting upload for ${id} (${fileSize} bytes)`);

  // Step 1: Generate Signal attachment keys
  const attachmentKeys = generateAttachmentKeys();
  log.info(`${logId}: Generated attachment keys`);

  // Step 2: Encrypt attachment to temp disk
  let encryptedPath: string | undefined;
  let encryptResult;

  try {
    encryptResult = await encryptAttachmentV2ToDisk({
      keys: attachmentKeys,
      needIncrementalMac: true,
      plaintext: { data: attachment.data },
      getAbsoluteAttachmentPath,
    });

    encryptedPath = getAbsoluteAttachmentPath(encryptResult.path);
    log.info(
      `${logId}: Encrypted to disk: ${encryptedPath} (${encryptResult.ciphertextSize} bytes)`
    );

    // Check abort signal after encryption
    if (signal?.aborted) {
      throw new Error(`${logId}: Upload aborted after encryption`);
    }

    // Step 3: Upload chunks
    const totalChunks = Math.ceil(encryptResult.ciphertextSize / CHUNK_SIZE);
    log.info(`${logId}: Uploading ${totalChunks} chunks`);

    let uploadedChunks = 0;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      // Check abort signal before each chunk
      if (signal?.aborted) {
        throw new Error(`${logId}: Upload aborted at chunk ${chunkIndex}`);
      }

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, encryptResult.ciphertextSize);
      const chunkSize = end - start;

      // Read chunk from encrypted file
      const chunkData = await readChunk(encryptedPath, start, chunkSize);

      // Upload chunk with retry logic
      await uploadChunkWithRetry({
        id,
        groupId,
        chunkIndex,
        totalChunks,
        chunkData,
        isFirstChunk: chunkIndex === 0,
        encryptedMetadata:
          chunkIndex === 0
            ? {
                digest: toBase64(encryptResult.digest),
                size: fileSize,
                contentType: attachment.contentType,
                fileName: attachment.fileName,
                blurHash: attachment.blurHash,
                width: attachment.width,
                height: attachment.height,
                duration: attachment.duration,
                incrementalMac: encryptResult.incrementalMac
                  ? toBase64(encryptResult.incrementalMac)
                  : undefined,
                chunkSize: encryptResult.chunkSize,
                caption,
              }
            : undefined,
        encryptionIv: chunkIndex === 0 ? toBase64(encryptResult.iv) : undefined,
        signal,
      });

      uploadedChunks++;
      const progress = (uploadedChunks / totalChunks) * 100;
      onProgress?.(progress);

      log.info(
        `${logId}: Uploaded chunk ${chunkIndex + 1}/${totalChunks} (${Math.round(
          progress
        )}%)`
      );
    }

    // Step 4: Finalize upload
    const finalizeResponse = await finalizeUpload({
      id,
      groupId,
      signal,
    });

    // Backend returns snake_case with ISO date strings, convert to camelCase with Unix timestamps
    const mediaId = finalizeResponse.media_id;
    // SQLCipher expects INTEGER timestamps (milliseconds), backend returns ISO strings
    const uploadedAt = new Date(finalizeResponse.uploaded_at).getTime();
    const expiresAt = new Date(finalizeResponse.expires_at).getTime();

    log.info(`${logId}: Finalized upload: ${mediaId}`);

    // Step 5: Save to SQLCipher
    // Store with empty threadId since media is not yet associated with a thread
    // After thread/reply creation, the threadId will be updated
    // We create the IPC-safe format directly since that's what we return
    const mediaForIpc: OrbitalMediaAttachmentForIpc = {
      id,
      mediaId,
      threadId: '', // Empty - will be updated after thread/reply creation
      groupId, // Store group_id directly for File Library Browser filtering
      attachmentKeys: toBase64(attachmentKeys), // Base64 for IPC safety
      plaintextHash: encryptResult.plaintextHash,
      digest: toBase64(encryptResult.digest),
      incrementalMac: encryptResult.incrementalMac
        ? toBase64(encryptResult.incrementalMac)
        : undefined,
      chunkSize: encryptResult.chunkSize,
      size: fileSize,
      contentType: attachment.contentType,
      fileName: attachment.fileName,
      blurHash: attachment.blurHash,
      width: attachment.width,
      height: attachment.height,
      duration: attachment.duration,
      expiresAt,
      localPath: null, // Not downloaded yet (we just uploaded)
      downloaded: 0,
      createdAt: uploadedAt,
      caption,
      uploadedBy,
    };

    await DataWriter.saveOrbitalMedia(mediaForIpc);
    log.info(`${logId}: Saved to SQLCipher`);

    // NOTE: Media sync messages are sent AFTER thread/reply creation
    // when the media is associated with a threadId. See syncThreadToServer()
    // in orbitalThreads.preload.ts for the actual sync message sending.
    // At this point, threadId is empty and will be updated later.

    // Return IPC-safe format to prevent "object could not be cloned" errors
    // All callers only need mediaId, but this ensures the full object is serializable
    return mediaForIpc;
  } catch (error) {
    log.error(`${logId}: Upload failed`, Errors.toLogFormat(error));

    // Handle 401 errors (show login modal, clear JWT)
    await handleOrbitalAPIError(error);

    throw error;
  } finally {
    // Step 6: Clean up temp encrypted file
    if (encryptedPath) {
      try {
        await safeUnlink(encryptedPath);
        log.info(`${logId}: Cleaned up temp file: ${encryptedPath}`);
      } catch (cleanupError) {
        log.error(
          `${logId}: Failed to clean up temp file`,
          Errors.toLogFormat(cleanupError)
        );
      }
    }
  }
}

/**
 * Read a chunk from a file
 */
async function readChunk(
  filePath: string,
  start: number,
  size: number
): Promise<Uint8Array> {
  let fileHandle: FileHandle | undefined;

  try {
    fileHandle = await open(filePath, 'r');
    const buffer = new Uint8Array(size);
    const { bytesRead } = await fileHandle.read(buffer, 0, size, start);

    strictAssert(
      bytesRead === size,
      `Expected to read ${size} bytes, got ${bytesRead}`
    );

    return buffer;
  } finally {
    await fileHandle?.close();
  }
}

/**
 * Upload a single chunk with retry logic
 */
async function uploadChunkWithRetry(params: {
  id: string;
  groupId: string;
  chunkIndex: number;
  totalChunks: number;
  chunkData: Uint8Array;
  isFirstChunk: boolean;
  encryptedMetadata?: {
    digest: string;
    size: number;
    contentType: string;
    fileName?: string;
    blurHash?: string;
    width?: number;
    height?: number;
    duration?: number;
    incrementalMac?: string;
    chunkSize?: number;
    caption?: string;
  };
  encryptionIv?: string;
  signal?: AbortSignal;
}): Promise<void> {
  const { id, chunkIndex, signal } = params;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new Error('Upload aborted during retry');
    }

    try {
      await uploadChunk(params);
      return; // Success
    } catch (error) {
      lastError = error as Error;
      log.warn(
        `uploadChunkWithRetry(${id}, chunk ${chunkIndex}): Attempt ${
          attempt + 1
        } failed`,
        Errors.toLogFormat(error)
      );

      // Don't retry on abort or quota errors
      if (
        signal?.aborted ||
        (error as any).status === 403 || // Quota exceeded
        (error as any).status === 401 // Unauthorized
      ) {
        throw error;
      }

      // Exponential backoff
      if (attempt < MAX_RETRIES - 1) {
        const delay = INITIAL_RETRY_DELAY * 2 ** attempt;
        log.info(
          `uploadChunkWithRetry(${id}, chunk ${chunkIndex}): Retrying in ${delay}ms`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to upload chunk ${chunkIndex} after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
}

/**
 * Helper to make HTTP/HTTPS requests using Node.js built-in modules
 * (works in preload context, unlike Electron's net module which is main-process-only)
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

/**
 * Build multipart/form-data body
 */
function buildMultipartFormData(fields: {
  [key: string]: string | Uint8Array;
}): { body: Buffer; boundary: string } {
  const boundary = `----OrbitalFormBoundary${randomBytes(16).toString('hex')}`;
  const parts: Array<Buffer> = [];

  Object.entries(fields).forEach(([name, value]) => {
    // Add boundary
    parts.push(Buffer.from(`--${boundary}\r\n`));

    if (typeof value === 'string') {
      // Text field
      parts.push(
        Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`)
      );
      parts.push(Buffer.from(`${value}\r\n`));
    } else {
      // Binary field (chunk data)
      parts.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${name}"; filename="chunk"\r\n` +
            'Content-Type: application/octet-stream\r\n\r\n'
        )
      );
      parts.push(Buffer.from(value));
      parts.push(Buffer.from('\r\n'));
    }
  });

  // Final boundary
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    boundary,
  };
}

/**
 * Upload a single chunk to the server
 */
async function uploadChunk(params: {
  id: string;
  groupId: string;
  chunkIndex: number;
  totalChunks: number;
  chunkData: Uint8Array;
  isFirstChunk: boolean;
  encryptedMetadata?: {
    digest: string;
    size: number;
    contentType: string;
    fileName?: string;
    blurHash?: string;
    width?: number;
    height?: number;
    duration?: number;
    incrementalMac?: string;
    chunkSize?: number;
    caption?: string;
  };
  encryptionIv?: string;
  signal?: AbortSignal;
}): Promise<UploadChunkResponse> {
  const {
    id,
    groupId,
    chunkIndex,
    totalChunks,
    chunkData,
    isFirstChunk,
    encryptedMetadata,
    encryptionIv,
    signal,
  } = params;

  // Build multipart form data with snake_case field names (backend expects these)
  const fields: { [key: string]: string | Uint8Array } = {
    media_id: id,
    group_id: groupId,
    chunk_index: chunkIndex.toString(),
    total_chunks: totalChunks.toString(),
    chunk: chunkData,
  };

  // Add metadata on first chunk
  if (isFirstChunk && encryptedMetadata) {
    fields.encrypted_metadata = JSON.stringify(encryptedMetadata);
  }

  // Add encryption IV on first chunk (required by backend)
  if (isFirstChunk && encryptionIv) {
    fields.encryption_iv = encryptionIv;
  }

  const { body, boundary } = buildMultipartFormData(fields);

  // Make request using Electron net module
  // Get JWT token for authentication
  const { getJWT } = await import('./orbitalAuth.preload.js');
  const jwtToken = await getJWT();

  if (!jwtToken) {
    throw new Error('Not authenticated. Please log in first.');
  }

  const response = await makeRequest({
    url: `${ORBITAL_API_URL}/api/media/upload/chunk`,
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Authorization': `Bearer ${jwtToken}`,
    },
    body,
    signal,
  });

  if (response.status !== 200) {
    throw new Error(
      `Upload chunk failed: ${response.status} ${response.statusText}: ${response.data}`
    );
  }

  return JSON.parse(response.data);
}

/**
 * Finalize upload on server
 */
async function finalizeUpload(params: {
  id: string;
  groupId: string;
  signal?: AbortSignal;
}): Promise<FinalizeUploadResponse> {
  const { id, groupId, signal } = params;

  // Backend expects snake_case field names
  const requestBody = JSON.stringify({
    media_id: id,
    group_id: groupId,
  });

  // Get JWT token for authentication
  const { getJWT } = await import('./orbitalAuth.preload.js');
  const jwtToken = await getJWT();

  if (!jwtToken) {
    throw new Error('Not authenticated. Please log in first.');
  }

  const response = await makeRequest({
    url: `${ORBITAL_API_URL}/api/media/upload/complete`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwtToken}`,
    },
    body: Buffer.from(requestBody),
    signal,
  });

  // Accept both 200 and 201 (Created) as success
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(
      `Finalize upload failed: ${response.status} ${response.statusText}: ${response.data}`
    );
  }

  return JSON.parse(response.data);
}

/**
 * Send media sync message to group
 *
 * Broadcasts media metadata and encryption keys to all orbit members
 * via Signal Protocol encrypted group message.
 *
 * The server cannot read this message - encryption keys are end-to-end encrypted.
 *
 * @param params Group ID and media metadata
 */
async function sendMediaSyncMessage(params: {
  groupId: string;
  media: OrbitalMediaAttachmentForIpc;
}): Promise<void> {
  const { groupId, media } = params;
  const logId = `sendMediaSyncMessage(${media.mediaId})`;

  try {
    // Import OrbitalMediaSyncMessage type
    const { OrbitalMediaSyncMessage } = await import('../types/OrbitalMedia.std.js');

    // Build the sync message payload
    const syncMessage: import('../types/OrbitalMedia.std.js').OrbitalMediaSyncMessage = {
      type: 'orbital-media-sync',
      id: media.id,
      mediaId: media.mediaId,
      threadId: media.threadId,
      attachmentKeys: media.attachmentKeys, // Already base64 string
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
      uploadedBy: media.uploadedBy || '',
      createdAt: media.createdAt,
    };

    // Serialize to JSON for transmission
    const messageBody = JSON.stringify(syncMessage);

    // Get the conversation for this group
    const conversation = window.ConversationController.get(groupId);
    if (!conversation) {
      throw new Error(`Group conversation not found: ${groupId}`);
    }

    // Send as a Signal Protocol encrypted message
    // The message body contains the JSON payload
    // Signal Protocol ensures end-to-end encryption
    await conversation.queueJob('sendMediaSyncMessage', async () => {
      const message = await conversation.sendMessage({
        body: messageBody,
        // No attachments - this is just metadata
        attachments: [],
        // No mentions
        mentions: [],
        // No preview
        preview: [],
        // No quote
        quote: undefined,
        // No sticker
        sticker: undefined,
      });

      log.info(`${logId}: Media sync message sent`, {
        messageId: message?.id,
        groupId,
        mediaId: media.mediaId,
      });
    });
  } catch (error) {
    log.error(`${logId}: Failed to send media sync message`, Errors.toLogFormat(error));
    throw error;
  }
}
