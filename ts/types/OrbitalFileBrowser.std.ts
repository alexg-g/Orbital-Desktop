// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * OrbitalFileBrowser - Type definitions for the File Library Browser
 *
 * Aggregates media from both Orbital's distributed media system (orbital_media)
 * and Signal's legacy message attachments (message_attachments).
 */

/** Media type filter options */
export type OrbitalFileBrowserMediaType = 'images' | 'videos' | 'other' | 'all';

/** Sort order options */
export type OrbitalFileBrowserSortOrder = 'newest' | 'oldest';

/** Unified media item from either data source */
export type OrbitalFileBrowserItem = {
  /** Unique identifier (composite for Signal attachments) */
  id: string;
  /** Which database table this came from */
  source: 'orbital' | 'signal';
  /** MIME type (e.g., 'image/jpeg', 'video/mp4') */
  contentType: string;
  /** Original filename if available */
  fileName?: string;
  /** File size in bytes */
  size: number;
  /** Image/video width in pixels */
  width?: number;
  /** Image/video height in pixels */
  height?: number;
  /** Duration in milliseconds for audio/video */
  duration?: number;
  /** BlurHash placeholder for images/videos */
  blurHash?: string;
  /** Local file path (relative to attachments directory) */
  localPath?: string;
  /** Creation/received timestamp (Unix ms) */
  createdAt: number;
  /** Group/conversation ID for filtering */
  groupId?: string;
  /** Group name for display */
  groupName?: string;
  /** Thread ID (for Orbital media only) */
  threadId?: string;
  /** Message ID (for Signal attachments only) */
  messageId?: string;
};

/** Filter state for the file browser */
export type OrbitalFileBrowserFilters = {
  /** Filter by orbit/group ID, null means all orbits */
  groupId: string | null;
  /** Filter by media type */
  mediaType: OrbitalFileBrowserMediaType;
  /** Sort order */
  sortOrder: OrbitalFileBrowserSortOrder;
};

/** Cursor for pagination */
export type OrbitalFileBrowserCursor = {
  /** Timestamp of last item */
  createdAt: number;
  /** ID of last item (for tie-breaking) */
  id: string;
};

/** Options for fetching file browser media */
export type GetOrbitalFileBrowserMediaOptions = {
  /** Filter by orbit/group ID */
  groupId?: string;
  /** Filter by media type */
  mediaType: OrbitalFileBrowserMediaType;
  /** Sort order */
  sortOrder: OrbitalFileBrowserSortOrder;
  /** Number of items to fetch */
  limit: number;
  /** Cursor for pagination */
  cursor?: OrbitalFileBrowserCursor;
};

/** Result from fetching file browser media */
export type GetOrbitalFileBrowserMediaResult = {
  /** The media items */
  items: Array<OrbitalFileBrowserItem>;
  /** Whether there are more items to fetch */
  hasMore: boolean;
  /** Cursor for next page (if hasMore is true) */
  nextCursor?: OrbitalFileBrowserCursor;
};

/** Default number of items to fetch per page */
export const FILE_BROWSER_PAGE_SIZE = 50;
