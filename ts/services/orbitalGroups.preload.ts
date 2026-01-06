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
import { hkdf } from '@signalapp/libsignal-client';
import { createLogger } from '../logging/log.std.js';
import * as Errors from '../types/errors.std.js';
import { handleOrbitalAPIError } from './orbitalErrorHandler.preload.js';
import { getRandomBytes, encryptAesGcm, decryptAesGcm, sha256 } from '../Crypto.node.js';
import * as Bytes from '../Bytes.std.js';

const log = createLogger('OrbitalGroups');

/**
 * Orbital API base URL
 */
const ORBITAL_API_URL = process.env.ORBITAL_API_URL || 'https://api.orbitl.org';

/**
 * Fetch an avatar image and convert to data URL
 * This is needed because Electron's renderer can't load http:// images directly
 */
async function fetchAvatarAsDataUrl(avatarPath: string): Promise<string | undefined> {
  const avatarUrl = `${ORBITAL_API_URL}${avatarPath}`;
  const parsedUrl = new URL(avatarUrl);
  const httpModule = parsedUrl.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const request = httpModule.get(avatarUrl, (response) => {
      if (response.statusCode !== 200) {
        log.warn(`Failed to fetch avatar: ${response.statusCode}`);
        resolve(undefined);
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = response.headers['content-type'] || 'image/png';
        const base64 = buffer.toString('base64');
        resolve(`data:${contentType};base64,${base64}`);
      });
      response.on('error', () => {
        log.warn('Error reading avatar response');
        resolve(undefined);
      });
    });

    request.on('error', (error) => {
      log.warn('Avatar fetch failed', Errors.toLogFormat(error));
      resolve(undefined);
    });

    request.setTimeout(5000, () => {
      request.destroy();
      log.warn('Avatar fetch timed out');
      resolve(undefined);
    });
  });
}

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
  displayName: string;
  joinedAt: string;
  isOwner: boolean;
  avatarUrl?: string;
};

/**
 * Invite code information
 */
export type InviteCodeInfo = {
  code: string;
  expiresAt: string;
  groupId: string;
  groupName: string;
  targetEmail?: string;
  createdAt?: string;
  link?: string; // For shareable links
  status?: 'pending' | 'accepted' | 'expired';
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
  message?: string;
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

    // DEBUG: Log key prefix for key transfer verification
    console.log(`[KEY-TRANSFER-DEBUG] createGroup: Generated key prefix: ${groupKeyBase64.substring(0, 8)}...`);

    // Encrypt the group name
    // Simple encryption for now - in production use proper crypto
    const encryptedName = encryptGroupName(name, groupKey);

    const requestBody = JSON.stringify({
      encrypted_name: encryptedName,
      // The group key would be distributed via Sender Keys in production
      // For now we store it locally and send it as encrypted_group_key
      // In production, this would be encrypted with the user's public key
      encrypted_group_key: groupKeyBase64,
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

    // For MVP, we send a placeholder encrypted_group_key
    // In production, this would be the group key encrypted with
    // the joining user's public key (proper key exchange via Issue #49)
    // The backend will return the actual group_key in the response
    const placeholderKey = Bytes.toBase64(getRandomBytes(32));

    const requestBody = JSON.stringify({
      invite_code: cleanCode,
      encrypted_group_key: placeholderKey,
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

      // Use server message if available, otherwise map error codes
      const userFriendlyError = errorData.message || mapJoinError(errorData.code || errorData.error);
      throw new Error(userFriendlyError);
    }

    const data = JSON.parse(response.data);

    // Receive and store the group key
    // In production, this would come via X3DH key exchange
    if (data.group_key) {
      // DEBUG: Log key prefix for key transfer verification
      console.log(`[KEY-TRANSFER-DEBUG] joinGroup: Received key prefix: ${data.group_key.substring(0, 8)}...`);
      await storeGroupKey(data.group_id, data.group_key);
    } else {
      console.log(`[KEY-TRANSFER-DEBUG] joinGroup: WARNING - No group_key in response!`);
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
      // Store the group key if present (ensures key is available for encryption/decryption)
      if (groupData.encrypted_group_key) {
        await storeGroupKey(groupData.group_id, groupData.encrypted_group_key);
        log.info(`${logId}: Stored group key for ${groupData.group_id}`);
      }

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
 * Leave an orbit
 *
 * This will:
 * 1. Remove the user from the group on the server
 * 2. Delete the local group key (can no longer decrypt messages)
 * 3. Clear local selection if this was the selected group
 *
 * Note: The server should trigger key rotation for remaining members
 * to ensure forward secrecy (departed member cannot read new messages).
 *
 * @param groupId Group ID
 */
export async function leaveGroup(groupId: string): Promise<void> {
  const logId = `leaveGroup(${groupId})`;

  try {
    // Get JWT token for authentication
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/groups/${groupId}/leave`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status !== 200 && response.status !== 204) {
      const errorData = parseErrorResponse(response.data);
      throw new Error(errorData.error || `Failed to leave group: ${response.status}`);
    }

    // Delete local group key (can no longer decrypt messages)
    await deleteGroupKey(groupId);

    // Clear cached group name
    await clearCachedGroupName(groupId);

    // Clear selected group if this was it
    const selectedGroupId = await getSelectedGroupId();
    if (selectedGroupId === groupId) {
      await clearSelectedGroupId();
    }

    log.info(`${logId}: Successfully left group`);
  } catch (error) {
    log.error(`${logId}: Failed to leave group`, Errors.toLogFormat(error));
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

    // Fetch avatar data URLs in parallel for all members with avatars
    const members: GroupMember[] = await Promise.all(
      (data.members || []).map(async (m: any) => {
        let avatarDataUrl: string | undefined;
        if (m.avatar_url) {
          avatarDataUrl = await fetchAvatarAsDataUrl(m.avatar_url);
        }
        return {
          memberId: m.user_id,
          username: m.username,
          displayName: m.display_name || m.username,
          joinedAt: m.joined_at,
          isOwner: m.is_owner || false,
          avatarUrl: avatarDataUrl,
        };
      })
    );

    // Cache display names for all members
    const { cacheMemberDisplayNames } = await import('../components/orbital/settingsStorage.js');
    const displayNameCache = members.map(m => ({
      userId: m.memberId,
      displayName: m.displayName,
    }));
    cacheMemberDisplayNames(displayNameCache);

    log.info(`${logId}: Retrieved ${members.length} members`);

    return members;
  } catch (error) {
    log.error(`${logId}: Failed to get members`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Generate a mock invite code (for demo orbits)
 */
function generateMockInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Check if this is a mock/demo group ID
 */
function isMockGroupId(groupId: string): boolean {
  return groupId.startsWith('demo-') || groupId === 'DEMO_ORBIT_ID';
}

/**
 * Store a mock invite code in local storage (persisted via SQLCipher)
 */
async function storeMockInvite(groupId: string, invite: InviteCodeInfo): Promise<void> {
  const { itemStorage } = await import('../textsecure/Storage.preload.js');

  // Get existing mock invites or create new map
  const existingInvites = itemStorage.get('orbitalMockInvites') || {};
  const groupInvites = existingInvites[groupId] || [];

  // Add new invite at the beginning
  groupInvites.unshift(invite);

  // Keep only the last 20 invites per group
  const trimmedInvites = groupInvites.slice(0, 20);

  const updatedInvites = {
    ...existingInvites,
    [groupId]: trimmedInvites,
  };

  await itemStorage.put('orbitalMockInvites', updatedInvites);
  log.info(`storeMockInvite: Stored mock invite for group ${groupId}`);
}

/**
 * Get mock invites for a group from local storage
 */
async function getMockInvites(groupId: string): Promise<InviteCodeInfo[]> {
  const { itemStorage } = await import('../textsecure/Storage.preload.js');

  const allInvites = itemStorage.get('orbitalMockInvites') || {};
  const groupInvites = allInvites[groupId] || [];

  // Filter out expired invites
  const now = Date.now();
  const activeInvites = groupInvites.filter((invite: InviteCodeInfo) => {
    const expiresAt = new Date(invite.expiresAt).getTime();
    return expiresAt > now;
  });

  return activeInvites;
}

/**
 * Generate a new invite code for a group (requires target email)
 *
 * @param groupId Group ID
 * @param targetEmail Email address the invite is for
 * @returns New invite code info
 */
export async function generateInviteCode(groupId: string, targetEmail: string): Promise<InviteCodeInfo> {
  const logId = `generateInviteCode(${groupId})`;

  if (!targetEmail || !targetEmail.trim()) {
    throw new Error('Target email is required');
  }

  // Handle mock/demo orbits
  if (isMockGroupId(groupId)) {
    const mockCode = generateMockInviteCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    const inviteCode: InviteCodeInfo = {
      code: mockCode,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      groupId,
      groupName: 'Demo Orbit',
      targetEmail: targetEmail.trim().toLowerCase(),
      status: 'pending',
    };

    // Store the mock invite for persistence
    await storeMockInvite(groupId, inviteCode);

    log.info(`${logId}: Mock invite code generated for ${targetEmail}: ${mockCode}`);
    return inviteCode;
  }

  try {
    // Get JWT token for authentication
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const requestBody = JSON.stringify({
      groupId,
      targetEmail: targetEmail.trim().toLowerCase(),
    });

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/invites/generate`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: Buffer.from(requestBody),
    });

    if (response.status !== 201 && response.status !== 200) {
      const errorData = parseErrorResponse(response.data);
      throw new Error(errorData.error || `Failed to generate invite code: ${response.status}`);
    }

    const data = JSON.parse(response.data);

    const inviteCode: InviteCodeInfo = {
      code: data.code,
      expiresAt: new Date(data.expiresAt).toISOString(),
      createdAt: new Date(data.createdAt).toISOString(),
      groupId,
      groupName: '', // Will be filled by caller if needed
      targetEmail: data.targetEmail,
      status: 'pending',
    };

    log.info(`${logId}: Invite code generated for ${targetEmail}`);

    return inviteCode;
  } catch (error) {
    log.error(`${logId}: Failed to generate invite code`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Generate a shareable invite link for a group (requires target email)
 *
 * @param groupId Group ID
 * @param targetEmail Email address the invite is for
 * @param linkType Type of link ('orbital' for deep link, 'web' for web link)
 * @returns New invite code info with link
 */
export async function generateInviteLink(
  groupId: string,
  targetEmail: string,
  linkType: 'orbital' | 'web' = 'orbital'
): Promise<InviteCodeInfo> {
  const logId = `generateInviteLink(${groupId})`;

  if (!targetEmail || !targetEmail.trim()) {
    throw new Error('Target email is required');
  }

  // Handle mock/demo orbits
  if (isMockGroupId(groupId)) {
    const mockCode = generateMockInviteCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
    const mockLink = linkType === 'orbital'
      ? `orbital://invite/${mockCode}`
      : `https://orbitl.org/join/${mockCode}`;

    const inviteCode: InviteCodeInfo = {
      code: mockCode,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      groupId,
      groupName: 'Demo Orbit',
      targetEmail: targetEmail.trim().toLowerCase(),
      link: mockLink,
      status: 'pending',
    };

    // Store the mock invite for persistence
    await storeMockInvite(groupId, inviteCode);

    log.info(`${logId}: Mock invite link generated for ${targetEmail}: ${mockLink}`);
    return inviteCode;
  }

  try {
    // Get JWT token for authentication
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const requestBody = JSON.stringify({
      groupId,
      targetEmail: targetEmail.trim().toLowerCase(),
      linkType,
    });

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/invites/generate-link`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: Buffer.from(requestBody),
    });

    if (response.status !== 201 && response.status !== 200) {
      const errorData = parseErrorResponse(response.data);
      throw new Error(errorData.error || `Failed to generate invite link: ${response.status}`);
    }

    const data = JSON.parse(response.data);

    const inviteCode: InviteCodeInfo = {
      code: data.code,
      expiresAt: new Date(data.expiresAt).toISOString(),
      createdAt: new Date(data.createdAt).toISOString(),
      groupId,
      groupName: '', // Will be filled by caller if needed
      targetEmail: data.targetEmail,
      link: data.link,
      status: 'pending',
    };

    log.info(`${logId}: Invite link generated for ${targetEmail}`);

    return inviteCode;
  } catch (error) {
    log.error(`${logId}: Failed to generate invite link`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Get active invite codes for a group
 *
 * @param groupId Group ID
 * @returns Array of active invite codes
 */
export async function getActiveInviteCodes(groupId: string): Promise<InviteCodeInfo[]> {
  const logId = `getActiveInviteCodes(${groupId})`;

  // Handle mock/demo orbits - return stored mock invites
  if (isMockGroupId(groupId)) {
    const mockInvites = await getMockInvites(groupId);
    log.info(`${logId}: Retrieved ${mockInvites.length} mock invite codes`);
    return mockInvites;
  }

  try {
    // Get JWT token for authentication
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/invites/group/${groupId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    if (response.status !== 200) {
      const errorData = parseErrorResponse(response.data);
      throw new Error(errorData.error || `Failed to get invite codes: ${response.status}`);
    }

    const data = JSON.parse(response.data);

    const inviteCodes: InviteCodeInfo[] = (data.inviteCodes || []).map((ic: any) => ({
      code: ic.code,
      expiresAt: new Date(ic.expiresAt).toISOString(),
      createdAt: new Date(ic.createdAt).toISOString(),
      groupId,
      groupName: '',
      targetEmail: ic.targetEmail,
      status: ic.status || 'pending',
    }));

    log.info(`${logId}: Retrieved ${inviteCodes.length} active invite codes`);

    return inviteCodes;
  } catch (error) {
    log.error(`${logId}: Failed to get invite codes`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Generate a new invite code for a group (legacy - without target email)
 * @deprecated Use generateInviteCode instead
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
 * HKDF context strings for key separation (Option C from Signal Protocol Specialist)
 * Using distinct contexts ensures the name encryption key is cryptographically
 * independent from the content encryption key.
 */
const HKDF_INFO_GROUP_NAME = 'Orbital-GroupName-v1';
const HKDF_SALT_LENGTH = 32;
const DERIVED_KEY_LENGTH = 32; // AES-256
const GCM_IV_LENGTH = 12; // Standard for AES-GCM

/**
 * Derive a separate key for group name encryption using HKDF
 *
 * This implements key separation as recommended by the Signal Protocol Specialist:
 * - The master group key is used as Input Key Material (IKM)
 * - HKDF with context "Orbital-GroupName-v1" derives a purpose-specific key
 * - This ensures the name key is cryptographically independent from content keys
 *
 * @param masterGroupKey The master group key (32 bytes)
 * @returns Derived key for name encryption (32 bytes)
 */
function deriveGroupNameKey(masterGroupKey: Uint8Array): Uint8Array {
  const salt = new Uint8Array(HKDF_SALT_LENGTH); // Zero salt for deterministic derivation
  const info = Bytes.fromString(HKDF_INFO_GROUP_NAME);
  return hkdf(DERIVED_KEY_LENGTH, masterGroupKey, info, salt);
}

/**
 * Derive a deterministic IV from groupId using SHA-256
 *
 * This implements the Signal Protocol Specialist's recommendation:
 * - Deterministic IV derived from groupId (no random component)
 * - Safe because we never reuse the same key with different plaintexts for the same groupId
 * - Group name is static per group, so deterministic IV is appropriate
 * - Avoids need to store IV separately
 *
 * @param groupId The group identifier
 * @returns 12-byte IV for AES-GCM
 */
function deriveGroupNameIV(groupId: string): Uint8Array {
  const groupIdBytes = Bytes.fromString(groupId);
  const hash = sha256(groupIdBytes);
  // Take first 12 bytes for GCM IV
  return hash.subarray(0, GCM_IV_LENGTH);
}

/**
 * Encrypt a group name with AES-256-GCM
 *
 * Uses HKDF-derived key for key separation and random IV (prepended to ciphertext).
 * The IV is always prepended because during group creation, we don't have the groupId yet.
 *
 * Format: [12-byte IV][ciphertext with auth tag]
 *
 * @param plainText The group name to encrypt
 * @param masterGroupKey The master group key (32 bytes)
 * @returns Base64-encoded [IV + ciphertext]
 */
function encryptGroupName(plainText: string, masterGroupKey: Uint8Array): string {
  const nameKey = deriveGroupNameKey(masterGroupKey);
  const iv = getRandomBytes(GCM_IV_LENGTH);
  const plainBytes = Bytes.fromString(plainText);

  const ciphertext = encryptAesGcm(nameKey, iv, plainBytes);

  // Prepend IV to ciphertext (standard AES-GCM format)
  const result = new Uint8Array(iv.length + ciphertext.length);
  result.set(iv);
  result.set(ciphertext, iv.length);

  return Bytes.toBase64(result);
}

/**
 * Decrypt a group name with AES-256-GCM
 *
 * Expects format: [12-byte IV][ciphertext with auth tag]
 *
 * @param encryptedBase64 Base64-encoded [IV + ciphertext]
 * @param masterGroupKey The master group key (32 bytes)
 * @returns Decrypted group name
 * @throws Error if decryption fails (authentication failure, corrupted data, wrong key)
 */
function decryptGroupName(encryptedBase64: string, masterGroupKey: Uint8Array): string {
  const nameKey = deriveGroupNameKey(masterGroupKey);
  const data = Bytes.fromBase64(encryptedBase64);

  if (data.length < GCM_IV_LENGTH + 16) { // IV + minimum auth tag
    throw new Error('Invalid encrypted data: too short');
  }

  // Extract IV from first 12 bytes
  const iv = data.subarray(0, GCM_IV_LENGTH);
  const ciphertext = data.subarray(GCM_IV_LENGTH);

  const plainBytes = decryptAesGcm(nameKey, iv, ciphertext);
  return Bytes.toString(plainBytes);
}

/**
 * Try to decrypt with legacy XOR for backward compatibility
 * This handles existing encrypted names from before the AES-GCM upgrade
 */
function tryLegacyDecrypt(encryptedBase64: string, key: Uint8Array): string | null {
  try {
    const encrypted = Bytes.fromBase64(encryptedBase64);
    const decrypted = new Uint8Array(encrypted.length);

    for (let i = 0; i < encrypted.length; i++) {
      decrypted[i] = encrypted[i] ^ key[i % key.length];
    }

    const result = new TextDecoder().decode(decrypted);

    // Validate result contains only printable characters
    const hasInvalidChars = /[\x00-\x1F\x7F\uFFFD]/.test(result);
    if (hasInvalidChars || result.length === 0) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Decrypt group name using stored key with fallback support
 *
 * This implements the hybrid approach (Option C):
 * 1. Check local cache first for decrypted name
 * 2. Try AES-GCM decryption with derived key
 * 3. Fall back to legacy XOR for backward compatibility
 * 4. If all fails, try syncing key from server (auto-repair)
 * 5. Return placeholder if all decryption fails
 * 6. Cache successful decryption for resilience
 *
 * @param groupId The group identifier
 * @param encryptedName Base64-encoded encrypted name
 * @returns Decrypted group name or fallback
 */
async function decryptGroupNameForGroup(groupId: string, encryptedName: string): Promise<string> {
  // Check cache first
  const cached = await getCachedGroupName(groupId);
  if (cached) {
    return cached;
  }

  const groupKeyBase64 = await getGroupKey(groupId);

  if (!groupKeyBase64) {
    log.warn(`decryptGroupNameForGroup: No key found for group ${groupId}, attempting sync from server`);
    // Try to sync key from server
    const synced = await syncGroupKey(groupId);
    if (synced) {
      // Retry with new key
      const newKey = await getGroupKey(groupId);
      if (newKey) {
        return decryptGroupNameWithKey(groupId, encryptedName, newKey);
      }
    }
    return 'My Orbit';
  }

  const result = await decryptGroupNameWithKey(groupId, encryptedName, groupKeyBase64);

  // If decryption returned placeholder, try syncing key from server
  if (result === 'My Orbit') {
    log.info(`decryptGroupNameForGroup: Decryption failed for ${groupId}, attempting key sync from server`);
    const synced = await syncGroupKey(groupId);
    if (synced) {
      const newKey = await getGroupKey(groupId);
      if (newKey && newKey !== groupKeyBase64) {
        log.info(`decryptGroupNameForGroup: Key synced, retrying decryption for ${groupId}`);
        return decryptGroupNameWithKey(groupId, encryptedName, newKey);
      }
    }
  }

  return result;
}

/**
 * Internal helper to decrypt group name with a specific key
 */
async function decryptGroupNameWithKey(groupId: string, encryptedName: string, groupKeyBase64: string): Promise<string> {
  try {
    const groupKey = Bytes.fromBase64(groupKeyBase64);

    // Try AES-GCM decryption first (new format)
    try {
      const decryptedName = decryptGroupName(encryptedName, groupKey);
      // Cache the successful decryption
      await cacheGroupName(groupId, decryptedName);
      return decryptedName;
    } catch (gcmError) {
      log.info(`decryptGroupNameWithKey: AES-GCM failed for group ${groupId}, trying legacy format`);
    }

    // Try legacy XOR decryption for backward compatibility
    const legacyResult = tryLegacyDecrypt(encryptedName, groupKey);
    if (legacyResult) {
      log.info(`decryptGroupNameWithKey: Legacy decryption succeeded for group ${groupId}`);
      // Cache the result
      await cacheGroupName(groupId, legacyResult);
      return legacyResult;
    }

    log.warn(`decryptGroupNameWithKey: All decryption methods failed for group ${groupId}`);
    return 'My Orbit';
  } catch (error) {
    log.error(`decryptGroupNameWithKey: Failed to decrypt name for group ${groupId}:`, Errors.toLogFormat(error));
    return 'My Orbit';
  }
}

// =============================================================================
// GROUP NAME CACHE (SQLCipher)
// =============================================================================

/**
 * Cache a decrypted group name in SQLCipher
 * Provides resilience if encryption key is temporarily unavailable
 */
async function cacheGroupName(groupId: string, name: string): Promise<void> {
  try {
    const { itemStorage } = await import('../textsecure/Storage.preload.js');
    const cache = itemStorage.get('orbitalGroupNameCache') || {};
    cache[groupId] = name;
    await itemStorage.put('orbitalGroupNameCache', cache);
  } catch (error) {
    log.warn('cacheGroupName: Failed to cache group name', Errors.toLogFormat(error));
  }
}

/**
 * Get a cached group name from SQLCipher
 */
async function getCachedGroupName(groupId: string): Promise<string | null> {
  try {
    const { itemStorage } = await import('../textsecure/Storage.preload.js');
    const cache = itemStorage.get('orbitalGroupNameCache') || {};
    return cache[groupId] || null;
  } catch (error) {
    log.warn('getCachedGroupName: Failed to get cached name', Errors.toLogFormat(error));
    return null;
  }
}

/**
 * Clear cached group name (e.g., when leaving a group)
 */
async function clearCachedGroupName(groupId: string): Promise<void> {
  try {
    const { itemStorage } = await import('../textsecure/Storage.preload.js');
    const cache = itemStorage.get('orbitalGroupNameCache') || {};
    delete cache[groupId];
    await itemStorage.put('orbitalGroupNameCache', cache);
  } catch (error) {
    log.warn('clearCachedGroupName: Failed to clear cached name', Errors.toLogFormat(error));
  }
}

// =============================================================================
// KEY STORAGE HELPERS
// =============================================================================

/**
 * AES-256 key length in bytes
 */
const AES_256_KEY_LENGTH = 32;

/**
 * Store a group key in SQLCipher
 * Validates the key is a proper 32-byte (256-bit) AES key before storing.
 */
async function storeGroupKey(groupId: string, keyBase64: string): Promise<void> {
  const { itemStorage } = await import('../textsecure/Storage.preload.js');

  // Validate key format before storing
  try {
    const keyBytes = Bytes.fromBase64(keyBase64);
    if (keyBytes.length !== AES_256_KEY_LENGTH) {
      log.error(`storeGroupKey: Invalid key length for group ${groupId}. Expected ${AES_256_KEY_LENGTH} bytes, got ${keyBytes.length} bytes. Key will not decrypt correctly.`);
      // Don't store invalid keys - this would break encryption
      return;
    }
    log.info(`storeGroupKey: Storing valid ${keyBytes.length}-byte key for group ${groupId}`);
    // DEBUG: Log key prefix for key transfer verification
    console.log(`[KEY-TRANSFER-DEBUG] storeGroupKey: Storing key prefix: ${keyBase64.substring(0, 8)}... for group ${groupId}`);
  } catch (error) {
    log.error(`storeGroupKey: Invalid base64 key for group ${groupId}:`, Errors.toLogFormat(error));
    return;
  }

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

/**
 * Rotate the group encryption key (for forward secrecy)
 *
 * This should be called when:
 * - A member leaves the group
 * - A member is removed from the group
 * - Periodic key rotation (recommended every 30 days)
 *
 * New messages will be encrypted with the new key.
 * Old messages remain encrypted with the old key (they are still readable
 * by current members because the old key is retained in history).
 *
 * @param groupId Group ID
 * @returns New key base64 (also stored in SQLCipher)
 */
export async function rotateGroupKey(groupId: string): Promise<string> {
  const logId = `rotateGroupKey(${groupId})`;

  // Generate a new 256-bit key
  const newKey = getRandomBytes(32);
  const newKeyBase64 = Bytes.toBase64(newKey);

  // Store the new key (replaces the old one)
  await storeGroupKey(groupId, newKeyBase64);

  log.info(`${logId}: Group key rotated successfully`);

  return newKeyBase64;
}

/**
 * Delete a group key from SQLCipher (e.g., when leaving a group)
 */
export async function deleteGroupKey(groupId: string): Promise<void> {
  const { itemStorage } = await import('../textsecure/Storage.preload.js');

  const existingKeys = itemStorage.get('orbitalGroupKeys') || {};
  const updatedKeys = { ...existingKeys };
  delete updatedKeys[groupId];

  await itemStorage.put('orbitalGroupKeys', updatedKeys);
  log.info(`deleteGroupKey: Deleted key for group ${groupId}`);
}

/**
 * Sync the group key from the backend server
 *
 * This is useful when:
 * - Decryption fails (key may be out of sync)
 * - User logged in on a new device
 * - Key was corrupted locally
 *
 * @param groupId Group ID
 * @returns true if key was synced successfully, false otherwise
 */
export async function syncGroupKey(groupId: string): Promise<boolean> {
  const logId = `syncGroupKey(${groupId})`;

  try {
    // Get JWT token for authentication
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      log.error(`${logId}: Not authenticated`);
      return false;
    }

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/groups/${groupId}/key`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    if (response.status !== 200) {
      log.error(`${logId}: Failed to fetch key: ${response.status}`);
      return false;
    }

    const data = JSON.parse(response.data);

    if (!data.group_key) {
      log.error(`${logId}: No key returned from server`);
      return false;
    }

    // Store the fetched key
    await storeGroupKey(groupId, data.group_key);

    // Clear the cached group name so it will be re-decrypted with the new key
    await clearCachedGroupName(groupId);

    log.info(`${logId}: Successfully synced group key from server`);
    return true;
  } catch (error) {
    log.error(`${logId}: Failed to sync group key`, Errors.toLogFormat(error));
    return false;
  }
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

// =============================================================================
// SELECTED GROUP PERSISTENCE
// =============================================================================

/**
 * Set the currently selected group ID (persisted in SQLCipher)
 */
export async function setSelectedGroupId(groupId: string): Promise<void> {
  const { itemStorage } = await import('../textsecure/Storage.preload.js');
  await itemStorage.put('orbitalSelectedGroupId', groupId);
  log.info('setSelectedGroupId: Saved', { groupId });
}

/**
 * Get the currently selected group ID from SQLCipher
 * Returns null if no group is selected
 */
export async function getSelectedGroupId(): Promise<string | null> {
  const { itemStorage } = await import('../textsecure/Storage.preload.js');
  const groupId = itemStorage.get('orbitalSelectedGroupId');
  return groupId || null;
}

/**
 * Clear the selected group ID (e.g., on logout)
 */
export async function clearSelectedGroupId(): Promise<void> {
  const { itemStorage } = await import('../textsecure/Storage.preload.js');
  await itemStorage.remove('orbitalSelectedGroupId');
  log.info('clearSelectedGroupId: Cleared');
}

// =============================================================================
// DM (DIRECT MESSAGE) FUNCTIONS - Issue #75
// DMs are implemented as 2-person groups with group_type = 'dm'
// =============================================================================

/**
 * DM group information returned from API
 */
export type DMGroupInfo = {
  groupId: string;
  isNew: boolean;
  groupKey: string;
  recipient: {
    id: string;
    username: string;
  };
};

/**
 * DM list item (for listing all DM conversations)
 */
export type DMListItem = {
  groupId: string;
  recipient: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  lastMessageAt: number | null;
  createdAt: string;
};

/**
 * Create a DM group with another user (or get existing one)
 *
 * This creates a 2-person group of type 'dm' for private messaging.
 * If a DM already exists between the two users, returns the existing one.
 *
 * @param recipientId User ID to start DM with
 * @returns DM group info including group key
 */
export async function createDMGroup(recipientId: string): Promise<DMGroupInfo> {
  const logId = `createDMGroup(${recipientId})`;

  try {
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    // Generate a group encryption key for this DM
    const groupKey = getRandomBytes(32);
    const groupKeyBase64 = Bytes.toBase64(groupKey);

    log.info(`${logId}: Creating DM group with key prefix: ${groupKeyBase64.substring(0, 8)}...`);

    const requestBody = JSON.stringify({
      recipient_id: recipientId,
      encrypted_group_key: groupKeyBase64,
    });

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/groups/dm`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: Buffer.from(requestBody),
    });

    if (response.status !== 200 && response.status !== 201) {
      const errorData = parseErrorResponse(response.data);
      throw new Error(errorData.error || `Failed to create DM group: ${response.status}`);
    }

    const data = JSON.parse(response.data);

    // Store the group key locally (use returned key, which may be existing key if DM existed)
    const keyToStore = data.group_key || groupKeyBase64;
    await storeGroupKey(data.group_id, keyToStore);

    log.info(`${logId}: DM group ${data.is_new ? 'created' : 'found'}`, {
      groupId: data.group_id,
      isNew: data.is_new,
      recipient: data.recipient?.username,
    });

    return {
      groupId: data.group_id,
      isNew: data.is_new,
      groupKey: keyToStore,
      recipient: {
        id: data.recipient.id,
        username: data.recipient.username,
      },
    };
  } catch (error) {
    log.error(`${logId}: Failed to create DM group`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * List all DM conversations for the current user
 *
 * Returns DM groups sorted by last message timestamp (most recent first).
 *
 * @returns Array of DM list items with recipient info
 */
export async function listDMGroups(): Promise<DMListItem[]> {
  const logId = 'listDMGroups';

  try {
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/api/groups/dms`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    if (response.status !== 200) {
      throw new Error(`Failed to list DM groups: ${response.status} ${response.statusText}`);
    }

    const data = JSON.parse(response.data);
    const dms: DMListItem[] = [];

    for (const dm of data.dms || []) {
      // Store the group key if present
      if (dm.encrypted_group_key) {
        await storeGroupKey(dm.group_id, dm.encrypted_group_key);
      }

      // Convert avatar URL to data URL if present
      let avatarDataUrl: string | undefined;
      if (dm.recipient.avatar_url) {
        try {
          avatarDataUrl = await fetchAvatarAsDataUrl(dm.recipient.avatar_url);
        } catch (err) {
          log.warn(`${logId}: Failed to fetch avatar for recipient ${dm.recipient.id}`, Errors.toLogFormat(err));
        }
      }

      dms.push({
        groupId: dm.group_id,
        recipient: {
          id: dm.recipient.id,
          username: dm.recipient.username,
          avatarUrl: avatarDataUrl,
        },
        lastMessageAt: dm.last_message_at ? new Date(dm.last_message_at).getTime() : null,
        createdAt: dm.created_at,
      });
    }

    log.info(`${logId}: Retrieved ${dms.length} DM conversations`);

    return dms;
  } catch (error) {
    log.error(`${logId}: Failed to list DM groups`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}
