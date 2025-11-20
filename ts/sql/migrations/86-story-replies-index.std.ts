// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { Database } from '@signalapp/sqlcipher';
import type { LoggerType } from '../../types/Logging.std.js';

// Stub migration for Orbital - Story feature removed
// Original migration optimized story replies index
export default function updateToSchemaVersion86(
  currentVersion: number,
  db: Database,
  logger: LoggerType
): void {
  if (currentVersion >= 86) {
    return;
  }

  db.transaction(() => {
    // Story feature stub - no-op
    db.pragma('user_version = 86');
  })();

  logger.info('updateToSchemaVersion86: success (stub migration)');
}
