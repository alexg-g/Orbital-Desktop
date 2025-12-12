// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital File Browser Service
 *
 * Provides access to aggregated local media from both Orbital's distributed
 * media system (orbital_media table) and Signal's legacy message attachments
 * (message_attachments table).
 *
 * Features:
 * - Paginated fetching with cursor-based pagination
 * - Filtering by orbit/group, media type, and chronological order
 * - Unified data format from both sources
 */

import { createLogger } from '../logging/log.std.js';
import { DataReader } from '../sql/Client.preload.js';
import type {
  OrbitalFileBrowserItem,
  OrbitalFileBrowserMediaType,
  OrbitalFileBrowserSortOrder,
  OrbitalFileBrowserCursor,
  GetOrbitalFileBrowserMediaResult,
} from '../types/OrbitalFileBrowser.std.js';
import { FILE_BROWSER_PAGE_SIZE } from '../types/OrbitalFileBrowser.std.js';

const log = createLogger('OrbitalFileBrowser');

/**
 * Get paginated media items for the file browser
 *
 * Fetches media from both Orbital's distributed media system and Signal's
 * legacy message attachments, unified into a consistent format.
 *
 * @param options.groupId Optional group/orbit ID to filter by
 * @param options.mediaType Filter by media type (images, videos, other, all)
 * @param options.sortOrder Sort order (newest, oldest)
 * @param options.cursor Optional cursor for pagination
 * @param options.limit Number of items to fetch (default: FILE_BROWSER_PAGE_SIZE)
 * @returns Paginated result with items, hasMore flag, and next cursor
 */
export async function getFileBrowserMedia(options: {
  groupId?: string;
  mediaType: OrbitalFileBrowserMediaType;
  sortOrder: OrbitalFileBrowserSortOrder;
  cursor?: OrbitalFileBrowserCursor;
  limit?: number;
}): Promise<GetOrbitalFileBrowserMediaResult> {
  const logId = 'getFileBrowserMedia';
  const {
    groupId,
    mediaType,
    sortOrder,
    cursor,
    limit = FILE_BROWSER_PAGE_SIZE,
  } = options;

  log.info(`${logId}: Fetching file browser media`, {
    groupId,
    mediaType,
    sortOrder,
    hasCursor: !!cursor,
    limit,
  });

  try {
    const result = await DataReader.getOrbitalFileBrowserMedia({
      groupId,
      mediaType,
      sortOrder,
      limit,
      cursor,
    });

    log.info(`${logId}: Fetched ${result.items.length} items`, {
      hasMore: result.hasMore,
    });

    return result;
  } catch (error) {
    log.error(`${logId}: Failed to fetch file browser media`, error);
    throw error;
  }
}

/**
 * Get the total count of media items matching filters
 *
 * Useful for showing total counts in the UI before all items are loaded.
 *
 * @param options.groupId Optional group/orbit ID to filter by
 * @param options.mediaType Filter by media type
 * @returns Total count of matching items
 */
export async function getFileBrowserMediaCount(options: {
  groupId?: string;
  mediaType: OrbitalFileBrowserMediaType;
}): Promise<number> {
  const logId = 'getFileBrowserMediaCount';

  try {
    // Fetch with a very large limit to get total count
    // This is not ideal for performance, but works for now
    // TODO: Add a dedicated count query if performance is an issue
    const result = await DataReader.getOrbitalFileBrowserMedia({
      groupId: options.groupId,
      mediaType: options.mediaType,
      sortOrder: 'newest',
      limit: 10000,
    });

    return result.items.length;
  } catch (error) {
    log.error(`${logId}: Failed to get media count`, error);
    throw error;
  }
}

/**
 * Check if an item is an image
 */
export function isImage(item: OrbitalFileBrowserItem): boolean {
  return item.contentType.startsWith('image/');
}

/**
 * Check if an item is a video
 */
export function isVideo(item: OrbitalFileBrowserItem): boolean {
  return item.contentType.startsWith('video/');
}

/**
 * Check if an item is visual media (image or video)
 */
export function isVisualMedia(item: OrbitalFileBrowserItem): boolean {
  return isImage(item) || isVideo(item);
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Get file extension from content type or filename
 */
export function getFileExtension(item: OrbitalFileBrowserItem): string {
  if (item.fileName) {
    const lastDot = item.fileName.lastIndexOf('.');
    if (lastDot !== -1) {
      return item.fileName.substring(lastDot + 1).toLowerCase();
    }
  }

  // Fallback to content type
  const contentType = item.contentType.toLowerCase();
  const extensionMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'application/pdf': 'pdf',
  };

  return extensionMap[contentType] || 'file';
}

/**
 * Group media items by date for display
 *
 * Groups items into "Today", "Yesterday", "This Week", "This Month",
 * and month/year groups for older items.
 */
export function groupMediaItemsByDate(
  items: Array<OrbitalFileBrowserItem>
): Array<{ label: string; items: Array<OrbitalFileBrowserItem> }> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const thisWeekStart = new Date(today.getTime() - today.getDay() * 24 * 60 * 60 * 1000);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const groups: Map<string, Array<OrbitalFileBrowserItem>> = new Map();

  for (const item of items) {
    const itemDate = new Date(item.createdAt);
    const itemDay = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());

    let label: string;

    if (itemDay.getTime() >= today.getTime()) {
      label = 'Today';
    } else if (itemDay.getTime() >= yesterday.getTime()) {
      label = 'Yesterday';
    } else if (itemDay.getTime() >= thisWeekStart.getTime()) {
      label = 'This Week';
    } else if (itemDay.getTime() >= thisMonthStart.getTime()) {
      label = 'This Month';
    } else {
      // Format as "Month Year"
      label = itemDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    }

    const existing = groups.get(label) || [];
    existing.push(item);
    groups.set(label, existing);
  }

  // Convert to array and maintain order
  return Array.from(groups.entries()).map(([label, groupItems]) => ({
    label,
    items: groupItems,
  }));
}
