// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Resolve a static asset path to a URL that works in both Electron and Storybook.
 *
 * In Electron: Converts paths like '/images/avatars/rocket1.png' to file:// URLs
 * In Storybook: Returns paths as-is (web server handles them)
 *
 * @param path - The static asset path (e.g., '/images/avatars/rocket1.png')
 * @returns A URL that can be used in img src, video src, etc.
 */
export function resolveStaticAssetUrl(path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }

  // In Electron, convert to file:// URL
  if (typeof window !== 'undefined' && window.SignalContext?.getPath) {
    try {
      const installPath = window.SignalContext.getPath('install');
      // Remove leading slash from path to avoid double slashes
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      return `file://${installPath}/${cleanPath}`;
    } catch (error) {
      // Fallback to original path if getPath fails
      console.warn('Failed to resolve static asset path:', error);
      return path;
    }
  }

  // In Storybook or other web contexts, use as-is
  return path;
}

/**
 * Check if we're running in Electron (vs Storybook/web)
 */
export function isElectronEnvironment(): boolean {
  return typeof window !== 'undefined' && window.SignalContext?.getPath !== undefined;
}
