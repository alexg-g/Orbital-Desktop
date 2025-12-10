// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Storybook mock for orbitalAuth.preload.ts
 * Provides stub implementations for auth functions that work in browser environment
 */

export async function login(_username: string, _password: string): Promise<{ success: boolean; token?: string; userId?: string }> {
  console.log('[Storybook Mock] login called');
  return { success: true, token: 'mock-token', userId: 'mock-user-id' };
}

export async function register(_username: string, _password: string): Promise<{ success: boolean; token?: string; userId?: string }> {
  console.log('[Storybook Mock] register called');
  return { success: true, token: 'mock-token', userId: 'mock-user-id' };
}

export async function logout(): Promise<void> {
  console.log('[Storybook Mock] logout called');
}

export async function getUsername(): Promise<string | null> {
  return 'storybook-user';
}

export async function isLoggedIn(): Promise<boolean> {
  return true;
}

export async function getAuthToken(): Promise<string | null> {
  return 'mock-auth-token';
}

export async function uploadAvatar(_buffer: Buffer, _filename: string, _mimeType: string): Promise<string> {
  console.log('[Storybook Mock] uploadAvatar called');
  return 'https://example.com/avatar.png';
}

export async function removeAvatar(): Promise<void> {
  console.log('[Storybook Mock] removeAvatar called');
}

export async function refreshToken(): Promise<string | null> {
  return 'mock-refreshed-token';
}

export async function clearAuthData(): Promise<void> {
  console.log('[Storybook Mock] clearAuthData called');
}
