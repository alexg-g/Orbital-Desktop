/**
 * Add IV (Initialization Vector) columns for E2EE encryption
 *
 * The client encrypts thread/reply content with AES-GCM which requires
 * an IV for decryption. Previously these were being discarded by the server.
 */

exports.up = (pgm) => {
  // Add IV columns to threads table
  pgm.addColumns('threads', {
    title_iv: {
      type: 'varchar(64)',
      notNull: false,
    },
    body_iv: {
      type: 'varchar(64)',
      notNull: false,
    },
  }, { ifNotExists: true });

  // Add IV column to replies table
  pgm.addColumns('replies', {
    body_iv: {
      type: 'varchar(64)',
      notNull: false,
    },
  }, { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropColumns('threads', ['title_iv', 'body_iv'], { ifExists: true });
  pgm.dropColumns('replies', ['body_iv'], { ifExists: true });
};
