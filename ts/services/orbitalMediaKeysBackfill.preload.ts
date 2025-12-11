// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Media Keys Backfill Service
 *
 * Issue #79: Async peer-to-peer recovery for expired media.
 *
 * When a user joins/rejoins an orbit, they need the encryption keys for all
 * historic media to be able to decrypt it if they request a sync later.
 * This service handles the E2EE key exchange:
 *
 * Flow:
 * 1. New member joins orbit
 * 2. New member sends `orbital-media-keys-backfill-request` to group
 * 3. Existing members receive request and send their keys via direct message
 * 4. New member receives `orbital-media-keys-backfill-response` and saves keys
 *
 * Security:
 * - Keys ONLY transmitted via Signal Protocol E2EE (server never sees keys)
 * - Request sent to group, responses sent direct (1:1) to avoid duplicates
 * - Keys stored encrypted at rest in SQLCipher
 */

import { createLogger } from '../logging/log.std.js';
import * as Errors from '../types/errors.std.js';
import { DataWriter, DataReader } from '../sql/Client.preload.js';
import type {
  OrbitalMediaKeysBackfillRequest,
  OrbitalMediaKeysBackfillResponse,
} from '../types/OrbitalMediaSync.std.js';
import type { OrbitalMediaAttachment } from '../types/OrbitalMedia.std.js';

const log = createLogger('OrbitalMediaKeysBackfill');

/**
 * Request keys backfill from orbit members
 *
 * Called when a user joins/rejoins an orbit and needs historic media keys.
 * Sends a request to the group; existing members will respond with their keys.
 *
 * @param groupId The orbit/group ID to request keys for
 */
export async function requestKeysBackfill(groupId: string): Promise<void> {
  const logId = `requestKeysBackfill(${groupId})`;

  try {
    log.info(`${logId}: Requesting keys backfill from orbit members`);

    // Get the conversation for this group
    const conversation = window.ConversationController.get(groupId);
    if (!conversation) {
      throw new Error(`Group conversation not found: ${groupId}`);
    }

    // Get our user ID
    const ourConversation = window.ConversationController.getOurConversationOrThrow();
    const requestorId = ourConversation.id;

    // Build the backfill request
    const request: OrbitalMediaKeysBackfillRequest = {
      type: 'orbital-media-keys-backfill-request',
      groupId,
      requestorId,
      timestamp: Date.now(),
    };

    // Serialize to JSON for transmission
    const messageBody = JSON.stringify(request);

    // Send as a Signal Protocol encrypted group message
    await conversation.queueJob('requestKeysBackfill', async () => {
      await conversation.enqueueMessageForSend({
        body: messageBody,
        attachments: [],
        bodyRanges: [],
        previews: [],
        quote: undefined,
        sticker: undefined,
      });

      log.info(`${logId}: Keys backfill request sent`, {
        groupId,
      });
    });
  } catch (error) {
    log.error(`${logId}: Failed to request keys backfill`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Handle incoming keys backfill request
 *
 * Called when we receive a request from a new member for historic media keys.
 * We respond with all keys we have for media in this group.
 *
 * @param request The backfill request from the new member
 */
export async function handleKeysBackfillRequest(
  request: OrbitalMediaKeysBackfillRequest
): Promise<void> {
  const { groupId, requestorId, timestamp } = request;
  const logId = `handleKeysBackfillRequest(${groupId}, ${requestorId})`;

  try {
    log.info(`${logId}: Received keys backfill request`, { timestamp });

    // Don't respond to our own requests
    const ourConversation = window.ConversationController.getOurConversationOrThrow();
    if (requestorId === ourConversation.id) {
      log.info(`${logId}: Ignoring our own backfill request`);
      return;
    }

    // Get all media for this group
    const mediaKeys = await getMediaKeysForGroup(groupId);

    if (mediaKeys.length === 0) {
      log.info(`${logId}: No media keys to share for this group`);
      return;
    }

    log.info(`${logId}: Found ${mediaKeys.length} media keys to share`);

    // Send response directly to the requestor (not to group)
    await sendKeysBackfillResponse(requestorId, groupId, mediaKeys);
  } catch (error) {
    log.error(`${logId}: Failed to handle keys backfill request`, Errors.toLogFormat(error));
    // Don't rethrow - this is a best-effort operation
  }
}

/**
 * Send keys backfill response to a specific user
 *
 * Sends all our media keys for a group to the requestor via direct E2EE message.
 *
 * @param requestorId The user who requested keys
 * @param groupId The group these keys belong to
 * @param mediaKeys Array of media with keys to share
 */
async function sendKeysBackfillResponse(
  requestorId: string,
  groupId: string,
  mediaKeys: OrbitalMediaAttachment[]
): Promise<void> {
  const logId = `sendKeysBackfillResponse(${requestorId}, ${groupId})`;

  try {
    // Get the conversation for the requestor (direct 1:1 conversation)
    const requestorConversation = window.ConversationController.get(requestorId);
    if (!requestorConversation) {
      log.warn(`${logId}: Requestor conversation not found, skipping response`);
      return;
    }

    // Build the response with all keys
    const response: OrbitalMediaKeysBackfillResponse = {
      type: 'orbital-media-keys-backfill-response',
      groupId,
      keys: mediaKeys.map(media => ({
        mediaId: media.mediaId,
        threadId: media.threadId,
        attachmentKeys: media.attachmentKeys, // Already base64 string
        plaintextHash: media.plaintextHash,
        digest: media.digest,
        incrementalMac: media.incrementalMac,
        chunkSize: media.chunkSize,
        size: media.size,
        contentType: media.contentType,
        fileName: media.fileName,
        blurHash: media.blurHash,
        width: media.width,
        height: media.height,
        duration: media.duration,
        expiresAt: media.expiresAt,
        createdAt: media.createdAt,
        uploadedBy: media.uploadedBy ?? '',
      })),
      timestamp: Date.now(),
    };

    // Serialize to JSON
    const messageBody = JSON.stringify(response);

    // Send as direct E2EE message (not group message)
    await requestorConversation.queueJob('sendKeysBackfillResponse', async () => {
      await requestorConversation.enqueueMessageForSend({
        body: messageBody,
        attachments: [],
        bodyRanges: [],
        previews: [],
        quote: undefined,
        sticker: undefined,
      });

      log.info(`${logId}: Keys backfill response sent`, {
        keysCount: mediaKeys.length,
      });
    });
  } catch (error) {
    log.error(`${logId}: Failed to send keys backfill response`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Handle incoming keys backfill response
 *
 * Called when we receive media keys from an existing orbit member.
 * Saves the keys to SQLCipher for future use.
 *
 * @param response The backfill response containing keys
 */
export async function handleKeysBackfillResponse(
  response: OrbitalMediaKeysBackfillResponse
): Promise<void> {
  const { groupId, keys, timestamp } = response;
  const logId = `handleKeysBackfillResponse(${groupId})`;

  try {
    log.info(`${logId}: Received ${keys.length} media keys`, { timestamp });

    let savedCount = 0;
    let skippedCount = 0;

    // Process each key
    for (const key of keys) {
      try {
        // Check if we already have this media
        const existing = await DataReader.getOrbitalMedia(key.mediaId);
        if (existing) {
          log.debug(`${logId}: Skipping existing media ${key.mediaId}`);
          skippedCount++;
          continue;
        }

        // Generate a local UUID for this media record
        const { v4: generateUuid } = await import('uuid');
        const localId = generateUuid();

        // Save the media record with keys (not downloaded yet)
        await DataWriter.saveOrbitalMedia({
          id: localId,
          mediaId: key.mediaId,
          threadId: key.threadId,
          attachmentKeys: key.attachmentKeys,
          plaintextHash: key.plaintextHash,
          digest: key.digest,
          incrementalMac: key.incrementalMac,
          chunkSize: key.chunkSize,
          size: key.size,
          contentType: key.contentType as any,
          fileName: key.fileName,
          blurHash: key.blurHash,
          width: key.width,
          height: key.height,
          duration: key.duration,
          expiresAt: key.expiresAt,
          localPath: null, // Not downloaded yet
          downloaded: 0, // Mark as not downloaded
          createdAt: key.createdAt,
          caption: undefined,
          uploadedBy: key.uploadedBy,
        });

        savedCount++;
        log.debug(`${logId}: Saved media keys for ${key.mediaId}`);
      } catch (keyError) {
        log.warn(`${logId}: Failed to save key for ${key.mediaId}`, Errors.toLogFormat(keyError));
      }
    }

    log.info(`${logId}: Keys backfill complete`, {
      saved: savedCount,
      skipped: skippedCount,
      total: keys.length,
    });
  } catch (error) {
    log.error(`${logId}: Failed to handle keys backfill response`, Errors.toLogFormat(error));
    // Don't rethrow - this is a best-effort operation
  }
}

/**
 * Get all media keys for a group
 *
 * Retrieves all media records that belong to threads in the specified group.
 *
 * @param groupId The group ID to get media keys for
 * @returns Array of media attachments with their keys
 */
async function getMediaKeysForGroup(groupId: string): Promise<OrbitalMediaAttachment[]> {
  const logId = `getMediaKeysForGroup(${groupId})`;

  try {
    // First, get all threads for this group
    const threads = await DataReader.getOrbitalThreadsByGroupId(groupId);

    if (threads.length === 0) {
      log.info(`${logId}: No threads found for group`);
      return [];
    }

    log.debug(`${logId}: Found ${threads.length} threads`);

    // Collect all media from all threads
    const allMedia: OrbitalMediaAttachment[] = [];

    for (const thread of threads) {
      const threadMedia = await DataReader.getThreadMedia(thread.id);
      allMedia.push(...threadMedia);
    }

    log.info(`${logId}: Found ${allMedia.length} total media items across ${threads.length} threads`);

    return allMedia;
  } catch (error) {
    log.error(`${logId}: Failed to get media keys for group`, Errors.toLogFormat(error));
    throw error;
  }
}

/**
 * Validate a keys backfill request message
 *
 * @param message Unknown message object to validate
 * @returns True if valid OrbitalMediaKeysBackfillRequest
 */
export function isValidKeysBackfillRequest(message: unknown): message is OrbitalMediaKeysBackfillRequest {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as Partial<OrbitalMediaKeysBackfillRequest>;

  return (
    msg.type === 'orbital-media-keys-backfill-request' &&
    typeof msg.groupId === 'string' &&
    typeof msg.requestorId === 'string' &&
    typeof msg.timestamp === 'number'
  );
}

/**
 * Validate a keys backfill response message
 *
 * @param message Unknown message object to validate
 * @returns True if valid OrbitalMediaKeysBackfillResponse
 */
export function isValidKeysBackfillResponse(message: unknown): message is OrbitalMediaKeysBackfillResponse {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as Partial<OrbitalMediaKeysBackfillResponse>;

  return (
    msg.type === 'orbital-media-keys-backfill-response' &&
    typeof msg.groupId === 'string' &&
    Array.isArray(msg.keys) &&
    typeof msg.timestamp === 'number'
  );
}
