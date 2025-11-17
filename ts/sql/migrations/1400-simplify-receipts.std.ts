// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// STUB: Donation receipts simplification removed for Orbital
// This migration is a no-op since Orbital doesn't use the donations feature

import type { WritableDB } from '../Interface.std.js';

export default function updateToSchemaVersion1400(_db: WritableDB): void {
  // No-op: donations feature removed for Orbital
  // The donationReceipts table is a stub created in migration 1380
}
