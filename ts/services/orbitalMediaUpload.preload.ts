// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

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

import { open, unlink, stat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

import type { AttachmentWithHydratedData } from '../types/Attachment.std.js';
import type { OrbitalMediaAttachment } from '../types/OrbitalMedia.std.js';
import {
  generateAttachmentKeys,
  encryptAttachmentV2ToDisk,
  safeUnlink,
} from '../AttachmentCrypto.node.js';
import { createLogger } from '../logging/log.std.js';
import * as Errors from '../types/errors.std.js';
import { strictAssert } from '../util/assert.std.js';
import { toBase64, toHex } from '../Bytes.std.js';
import { DataWriter } from '../sql/Client.preload.js';

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
   * Thread ID this media belongs to
   */
  threadId: string;

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
  mediaId: string;
  expiresAt: number;
  uploadedAt: number;
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
): Promise<OrbitalMediaAttachment> {
  const {
    attachment,
    threadId,
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
        threadId,
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
      threadId,
      signal,
    });

    log.info(`${logId}: Finalized upload: ${finalizeResponse.mediaId}`);

    // Step 5: Save to SQLCipher
    const media: OrbitalMediaAttachment = {
      id,
      mediaId: finalizeResponse.mediaId,
      threadId,
      attachmentKeys,
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
      expiresAt: finalizeResponse.expiresAt,
      localPath: null, // Not downloaded yet (we just uploaded)
      downloaded: 0,
      createdAt: finalizeResponse.uploadedAt,
      caption,
      uploadedBy,
    };

    await DataWriter.saveOrbitalMedia(media);
    log.info(`${logId}: Saved to SQLCipher`);

    return media;
  } catch (error) {
    log.error(`${logId}: Upload failed`, Errors.toLogFormat(error));
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
  threadId: string;
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
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
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
 * Upload a single chunk to the server
 */
async function uploadChunk(params: {
  id: string;
  threadId: string;
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
  signal?: AbortSignal;
}): Promise<UploadChunkResponse> {
  const {
    id,
    threadId,
    chunkIndex,
    totalChunks,
    chunkData,
    isFirstChunk,
    encryptedMetadata,
    signal,
  } = params;

  // Build form data
  const formData = new FormData();
  formData.append('id', id);
  formData.append('threadId', threadId);
  formData.append('chunkIndex', chunkIndex.toString());
  formData.append('totalChunks', totalChunks.toString());
  formData.append(
    'chunk',
    new Blob([chunkData], { type: 'application/octet-stream' })
  );

  // Add metadata on first chunk
  if (isFirstChunk && encryptedMetadata) {
    formData.append('metadata', JSON.stringify(encryptedMetadata));
  }

  // Make request
  const response = await fetch(`${ORBITAL_API_URL}/api/media/upload/chunk`, {
    method: 'POST',
    body: formData,
    signal,
    // TODO: Add JWT authentication header
    // headers: {
    //   'Authorization': `Bearer ${getJWT()}`,
    // },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Upload chunk failed: ${response.status} ${response.statusText}: ${errorText}`
    );
  }

  return response.json();
}

/**
 * Finalize upload on server
 */
async function finalizeUpload(params: {
  id: string;
  threadId: string;
  signal?: AbortSignal;
}): Promise<FinalizeUploadResponse> {
  const { id, threadId, signal } = params;

  const response = await fetch(`${ORBITAL_API_URL}/api/media/upload/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // TODO: Add JWT authentication
      // 'Authorization': `Bearer ${getJWT()}`,
    },
    body: JSON.stringify({ id, threadId }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Finalize upload failed: ${response.status} ${response.statusText}: ${errorText}`
    );
  }

  return response.json();
}
