// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital type definitions
 * Types for users, chats, and orbits used across the application.
 */

/**
 * Orbital orbit (group) type
 * This mirrors the GroupInfo type from orbitalGroups.preload.ts
 */
export type OrbitalOrbit = {
  groupId: string;
  name: string;
  encryptedName: string;
  createdBy: string; // userId of creator
  memberIds: string[]; // Array of member userIds
  memberCount: number;
  createdAt: string;
};

/**
 * Orbital user type
 * Represents a user profile in the system
 */
export type OrbitalUser = {
  id: string;
  name: string;
  avatarUrl?: string;
  isOnline?: boolean;
  orbitIds?: string[]; // Which orbits this user belongs to
};

/**
 * Orbital chat (direct message) type
 * Chats are global 1:1 Signal-style conversations (orbit-agnostic)
 */
export type OrbitalChat = {
  id: string;
  recipientId: string; // The other person in the chat
  name: string;
  avatarUrl?: string;
  lastMessage: string;
  lastMessageTimestamp: number;
  unreadCount: number;
  isOnline?: boolean;
  sharedOrbitIds?: string[]; // Optional: orbits shared with this contact
};
