// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import type { Meta } from '@storybook/react';
import { OrbitalMediaRecovery } from './OrbitalMediaRecovery';
import type { MediaSyncRequest } from '../../types/OrbitalMediaSync.std';

// Define GroupInfo type locally to avoid preload import
type GroupInfo = {
  groupId: string;
  name: string;
  memberCount?: number;
  createdAt?: number;
};

// Mock groups for stories
const mockGroups: GroupInfo[] = [
  {
    groupId: 'group-1',
    name: 'Smith Family',
    memberCount: 5,
    createdAt: Date.now() - 365 * 24 * 60 * 60 * 1000,
  },
  {
    groupId: 'group-2',
    name: 'College Friends',
    memberCount: 8,
    createdAt: Date.now() - 180 * 24 * 60 * 60 * 1000,
  },
  {
    groupId: 'group-3',
    name: 'Work Team',
    memberCount: 12,
    createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
  },
];

// Mock requests for different states
const mockPendingRequest: MediaSyncRequest = {
  id: 'req-1',
  groupId: 'group-1',
  requestorId: 'user-123',
  sinceDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
  maxBytes: 5 * 1024 * 1024 * 1024, // 5GB
  bytesUploaded: 0,
  bytesDownloaded: 0,
  status: 'pending',
  itemsTotal: 47,
  itemsCompleted: 0,
  itemsReady: 0,
  createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
  expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days from now
};

const mockInProgressRequest: MediaSyncRequest = {
  id: 'req-2',
  groupId: 'group-1',
  requestorId: 'user-123',
  sinceDate: Date.now() - 180 * 24 * 60 * 60 * 1000,
  maxBytes: 10 * 1024 * 1024 * 1024, // 10GB
  bytesUploaded: 3.2 * 1024 * 1024 * 1024,
  bytesDownloaded: 1.8 * 1024 * 1024 * 1024,
  status: 'in_progress',
  itemsTotal: 156,
  itemsCompleted: 42,
  itemsReady: 18,
  createdAt: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
  expiresAt: Date.now() + 6 * 24 * 60 * 60 * 1000, // 6 days from now
};

const mockCompletedRequest: MediaSyncRequest = {
  id: 'req-3',
  groupId: 'group-1',
  requestorId: 'user-123',
  sinceDate: Date.now() - 365 * 24 * 60 * 60 * 1000,
  maxBytes: 10 * 1024 * 1024 * 1024,
  bytesUploaded: 8.5 * 1024 * 1024 * 1024,
  bytesDownloaded: 8.5 * 1024 * 1024 * 1024,
  status: 'completed',
  itemsTotal: 234,
  itemsCompleted: 234,
  itemsReady: 0,
  createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
  expiresAt: Date.now() + 2 * 24 * 60 * 60 * 1000,
  completedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
};

// Mock helper functions
const mockFormatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// Mock async functions that return immediately
const createMockCreateRequest = () => async (params: {
  groupId: string;
  timeRange: 'last_month' | 'last_6_months' | 'all_time';
  maxBytes?: number;
}): Promise<MediaSyncRequest> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  return {
    id: `req-${Date.now()}`,
    groupId: params.groupId,
    requestorId: 'user-123',
    sinceDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
    maxBytes: params.maxBytes || 10 * 1024 * 1024 * 1024,
    bytesUploaded: 0,
    bytesDownloaded: 0,
    status: 'pending',
    itemsTotal: Math.floor(Math.random() * 100) + 20,
    itemsCompleted: 0,
    itemsReady: 0,
    createdAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
};

const createMockGetActiveRequests = (requests: MediaSyncRequest[]) =>
  async (): Promise<MediaSyncRequest[]> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return requests;
  };

const mockCancelRequest = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 300));
};

const mockDownloadReadyItems = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 500));
};

export default {
  title: 'Orbital/MediaSync/MediaRecovery',
  component: OrbitalMediaRecovery,
  decorators: [
    (Story) => (
      <div style={{
        padding: '24px',
        maxWidth: '700px',
        backgroundColor: '#FAF9F7',
        minHeight: '500px',
      }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

/**
 * Default state with no orbit selected - prompts user to select one
 */
export function NoOrbitSelected(): JSX.Element {
  return (
    <OrbitalMediaRecovery
      groups={mockGroups}
      onCreateRequest={createMockCreateRequest()}
      onGetActiveRequests={createMockGetActiveRequests([])}
      onCancelRequest={mockCancelRequest}
      onDownloadReadyItems={mockDownloadReadyItems}
      formatBytes={mockFormatBytes}
    />
  );
}

/**
 * Orbit selected, ready to create a new recovery request
 */
export function ReadyToCreate(): JSX.Element {
  return (
    <OrbitalMediaRecovery
      groups={mockGroups}
      selectedGroupId="group-1"
      onSelectOrbit={(groupId) => console.log('Selected orbit:', groupId)}
      onCreateRequest={createMockCreateRequest()}
      onGetActiveRequests={createMockGetActiveRequests([])}
      onCancelRequest={mockCancelRequest}
      onDownloadReadyItems={mockDownloadReadyItems}
      formatBytes={mockFormatBytes}
    />
  );
}

/**
 * Shows a pending request waiting for orbit members to respond
 */
export function WithPendingRequest(): JSX.Element {
  return (
    <OrbitalMediaRecovery
      groups={mockGroups}
      selectedGroupId="group-1"
      onSelectOrbit={(groupId) => console.log('Selected orbit:', groupId)}
      onCreateRequest={createMockCreateRequest()}
      onGetActiveRequests={createMockGetActiveRequests([mockPendingRequest])}
      onCancelRequest={mockCancelRequest}
      onDownloadReadyItems={mockDownloadReadyItems}
      formatBytes={mockFormatBytes}
    />
  );
}

/**
 * Shows an in-progress request with items ready to download
 */
export function WithInProgressRequest(): JSX.Element {
  return (
    <OrbitalMediaRecovery
      groups={mockGroups}
      selectedGroupId="group-1"
      onSelectOrbit={(groupId) => console.log('Selected orbit:', groupId)}
      onCreateRequest={createMockCreateRequest()}
      onGetActiveRequests={createMockGetActiveRequests([mockInProgressRequest])}
      onCancelRequest={mockCancelRequest}
      onDownloadReadyItems={mockDownloadReadyItems}
      formatBytes={mockFormatBytes}
    />
  );
}

/**
 * Shows multiple requests in different states
 */
export function MultipleRequests(): JSX.Element {
  return (
    <OrbitalMediaRecovery
      groups={mockGroups}
      selectedGroupId="group-1"
      onSelectOrbit={(groupId) => console.log('Selected orbit:', groupId)}
      onCreateRequest={createMockCreateRequest()}
      onGetActiveRequests={createMockGetActiveRequests([
        mockInProgressRequest,
        mockCompletedRequest,
      ])}
      onCancelRequest={mockCancelRequest}
      onDownloadReadyItems={mockDownloadReadyItems}
      formatBytes={mockFormatBytes}
    />
  );
}

/**
 * Empty state with no orbits available
 */
export function NoOrbitsAvailable(): JSX.Element {
  return (
    <OrbitalMediaRecovery
      groups={[]}
      onCreateRequest={createMockCreateRequest()}
      onGetActiveRequests={createMockGetActiveRequests([])}
      onCancelRequest={mockCancelRequest}
      onDownloadReadyItems={mockDownloadReadyItems}
      formatBytes={mockFormatBytes}
    />
  );
}

/**
 * Dark mode variant
 */
export function DarkMode(): JSX.Element {
  return (
    <div style={{
      backgroundColor: '#1a1a1a',
      padding: '24px',
      minHeight: '500px',
    }}>
      <div className="dark-theme">
        <OrbitalMediaRecovery
          groups={mockGroups}
          selectedGroupId="group-1"
          onSelectOrbit={(groupId) => console.log('Selected orbit:', groupId)}
          onCreateRequest={createMockCreateRequest()}
          onGetActiveRequests={createMockGetActiveRequests([mockInProgressRequest])}
          onCancelRequest={mockCancelRequest}
          onDownloadReadyItems={mockDownloadReadyItems}
          formatBytes={mockFormatBytes}
        />
      </div>
    </div>
  );
}

/**
 * Narrow width for mobile-like view
 */
export function NarrowWidth(): JSX.Element {
  return (
    <div style={{
      maxWidth: '360px',
      padding: '16px',
      backgroundColor: '#FAF9F7',
    }}>
      <OrbitalMediaRecovery
        groups={mockGroups}
        selectedGroupId="group-1"
        onSelectOrbit={(groupId) => console.log('Selected orbit:', groupId)}
        onCreateRequest={createMockCreateRequest()}
        onGetActiveRequests={createMockGetActiveRequests([mockInProgressRequest])}
        onCancelRequest={mockCancelRequest}
        onDownloadReadyItems={mockDownloadReadyItems}
        formatBytes={mockFormatBytes}
      />
    </div>
  );
}
