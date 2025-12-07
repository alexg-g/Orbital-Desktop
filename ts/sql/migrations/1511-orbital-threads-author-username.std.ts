// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Migration 1511: Add author_username to orbital_threads
 *
 * Adds author_username column to orbital_threads table so that
 * thread authors can be displayed without additional lookups.
 *
 * The author_username is cached at sync time from the backend API.
 * This allows offline display of thread authors.
 */

import type { WritableDB } from '../Interface.std.js';

export default function updateToSchemaVersion1511(db: WritableDB): void {
  // Add author_username column (nullable for existing data)
  db.exec(`
    ALTER TABLE orbital_threads
    ADD COLUMN author_username TEXT NOT NULL DEFAULT '';
  `);
}
