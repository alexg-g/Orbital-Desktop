// Copyright 2022 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { Database } from '@signalapp/sqlcipher';
import type { LoggerType } from '../../types/Logging.std.js';

// Stub migration for Orbital - Story feature removed
// Original migration created index for story replies
export default function updateToSchemaVersion70(
  currentVersion: number,
  db: Database,
  logger: LoggerType
): void {
  if (currentVersion >= 70) {
    return;
  }

  db.transaction(() => {
    // Story feature stub - no-op
    db.pragma('user_version = 70');
  })();

  logger.info('updateToSchemaVersion70: success (stub migration)');
}
