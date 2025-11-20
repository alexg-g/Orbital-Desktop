// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Settings Service
 *
 * Manages Orbital-specific settings like auto-download preferences.
 *
 * Features:
 * - Get/set auto-download on WiFi setting
 * - Check network connection type
 * - Determine if auto-download should proceed
 */

import { createLogger } from '../logging/log.std.js';
import { itemStorage } from '../textsecure/Storage.preload.js';

const log = createLogger('OrbitalSettings');

/**
 * Default value for auto-download on WiFi setting
 */
const DEFAULT_AUTO_DOWNLOAD_ON_WIFI = true;

/**
 * Get auto-download on WiFi setting
 *
 * @returns True if auto-download on WiFi is enabled
 */
export function getAutoDownloadOnWifi(): boolean {
  const value = itemStorage.get('orbitalAutoDownloadOnWifi');
  return value ?? DEFAULT_AUTO_DOWNLOAD_ON_WIFI;
}

/**
 * Set auto-download on WiFi setting
 *
 * @param enabled - Whether to enable auto-download on WiFi
 */
export async function setAutoDownloadOnWifi(enabled: boolean): Promise<void> {
  await itemStorage.put('orbitalAutoDownloadOnWifi', enabled);
  log.info(`setAutoDownloadOnWifi: ${enabled}`);
}

/**
 * Network connection type
 */
export type NetworkType = 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';

/**
 * Get current network connection type
 *
 * Uses the Navigator Network Information API (available in Chromium/Electron).
 * Falls back to 'unknown' if not available.
 *
 * @returns Current network type
 */
export function getNetworkType(): NetworkType {
  // Check if Network Information API is available
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

  if (!connection) {
    // Network Information API not available
    // In Electron desktop, we're likely on a stable connection
    return 'unknown';
  }

  const effectiveType = connection.type || connection.effectiveType;

  if (!effectiveType) {
    return 'unknown';
  }

  // Map connection types to our NetworkType
  switch (effectiveType.toLowerCase()) {
    case 'wifi':
      return 'wifi';
    case 'cellular':
    case '2g':
    case '3g':
    case '4g':
    case '5g':
      return 'cellular';
    case 'ethernet':
      return 'ethernet';
    case 'none':
      return 'none';
    default:
      return 'unknown';
  }
}

/**
 * Check if currently connected to the internet
 *
 * @returns True if online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Check if auto-download should proceed based on settings and network
 *
 * Auto-download proceeds if:
 * - Setting is enabled AND on WiFi/Ethernet/Unknown
 * - OR setting is disabled (always manual download)
 *
 * @returns True if auto-download should proceed
 */
export function shouldAutoDownload(): boolean {
  if (!isOnline()) {
    return false;
  }

  const autoDownloadEnabled = getAutoDownloadOnWifi();

  if (!autoDownloadEnabled) {
    return false;
  }

  const networkType = getNetworkType();

  // Auto-download on WiFi, Ethernet, or Unknown (desktop is usually on stable connection)
  // Don't auto-download on cellular or when offline
  const shouldProceed =
    networkType === 'wifi' ||
    networkType === 'ethernet' ||
    networkType === 'unknown';

  log.info(`shouldAutoDownload: ${shouldProceed} (network: ${networkType})`);

  return shouldProceed;
}

/**
 * Listen for network changes
 *
 * @param callback - Called when network status changes
 * @returns Cleanup function to stop listening
 */
export function onNetworkChange(
  callback: (isOnline: boolean, networkType: NetworkType) => void
): () => void {
  const handleChange = () => {
    callback(isOnline(), getNetworkType());
  };

  // Listen for online/offline events
  window.addEventListener('online', handleChange);
  window.addEventListener('offline', handleChange);

  // Listen for connection type changes if API available
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (connection) {
    connection.addEventListener('change', handleChange);
  }

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleChange);
    window.removeEventListener('offline', handleChange);
    if (connection) {
      connection.removeEventListener('change', handleChange);
    }
  };
}

/**
 * Get all Orbital settings
 *
 * @returns Object with all Orbital-specific settings
 */
export function getOrbitalSettings(): {
  autoDownloadOnWifi: boolean;
} {
  return {
    autoDownloadOnWifi: getAutoDownloadOnWifi(),
  };
}

/**
 * Reset all Orbital settings to defaults
 */
export async function resetOrbitalSettings(): Promise<void> {
  await setAutoDownloadOnWifi(DEFAULT_AUTO_DOWNLOAD_ON_WIFI);
  log.info('resetOrbitalSettings: Reset to defaults');
}
