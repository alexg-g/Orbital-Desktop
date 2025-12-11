// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Migration 1512: Orbital Media Sync Tracking
 *
 * Creates tables for tracking historic media sync requests.
 *
 * Issue #79: Async peer-to-peer recovery for expired media.
 *
 * Architecture:
 * - Requestor creates a sync request for expired media
 * - Other orbit members see notification and can provide files
 * - Server acts as async relay (neither user needs to be online simultaneously)
 * - Attachment keys already exist in orbital_media (backfilled on join)
 *
 * Tables:
 * - orbital_media_sync_requests: Track outgoing requests (as requestor)
 * - orbital_media_sync_pending_uploads: Track incoming upload requests (as provider)
 */

import type { WritableDB } from '../Interface.std.js';

export default function updateToSchemaVersion1512(db: WritableDB): void {
  // Track outgoing sync requests (user is the requestor)
  db.exec(`
    -- Orbital Media Sync Requests Table
    --
    -- Tracks requests this user has made to recover historic media.
    -- Mirrors server-side media_sync_requests table for local UI state.
    --
    -- Lifecycle:
    -- 1. User creates request → row created with status='pending'
    -- 2. Members upload items → status='in_progress', items_completed increases
    -- 3. User downloads all items → status='completed'
    -- 4. Request expires after 7 days if incomplete
    CREATE TABLE orbital_media_sync_requests (
      -- Server-assigned request UUID
      id TEXT PRIMARY KEY NOT NULL,

      -- Group/orbit to sync from
      group_id TEXT NOT NULL,

      -- Only sync media created after this date (Unix ms)
      since_date INTEGER NOT NULL,

      -- Maximum bytes to sync (default 10GB)
      max_bytes INTEGER NOT NULL,

      -- Bytes downloaded so far
      bytes_downloaded INTEGER NOT NULL DEFAULT 0,

      -- Current status
      -- 'pending', 'in_progress', 'completed', 'expired', 'cancelled'
      status TEXT NOT NULL DEFAULT 'pending',

      -- Total items in request
      items_total INTEGER NOT NULL DEFAULT 0,

      -- Items completed (downloaded)
      items_completed INTEGER NOT NULL DEFAULT 0,

      -- Items ready for download (uploaded by members)
      items_ready INTEGER NOT NULL DEFAULT 0,

      -- When request was created (Unix ms)
      created_at INTEGER NOT NULL,

      -- When request expires (Unix ms)
      expires_at INTEGER NOT NULL,

      -- When request completed (Unix ms, optional)
      completed_at INTEGER
    ) STRICT;
  `);

  // Index: Fast lookup by group
  db.exec(`
    CREATE INDEX orbital_sync_requests_group_id
    ON orbital_media_sync_requests(group_id);
  `);

  // Index: Fast lookup by status for UI
  db.exec(`
    CREATE INDEX orbital_sync_requests_status
    ON orbital_media_sync_requests(status, created_at DESC);
  `);

  // Track pending upload requests from other users (user is provider)
  db.exec(`
    -- Orbital Media Sync Pending Uploads Table
    --
    -- Tracks items other users have requested that this user can provide.
    -- Used to show notifications and track upload progress.
    --
    -- Lifecycle:
    -- 1. Receive WebSocket notification → row created with status='pending'
    -- 2. User uploads item → status='uploaded'
    -- 3. Cleanup after request expires or completes
    CREATE TABLE orbital_media_sync_pending_uploads (
      -- Server-assigned item UUID
      id TEXT PRIMARY KEY NOT NULL,

      -- Parent request ID
      request_id TEXT NOT NULL,

      -- Media ID being requested
      media_id TEXT NOT NULL,

      -- User who made the request
      requestor_id TEXT NOT NULL,

      -- Group this media belongs to
      group_id TEXT NOT NULL,

      -- Size in bytes
      size_bytes INTEGER NOT NULL,

      -- Current status
      -- 'pending', 'uploading', 'uploaded', 'skipped'
      status TEXT NOT NULL DEFAULT 'pending',

      -- Upload progress (0-100)
      upload_progress INTEGER NOT NULL DEFAULT 0,

      -- When notification received (Unix ms)
      received_at INTEGER NOT NULL,

      -- MIME type (from encrypted metadata)
      content_type TEXT,

      -- Original filename (from encrypted metadata)
      file_name TEXT
    ) STRICT;
  `);

  // Index: Fast lookup by request
  db.exec(`
    CREATE INDEX orbital_sync_uploads_request_id
    ON orbital_media_sync_pending_uploads(request_id);
  `);

  // Index: Fast lookup by media for checking if we have it
  db.exec(`
    CREATE INDEX orbital_sync_uploads_media_id
    ON orbital_media_sync_pending_uploads(media_id);
  `);

  // Index: Fast lookup by status for notification badge
  db.exec(`
    CREATE INDEX orbital_sync_uploads_status
    ON orbital_media_sync_pending_uploads(status)
    WHERE status = 'pending';
  `);

  // Index: Fast lookup by group for filtering
  db.exec(`
    CREATE INDEX orbital_sync_uploads_group_id
    ON orbital_media_sync_pending_uploads(group_id);
  `);
}
