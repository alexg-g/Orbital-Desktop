/**
 * Migration: Add group_type column
 *
 * Adds group_type column to groups table to distinguish between:
 * - 'orbit': Regular orbit groups (multi-member forums)
 * - 'dm': Direct message groups (2-person private chats)
 *
 * This enables the "DMs as mini-groups" architecture for Issue #75.
 */

exports.up = (pgm) => {
  // Add group_type column with default 'orbit' for existing groups
  pgm.addColumn('groups', {
    group_type: {
      type: 'varchar(10)',
      notNull: true,
      default: 'orbit',
    },
  });

  // Add check constraint for valid group types
  pgm.addConstraint('groups', 'groups_type_check', {
    check: "group_type IN ('orbit', 'dm')",
  });

  // Create index for efficient filtering by type
  pgm.createIndex('groups', 'group_type', {
    name: 'idx_groups_type',
  });

  // For DM groups, we need to allow NULL invite_code since DMs don't use invites
  // First drop the unique constraint, then add it back as partial (only for non-null)
  pgm.dropConstraint('groups', 'groups_invite_code_key', { ifExists: true });

  // Make invite_code nullable for DM groups
  pgm.alterColumn('groups', 'invite_code', {
    notNull: false,
  });

  // Add unique constraint only for non-null invite codes
  pgm.createIndex('groups', 'invite_code', {
    name: 'idx_groups_invite_code_unique',
    unique: true,
    where: 'invite_code IS NOT NULL',
  });
};

exports.down = (pgm) => {
  // Remove the partial unique index
  pgm.dropIndex('groups', 'invite_code', {
    name: 'idx_groups_invite_code_unique',
    ifExists: true,
  });

  // Make invite_code not null again (this may fail if there are DM groups)
  pgm.alterColumn('groups', 'invite_code', {
    notNull: true,
    default: 'MIGRATE0', // Placeholder for any DM groups during rollback
  });

  // Re-add the original unique constraint
  pgm.addConstraint('groups', 'groups_invite_code_key', {
    unique: ['invite_code'],
  });

  // Remove group_type index
  pgm.dropIndex('groups', 'group_type', {
    name: 'idx_groups_type',
    ifExists: true,
  });

  // Remove check constraint
  pgm.dropConstraint('groups', 'groups_type_check', { ifExists: true });

  // Remove group_type column
  pgm.dropColumn('groups', 'group_type');
};
