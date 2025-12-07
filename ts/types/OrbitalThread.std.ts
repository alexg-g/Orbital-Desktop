// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Thread Types
 *
 * Types for Orbital's threaded discussions stored in SQLCipher.
 *
 * Architecture (Local-First per PRD):
 * - Threads are stored permanently in local SQLCipher (source of truth)
 * - Server acts as 7-day relay for syncing between orbit members
 * - Server deletes after 7 days, but all orbit members have permanent copies
 *
 * Security:
 * - Title and body encrypted with group key (AES-GCM)
 * - SQLCipher provides database-level encryption at rest
 * - Decryption happens client-side only
 */

/**
 * Orbital Thread (stored in orbital_threads table)
 *
 * Represents a discussion thread in an orbit.
 * Threads are the core organizational unit for discussions.
 */
export type OrbitalThreadType = {
  /**
   * Unique thread ID (UUID v4)
   * Generated client-side before storage
   * Matches server thread_id when synced
   */
  id: string;

  /**
   * Group/Orbit ID this thread belongs to
   */
  groupId: string;

  /**
   * Author's member ID (who created the thread)
   */
  authorId: string;

  /**
   * Author's username (cached at sync time)
   * Allows offline display of thread authors
   */
  authorUsername: string;

  /**
   * Thread title (encrypted with group key, base64)
   * Max ~200 characters plaintext
   */
  encryptedTitle: string;

  /**
   * Thread body (encrypted with group key, base64)
   * Supports markdown formatting
   */
  encryptedBody: string;

  /**
   * Encryption IV for title (base64)
   * Used for AES-GCM decryption
   */
  titleIv: string;

  /**
   * Encryption IV for body (base64)
   * Used for AES-GCM decryption
   */
  bodyIv: string;

  /**
   * Creation timestamp (Unix milliseconds)
   */
  createdAt: number;

  /**
   * Last reply timestamp (Unix milliseconds)
   * Updated when new replies are posted
   * Used for sorting by activity
   */
  lastReplyAt?: number;

  /**
   * Cached reply count
   * Updated when replies are added/removed
   */
  replyCount: number;

  /**
   * Cached media count
   * Updated when media is added/removed
   */
  mediaCount: number;

  /**
   * Sync status
   * true = Created locally, pending sync to server
   * false = Synced with server (or came from server)
   */
  pendingSync: boolean;
};

/**
 * Orbital Thread for UI Display
 *
 * Extended type for rendering threads in the inbox.
 * Includes decrypted content and display metadata.
 */
export type OrbitalThreadForUI = {
  /**
   * Thread ID
   */
  id: string;

  /**
   * Group ID
   */
  groupId: string;

  /**
   * Author ID
   */
  authorId: string;

  /**
   * Author display name (resolved from orbit members)
   */
  authorName: string;

  /**
   * Author avatar URL (resolved from orbit members)
   */
  authorAvatarUrl?: string;

  /**
   * Decrypted thread title (plaintext)
   */
  title: string;

  /**
   * Decrypted thread body (plaintext, may contain markdown)
   */
  body: string;

  /**
   * Creation timestamp (Unix milliseconds)
   */
  createdAt: number;

  /**
   * Last reply timestamp (Unix milliseconds)
   */
  lastReplyAt?: number;

  /**
   * Reply count
   */
  replyCount: number;

  /**
   * Media count
   */
  mediaCount: number;

  /**
   * Whether thread has any media attachments
   */
  hasMedia: boolean;

  /**
   * Whether thread has video attachments
   */
  hasVideo: boolean;

  /**
   * Whether thread has image attachments
   */
  hasImage: boolean;

  /**
   * Sync status indicator
   */
  pendingSync: boolean;
};
