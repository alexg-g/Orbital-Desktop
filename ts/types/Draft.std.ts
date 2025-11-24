// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Draft Type Definitions
 *
 * Defines types for composer draft persistence per thread/chat context.
 * Drafts are stored in SQLCipher and persist across app restarts.
 */

/**
 * Draft context type
 * - 'thread': Orbital thread draft
 * - 'chat': Signal conversation draft
 */
export type DraftContextType = 'thread' | 'chat';

/**
 * Draft stored in SQLCipher
 *
 * Represents a composer draft that persists per context.
 * Each context (thread or chat) can have one active draft.
 */
export type DraftType = {
  /**
   * Context identifier (threadId or conversationId)
   * This is the primary key
   */
  contextId: string;

  /**
   * Type of context this draft belongs to
   * - 'thread': Orbital thread
   * - 'chat': Signal conversation
   */
  contextType: DraftContextType;

  /**
   * Draft title (for thread creation)
   * Only applicable for new thread drafts
   */
  title?: string;

  /**
   * Draft message body content
   */
  body: string;

  /**
   * Parent message ID if this is a reply
   * Links to the message being replied to
   */
  parentMessageId?: string;

  /**
   * Last update timestamp (Unix milliseconds)
   * Used for sorting and cleanup
   */
  updatedAt: number;
};

/**
 * Database row type for drafts table
 * Matches the SQLite STRICT table schema
 */
export type DraftDBRow = {
  context_id: string;
  context_type: string;
  title: string | null;
  body: string;
  parent_message_id: string | null;
  updated_at: number;
};
