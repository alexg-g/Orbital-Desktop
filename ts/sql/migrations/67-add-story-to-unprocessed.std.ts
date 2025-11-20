// Copyright 2022 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { Database } from '@signalapp/sqlcipher';
import type { LoggerType } from '../../types/Logging.std.js';

// Stub migration for Orbital - Story feature removed
// Original migration added storyId column to unprocessed table
export default function updateToSchemaVersion67(
  currentVersion: number,
  db: Database,
  logger: LoggerType
): void {
  if (currentVersion >= 67) {
    return;
  }

  db.transaction(() => {
    // Story feature stub - add column if it doesn't exist
    try {
      db.exec(`
        ALTER TABLE unprocessed ADD COLUMN storyId STRING;
      `);
    } catch {
      // Column may already exist
    }

    db.pragma('user_version = 67');
  })();

  logger.info('updateToSchemaVersion67: success (stub migration)');
}
