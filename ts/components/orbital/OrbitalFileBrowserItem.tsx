// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * OrbitalFileBrowserItem - Individual media item in the file browser grid
 *
 * Displays thumbnail with blur hash placeholder, file type icon,
 * and duration for video files.
 */

import React, { useMemo } from 'react';
import type { OrbitalFileBrowserItem as FileBrowserItemType } from '../../types/OrbitalFileBrowser.std';
import {
  isImage,
  isVideo,
  formatFileSize,
  getFileExtension,
} from '../../services/orbitalFileBrowser.preload';

export type OrbitalFileBrowserItemProps = {
  item: FileBrowserItemType;
  onClick: (item: FileBrowserItemType) => void;
  getAbsolutePath?: (relativePath: string) => string;
};

function formatDuration(ms: number | undefined): string {
  if (!ms) return '';

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getFileTypeIcon(item: FileBrowserItemType): string {
  if (isImage(item)) return 'image';
  if (isVideo(item)) return 'video';

  const ext = getFileExtension(item);
  switch (ext) {
    case 'pdf':
      return 'pdf';
    case 'doc':
    case 'docx':
      return 'document';
    case 'xls':
    case 'xlsx':
      return 'spreadsheet';
    case 'mp3':
    case 'ogg':
    case 'wav':
      return 'audio';
    default:
      return 'file';
  }
}

export function OrbitalFileBrowserItem({
  item,
  onClick,
  getAbsolutePath,
}: OrbitalFileBrowserItemProps): JSX.Element {
  const isVisual = isImage(item) || isVideo(item);
  const fileTypeIcon = getFileTypeIcon(item);

  // Get the thumbnail source
  const thumbnailSrc = useMemo(() => {
    if (!item.localPath || !isVisual) {
      return null;
    }

    if (getAbsolutePath) {
      return `file://${getAbsolutePath(item.localPath)}`;
    }

    return null;
  }, [item.localPath, isVisual, getAbsolutePath]);

  const handleClick = () => {
    onClick(item);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(item);
    }
  };

  return (
    <div
      className={`OrbitalFileBrowserItem OrbitalFileBrowserItem--${fileTypeIcon}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      title={item.fileName || `${fileTypeIcon} file`}
    >
      {/* Thumbnail or placeholder */}
      <div className="OrbitalFileBrowserItem__thumbnail">
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={item.fileName || 'Media file'}
            className="OrbitalFileBrowserItem__image"
            loading="lazy"
          />
        ) : (
          <div className="OrbitalFileBrowserItem__placeholder">
            <div className={`OrbitalFileBrowserItem__icon OrbitalFileBrowserItem__icon--${fileTypeIcon}`}>
              {fileTypeIcon === 'pdf' && (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/>
                </svg>
              )}
              {fileTypeIcon === 'document' && (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                </svg>
              )}
              {fileTypeIcon === 'spreadsheet' && (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-9-2h2v-4h4v-2h-4V7h-2v4H6v2h4z"/>
                </svg>
              )}
              {fileTypeIcon === 'audio' && (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
              )}
              {fileTypeIcon === 'image' && (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                </svg>
              )}
              {fileTypeIcon === 'video' && (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
                </svg>
              )}
              {fileTypeIcon === 'file' && (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z"/>
                </svg>
              )}
            </div>
            <span className="OrbitalFileBrowserItem__extension">
              {getFileExtension(item).toUpperCase()}
            </span>
          </div>
        )}

        {/* Video duration overlay */}
        {isVideo(item) && item.duration && (
          <div className="OrbitalFileBrowserItem__duration">
            {formatDuration(item.duration)}
          </div>
        )}

        {/* Source badge (Orbital vs Signal) */}
        <div className={`OrbitalFileBrowserItem__source OrbitalFileBrowserItem__source--${item.source}`}>
          {item.source === 'orbital' ? 'O' : 'S'}
        </div>
      </div>

      {/* File info */}
      <div className="OrbitalFileBrowserItem__info">
        <div className="OrbitalFileBrowserItem__name" title={item.fileName}>
          {item.fileName || `${fileTypeIcon} file`}
        </div>
        <div className="OrbitalFileBrowserItem__meta">
          <span className="OrbitalFileBrowserItem__size">
            {formatFileSize(item.size)}
          </span>
          {item.groupName && (
            <span className="OrbitalFileBrowserItem__group">
              {item.groupName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
