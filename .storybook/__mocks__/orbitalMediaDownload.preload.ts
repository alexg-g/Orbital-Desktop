// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Storybook mock for orbitalMediaDownload.preload.ts
 * Provides stub implementations for media download functions that work in browser environment
 */

export type DownloadProgressCallback = (progress: number) => void;

export type DownloadMediaOptions = {
  mediaId: string;
  threadId: string;
  groupId: string;
  onProgress?: DownloadProgressCallback;
  signal?: AbortSignal;
};

export async function downloadMediaFromOrbital(
  _options: DownloadMediaOptions
): Promise<string | null> {
  console.log('[Storybook Mock] downloadMediaFromOrbital called');
  return null;
}

export async function getMediaDownloadStatus(
  _mediaId: string
): Promise<{ status: string; localPath?: string }> {
  console.log('[Storybook Mock] getMediaDownloadStatus called');
  return { status: 'pending' };
}

export function createDownloadController(): AbortController {
  return new AbortController();
}

export async function downloadAllPendingMedia(_options: {
  groupId?: string;
  onProgress?: (current: number, total: number) => void;
}): Promise<void> {
  console.log('[Storybook Mock] downloadAllPendingMedia called');
}

export async function getPendingDownloadCount(): Promise<number> {
  console.log('[Storybook Mock] getPendingDownloadCount called');
  return 0;
}

export async function getExpiredUndownloadedMedia(): Promise<string[]> {
  console.log('[Storybook Mock] getExpiredUndownloadedMedia called');
  return [];
}

export async function decryptAndSaveMedia(_params: {
  encryptedPath: string;
  keys: string;
  digest: string;
  mediaId: string;
  contentType: string;
  fileName?: string;
}): Promise<string> {
  console.log('[Storybook Mock] decryptAndSaveMedia called');
  return '/mock/path/to/file';
}
