// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2025 Orbital

import React, { useCallback, useState, useEffect } from 'react';
import type { LocalizerType } from '../../types/Util.std';
import type { LinkPreviewForUIType } from '../../types/message/LinkPreviews.std';
import type { OrbitalMediaAttachment } from '../../types/OrbitalMedia.std';
import { OrbitalMessage } from './OrbitalMessage';
import { OrbitalComposer } from './OrbitalComposer';
import type { UploadCheckResult } from './OrbitalMediaPicker';
import type { QuotaInfo } from '../../services/orbitalQuota.preload';

export type OrbitalMessageType = {
  id: string;
  author: string;
  authorId: string;
  timestamp: number;
  body: string;
  level: number; // Reply depth level (0 = top-level, 1-4+ = nested)
  parentId?: string; // ID of the message this is replying to
  hasMedia: boolean;
  mediaType?: 'image' | 'video';
  mediaUrl?: string; // Single media URL (for backward compatibility)
  mediaUrls?: Array<string>; // Multiple media URLs (for photo galleries)
  mediaIds?: string[]; // NEW: Array of media IDs from orbital_media table
  avatarUrl?: string; // Optional avatar URL (48x48 pixel art)
  linkPreviews?: ReadonlyArray<LinkPreviewForUIType>; // Link previews (YouTube, etc.)
};

export type OrbitalThreadDetailProps = {
  threadId: string;
  groupId: string;
  threadTitle: string;
  threadAuthor: string;
  threadTimestamp: number;
  messages: ReadonlyArray<OrbitalMessageType>;
  currentUserId: string;
  i18n: LocalizerType;
  onReply: (parentId: string, body: string) => void;
  onSendMessage: (body: string, mediaIds: string[]) => void;
  // Dependency injection for OrbitalComposer (allows Storybook mocking)
  getQuotaInfo: (groupId: string) => Promise<QuotaInfo>;
  checkUploadAllowed: (groupId: string, fileSizeBytes: number) => Promise<UploadCheckResult>;
  formatBytes: (bytes: number) => string;
  uploadMedia: (params: any) => Promise<any>;
  getAbsoluteAttachmentPath: (relativePath: string) => string;
  // Dependency injection for OrbitalMediaViewer (allows Storybook mocking)
  downloadMedia: (params: any) => Promise<string>;
  getMediaDownloadStatus: (mediaId: string) => Promise<any>;
  deleteMedia: (mediaId: string) => Promise<void>;
};

/**
 * OrbitalThreadDetail - Displays a thread with all its replies
 *
 * Features:
 * - Thread title prominently displayed
 * - Color-coded reply depth (Blue → Purple → Blue → Purple...)
 * - Indented replies (24px per level, max 96px)
 * - Original post (level 0) with white background
 * - Nested replies with increasing color saturation
 * - Reply composer at bottom
 */
export function OrbitalThreadDetail({
  threadId,
  groupId,
  threadTitle,
  threadAuthor,
  threadTimestamp,
  messages,
  currentUserId,
  i18n,
  onSendMessage,
  getQuotaInfo,
  checkUploadAllowed,
  formatBytes,
  uploadMedia,
  getAbsoluteAttachmentPath,
  downloadMedia,
  getMediaDownloadStatus,
  deleteMedia,
}: OrbitalThreadDetailProps): JSX.Element {
  const [isComposerCollapsed, setIsComposerCollapsed] = useState(false);
  const [mediaMap, setMediaMap] = useState<Map<string, OrbitalMediaAttachment>>(
    new Map()
  );

  // Fetch media metadata for this thread
  useEffect(() => {
    async function fetchThreadMedia() {
      try {
        // Access DataReader from window.Signal
        const dataReader = window.Signal?.DataReader as {
          getThreadMedia?: (threadId: string) => Promise<Array<OrbitalMediaAttachment>>;
        } | undefined;

        if (!dataReader?.getThreadMedia) {
          console.warn('DataReader.getThreadMedia not available');
          return;
        }

        const threadMedia = await dataReader.getThreadMedia(threadId);
        const map = new Map(threadMedia.map(m => [m.mediaId, m]));
        setMediaMap(map);
      } catch (error) {
        console.error('Failed to fetch thread media:', error);
      }
    }

    if (threadId) {
      fetchThreadMedia();
    }
  }, [threadId]);

  const handleSubmitReply = useCallback(
    (body: string, mediaIds: string[]) => {
      onSendMessage(body, mediaIds);
    },
    [onSendMessage]
  );

  const handleToggleComposer = useCallback(() => {
    setIsComposerCollapsed(prev => !prev);
  }, []);

  const handleDeleteMedia = useCallback(
    (mediaId: string) => {
      // Remove from map to trigger re-render
      setMediaMap(prev => {
        const newMap = new Map(prev);
        newMap.delete(mediaId);
        return newMap;
      });
    },
    []
  );

  // Note: getAbsoluteAttachmentPath is now passed as a prop via dependency injection

  return (
    <div className="OrbitalThreadDetail">
      {/* Thread Header */}
      <div className="OrbitalThreadDetail__header">
        <div className="OrbitalThreadDetail__header-left">
          <h1>{threadTitle}</h1>
          <div className="OrbitalThreadDetail__header-meta">
            Started by {threadAuthor} · {formatTimestamp(threadTimestamp, i18n)}
          </div>
        </div>
        <div className="OrbitalThreadDetail__header-right">
          <span className="OrbitalThreadDetail__reply-count">
            {(() => {
              const replyCount = messages.filter(m => m.level > 0).length;
              return `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`;
            })()}
          </span>
        </div>
      </div>

      {/* Thread Timeline - Messages with color-coded depth */}
      <div className="OrbitalThreadDetail__timeline">
        {messages.map(message => (
          <OrbitalMessage
            key={message.id}
            message={message}
            isOwnMessage={message.authorId === currentUserId}
            onReply={() => {}} // Reply button click handler (not used when always showing composer)
            i18n={i18n}
            threadId={threadId}
            mediaMap={mediaMap}
            currentUserId={currentUserId}
            onDeleteMedia={handleDeleteMedia}
            getAbsoluteAttachmentPath={getAbsoluteAttachmentPath}
            downloadMedia={downloadMedia}
            getMediaDownloadStatus={getMediaDownloadStatus}
            deleteMedia={deleteMedia}
            formatBytes={formatBytes}
          />
        ))}

        {messages.length === 0 && (
          <div className="OrbitalEmptyState">
            <div className="OrbitalEmptyState__message">
              No messages yet. Be the first to reply!
            </div>
          </div>
        )}
      </div>

      {/* ASCII Separator / Toggle Button */}
      <button
        type="button"
        className="OrbitalASCII OrbitalASCII--separator OrbitalASCII--toggle"
        onClick={handleToggleComposer}
        aria-label={
          isComposerCollapsed ? 'Expand composer' : 'Collapse composer'
        }
        aria-expanded={!isComposerCollapsed}
      >
        {isComposerCollapsed
          ? '▲  ▲  ▲   EXPAND   ▲  ▲  ▲'
          : '▼  ▼  ▼  COLLAPSE  ▼  ▼  ▼'}
      </button>

      {/* Reply Composer - Conditionally visible */}
      {!isComposerCollapsed && (
        <div className="OrbitalThreadDetail__composer-area">
          <OrbitalComposer
            mode="reply"
            groupId={groupId}
            threadId={threadId}
            onSubmit={handleSubmitReply}
            i18n={i18n}
            getQuotaInfo={getQuotaInfo}
            checkUploadAllowed={checkUploadAllowed}
            formatBytes={formatBytes}
            uploadMedia={uploadMedia}
            getAbsoluteAttachmentPath={getAbsoluteAttachmentPath}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: number, i18n: LocalizerType): string {
  const date = new Date(timestamp);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString(i18n.getLocale(), {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) {
    return `Today at ${time}`;
  }
  if (isYesterday) {
    return `Yesterday at ${time}`;
  }

  const month = date.toLocaleDateString(i18n.getLocale(), { month: 'short' });
  const day = date.getDate();
  const year =
    date.getFullYear() !== now.getFullYear() ? ` ${date.getFullYear()}` : '';

  return `${month} ${day}${year} at ${time}`;
}
