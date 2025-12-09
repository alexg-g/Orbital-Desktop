// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Media Sync Service
 *
 * Handles incoming OrbitalMediaSyncMessage from other orbit members.
 * When a user uploads media to a thread, they send a sync message to all
 * group members containing the encryption keys and metadata.
 *
 * This service:
 * 1. Receives OrbitalMediaSyncMessage via Signal Protocol encrypted messages
 * 2. Creates local orbital_media records with encryption keys
 * 3. Queues media for automatic download
 * 4. Triggers background download of pending media
 *
 * Security:
 * - Attachment keys transmitted ONLY via Signal Protocol E2EE
 * - Server never sees decryption keys
 * - Keys stored encrypted at rest in SQLCipher
 */

import { createLogger } from '../logging/log.std.js';
import * as Errors from '../types/errors.std.js';
import { DataWriter, DataReader } from '../sql/Client.preload.js';
import type { OrbitalMediaSyncMessage } from '../types/OrbitalMedia.std.js';
import { downloadAllPendingMedia } from './orbitalMediaDownload.preload.js';

const log = createLogger('OrbitalMediaSync');

/**
 * Handle incoming OrbitalMediaSyncMessage
 *
 * Called when receiving a media sync message from another orbit member.
 * Creates local orbital_media record and triggers download.
 *
 * @param syncMessage The media sync message from Signal Protocol
 * @param getAbsoluteAttachmentPath Function to convert relative paths to absolute
 * @returns Promise that resolves when sync message is processed
 */
export async function handleMediaSyncMessage(
  syncMessage: OrbitalMediaSyncMessage,
  getAbsoluteAttachmentPath: (relativePath: string) => string
): Promise<void> {
  const { id, mediaId, threadId } = syncMessage;
  const logId = `handleMediaSyncMessage(${mediaId})`;

  try {
    log.info(`${logId}: Processing media sync message`, {
      id,
      mediaId,
      threadId,
      size: syncMessage.size,
      contentType: syncMessage.contentType,
    });

    // Check if we already have this media
    const existing = await DataReader.getOrbitalMedia(id);
    if (existing) {
      log.info(`${logId}: Media already exists locally, skipping sync`, {
        downloaded: existing.downloaded,
        localPath: existing.localPath,
      });
      return;
    }

    // Create orbital_media record in SQLCipher
    // Note: downloaded = 0 since we haven't downloaded the file yet
    // attachmentKeys are stored as base64 string (IPC-safe format)
    await DataWriter.saveOrbitalMedia({
      id,
      mediaId,
      threadId,
      attachmentKeys: syncMessage.attachmentKeys, // Already base64 string
      plaintextHash: syncMessage.plaintextHash,
      digest: syncMessage.digest,
      incrementalMac: syncMessage.incrementalMac,
      chunkSize: syncMessage.chunkSize,
      size: syncMessage.size,
      contentType: syncMessage.contentType,
      fileName: syncMessage.fileName,
      blurHash: syncMessage.blurHash,
      width: syncMessage.width,
      height: syncMessage.height,
      duration: syncMessage.duration,
      expiresAt: syncMessage.expiresAt,
      localPath: null, // Not downloaded yet
      downloaded: 0, // Mark as pending download
      createdAt: syncMessage.createdAt,
      caption: syncMessage.caption,
      uploadedBy: syncMessage.uploadedBy,
    });

    log.info(`${logId}: Saved media record to SQLCipher`, { downloaded: 0 });

    // Trigger automatic download in background
    // Don't await - let it run asynchronously
    void triggerPendingDownloads(getAbsoluteAttachmentPath);

  } catch (error) {
    log.error(`${logId}: Failed to process media sync message`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Trigger download of all pending media
 *
 * Runs in background, downloading all media that hasn't been downloaded yet.
 * Uses limited concurrency to avoid overwhelming the network.
 *
 * @param getAbsoluteAttachmentPath Function to convert relative paths to absolute
 */
async function triggerPendingDownloads(
  getAbsoluteAttachmentPath: (relativePath: string) => string
): Promise<void> {
  const logId = 'triggerPendingDownloads';

  try {
    log.info(`${logId}: Starting background download of pending media`);

    const result = await downloadAllPendingMedia({
      concurrency: 3, // Download 3 files at a time
      getAbsoluteAttachmentPath,
      onProgress: (progress, current, total) => {
        log.info(`${logId}: Download progress: ${current}/${total} (${progress}%)`);
      },
    });

    log.info(`${logId}: Background download complete`, {
      successful: result.successful,
      failed: result.failed,
      skipped: result.skipped,
    });

    if (result.failed > 0) {
      log.warn(`${logId}: Some downloads failed`, {
        errors: result.errors,
      });
    }
  } catch (error) {
    log.error(`${logId}: Failed to download pending media`, Errors.toLogFormat(error));
    // Don't throw - this is a background operation
  }
}

/**
 * Sync all pending media downloads
 *
 * Public API for manually triggering media sync.
 * Called on app startup or when user requests sync.
 *
 * @param getAbsoluteAttachmentPath Function to convert relative paths to absolute
 * @returns Summary of download results
 */
export async function syncPendingMediaDownloads(
  getAbsoluteAttachmentPath: (relativePath: string) => string
): Promise<{
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{ mediaId: string; error: string }>;
}> {
  const logId = 'syncPendingMediaDownloads';

  log.info(`${logId}: Starting manual media sync`);

  const result = await downloadAllPendingMedia({
    concurrency: 5, // More aggressive for manual sync
    getAbsoluteAttachmentPath,
    onProgress: (progress, current, total) => {
      log.info(`${logId}: Download progress: ${current}/${total} (${progress}%)`);
    },
  });

  log.info(`${logId}: Manual media sync complete`, result);

  return result;
}

/**
 * Get count of pending media downloads
 *
 * @returns Number of media items waiting to be downloaded
 */
export async function getPendingMediaCount(): Promise<number> {
  const pendingMedia = await DataReader.getPendingDownloads();
  return pendingMedia.length;
}

/**
 * Check if media sync message is valid
 *
 * Validates required fields before processing.
 *
 * @param message Unknown message object to validate
 * @returns True if valid OrbitalMediaSyncMessage
 */
export function isValidMediaSyncMessage(message: unknown): message is OrbitalMediaSyncMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as Partial<OrbitalMediaSyncMessage>;

  return (
    msg.type === 'orbital-media-sync' &&
    typeof msg.id === 'string' &&
    typeof msg.mediaId === 'string' &&
    typeof msg.threadId === 'string' &&
    typeof msg.attachmentKeys === 'string' &&
    typeof msg.plaintextHash === 'string' &&
    typeof msg.digest === 'string' &&
    typeof msg.size === 'number' &&
    typeof msg.contentType === 'string' &&
    typeof msg.expiresAt === 'number' &&
    typeof msg.createdAt === 'number'
  );
}
