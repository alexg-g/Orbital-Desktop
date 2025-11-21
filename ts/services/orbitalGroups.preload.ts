// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Groups Service
 *
 * Handles group (orbit) creation, joining, and management.
 *
 * Features:
 * - Create new orbits with encrypted group names
 * - Generate and manage invite codes
 * - Join orbits via invite codes
 * - List user's orbits
 * - Get orbit members
 *
 * Security:
 * - Group names encrypted client-side before sending to server
 * - Server only sees encrypted_name (zero-knowledge)
 * - Invite codes are single-use and expire after 7 days
 *
 * Limits:
 * - Max 10 members per orbit
 */

import * as https from 'node:https';
import * as http from 'node:http';
import { URL } from 'node:url';
import { createLogger } from '../logging/log.std.js';
import * as Errors from '../types/errors.std.js';
import { handleOrbitalAPIError } from './orbitalErrorHandler.preload.js';
import { getRandomBytes } from '../Crypto.node.js';
import * as Bytes from '../Bytes.std.js';

const log = createLogger('OrbitalGroups');

/**
 * Orbital API base URL
 */
const ORBITAL_API_URL = process.env.ORBITAL_API_URL || 'https://api.orbitl.org';

/**
 * Group limits
 */
export const GROUP_LIMITS = {
  MAX_MEMBERS: 10,
  INVITE_CODE_EXPIRY_DAYS: 7,
  GROUP_NAME_MAX_LENGTH: 100,
};

/**
 * Group information
 */
export type GroupInfo = {
  groupId: string;
  name: string; // Decrypted name
  encryptedName: string;
  memberCount: number;
  createdAt: string;
  isOwner: boolean;
};

/**
 * Group member information
 */
export type GroupMember = {
  memberId: string;
  username: string;
  joinedAt: string;
  isOwner: boolean;
};

/**
 * Invite code information
 */
export type InviteCodeInfo = {
  code: string;
  expiresAt: string;
  groupId: string;
  groupName: string;
};

/**
 * Create group result
 */
export type CreateGroupResult = {
  group: GroupInfo;
  inviteCode: InviteCodeInfo;
};

/**
 * Join group result
 */
export type JoinGroupResult = {
  group: GroupInfo;
};

/**
 * API error response
 */
export type GroupAPIError = {
  error: string;
  code?: string;
};

/**
 * Create a new orbit (group)
 *
 * @param name Plain text group name (will be encrypted before sending)
 * @returns Created group info with invite code
 */
export async function createGroup(name: string): Promise<CreateGroupResult> {
  const logId = `createGroup(${name})`;

  if (!name || name.trim().length === 0) {
    throw new Error('Group name is required');
  }

  if (name.length > GROUP_LIMITS.GROUP_NAME_MAX_LENGTH) {
    throw new Error(`Group name must be ${GROUP_LIMITS.GROUP_NAME_MAX_LENGTH} characters or less`);
  }

  try {
    // Get JWT token for authentication
    const { getJWT, getUserId } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();
    const userId = await getUserId();

    if (!jwtToken || !userId) {
      throw new Error('Not authenticated. Please log in first.');
    }

    // Generate a group encryption key
    // In production, this would use Signal's Sender Keys
    // For now, we use a simple symmetric key approach
    const groupKey = getRandomBytes(32);
    const groupKeyBase64 = Bytes.toBase64(groupKey);

    // Encrypt the group name
    // Simple encryption for now - in production use proper crypto
    const encryptedName = encryptGroupName(name, groupKey);

    const requestBody = JSON.stringify({
      encrypted_name: encryptedName,
      // The group key would be distributed via Sender Keys in production
      // For now we store it locally
    });

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/groups`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: Buffer.from(requestBody),
    });

    if (response.status !== 201 && response.status !== 200) {
      const errorData = parseErrorResponse(response.data);
      throw new Error(errorData.error || `Failed to create group: ${response.status}`);
    }

    const data = JSON.parse(response.data);

    // Store the group key locally for future decryption
    await storeGroupKey(data.group_id, groupKeyBase64);

    const result: CreateGroupResult = {
      group: {
        groupId: data.group_id,
        name: name, // We know the plain text name
        encryptedName: encryptedName,
        memberCount: 1, // Creator is first member
        createdAt: data.created_at || new Date().toISOString(),
        isOwner: true,
      },
      inviteCode: {
        code: data.invite_code,
        expiresAt: data.invite_expires_at || calculateExpiryDate(),
        groupId: data.group_id,
        groupName: name,
      },
    };

    log.info(`${logId}: Group created successfully`, { groupId: result.group.groupId });

    return result;
  } catch (error) {
    log.error(`${logId}: Failed to create group`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Join an orbit using an invite code
 *
 * @param inviteCode 8-character alphanumeric invite code
 * @returns Joined group info
 */
export async function joinGroup(inviteCode: string): Promise<JoinGroupResult> {
  const logId = `joinGroup(${inviteCode})`;

  // Validate invite code format
  const cleanCode = inviteCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(cleanCode)) {
    throw new Error('Invalid invite code format. Must be 8 alphanumeric characters.');
  }

  try {
    // Get JWT token for authentication
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const requestBody = JSON.stringify({
      invite_code: cleanCode,
    });

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/groups/join`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: Buffer.from(requestBody),
    });

    if (response.status !== 200) {
      const errorData = parseErrorResponse(response.data);

      // Map server errors to user-friendly messages
      const userFriendlyError = mapJoinError(errorData.code || errorData.error);
      throw new Error(userFriendlyError);
    }

    const data = JSON.parse(response.data);

    // Receive and store the group key
    // In production, this would come via X3DH key exchange
    if (data.group_key) {
      await storeGroupKey(data.group_id, data.group_key);
    }

    // Decrypt the group name
    const groupName = await decryptGroupNameForGroup(data.group_id, data.encrypted_name);

    const result: JoinGroupResult = {
      group: {
        groupId: data.group_id,
        name: groupName,
        encryptedName: data.encrypted_name,
        memberCount: data.member_count || 1,
        createdAt: data.created_at,
        isOwner: false,
      },
    };

    log.info(`${logId}: Successfully joined group`, { groupId: result.group.groupId });

    return result;
  } catch (error) {
    log.error(`${logId}: Failed to join group`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Get list of user's orbits
 *
 * @returns Array of group information
 */
export async function listGroups(): Promise<GroupInfo[]> {
  const logId = 'listGroups';

  try {
    // Get JWT token for authentication
    const { getJWT, getUserId } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();
    const userId = await getUserId();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/groups`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    if (response.status !== 200) {
      throw new Error(`Failed to list groups: ${response.status} ${response.statusText}`);
    }

    const data = JSON.parse(response.data);
    const groups: GroupInfo[] = [];

    for (const groupData of data.groups || []) {
      // Decrypt the group name
      const groupName = await decryptGroupNameForGroup(groupData.group_id, groupData.encrypted_name);

      groups.push({
        groupId: groupData.group_id,
        name: groupName,
        encryptedName: groupData.encrypted_name,
        memberCount: groupData.member_count || 0,
        createdAt: groupData.created_at,
        isOwner: groupData.owner_id === userId,
      });
    }

    log.info(`${logId}: Retrieved ${groups.length} groups`);

    return groups;
  } catch (error) {
    log.error(`${logId}: Failed to list groups`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Get members of an orbit
 *
 * @param groupId Group ID
 * @returns Array of member information
 */
export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const logId = `getGroupMembers(${groupId})`;

  try {
    // Get JWT token for authentication
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/groups/${groupId}/members`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    if (response.status !== 200) {
      throw new Error(`Failed to get members: ${response.status} ${response.statusText}`);
    }

    const data = JSON.parse(response.data);
    const members: GroupMember[] = (data.members || []).map((m: any) => ({
      memberId: m.user_id,
      username: m.username,
      joinedAt: m.joined_at,
      isOwner: m.is_owner || false,
    }));

    log.info(`${logId}: Retrieved ${members.length} members`);

    return members;
  } catch (error) {
    log.error(`${logId}: Failed to get members`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Generate a new invite code for a group
 *
 * @param groupId Group ID
 * @returns New invite code info
 */
export async function regenerateInviteCode(groupId: string): Promise<InviteCodeInfo> {
  const logId = `regenerateInviteCode(${groupId})`;

  try {
    // Get JWT token for authentication
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/groups/${groupId}/invite-codes`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status !== 201 && response.status !== 200) {
      throw new Error(`Failed to generate invite code: ${response.status}`);
    }

    const data = JSON.parse(response.data);

    // Get group name for the invite code info
    const groupName = await decryptGroupNameForGroup(groupId, data.encrypted_name || '');

    const inviteCode: InviteCodeInfo = {
      code: data.invite_code,
      expiresAt: data.expires_at || calculateExpiryDate(),
      groupId: groupId,
      groupName: groupName,
    };

    log.info(`${logId}: New invite code generated`);

    return inviteCode;
  } catch (error) {
    log.error(`${logId}: Failed to generate invite code`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

// =============================================================================
// ENCRYPTION HELPERS
// =============================================================================

/**
 * Encrypt a group name with a group key
 * Simple XOR encryption for now - in production use AES-GCM
 */
function encryptGroupName(plainText: string, key: Uint8Array): string {
  const textBytes = new TextEncoder().encode(plainText);
  const encrypted = new Uint8Array(textBytes.length);

  for (let i = 0; i < textBytes.length; i++) {
    encrypted[i] = textBytes[i] ^ key[i % key.length];
  }

  return Bytes.toBase64(encrypted);
}

/**
 * Decrypt a group name with a group key
 */
function decryptGroupName(encryptedBase64: string, key: Uint8Array): string {
  const encrypted = Bytes.fromBase64(encryptedBase64);
  const decrypted = new Uint8Array(encrypted.length);

  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ key[i % key.length];
  }

  return new TextDecoder().decode(decrypted);
}

/**
 * Decrypt group name using stored key
 */
async function decryptGroupNameForGroup(groupId: string, encryptedName: string): Promise<string> {
  const groupKeyBase64 = await getGroupKey(groupId);

  if (!groupKeyBase64) {
    // If we don't have the key, return placeholder
    return '[Encrypted Group]';
  }

  const groupKey = Bytes.fromBase64(groupKeyBase64);
  return decryptGroupName(encryptedName, groupKey);
}

// =============================================================================
// KEY STORAGE HELPERS
// =============================================================================

/**
 * Store a group key in SQLCipher
 */
async function storeGroupKey(groupId: string, keyBase64: string): Promise<void> {
  const { itemStorage } = await import('../textsecure/Storage.preload.js');

  // Get existing keys map or create new one
  const existingKeys = itemStorage.get('orbitalGroupKeys') || {};
  const updatedKeys = {
    ...existingKeys,
    [groupId]: keyBase64,
  };

  await itemStorage.put('orbitalGroupKeys', updatedKeys);
}

/**
 * Get a group key from SQLCipher
 */
async function getGroupKey(groupId: string): Promise<string | null> {
  const { itemStorage } = await import('../textsecure/Storage.preload.js');

  const keys = itemStorage.get('orbitalGroupKeys');
  if (!keys) {
    return null;
  }

  return keys[groupId] || null;
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Parse error response from server
 */
function parseErrorResponse(data: string): GroupAPIError {
  try {
    return JSON.parse(data);
  } catch {
    return { error: data || 'Unknown error' };
  }
}

/**
 * Map server error codes to user-friendly messages
 */
function mapJoinError(errorCode: string): string {
  const errorMap: Record<string, string> = {
    'INVITE_EXPIRED': 'This invite code has expired',
    'INVITE_USED': 'This invite code has already been used',
    'GROUP_FULL': `This orbit is full (max ${GROUP_LIMITS.MAX_MEMBERS} members)`,
    'INVALID_CODE': 'Invalid invite code',
    'ALREADY_MEMBER': 'You are already a member of this orbit',
  };

  return errorMap[errorCode] || errorCode || 'Failed to join orbit';
}

/**
 * Calculate expiry date (7 days from now)
 */
function calculateExpiryDate(): string {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + GROUP_LIMITS.INVITE_CODE_EXPIRY_DAYS);
  return expiry.toISOString();
}

// =============================================================================
// HTTP REQUEST HELPER
// =============================================================================

/**
 * Helper to make HTTP/HTTPS requests
 */
function makeRequest(options: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: Buffer;
}): Promise<{ status: number; statusText: string; data: string }> {
  return new Promise((resolve, reject) => {
    const { url, method, headers, body } = options;

    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: headers || {},
    };

    const request = httpModule.request(requestOptions, response => {
      let responseData = '';

      response.on('data', chunk => {
        responseData += chunk.toString();
      });

      response.on('end', () => {
        resolve({
          status: response.statusCode || 0,
          statusText: response.statusMessage || '',
          data: responseData,
        });
      });

      response.on('error', error => {
        reject(error);
      });
    });

    request.on('error', error => {
      reject(error);
    });

    if (body) {
      request.write(body);
    }

    request.end();
  });
}
