/**
 * Migration: invite_codes table
 *
 * Adds a separate invite_codes table for single-use, expiring invite codes.
 * Adds max_members column to groups table.
 * Keeps legacy invite_code column in groups for backwards compatibility.
 */

exports.up = (pgm) => {
  // Add max_members column to groups table
  pgm.addColumn('groups', {
    max_members: {
      type: 'integer',
      notNull: true,
      default: 10,
    },
  });

  // Create invite_codes table
  pgm.createTable('invite_codes', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    group_id: {
      type: 'uuid',
      notNull: true,
      references: 'groups(id)',
      onDelete: 'CASCADE',
    },
    code: {
      type: 'varchar(8)',
      notNull: true,
      unique: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
    used_by: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL',
    },
    used_at: {
      type: 'timestamptz',
    },
  });

  // Add code format constraint
  pgm.addConstraint('invite_codes', 'invite_code_format', {
    check: "code ~ '^[A-Z0-9]{8}$'",
  });

  // Create indexes
  pgm.createIndex('invite_codes', 'code', { name: 'idx_invite_codes_code' });
  pgm.createIndex('invite_codes', 'group_id', { name: 'idx_invite_codes_group' });
  pgm.createIndex('invite_codes', 'expires_at', { name: 'idx_invite_codes_expires' });

  // Composite index for active code lookup
  pgm.createIndex('invite_codes', ['code', 'expires_at', 'used_by'], {
    name: 'idx_invite_codes_active',
    where: 'used_by IS NULL',
  });
};

exports.down = (pgm) => {
  // Drop invite_codes table
  pgm.dropTable('invite_codes', { ifExists: true, cascade: true });

  // Remove max_members column from groups
  pgm.dropColumn('groups', 'max_members');
};
