/**
 * Migration: Email-paired invite codes
 *
 * Adds target_email to invite_codes table - invites are now paired to specific emails.
 * Adds email column to users table - required for account identity.
 */

exports.up = (pgm) => {
  // Add target_email to invite_codes table
  // For existing codes (if any), set to empty string - they'll be invalid
  pgm.addColumn('invite_codes', {
    target_email: {
      type: 'varchar(255)',
      notNull: true,
      default: '',
    },
  });

  // Add normalized_target_email for efficient lookups (stores normalized version)
  pgm.addColumn('invite_codes', {
    normalized_target_email: {
      type: 'varchar(255)',
      notNull: true,
      default: '',
    },
  });

  // Create index on normalized_target_email for lookups
  pgm.createIndex('invite_codes', 'normalized_target_email', {
    name: 'idx_invite_codes_normalized_email',
  });

  // Add email to users table
  pgm.addColumn('users', {
    email: {
      type: 'varchar(255)',
      // Not null for new users, but allow null for migration of existing users
      notNull: false,
      unique: true,
    },
  });

  // Add normalized_email for efficient lookups
  pgm.addColumn('users', {
    normalized_email: {
      type: 'varchar(255)',
      notNull: false,
      unique: true,
    },
  });

  // Create index on user emails
  pgm.createIndex('users', 'email', { name: 'idx_users_email' });
  pgm.createIndex('users', 'normalized_email', { name: 'idx_users_normalized_email' });
};

exports.down = (pgm) => {
  // Remove indexes
  pgm.dropIndex('users', 'normalized_email', { name: 'idx_users_normalized_email', ifExists: true });
  pgm.dropIndex('users', 'email', { name: 'idx_users_email', ifExists: true });
  pgm.dropIndex('invite_codes', 'normalized_target_email', { name: 'idx_invite_codes_normalized_email', ifExists: true });

  // Remove columns
  pgm.dropColumn('users', 'normalized_email');
  pgm.dropColumn('users', 'email');
  pgm.dropColumn('invite_codes', 'normalized_target_email');
  pgm.dropColumn('invite_codes', 'target_email');
};
