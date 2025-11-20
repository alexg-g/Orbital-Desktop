// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Migration 1501: Orbital Threads
 *
 * Creates local table for Orbital's threaded discussions.
 *
 * Architecture:
 * - Threads are the core organizational unit for discussions
 * - Each thread belongs to a group (orbit)
 * - Threads contain encrypted title and body (decrypted client-side)
 * - Media and replies reference threads
 *
 * Security:
 * - All content fields encrypted by group key (AES-GCM)
 * - SQLCipher provides database-level encryption at rest
 * - Decryption happens client-side only
 */

import type { WritableDB } from '../Interface.std.js';

export default function updateToSchemaVersion1501(db: WritableDB): void {
  db.exec(`
    -- Orbital Threads Table
    --
    -- Stores discussion threads for threaded forum-style conversations.
    -- Each thread belongs to an orbit (group) and has a title + body.
    --
    -- Relationship:
    -- - orbital_media.thread_id → orbital_threads.id
    -- - orbital_replies.thread_id → orbital_threads.id (future migration)
    --
    CREATE TABLE orbital_threads (
      -- Client-side UUID (matches server thread_id)
      id TEXT PRIMARY KEY NOT NULL,

      -- Group/Orbit this thread belongs to
      -- References Signal's conversations table (group conversation)
      group_id TEXT NOT NULL,

      -- Author's member ID (who created the thread)
      author_id TEXT NOT NULL,

      -- Thread title (encrypted with group key, base64)
      -- Max ~200 characters plaintext
      encrypted_title TEXT NOT NULL,

      -- Thread body (encrypted with group key, base64)
      -- Supports markdown formatting
      encrypted_body TEXT NOT NULL,

      -- Encryption IV for title (base64)
      title_iv TEXT NOT NULL,

      -- Encryption IV for body (base64)
      body_iv TEXT NOT NULL,

      -- Creation timestamp (Unix milliseconds)
      created_at INTEGER NOT NULL,

      -- Last reply timestamp (Unix milliseconds)
      -- Updated when new replies are posted
      -- Used for sorting by activity
      last_reply_at INTEGER,

      -- Cached reply count
      -- Updated when replies are added/removed
      reply_count INTEGER NOT NULL DEFAULT 0,

      -- Cached media count
      -- Updated when media is added/removed
      media_count INTEGER NOT NULL DEFAULT 0,

      -- Sync status
      -- 0 = Synced from server
      -- 1 = Created locally, pending sync
      pending_sync INTEGER NOT NULL DEFAULT 0 CHECK (pending_sync IN (0, 1))
    ) STRICT;
  `);

  // Index: Fast lookup by group (for listing threads in orbit)
  db.exec(`
    CREATE INDEX orbital_threads_group_id
    ON orbital_threads(group_id, created_at DESC);
  `);

  // Index: Fast lookup by group sorted by activity
  db.exec(`
    CREATE INDEX orbital_threads_group_activity
    ON orbital_threads(group_id, last_reply_at DESC)
    WHERE last_reply_at IS NOT NULL;
  `);

  // Index: Fast lookup by author
  db.exec(`
    CREATE INDEX orbital_threads_author_id
    ON orbital_threads(author_id, created_at DESC);
  `);

  // Index: Fast lookup for pending sync
  db.exec(`
    CREATE INDEX orbital_threads_pending_sync
    ON orbital_threads(pending_sync)
    WHERE pending_sync = 1;
  `);
}
