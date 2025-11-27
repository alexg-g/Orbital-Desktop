// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Signal Relay Service
 *
 * Handles sending and receiving encrypted Signal Protocol message envelopes
 * via the Orbital relay server.
 *
 * The server acts as a relay and CANNOT decrypt message contents.
 * This service handles the HTTP transport layer.
 *
 * Note: Actual Signal Protocol encryption/decryption is handled elsewhere.
 * For MVP, messages are sent as-is with the expectation that proper
 * E2EE will be verified in Issue #49.
 */

import * as https from 'node:https';
import * as http from 'node:http';
import { URL } from 'node:url';
import { createLogger } from '../logging/log.std.js';
import * as Errors from '../types/errors.std.js';
import { handleOrbitalAPIError } from './orbitalErrorHandler.preload.js';
import { encryptAesGcm, decryptAesGcm, getRandomBytes } from '../Crypto.node.js';
import * as Bytes from '../Bytes.std.js';

const log = createLogger('OrbitalSignalRelay');

/**
 * Orbital API base URL
 */
const ORBITAL_API_URL = process.env.ORBITAL_API_URL || 'https://api.orbitl.org';

/**
 * Signal message structure from server
 */
export type SignalMessage = {
  messageId: string;
  conversationId: string;
  encryptedEnvelope: string; // Base64 encoded
  serverTimestamp: number;
  senderId?: string;
};

/**
 * Send message result
 */
export type SendMessageResult = {
  messageId: string;
  serverTimestamp: number;
};

/**
 * Fetch messages options
 */
export type FetchMessagesOptions = {
  conversationId?: string;
  since?: number;
  limit?: number;
};

/**
 * Fetch messages result
 */
export type FetchMessagesResult = {
  messages: SignalMessage[];
  hasMore: boolean;
};

/**
 * Send an encrypted message envelope
 *
 * @param conversationId Group/conversation ID
 * @param encryptedEnvelope Base64 encoded encrypted envelope
 * @returns Message ID and server timestamp
 */
export async function sendMessage(
  conversationId: string,
  encryptedEnvelope: string
): Promise<SendMessageResult> {
  const logId = `sendMessage(${conversationId})`;

  try {
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const requestBody = JSON.stringify({
      conversation_id: conversationId,
      encrypted_envelope: encryptedEnvelope,
      timestamp: Date.now(),
    });

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/v1/messages`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: Buffer.from(requestBody),
    });

    if (response.status !== 200) {
      throw new Error(`Failed to send message: ${response.status} ${response.statusText}: ${response.data}`);
    }

    const data = JSON.parse(response.data);

    log.info(`${logId}: Message sent successfully`, { messageId: data.message_id });

    return {
      messageId: data.message_id,
      serverTimestamp: data.server_timestamp,
    };
  } catch (error) {
    log.error(`${logId}: Failed to send message`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Fetch messages from relay server
 *
 * @param options Fetch options (conversationId, since timestamp, limit)
 * @returns Array of messages and whether more exist
 */
export async function fetchMessages(
  options: FetchMessagesOptions = {}
): Promise<FetchMessagesResult> {
  const { conversationId, since, limit = 100 } = options;
  const logId = 'fetchMessages';

  try {
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    // Build query string
    const params = new URLSearchParams();
    if (conversationId) {
      params.append('conversation_id', conversationId);
    }
    if (since !== undefined) {
      params.append('since', since.toString());
    }
    params.append('limit', limit.toString());

    const url = `${ORBITAL_API_URL}/v1/messages?${params.toString()}`;

    const response = await makeRequest({
      url,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch messages: ${response.status} ${response.statusText}: ${response.data}`);
    }

    const data = JSON.parse(response.data);

    const messages: SignalMessage[] = (data.messages || []).map((m: any) => ({
      messageId: m.message_id,
      conversationId: m.conversation_id,
      encryptedEnvelope: m.encrypted_envelope,
      serverTimestamp: m.server_timestamp,
    }));

    log.info(`${logId}: Fetched ${messages.length} messages`, {
      conversationId,
      hasMore: data.has_more,
    });

    return {
      messages,
      hasMore: data.has_more || false,
    };
  } catch (error) {
    log.error(`${logId}: Failed to fetch messages`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Delete a message
 *
 * @param messageId Message ID to delete
 */
export async function deleteMessage(messageId: string): Promise<void> {
  const logId = `deleteMessage(${messageId})`;

  try {
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/v1/messages/${messageId}`,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    if (response.status !== 204) {
      throw new Error(`Failed to delete message: ${response.status} ${response.statusText}: ${response.data}`);
    }

    log.info(`${logId}: Message deleted`);
  } catch (error) {
    log.error(`${logId}: Failed to delete message`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * Get message count for a conversation
 *
 * @param conversationId Conversation/group ID
 * @returns Message count
 */
export async function getMessageCount(conversationId: string): Promise<number> {
  const logId = `getMessageCount(${conversationId})`;

  try {
    const { getJWT } = await import('./orbitalAuth.preload.js');
    const jwtToken = await getJWT();

    if (!jwtToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const response = await makeRequest({
      url: `${ORBITAL_API_URL}/v1/conversations/${conversationId}/messages/count`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    if (response.status !== 200) {
      throw new Error(`Failed to get message count: ${response.status} ${response.statusText}: ${response.data}`);
    }

    const data = JSON.parse(response.data);

    log.info(`${logId}: Message count retrieved`, { count: data.message_count });

    return data.message_count;
  } catch (error) {
    log.error(`${logId}: Failed to get message count`, Errors.toLogFormat(error));
    await handleOrbitalAPIError(error);
    throw error;
  }
}

/**
 * AES-GCM IV length (12 bytes recommended for GCM)
 */
const AES_GCM_IV_LENGTH = 12;

/**
 * Encrypted envelope version (for future compatibility)
 */
const ENVELOPE_VERSION = 1;

/**
 * Get the group encryption key from SQLCipher storage
 */
async function getGroupKey(groupId: string): Promise<Uint8Array | null> {
  try {
    const { itemStorage } = await import('../textsecure/Storage.preload.js');
    const keys = itemStorage.get('orbitalGroupKeys');
    if (!keys || !keys[groupId]) {
      return null;
    }
    return Bytes.fromBase64(keys[groupId]);
  } catch (error) {
    log.error('Failed to get group key:', Errors.toLogFormat(error));
    return null;
  }
}

/**
 * Encrypt a message envelope using AES-256-GCM
 *
 * Uses the group's symmetric key stored in SQLCipher.
 * The encrypted envelope contains:
 * - v: version number for future compatibility
 * - iv: 12-byte initialization vector (base64)
 * - ct: ciphertext with authentication tag (base64)
 *
 * Security: Uses Additional Authenticated Data (AAD) to bind the encryption
 * to the group context, preventing cross-group message manipulation.
 *
 * @param groupId The group/orbit ID
 * @param text Plain text message
 * @param senderId Sender's user ID
 * @returns Base64 encoded encrypted envelope
 * @throws Error if no group key is found
 */
export async function encryptEnvelope(
  groupId: string,
  text: string,
  senderId: string
): Promise<string> {
  // Get the group key
  const groupKey = await getGroupKey(groupId);
  if (!groupKey) {
    log.error('encryptEnvelope: No group key found');
    throw new Error('No group key found. Cannot encrypt message.');
  }

  // Create the plaintext envelope
  const envelope = {
    type: 'text',
    body: text,
    sender: senderId,
    timestamp: Date.now(),
  };
  const plaintextBytes = Bytes.fromString(JSON.stringify(envelope));

  // Generate random IV (12 bytes is NIST recommendation for GCM)
  const iv = getRandomBytes(AES_GCM_IV_LENGTH);

  // Create AAD to bind encryption to group context
  // This prevents cross-group message replay attacks
  const aad = Bytes.fromString(groupId);

  // Encrypt with AES-256-GCM using AAD
  const ciphertext = encryptAesGcm(groupKey, iv, plaintextBytes, aad);

  // Create the encrypted envelope structure
  const encryptedEnvelope = {
    v: ENVELOPE_VERSION,
    iv: Bytes.toBase64(iv),
    ct: Bytes.toBase64(ciphertext),
  };

  return Bytes.toBase64(Bytes.fromString(JSON.stringify(encryptedEnvelope)));
}

/**
 * Decrypt a message envelope using AES-256-GCM
 *
 * Security: Uses Additional Authenticated Data (AAD) to verify the message
 * was encrypted for this specific group, preventing cross-group manipulation.
 *
 * @param groupId The group/orbit ID
 * @param base64Envelope Base64 encoded encrypted envelope
 * @returns Decoded message content or null if decryption fails
 */
export async function decryptEnvelope(
  groupId: string,
  base64Envelope: string
): Promise<{
  type: string;
  body: string;
  sender: string;
  timestamp: number;
} | null> {
  try {
    // Get the group key
    const groupKey = await getGroupKey(groupId);
    if (!groupKey) {
      log.warn('decryptEnvelope: No group key found');
      return null;
    }

    // Parse the outer base64 envelope
    const envelopeJson = Bytes.toString(Bytes.fromBase64(base64Envelope));
    const encryptedEnvelope = JSON.parse(envelopeJson);

    // Check version
    if (encryptedEnvelope.v !== ENVELOPE_VERSION) {
      log.warn('decryptEnvelope: Unknown envelope version:', encryptedEnvelope.v);
      // For forward compatibility, attempt to decrypt anyway
    }

    // Extract IV and ciphertext
    const iv = Bytes.fromBase64(encryptedEnvelope.iv);
    const ciphertext = Bytes.fromBase64(encryptedEnvelope.ct);

    // Create AAD to verify message was encrypted for this group
    const aad = Bytes.fromString(groupId);

    // Decrypt with AES-256-GCM using AAD
    // This will fail if the message was encrypted for a different group
    const plaintextBytes = decryptAesGcm(groupKey, iv, ciphertext, aad);
    const plaintextJson = Bytes.toString(plaintextBytes);

    return JSON.parse(plaintextJson);
  } catch (error) {
    // Don't log groupId in error messages to avoid information disclosure
    log.error('decryptEnvelope: Decryption failed:', Errors.toLogFormat(error));
    return null;
  }
}

// =============================================================================
// LEGACY FUNCTIONS (deprecated - kept for backwards compatibility during transition)
// =============================================================================

/**
 * @deprecated Use encryptEnvelope instead
 * Encode a text message as a simple envelope (UNENCRYPTED - for testing only)
 */
export function encodeSimpleEnvelope(text: string, senderId: string): string {
  log.warn('encodeSimpleEnvelope is deprecated - use encryptEnvelope for proper encryption');
  const envelope = {
    type: 'text',
    body: text,
    sender: senderId,
    timestamp: Date.now(),
  };
  return Buffer.from(JSON.stringify(envelope)).toString('base64');
}

/**
 * @deprecated Use decryptEnvelope instead
 * Decode a simple envelope (UNENCRYPTED - for testing only)
 */
export function decodeSimpleEnvelope(base64Envelope: string): {
  type: string;
  body: string;
  sender: string;
  timestamp: number;
} | null {
  log.warn('decodeSimpleEnvelope is deprecated - use decryptEnvelope for proper decryption');
  try {
    const json = Buffer.from(base64Envelope, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * HTTP request helper
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
