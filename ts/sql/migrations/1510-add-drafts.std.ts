// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Migration 1510: Drafts Table
 *
 * Creates table for storing composer drafts per thread/chat context.
 * Drafts persist across app restarts and allow users to resume
 * composing messages where they left off.
 *
 * Design:
 * - One draft per context (thread or chat)
 * - Upsert semantics (replace existing draft)
 * - Index on updatedAt for cleanup queries
 */

import type { WritableDB } from '../Interface.std.js';

export default function updateToSchemaVersion1510(db: WritableDB): void {
  db.exec(`
    -- Drafts Table
    --
    -- Stores composer drafts per thread/chat context.
    -- Each context can have exactly one draft (PRIMARY KEY on contextId).
    --
    -- Lifecycle:
    -- 1. User starts composing -> draft created/updated
    -- 2. User sends message -> draft deleted
    -- 3. User navigates away -> draft persists
    -- 4. App restarts -> drafts loaded from database
    -- 5. Cleanup job deletes old drafts (configurable age)
    CREATE TABLE drafts (
      -- Context identifier (threadId or conversationId)
      -- Primary key ensures one draft per context
      context_id TEXT PRIMARY KEY NOT NULL,

      -- Type of context: 'thread' for Orbital threads, 'chat' for Signal conversations
      context_type TEXT NOT NULL CHECK (context_type IN ('thread', 'chat')),

      -- Draft title (optional, for new thread creation)
      title TEXT,

      -- Draft message body content
      body TEXT NOT NULL,

      -- Parent message ID if replying to specific message
      parent_message_id TEXT,

      -- Last update timestamp (Unix milliseconds)
      -- Used for sorting and cleanup
      updated_at INTEGER NOT NULL
    ) STRICT;
  `);

  // Index: Fast lookup and cleanup by update time
  db.exec(`
    CREATE INDEX drafts_updated_at
    ON drafts(updated_at);
  `);

  // Index: Fast lookup by context type (for loading all thread or chat drafts)
  db.exec(`
    CREATE INDEX drafts_context_type
    ON drafts(context_type);
  `);
}
