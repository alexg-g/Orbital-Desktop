// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useRef, useState } from 'react';
import lodash from 'lodash';

const { debounce } = lodash;

/**
 * Draft content structure for composer state persistence
 */
export type DraftContent = {
  /** Thread title (only for thread mode) */
  title?: string;
  /** Message body content (markdown) */
  body: string;
  /** Parent message ID (for reply context) */
  parentMessageId?: string;
};

/**
 * Draft data structure as stored in the database
 */
export type DraftData = {
  /** Unique identifier for the draft context (e.g., groupId or threadId) */
  contextId: string;
  /** Draft content */
  content: DraftContent;
  /** Timestamp of last update */
  updatedAt: number;
};

/**
 * Draft operations interface - passed as props for dependency injection
 * This allows Storybook to mock these operations without Node.js dependencies
 */
export type DraftOperations = {
  /** Get all drafts from storage */
  getAllDrafts: () => Promise<DraftData[]>;
  /** Save a draft to storage */
  saveDraft: (draft: DraftData) => Promise<void>;
  /** Delete a draft from storage */
  deleteDraft: (contextId: string) => Promise<void>;
};

/**
 * Return type for useDraft hook
 */
export type UseDraftResult = {
  /** Get draft content for a context */
  getDraft: (contextId: string) => DraftContent | undefined;
  /** Save draft content (immediately to memory, debounced to DB) */
  saveDraft: (contextId: string, content: DraftContent) => void;
  /** Clear draft from memory and DB */
  clearDraft: (contextId: string) => void;
  /** Whether drafts are currently loading */
  isLoading: boolean;
};

/**
 * Custom hook for managing composer drafts
 *
 * Features:
 * - In-memory cache for instant access
 * - Loads all drafts from SQLCipher on mount
 * - Debounced database writes (500ms) to reduce I/O
 * - Robust error handling - won't crash if DB methods fail
 *
 * Usage:
 * ```tsx
 * const { getDraft, saveDraft, clearDraft } = useDraft(draftOperations);
 *
 * // Load draft when context changes
 * useEffect(() => {
 *   const draft = getDraft(contextId);
 *   if (draft) {
 *     setTitle(draft.title || '');
 *     setBody(draft.body);
 *   }
 * }, [contextId, getDraft]);
 *
 * // Save draft on content change
 * saveDraft(contextId, { title, body });
 *
 * // Clear draft on successful send
 * clearDraft(contextId);
 * ```
 */
export function useDraft(operations?: DraftOperations): UseDraftResult {
  // In-memory cache of drafts
  const draftsCache = useRef<Map<string, DraftContent>>(new Map());

  // Track loading state
  const [isLoading, setIsLoading] = useState(true);

  // Track if component is mounted for async safety
  const isMountedRef = useRef(true);

  // Create debounced save function that persists to DB
  const debouncedSaveToDb = useRef(
    debounce(async (contextId: string, content: DraftContent) => {
      if (!isMountedRef.current || !operations?.saveDraft) {
        return;
      }

      try {
        const draftData: DraftData = {
          contextId,
          content,
          updatedAt: Date.now(),
        };
        await operations.saveDraft(draftData);
      } catch (error) {
        console.error(`[useDraft] Failed to save draft for ${contextId}:`, error);
        // Don't re-throw - we don't want to crash the UI
      }
    }, 500)
  ).current;

  // Load all drafts from DB on mount
  useEffect(() => {
    async function loadDrafts() {
      if (!operations?.getAllDrafts) {
        setIsLoading(false);
        return;
      }

      try {
        const allDrafts = await operations.getAllDrafts();

        if (!isMountedRef.current) {
          return;
        }

        // Populate cache from DB
        for (const draft of allDrafts) {
          draftsCache.current.set(draft.contextId, draft.content);
        }
      } catch (error) {
        console.error('[useDraft] Failed to load drafts:', error);
        // Continue with empty cache - better than crashing
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    }

    loadDrafts();

    // Cleanup
    return () => {
      isMountedRef.current = false;
      // Flush any pending debounced saves
      debouncedSaveToDb.flush();
    };
  }, [operations]);

  /**
   * Get draft content for a context ID
   */
  const getDraft = useCallback((contextId: string): DraftContent | undefined => {
    return draftsCache.current.get(contextId);
  }, []);

  /**
   * Save draft content
   * - Immediately updates in-memory cache
   * - Debounces database write (500ms)
   */
  const saveDraft = useCallback((contextId: string, content: DraftContent): void => {
    // Update cache immediately for responsive UI
    draftsCache.current.set(contextId, content);

    // Debounce database write
    debouncedSaveToDb(contextId, content);
  }, [debouncedSaveToDb]);

  /**
   * Clear draft from memory and database
   */
  const clearDraft = useCallback((contextId: string): void => {
    // Remove from cache immediately
    draftsCache.current.delete(contextId);

    // Cancel any pending debounced save for this context
    debouncedSaveToDb.cancel();

    // Delete from database
    if (operations?.deleteDraft) {
      operations.deleteDraft(contextId).catch(error => {
        console.error(`[useDraft] Failed to delete draft for ${contextId}:`, error);
        // Don't re-throw - we don't want to crash the UI
      });
    }
  }, [operations, debouncedSaveToDb]);

  return {
    getDraft,
    saveDraft,
    clearDraft,
    isLoading,
  };
}

/**
 * Create default mock operations for Storybook
 *
 * This provides browser-compatible mock implementations that don't require
 * Node.js or Electron APIs, allowing components to work in Storybook.
 */
export function createMockDraftOperations(): DraftOperations {
  // In-memory storage for Storybook
  const mockStorage = new Map<string, DraftData>();

  return {
    getAllDrafts: async (): Promise<DraftData[]> => {
      return Array.from(mockStorage.values());
    },

    saveDraft: async (draft: DraftData): Promise<void> => {
      mockStorage.set(draft.contextId, draft);
    },

    deleteDraft: async (contextId: string): Promise<void> => {
      mockStorage.delete(contextId);
    },
  };
}
