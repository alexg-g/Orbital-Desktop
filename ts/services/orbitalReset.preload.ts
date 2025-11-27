// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Reset Service
 *
 * Provides functions to clear all Orbital data from local SQLCipher storage.
 * Use this to establish a clean slate for testing against production.
 *
 * IMPORTANT: This will permanently delete all local Orbital data.
 * Use with caution!
 */

import { createLogger } from '../logging/log.std.js';
import { itemStorage } from '../textsecure/Storage.preload.js';
import { DataWriter } from '../sql/Client.preload.js';

const log = createLogger('OrbitalReset');

/**
 * List of all Orbital-related itemStorage keys
 */
const ORBITAL_STORAGE_KEYS = [
  // Authentication
  'orbitalJwtToken',
  'orbitalUserId',
  'orbitalUsername',

  // Groups
  'orbitalGroupKeys',
  'orbitalSelectedGroupId',
  'orbitalMockInvites',

  // Threads (legacy local storage)
  'orbitalLocalThreads',

  // Settings
  'orbitalAutoDownloadOnWifi',
  'orbitalUserSettings',

  // Drafts
  'orbitalDrafts',
] as const;

/**
 * Result of reset operation
 */
export type ResetResult = {
  success: boolean;
  clearedKeys: string[];
  threadsDeleted: number;
  errors: string[];
};

/**
 * Clear all Orbital data from itemStorage
 *
 * This is the main reset function - clears all auth tokens, group keys,
 * cached data, and settings. After calling this, you'll need to log in again.
 */
export async function clearOrbitalStorage(): Promise<ResetResult> {
  const result: ResetResult = {
    success: false,
    clearedKeys: [],
    threadsDeleted: 0,
    errors: [],
  };

  log.info('Starting Orbital storage reset...');

  // 1. Clear itemStorage keys
  for (const key of ORBITAL_STORAGE_KEYS) {
    try {
      const exists = itemStorage.get(key);
      if (exists !== undefined) {
        await itemStorage.remove(key);
        result.clearedKeys.push(key);
        log.info(`Cleared itemStorage key: ${key}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to clear ${key}: ${errorMessage}`);
      log.warn(`Failed to clear key ${key}:`, error);
    }
  }

  // 2. Clear SQLCipher orbital_threads table
  try {
    result.threadsDeleted = await DataWriter.removeAllOrbitalThreads();
    log.info(`Cleared ${result.threadsDeleted} threads from SQLCipher`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to clear threads: ${errorMessage}`);
    log.warn('Failed to clear threads:', error);
  }

  result.success = result.errors.length === 0;
  log.info('Orbital storage reset complete', {
    clearedKeys: result.clearedKeys.length,
    threadsDeleted: result.threadsDeleted,
    errors: result.errors.length,
  });

  return result;
}

/**
 * Full Orbital reset - alias for clearOrbitalStorage
 *
 * This will:
 * 1. Clear all Orbital-related itemStorage keys (auth, groups, settings)
 * 2. Delete all threads from SQLCipher orbital_threads table
 * 3. Log you out of Orbital
 *
 * Note: orbital_media table is not cleared. Media files remain but will be
 * orphaned without threads referencing them.
 *
 * Use this to establish a clean slate for production testing.
 */
export async function resetAllOrbitalData(): Promise<ResetResult> {
  return clearOrbitalStorage();
}

/**
 * Get diagnostic info about current Orbital storage state
 */
export function getOrbitalStorageInfo(): Record<string, boolean | string> {
  const info: Record<string, boolean | string> = {};

  for (const key of ORBITAL_STORAGE_KEYS) {
    const value = itemStorage.get(key);
    if (key === 'orbitalJwtToken' && value) {
      // Don't expose full JWT, just indicate it exists
      info[key] = `exists (${String(value).substring(0, 20)}...)`;
    } else {
      info[key] = value !== undefined;
    }
  }

  return info;
}

/**
 * Check if user is currently logged into Orbital
 */
export function isOrbitalLoggedIn(): boolean {
  const token = itemStorage.get('orbitalJwtToken');
  return token !== undefined && token !== null;
}

/**
 * Get current user info (if logged in)
 */
export function getCurrentOrbitalUser(): { userId: string | null; username: string | null } {
  return {
    userId: itemStorage.get('orbitalUserId') || null,
    username: itemStorage.get('orbitalUsername') || null,
  };
}
