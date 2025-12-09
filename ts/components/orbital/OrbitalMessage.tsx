// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2025 Orbital

import React, { useCallback, useState } from 'react';
import classNames from 'classnames';
import type { LocalizerType } from '../../types/Util.std';
import type { OrbitalMessageType } from './OrbitalThreadDetail';
import type { OrbitalMediaDisplayInfo } from '../../types/OrbitalMedia.std';
import { StagedLinkPreview } from '../conversation/StagedLinkPreview.dom';
import { OrbitalPhotoGallery } from './OrbitalPhotoGallery';
import { OrbitalMediaViewer } from './OrbitalMediaViewer';
import { OrbitalPhotoLightbox } from './OrbitalPhotoLightbox';
import { resolveStaticAssetUrl } from '../../util/resolveStaticAsset.std';

export type OrbitalMessageProps = {
  message: OrbitalMessageType;
  isOwnMessage: boolean;
  onReply: (messageId: string) => void;
  onQuote?: (messageId: string) => void;
  i18n: LocalizerType;
  threadId: string;
  mediaMap: Map<string, OrbitalMediaDisplayInfo>;
  currentUserId?: string;
  onDeleteMedia?: (mediaId: string) => void;
  // Dependency injection for OrbitalMediaViewer (allows Storybook mocking)
  downloadMedia: (params: any) => Promise<string>;
  getMediaDownloadStatus: (mediaId: string) => Promise<any>;
  deleteMedia: (mediaId: string) => Promise<void>;
  formatBytes: (bytes: number) => string;
  getAbsoluteAttachmentPath: (relativePath: string) => string;
};

/**
 * OrbitalMessage - Individual message with color-coded reply depth
 *
 * REDDIT-STYLE THREADING MODEL:
 * - Original Post: Level 0 (white background, no indent)
 * - Top-level contributions (replying to thread, not specific comments): Level 0 (white, no indent)
 * - Reply to a specific comment: Level 1+ (indented, color-coded)
 *
 * Reply Depth Color System (Signature Orbital Feature):
 * - Level 0: White background, gray border (original post AND top-level contributions)
 * - Level 1: Light blue (8% opacity), blue border (replying to a comment)
 * - Level 2: Light purple (8% opacity), purple border (nested reply)
 * - Level 3: Stronger blue (12% opacity), blue border (deeper nesting)
 * - Level 4+: Stronger purple (12% opacity), purple border (max indent)
 *
 * Pattern: Blue → Purple → Blue → Purple, with increasing opacity
 *
 * Features:
 * - Left margin indentation (24px per level, max 96px at level 4+)
 * - 3px left border matching background tint color
 * - Author name and timestamp
 * - Message body with markdown support
 * - Reply button
 * - Media display (images, videos)
 * - Retro 2000s styling (Verdana 13px)
 */
export function OrbitalMessage({
  message,
  onReply,
  onQuote,
  i18n,
  threadId,
  mediaMap,
  downloadMedia,
  getMediaDownloadStatus,
  deleteMedia,
  formatBytes,
  currentUserId,
  onDeleteMedia,
  getAbsoluteAttachmentPath,
}: OrbitalMessageProps): JSX.Element {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const handleReply = useCallback(() => {
    onReply(message.id);
  }, [onReply, message.id]);

  const handleQuote = useCallback(() => {
    if (onQuote) {
      onQuote(message.id);
    }
  }, [onQuote, message.id]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onReply(message.id);
      }
    },
    [onReply, message.id]
  );

  // Determine CSS class based on reply depth
  const levelClass = getLevelClass(message.level);

  // Get media items from mediaMap (filter out items with missing contentType)
  const mediaItems = (message.mediaIds || [])
    .map(id => mediaMap.get(id))
    .filter((m): m is OrbitalMediaDisplayInfo => m !== undefined && m.contentType != null);

  // Filter for images only (for lightbox)
  const imageMedia = mediaItems.filter(m => m.contentType?.startsWith('image/'));
  const imageUrls = imageMedia
    .filter(m => m.localPath)
    .map(m => `file://${getAbsoluteAttachmentPath(m.localPath as string)}`);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  return (
    <div
      className={classNames('OrbitalMessage', levelClass)}
      role="article"
      aria-label={`Message from ${message.author}`}
      data-message-id={message.id}
      data-level={message.level}
    >
      {/* Avatar - Left column */}
      {message.avatarUrl ? (
        <div
          className={classNames(
            'OrbitalMessage__avatar',
            `OrbitalMessage__avatar--level-${message.level}`
          )}
        >
          <img
            src={resolveStaticAssetUrl(message.avatarUrl)}
            alt={`${message.author}'s avatar`}
            className="OrbitalMessage__avatar-image"
            onError={(e) => {
              // Hide broken image so placeholder shows
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      ) : (
        <div
          className={classNames(
            'OrbitalMessage__avatar',
            'OrbitalMessage__avatar-placeholder',
            `OrbitalMessage__avatar--level-${message.level}`
          )}
        >
          <span className="OrbitalMessage__avatar-initials">
            {getInitials(message.author)}
          </span>
        </div>
      )}

      {/* Content - Right column */}
      <div className="OrbitalMessage__content">
        {/* Message Header */}
        <div className="OrbitalMessage__header">
          <span className="OrbitalMessage__author">{message.author}</span>
          <span className="OrbitalMessage__timestamp">
            {formatTimestamp(message.timestamp, i18n)}
          </span>
          {/* Optional "Replying to" indicator (inline, only for nested replies) */}
          {message.parentId && message.level > 0 && (
            <span className="OrbitalMessage__reply-to">
              <span className="OrbitalMessage__reply-to__arrow">↳</span>
              Replying to{' '}
              <span className="OrbitalMessage__reply-to__author">
                {/* TODO: Lookup parent author name */}
                Previous message
              </span>
            </span>
          )}
        </div>

        {/* Message Body */}
        <div className="OrbitalMessage__body">
          {/* TODO: Add markdown rendering */}
          <p>{message.body}</p>

          {/* Link Previews (YouTube, etc.) */}
          {message.linkPreviews && message.linkPreviews.length > 0 && (
            <div className="OrbitalMessage__link-previews">
              {message.linkPreviews.map((preview, index) => (
                <a
                  key={index}
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="OrbitalMessage__link-preview-card"
                >
                  <StagedLinkPreview
                    {...preview}
                    i18n={i18n}
                    moduleClassName="OrbitalMessage__link-preview"
                  />
                </a>
              ))}
            </div>
          )}

          {/* Media - New implementation with OrbitalMediaViewer */}
          {mediaItems.length > 0 && (
            <div className="OrbitalMessage__media">
              {/* Single media */}
              {mediaItems.length === 1 && (
                <div className="OrbitalMessage__media--single">
                  <OrbitalMediaViewer
                    mediaId={mediaItems[0].mediaId}
                    threadId={threadId}
                    contentType={mediaItems[0].contentType}
                    fileName={mediaItems[0].fileName}
                    size={mediaItems[0].size}
                    expiresAt={mediaItems[0].expiresAt}
                    blurHash={mediaItems[0].blurHash}
                    width={mediaItems[0].width}
                    height={mediaItems[0].height}
                    uploadedBy={mediaItems[0].uploadedBy}
                    currentUserId={currentUserId}
                    onDelete={onDeleteMedia}
                    onOpenFullscreen={() => openLightbox(0)}
                    downloadMedia={downloadMedia}
                    getMediaDownloadStatus={getMediaDownloadStatus}
                    deleteMedia={deleteMedia}
                    formatBytes={formatBytes}
                    getAbsoluteAttachmentPath={getAbsoluteAttachmentPath}
                  />
                </div>
              )}

              {/* Two media - side by side */}
              {mediaItems.length === 2 && (
                <div className="OrbitalMessage__media--two-col">
                  {mediaItems.map(media => (
                    <OrbitalMediaViewer
                      key={media.mediaId}
                      mediaId={media.mediaId}
                      threadId={threadId}
                      contentType={media.contentType}
                      fileName={media.fileName}
                      size={media.size}
                      expiresAt={media.expiresAt}
                      blurHash={media.blurHash}
                      width={media.width}
                      height={media.height}
                      getAbsoluteAttachmentPath={getAbsoluteAttachmentPath}
                      uploadedBy={media.uploadedBy}
                      currentUserId={currentUserId}
                      onDelete={onDeleteMedia}
                      onOpenFullscreen={
                        media.contentType?.startsWith('image/')
                          ? () => openLightbox(imageMedia.indexOf(media))
                          : undefined
                      }
                      downloadMedia={downloadMedia}
                      getMediaDownloadStatus={getMediaDownloadStatus}
                      deleteMedia={deleteMedia}
                      formatBytes={formatBytes}
                    />
                  ))}
                </div>
              )}

              {/* Three media - first large, two stacked */}
              {mediaItems.length === 3 && (
                <div className="OrbitalMessage__media--three">
                  <div className="OrbitalMessage__media--three-main">
                    <OrbitalMediaViewer
                      mediaId={mediaItems[0].mediaId}
                      threadId={threadId}
                      contentType={mediaItems[0].contentType}
                      fileName={mediaItems[0].fileName}
                      size={mediaItems[0].size}
                      expiresAt={mediaItems[0].expiresAt}
                      blurHash={mediaItems[0].blurHash}
                      width={mediaItems[0].width}
                      height={mediaItems[0].height}
                      getAbsoluteAttachmentPath={getAbsoluteAttachmentPath}
                      uploadedBy={mediaItems[0].uploadedBy}
                      currentUserId={currentUserId}
                      onDelete={onDeleteMedia}
                      onOpenFullscreen={
                        mediaItems[0].contentType?.startsWith('image/')
                          ? () => openLightbox(0)
                          : undefined
                      }
                      downloadMedia={downloadMedia}
                      getMediaDownloadStatus={getMediaDownloadStatus}
                      deleteMedia={deleteMedia}
                      formatBytes={formatBytes}
                    />
                  </div>
                  <div className="OrbitalMessage__media--three-side">
                    {mediaItems.slice(1).map(media => (
                      <OrbitalMediaViewer
                        key={media.mediaId}
                        mediaId={media.mediaId}
                        threadId={threadId}
                        contentType={media.contentType}
                        fileName={media.fileName}
                        size={media.size}
                        expiresAt={media.expiresAt}
                        blurHash={media.blurHash}
                        width={media.width}
                        height={media.height}
                        getAbsoluteAttachmentPath={getAbsoluteAttachmentPath}
                        uploadedBy={media.uploadedBy}
                        currentUserId={currentUserId}
                        onDelete={onDeleteMedia}
                        onOpenFullscreen={
                          media.contentType.startsWith('image/')
                            ? () => openLightbox(imageMedia.indexOf(media))
                            : undefined
                        }
                        downloadMedia={downloadMedia}
                        getMediaDownloadStatus={getMediaDownloadStatus}
                        deleteMedia={deleteMedia}
                        formatBytes={formatBytes}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Four or more media - 2x2 grid */}
              {mediaItems.length >= 4 && (
                <div className="OrbitalMessage__media--four-plus">
                  {mediaItems.slice(0, 4).map(media => (
                    <OrbitalMediaViewer
                      key={media.mediaId}
                      mediaId={media.mediaId}
                      threadId={threadId}
                      contentType={media.contentType}
                      fileName={media.fileName}
                      size={media.size}
                      expiresAt={media.expiresAt}
                      blurHash={media.blurHash}
                      width={media.width}
                      height={media.height}
                      getAbsoluteAttachmentPath={getAbsoluteAttachmentPath}
                      uploadedBy={media.uploadedBy}
                      currentUserId={currentUserId}
                      onDelete={onDeleteMedia}
                      onOpenFullscreen={
                        media.contentType?.startsWith('image/')
                          ? () => openLightbox(imageMedia.indexOf(media))
                          : undefined
                      }
                      downloadMedia={downloadMedia}
                      getMediaDownloadStatus={getMediaDownloadStatus}
                      deleteMedia={deleteMedia}
                      formatBytes={formatBytes}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fallback: Legacy media rendering for backward compatibility */}
          {!mediaItems.length && message.hasMedia && (
            <div className="OrbitalMessage__media">
              {/* Photo gallery for multiple images */}
              {message.mediaUrls && message.mediaUrls.length > 0 && (
                <OrbitalPhotoGallery photos={message.mediaUrls} />
              )}

              {/* Single image */}
              {!message.mediaUrls &&
                message.mediaUrl &&
                message.mediaType === 'image' && (
                  <img
                    src={resolveStaticAssetUrl(message.mediaUrl)}
                    alt="Attached image"
                    style={{ maxWidth: '100%', borderRadius: '3px' }}
                  />
                )}

              {/* Video */}
              {!message.mediaUrls &&
                message.mediaUrl &&
                message.mediaType === 'video' && (
                  <video
                    src={resolveStaticAssetUrl(message.mediaUrl)}
                    controls
                    style={{ maxWidth: '100%', borderRadius: '3px' }}
                  >
                    <track kind="captions" />
                  </video>
                )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="OrbitalMessage__actions">
          <button
            type="button"
            className="OrbitalMessage__reply-button"
            onClick={handleReply}
            onKeyDown={handleKeyDown}
            aria-label="Reply to this message"
          >
            Reply
          </button>
          {onQuote && (
            <button
              type="button"
              className="OrbitalMessage__quote-button"
              onClick={handleQuote}
              aria-label="Quote this message"
            >
              Quote
            </button>
          )}
        </div>
      </div>

      {/* Lightbox for images */}
      {lightboxOpen && imageUrls.length > 0 && (
        <OrbitalPhotoLightbox
          photos={imageUrls}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}

/**
 * Get CSS class for message level (reply depth)
 *
 * Pattern:
 * - Level 0: level-0 (white/gray)
 * - Level 1: level-1 (light blue)
 * - Level 2: level-2 (light purple)
 * - Level 3: level-3 (stronger blue)
 * - Level 4+: level-4-plus (stronger purple, max indent)
 */
function getLevelClass(level: number): string {
  if (level === 0) {
    return 'OrbitalMessage--level-0';
  }
  if (level === 1) {
    return 'OrbitalMessage--level-1';
  }
  if (level === 2) {
    return 'OrbitalMessage--level-2';
  }
  if (level === 3) {
    return 'OrbitalMessage--level-3';
  }
  return 'OrbitalMessage--level-4-plus'; // 4 and beyond
}

/**
 * Format timestamp (compact format for messages)
 */
function formatTimestamp(timestamp: number, i18n: LocalizerType): string {
  const date = new Date(timestamp);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString(i18n.getLocale(), {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) {
    return time;
  }

  const month = date.toLocaleDateString(i18n.getLocale(), { month: 'short' });
  const day = date.getDate();

  return `${month} ${day}, ${time}`;
}

/**
 * Helper to calculate visual reply depth from message level
 *
 * This is used to determine the correct color and indentation.
 * The pattern repeats: Blue (1) → Purple (2) → Blue (3) → Purple (4+)
 */
export function getReplyDepthColor(
  level: number
): 'blue' | 'purple' | 'neutral' {
  if (level === 0) {
    return 'neutral';
  }
  if (level === 1 || level === 3) {
    return 'blue';
  }
  return 'purple'; // level 2, 4+
}

/**
 * Get indentation in pixels for a given level
 */
export function getReplyIndentation(level: number): number {
  const INDENT_UNIT = 24; // 24px per level
  const MAX_INDENT = 96; // Maximum 96px (level 4+)

  const indent = level * INDENT_UNIT;
  return Math.min(indent, MAX_INDENT);
}

/**
 * Get initials from author name for placeholder avatar
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
