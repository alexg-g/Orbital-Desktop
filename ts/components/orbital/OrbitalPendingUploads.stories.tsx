// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import type { Meta } from '@storybook/react';
import {
  OrbitalPendingUploads,
  OrbitalPendingUploadsBadge,
  type PendingUploadRequest,
} from './OrbitalPendingUploads';

// Mock pending upload requests
const mockSingleRequest: PendingUploadRequest = {
  requestId: 'req-1',
  requestorName: 'Mom',
  groupName: 'Smith Family',
  itemsCount: 12,
  totalBytes: 245 * 1024 * 1024, // 245 MB
  receivedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
  expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000,
};

const mockMultipleRequests: PendingUploadRequest[] = [
  {
    requestId: 'req-1',
    requestorName: 'Mom',
    groupName: 'Smith Family',
    itemsCount: 12,
    totalBytes: 245 * 1024 * 1024,
    receivedAt: Date.now() - 2 * 60 * 60 * 1000,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000,
  },
  {
    requestId: 'req-2',
    requestorName: 'Sarah',
    groupName: 'College Friends',
    itemsCount: 47,
    totalBytes: 1.8 * 1024 * 1024 * 1024, // 1.8 GB
    receivedAt: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
    expiresAt: Date.now() + 6 * 24 * 60 * 60 * 1000,
  },
  {
    requestId: 'req-3',
    requestorName: 'Dad',
    groupName: 'Smith Family',
    itemsCount: 5,
    totalBytes: 89 * 1024 * 1024, // 89 MB
    receivedAt: Date.now() - 30 * 60 * 1000, // 30 minutes ago
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 - 30 * 60 * 1000,
  },
];

// Mock helper functions
const mockFormatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const mockFormatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (60 * 1000));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
};

// Mock async functions
const mockShare = async (requestId: string): Promise<void> => {
  console.log('Sharing files for request:', requestId);
  // Simulate upload time
  await new Promise(resolve => setTimeout(resolve, 1500));
  console.log('Files shared successfully for:', requestId);
};

const mockDecline = (requestId: string): void => {
  console.log('Declined request:', requestId);
};

const mockDismiss = (): void => {
  console.log('Dismissed notification');
};

export default {
  title: 'Orbital/MediaSync/PendingUploads',
  component: OrbitalPendingUploads,
  decorators: [
    (Story) => (
      <div style={{
        padding: '24px',
        maxWidth: '500px',
        backgroundColor: '#FAF9F7',
        minHeight: '200px',
      }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

/**
 * Single request from one orbit member
 */
export function SingleRequest(): JSX.Element {
  return (
    <OrbitalPendingUploads
      requests={[mockSingleRequest]}
      onShare={mockShare}
      onDecline={mockDecline}
      onDismiss={mockDismiss}
      formatBytes={mockFormatBytes}
      formatRelativeTime={mockFormatRelativeTime}
    />
  );
}

/**
 * Multiple requests from different orbit members
 */
export function MultipleRequests(): JSX.Element {
  return (
    <OrbitalPendingUploads
      requests={mockMultipleRequests}
      onShare={mockShare}
      onDecline={mockDecline}
      onDismiss={mockDismiss}
      formatBytes={mockFormatBytes}
      formatRelativeTime={mockFormatRelativeTime}
    />
  );
}

/**
 * Banner without dismiss button
 */
export function NoDismissButton(): JSX.Element {
  return (
    <OrbitalPendingUploads
      requests={[mockSingleRequest]}
      onShare={mockShare}
      onDecline={mockDecline}
      formatBytes={mockFormatBytes}
      formatRelativeTime={mockFormatRelativeTime}
    />
  );
}

/**
 * Empty state - returns null (no render)
 */
export function EmptyState(): JSX.Element {
  return (
    <div>
      <p style={{ marginBottom: '16px', color: '#666' }}>
        The component returns null when there are no requests:
      </p>
      <div style={{
        border: '2px dashed #ccc',
        padding: '16px',
        borderRadius: '8px',
        minHeight: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#999',
      }}>
        <OrbitalPendingUploads
          requests={[]}
          onShare={mockShare}
          onDecline={mockDecline}
          formatBytes={mockFormatBytes}
          formatRelativeTime={mockFormatRelativeTime}
        />
        (Nothing renders here)
      </div>
    </div>
  );
}

/**
 * Large file request
 */
export function LargeFileRequest(): JSX.Element {
  const largeRequest: PendingUploadRequest = {
    requestId: 'req-large',
    requestorName: 'Uncle Bob',
    groupName: 'Extended Family',
    itemsCount: 156,
    totalBytes: 8.5 * 1024 * 1024 * 1024, // 8.5 GB
    receivedAt: Date.now() - 6 * 60 * 60 * 1000, // 6 hours ago
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 - 6 * 60 * 60 * 1000,
  };

  return (
    <OrbitalPendingUploads
      requests={[largeRequest]}
      onShare={mockShare}
      onDecline={mockDecline}
      onDismiss={mockDismiss}
      formatBytes={mockFormatBytes}
      formatRelativeTime={mockFormatRelativeTime}
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
      minHeight: '200px',
    }}>
      <div className="dark-theme">
        <OrbitalPendingUploads
          requests={mockMultipleRequests}
          onShare={mockShare}
          onDecline={mockDecline}
          onDismiss={mockDismiss}
          formatBytes={mockFormatBytes}
          formatRelativeTime={mockFormatRelativeTime}
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
      maxWidth: '320px',
      padding: '8px',
      backgroundColor: '#FAF9F7',
    }}>
      <OrbitalPendingUploads
        requests={mockMultipleRequests}
        onShare={mockShare}
        onDecline={mockDecline}
        onDismiss={mockDismiss}
        formatBytes={mockFormatBytes}
        formatRelativeTime={mockFormatRelativeTime}
      />
    </div>
  );
}

// Badge Stories
/**
 * Notification badge with count
 */
export function Badge(): JSX.Element {
  return (
    <div style={{
      display: 'flex',
      gap: '24px',
      alignItems: 'center',
      padding: '24px',
    }}>
      <div style={{ textAlign: 'center' }}>
        <OrbitalPendingUploadsBadge
          count={1}
          onClick={() => console.log('Badge clicked')}
        />
        <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>1 request</p>
      </div>
      <div style={{ textAlign: 'center' }}>
        <OrbitalPendingUploadsBadge
          count={3}
          onClick={() => console.log('Badge clicked')}
        />
        <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>3 requests</p>
      </div>
      <div style={{ textAlign: 'center' }}>
        <OrbitalPendingUploadsBadge
          count={12}
          onClick={() => console.log('Badge clicked')}
        />
        <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>12 requests</p>
      </div>
      <div style={{ textAlign: 'center' }}>
        <OrbitalPendingUploadsBadge
          count={0}
          onClick={() => console.log('Badge clicked')}
        />
        <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>0 (hidden)</p>
      </div>
    </div>
  );
}

/**
 * Badge in context (simulated header/sidebar)
 */
export function BadgeInContext(): JSX.Element {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 16px',
      backgroundColor: '#2c2c2c',
      borderRadius: '8px',
      color: 'white',
    }}>
      <span style={{ fontSize: '14px' }}>Media Sync</span>
      <OrbitalPendingUploadsBadge
        count={3}
        onClick={() => console.log('Open pending uploads')}
      />
    </div>
  );
}
