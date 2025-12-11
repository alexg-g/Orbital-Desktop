/**
 * Historic Media Sync Migration
 *
 * Creates tables for async peer-to-peer media recovery.
 * Enables users to request expired media from other orbit members.
 *
 * Issue #79: Historic media sync - async peer-to-peer recovery for expired media
 */

exports.up = (pgm) => {
  // Sync requests table - tracks requests from users wanting to recover expired media
  pgm.createTable('media_sync_requests', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    requestor_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
      comment: 'User who requested the sync',
    },
    group_id: {
      type: 'uuid',
      notNull: true,
      references: 'groups(id)',
      onDelete: 'CASCADE',
      comment: 'Orbit/group to sync media from',
    },
    since_date: {
      type: 'timestamptz',
      notNull: true,
      comment: 'Only request media created after this date',
    },
    max_bytes: {
      type: 'bigint',
      notNull: true,
      default: 10737418240, // 10GB
      comment: 'Maximum bytes to sync (default 10GB)',
    },
    bytes_uploaded: {
      type: 'bigint',
      notNull: true,
      default: 0,
      comment: 'Total bytes uploaded by providers so far',
    },
    bytes_downloaded: {
      type: 'bigint',
      notNull: true,
      default: 0,
      comment: 'Total bytes downloaded by requestor so far',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'pending',
      check: "status IN ('pending', 'in_progress', 'completed', 'expired', 'cancelled')",
      comment: 'Current status of the sync request',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      comment: 'Request expires 7 days from creation',
    },
    completed_at: {
      type: 'timestamptz',
      comment: 'When the sync completed (all items downloaded)',
    },
  });

  // Individual media items in a sync request
  pgm.createTable('media_sync_items', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    request_id: {
      type: 'uuid',
      notNull: true,
      references: 'media_sync_requests(id)',
      onDelete: 'CASCADE',
      comment: 'Parent sync request',
    },
    media_id: {
      type: 'uuid',
      notNull: true,
      references: 'media(id)',
      onDelete: 'CASCADE',
      comment: 'Media item being synced',
    },
    uploaded_by: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL',
      comment: 'User who uploaded the blob (set when upload completes)',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'pending',
      check: "status IN ('pending', 'uploaded', 'downloaded', 'unavailable', 'failed')",
      comment: 'Status of this item: pending (needs upload), uploaded (ready for download), downloaded (complete)',
    },
    storage_url: {
      type: 'text',
      comment: 'Temporary storage path for uploaded blob',
    },
    size_bytes: {
      type: 'bigint',
      comment: 'Size of the media file in bytes',
    },
    uploaded_at: {
      type: 'timestamptz',
      comment: 'When provider uploaded the blob',
    },
    downloaded_at: {
      type: 'timestamptz',
      comment: 'When requestor downloaded the blob',
    },
    error_message: {
      type: 'text',
      comment: 'Error message if status is failed',
    },
  });

  // Indexes for media_sync_requests
  pgm.createIndex('media_sync_requests', 'requestor_id', {
    name: 'idx_media_sync_requests_requestor',
  });

  pgm.createIndex('media_sync_requests', 'group_id', {
    name: 'idx_media_sync_requests_group',
  });

  pgm.createIndex('media_sync_requests', ['status', 'expires_at'], {
    name: 'idx_media_sync_requests_status_expires',
    comment: 'For cleanup job to find expired requests',
  });

  pgm.createIndex('media_sync_requests', ['group_id', 'requestor_id', 'status'], {
    name: 'idx_media_sync_requests_group_requestor_status',
    comment: 'For checking existing active requests',
  });

  // Indexes for media_sync_items
  pgm.createIndex('media_sync_items', 'request_id', {
    name: 'idx_media_sync_items_request',
  });

  pgm.createIndex('media_sync_items', 'media_id', {
    name: 'idx_media_sync_items_media',
  });

  pgm.createIndex('media_sync_items', ['request_id', 'status'], {
    name: 'idx_media_sync_items_request_status',
    comment: 'For finding pending items in a request',
  });

  // Unique constraint: one item per media per request
  pgm.createIndex('media_sync_items', ['request_id', 'media_id'], {
    name: 'idx_media_sync_items_request_media_unique',
    unique: true,
  });

  // Table comments
  pgm.sql(`COMMENT ON TABLE media_sync_requests IS 'Tracks async media sync requests for recovering expired media from orbit members.';`);
  pgm.sql(`COMMENT ON TABLE media_sync_items IS 'Individual media items within a sync request. Any orbit member can provide each item.';`);
};

exports.down = (pgm) => {
  pgm.dropTable('media_sync_items', { ifExists: true, cascade: true });
  pgm.dropTable('media_sync_requests', { ifExists: true, cascade: true });
};
