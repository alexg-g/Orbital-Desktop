// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital File Browser Utility Functions
 *
 * Pure utility functions for the file browser that can be used
 * in both preload (Node.js) and renderer (Storybook/browser) contexts.
 */

import type { OrbitalFileBrowserItem } from '../types/OrbitalFileBrowser.std';

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
  const thisWeekStart = new Date(
    today.getTime() - today.getDay() * 24 * 60 * 60 * 1000
  );
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const groups: Map<string, Array<OrbitalFileBrowserItem>> = new Map();

  for (const item of items) {
    const itemDate = new Date(item.createdAt);
    const itemDay = new Date(
      itemDate.getFullYear(),
      itemDate.getMonth(),
      itemDate.getDate()
    );

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
  return Array.from(groups.entries()).map(([labelText, groupItems]) => ({
    label: labelText,
    items: groupItems,
  }));
}
