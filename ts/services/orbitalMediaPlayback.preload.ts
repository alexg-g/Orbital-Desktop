// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Media Playback Integration Service
 *
 * Provides helper functions for media playback in the UI.
 *
 * Features:
 * - Get media for playback (from local storage or server)
 * - Create blob URLs for media
 * - Revoke blob URLs to free memory
 * - Check if media is available for playback
 *
 * Usage:
 * 1. Call getMediaForPlayback() with mediaId
 * 2. If returns a URL, use it for playback
 * 3. If returns null, show download button to user
 * 4. When done, call revokeMediaUrl() to free memory
 */

import { createLogger } from '../logging/log.std.js';
import { DataReader } from '../sql/Client.preload.js';
import { readLocalMedia } from './orbitalMediaStorage.preload.js';
import {
  downloadMediaFromOrbital,
  getMediaDownloadStatus,
} from './orbitalMediaDownload.preload.js';
import type { OrbitalMediaAttachment, OrbitalMediaForUI } from '../types/OrbitalMedia.std.js';
import * as Errors from '../types/errors.std.js';

const log = createLogger('OrbitalMediaPlayback');

/**
 * Track active blob URLs for cleanup
 */
const activeBlobUrls = new Map<string, string>();

/**
 * Result of getting media for playback
 */
export type PlaybackResult = {
  /**
   * Blob URL for playback (if available)
   */
  url: string | null;

  /**
   * Whether the media is available locally
   */
  isAvailableLocally: boolean;

  /**
   * Whether the media is still available on the server
   */
  isAvailableOnServer: boolean;

  /**
   * MIME content type for the media
   */
  contentType: string;

  /**
   * Original file size in bytes
   */
  size: number;

  /**
   * Expiration timestamp (Unix milliseconds)
   */
  expiresAt: number;
};

/**
 * Get media for playback
 *
 * If the media is downloaded locally, creates a blob URL and returns it.
 * If not downloaded, returns null so the UI can show a download button.
 *
 * @param mediaId - Server media ID
 * @returns PlaybackResult with URL or null
 */
export async function getMediaForPlayback(mediaId: string): Promise<PlaybackResult> {
  const logId = `getMediaForPlayback(${mediaId})`;

  // Get media metadata from database
  const media = await DataReader.getOrbitalMedia(mediaId);

  if (!media) {
    throw new Error(`${logId}: Media not found in database`);
  }

  const isAvailableOnServer = media.expiresAt > Date.now();

  // Check if already downloaded
  if (media.downloaded === 1 && media.localPath) {
    try {
      // Read from local storage and create blob URL
      const data = await readLocalMedia(media.localPath);
      const blob = new Blob([data], { type: media.contentType });
      const url = URL.createObjectURL(blob);

      // Track the blob URL for cleanup
      activeBlobUrls.set(mediaId, url);

      log.info(`${logId}: Created blob URL from local storage`);

      return {
        url,
        isAvailableLocally: true,
        isAvailableOnServer,
        contentType: media.contentType,
        size: media.size,
        expiresAt: media.expiresAt,
      };
    } catch (error) {
      log.error(`${logId}: Failed to read local media`, Errors.toLogFormat(error));
      // Fall through to return null URL
    }
  }

  // Media not available locally
  log.info(`${logId}: Media not available locally`);

  return {
    url: null,
    isAvailableLocally: false,
    isAvailableOnServer,
    contentType: media.contentType,
    size: media.size,
    expiresAt: media.expiresAt,
  };
}

/**
 * Download and get media for playback
 *
 * Downloads the media if not available locally, then creates a blob URL.
 * Use this when the user clicks "Download" in the UI.
 *
 * @param mediaId - Server media ID
 * @param options - Download options
 * @returns PlaybackResult with URL
 * @throws Error if download fails
 */
export async function downloadAndGetMediaForPlayback(
  mediaId: string,
  options: {
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
    getAbsoluteAttachmentPath: (relativePath: string) => string;
  }
): Promise<PlaybackResult> {
  // Download the media
  await downloadMediaFromOrbital({
    mediaId,
    onProgress: options.onProgress,
    signal: options.signal,
    getAbsoluteAttachmentPath: options.getAbsoluteAttachmentPath,
  });

  // Now get it for playback
  return getMediaForPlayback(mediaId);
}

/**
 * Revoke a blob URL to free memory
 *
 * Call this when the media component is unmounted or no longer displayed.
 *
 * @param mediaId - Server media ID
 */
export function revokeMediaUrl(mediaId: string): void {
  const url = activeBlobUrls.get(mediaId);

  if (url) {
    URL.revokeObjectURL(url);
    activeBlobUrls.delete(mediaId);
    log.info(`revokeMediaUrl(${mediaId}): Revoked blob URL`);
  }
}

/**
 * Revoke all active blob URLs
 *
 * Call this on app shutdown or when navigating away from media-heavy screens.
 */
export function revokeAllMediaUrls(): void {
  for (const [mediaId, url] of activeBlobUrls) {
    URL.revokeObjectURL(url);
    log.info(`revokeAllMediaUrls: Revoked ${mediaId}`);
  }

  activeBlobUrls.clear();
}

/**
 * Get count of active blob URLs
 *
 * Useful for debugging memory usage.
 */
export function getActiveBlobUrlCount(): number {
  return activeBlobUrls.size;
}

/**
 * Convert OrbitalMediaAttachment to OrbitalMediaForUI
 *
 * Extends the attachment with UI-specific properties.
 *
 * @param media - Media attachment from database
 * @returns Extended type for UI rendering
 */
export function toMediaForUI(media: OrbitalMediaAttachment): OrbitalMediaForUI {
  return {
    ...media,
    isAvailableLocally: media.downloaded === 1 && media.localPath !== null,
    isAvailableOnServer: media.expiresAt > Date.now(),
  };
}

/**
 * Get all media for a thread, formatted for UI
 *
 * @param threadId - Thread ID
 * @returns Array of media items formatted for UI
 */
export async function getThreadMediaForUI(threadId: string): Promise<OrbitalMediaForUI[]> {
  const media = await DataReader.getThreadMedia(threadId);
  return media.map(toMediaForUI);
}

/**
 * Get single media item for UI
 *
 * @param mediaId - Server media ID
 * @returns Media item formatted for UI, or null if not found
 */
export async function getMediaForUI(mediaId: string): Promise<OrbitalMediaForUI | null> {
  const media = await DataReader.getOrbitalMedia(mediaId);

  if (!media) {
    return null;
  }

  return toMediaForUI(media);
}

/**
 * Check if media can be played immediately (no download required)
 *
 * @param mediaId - Server media ID
 * @returns True if media can be played immediately
 */
export async function canPlayImmediately(mediaId: string): Promise<boolean> {
  const status = await getMediaDownloadStatus(mediaId);
  return status.isDownloaded;
}

/**
 * Get playback info for multiple media items
 *
 * Useful for displaying a gallery or thread media list.
 *
 * @param mediaIds - Array of server media IDs
 * @returns Map of mediaId to playback availability
 */
export async function getPlaybackInfoBatch(
  mediaIds: string[]
): Promise<Map<string, { isAvailableLocally: boolean; isAvailableOnServer: boolean }>> {
  const result = new Map<string, { isAvailableLocally: boolean; isAvailableOnServer: boolean }>();

  for (const mediaId of mediaIds) {
    const media = await DataReader.getOrbitalMedia(mediaId);

    if (media) {
      result.set(mediaId, {
        isAvailableLocally: media.downloaded === 1 && media.localPath !== null,
        isAvailableOnServer: media.expiresAt > Date.now(),
      });
    }
  }

  return result;
}
