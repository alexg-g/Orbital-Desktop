// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Storybook mock for orbitalGroups.preload.ts
 * Provides stub implementations for group functions that work in browser environment
 */

export type GroupInfo = {
  groupId: string;
  name: string;
  memberCount: number;
  createdAt: string;
  isCreator: boolean;
};

export type InviteCode = {
  code: string;
  link?: string;
  targetEmail?: string;
  createdAt?: string;
  expiresAt?: string;
  status?: string;
};

export async function getGroups(): Promise<GroupInfo[]> {
  console.log('[Storybook Mock] getGroups called');
  return [
    {
      groupId: 'mock-group-1',
      name: 'Family Orbit',
      memberCount: 4,
      createdAt: new Date().toISOString(),
      isCreator: true,
    },
  ];
}

export async function createGroup(_name: string): Promise<GroupInfo> {
  console.log('[Storybook Mock] createGroup called');
  return {
    groupId: 'mock-new-group',
    name: _name,
    memberCount: 1,
    createdAt: new Date().toISOString(),
    isCreator: true,
  };
}

export async function joinGroup(_code: string): Promise<GroupInfo> {
  console.log('[Storybook Mock] joinGroup called');
  return {
    groupId: 'mock-joined-group',
    name: 'Joined Orbit',
    memberCount: 5,
    createdAt: new Date().toISOString(),
    isCreator: false,
  };
}

export async function generateInviteCode(_groupId: string, _targetEmail: string): Promise<InviteCode> {
  console.log('[Storybook Mock] generateInviteCode called');
  return {
    code: 'MOCK-CODE-123',
    targetEmail: _targetEmail,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
  };
}

export async function generateInviteLink(_groupId: string, _targetEmail: string): Promise<InviteCode> {
  console.log('[Storybook Mock] generateInviteLink called');
  return {
    code: 'MOCK-LINK-456',
    link: 'orbital://invite/MOCK-LINK-456',
    targetEmail: _targetEmail,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
  };
}

export async function getActiveInviteCodes(_groupId: string): Promise<InviteCode[]> {
  console.log('[Storybook Mock] getActiveInviteCodes called');
  return [
    {
      code: 'EXISTING-001',
      targetEmail: 'family@example.com',
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    },
  ];
}

export async function leaveGroup(_groupId: string): Promise<void> {
  console.log('[Storybook Mock] leaveGroup called');
}

export async function getGroupMembers(_groupId: string): Promise<Array<{ userId: string; username: string; isCreator: boolean }>> {
  console.log('[Storybook Mock] getGroupMembers called');
  return [
    { userId: 'user-1', username: 'Mom', isCreator: true },
    { userId: 'user-2', username: 'Dad', isCreator: false },
    { userId: 'user-3', username: 'Sister', isCreator: false },
  ];
}
