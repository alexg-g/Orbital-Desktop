// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2025 Orbital

/**
 * OrbitalMediaViewer - Display media attachments in threads
 *
 * Features:
 * - Lazy loading (download on demand)
 * - Progress indicator during download
 * - Click to open full-size viewer
 * - Video player for video files
 * - Image gallery for images
 * - Download button (if not already downloaded)
 * - Expiration warning (< 1 day left on server)
 */

import React, { useState, useEffect, useCallback } from 'react';
// Type import for future use
// import type { OrbitalMediaAttachment } from '../../types/OrbitalMedia.std';
import {
  downloadMediaFromOrbital,
  getMediaDownloadStatus,
  createDownloadController,
} from '../../services/orbitalMediaDownload.preload';
import { deleteMedia, formatBytes } from '../../services/orbitalQuota.preload';

export type OrbitalMediaViewerProps = {
  mediaId: string;
  threadId: string;
  contentType: string;
  fileName?: string;
  size: number;
  expiresAt: number;
  blurHash?: string;
  width?: number;
  height?: number;
  getAbsoluteAttachmentPath: (relativePath: string) => string;
  onOpenFullscreen?: () => void;
  uploadedBy?: string; // Member ID of uploader
  currentUserId?: string; // Current user's member ID
  onDelete?: (mediaId: string) => void; // Callback when media is deleted
};

/**
 * OrbitalMediaViewer Component
 *
 * Displays media with lazy loading, download progress, and expiration warnings.
 */
export function OrbitalMediaViewer({
  mediaId,
  contentType,
  fileName,
  size,
  expiresAt,
  blurHash,
  width,
  height,
  getAbsoluteAttachmentPath,
  onOpenFullscreen,
  uploadedBy,
  currentUserId,
  onDelete,
}: OrbitalMediaViewerProps): JSX.Element {
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Check if media is downloaded and expiring soon
  useEffect(() => {
    async function checkStatus() {
      try {
        const status = await getMediaDownloadStatus(mediaId);
        setIsDownloaded(status.isDownloaded);
        setLocalPath(status.localPath);

        // Check if expiring within 24 hours
        const timeUntilExpiration = status.expiresAt - Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;
        setIsExpiringSoon(
          timeUntilExpiration < ONE_DAY && timeUntilExpiration > 0
        );
      } catch (err) {
        console.error('Failed to check media status:', err);
      }
    }

    checkStatus();
  }, [mediaId]);

  // Download handler
  const handleDownload = useCallback(async () => {
    if (isDownloaded || downloadProgress !== null) {
      return; // Already downloaded or downloading
    }

    setDownloadProgress(0);
    setError(null);

    const abortController = createDownloadController();

    try {
      const path = await downloadMediaFromOrbital({
        mediaId,
        onProgress: progress => {
          setDownloadProgress(progress);
        },
        signal: abortController.signal,
        getAbsoluteAttachmentPath,
      });

      setLocalPath(path);
      setIsDownloaded(true);
      setDownloadProgress(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Download failed';
      setError(errorMessage);
      setDownloadProgress(null);
    }
  }, [mediaId, isDownloaded, downloadProgress, getAbsoluteAttachmentPath]);

  // Auto-download on mount if already available
  useEffect(() => {
    if (!isDownloaded && downloadProgress === null && !error) {
      handleDownload();
    }
  }, []); // Only run once on mount

  const isImage = contentType.startsWith('image/');
  const isVideo = contentType.startsWith('video/');

  // Can delete if current user uploaded this media
  const canDelete = uploadedBy && currentUserId && uploadedBy === currentUserId;

  // Handle delete media
  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!canDelete || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await deleteMedia(mediaId);
      onDelete?.(mediaId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Delete failed';
      setError(errorMessage);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [mediaId, canDelete, isDeleting, onDelete]);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  // Calculate time until expiration
  const timeUntilExpiration = expiresAt - Date.now();
  const daysUntilExpiration = Math.floor(timeUntilExpiration / (24 * 60 * 60 * 1000));
  const hoursUntilExpiration = Math.floor(timeUntilExpiration / (60 * 60 * 1000));

  return (
    <div className="OrbitalMediaViewer">
      {/* Expiration Warning */}
      {isExpiringSoon && !isDownloaded && (
        <div className="OrbitalMediaViewer__expiration-warning">
          Expires in less than 24 hours! Download before it's removed from
          server.
        </div>
      )}

      {/* Media Content */}
      <div className="OrbitalMediaViewer__content">
        {/* Loading State */}
        {downloadProgress !== null && (
          <div className="OrbitalMediaViewer__loading">
            <div className="OrbitalMediaViewer__loading-spinner" />
            <div className="OrbitalMediaViewer__loading-progress">
              Downloading... {Math.round(downloadProgress)}%
            </div>
            <div className="OrbitalMediaViewer__loading-bar-container">
              <div
                className="OrbitalMediaViewer__loading-bar"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="OrbitalMediaViewer__error">
            <div className="OrbitalMediaViewer__error-icon">⚠️</div>
            <div className="OrbitalMediaViewer__error-message">{error}</div>
            <button
              type="button"
              className="OrbitalMediaViewer__error-retry"
              onClick={handleDownload}
            >
              Retry Download
            </button>
          </div>
        )}

        {/* Downloaded Media */}
        {isDownloaded && localPath && !error && (
          <>
            {isImage && (
              <div
                className="OrbitalMediaViewer__image-container"
                onClick={onOpenFullscreen}
                role="button"
                tabIndex={0}
                onKeyPress={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onOpenFullscreen?.();
                  }
                }}
              >
                <img
                  src={`file://${localPath}`}
                  alt={fileName || 'Image attachment'}
                  className="OrbitalMediaViewer__image"
                  style={{
                    width: width ? `${Math.min(width, 600)}px` : 'auto',
                    height: height ? `${Math.min(height, 600)}px` : 'auto',
                  }}
                />
                <div className="OrbitalMediaViewer__image-overlay">
                  <span>Click to view full size</span>
                </div>
              </div>
            )}

            {isVideo && (
              <div className="OrbitalMediaViewer__video-container">
                <video
                  src={`file://${localPath}`}
                  controls
                  className="OrbitalMediaViewer__video"
                  style={{
                    width: width ? `${Math.min(width, 600)}px` : 'auto',
                    maxHeight: '400px',
                  }}
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            )}

            {!isImage && !isVideo && (
              <div className="OrbitalMediaViewer__file">
                <div className="OrbitalMediaViewer__file-icon">📄</div>
                <div className="OrbitalMediaViewer__file-name">
                  {fileName || 'Attachment'}
                </div>
                <div className="OrbitalMediaViewer__file-size">
                  {formatBytes(size)}
                </div>
                <a
                  href={`file://${localPath}`}
                  download={fileName}
                  className="OrbitalMediaViewer__file-download"
                >
                  Download
                </a>
              </div>
            )}
          </>
        )}

        {/* Not Downloaded Yet */}
        {!isDownloaded && downloadProgress === null && !error && (
          <div className="OrbitalMediaViewer__placeholder">
            {blurHash && (
              <div className="OrbitalMediaViewer__blurhash">
                {/* TODO: Render blurhash */}
              </div>
            )}
            <button
              type="button"
              className="OrbitalMediaViewer__download-button"
              onClick={handleDownload}
            >
              📥 Download {isImage ? 'Image' : isVideo ? 'Video' : 'File'} (
              {formatBytes(size)})
            </button>
          </div>
        )}
      </div>

      {/* Media Info */}
      <div className="OrbitalMediaViewer__info">
        {fileName && (
          <div className="OrbitalMediaViewer__filename">{fileName}</div>
        )}
        <div className="OrbitalMediaViewer__metadata">
          {formatBytes(size)}
          {width && height && ` • ${width}x${height}`}
          {!isDownloaded && timeUntilExpiration > 0 && (
            <>
              {' • '}
              <span className="OrbitalMediaViewer__expiration">
                Expires in{' '}
                {daysUntilExpiration > 0
                  ? `${daysUntilExpiration} day${daysUntilExpiration > 1 ? 's' : ''}`
                  : `${hoursUntilExpiration} hour${hoursUntilExpiration > 1 ? 's' : ''}`}
              </span>
            </>
          )}
        </div>

        {/* Delete Button (if user uploaded this media) */}
        {canDelete && !showDeleteConfirm && (
          <button
            type="button"
            className="OrbitalMediaViewer__delete-button"
            onClick={handleDeleteClick}
            disabled={isDeleting}
          >
            🗑️ Delete
          </button>
        )}

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="OrbitalMediaViewer__delete-confirm">
            <p className="OrbitalMediaViewer__delete-confirm-text">
              Delete this media? This will free {formatBytes(size)} of storage.
            </p>
            <div className="OrbitalMediaViewer__delete-confirm-actions">
              <button
                type="button"
                className="OrbitalMediaViewer__delete-confirm-cancel"
                onClick={handleDeleteCancel}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="OrbitalMediaViewer__delete-confirm-delete"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

