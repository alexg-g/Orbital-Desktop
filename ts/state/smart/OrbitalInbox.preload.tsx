// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { memo } from 'react';
import { useSelector } from 'react-redux';
import { OrbitalInbox } from '../../components/orbital/OrbitalInbox';
import { getIntl } from '../selectors/user.std';
import { validateSession } from '../../services/orbitalAuth.preload.js';
import {
  listThreads,
  createThread,
  getReplies,
  createReply,
  syncOrbitHistory,
} from '../../services/orbitalThreads.preload.js';
import {
  listGroups,
  createGroup,
  joinGroup,
  setSelectedGroupId,
  getSelectedGroupId,
  getGroupMembers,
} from '../../services/orbitalGroups.preload.js';
import {
  getQuotaInfo,
  checkUploadAllowed,
  deleteMedia,
  formatBytes,
} from '../../services/orbitalQuota.preload.js';
import {
  downloadMediaFromOrbital,
  getMediaDownloadStatus,
  downloadAllPendingMedia as downloadAllPendingMediaService,
} from '../../services/orbitalMediaDownload.preload.js';
import { getAbsoluteAttachmentPath } from '../../util/migrations.preload.js';
import { uploadMediaToOrbital } from '../../services/orbitalMediaUpload.preload.js';
import {
  connect as wsConnect,
  disconnect as wsDisconnect,
  subscribe as wsSubscribe,
  isConnected as wsIsConnected,
  type WebSocketEvent,
} from '../../services/orbitalWebSocket.preload.js';
import {
  fetchMessages,
  sendMessage,
  decryptEnvelope,
  encryptEnvelope,
} from '../../services/orbitalSignalRelay.preload.js';

// Wrapper to match expected prop signature
async function getGroups() {
  const groups = await listGroups();
  return groups.map(g => ({
    groupId: g.groupId,
    name: g.name,
    memberCount: g.memberCount,
    encryptedName: g.encryptedName,
    createdAt: g.createdAt,
    isOwner: g.isOwner,
  }));
}

// Wrapper for downloadMedia to match expected signature
// Accepts options object with mediaId, onProgress, and signal
async function downloadMedia(params: {
  mediaId: string;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}): Promise<string> {
  return downloadMediaFromOrbital({
    mediaId: params.mediaId,
    onProgress: params.onProgress,
    signal: params.signal,
    getAbsoluteAttachmentPath,
  });
}

// Wrapper for uploadMedia to inject getAbsoluteAttachmentPath
async function uploadMedia(params: {
  attachment: any;
  groupId: string;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}) {
  const result = await uploadMediaToOrbital({
    ...params,
    getAbsoluteAttachmentPath,
  });
  return { mediaId: result.mediaId };
}

// Wrapper for getGroupMembers to return contacts format
async function getContacts(groupId: string) {
  const members = await getGroupMembers(groupId);
  return members.map(m => ({
    id: m.memberId,
    name: m.username,
    isOnline: false, // TODO: Add online status tracking
  }));
}

// Wrapper for chat messages - fetches from Signal relay
async function fetchChatMessagesWrapper(conversationId: string) {
  return fetchMessages({ conversationId });
}

// Wrapper for sending chat message - encrypts and sends via Signal relay
async function sendChatMessageWrapper(conversationId: string, text: string, mediaIds?: string[]) {
  // Encrypt message with group key using AES-256-GCM
  const { getUserId } = await import('../../services/orbitalAuth.preload.js');
  const userId = await getUserId() || 'unknown';
  const encryptedEnvelope = await encryptEnvelope(conversationId, text, userId, mediaIds);
  return sendMessage(conversationId, encryptedEnvelope);
}

// Wrapper for getMediaDownloadStatus to inject getAbsoluteAttachmentPath
// This enables file existence verification on disk
async function getMediaDownloadStatusWithPath(mediaId: string) {
  return getMediaDownloadStatus(mediaId, getAbsoluteAttachmentPath);
}

// Wrapper for downloadAllPendingMedia to match expected signature
async function downloadAllPendingMedia(options: {
  onProgress: (progress: number, current: number, total: number) => void;
  getAbsoluteAttachmentPath: (path: string) => string;
}) {
  const result = await downloadAllPendingMediaService({
    onProgress: options.onProgress,
    getAbsoluteAttachmentPath: options.getAbsoluteAttachmentPath,
    concurrency: 3,
  });
  return { successful: result.successful, failed: result.failed };
}

export const SmartOrbitalInbox = memo(function SmartOrbitalInbox(): JSX.Element {
  const i18n = useSelector(getIntl);

  // Use validateSession which checks token validity with backend
  // and auto-clears invalid tokens
  return (
    <OrbitalInbox
      i18n={i18n}
      isAuthenticated={validateSession}
      getGroups={getGroups}
      createGroup={createGroup}
      joinGroup={joinGroup}
      setSelectedGroupId={setSelectedGroupId}
      getSelectedGroupId={getSelectedGroupId}
      listThreads={listThreads}
      createThread={createThread}
      getReplies={getReplies}
      createReply={createReply}
      // Quota and media services (real APIs)
      getQuotaInfo={getQuotaInfo}
      checkUploadAllowed={checkUploadAllowed}
      formatBytes={formatBytes}
      uploadMedia={uploadMedia}
      downloadMedia={downloadMedia}
      getMediaDownloadStatus={getMediaDownloadStatusWithPath}
      deleteMedia={deleteMedia}
      getAbsoluteAttachmentPath={getAbsoluteAttachmentPath}
      // Contact picker (uses group members)
      getContacts={getContacts}
      // WebSocket for real-time updates
      wsConnect={wsConnect}
      wsDisconnect={wsDisconnect}
      wsSubscribe={wsSubscribe}
      wsIsConnected={wsIsConnected}
      // Chat/Signal relay
      fetchChatMessages={fetchChatMessagesWrapper}
      sendChatMessage={sendChatMessageWrapper}
      decodeChatEnvelope={decryptEnvelope}
      // Sync functions for orbit history (used when joining an orbit)
      syncOrbitHistory={syncOrbitHistory}
      downloadAllPendingMedia={downloadAllPendingMedia}
    />
  );
});
