// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { Database } from '@signalapp/sqlcipher';
import type { LoggerType } from '../../types/Logging.std.js';

// Modified migration for Orbital - Creates Story schema elements but disables Story UI
// These tables are still referenced by Server.node.ts and later migrations
export default function updateToSchemaVersion45(
  db: Database,
  logger: LoggerType
): void {
  db.exec(
    `
    --- Add storyId column to messages table
    ALTER TABLE messages ADD COLUMN storyId STRING;

    --- Update message indices to include storyId
    DROP INDEX messages_conversation;
    CREATE INDEX messages_conversation ON messages
      (conversationId, type, storyId, received_at);

    DROP INDEX messages_unread;
    CREATE INDEX messages_unread ON messages
      (conversationId, readStatus, type, storyId) WHERE readStatus IS NOT NULL;

    --- Update attachment indices (exclude story content from All Media views)
    DROP INDEX messages_hasAttachments;
    CREATE INDEX messages_hasAttachments
      ON messages (conversationId, hasAttachments, received_at)
      WHERE type IS NOT 'story' AND storyId IS NULL;

    DROP INDEX messages_hasFileAttachments;
    CREATE INDEX messages_hasFileAttachments
      ON messages (conversationId, hasFileAttachments, received_at)
      WHERE type IS NOT 'story' AND storyId IS NULL;

    DROP INDEX messages_hasVisualMediaAttachments;
    CREATE INDEX messages_hasVisualMediaAttachments
      ON messages (conversationId, hasVisualMediaAttachments, received_at)
      WHERE type IS NOT 'story' AND storyId IS NULL;

    --- Message triggers to exclude stories from FTS
    DROP TRIGGER messages_on_insert;
    CREATE TRIGGER messages_on_insert AFTER INSERT ON messages
    WHEN new.isViewOnce IS NOT 1 AND new.storyId IS NULL
    BEGIN
      INSERT INTO messages_fts
        (rowid, body)
      VALUES
        (new.rowid, new.body);
    END;

    DROP TRIGGER messages_on_update;
    CREATE TRIGGER messages_on_update AFTER UPDATE ON messages
    WHEN
      (new.body IS NULL OR old.body IS NOT new.body) AND
       new.isViewOnce IS NOT 1 AND new.storyId IS NULL
    BEGIN
      DELETE FROM messages_fts WHERE rowid = old.rowid;
      INSERT INTO messages_fts
        (rowid, body)
      VALUES
        (new.rowid, new.body);
    END;

    --- Update delete trigger to clean up storyReads
    DROP TRIGGER messages_on_delete;
    CREATE TRIGGER messages_on_delete AFTER DELETE ON messages BEGIN
      DELETE FROM messages_fts WHERE rowid = old.rowid;
      DELETE FROM sendLogPayloads WHERE id IN (
        SELECT payloadId FROM sendLogMessageIds
        WHERE messageId = old.id
      );
      DELETE FROM reactions WHERE rowid IN (
        SELECT rowid FROM reactions
        WHERE messageId = old.id
      );
      DELETE FROM storyReads WHERE storyId = old.storyId;
    END;

    --- Story Read History table (stub - needed for trigger above)
    CREATE TABLE storyReads (
      authorId STRING NOT NULL,
      conversationId STRING NOT NULL,
      storyId STRING NOT NULL,
      storyReadDate NUMBER NOT NULL,

      PRIMARY KEY (authorId, storyId)
    );

    CREATE INDEX storyReads_data ON storyReads (
      storyReadDate, authorId, conversationId
    );

    --- Story Distribution Lists tables (stub - needed by Server.node.ts)
    CREATE TABLE storyDistributions(
      id STRING PRIMARY KEY NOT NULL,
      name TEXT,

      avatarUrlPath TEXT,
      avatarKey BLOB,
      senderKeyInfoJson STRING
    );

    CREATE TABLE storyDistributionMembers(
      listId STRING NOT NULL REFERENCES storyDistributions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      uuid STRING NOT NULL,

      PRIMARY KEY (listId, uuid)
    );
    `
  );

  logger.info(
    'Migration 45: Story schema created (UI disabled, tables preserved for compatibility)'
  );
}
