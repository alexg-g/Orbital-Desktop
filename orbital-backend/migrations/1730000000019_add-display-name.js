/**
 * Add display_name support to users table
 * Allows users to set a custom display name (max 15 chars)
 * Falls back to username if not set
 */

exports.up = (pgm) => {
  // Add display_name column to users table
  pgm.addColumns('users', {
    display_name: {
      type: 'varchar(15)',
      notNull: false,
    },
  }, { ifNotExists: true });
};

exports.down = (pgm) => {
  // Remove display_name column
  pgm.dropColumns('users', ['display_name'], { ifExists: true });
};
