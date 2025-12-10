/**
 * Fix temp_uploads Schema Migration
 *
 * The original migration (1730000000007) was later modified in the codebase to use
 * group_id instead of thread_id, but this change was made after the migration ran
 * on production. This migration fixes the production schema to match the code.
 *
 * Changes:
 * - Drops thread_id column (FK to threads)
 * - Adds group_id column (FK to groups)
 * - Updates indexes accordingly
 */

exports.up = (pgm) => {
  // First, clear any existing temp_uploads (they're temporary/incomplete uploads anyway)
  pgm.sql('DELETE FROM temp_uploads');

  // Drop the old index that uses thread_id
  pgm.dropIndex('temp_uploads', ['thread_id', 'user_id'], {
    name: 'idx_temp_uploads_thread_user',
    ifExists: true,
  });

  // Drop the thread_id column (this also drops its FK constraint)
  pgm.dropColumn('temp_uploads', 'thread_id', { ifExists: true });

  // Add group_id column with FK to groups
  pgm.addColumn('temp_uploads', {
    group_id: {
      type: 'uuid',
      notNull: true,
      references: 'groups(id)',
      onDelete: 'CASCADE',
      comment: 'Group that media belongs to (for access control)',
    },
  });

  // Create new index with group_id
  pgm.createIndex('temp_uploads', ['group_id', 'user_id'], {
    name: 'idx_temp_uploads_group_user',
  });
};

exports.down = (pgm) => {
  // Clear temp_uploads first
  pgm.sql('DELETE FROM temp_uploads');

  // Drop the group_id index
  pgm.dropIndex('temp_uploads', ['group_id', 'user_id'], {
    name: 'idx_temp_uploads_group_user',
    ifExists: true,
  });

  // Drop group_id column
  pgm.dropColumn('temp_uploads', 'group_id', { ifExists: true });

  // Add thread_id column back
  pgm.addColumn('temp_uploads', {
    thread_id: {
      type: 'uuid',
      notNull: true,
      references: 'threads(id)',
      onDelete: 'CASCADE',
    },
  });

  // Create original index with thread_id
  pgm.createIndex('temp_uploads', ['thread_id', 'user_id'], {
    name: 'idx_temp_uploads_thread_user',
  });
};
