// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { Database } from '@signalapp/sqlcipher';
import type { LoggerType } from '../../types/Logging.std.js';

// Stub migration for Orbital - Story feature removed
// Original migration handled deletion of story reply screenshots
export default function updateToSchemaVersion90(
  currentVersion: number,
  db: Database,
  logger: LoggerType
): void {
  if (currentVersion >= 90) {
    return;
  }

  db.transaction(() => {
    // Story feature stub - no-op
    db.pragma('user_version = 90');
  })();

  logger.info('updateToSchemaVersion90: success (stub migration)');
}
