// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

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
import type { OrbitalMediaAttachment } from '../../types/OrbitalMedia.std';
import {
  downloadMediaFromOrbital,
  getMediaDownloadStatus,
  createDownloadController,
} from '../../services/orbitalMediaDownload';

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
};

/**
 * OrbitalMediaViewer Component
 *
 * Displays media with lazy loading, download progress, and expiration warnings.
 */
export function OrbitalMediaViewer({
  mediaId,
  threadId,
  contentType,
  fileName,
  size,
  expiresAt,
  blurHash,
  width,
  height,
  getAbsoluteAttachmentPath,
  onOpenFullscreen,
}: OrbitalMediaViewerProps): JSX.Element {
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);

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
        setIsExpiringSoon(timeUntilExpiration < ONE_DAY && timeUntilExpiration > 0);
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
        onProgress: (progress) => {
          setDownloadProgress(progress);
        },
        signal: abortController.signal,
        getAbsoluteAttachmentPath,
      });

      setLocalPath(path);
      setIsDownloaded(true);
      setDownloadProgress(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Download failed';
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

  return (
    <div className="OrbitalMediaViewer">
      {/* Expiration Warning */}
      {isExpiringSoon && !isDownloaded && (
        <div className="OrbitalMediaViewer__expiration-warning">
          Expires in less than 24 hours! Download before it's removed from server.
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
                onKeyPress={(e) => {
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
                  {formatFileSize(size)}
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
              {formatFileSize(size)})
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
          {formatFileSize(size)}
          {width && height && ` • ${width}x${height}`}
        </div>
      </div>
    </div>
  );
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
