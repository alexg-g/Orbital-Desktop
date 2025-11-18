/**
 * Make media.thread_id nullable
 *
 * Allows media to be uploaded first, then associated with threads later.
 * This supports the workflow where frontend uploads media independently,
 * then includes media_ids when creating threads or replies.
 */

exports.up = (pgm) => {
  // Step 1: Make thread_id nullable to allow media upload without thread association
  pgm.alterColumn('media', 'thread_id', {
    notNull: false,
  });

  // Step 2: Add group_id as NULLABLE first to avoid constraint violations
  pgm.addColumn('media', {
    group_id: {
      type: 'uuid',
      notNull: false, // Make nullable first to populate existing data
      references: 'groups(id)',
      onDelete: 'CASCADE',
      comment: 'Group that media belongs to (for access control)',
    },
  });

  // Step 3: Populate group_id from existing thread relationships
  // This ensures existing media rows get their group_id from their thread
  pgm.sql(`
    UPDATE media m
    SET group_id = t.group_id
    FROM threads t
    WHERE m.thread_id = t.id AND m.group_id IS NULL
  `);

  // Step 4: NOW make group_id NOT NULL after data is populated
  pgm.alterColumn('media', 'group_id', {
    notNull: true,
  });

  // Step 5: Create index for efficient queries by group
  pgm.createIndex('media', 'group_id', {
    name: 'idx_media_group',
  });

  // Step 6: Add composite index for group + thread queries
  pgm.createIndex('media', ['group_id', 'thread_id'], {
    name: 'idx_media_group_thread',
  });
};

exports.down = (pgm) => {
  // Remove indexes
  pgm.dropIndex('media', ['group_id', 'thread_id'], {
    name: 'idx_media_group_thread',
    ifExists: true,
  });

  pgm.dropIndex('media', 'group_id', {
    name: 'idx_media_group',
    ifExists: true,
  });

  // Remove group_id column
  pgm.dropColumn('media', 'group_id', { ifExists: true });

  // Make thread_id required again
  pgm.alterColumn('media', 'thread_id', {
    notNull: true,
  });
};
