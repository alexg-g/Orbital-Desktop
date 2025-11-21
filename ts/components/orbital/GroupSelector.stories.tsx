// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState } from 'react';
import type { Meta } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { GroupSelector } from './GroupSelector';
import type { GroupInfo } from '../../services/orbitalGroups.preload';

export default {
  title: 'Orbital/GroupSelector',
  component: GroupSelector,
} satisfies Meta;

// Mock group data
const mockGroups: GroupInfo[] = [
  {
    groupId: 'group-1',
    name: 'Smith Family',
    encryptedName: 'encrypted-1',
    memberCount: 5,
    createdAt: '2024-01-01T00:00:00Z',
    isOwner: true,
  },
  {
    groupId: 'group-2',
    name: "Grandma's Kitchen",
    encryptedName: 'encrypted-2',
    memberCount: 8,
    createdAt: '2024-02-15T00:00:00Z',
    isOwner: false,
  },
  {
    groupId: 'group-3',
    name: 'Summer 2024 Reunion',
    encryptedName: 'encrypted-3',
    memberCount: 12,
    createdAt: '2024-06-01T00:00:00Z',
    isOwner: false,
  },
];

/**
 * Default state with multiple groups
 */
export function Default(): JSX.Element {
  const [selectedGroupId, setSelectedGroupId] = useState('group-1');

  return (
    <div style={{ padding: '20px', maxWidth: '320px', backgroundColor: '#FAF9F7' }}>
      <GroupSelector
        groups={mockGroups}
        selectedGroupId={selectedGroupId}
        onSelectGroup={(id) => {
          setSelectedGroupId(id);
          action('onSelectGroup')(id);
        }}
        onCreateGroup={action('onCreateGroup')}
        onJoinGroup={action('onJoinGroup')}
      />
    </div>
  );
}

/**
 * Empty state - no groups
 */
export function Empty(): JSX.Element {
  return (
    <div style={{ padding: '20px', maxWidth: '320px', backgroundColor: '#FAF9F7' }}>
      <GroupSelector
        groups={[]}
        onSelectGroup={action('onSelectGroup')}
        onCreateGroup={action('onCreateGroup')}
        onJoinGroup={action('onJoinGroup')}
      />
    </div>
  );
}

/**
 * Loading state
 */
export function Loading(): JSX.Element {
  return (
    <div style={{ padding: '20px', maxWidth: '320px', backgroundColor: '#FAF9F7' }}>
      <GroupSelector
        groups={[]}
        isLoading={true}
        onSelectGroup={action('onSelectGroup')}
        onCreateGroup={action('onCreateGroup')}
        onJoinGroup={action('onJoinGroup')}
      />
    </div>
  );
}

/**
 * Error state
 */
export function WithError(): JSX.Element {
  return (
    <div style={{ padding: '20px', maxWidth: '320px', backgroundColor: '#FAF9F7' }}>
      <GroupSelector
        groups={mockGroups}
        selectedGroupId="group-1"
        error="Failed to load groups. Please try again."
        onSelectGroup={action('onSelectGroup')}
        onCreateGroup={action('onCreateGroup')}
        onJoinGroup={action('onJoinGroup')}
      />
    </div>
  );
}

/**
 * Single group
 */
export function SingleGroup(): JSX.Element {
  const singleGroup: GroupInfo[] = [
    {
      groupId: 'group-1',
      name: 'My First Orbit',
      encryptedName: 'encrypted-1',
      memberCount: 1,
      createdAt: '2024-01-01T00:00:00Z',
      isOwner: true,
    },
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '320px', backgroundColor: '#FAF9F7' }}>
      <GroupSelector
        groups={singleGroup}
        selectedGroupId="group-1"
        onSelectGroup={action('onSelectGroup')}
        onCreateGroup={action('onCreateGroup')}
        onJoinGroup={action('onJoinGroup')}
      />
    </div>
  );
}

/**
 * Many groups (scrollable)
 */
export function ManyGroups(): JSX.Element {
  const manyGroups: GroupInfo[] = Array.from({ length: 10 }, (_, i) => ({
    groupId: `group-${i + 1}`,
    name: `Family Group ${i + 1}`,
    encryptedName: `encrypted-${i + 1}`,
    memberCount: Math.floor(Math.random() * 10) + 1,
    createdAt: new Date(2024, i % 12, 1).toISOString(),
    isOwner: i === 0,
  }));

  const [selectedGroupId, setSelectedGroupId] = useState('group-1');

  return (
    <div style={{ padding: '20px', maxWidth: '320px', height: '400px', backgroundColor: '#FAF9F7' }}>
      <GroupSelector
        groups={manyGroups}
        selectedGroupId={selectedGroupId}
        onSelectGroup={(id) => {
          setSelectedGroupId(id);
          action('onSelectGroup')(id);
        }}
        onCreateGroup={action('onCreateGroup')}
        onJoinGroup={action('onJoinGroup')}
      />
    </div>
  );
}
