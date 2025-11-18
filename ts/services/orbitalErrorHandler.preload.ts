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
 * - Shows login modal
 * - Optionally shows toast message
 */
export async function handle401Error(): Promise<void> {
  log.warn('Received 401 Unauthorized - token expired or invalid');

  // Clear JWT token from storage
  await logout();

  // Show login modal via redux action
  if (window.reduxActions?.globalModals?.toggleOrbitalLogin) {
    window.reduxActions.globalModals.toggleOrbitalLogin(true);
  }

  // Optional: Show toast notification
  // if (window.reduxActions?.toast?.showToast) {
  //   window.reduxActions.toast.showToast({
  //     message: 'Your session has expired. Please log in again.',
  //     toastType: 'error',
  //   });
  // }
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
