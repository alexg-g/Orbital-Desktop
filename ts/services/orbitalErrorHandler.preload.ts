// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital API Error Handler
 *
 * Centralized error handling for Orbital API responses.
 * Handles 401 Unauthorized errors by clearing JWT and showing login modal.
 */

import { createLogger } from '../logging/log.std.js';
import { logout } from './orbitalAuth.preload.js';

const log = createLogger('OrbitalErrorHandler');

/**
 * Check if error is a 401 Unauthorized error
 */
export function is401Error(error: Error | unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('401') || message.includes('unauthorized');
  }
  return false;
}

/**
 * Handle 401 Unauthorized error
 * - Logs out user (clears JWT token)
 * - OrbitalInbox will detect logout and show inline login screen
 */
export async function handle401Error(): Promise<void> {
  log.warn('Received 401 Unauthorized - token expired or invalid');

  // Clear JWT token from storage
  // OrbitalInbox will detect the logout via isAuthenticated() and show login
  await logout();
}

/**
 * Global error handler for Orbital API calls
 * Use this to wrap API responses and handle 401 errors automatically
 */
export async function handleOrbitalAPIError(error: Error | unknown): Promise<void> {
  if (is401Error(error)) {
    await handle401Error();
  }

  // Re-throw the error so calling code can handle it too
  throw error;
}
