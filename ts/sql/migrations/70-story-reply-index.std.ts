// Copyright 2022 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { Database } from '@signalapp/sqlcipher';
import type { LoggerType } from '../../types/Logging.std.js';

// Stub migration for Orbital - Story feature removed
// Original migration created index for story replies
export default function updateToSchemaVersion70(
  db: Database,
  logger: LoggerType
): void {
  // Story feature stub - no-op
  logger.info('updateToSchemaVersion70: success (stub migration)');
}
