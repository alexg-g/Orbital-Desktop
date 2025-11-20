// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Media Services - Main Export
 *
 * This file consolidates all Orbital media-related services for easy importing.
 *
 * Usage:
 * ```typescript
 * import {
 *   downloadMediaFromOrbital,
 *   downloadAllPendingMedia,
 *   uploadMediaToOrbital,
 *   getMediaForPlayback,
 *   storeDecryptedMedia,
 *   shouldAutoDownload,
 * } from '../services/orbitalMedia.preload';
 * ```
 */

// Storage service - local file management
export {
  getOrbitalMediaPath,
  getRelativePathForMedia,
  getAbsoluteOrbitalMediaPath,
  storeDecryptedMedia,
  readLocalMedia,
  doesOrbitalMediaExist,
  deleteLocalMedia,
  getStorageUsage,
  getStorageStats,
  cleanupEmptyDirectories,
  formatBytes,
  ensureOrbitalMediaDirectory,
} from './orbitalMediaStorage.preload.js';

// Download service - fetch and decrypt from server
export {
  downloadMediaFromOrbital,
  downloadAllPendingMedia,
  getMediaDownloadStatus,
  getPendingDownloadCount,
  getExpiredUndownloadedMedia,
  createDownloadController,
  type DownloadMediaOptions,
  type DownloadProgressCallback,
} from './orbitalMediaDownload.preload.js';

// Upload service - encrypt and upload to server
export {
  uploadMediaToOrbital,
  type UploadMediaOptions,
  type UploadProgressCallback,
} from './orbitalMediaUpload.preload.js';

// Playback service - blob URLs for media display
export {
  getMediaForPlayback,
  downloadAndGetMediaForPlayback,
  revokeMediaUrl,
  revokeAllMediaUrls,
  getActiveBlobUrlCount,
  toMediaForUI,
  getThreadMediaForUI,
  getMediaForUI,
  canPlayImmediately,
  getPlaybackInfoBatch,
  type PlaybackResult,
} from './orbitalMediaPlayback.preload.js';

// Settings service - auto-download and network
export {
  getAutoDownloadOnWifi,
  setAutoDownloadOnWifi,
  getNetworkType,
  isOnline,
  shouldAutoDownload,
  onNetworkChange,
  getOrbitalSettings,
  resetOrbitalSettings,
  type NetworkType,
} from './orbitalSettings.preload.js';

// Auth service - JWT token management
export {
  login,
  getJWT,
  getUserId,
  getUsername,
  isAuthenticated,
  logout,
  clearJWT,
  type LoginCredentials,
} from './orbitalAuth.preload.js';

// Quota service - storage quota management
export {
  getQuotaInfo,
  checkUploadAllowed,
  type QuotaInfo,
  type UploadCheckResult,
} from './orbitalQuota.preload.js';
