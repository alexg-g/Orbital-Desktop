/**
 * Add avatar support to users table
 * Stores avatar URL for user profile pictures
 */

exports.up = (pgm) => {
  // Add avatar_url column to users table
  pgm.addColumns('users', {
    avatar_url: {
      type: 'text',
      notNull: false,
    },
  }, { ifNotExists: true });

  // Create index for quick avatar lookups
  pgm.createIndex('users', 'avatar_url', {
    name: 'idx_users_avatar_url',
    where: 'avatar_url IS NOT NULL',
    ifNotExists: true,
  });

  // Add max_members column to groups if it doesn't exist
  // (for backwards compatibility with existing code)
  pgm.addColumns('groups', {
    max_members: {
      type: 'integer',
      notNull: false,
      default: 10,
    },
  }, { ifNotExists: true });
};

exports.down = (pgm) => {
  // Remove indexes
  pgm.dropIndex('users', 'avatar_url', {
    name: 'idx_users_avatar_url',
    ifExists: true,
  });

  // Remove columns
  pgm.dropColumns('users', ['avatar_url'], { ifExists: true });
  pgm.dropColumns('groups', ['max_members'], { ifExists: true });
};
