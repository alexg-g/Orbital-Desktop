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
