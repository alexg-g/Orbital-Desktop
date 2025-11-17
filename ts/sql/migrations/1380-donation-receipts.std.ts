// Copyright 2022 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// STUB: Donation receipts migration modified for Orbital
// Creates minimal schema stub to maintain migration compatibility

import type { WritableDB } from '../Interface.std.js';
import type { LoggerType } from '../../types/Logging.std.js';

export default function updateToSchemaVersion1380(
  db: WritableDB,
  logger: LoggerType,
  _startingVersion: number
): void {
  // Create minimal stub table for donationReceipts
  // This allows later migrations (e.g., 1400) to run without errors
  // even though Orbital doesn't use the donations feature
  db.exec(`
    CREATE TABLE donationReceipts (
      id TEXT PRIMARY KEY,
      paymentDetailJson TEXT,
      paymentType TEXT
    );
  `);

  logger.info(
    'Migration 1380: donationReceipts stub table created (feature disabled for Orbital)'
  );
}
