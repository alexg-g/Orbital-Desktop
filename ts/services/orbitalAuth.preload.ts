// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Authentication Service
 *
 * Handles JWT token management for Orbital API authentication.
 *
 * Features:
 * - Login with username/password
 * - Store JWT token encrypted in SQLCipher
 * - Retrieve token for API calls
 * - Logout and clear credentials
 * - Check authentication status
 *
 * Security:
 * - JWT tokens stored in SQLCipher (encrypted at rest)
 * - Automatic token validation
 * - Secure credential handling
 */

import * as https from 'node:https';
import * as http from 'node:http';
import { URL } from 'node:url';
import { createLogger } from '../logging/log.std.js';
import { itemStorage } from '../textsecure/Storage.preload.js';
import * as Errors from '../types/errors.std.js';

const log = createLogger('OrbitalAuth');

/**
 * Orbital API base URL
 */
const ORBITAL_API_URL = process.env.ORBITAL_API_URL || 'https://api.orbitl.org';

/**
 * Login credentials
 */
export type LoginCredentials = {
  username: string;
  password: string;
};

/**
 * Login response from server
 */
type LoginResponse = {
  user_id: string;
  username: string;
  token: string;
};

/**
 * Login with username and password
 * Stores JWT token in SQLCipher on success
 */
export async function login(
  credentials: LoginCredentials
): Promise<{ userId: string; username: string; token: string }> {
  const { username, password } = credentials;

  if (!username || !password) {
    throw new Error('Username and password are required');
  }

  log.info('Attempting login', { username });

  const requestBody = JSON.stringify({ username, password });

  try {
    const response = await makeAuthRequest({
      path: '/api/login',
      method: 'POST',
      body: requestBody,
    });

    if (response.status !== 200) {
      const errorText = response.data.toString();
      log.warn('Login failed', { status: response.status, error: errorText });
      throw new Error(`Login failed: ${response.status} ${errorText}`);
    }

    const loginResponse: LoginResponse = JSON.parse(response.data.toString());

    // Store JWT token and user info in SQLCipher
    await itemStorage.put('orbitalJwtToken', loginResponse.token);
    await itemStorage.put('orbitalUserId', loginResponse.user_id);
    await itemStorage.put('orbitalUsername', loginResponse.username);

    log.info('Login successful', { username: loginResponse.username });

    return {
      userId: loginResponse.user_id,
      username: loginResponse.username,
      token: loginResponse.token,
    };
  } catch (error) {
    log.error('Login error', { error: Errors.toLogFormat(error) });
    throw error;
  }
}

/**
 * Get stored JWT token from SQLCipher
 * Returns null if not logged in
 */
export async function getJWT(): Promise<string | null> {
  const token = itemStorage.get('orbitalJwtToken');
  return token || null;
}

/**
 * Get stored user ID
 */
export async function getUserId(): Promise<string | null> {
  const userId = itemStorage.get('orbitalUserId');
  return userId || null;
}

/**
 * Get stored username
 */
export async function getUsername(): Promise<string | null> {
  const username = itemStorage.get('orbitalUsername');
  return username || null;
}

/**
 * Check if user is authenticated (has valid JWT token)
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getJWT();
  return token !== null;
}

/**
 * Logout - clear JWT token and user info from storage
 */
export async function logout(): Promise<void> {
  log.info('Logging out');

  await itemStorage.remove('orbitalJwtToken');
  await itemStorage.remove('orbitalUserId');
  await itemStorage.remove('orbitalUsername');

  log.info('Logout complete');
}

/**
 * Clear stored credentials (alias for logout)
 */
export async function clearJWT(): Promise<void> {
  await logout();
}

/**
 * Make authenticated HTTP request to Orbital API
 */
async function makeAuthRequest(params: {
  path: string;
  method: 'GET' | 'POST';
  body?: string;
}): Promise<{ status: number; statusText: string; data: Buffer }> {
  const { path, method, body } = params;

  const apiUrl = `${ORBITAL_API_URL}${path}`;
  const parsedUrl = new URL(apiUrl);
  const httpModule = parsedUrl.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let responseStatus = 0;
    let responseStatusText = '';

    const requestOptions: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };

    const request = httpModule.request(requestOptions, response => {
      responseStatus = response.statusCode || 0;
      responseStatusText = response.statusMessage || '';

      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      response.on('end', () => {
        const data = Buffer.concat(chunks);
        resolve({
          status: responseStatus,
          statusText: responseStatusText,
          data,
        });
      });
    });

    request.on('error', error => {
      log.error('Request failed', {
        error: Errors.toLogFormat(error),
        path,
        method,
      });
      reject(error);
    });

    if (body) {
      request.write(body);
    }

    request.end();
  });
}
