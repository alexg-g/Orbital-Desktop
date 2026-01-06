// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import type { Meta } from '@storybook/react';
import { OrbitalFileBrowser } from './OrbitalFileBrowser';
import type {
  OrbitalFileBrowserItem,
  GetOrbitalFileBrowserMediaOptions,
  GetOrbitalFileBrowserMediaResult,
} from '../../types/OrbitalFileBrowser.std';

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
    encryptedName: 'encrypted-smith-family',
    memberCount: 5,
    createdAt: String(Date.now() - 365 * 24 * 60 * 60 * 1000),
    isOwner: true,
  },
  {
    groupId: 'group-2',
    name: 'College Friends',
    encryptedName: 'encrypted-college-friends',
    memberCount: 8,
    createdAt: String(Date.now() - 180 * 24 * 60 * 60 * 1000),
    isOwner: false,
  },
  {
    groupId: 'group-3',
    name: 'Work Team',
    encryptedName: 'encrypted-work-team',
    memberCount: 12,
    createdAt: String(Date.now() - 90 * 24 * 60 * 60 * 1000),
    isOwner: false,
  },
];

// Mock media items
const mockMediaItems: OrbitalFileBrowserItem[] = [
  // Today's images
  {
    id: 'media-1',
    source: 'orbital',
    contentType: 'image/jpeg',
    fileName: 'family-photo-001.jpg',
    size: 2.5 * 1024 * 1024,
    width: 1920,
    height: 1080,
    localPath: 'attachments/abc123.jpg',
    createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    groupId: 'group-1',
    groupName: 'Smith Family',
  },
  {
    id: 'media-2',
    source: 'signal',
    contentType: 'image/png',
    fileName: 'screenshot.png',
    size: 1.2 * 1024 * 1024,
    width: 1440,
    height: 900,
    localPath: 'attachments/def456.png',
    createdAt: Date.now() - 4 * 60 * 60 * 1000, // 4 hours ago
    groupId: 'group-1',
    groupName: 'Smith Family',
    messageId: 'msg-123',
  },
  // Yesterday's video
  {
    id: 'media-3',
    source: 'orbital',
    contentType: 'video/mp4',
    fileName: 'birthday-party.mp4',
    size: 45 * 1024 * 1024,
    width: 1920,
    height: 1080,
    duration: 180000, // 3 minutes
    localPath: 'attachments/ghi789.mp4',
    createdAt: Date.now() - 26 * 60 * 60 * 1000, // Yesterday
    groupId: 'group-1',
    groupName: 'Smith Family',
    threadId: 'thread-1',
  },
  // This week - PDF
  {
    id: 'media-4',
    source: 'signal',
    contentType: 'application/pdf',
    fileName: 'meeting-notes.pdf',
    size: 512 * 1024,
    localPath: 'attachments/jkl012.pdf',
    createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
    groupId: 'group-3',
    groupName: 'Work Team',
    messageId: 'msg-456',
  },
  // This week - audio
  {
    id: 'media-5',
    source: 'orbital',
    contentType: 'audio/mp3',
    fileName: 'voice-memo.mp3',
    size: 3.2 * 1024 * 1024,
    duration: 120000, // 2 minutes
    localPath: 'attachments/mno345.mp3',
    createdAt: Date.now() - 4 * 24 * 60 * 60 * 1000, // 4 days ago
    groupId: 'group-2',
    groupName: 'College Friends',
  },
  // Last week - images
  {
    id: 'media-6',
    source: 'orbital',
    contentType: 'image/jpeg',
    fileName: 'vacation-sunset.jpg',
    size: 3.8 * 1024 * 1024,
    width: 4032,
    height: 3024,
    blurHash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
    localPath: 'attachments/pqr678.jpg',
    createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
    groupId: 'group-2',
    groupName: 'College Friends',
  },
  {
    id: 'media-7',
    source: 'signal',
    contentType: 'image/webp',
    fileName: 'meme.webp',
    size: 256 * 1024,
    width: 800,
    height: 600,
    localPath: 'attachments/stu901.webp',
    createdAt: Date.now() - 12 * 24 * 60 * 60 * 1000, // 12 days ago
    groupId: 'group-2',
    groupName: 'College Friends',
    messageId: 'msg-789',
  },
  // Older - document
  {
    id: 'media-8',
    source: 'orbital',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileName: 'project-proposal.docx',
    size: 1.5 * 1024 * 1024,
    localPath: 'attachments/vwx234.docx',
    createdAt: Date.now() - 45 * 24 * 60 * 60 * 1000, // 45 days ago
    groupId: 'group-3',
    groupName: 'Work Team',
  },
];

// Mock getAbsoluteAttachmentPath - returns a placeholder image URL for demo
const mockGetAbsoluteAttachmentPath = (relativePath: string): string => {
  // For demo purposes, return placeholder images based on file type
  if (relativePath.endsWith('.jpg') || relativePath.endsWith('.jpeg')) {
    return '/fixtures/kitten-1-64-64.jpg';
  }
  if (relativePath.endsWith('.png')) {
    return '/fixtures/kitten-2-64-64.jpg';
  }
  if (relativePath.endsWith('.webp')) {
    return '/fixtures/kitten-3-64-64.jpg';
  }
  // For non-image files, return empty (will show placeholder)
  return relativePath;
};

// Mock getFileBrowserMedia function - filters and returns mock data
const createMockGetFileBrowserMedia = (
  items: OrbitalFileBrowserItem[]
) => async (
  options: GetOrbitalFileBrowserMediaOptions
): Promise<GetOrbitalFileBrowserMediaResult> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 300));

  let filtered = [...items];

  // Filter by group
  if (options.groupId) {
    filtered = filtered.filter(item => item.groupId === options.groupId);
  }

  // Filter by media type
  if (options.mediaType !== 'all') {
    filtered = filtered.filter(item => {
      const ct = item.contentType || '';
      if (options.mediaType === 'images') return ct.startsWith('image/');
      if (options.mediaType === 'videos') return ct.startsWith('video/');
      if (options.mediaType === 'other') {
        return !ct.startsWith('image/') && !ct.startsWith('video/');
      }
      return true;
    });
  }

  // Sort
  filtered.sort((a, b) => {
    const diff = b.createdAt - a.createdAt;
    return options.sortOrder === 'oldest' ? -diff : diff;
  });

  // Pagination
  const startIndex = options.cursor
    ? filtered.findIndex(i => i.id === options.cursor?.id) + 1
    : 0;
  const endIndex = startIndex + options.limit;
  const pageItems = filtered.slice(startIndex, endIndex);

  return {
    items: pageItems,
    hasMore: endIndex < filtered.length,
    nextCursor:
      endIndex < filtered.length
        ? {
            createdAt: pageItems[pageItems.length - 1].createdAt,
            id: pageItems[pageItems.length - 1].id,
          }
        : undefined,
  };
};

// Create default mock that returns all items
const mockGetFileBrowserMedia = createMockGetFileBrowserMedia(mockMediaItems);

// Create empty mock
const mockGetFileBrowserMediaEmpty = createMockGetFileBrowserMedia([]);

export default {
  title: 'Orbital/FileBrowser/OrbitalFileBrowser',
  component: OrbitalFileBrowser,
  decorators: [
    Story => (
      <div
        style={{
          padding: '24px',
          maxWidth: '900px',
          backgroundColor: '#FAF9F7',
          minHeight: '600px',
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

/**
 * Default state showing all media items grouped by date.
 * Click on any item to open the lightbox!
 */
export function Default(): JSX.Element {
  return (
    <OrbitalFileBrowser
      groups={mockGroups}
      onItemClick={item => console.log('Clicked item:', item)}
      getAbsoluteAttachmentPath={mockGetAbsoluteAttachmentPath}
      getFileBrowserMedia={mockGetFileBrowserMedia}
    />
  );
}

/**
 * With a specific orbit selected - filters to Smith Family media only
 */
export function WithSelectedOrbit(): JSX.Element {
  return (
    <OrbitalFileBrowser
      groups={mockGroups}
      selectedGroupId="group-1"
      onSelectOrbit={groupId => console.log('Selected orbit:', groupId)}
      onItemClick={item => console.log('Clicked item:', item)}
      getAbsoluteAttachmentPath={mockGetAbsoluteAttachmentPath}
      getFileBrowserMedia={mockGetFileBrowserMedia}
    />
  );
}

/**
 * Empty state with no media files
 */
export function EmptyState(): JSX.Element {
  return (
    <OrbitalFileBrowser
      groups={mockGroups}
      selectedGroupId="group-1"
      onItemClick={item => console.log('Clicked item:', item)}
      getAbsoluteAttachmentPath={mockGetAbsoluteAttachmentPath}
      getFileBrowserMedia={mockGetFileBrowserMediaEmpty}
    />
  );
}

/**
 * No groups available
 */
export function NoGroups(): JSX.Element {
  return (
    <OrbitalFileBrowser
      groups={[]}
      onItemClick={item => console.log('Clicked item:', item)}
      getAbsoluteAttachmentPath={mockGetAbsoluteAttachmentPath}
      getFileBrowserMedia={mockGetFileBrowserMediaEmpty}
    />
  );
}

/**
 * Dark mode variant with lightbox
 */
export function DarkMode(): JSX.Element {
  return (
    <div
      style={{
        backgroundColor: '#1a1a1a',
        padding: '24px',
        minHeight: '600px',
      }}
    >
      <div className="dark-theme">
        <OrbitalFileBrowser
          groups={mockGroups}
          selectedGroupId="group-1"
          onItemClick={item => console.log('Clicked item:', item)}
          getAbsoluteAttachmentPath={mockGetAbsoluteAttachmentPath}
          getFileBrowserMedia={mockGetFileBrowserMedia}
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
    <div
      style={{
        maxWidth: '360px',
        padding: '16px',
        backgroundColor: '#FAF9F7',
        minHeight: '500px',
      }}
    >
      <OrbitalFileBrowser
        groups={mockGroups}
        selectedGroupId="group-1"
        onItemClick={item => console.log('Clicked item:', item)}
        getAbsoluteAttachmentPath={mockGetAbsoluteAttachmentPath}
        getFileBrowserMedia={mockGetFileBrowserMedia}
      />
    </div>
  );
}
