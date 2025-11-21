// Copyright 2024 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { Database } from '@signalapp/sqlcipher';
import type { LoggerType } from '../../types/Logging.std.js';

// Stub migration for Orbital - Story feature removed
// Original migration created isStory index for message queries
export default function updateToSchemaVersion1130(
  db: Database,
  logger: LoggerType
): void {
  // Story feature stub - no-op
  logger.info('updateToSchemaVersion1130: success (stub migration)');
}
