// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Storybook mock for orbitalHistoricMediaSync.preload.ts
 * Provides stub implementations for historic media sync functions that work in browser environment
 */

import type {
  MediaSyncRequest,
  MediaSyncTimeRange,
  SyncItemReady,
  SyncItemNeeded,
} from '../../ts/types/OrbitalMediaSync.std';

// Mock request data
const mockRequest: MediaSyncRequest = {
  id: 'mock-request-1',
  groupId: 'mock-group-1',
  requestorId: 'mock-user-1',
  sinceDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
  maxBytes: 10 * 1024 * 1024 * 1024,
  bytesUploaded: 0,
  bytesDownloaded: 0,
  status: 'pending',
  itemsTotal: 25,
  itemsCompleted: 0,
  itemsReady: 0,
  createdAt: Date.now(),
  expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
};

export async function createSyncRequest(params: {
  groupId: string;
  timeRange: MediaSyncTimeRange;
  maxBytes?: number;
}): Promise<MediaSyncRequest> {
  console.log('[Storybook Mock] createSyncRequest called', params);
  return {
    ...mockRequest,
    groupId: params.groupId,
    maxBytes: params.maxBytes || 10 * 1024 * 1024 * 1024,
    id: `mock-request-${Date.now()}`,
  };
}

export async function getActiveSyncRequests(): Promise<MediaSyncRequest[]> {
  console.log('[Storybook Mock] getActiveSyncRequests called');
  return [];
}

export async function getReadyItems(_requestId: string): Promise<SyncItemReady[]> {
  console.log('[Storybook Mock] getReadyItems called');
  return [];
}

export async function downloadSyncItem(_params: {
  requestId: string;
  itemId: string;
  mediaId: string;
  groupId: string;
}): Promise<void> {
  console.log('[Storybook Mock] downloadSyncItem called');
}

export async function downloadReadyItems(_requestId: string): Promise<void> {
  console.log('[Storybook Mock] downloadReadyItems called');
}

export async function cancelSyncRequest(_requestId: string): Promise<void> {
  console.log('[Storybook Mock] cancelSyncRequest called');
}

export async function getItemsNeededForRequest(_requestId: string): Promise<SyncItemNeeded[]> {
  console.log('[Storybook Mock] getItemsNeededForRequest called');
  return [];
}

export async function uploadItemForSync(_params: {
  requestId: string;
  itemId: string;
  mediaId: string;
  groupId: string;
}): Promise<void> {
  console.log('[Storybook Mock] uploadItemForSync called');
}

export async function updateLocalSyncProgress(
  _requestId: string,
  _updates: {
    itemsCompleted?: number;
    itemsReady?: number;
    bytesDownloaded?: number;
  }
): Promise<void> {
  console.log('[Storybook Mock] updateLocalSyncProgress called');
}
