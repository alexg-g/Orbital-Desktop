// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Migration 1513: Add group_id to orbital_media
 *
 * Adds direct group_id column to orbital_media table for efficient
 * filtering in the File Library Browser.
 *
 * Previously, group_id was only available via join to orbital_threads,
 * but media can exist without being attached to a specific thread
 * (e.g., media in DM conversations or media uploaded without a thread context).
 */

import type { WritableDB } from '../Interface.std.js';

export default function updateToSchemaVersion1513(db: WritableDB): void {
  // Add group_id column to orbital_media
  db.exec(`
    ALTER TABLE orbital_media
    ADD COLUMN group_id TEXT;
  `);

  // Create index for efficient filtering by group
  db.exec(`
    CREATE INDEX orbital_media_group_id
    ON orbital_media(group_id, created_at DESC)
    WHERE group_id IS NOT NULL;
  `);

  // Backfill group_id from orbital_threads for existing media
  db.exec(`
    UPDATE orbital_media
    SET group_id = (
      SELECT ot.group_id
      FROM orbital_threads ot
      WHERE ot.id = orbital_media.thread_id
    )
    WHERE thread_id IS NOT NULL AND thread_id != '';
  `);
}
