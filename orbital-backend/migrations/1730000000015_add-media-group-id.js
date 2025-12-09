/**
 * Add group_id to media table
 *
 * Media needs group_id for:
 * 1. Quota tracking at the group level
 * 2. Allowing media upload before thread creation
 * 3. Access control (verify user is group member)
 */

exports.up = (pgm) => {
  // Add group_id column (nullable for existing media)
  pgm.addColumn('media', {
    group_id: {
      type: 'uuid',
      references: 'groups(id)',
      onDelete: 'CASCADE',
      comment: 'Group that owns this media (for quota tracking)',
    },
  });

  // Create index for group lookups
  pgm.createIndex('media', 'group_id', {
    name: 'idx_media_group',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('media', 'group_id', { name: 'idx_media_group' });
  pgm.dropColumn('media', 'group_id');
};
