// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2025 Orbital

/**
 * Orbital Media Download Service
 *
 * Handles download and decryption of media from Orbital relay server.
 *
 * Flow:
 * 1. Check if media already downloaded (query SQLCipher)
 * 2. If not downloaded:
 *    a. Fetch encrypted blob from server
 *    b. Stream to temp file with progress tracking
 *    c. Decrypt using Signal's AES-256-CBC + verify HMAC-SHA256
 *    d. Verify MAC and plaintext hash
 *    e. Save decrypted file to permanent local storage
 *    f. Update SQLCipher: set downloaded=1 and local_path
 * 3. Return local file path
 *
 * Security:
 * - MAC validation before using downloaded media
 * - Plaintext hash verification after decryption
 * - Temp files cleaned up securely on error
 * - Attachment keys retrieved from SQLCipher (encrypted at rest)
 */

import { Readable } from 'node:stream';
import * as https from 'node:https';
import * as http from 'node:http';
import { URL } from 'node:url';
import { fromBase64 } from '../Bytes.std.js';

import {
  decryptAttachmentV2,
  safeUnlink,
} from '../AttachmentCrypto.node.js';
import { createLogger } from '../logging/log.std.js';
import * as Errors from '../types/errors.std.js';
import { strictAssert } from '../util/assert.std.js';
import { DataReader, DataWriter } from '../sql/Client.preload.js';
import { handleOrbitalAPIError } from './orbitalErrorHandler.preload.js';

const log = createLogger('OrbitalMediaDownload');

/**
 * Orbital API base URL
 */
const ORBITAL_API_URL = process.env.ORBITAL_API_URL || 'https://api.orbitl.org';

/**
 * Download progress callback
 */
export type DownloadProgressCallback = (progress: number) => void;

/**
 * Download options
 */
export type DownloadMediaOptions = {
  /**
   * Media ID to download
   */
  mediaId: string;

  /**
   * Progress callback (0-100)
   */
  onProgress?: DownloadProgressCallback;

  /**
   * Abort signal for cancellation
   */
  signal?: AbortSignal;

  /**
   * Function to get absolute attachment path from relative path
   */
  getAbsoluteAttachmentPath: (relativePath: string) => string;
};

/**
 * Retry configuration
 */
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * Download media from Orbital relay server
 *
 * This function:
 * 1. Checks if media already downloaded locally
 * 2. If not downloaded:
 *    - Downloads encrypted blob from server
 *    - Decrypts with attachment keys from SQLCipher
 *    - Verifies MAC and plaintext hash
 *    - Saves to permanent local storage
 *    - Updates SQLCipher with download status
 * 3. Returns local file path
 *
 * @param options Download configuration
 * @returns Local file path (absolute)
 * @throws Error if download fails, media expired, or MAC validation fails
 */
export async function downloadMediaFromOrbital(
  options: DownloadMediaOptions
): Promise<string> {
  const { mediaId, onProgress, signal, getAbsoluteAttachmentPath } = options;

  const logId = `downloadMediaFromOrbital(${mediaId})`;

  // Check abort signal
  if (signal?.aborted) {
    throw new Error(`${logId}: Download aborted before starting`);
  }

  // Step 1: Check if already downloaded
  const media = await DataReader.getOrbitalMedia(mediaId);

  if (!media) {
    throw new Error(`${logId}: Media not found in database`);
  }

  // If already downloaded, return local path
  if (media.downloaded === 1 && media.localPath) {
    const absolutePath = getAbsoluteAttachmentPath(media.localPath);
    log.info(`${logId}: Already downloaded: ${absolutePath}`);
    return absolutePath;
  }

  log.info(`${logId}: Starting download (${media.size} bytes)`);

  // Step 2: Check if media expired on server
  if (media.expiresAt < Date.now()) {
    // Media expired on server, need to recover from other orbit members
    throw new Error(
      `${logId}: Media expired on server (expired at ${new Date(
        media.expiresAt
      ).toISOString()}). Recovery from orbit members not yet implemented.`
    );
  }

  // Step 3: Download encrypted blob with retry
  let decryptedPath: string | undefined;

  try {
    // Download encrypted blob
    const encryptedBlob = await downloadEncryptedBlobWithRetry({
      mediaId,
      threadId: media.threadId,
      expectedSize: media.size,
      onProgress: progress => onProgress?.(progress * 0.5), // First 50% for download
      signal,
    });

    log.info(
      `${logId}: Downloaded encrypted blob (${encryptedBlob.byteLength} bytes)`
    );

    // Check abort signal after download
    if (signal?.aborted) {
      throw new Error(`${logId}: Download aborted after fetching blob`);
    }

    // Step 4: Decrypt blob
    onProgress?.(50); // 50% - starting decryption

    // Convert attachment keys from base64 string to Uint8Array for decryption
    // Signal pattern: binary data crosses IPC as base64, convert back when needed
    const attachmentKeysBytes = fromBase64(media.attachmentKeys);

    const decryptResult = await decryptAttachmentV2({
      idForLogging: mediaId,
      ciphertextStream: Readable.from([Buffer.from(encryptedBlob)]),
      size: media.size,
      type: 'standard',
      aesKey: attachmentKeysBytes.subarray(0, 32),
      macKey: attachmentKeysBytes.subarray(32, 64),
      theirIncrementalMac: media.incrementalMac
        ? fromBase64(media.incrementalMac)
        : undefined,
      theirChunkSize: media.chunkSize,
      integrityCheck: {
        type: 'plaintext',
        plaintextHash: Buffer.from(media.plaintextHash, 'hex'),
      },
      getAbsoluteAttachmentPath,
    });

    decryptedPath = getAbsoluteAttachmentPath(decryptResult.path);
    log.info(`${logId}: Decrypted to: ${decryptedPath}`);

    // Verify plaintext hash matches
    strictAssert(
      decryptResult.plaintextHash === media.plaintextHash,
      `${logId}: Plaintext hash mismatch! Expected ${media.plaintextHash}, got ${decryptResult.plaintextHash}`
    );

    onProgress?.(90); // 90% - verification complete

    // Step 5: Update SQLCipher
    await DataWriter.updateMediaDownloadStatus(mediaId, decryptResult.path);
    log.info(`${logId}: Updated database with download status`);

    onProgress?.(100); // 100% - complete

    return decryptedPath;
  } catch (error) {
    log.error(`${logId}: Download failed`, Errors.toLogFormat(error));

    // Handle 401 errors (show login modal, clear JWT)
    await handleOrbitalAPIError(error);

    // Clean up temp decrypted file on error
    if (decryptedPath) {
      try {
        await safeUnlink(decryptedPath);
        log.info(`${logId}: Cleaned up temp decrypted file`);
      } catch (cleanupError) {
        log.error(
          `${logId}: Failed to clean up temp file`,
          Errors.toLogFormat(cleanupError)
        );
      }
    }

    throw error;
  }
}

/**
 * Download encrypted blob with retry logic
 */
async function downloadEncryptedBlobWithRetry(params: {
  mediaId: string;
  threadId: string;
  expectedSize: number;
  onProgress?: DownloadProgressCallback;
  signal?: AbortSignal;
}): Promise<Uint8Array> {
  const { mediaId, signal } = params;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new Error('Download aborted during retry');
    }

    try {
      return await downloadEncryptedBlob(params);
    } catch (error) {
      lastError = error as Error;
      log.warn(
        `downloadEncryptedBlobWithRetry(${mediaId}): Attempt ${
          attempt + 1
        } failed`,
        Errors.toLogFormat(error)
      );

      // Don't retry on abort or 404 (not found)
      if (
        signal?.aborted ||
        (error as any).status === 404 || // Not found
        (error as any).status === 401 // Unauthorized
      ) {
        throw error;
      }

      // Exponential backoff
      if (attempt < MAX_RETRIES - 1) {
        const delay = INITIAL_RETRY_DELAY * 2 ** attempt;
        log.info(
          `downloadEncryptedBlobWithRetry(${mediaId}): Retrying in ${delay}ms`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to download after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
}

/**
 * Download encrypted blob from server
 */
async function downloadEncryptedBlob(params: {
  mediaId: string;
  threadId: string;
  expectedSize: number;
  onProgress?: DownloadProgressCallback;
  signal?: AbortSignal;
}): Promise<Uint8Array> {
  const { mediaId, expectedSize, onProgress, signal } = params;
  // Note: threadId is not sent - backend verifies group membership via media's group_id

  // Make request using Node.js https/http module
  const url = `${ORBITAL_API_URL}/api/media/${mediaId}/download`;

  // Get JWT token for authentication (before Promise)
  const { getJWT } = await import('./orbitalAuth.preload.js');
  const jwtToken = await getJWT();

  if (!jwtToken) {
    throw new Error('Not authenticated. Please log in first.');
  }

  const chunks: Array<Buffer> = [];
  let downloadedBytes = 0;
  let responseStatus = 0;
  let responseStatusText = '';

  await new Promise<void>((resolve, reject) => {
    // Parse URL to determine protocol
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    };

    const request = httpModule.request(requestOptions, response => {
      responseStatus = response.statusCode || 0;
      responseStatusText = response.statusMessage || '';

      response.on('data', (chunk: Buffer) => {
        if (responseStatus !== 200) {
          // Collect error response
          chunks.push(chunk);
        } else {
          // Collect download data
          chunks.push(chunk);
          downloadedBytes += chunk.byteLength;

          // Report progress
          if (expectedSize > 0) {
            const progress = Math.min(
              100,
              (downloadedBytes / expectedSize) * 100
            );
            onProgress?.(progress);
          }
        }
      });

      response.on('end', () => {
        signal?.removeEventListener('abort', abortHandler);

        if (responseStatus !== 200) {
          const errorText = Buffer.concat(chunks).toString();
          const error = new Error(
            `Download failed: ${responseStatus} ${responseStatusText}: ${errorText}`
          ) as Error & { status: number };
          error.status = responseStatus;
          reject(error);
        } else {
          resolve();
        }
      });

      response.on('error', error => {
        signal?.removeEventListener('abort', abortHandler);
        reject(error);
      });
    });

    // Handle abort signal
    const abortHandler = () => {
      request.destroy();
      reject(new Error('Download aborted'));
    };
    signal?.addEventListener('abort', abortHandler);

    request.on('error', error => {
      signal?.removeEventListener('abort', abortHandler);
      reject(error);
    });

    // GET request - no body to write
    request.end();
  });

  // Concatenate chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  log.info(
    `downloadEncryptedBlob(${mediaId}): Downloaded ${result.byteLength} bytes`
  );

  return result;
}

/**
 * Get download progress for a media item
 *
 * Useful for displaying download status in UI
 */
export async function getMediaDownloadStatus(mediaId: string): Promise<{
  isDownloaded: boolean;
  isAvailableOnServer: boolean;
  expiresAt: number;
  localPath: string | null;
}> {
  const media = await DataReader.getOrbitalMedia(mediaId);

  if (!media) {
    throw new Error(`Media not found: ${mediaId}`);
  }

  return {
    isDownloaded: media.downloaded === 1,
    isAvailableOnServer: media.expiresAt > Date.now(),
    expiresAt: media.expiresAt,
    localPath: media.localPath,
  };
}

/**
 * Cancel ongoing download
 *
 * Use AbortController to cancel downloads
 */
export function createDownloadController(): AbortController {
  return new AbortController();
}

/**
 * Download all pending media
 *
 * Downloads all media that hasn't been downloaded yet but is still available
 * on the server (not expired). Useful for initial sync or background sync.
 *
 * @param options Configuration options
 * @returns Summary of download results
 */
export async function downloadAllPendingMedia(options: {
  /**
   * Maximum number of concurrent downloads
   */
  concurrency?: number;

  /**
   * Progress callback for overall progress (0-100)
   */
  onProgress?: (progress: number, current: number, total: number) => void;

  /**
   * Abort signal to cancel all pending downloads
   */
  signal?: AbortSignal;

  /**
   * Function to get absolute attachment path from relative path
   */
  getAbsoluteAttachmentPath: (relativePath: string) => string;
}): Promise<{
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{ mediaId: string; error: string }>;
}> {
  const logId = 'downloadAllPendingMedia';
  const { concurrency = 3, onProgress, signal, getAbsoluteAttachmentPath } = options;

  // Get all pending downloads
  const pendingMedia = await DataReader.getPendingDownloads();

  if (pendingMedia.length === 0) {
    log.info(`${logId}: No pending downloads`);
    return { successful: 0, failed: 0, skipped: 0, errors: [] };
  }

  log.info(`${logId}: Starting download of ${pendingMedia.length} media items`);

  let successful = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ mediaId: string; error: string }> = [];

  // Process downloads with limited concurrency
  const queue = [...pendingMedia];
  const inProgress: Array<Promise<void>> = [];

  async function processOne(): Promise<void> {
    while (queue.length > 0) {
      // Check abort signal
      if (signal?.aborted) {
        log.info(`${logId}: Download aborted by user`);
        return;
      }

      const media = queue.shift();
      if (!media) {
        break;
      }

      const mediaId = media.mediaId;

      // Skip expired media
      if (media.expiresAt < Date.now()) {
        log.warn(`${logId}: Skipping expired media ${mediaId}`);
        skipped += 1;
        updateProgress();
        continue;
      }

      try {
        await downloadMediaFromOrbital({
          mediaId,
          getAbsoluteAttachmentPath,
          signal,
        });

        successful += 1;
        log.info(`${logId}: Downloaded ${mediaId} (${successful}/${pendingMedia.length})`);
      } catch (error) {
        failed += 1;
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ mediaId, error: errorMessage });
        log.error(`${logId}: Failed to download ${mediaId}`, Errors.toLogFormat(error));
      }

      updateProgress();
    }
  }

  function updateProgress(): void {
    const completed = successful + failed + skipped;
    const progress = Math.round((completed / pendingMedia.length) * 100);
    onProgress?.(progress, completed, pendingMedia.length);
  }

  // Start concurrent downloads
  for (let i = 0; i < concurrency; i++) {
    inProgress.push(processOne());
  }

  // Wait for all downloads to complete
  await Promise.all(inProgress);

  log.info(
    `${logId}: Complete. Successful: ${successful}, Failed: ${failed}, Skipped: ${skipped}`
  );

  return { successful, failed, skipped, errors };
}

/**
 * Get count of pending downloads
 *
 * @returns Number of media items waiting to be downloaded
 */
export async function getPendingDownloadCount(): Promise<number> {
  const pendingMedia = await DataReader.getPendingDownloads();
  return pendingMedia.length;
}

/**
 * Check if there are any expired media that need recovery
 *
 * @returns Array of media IDs that have expired but aren't downloaded
 */
export async function getExpiredUndownloadedMedia(): Promise<string[]> {
  // getPendingDownloads returns media where expiresAt > now, so we need to
  // query all non-downloaded media and filter for expired ones
  // For now, return empty array - this needs a separate DAL method
  // TODO: Add getExpiredUndownloadedMedia to DAL
  return [];
}
