// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Local thread storage for Orbital.
 * Works in the renderer context using window.storage (Electron) or localStorage (Storybook).
 * This provides thread persistence when the backend API is unavailable.
 */

const THREADS_STORAGE_KEY = 'orbital.localThreads';

/**
 * Thread stored locally (for offline support and backend fallback)
 */
export type LocalThread = {
  threadId: string;
  groupId: string;
  authorId: string;
  authorUsername: string;
  title: string;
  body: string;
  replyCount: number;
  createdAt: string;
  hasMedia: boolean;
  hasVideo: boolean;
  hasImage: boolean;
  avatarUrl?: string; // User's avatar URL at time of posting
  mediaIds?: string[]; // Media IDs for the original post
};

/**
 * Get all locally stored threads organized by groupId
 */
function getAllLocalThreads(): Record<string, LocalThread[]> {
  try {
    // Try to use window.storage if available (Electron)
    if (typeof window !== 'undefined' && window.storage) {
      const value = window.storage.get(THREADS_STORAGE_KEY as any, {});
      return (value as Record<string, LocalThread[]>) || {};
    }

    // Fallback to localStorage for Storybook
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(THREADS_STORAGE_KEY);
      if (stored !== null) {
        try {
          return JSON.parse(stored) as Record<string, LocalThread[]>;
        } catch {
          return {};
        }
      }
    }

    return {};
  } catch (error) {
    console.warn('Failed to get local threads:', error);
    return {};
  }
}

/**
 * Save all local threads to storage
 */
async function saveAllLocalThreads(threads: Record<string, LocalThread[]>): Promise<void> {
  try {
    // Try to use window.storage if available (Electron)
    if (typeof window !== 'undefined' && window.storage) {
      await window.storage.put(THREADS_STORAGE_KEY as any, threads);
      return;
    }

    // Fallback to localStorage for Storybook
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(threads));
    }
  } catch (error) {
    console.error('Failed to save local threads:', error);
    throw error;
  }
}

/**
 * Store a thread locally
 */
export async function storeLocalThread(thread: LocalThread): Promise<void> {
  const allThreads = getAllLocalThreads();
  const groupThreads = allThreads[thread.groupId] || [];

  // Check if thread already exists (update it) or add new
  const existingIndex = groupThreads.findIndex(t => t.threadId === thread.threadId);
  if (existingIndex >= 0) {
    groupThreads[existingIndex] = thread;
  } else {
    // Add new thread at the beginning (newest first)
    groupThreads.unshift(thread);
  }

  allThreads[thread.groupId] = groupThreads;
  await saveAllLocalThreads(allThreads);
  console.log(`[LocalThreadStorage] Stored thread ${thread.threadId} for group ${thread.groupId}`);
}

/**
 * Get locally stored threads for a group
 */
export function getLocalThreads(groupId: string): LocalThread[] {
  const allThreads = getAllLocalThreads();
  const groupThreads = allThreads[groupId] || [];
  console.log(`[LocalThreadStorage] Retrieved ${groupThreads.length} threads for group ${groupId}`);
  return groupThreads;
}

/**
 * Update reply count for a locally stored thread
 */
export async function updateLocalThreadReplyCount(
  groupId: string,
  threadId: string,
  replyCount: number
): Promise<void> {
  const allThreads = getAllLocalThreads();
  const groupThreads = allThreads[groupId] || [];

  const threadIndex = groupThreads.findIndex(t => t.threadId === threadId);
  if (threadIndex >= 0) {
    groupThreads[threadIndex].replyCount = replyCount;
    allThreads[groupId] = groupThreads;
    await saveAllLocalThreads(allThreads);
    console.log(`[LocalThreadStorage] Updated thread ${threadId} reply count to ${replyCount}`);
  }
}

/**
 * Delete a locally stored thread
 */
export async function deleteLocalThread(groupId: string, threadId: string): Promise<void> {
  const allThreads = getAllLocalThreads();
  const groupThreads = allThreads[groupId] || [];

  const updatedGroupThreads = groupThreads.filter(t => t.threadId !== threadId);
  allThreads[groupId] = updatedGroupThreads;
  await saveAllLocalThreads(allThreads);
  console.log(`[LocalThreadStorage] Deleted thread ${threadId} from group ${groupId}`);
}

/**
 * Clear all locally stored threads for a group
 */
export async function clearLocalThreads(groupId: string): Promise<void> {
  const allThreads = getAllLocalThreads();
  delete allThreads[groupId];
  await saveAllLocalThreads(allThreads);
  console.log(`[LocalThreadStorage] Cleared all threads for group ${groupId}`);
}
