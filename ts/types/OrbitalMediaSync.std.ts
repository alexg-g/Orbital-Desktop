// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Historic Media Sync Types
 *
 * Issue #79: Async peer-to-peer recovery for expired media.
 *
 * These types support the flow where users can request expired media
 * from other orbit members. The server acts as an async relay so
 * neither user needs to be online simultaneously.
 */

// ============================================================================
// Time Range Selection
// ============================================================================

/**
 * Time range options for sync requests
 */
export type MediaSyncTimeRange = 'last_month' | 'last_6_months' | 'all_time';

// ============================================================================
// Status Types
// ============================================================================

/**
 * Status of a sync request
 * - pending: Request created, waiting for members to upload
 * - in_progress: At least one item has been uploaded
 * - completed: All items downloaded
 * - expired: Request TTL (7 days) exceeded
 * - cancelled: User cancelled the request
 */
export type MediaSyncRequestStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'expired'
  | 'cancelled';

/**
 * Status of an individual sync item
 * - pending: Waiting for a member to upload
 * - uploaded: Blob uploaded to server, ready for download
 * - downloaded: Requestor has downloaded and decrypted
 * - unavailable: No member has this media
 * - failed: Upload or download failed
 */
export type MediaSyncItemStatus =
  | 'pending'
  | 'uploaded'
  | 'downloaded'
  | 'unavailable'
  | 'failed';

// ============================================================================
// Sync Request Types
// ============================================================================

/**
 * Media sync request (stored in SQLCipher and returned from API)
 */
export type MediaSyncRequest = {
  /** Server-assigned UUID */
  id: string;

  /** Group/orbit ID to sync from */
  groupId: string;

  /** User who created the request */
  requestorId: string;

  /** Only sync media created after this date (Unix ms) */
  sinceDate: number;

  /** Maximum bytes to sync (default 10GB) */
  maxBytes: number;

  /** Bytes uploaded by providers so far */
  bytesUploaded: number;

  /** Bytes downloaded by requestor so far */
  bytesDownloaded: number;

  /** Current status */
  status: MediaSyncRequestStatus;

  /** Total number of media items in request */
  itemsTotal: number;

  /** Number of items completed (downloaded) */
  itemsCompleted: number;

  /** Number of items ready for download */
  itemsReady: number;

  /** When request was created (Unix ms) */
  createdAt: number;

  /** When request expires (Unix ms, 7 days from creation) */
  expiresAt: number;

  /** When request completed (Unix ms, optional) */
  completedAt?: number;
};

/**
 * Individual sync item (media file within a request)
 */
export type MediaSyncItem = {
  /** Server-assigned item UUID */
  itemId: string;

  /** Parent request ID */
  requestId: string;

  /** Media ID being synced */
  mediaId: string;

  /** Size of media in bytes */
  sizeBytes: number;

  /** Current status */
  status: MediaSyncItemStatus;

  /** Who uploaded this blob (set after upload) */
  uploadedBy?: string;

  /** When uploaded (Unix ms) */
  uploadedAt?: number;

  /** When downloaded (Unix ms) */
  downloadedAt?: number;

  /** Error message if failed */
  errorMessage?: string;
};

/**
 * Sync item needed (returned from pending-items endpoint)
 * Used by providers to know what they can upload
 */
export type SyncItemNeeded = {
  /** Item UUID */
  itemId: string;

  /** Parent request ID */
  requestId: string;

  /** Media ID being requested */
  mediaId: string;

  /** User who made the request */
  requestorId: string;

  /** Group this media belongs to */
  groupId: string;

  /** Size in bytes */
  sizeBytes: number;

  /** MIME type (from encrypted metadata) */
  contentType?: string;

  /** Original filename (from encrypted metadata) */
  fileName?: string;
};

/**
 * Sync item ready for download (returned from ready-items endpoint)
 */
export type SyncItemReady = {
  /** Item UUID */
  itemId: string;

  /** Parent request ID */
  requestId: string;

  /** Media ID */
  mediaId: string;

  /** Group ID */
  groupId: string;

  /** Size in bytes */
  sizeBytes: number;

  /** When uploaded (Unix ms) */
  uploadedAt: number;
};

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response from POST /api/media-sync/request
 */
export type CreateSyncRequestResponse = {
  request_id: string;
  items_count: number;
  total_bytes: number;
  members_notified: number;
  expires_at: string;
  created_at: string;
};

/**
 * Response from GET /api/media-sync/requests
 */
export type ListSyncRequestsResponse = {
  requests: Array<{
    id: string;
    group_id: string;
    since_date: string;
    max_bytes: number;
    bytes_uploaded: number;
    bytes_downloaded: number;
    status: MediaSyncRequestStatus;
    items_total: number;
    items_completed: number;
    items_ready: number;
    created_at: string;
    expires_at: string;
    completed_at?: string;
  }>;
};

/**
 * Response from GET /api/media-sync/pending-items/:requestId
 */
export type PendingItemsResponse = {
  request_id: string;
  requestor_id: string;
  group_id: string;
  status: MediaSyncRequestStatus;
  expires_at: string;
  items: Array<{
    item_id: string;
    request_id: string;
    media_id: string;
    requestor_id: string;
    group_id: string;
    size_bytes: number;
    content_type?: string;
    file_name?: string;
  }>;
};

// ============================================================================
// WebSocket Event Types
// ============================================================================

/**
 * WebSocket event: New sync request created
 * Sent to all orbit members except requestor
 */
export type MediaSyncRequestEvent = {
  type: 'media_sync_request';
  request_id: string;
  requestor_id: string;
  group_id: string;
  items_count: number;
  total_bytes: number;
  timestamp: number;
};

/**
 * WebSocket event: Sync item ready for download
 * Sent to requestor when a member uploads an item
 */
export type MediaSyncItemReadyEvent = {
  type: 'media_sync_item_ready';
  request_id: string;
  item_id: string;
  media_id: string;
  size_bytes: number;
  uploaded_by: string;
  timestamp: number;
};

/**
 * WebSocket event: All items ready
 * Sent to requestor when all items have been uploaded
 */
export type MediaSyncAllReadyEvent = {
  type: 'media_sync_all_ready';
  request_id: string;
  timestamp: number;
};

// ============================================================================
// Key Backfill Types (for new members)
// ============================================================================

/**
 * Request for historic media keys
 * Sent via Signal Protocol E2EE when a user joins an orbit
 */
export type OrbitalMediaKeysBackfillRequest = {
  type: 'orbital-media-keys-backfill-request';

  /** Group to backfill keys for */
  groupId: string;

  /** User requesting keys */
  requestorId: string;

  /** Timestamp of request */
  timestamp: number;
};

/**
 * Response with historic media keys
 * Sent via Signal Protocol E2EE from existing member to new member
 */
export type OrbitalMediaKeysBackfillResponse = {
  type: 'orbital-media-keys-backfill-response';

  /** Group these keys are for */
  groupId: string;

  /** Array of media keys */
  keys: Array<{
    /** Server-assigned media ID */
    mediaId: string;

    /** Thread this media belongs to */
    threadId: string;

    /** Attachment keys (64 bytes: 32 AES + 32 MAC) as base64 */
    attachmentKeys: string;

    /** SHA-256 of plaintext (hex) */
    plaintextHash: string;

    /** SHA-256 of ciphertext (base64) */
    digest: string;

    /** Incremental MAC (base64, optional) */
    incrementalMac?: string;

    /** Chunk size for incremental MAC */
    chunkSize?: number;

    /** File size in bytes */
    size: number;

    /** MIME type */
    contentType: string;

    /** Original filename */
    fileName?: string;

    /** Blurhash for preview */
    blurHash?: string;

    /** Dimensions */
    width?: number;
    height?: number;

    /** Duration for video/audio (ms) */
    duration?: number;

    /** Server expiration (Unix ms) */
    expiresAt: number;

    /** Upload timestamp (Unix ms) */
    createdAt: number;

    /** Uploader's user ID */
    uploadedBy: string;
  }>;

  /** Timestamp of response */
  timestamp: number;
};

// ============================================================================
// Union Types for Message Handling
// ============================================================================

/**
 * All media sync WebSocket event types
 */
export type MediaSyncWebSocketEvent =
  | MediaSyncRequestEvent
  | MediaSyncItemReadyEvent
  | MediaSyncAllReadyEvent;

/**
 * All key backfill message types (sent via Signal Protocol E2EE)
 */
export type OrbitalKeysBackfillMessage =
  | OrbitalMediaKeysBackfillRequest
  | OrbitalMediaKeysBackfillResponse;
