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
 * Check if user has a stored token (does NOT validate with backend)
 * Use validateSession() for full validation
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getJWT();
  console.log('[OrbitalAuth] isAuthenticated: token exists =', token !== null, 'token preview =', token ? token.substring(0, 20) + '...' : 'null');
  return token !== null;
}

/**
 * Validation result from server
 */
export type ValidationResult = {
  valid: boolean;
  userId?: string;
  username?: string;
  error?: string;
};

/**
 * Validate stored JWT token against backend server
 * Returns validation result with user info if valid
 * Automatically clears invalid tokens
 */
export async function validateToken(): Promise<ValidationResult> {
  const token = await getJWT();

  if (!token) {
    log.info('validateToken: No token stored');
    return { valid: false, error: 'No token stored' };
  }

  log.info('validateToken: Validating stored token with backend');

  try {
    const response = await makeAuthRequest({
      path: '/api/verify-token',
      method: 'POST',
      body: JSON.stringify({ token }),
    });

    if (response.status !== 200) {
      log.warn('validateToken: Server error', { status: response.status });
      // Don't clear token on server error - might be temporary
      return { valid: false, error: `Server error: ${response.status}` };
    }

    const result = JSON.parse(response.data.toString());

    if (result.valid) {
      log.info('validateToken: Token is valid', { userId: result.user_id });
      return {
        valid: true,
        userId: result.user_id,
        username: result.username,
      };
    } else {
      log.warn('validateToken: Token is invalid, clearing stored credentials');
      // Token is invalid - clear it
      await logout();
      return { valid: false, error: result.error || 'Token invalid' };
    }
  } catch (error) {
    // Network error - don't clear token, might be offline
    log.error('validateToken: Network error', { error: Errors.toLogFormat(error) });
    return { valid: false, error: 'Network error - could not reach server' };
  }
}

/**
 * Full session validation - checks token with backend
 * If token is invalid, clears credentials and returns false
 * Network errors return false (require backend connection for security)
 */
export async function validateSession(): Promise<boolean> {
  log.info('validateSession: Starting session validation');

  const result = await validateToken();

  if (result.valid) {
    log.info('validateSession: Session is valid', { userId: result.userId });
    return true;
  }

  // Token invalid or network error - require re-login
  log.warn('validateSession: Session invalid', { error: result.error });
  return false;
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
