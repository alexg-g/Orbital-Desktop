// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { Database } from '@signalapp/sqlcipher';
import type { LoggerType } from '../../types/Logging.std.js';

// Stub migration for Orbital - Story feature removed
// Original migration handled deletion of story reply screenshots
export default function updateToSchemaVersion90(
  db: Database,
  logger: LoggerType
): void {
  // Story feature stub - no-op
  logger.info('updateToSchemaVersion90: success (stub migration)');
}
