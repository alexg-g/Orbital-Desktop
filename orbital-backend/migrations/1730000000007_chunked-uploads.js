/**
 * Chunked Uploads Migration
 *
 * Creates temp_uploads table to track multi-chunk file upload progress.
 * Supports 500MB files uploaded in 5MB chunks with atomic finalization.
 */

exports.up = (pgm) => {
  // Temporary uploads table for tracking chunked upload progress
  pgm.createTable('temp_uploads', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    media_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      comment: 'Client-generated UUID for this upload session',
    },
    thread_id: {
      type: 'uuid',
      notNull: true,
      references: 'threads(id)',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    total_chunks: {
      type: 'integer',
      notNull: true,
      comment: 'Total number of chunks expected for this upload',
    },
    chunks_received: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Number of chunks successfully uploaded',
    },
    chunk_bitmap: {
      type: 'text',
      notNull: true,
      default: '',
      comment: 'Comma-separated list of received chunk indices (e.g., "0,1,2,5")',
    },
    encrypted_metadata: {
      type: 'text',
      notNull: true,
      comment: 'Client-encrypted metadata (filename, type, etc.)',
    },
    encryption_iv: {
      type: 'varchar(32)',
      notNull: true,
      comment: 'Initialization vector for encryption',
    },
    plaintext_hash: {
      type: 'varchar(64)',
      notNull: false,
      comment: 'SHA-256 hash of plaintext file (for integrity verification)',
    },
    total_size_bytes: {
      type: 'bigint',
      notNull: true,
      default: 0,
      comment: 'Total bytes received so far',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Create indexes for efficient queries
  pgm.createIndex('temp_uploads', 'media_id', {
    name: 'idx_temp_uploads_media_id',
    unique: true,
  });

  pgm.createIndex('temp_uploads', 'user_id', {
    name: 'idx_temp_uploads_user_id',
  });

  pgm.createIndex('temp_uploads', 'created_at', {
    name: 'idx_temp_uploads_created_at',
    comment: 'Index for cleanup of abandoned uploads (>24 hours old)',
  });

  pgm.createIndex('temp_uploads', ['thread_id', 'user_id'], {
    name: 'idx_temp_uploads_thread_user',
  });

  // Add comment to table
  pgm.addComment('temp_uploads',
    'Tracks chunked upload progress for large files. Cleaned up after finalization or after 24 hours of inactivity.'
  );
};

exports.down = (pgm) => {
  pgm.dropTable('temp_uploads', { ifExists: true, cascade: true });
};
