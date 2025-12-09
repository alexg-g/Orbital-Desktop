/**
 * Add reply_id column to media table
 *
 * This allows media to be associated with specific replies, not just threads.
 * Media attached to the original post (thread creation) will have reply_id = NULL.
 * Media attached to a reply will have reply_id set to the reply's ID.
 */

exports.up = (pgm) => {
  // Add reply_id column to media table
  pgm.addColumns('media', {
    reply_id: {
      type: 'uuid',
      notNull: false,
      references: 'replies(id)',
      onDelete: 'CASCADE',
    },
  }, { ifNotExists: true });

  // Add index for efficient lookups
  pgm.createIndex('media', 'reply_id', {
    name: 'idx_media_reply',
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('media', 'reply_id', { name: 'idx_media_reply', ifExists: true });
  pgm.dropColumns('media', ['reply_id'], { ifExists: true });
};
