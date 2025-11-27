// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Safe storage accessor for Orbital settings.
 * Works in both Electron (with itemStorage) and Storybook (with fallback to localStorage).
 */

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
    // Try to use window.storage if available (Electron)
    if (typeof window !== 'undefined' && window.storage) {
      const value = window.storage.get(key as any, defaultValue);
      return value as T;
    }

    // Fallback to localStorage for Storybook
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(key);
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
    // Try to use window.storage if available (Electron)
    if (typeof window !== 'undefined' && window.storage) {
      await window.storage.put(key as any, value);
      return;
    }

    // Fallback to localStorage for Storybook
    if (typeof window !== 'undefined' && window.localStorage) {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      window.localStorage.setItem(key, serialized);
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
