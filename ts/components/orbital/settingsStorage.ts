// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Safe storage accessor for Orbital settings.
 * Works in both Electron (with itemStorage) and Storybook (with fallback to localStorage).
 *
 * IMPORTANT: User-specific settings (displayName, avatarUrl) are stored with
 * user ID prefix to support multiple accounts on the same device.
 */

// Cache the current user ID to avoid repeated storage lookups
// Use undefined to distinguish "not checked" from "checked but null"
let cachedUserId: string | null | undefined = undefined;

/**
 * Set the cached user ID directly.
 * Call this after login when the userId is known.
 */
export function setUserIdCache(userId: string | null): void {
  cachedUserId = userId;
}

/**
 * Get the current user ID from cache or storage.
 * Returns null if not logged in.
 * Does NOT cache null values to handle login timing issues.
 */
function getCurrentUserId(): string | null {
  // Only use cache if we have a valid user ID
  if (cachedUserId !== undefined && cachedUserId !== null) {
    return cachedUserId;
  }

  try {
    if (typeof window !== 'undefined' && window.storage) {
      const userId = window.storage.get('orbitalUserId' as any, null);
      if (userId) {
        cachedUserId = userId;
        return userId;
      }
    }
  } catch (error) {
    console.warn('[settingsStorage] Failed to get user ID:', error);
  }

  // Don't cache null - user might log in later
  return null;
}

/**
 * Clear the cached user ID (call on logout)
 */
export function clearUserIdCache(): void {
  cachedUserId = undefined;
}

/**
 * Settings that should be stored per-user (not shared between accounts)
 */
const USER_SPECIFIC_SETTINGS: Set<string> = new Set([
  'orbital.settings.general.displayName',
  'orbital.settings.general.avatarUrl',
]);

/**
 * Migrate settings from global keys to user-scoped keys.
 * Call this after user logs in to preserve their existing settings.
 */
export async function migrateUserSettings(): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) {
    console.log('[settingsStorage] Cannot migrate settings: no user ID');
    return;
  }

  console.log('[settingsStorage] Checking settings migration for user:', userId);

  try {
    if (typeof window !== 'undefined' && window.storage) {
      for (const globalKey of USER_SPECIFIC_SETTINGS) {
        const userKey = `user.${userId}.${globalKey}`;

        // Check if user-scoped key already exists
        const existingUserValue = window.storage.get(userKey as any, null);
        if (existingUserValue !== null && existingUserValue !== undefined) {
          console.log(`[settingsStorage] User setting ${globalKey} already exists, skipping migration`);
          continue;
        }

        // Check if global key has a value to migrate
        const globalValue = window.storage.get(globalKey as any, null);
        if (globalValue !== null && globalValue !== undefined) {
          // Migrate: copy global value to user-scoped key
          await window.storage.put(userKey as any, globalValue);
          console.log(`[settingsStorage] Migrated ${globalKey} to ${userKey}`);
        }
      }
    }
  } catch (error) {
    console.error('[settingsStorage] Failed to migrate settings:', error);
  }
}

/**
 * Get the storage key, adding user prefix for user-specific settings.
 * Returns null for user-specific settings when no user is logged in
 * (to prevent reading other users' data).
 */
function getStorageKey(key: OrbitalSettingsKey): string | null {
  if (USER_SPECIFIC_SETTINGS.has(key)) {
    const userId = getCurrentUserId();
    if (userId) {
      return `user.${userId}.${key}`;
    }
    // No user logged in - return null to indicate "use default"
    return null;
  }
  return key;
}

// Define Orbital settings keys and their types
export type OrbitalSettingsKey =
  | 'orbital.settings.general.startMinimized'
  | 'orbital.settings.general.showInSystemTray'
  | 'orbital.settings.general.language'
  | 'orbital.settings.general.autoUpdate'
  | 'orbital.settings.general.displayName'
  | 'orbital.settings.general.avatarUrl'
  | 'orbital.settings.appearance.theme'
  | 'orbital.settings.appearance.fontSize'
  | 'orbital.settings.notifications.enabled'
  | 'orbital.settings.notifications.showPreviews'
  | 'orbital.settings.notifications.soundEnabled'
  | 'orbital.settings.privacy.readReceipts'
  | 'orbital.settings.privacy.typingIndicators'
  | 'orbital.settings.privacy.screenLock';

export type OrbitalSettingsValue =
  | boolean
  | string
  | number
  | null
  | undefined;

/**
 * Get a setting value from storage.
 * Falls back to localStorage in Storybook environment.
 */
export function getSetting<T extends OrbitalSettingsValue>(
  key: OrbitalSettingsKey,
  defaultValue?: T
): T | undefined {
  try {
    // Get the storage key (user-scoped for user-specific settings)
    const storageKey = getStorageKey(key);

    // If storageKey is null, user-specific setting with no logged-in user
    // Return default to avoid reading other users' data
    if (storageKey === null) {
      return defaultValue;
    }

    // Try to use window.storage if available (Electron)
    if (typeof window !== 'undefined' && window.storage) {
      const value = window.storage.get(storageKey as any, defaultValue);
      return value as T;
    }

    // Fallback to localStorage for Storybook
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(storageKey);
      if (stored !== null) {
        try {
          return JSON.parse(stored) as T;
        } catch {
          return stored as T;
        }
      }
    }

    return defaultValue;
  } catch (error) {
    console.warn(`Failed to get setting ${key}:`, error);
    return defaultValue;
  }
}

/**
 * Set a setting value in storage.
 * Falls back to localStorage in Storybook environment.
 */
export async function setSetting<T extends OrbitalSettingsValue>(
  key: OrbitalSettingsKey,
  value: T
): Promise<void> {
  try {
    // Get the storage key (user-scoped for user-specific settings)
    const storageKey = getStorageKey(key);

    // If storageKey is null, user-specific setting with no logged-in user
    // Can't save without knowing which user - log warning and skip
    if (storageKey === null) {
      console.warn(`Cannot save user-specific setting ${key}: no user logged in`);
      return;
    }

    // Try to use window.storage if available (Electron)
    if (typeof window !== 'undefined' && window.storage) {
      await window.storage.put(storageKey as any, value);
      return;
    }

    // Fallback to localStorage for Storybook
    if (typeof window !== 'undefined' && window.localStorage) {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      window.localStorage.setItem(storageKey, serialized);
    }
  } catch (error) {
    console.error(`Failed to save setting ${key}:`, error);
    throw error;
  }
}

// =============================================================================
// USER PROFILE UTILITIES
// =============================================================================

/**
 * Current user profile data from settings
 */
export type UserProfile = {
  displayName: string;
  avatarUrl: string | null;
};

/**
 * Validate a display name.
 * Rules: alphanumeric, spaces, underscores only. Max 15 characters.
 */
export function validateDisplayName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Display name cannot be empty' };
  }

  if (name.length > 15) {
    return { valid: false, error: 'Display name must be 15 characters or less' };
  }

  // Only allow alphanumeric, spaces, and underscores
  const validPattern = /^[a-zA-Z0-9_ ]+$/;
  if (!validPattern.test(name)) {
    return { valid: false, error: 'Display name can only contain letters, numbers, spaces, and underscores' };
  }

  return { valid: true };
}

/**
 * Sanitize a display name to meet validation requirements.
 * Removes invalid characters and truncates to 15 characters.
 */
export function sanitizeDisplayName(name: string): string {
  // Remove invalid characters
  const sanitized = name.replace(/[^a-zA-Z0-9_ ]/g, '');
  // Truncate to 15 characters
  return sanitized.slice(0, 15).trim() || 'User';
}

/**
 * Get the current user's profile from settings.
 * Returns display name and avatar URL.
 */
export function getCurrentUserProfile(): UserProfile {
  const displayName = getSetting('orbital.settings.general.displayName', 'You') ?? 'You';
  const avatarUrl = getSetting('orbital.settings.general.avatarUrl', null) ?? null;

  return {
    displayName: typeof displayName === 'string' ? displayName : 'You',
    avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
  };
}

// =============================================================================
// MEMBER DISPLAY NAME CACHE
// =============================================================================

const MEMBER_DISPLAY_NAME_PREFIX = 'orbital.member.displayName';

/**
 * Get cached display name for a user
 */
export function getMemberDisplayName(userId: string): string | undefined {
  const key = `${MEMBER_DISPLAY_NAME_PREFIX}.${userId}`;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key) ?? undefined;
    }
  } catch (error) {
    console.warn(`Failed to get display name for ${userId}:`, error);
  }
  return undefined;
}

/**
 * Cache display name for a user
 */
export function setMemberDisplayName(userId: string, displayName: string): void {
  const key = `${MEMBER_DISPLAY_NAME_PREFIX}.${userId}`;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, displayName);
    }
  } catch (error) {
    console.error(`Failed to cache display name for ${userId}:`, error);
  }
}

/**
 * Cache multiple member display names at once
 */
export function cacheMemberDisplayNames(
  members: Array<{ userId: string; displayName: string }>
): void {
  for (const member of members) {
    setMemberDisplayName(member.userId, member.displayName);
  }
}
