// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Media Attachment Types
 *
 * Extends Signal's attachment encryption for Orbital's distributed media relay.
 *
 * Key Differences from Signal:
 * - mediaId: Server-assigned ID for relay tracking
 * - threadId: Links media to Orbital threads (not Signal messages)
 * - expiresAt: Server deletes after 7 days (distributed backup takes over)
 * - localPath: Permanent storage path (not temporary cache)
 * - downloaded: Tracks sync status for distributed backup
 */

import type { MIMEType } from './MIME.std.js';

/**
 * Orbital Media Attachment (stored in orbital_media table)
 *
 * Represents media uploaded to Orbital server and distributed to orbit members.
 * Server relays encrypted media for 7 days, then deletes.
 * All orbit members download and store permanently in SQLCipher.
 */
export type OrbitalMediaAttachment = {
  /**
   * Unique client-side UUID for this media
   * Format: UUID v4
   * Generated on client before upload
   */
  id: string;

  /**
   * Server-assigned media ID (returned after upload)
   * Used for downloading from server within 7-day window
   * Format: Server-generated string
   */
  mediaId: string;

  /**
   * Thread ID this media belongs to
   * Links to orbital_threads.id
   */
  threadId: string;

  /**
   * Signal Protocol attachment keys (64 bytes)
   * Split into: 32 bytes AES-256 + 32 bytes HMAC-SHA256
   *
   * SECURITY: Stored as BLOB, encrypted at rest by SQLCipher
   * NEVER transmitted to server
   * Shared with orbit members via Signal Protocol encrypted group messages
   */
  attachmentKeys: Uint8Array;

  /**
   * SHA-256 hash of PLAINTEXT (before encryption)
   * Used for integrity verification after decryption
   * Format: 64-character hex string
   */
  plaintextHash: string;

  /**
   * SHA-256 hash of CIPHERTEXT (after encryption)
   * Used for tamper detection during download
   * Format: Base64-encoded string (Signal convention)
   */
  digest: string;

  /**
   * Incremental MAC for large files (optional)
   * Enables streaming validation in 5MB chunks
   * Only present for files where size known at encryption time
   * Format: Base64-encoded string
   */
  incrementalMac?: string;

  /**
   * Chunk size for incremental MAC (bytes)
   * Typically 5MB (5242880 bytes)
   * Must match incrementalMac if present
   */
  chunkSize?: number;

  /**
   * Original file size in bytes (BEFORE encryption and padding)
   * Used for progress indicators and storage quota calculations
   */
  size: number;

  /**
   * MIME type (e.g., 'video/mp4', 'image/jpeg')
   */
  contentType: MIMEType;

  /**
   * Original filename (optional, user-provided)
   * Sanitized for security
   */
  fileName?: string;

  /**
   * Blurhash for image/video preview (optional)
   * Enables low-quality placeholder while loading
   * Format: Blurhash string (e.g., "LGF5?xYk^6#M@-5c,1J5@[or[Q6.")
   */
  blurHash?: string;

  /**
   * Media width in pixels (for images/videos)
   */
  width?: number;

  /**
   * Media height in pixels (for images/videos)
   */
  height?: number;

  /**
   * Media duration in milliseconds (for videos/audio)
   */
  duration?: number;

  /**
   * Server expiration timestamp (Unix milliseconds)
   * Server deletes encrypted blob after this time (7 days from upload)
   * Clients MUST download before expiration for distributed backup
   */
  expiresAt: number;

  /**
   * Local storage path (relative to attachments directory)
   * Set after successful download and decryption
   * Encrypted at rest by SQLCipher database encryption
   *
   * Format: Relative path (e.g., "ae/ae9b8c1f2...")
   * Null if not yet downloaded
   */
  localPath: string | null;

  /**
   * Download status flag
   * 0 = Not downloaded (still on server or expired)
   * 1 = Downloaded and stored locally
   *
   * Used for sync coordination in distributed backup model
   */
  downloaded: 0 | 1;

  /**
   * Upload timestamp (Unix milliseconds)
   * When media was first uploaded to server
   */
  createdAt: number;

  /**
   * Caption text (optional)
   * User-provided description
   */
  caption?: string;

  /**
   * Uploader's orbit member ID
   * Tracks who uploaded this media
   */
  uploadedBy?: string;
};

/**
 * Orbital Media Upload Request
 *
 * Data sent to server when uploading new media.
 * Server receives encrypted blob + metadata (no keys).
 */
export type OrbitalMediaUploadRequest = {
  /**
   * Client-generated UUID for this media
   */
  id: string;

  /**
   * Thread ID this media belongs to
   */
  threadId: string;

  /**
   * Encrypted file data (blob)
   * Format: IV + AES-256-CBC ciphertext + HMAC-SHA256
   */
  encryptedData: Uint8Array;

  /**
   * Ciphertext digest (for server-side integrity check)
   * Server validates upload completed correctly
   */
  digest: string;

  /**
   * Original file size (plaintext, before encryption)
   */
  size: number;

  /**
   * MIME type
   */
  contentType: MIMEType;

  /**
   * Optional metadata
   */
  fileName?: string;
  blurHash?: string;
  width?: number;
  height?: number;
  duration?: number;
  caption?: string;
};

/**
 * Orbital Media Upload Response
 *
 * Server response after successful upload.
 */
export type OrbitalMediaUploadResponse = {
  /**
   * Server-assigned media ID
   * Used for downloading by orbit members
   */
  mediaId: string;

  /**
   * Server expiration timestamp (Unix milliseconds)
   * 7 days from upload
   */
  expiresAt: number;

  /**
   * Upload confirmation timestamp
   */
  uploadedAt: number;
};

/**
 * Orbital Media Download Request
 *
 * Data sent to server when downloading media.
 */
export type OrbitalMediaDownloadRequest = {
  /**
   * Server media ID (from upload response or sync message)
   */
  mediaId: string;

  /**
   * Thread ID (for authorization check)
   */
  threadId: string;
};

/**
 * Orbital Media Download Response
 *
 * Server response containing encrypted media blob.
 */
export type OrbitalMediaDownloadResponse = {
  /**
   * Encrypted file data
   * Format: IV + AES-256-CBC ciphertext + HMAC-SHA256
   */
  encryptedData: Uint8Array;

  /**
   * Ciphertext digest (for client-side integrity check)
   */
  digest: string;

  /**
   * Original file size (plaintext)
   */
  size: number;

  /**
   * MIME type
   */
  contentType: MIMEType;

  /**
   * Optional metadata (preserved from upload)
   */
  fileName?: string;
  blurHash?: string;
  width?: number;
  height?: number;
  duration?: number;
};

/**
 * Orbital Media Sync Message
 *
 * Sent to orbit members via Signal Protocol encrypted group message
 * when new media is uploaded. Contains attachment keys.
 *
 * SECURITY: Encrypted end-to-end via Signal Protocol (server cannot read).
 */
export type OrbitalMediaSyncMessage = {
  /**
   * Message type identifier
   */
  type: 'orbital-media-sync';

  /**
   * Client UUID for this media
   */
  id: string;

  /**
   * Server media ID (for downloading)
   */
  mediaId: string;

  /**
   * Thread ID
   */
  threadId: string;

  /**
   * Attachment keys (64 bytes: 32 AES + 32 MAC)
   * SECURITY: Only transmitted via Signal Protocol encryption
   * Server NEVER sees these keys
   */
  attachmentKeys: Uint8Array;

  /**
   * Plaintext hash (for integrity verification)
   */
  plaintextHash: string;

  /**
   * Ciphertext digest
   */
  digest: string;

  /**
   * Incremental MAC (if present)
   */
  incrementalMac?: string;
  chunkSize?: number;

  /**
   * Metadata
   */
  size: number;
  contentType: MIMEType;
  fileName?: string;
  blurHash?: string;
  width?: number;
  height?: number;
  duration?: number;
  caption?: string;

  /**
   * Server expiration timestamp
   */
  expiresAt: number;

  /**
   * Uploader's member ID
   */
  uploadedBy: string;

  /**
   * Upload timestamp
   */
  createdAt: number;
};

/**
 * Orbital Media for UI Display
 *
 * Extended type for rendering media in threads.
 */
export type OrbitalMediaForUI = OrbitalMediaAttachment & {
  /**
   * Data URL for display (from local file)
   * Generated on-demand for rendering
   */
  url?: string;

  /**
   * Loading state
   */
  isLoading?: boolean;

  /**
   * Error state
   */
  error?: string;

  /**
   * Download progress (0-100)
   * Only relevant during initial sync or recovery
   */
  downloadProgress?: number;

  /**
   * Whether media is available locally
   * Derived from: downloaded === 1 && localPath !== null
   */
  isAvailableLocally: boolean;

  /**
   * Whether media is still available on server
   * Derived from: expiresAt > Date.now()
   */
  isAvailableOnServer: boolean;

  /**
   * Whether media can be recovered
   * True if: not available locally BUT other orbit members have it
   */
  isRecoverable?: boolean;
};

/**
 * Orbital Media Storage Stats
 *
 * Used for displaying storage usage in UI.
 */
export type OrbitalMediaStorageStats = {
  /**
   * Total media count for this orbit
   */
  totalMediaCount: number;

  /**
   * Total storage used (bytes, sum of all media sizes)
   */
  totalStorageUsed: number;

  /**
   * Downloaded media count
   */
  downloadedCount: number;

  /**
   * Pending downloads count
   */
  pendingDownloadsCount: number;

  /**
   * Storage used by downloaded media (bytes)
   */
  downloadedStorageUsed: number;

  /**
   * Breakdown by content type
   */
  byContentType: {
    contentType: MIMEType;
    count: number;
    storageUsed: number;
  }[];

  /**
   * Breakdown by thread
   */
  byThread: {
    threadId: string;
    threadTitle: string;
    count: number;
    storageUsed: number;
  }[];
};
