// Copyright 2024 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { Database } from '@signalapp/sqlcipher';
import type { LoggerType } from '../../types/Logging.std.js';

// Stub migration for Orbital - Story feature removed
// Original migration created isStory index for message queries
export default function updateToSchemaVersion1130(
  currentVersion: number,
  db: Database,
  logger: LoggerType
): void {
  if (currentVersion >= 1130) {
    return;
  }

  db.transaction(() => {
    // Story feature stub - no-op
    db.pragma('user_version = 1130');
  })();

  logger.info('updateToSchemaVersion1130: success (stub migration)');
}
