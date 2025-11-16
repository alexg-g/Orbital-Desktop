// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Migration 1500: Orbital Media Storage
 *
 * Creates table for Orbital's distributed media relay feature.
 *
 * Architecture:
 * - Server relays encrypted media for 7 days
 * - All orbit members download and store media permanently
 * - Attachment keys encrypted at rest by SQLCipher
 * - Media files encrypted with Signal's attachment encryption
 *
 * Security:
 * - attachment_keys BLOB encrypted by SQLCipher database-level encryption
 * - Server never sees keys (transmitted via Signal Protocol encrypted messages)
 * - local_path points to encrypted media files (decrypted on-demand)
 */

import type { WritableDB } from '../Interface.std.js';

export default function updateToSchemaVersion1500(db: WritableDB): void {
  db.exec(`
    -- Orbital Media Attachments Table
    --
    -- Stores metadata for media distributed via Orbital's relay server.
    -- Each row represents one media file uploaded to a thread.
    --
    -- Lifecycle:
    -- 1. User uploads media → row created with downloaded=0
    -- 2. Server relays to orbit members → other members create rows
    -- 3. Member downloads → local_path set, downloaded=1
    -- 4. After 7 days → server deletes, but all members have local copies
    --
    -- Recovery:
    -- - New member joins → creates rows for all historical media, downloads from orbit
    -- - Member loses device → re-joins, downloads from other members
    CREATE TABLE orbital_media (
      -- Client-side UUID (generated before upload)
      id TEXT PRIMARY KEY NOT NULL,

      -- Server-assigned media ID (returned after upload)
      -- Used for downloading from server within 7-day window
      media_id TEXT NOT NULL UNIQUE,

      -- Thread this media belongs to
      -- Foreign key to orbital_threads.id (table created in separate migration)
      thread_id TEXT NOT NULL,

      -- Signal Protocol attachment keys (64 bytes: 32 AES + 32 MAC)
      -- SECURITY: Encrypted at rest by SQLCipher
      -- NEVER sent to server
      -- Shared with orbit members via Signal Protocol encrypted group messages
      attachment_keys BLOB NOT NULL,

      -- SHA-256 hash of plaintext (before encryption)
      -- 64-character hex string
      -- Used for integrity verification after decryption
      plaintext_hash TEXT NOT NULL,

      -- SHA-256 hash of ciphertext (after encryption)
      -- Base64-encoded string (Signal convention)
      -- Used for tamper detection during download
      digest TEXT NOT NULL,

      -- Incremental MAC for large files (optional)
      -- Base64-encoded string
      -- Enables streaming validation in 5MB chunks
      incremental_mac TEXT,

      -- Chunk size for incremental MAC (bytes)
      -- Typically 5242880 (5MB)
      -- Must be present if incremental_mac is set
      chunk_size INTEGER,

      -- Original file size in bytes (before encryption and padding)
      size INTEGER NOT NULL,

      -- MIME type (e.g., 'video/mp4', 'image/jpeg')
      content_type TEXT NOT NULL,

      -- Original filename (optional, user-provided)
      file_name TEXT,

      -- Blurhash for preview (optional)
      -- Low-quality placeholder for images/videos
      blur_hash TEXT,

      -- Media dimensions (optional, for images/videos)
      width INTEGER,
      height INTEGER,

      -- Media duration in milliseconds (optional, for videos/audio)
      duration INTEGER,

      -- Server expiration timestamp (Unix milliseconds)
      -- Server deletes encrypted blob after this time (7 days from upload)
      -- Clients must download before expiration for distributed backup
      expires_at INTEGER NOT NULL,

      -- Local storage path (relative to attachments directory)
      -- Set after successful download and decryption
      -- Format: relative path (e.g., "ae/ae9b8c1f2...")
      -- NULL if not yet downloaded
      local_path TEXT,

      -- Download status
      -- 0 = Not downloaded (still on server or expired)
      -- 1 = Downloaded and stored locally
      downloaded INTEGER NOT NULL DEFAULT 0 CHECK (downloaded IN (0, 1)),

      -- Upload timestamp (Unix milliseconds)
      created_at INTEGER NOT NULL,

      -- Caption text (optional, user-provided)
      caption TEXT,

      -- Uploader's orbit member ID (optional)
      uploaded_by TEXT
    ) STRICT;
  `);

  // Index: Fast lookup by thread (for displaying media in thread view)
  db.exec(`
    CREATE INDEX orbital_media_thread_id
    ON orbital_media(thread_id, created_at DESC);
  `);

  // Index: Fast lookup by expiration (for cleanup and sync tasks)
  db.exec(`
    CREATE INDEX orbital_media_expires_at
    ON orbital_media(expires_at);
  `);

  // Index: Fast lookup by download status (for sync coordination)
  db.exec(`
    CREATE INDEX orbital_media_downloaded
    ON orbital_media(downloaded, expires_at);
  `);

  // Index: Fast lookup by media_id (for server download requests)
  // Already covered by UNIQUE constraint on media_id

  // Index: Fast lookup by plaintext_hash (for deduplication)
  db.exec(`
    CREATE INDEX orbital_media_plaintext_hash
    ON orbital_media(plaintext_hash);
  `);

  // Index: Fast lookup by local_path (for cleanup and integrity checks)
  db.exec(`
    CREATE INDEX orbital_media_local_path
    ON orbital_media(local_path)
    WHERE local_path IS NOT NULL;
  `);
}
