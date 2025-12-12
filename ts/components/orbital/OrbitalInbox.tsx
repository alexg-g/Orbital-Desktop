// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback, useEffect } from 'react';
import type { LocalizerType } from '../../types/Util.std';
import { OrbitalThreadList, type OrbitalThread } from './OrbitalThreadList';
import { OrbitalThreadDetail, type OrbitalMessageType } from './OrbitalThreadDetail';
import { OrbitalComposer, type UploadMediaFunction as ComposerUploadMediaFunction } from './OrbitalComposer';
import { OrbitalLogin } from './OrbitalLogin';
import { OrbitalChatList } from './OrbitalChatList';
import type { OrbitalChat, OrbitalUser } from './orbitalTypes';
import { ContactPickerModal } from './ContactPickerModal';
import { ChatsThreadsToggle } from '../ChatsThreadsToggle.dom';
import { DisplayMode, OrbitalSettingsPage } from '../../types/Nav.std';
import type { QuotaInfo } from '../../services/orbitalQuota.preload';
import { OrbitalSettings } from './OrbitalSettings';
import { OrbitalSettingsNav } from './OrbitalSettingsNav';
import type { UploadCheckResult } from './OrbitalComposer';
import { createMockDraftOperations, type DraftOperations } from './useDraft';
import { FunProvider } from '../fun/FunProvider.dom';
import { packs, recentStickers } from '../stickers/mocks.std';
import { MOCK_GIFS_PAGINATED_ONE_PAGE, MOCK_RECENT_EMOJIS } from '../fun/mocks.dom';
import { EmojiSkinTone } from '../fun/data/emojis.std';
import { TitlebarDragArea } from '../TitlebarDragArea.dom';
import { OrbitSelectorModal } from './OrbitSelectorModal';
import { CreateGroupModal } from './CreateGroupModal';
import { JoinGroupModal } from './JoinGroupModal';
import type { GroupInfo, CreateGroupResult, JoinGroupResult } from '../../services/orbitalGroups.preload.js';
import type {
  ThreadInfo,
  ReplyInfo,
  ListThreadsResult,
  ListRepliesResult,
  CreateThreadResult,
  CreateReplyResult,
} from '../../services/orbitalThreads.preload.js';
import { incrementThreadReplyCount, sendMediaSyncMessages } from '../../services/orbitalThreads.preload.js';
// Legacy localThreadStorage removed - threads now come only from server API
import { getCurrentUserProfile, migrateUserSettings, clearUserIdCache, setUserIdCache, getSetting } from './settingsStorage';
import {
  orbitalNotifications,
  type OrbitalNotificationSettings,
} from '../../services/orbitalNotifications.preload.js';
import {
  OrbitalPendingUploads,
  type PendingUploadRequest,
} from './OrbitalPendingUploads';
import type {
  MediaSyncRequestEvent,
  MediaSyncItemReadyEvent,
  MediaSyncAllReadyEvent,
} from '../../types/OrbitalMediaSync.std';
import { formatFileSize } from '../../util/formatFileSize.std';
import {
  getItemsNeededForRequest,
  uploadItemForSync,
  downloadSyncItem,
  downloadReadyItems,
} from '../../services/orbitalHistoricMediaSync.preload';

/**
 * Insert a new message into the correct position in a tree-ordered array.
 * Reddit-style: new message appears immediately after its parent and all parent's descendants.
 * If no parent (top-level), appends to end.
 */
function insertMessageInTreeOrder(
  messages: OrbitalMessageType[],
  newMessage: OrbitalMessageType
): OrbitalMessageType[] {
  // If no parent, append to end (top-level message)
  if (!newMessage.parentId) {
    return [...messages, newMessage];
  }

  // Find the parent's index
  const parentIndex = messages.findIndex(m => m.id === newMessage.parentId);
  if (parentIndex === -1) {
    // Parent not found, append to end as fallback
    return [...messages, newMessage];
  }

  // Find the insertion point: after parent and all descendants of parent
  // Walk forward from parent until we find a message at same or lower level than parent
  const parentLevel = messages[parentIndex].level;
  let insertIndex = parentIndex + 1;

  while (insertIndex < messages.length) {
    const msg = messages[insertIndex];
    // Stop when we reach a message at parent's level or higher (sibling or ancestor of parent)
    if (msg.level <= parentLevel) {
      break;
    }
    insertIndex++;
  }

  // Insert at the found position
  const result = [...messages];
  result.splice(insertIndex, 0, newMessage);
  return result;
}

// Browser-compatible type for authentication check
export type IsAuthenticatedFunction = () => Promise<boolean>;

// Orbit management types
export type GetGroupsFunction = () => Promise<GroupInfo[]>;
export type GetSelectedGroupIdFunction = () => Promise<string | null>;
export type SetSelectedGroupIdFunction = (groupId: string) => Promise<void>;

// Thread API types (dependency injection for testability)
export type ListThreadsFunction = (
  groupId: string,
  options?: { limit?: number; offset?: number; sort?: 'created_desc' | 'created_asc' }
) => Promise<ListThreadsResult>;

export type CreateThreadFunction = (
  groupId: string,
  title: string,
  body: string,
  mediaIds?: string[]
) => Promise<CreateThreadResult>;

export type GetRepliesFunction = (
  threadId: string,
  options?: { limit?: number; offset?: number }
) => Promise<ListRepliesResult>;

export type CreateReplyFunction = (
  threadId: string,
  body: string,
  mediaIds?: string[],
  parentReplyId?: string
) => Promise<CreateReplyResult>;

// Group API types
export type CreateGroupFunction = (name: string) => Promise<CreateGroupResult>;
export type JoinGroupFunction = (inviteCode: string) => Promise<JoinGroupResult>;

// Quota and media types
export type GetQuotaInfoFunction = (groupId: string) => Promise<QuotaInfo>;
export type CheckUploadAllowedFunction = (groupId: string, fileSizeBytes: number) => Promise<UploadCheckResult>;
export type FormatBytesFunction = (bytes: number) => string;
export type UploadMediaFunction = (params: {
  groupId: string;
  file: File;
  onProgress?: (progress: number) => void;
}) => Promise<{ mediaId: string }>;
export type DownloadMediaFunction = (mediaId: string) => Promise<string>;
export type GetMediaDownloadStatusFunction = (mediaId: string) => Promise<{
  isDownloaded: boolean;
  isAvailableOnServer: boolean;
  expiresAt: number;
  localPath: string | null;
}>;
export type DeleteMediaFunction = (mediaId: string) => Promise<void>;
export type GetAbsoluteAttachmentPathFunction = (relativePath: string) => string;
export type GetContactsFunction = (groupId: string) => Promise<OrbitalUser[]>;

// Sync types for orbit history
export type SyncOrbitHistoryFunction = (
  groupId: string,
  onProgress: (progress: { phase: string; current: number; total: number; percent: number }) => void
) => Promise<{ threadsAdded: number; totalThreads: number }>;
export type DownloadAllPendingMediaFunction = (options: {
  onProgress: (progress: number, current: number, total: number) => void;
  getAbsoluteAttachmentPath: (path: string) => string;
}) => Promise<{ successful: number; failed: number }>;

// WebSocket types
export type WebSocketConnectFunction = () => Promise<boolean>;
export type WebSocketDisconnectFunction = () => void;
export type WebSocketSubscribeFunction = (
  eventType: 'new_thread' | 'new_reply' | 'media_uploaded' | 'new_message' | 'member_left' | 'key_rotated' | 'media_sync_request' | 'media_sync_item_ready' | 'media_sync_all_ready' | 'all',
  callback: (event: any) => void
) => () => void;
export type WebSocketIsConnectedFunction = () => boolean;

// Chat/Signal relay types
export type FetchChatMessagesFunction = (conversationId: string) => Promise<{
  messages: Array<{
    messageId: string;
    conversationId: string;
    encryptedEnvelope: string;
    serverTimestamp: number;
  }>;
  hasMore: boolean;
}>;
export type SendChatMessageFunction = (conversationId: string, text: string, mediaIds?: string[]) => Promise<{
  messageId: string;
  serverTimestamp: number;
}>;
export type DecodeChatEnvelopeFunction = (groupId: string, base64: string) => Promise<{ type: string; body: string; sender: string; timestamp: number; mediaIds?: string[] } | null>;

export type OrbitalInboxProps = {
  i18n: LocalizerType;
  // Dependency injection for Node.js operations (allows Storybook mocking)
  isAuthenticated: IsAuthenticatedFunction;
  // Orbit management (injected for testability)
  getGroups?: GetGroupsFunction;
  createGroup?: CreateGroupFunction;
  joinGroup?: JoinGroupFunction;
  getSelectedGroupId?: GetSelectedGroupIdFunction;
  setSelectedGroupId?: SetSelectedGroupIdFunction;
  // Thread API operations (injected for testability)
  listThreads?: ListThreadsFunction;
  createThread?: CreateThreadFunction;
  getReplies?: GetRepliesFunction;
  createReply?: CreateReplyFunction;
  // Quota and media services (injected for real API or mocks)
  getQuotaInfo?: GetQuotaInfoFunction;
  checkUploadAllowed?: CheckUploadAllowedFunction;
  formatBytes?: FormatBytesFunction;
  uploadMedia?: UploadMediaFunction;
  downloadMedia?: DownloadMediaFunction;
  getMediaDownloadStatus?: GetMediaDownloadStatusFunction;
  deleteMedia?: DeleteMediaFunction;
  getAbsoluteAttachmentPath?: GetAbsoluteAttachmentPathFunction;
  // Contact picker
  getContacts?: GetContactsFunction;
  // WebSocket for real-time updates
  wsConnect?: WebSocketConnectFunction;
  wsDisconnect?: WebSocketDisconnectFunction;
  wsSubscribe?: WebSocketSubscribeFunction;
  wsIsConnected?: WebSocketIsConnectedFunction;
  // Chat/Signal relay
  fetchChatMessages?: FetchChatMessagesFunction;
  sendChatMessage?: SendChatMessageFunction;
  decodeChatEnvelope?: DecodeChatEnvelopeFunction;
  // Sync functions for orbit history (used when joining an orbit)
  syncOrbitHistory?: SyncOrbitHistoryFunction;
  downloadAllPendingMedia?: DownloadAllPendingMediaFunction;
};

/**
 * OrbitalInbox - Main Orbital application interface
 *
 * Layout:
 * - Left sidebar: Thread list
 * - Main content: Thread detail view
 *
 * Features:
 * - Orbital login integration
 * - Thread management
 * - Reddit-style threading
 * - 2000s forum aesthetic
 */
// Default functions for orbit management (used when no injection provided)
// Returns empty array - requires real backend injection for production use
const defaultGetGroups: GetGroupsFunction = async () => [];
const defaultGetSelectedGroupId: GetSelectedGroupIdFunction = async () => null;
const defaultSetSelectedGroupId: SetSelectedGroupIdFunction = async () => {};

// =============================================================================
// DATA MAPPING FUNCTIONS
// =============================================================================

/**
 * Map ThreadInfo from backend to OrbitalThread for UI
 * Backend returns encrypted_title/encrypted_body, but service decrypts them
 * For current user's posts, always use their current profile (phpBB style)
 */
function mapThreadInfoToOrbitalThread(
  thread: ThreadInfo,
  currentUserId: string | null,
  memberAvatars: Map<string, string>
): OrbitalThread {
  // For current user's posts, use current profile (phpBB style - profile updates reflect everywhere)
  const isCurrentUser = currentUserId !== null && thread.authorId === currentUserId;
  const currentProfile = isCurrentUser ? getCurrentUserProfile() : null;

  // Extract mediaIds from media info if available
  const mediaIds = thread.media?.map(m => m.mediaId);

  return {
    id: thread.threadId,
    orbitId: thread.groupId,
    title: thread.encryptedTitle, // Already decrypted by service
    body: thread.encryptedBody || '', // Original post content (decrypted by service)
    author: isCurrentUser ? currentProfile!.displayName : (thread.authorUsername || 'Unknown'),
    authorId: thread.authorId,
    timestamp: new Date(thread.createdAt).getTime(),
    replyCount: thread.replyCount,
    hasMedia: (thread.mediaCount || 0) > 0,
    hasVideo: false, // TODO: Parse from media metadata
    hasImage: (thread.mediaCount || 0) > 0,
    isUnread: false, // TODO: Track read status
    avatarUrl: isCurrentUser
      ? (currentProfile!.avatarUrl || undefined)
      : memberAvatars.get(thread.authorId) || undefined,
    mediaIds: mediaIds && mediaIds.length > 0 ? mediaIds : undefined,
  };
}

/**
 * Map ReplyInfo from backend to OrbitalMessageType for UI
 * Note: Avatar URL will be populated by phpBB-style profile transformation for current user
 *
 * Reddit-style threading:
 * - Level 0: Top-level reply to thread (no parent, white background)
 * - Level 1+: Nested reply to specific comment (indented, color-coded)
 */
function mapReplyInfoToOrbitalMessage(
  reply: ReplyInfo,
  memberAvatars: Map<string, string>
): OrbitalMessageType {
  const mediaIds = reply.media?.map(m => m.mediaId);
  return {
    id: reply.replyId,
    author: reply.authorUsername,
    authorId: reply.authorId,
    timestamp: new Date(reply.createdAt).getTime(),
    body: reply.encryptedBody, // Already decrypted by service
    level: reply.level ?? 0, // Use backend-provided level; 0 = top-level reply to thread
    parentId: reply.parentReplyId || undefined, // ID of parent reply (for "Replying to" context)
    hasMedia: (mediaIds && mediaIds.length > 0) || (reply.mediaCount || 0) > 0,
    mediaIds,
    avatarUrl: memberAvatars.get(reply.authorId) || undefined,
  };
}

/**
 * Apply current user profile to a message (phpBB style)
 * For messages from current user, always use their current profile
 */
function applyCurrentUserProfile(
  message: OrbitalMessageType,
  currentUserId: string | null
): OrbitalMessageType {
  if (!currentUserId || message.authorId !== currentUserId) {
    return message;
  }
  const currentProfile = getCurrentUserProfile();
  return {
    ...message,
    author: currentProfile.displayName,
    avatarUrl: currentProfile.avatarUrl || undefined,
  };
}

/**
 * Apply current user profile to an array of messages
 */
function applyCurrentUserProfileToMessages(
  messages: OrbitalMessageType[],
  currentUserId: string | null
): OrbitalMessageType[] {
  return messages.map(m => applyCurrentUserProfile(m, currentUserId));
}

// Legacy mapLocalThreadToOrbitalThread removed - no longer using local thread storage

// Default mock functions for Storybook/testing (used when no injection provided)
const defaultGetQuotaInfo: GetQuotaInfoFunction = async (groupId) => ({
  groupId,
  storageUsed: 0,
  storageLimit: 10 * 1024 * 1024 * 1024, // 10GB
  filesUsed: 0,
  filesLimit: 100,
  storagePercentUsed: 0,
  filesPercentUsed: 0,
  isNearLimit: false,
  canUpload: true,
});

const defaultCheckUploadAllowed: CheckUploadAllowedFunction = async (groupId, _fileSizeBytes) => ({
  allowed: true,
  reason: undefined,
  quotaInfo: await defaultGetQuotaInfo(groupId),
});

const defaultFormatBytes: FormatBytesFunction = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const defaultUploadMedia: UploadMediaFunction = async () => ({ mediaId: 'mock-id' });
const defaultDownloadMedia: DownloadMediaFunction = async () => '/mock/path';
const defaultGetMediaDownloadStatus: GetMediaDownloadStatusFunction = async () => ({
  isDownloaded: true,
  isAvailableOnServer: true,
  expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  localPath: '/mock/path',
});
const defaultDeleteMedia: DeleteMediaFunction = async () => {};
const defaultGetAbsoluteAttachmentPath: GetAbsoluteAttachmentPathFunction = (path) => path;
const defaultGetContacts: GetContactsFunction = async () => [];

// Default WebSocket functions (no-op for Storybook)
const defaultWsConnect: WebSocketConnectFunction = async () => false;
const defaultWsDisconnect: WebSocketDisconnectFunction = () => {};
const defaultWsSubscribe: WebSocketSubscribeFunction = () => () => {};
const defaultWsIsConnected: WebSocketIsConnectedFunction = () => false;

// Default chat functions (no-op for Storybook)
const defaultFetchChatMessages: FetchChatMessagesFunction = async () => ({ messages: [], hasMore: false });
const defaultSendChatMessage: SendChatMessageFunction = async () => ({ messageId: 'mock', serverTimestamp: Date.now() });
const defaultDecodeChatEnvelope: DecodeChatEnvelopeFunction = async () => null;

export function OrbitalInbox({
  i18n,
  isAuthenticated,
  getGroups = defaultGetGroups,
  createGroup,
  joinGroup,
  getSelectedGroupId = defaultGetSelectedGroupId,
  setSelectedGroupId = defaultSetSelectedGroupId,
  listThreads,
  createThread: createThreadAPI,
  getReplies,
  createReply: createReplyAPI,
  // Quota and media services with defaults for Storybook
  getQuotaInfo = defaultGetQuotaInfo,
  checkUploadAllowed = defaultCheckUploadAllowed,
  formatBytes = defaultFormatBytes,
  uploadMedia = defaultUploadMedia,
  downloadMedia = defaultDownloadMedia,
  getMediaDownloadStatus = defaultGetMediaDownloadStatus,
  deleteMedia = defaultDeleteMedia,
  getAbsoluteAttachmentPath = defaultGetAbsoluteAttachmentPath,
  getContacts = defaultGetContacts,
  // WebSocket for real-time updates
  wsConnect = defaultWsConnect,
  wsDisconnect = defaultWsDisconnect,
  wsSubscribe = defaultWsSubscribe,
  wsIsConnected: _wsIsConnected = defaultWsIsConnected,
  // Chat/Signal relay
  fetchChatMessages = defaultFetchChatMessages,
  sendChatMessage = defaultSendChatMessage,
  decodeChatEnvelope = defaultDecodeChatEnvelope,
  // Sync functions for orbit history
  syncOrbitHistory,
  downloadAllPendingMedia,
}: OrbitalInboxProps): JSX.Element {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [threads, setThreads] = useState<OrbitalThread[]>([]);
  const [chats, setChats] = useState<OrbitalChat[]>([]); // Global chats (orbit-agnostic)
  const [messages, setMessages] = useState<OrbitalMessageType[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);
  const [isSubmittingThread, setIsSubmittingThread] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Log loading states for debugging (TODO: Use for UI spinners/disabled states)
  useEffect(() => {
    if (isLoadingThreads) console.log('Loading threads...');
  }, [isLoadingThreads]);
  useEffect(() => {
    if (isLoadingReplies) console.log('Loading replies...');
  }, [isLoadingReplies]);
  useEffect(() => {
    if (isSubmittingThread) console.log('Submitting thread...');
  }, [isSubmittingThread]);
  useEffect(() => {
    if (isSubmittingReply) console.log('Submitting reply...');
  }, [isSubmittingReply]);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(DisplayMode.Threads);
  const [skinTone, setSkinTone] = useState<EmojiSkinTone>(EmojiSkinTone.None);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPage, setSettingsPage] = useState<OrbitalSettingsPage>(OrbitalSettingsPage.General);

  // Orbit selection state
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [selectedGroupId, setSelectedGroupIdState] = useState<string | null>(null);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [groupsError, setGroupsError] = useState<string | undefined>(undefined);
  const [showOrbitSelector, setShowOrbitSelector] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showJoinGroup, setShowJoinGroup] = useState(false);

  // Contact picker modal state
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [availableContacts, setAvailableContacts] = useState<OrbitalUser[]>([]);

  // Member avatar cache (maps userId -> avatarUrl)
  const [memberAvatars, setMemberAvatars] = useState<Map<string, string>>(new Map());

  // DM recipient avatar cache (maps recipientId -> avatarUrl)
  const [dmRecipientAvatars, setDmRecipientAvatars] = useState<Map<string, string>>(new Map());

  // Session caches for messages (persists user-posted messages during session)
  const [threadMessagesCache, setThreadMessagesCache] = useState<Record<string, OrbitalMessageType[]>>({});
  const [chatMessagesCache, setChatMessagesCache] = useState<Record<string, OrbitalMessageType[]>>({});

  // Current user identity (loaded dynamically from auth service)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Pending upload requests (from other users asking for media sync)
  const [pendingUploadRequests, setPendingUploadRequests] = useState<PendingUploadRequest[]>([]);
  const [showPendingUploads, setShowPendingUploads] = useState(true);

  // Check if user is logged in to Orbital
  useEffect(() => {
    async function checkLoginStatus() {
      try {
        const authenticated = await isAuthenticated();
        setIsLoggedIn(authenticated);
      } catch (err) {
        console.error('Failed to check Orbital login status:', err);
        setIsLoggedIn(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkLoginStatus();
  }, [isAuthenticated]);

  // Load current user identity after login
  useEffect(() => {
    if (!isLoggedIn) return;

    async function loadUserIdentity() {
      try {
        const { getUserId } = await import('../../services/orbitalAuth.preload.js');
        const userId = await getUserId();
        setCurrentUserId(userId);
        console.log('[OrbitalInbox] Loaded current user ID:', userId);

        // Set the userId cache in settingsStorage so it can scope settings properly
        if (userId) {
          setUserIdCache(userId);
          // Migrate settings from global keys to user-scoped keys
          // This preserves existing settings when upgrading to multi-user support
          await migrateUserSettings();
        }
      } catch (err) {
        console.error('[OrbitalInbox] Failed to load user ID:', err);
      }
    }

    loadUserIdentity();
  }, [isLoggedIn]);

  // Load groups and check for selected orbit after login
  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    async function loadGroupsAndCheckSelection() {
      setIsLoadingGroups(true);
      setGroupsError(undefined);

      try {
        // Load user's groups
        const userGroups = await getGroups();
        console.log('[OrbitalInbox] Loaded groups from API:', userGroups.map(g => ({ id: g.groupId, name: g.name })));
        setGroups(userGroups);

        // Check for previously selected group
        const savedGroupId = await getSelectedGroupId();
        console.log('[OrbitalInbox] Saved group ID:', savedGroupId);

        if (savedGroupId && userGroups.some(g => g.groupId === savedGroupId)) {
          // User has a valid saved selection - use it
          console.log('[OrbitalInbox] Using saved group ID (valid)');
          setSelectedGroupIdState(savedGroupId);
          setShowOrbitSelector(false);
        } else {
          // No saved selection or invalid - show orbit selector modal
          console.log('[OrbitalInbox] Saved group ID invalid or missing, showing orbit selector');
          setShowOrbitSelector(true);
        }
      } catch (err) {
        console.error('Failed to load groups:', err);
        setGroupsError('Failed to load your orbits. Please try again.');
      } finally {
        setIsLoadingGroups(false);
      }
    }

    loadGroupsAndCheckSelection();
  }, [isLoggedIn, getGroups, getSelectedGroupId]);

  // Fetch DM chats when logged in
  // Issue #75 fix: Load DM groups from backend instead of grouping messages by sender
  // DMs are now 2-person groups with their own conversation_id
  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    async function loadDMChats() {
      try {
        console.log('[OrbitalInbox] Loading DM groups from backend...');

        // Import DM functions
        const { listDMGroups } = await import('../../services/orbitalGroups.preload.js');

        // Load DM groups from backend (proper conversation architecture)
        const dmGroups = await listDMGroups();

        // Build avatar map from DM recipient data
        const avatarMap = new Map<string, string>();
        for (const dm of dmGroups) {
          if (dm.recipient.avatarUrl) {
            avatarMap.set(dm.recipient.id, dm.recipient.avatarUrl);
          }
        }
        setDmRecipientAvatars(avatarMap);

        // Convert DM groups to OrbitalChat format
        const dmChats: OrbitalChat[] = dmGroups.map(dm => ({
          id: dm.groupId,  // Use actual group_id as chat ID (= conversation_id)
          recipientId: dm.recipient.id,
          name: dm.recipient.username,  // Proper username from backend
          avatarUrl: dm.recipient.avatarUrl,  // Include avatar for chat list
          lastMessage: '',  // Will be populated when loading messages
          lastMessageTimestamp: dm.lastMessageAt || 0,
          unreadCount: 0,
        }));

        setChats(dmChats);
        console.log('[OrbitalInbox] Loaded', dmChats.length, 'DM conversations');

        // Load messages for each DM group into cache
        const newCache: Record<string, OrbitalMessageType[]> = {};

        for (const dm of dmGroups) {
          try {
            const result = await fetchChatMessages(dm.groupId);
            const messages: OrbitalMessageType[] = [];

            for (const msg of result.messages) {
              const decoded = await decodeChatEnvelope(dm.groupId, msg.encryptedEnvelope);
              if (!decoded) continue;

              // Determine author name - if sender is current user, use "You", else use recipient name
              const authorName = decoded.sender === currentUserId ? 'You' : dm.recipient.username;

              // Get avatar for the sender (recipient's avatar for non-self messages)
              const senderAvatarUrl = decoded.sender === currentUserId
                ? undefined  // Current user's avatar handled by applyCurrentUserProfile
                : dm.recipient.avatarUrl;

              messages.push({
                id: msg.messageId,
                author: authorName,
                authorId: decoded.sender,
                timestamp: decoded.timestamp,
                body: decoded.body,
                level: 0,
                hasMedia: !!(decoded.mediaIds && decoded.mediaIds.length > 0),
                mediaIds: decoded.mediaIds,
                avatarUrl: senderAvatarUrl,
              });
            }

            // Sort by timestamp ascending
            messages.sort((a, b) => a.timestamp - b.timestamp);
            newCache[dm.groupId] = messages;

            // Update chat's lastMessage from actual messages
            if (messages.length > 0) {
              const lastMsg = messages[messages.length - 1];
              setChats(prev => prev.map(chat =>
                chat.id === dm.groupId
                  ? { ...chat, lastMessage: lastMsg.body, lastMessageTimestamp: lastMsg.timestamp }
                  : chat
              ));
            }
          } catch (err) {
            console.warn('[OrbitalInbox] Failed to load messages for DM:', dm.groupId, err);
          }
        }

        setChatMessagesCache(prev => ({ ...prev, ...newCache }));
        console.log('[OrbitalInbox] Loaded messages for', Object.keys(newCache).length, 'DM conversations');

      } catch (err) {
        console.error('[OrbitalInbox] Failed to load DM chats:', err);
        setChats([]);
      }
    }

    loadDMChats();
  }, [isLoggedIn, currentUserId, fetchChatMessages, decodeChatEnvelope]);

  // Load contacts when logged in AND orbit selected (for Create Chat picker)
  // Contacts are group members from the selected orbit
  useEffect(() => {
    if (!isLoggedIn || !selectedGroupId) {
      setAvailableContacts([]);
      setMemberAvatars(new Map());
      return;
    }

    async function loadContacts() {
      try {
        // Load members from API (includes avatar URLs)
        const { getGroupMembers } = await import('../../services/orbitalGroups.preload.js');
        const members = await getGroupMembers(selectedGroupId!);

        // Build member avatar cache
        const avatarMap = new Map<string, string>();
        members.forEach(member => {
          if (member.avatarUrl) {
            avatarMap.set(member.memberId, member.avatarUrl);
          }
        });
        setMemberAvatars(avatarMap);
        console.log('[OrbitalInbox] Built avatar cache with', avatarMap.size, 'avatars');

        // Convert members to contacts for picker
        const contacts: OrbitalUser[] = members
          .filter(m => m.memberId !== currentUserId) // Filter out current user
          .map(m => ({
            id: m.memberId,
            name: m.username,
            avatarUrl: m.avatarUrl,
          }));

        setAvailableContacts(contacts);
        console.log('[OrbitalInbox] Loaded contacts:', contacts.length);
      } catch (err) {
        console.error('[OrbitalInbox] Failed to load contacts:', err);
        setAvailableContacts([]);
        setMemberAvatars(new Map());
      }
    }

    loadContacts();
  }, [isLoggedIn, selectedGroupId, currentUserId]);

  // WebSocket connection and real-time event handling
  useEffect(() => {
    if (!isLoggedIn) {
      // Disconnect when logged out
      wsDisconnect();
      return;
    }

    // Connect to WebSocket when logged in
    console.log('[OrbitalInbox] Connecting to WebSocket...');
    wsConnect().then(success => {
      if (success) {
        console.log('[OrbitalInbox] WebSocket connected');
      } else {
        console.warn('[OrbitalInbox] WebSocket connection failed');
      }
    });

    // Subscribe to real-time events
    const unsubNewThread = wsSubscribe('new_thread', (event) => {
      console.log('[OrbitalInbox] Received new_thread event:', event);
      const data = event.data;
      // Only add if it's for the current group and not already in list
      if (data.group_id === selectedGroupId) {
        setThreads(prevThreads => {
          // Check if thread already exists
          if (prevThreads.some(t => t.id === data.thread_id)) {
            return prevThreads;
          }
          // Add new thread at the top
          const newThread: OrbitalThread = {
            id: data.thread_id,
            orbitId: data.group_id,
            title: data.encrypted_title || 'New Thread',
            body: data.encrypted_body || '',
            author: data.author_name || 'Unknown',
            authorId: data.author_id || 'unknown',
            timestamp: new Date(data.created_at).getTime(),
            replyCount: 0,
            hasMedia: false,
            hasVideo: false,
            hasImage: false,
            isUnread: true,
          };
          return [newThread, ...prevThreads];
        });

        // Show desktop notification for new thread (if not from current user)
        if (data.author_id !== currentUserId) {
          const currentGroup = groups.find(g => g.groupId === data.group_id);
          orbitalNotifications.notifyNewThread({
            threadId: data.thread_id,
            orbitId: data.group_id,
            title: data.encrypted_title || 'New Thread',
            authorName: data.author_name || 'Someone',
            orbitName: currentGroup?.name,
          });
        }
      }
    });

    const unsubNewReply = wsSubscribe('new_reply', async (event) => {
      console.log('[OrbitalInbox] Received new_reply event:', event);
      const data = event.data;

      // Get the thread title for notification (capture before state update)
      let threadTitle = 'Thread';
      setThreads(prevThreads => {
        const thread = prevThreads.find(t => t.id === data.thread_id);
        if (thread) {
          threadTitle = thread.title;
        }
        // Update reply count for the thread (UI state)
        return prevThreads.map(t =>
          t.id === data.thread_id
            ? { ...t, replyCount: (t.replyCount || 0) + 1 }
            : t
        );
      });

      // Persist reply count to SQLCipher so it survives orbit switches/refreshes
      try {
        await incrementThreadReplyCount(data.thread_id, new Date(data.created_at).getTime());
      } catch (error) {
        console.error('[OrbitalInbox] Failed to persist reply count to SQLCipher:', error);
      }

      // If viewing this thread, add the reply to messages
      if (activeThreadId === data.thread_id) {
        setMessages(prevMessages => {
          // Check if reply already exists
          if (prevMessages.some(m => m.id === data.reply_id)) {
            return prevMessages;
          }

          // Calculate level from parent (0 = top-level, parent.level + 1 for nested)
          let level = 0;
          if (data.parent_reply_id) {
            const parentMessage = prevMessages.find(m => m.id === data.parent_reply_id);
            if (parentMessage) {
              level = parentMessage.level + 1;
            }
          }

          const newReply: OrbitalMessageType = {
            id: data.reply_id,
            author: data.author_name || 'Unknown',
            authorId: data.author_id || 'unknown',
            timestamp: new Date(data.created_at).getTime(),
            body: data.encrypted_body || '',
            level,
            parentId: data.parent_reply_id || undefined,
            hasMedia: false,
          };

          // Insert in tree order (after parent and its descendants)
          return insertMessageInTreeOrder(prevMessages, newReply);
        });
      }

      // Show desktop notification for new reply (if not from current user)
      if (data.author_id !== currentUserId) {
        orbitalNotifications.notifyNewReply({
          threadId: data.thread_id,
          orbitId: data.group_id || selectedGroupId || '',
          threadTitle,
          authorName: data.author_name || 'Someone',
          replyPreview: data.encrypted_body?.substring(0, 50),
        });
      }
    });

    const unsubMediaUploaded = wsSubscribe('media_uploaded', async (event) => {
      console.log('[OrbitalInbox] Received media_uploaded event:', event);
      const data = event.data;

      // Extract media_id from the event
      const mediaId = data?.media_id;
      if (!mediaId) {
        console.warn('[OrbitalInbox] media_uploaded event missing media_id');
        return;
      }

      // Check if we already have this media in our local database
      // (keys would have arrived via Signal Protocol OrbitalMediaSyncMessage)
      try {
        const status = await getMediaDownloadStatus(mediaId);

        if (status.isDownloaded) {
          console.log('[OrbitalInbox] Media already downloaded:', mediaId);
          return;
        }

        // Media exists in DB but not downloaded yet - trigger download
        if (status.isAvailableOnServer) {
          console.log('[OrbitalInbox] Auto-downloading new media:', mediaId);
          try {
            await downloadMedia({ mediaId });
            console.log('[OrbitalInbox] Auto-download complete:', mediaId);
          } catch (downloadError) {
            console.error('[OrbitalInbox] Auto-download failed:', mediaId, downloadError);
            // Don't throw - download will be retried later via manual sync
          }
        }
      } catch (error) {
        // Media not in local DB yet - keys haven't arrived via Signal Protocol
        // Download will happen when OrbitalMediaSyncMessage is processed
        console.log('[OrbitalInbox] Media not in local DB yet, will download when keys arrive:', mediaId);
      }
    });

    // Handle incoming chat messages from Signal relay
    // Issue #75 fix: Use conversation_id (DM group_id) for proper chat lookup
    const unsubNewMessage = wsSubscribe('new_message', async (event) => {
      console.log('[OrbitalInbox] Received new_message event:', event);
      const data = event.data;

      // Get the conversation_id (DM group_id) for decryption and chat lookup
      const conversationId = data.conversation_id;
      if (!conversationId) {
        console.warn('[OrbitalInbox] No conversation_id in message');
        return;
      }

      // Decrypt the message envelope with group key
      const decoded = await decodeChatEnvelope(conversationId, data.encrypted_envelope);
      if (!decoded) {
        console.warn('[OrbitalInbox] Failed to decrypt message envelope');
        return;
      }

      // Skip messages from self (already handled optimistically)
      if (decoded.sender === currentUserId) {
        console.log('[OrbitalInbox] Skipping own message (already displayed)');
        return;
      }

      // Find the DM chat by conversation_id (which is now the DM group_id)
      const existingChat = chats.find(c => c.id === conversationId);

      // Get sender name from existing chat or fallback
      const senderName = existingChat?.name || decoded.sender;

      // Create message object for UI
      const newChatMessage: OrbitalMessageType = {
        id: data.message_id,
        author: senderName,
        authorId: decoded.sender,
        timestamp: decoded.timestamp,
        body: decoded.body,
        level: 0,
        hasMedia: !!(decoded.mediaIds && decoded.mediaIds.length > 0),
        mediaIds: decoded.mediaIds,
        avatarUrl: dmRecipientAvatars.get(decoded.sender),
      };

      // Update chat list using conversation_id
      setChats(prevChats => {
        const existingChatIndex = prevChats.findIndex(c => c.id === conversationId);

        if (existingChatIndex >= 0) {
          // Update existing chat's last message
          const updatedChats = [...prevChats];
          const chat = updatedChats[existingChatIndex];
          updatedChats[existingChatIndex] = {
            ...chat,
            lastMessage: decoded.body,
            lastMessageTimestamp: decoded.timestamp,
            unreadCount: activeChatId === chat.id ? 0 : (chat.unreadCount || 0) + 1,
          };
          return updatedChats;
        } else {
          // New DM from unknown conversation - reload DM list to get proper info
          console.log('[OrbitalInbox] New message from unknown DM, will refresh on next load');
          // For now, create a placeholder entry
          const newChat: OrbitalChat = {
            id: conversationId,
            recipientId: decoded.sender,
            name: decoded.sender, // Will be refreshed on next DM list load
            lastMessage: decoded.body,
            lastMessageTimestamp: decoded.timestamp,
            unreadCount: 1,
          };
          return [newChat, ...prevChats];
        }
      });

      // If viewing this conversation, add message to display
      if (activeChatId === conversationId) {
        setChatMessages(prevMessages => {
          // Check if message already exists
          if (prevMessages.some(m => m.id === data.message_id)) {
            return prevMessages;
          }
          return [...prevMessages, newChatMessage];
        });

        // Update cache
        setChatMessagesCache(prev => ({
          ...prev,
          [conversationId]: [...(prev[conversationId] || []), newChatMessage]
        }));
      } else {
        // Update cache even if not viewing (for when user switches to this chat)
        setChatMessagesCache(prev => ({
          ...prev,
          [conversationId]: [...(prev[conversationId] || []), newChatMessage]
        }));

        // Show desktop notification for new DM (only if not viewing the chat)
        orbitalNotifications.notifyNewMessage({
          conversationId,
          authorName: senderName,
          messagePreview: decoded.body?.substring(0, 50),
        });
      }
    });

    // Handle media sync request from another user
    // This means someone is requesting historic media that we might have locally
    const unsubMediaSyncRequest = wsSubscribe('media_sync_request', async (event) => {
      console.log('[OrbitalInbox] Received media_sync_request event:', event);
      const data = event.data as MediaSyncRequestEvent;

      // Skip requests we made ourselves
      if (data.requestor_id === currentUserId) {
        console.log('[OrbitalInbox] Ignoring our own sync request');
        return;
      }

      // Only show for requests from groups we're currently viewing or are members of
      const requestGroup = groups.find(g => g.groupId === data.group_id);
      if (!requestGroup) {
        console.log('[OrbitalInbox] Sync request for group we are not a member of');
        return;
      }

      // Query local DB to find what media we can provide for this request
      // Only show notification if we actually have files to share
      let itemsWeCanProvide;
      try {
        itemsWeCanProvide = await getItemsNeededForRequest(data.request_id);
      } catch (error) {
        console.error('[OrbitalInbox] Failed to query local media for sync request:', error);
        return;
      }

      if (itemsWeCanProvide.length === 0) {
        console.log('[OrbitalInbox] No local media to provide for sync request:', data.request_id);
        return;
      }

      // Calculate actual bytes from items we have locally
      const localTotalBytes = itemsWeCanProvide.reduce((sum, item) => sum + item.sizeBytes, 0);

      // Find requestor name from available contacts
      const requestor = availableContacts.find(c => c.id === data.requestor_id);
      const requestorName = requestor?.name || 'An orbit member';

      // Add to pending upload requests with accurate local counts
      const newRequest: PendingUploadRequest = {
        requestId: data.request_id,
        requestorName,
        groupName: requestGroup.name,
        itemsCount: itemsWeCanProvide.length,  // Actual count from local DB
        totalBytes: localTotalBytes,            // Actual bytes from local DB
        receivedAt: data.timestamp,
        expiresAt: data.timestamp + (7 * 24 * 60 * 60 * 1000), // 7 days from now
      };

      setPendingUploadRequests(prev => {
        // Don't add duplicates
        if (prev.some(r => r.requestId === data.request_id)) {
          return prev;
        }
        return [...prev, newRequest];
      });

      // Show the pending uploads banner
      setShowPendingUploads(true);

      console.log('[OrbitalInbox] Added pending upload request:', newRequest.requestId);
    });

    // Handle media sync item ready (for requestors - when someone uploads media we requested)
    const unsubMediaSyncItemReady = wsSubscribe('media_sync_item_ready', async (event) => {
      console.log('[OrbitalInbox] Received media_sync_item_ready event:', event);
      const data = event.data as MediaSyncItemReadyEvent;

      console.log('[OrbitalInbox] Media sync item ready:', data.item_id, 'from', data.uploaded_by);

      // Auto-download the ready item
      try {
        await downloadSyncItem({
          itemId: data.item_id,
          mediaId: data.media_id,
          getAbsoluteAttachmentPath,
        });
        console.log('[OrbitalInbox] Successfully downloaded sync item:', data.item_id);
      } catch (downloadError) {
        console.error('[OrbitalInbox] Failed to download sync item:', data.item_id, downloadError);
      }
    });

    // Handle media sync all ready (for requestors - when all items have been uploaded)
    const unsubMediaSyncAllReady = wsSubscribe('media_sync_all_ready', async (event) => {
      console.log('[OrbitalInbox] Received media_sync_all_ready event:', event);
      const data = event.data as MediaSyncAllReadyEvent;

      console.log('[OrbitalInbox] All media sync items ready for request:', data.request_id);

      // Download all ready items for this request
      try {
        await downloadReadyItems(data.request_id);
        console.log('[OrbitalInbox] Successfully downloaded all ready items for request:', data.request_id);
      } catch (downloadError) {
        console.error('[OrbitalInbox] Failed to download ready items for request:', data.request_id, downloadError);
      }
    });

    // Cleanup on unmount or when deps change
    return () => {
      console.log('[OrbitalInbox] Unsubscribing from WebSocket events');
      unsubNewThread();
      unsubNewReply();
      unsubMediaUploaded();
      unsubNewMessage();
      unsubMediaSyncRequest();
      unsubMediaSyncItemReady();
      unsubMediaSyncAllReady();
    };
  }, [isLoggedIn, selectedGroupId, activeThreadId, activeChatId, chats, currentUserId, availableContacts, wsConnect, wsDisconnect, wsSubscribe, decodeChatEnvelope, groups]);

  // Fetch threads when logged in AND orbit is selected (orbit-specific)
  useEffect(() => {
    if (!isLoggedIn || !selectedGroupId) {
      return;
    }

    // Capture the value for use in async function (TypeScript narrowing)
    const groupId = selectedGroupId;

    async function fetchThreads() {
      setIsLoadingThreads(true);
      console.log('[OrbitalInbox] Fetching threads for groupId:', groupId);
      try {
        if (listThreads) {
          const result = await listThreads(groupId, {
            limit: 50,
            sort: 'created_desc',
          });
          console.log('[OrbitalInbox] Server returned', result.threads.length, 'threads');
          const threads = result.threads.map(t => mapThreadInfoToOrbitalThread(t, currentUserId, memberAvatars));
          setThreads(threads);
        } else {
          console.log('[OrbitalInbox] No listThreads API available');
          setThreads([]);
        }
      } catch (err) {
        console.error('[OrbitalInbox] Failed to fetch threads:', err);
        setThreads([]);
      } finally {
        setIsLoadingThreads(false);
      }
    }

    fetchThreads();
  }, [isLoggedIn, selectedGroupId, listThreads, currentUserId, memberAvatars]);

  const handleThreadClick = useCallback(async (threadId: string) => {
    setActiveThreadId(threadId);
    setActiveChatId(null); // Clear chat selection when selecting a thread
    setIsCreatingThread(false); // Cancel create mode when selecting a thread

    // Find the thread to get original post data
    const thread = threads.find(t => t.id === threadId);

    // Load replies from API or cache
    setIsLoadingReplies(true);
    try {
      // Check cache first
      const cachedMessages = threadMessagesCache[threadId];
      if (cachedMessages) {
        setMessages([...cachedMessages]);
        setIsLoadingReplies(false);
        return;
      }

      if (getReplies) {
        // Use real API
        const result = await getReplies(threadId, { limit: 100 });
        const mappedReplies = result.replies.map(r => mapReplyInfoToOrbitalMessage(r, memberAvatars));

        // Extract thread-level mediaIds from the API response (for persistence after logout/login)
        const threadMediaIds = result.media?.map(m => m.mediaId);

        // Create original post message from thread data
        const allMessages: OrbitalMessageType[] = [];
        if (thread && thread.body) {
          const originalPost: OrbitalMessageType = {
            id: `${threadId}-op`, // Unique ID for original post
            author: thread.author,
            authorId: thread.authorId,
            timestamp: thread.timestamp,
            body: thread.body,
            level: 0, // Original post is level 0
            hasMedia: !!(thread.hasMedia || (threadMediaIds && threadMediaIds.length > 0)),
            // Use mediaIds from API response (persists after logout/login) or fallback to thread cache
            mediaIds: threadMediaIds && threadMediaIds.length > 0 ? threadMediaIds : thread.mediaIds,
            avatarUrl: thread.avatarUrl,
          };
          allMessages.push(originalPost);
        }
        allMessages.push(...mappedReplies);

        setMessages(allMessages);
        // Cache the results
        setThreadMessagesCache(prev => ({ ...prev, [threadId]: allMessages }));
      } else {
        // No API available - show original post only
        if (thread && thread.body) {
          const originalPost: OrbitalMessageType = {
            id: `${threadId}-op`,
            author: thread.author,
            authorId: thread.authorId,
            timestamp: thread.timestamp,
            body: thread.body,
            level: 0,
            hasMedia: thread.hasMedia,
            mediaIds: thread.mediaIds,
            avatarUrl: thread.avatarUrl,
          };
          setMessages([originalPost]);
          setThreadMessagesCache(prev => ({ ...prev, [threadId]: [originalPost] }));
        } else {
          setMessages([]);
          setThreadMessagesCache(prev => ({ ...prev, [threadId]: [] }));
        }
      }
    } catch (err) {
      console.error('Failed to load replies:', err);
      // On error, still show the original post from local thread data
      const thread = threads.find(t => t.id === threadId);
      if (thread && thread.body) {
        const originalPost: OrbitalMessageType = {
          id: `${threadId}-op`,
          author: thread.author,
          authorId: thread.authorId,
          timestamp: thread.timestamp,
          body: thread.body,
          level: 0,
          hasMedia: thread.hasMedia,
          mediaIds: thread.mediaIds,
          avatarUrl: thread.avatarUrl,
        };
        setMessages([originalPost]);
        setThreadMessagesCache(prev => ({ ...prev, [threadId]: [originalPost] }));
      } else {
        setMessages([]);
      }
    } finally {
      setIsLoadingReplies(false);
    }
  }, [threadMessagesCache, getReplies, threads, memberAvatars]);

  const handleCreateThread = useCallback(() => {
    setActiveThreadId(null); // Deselect any active thread
    setIsCreatingThread(true);
  }, []);

  const handleCancelCreateThread = useCallback(() => {
    setIsCreatingThread(false);
  }, []);

  const handleCreateChat = useCallback(() => {
    setShowContactPicker(true);
  }, []);

  // Handle contact selection from picker
  // Issue #75 fix: Use createDMGroup() to create proper DM groups
  const handleSelectContacts = useCallback(async (contactIds: string[], groupName?: string) => {
    setShowContactPicker(false);

    if (contactIds.length === 1) {
      // 1:1 DM - check for existing chat in current state first
      const recipientId = contactIds[0];
      const existingChat = chats.find(c => c.recipientId === recipientId);

      if (existingChat) {
        // Open existing chat
        setActiveChatId(existingChat.id);
        setActiveThreadId(null);
        const cachedMessages = chatMessagesCache[existingChat.id];
        if (cachedMessages) {
          setChatMessages([...cachedMessages]);
        } else {
          setChatMessages([]);
          setChatMessagesCache(prev => ({ ...prev, [existingChat.id]: [] }));
        }
      } else {
        // Create new DM group via backend (Issue #75 fix)
        try {
          console.log('[OrbitalInbox] Creating DM group for recipient:', recipientId);
          const { createDMGroup } = await import('../../services/orbitalGroups.preload.js');
          const dmResult = await createDMGroup(recipientId);

          console.log('[OrbitalInbox] DM group created/found:', dmResult.groupId, 'isNew:', dmResult.isNew);

          // Create chat object with proper group_id
          const newChat: OrbitalChat = {
            id: dmResult.groupId,  // Use actual group_id as chat ID
            recipientId: dmResult.recipient.id,
            name: dmResult.recipient.username,
            lastMessage: '',
            lastMessageTimestamp: Date.now(),
            unreadCount: 0,
          };

          // Add to chats if it's new, otherwise it might already be there
          setChats(prev => {
            const exists = prev.some(c => c.id === dmResult.groupId);
            if (exists) return prev;
            return [newChat, ...prev];
          });

          setActiveChatId(newChat.id);
          setActiveThreadId(null);
          setChatMessages([]);
          setChatMessagesCache(prev => ({ ...prev, [newChat.id]: [] }));

        } catch (err) {
          console.error('[OrbitalInbox] Failed to create DM group:', err);
          // Fallback: show error to user
          alert('Failed to start conversation. Please try again.');
        }
      }
    } else if (contactIds.length > 1) {
      // Group chat - for now, log that this isn't supported yet
      console.warn('[OrbitalInbox] Multi-person group chats not yet supported');
      alert('Group chats are not yet supported. Please select one contact for a direct message.');
    }
  }, [chats, chatMessagesCache]);

  const handleSettingsClick = useCallback(() => {
    setShowSettings(true);
    setActiveThreadId(null);
    setActiveChatId(null);
    setIsCreatingThread(false);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  const handleSettingsPageChange = useCallback((page: OrbitalSettingsPage) => {
    setSettingsPage(page);
  }, []);

  const handleSubmitNewThread = useCallback(async (title: string, body: string, mediaIds: string[]) => {
    console.log('[OrbitalInbox] handleSubmitNewThread called, selectedGroupId:', selectedGroupId);
    if (!selectedGroupId) {
      console.error('[OrbitalInbox] No orbit selected - selectedGroupId is:', selectedGroupId);
      return;
    }

    // Get current user profile for display name and avatar
    const userProfile = getCurrentUserProfile();

    setIsSubmittingThread(true);
    try {
      if (createThreadAPI) {
        // Use real API
        const result = await createThreadAPI(selectedGroupId, title, body, mediaIds);

        // Create new thread object for UI
        const newThread: OrbitalThread = {
          id: result.threadId,
          orbitId: result.groupId,
          title,
          body, // Store the original post body
          author: userProfile.displayName,
          authorId: currentUserId || 'unknown',
          timestamp: new Date(result.createdAt).getTime(),
          replyCount: 0,
          hasMedia: mediaIds.length > 0,
          hasVideo: false,
          hasImage: mediaIds.length > 0,
          isUnread: false,
          avatarUrl: userProfile.avatarUrl || undefined,
          mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
        };

        // Add to threads list at the top
        setThreads(prev => [newThread, ...prev]);

        // Exit create mode and select the new thread
        setIsCreatingThread(false);
        setActiveThreadId(result.threadId);
        setActiveChatId(null);

        // Create the original post message for display
        const originalPost: OrbitalMessageType = {
          id: `${result.threadId}-op`,
          author: userProfile.displayName,
          authorId: currentUserId || 'unknown',
          timestamp: new Date(result.createdAt).getTime(),
          body,
          level: 0,
          hasMedia: mediaIds.length > 0,
          mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
          avatarUrl: userProfile.avatarUrl || undefined,
        };
        setMessages([originalPost]);
        setThreadMessagesCache(prev => ({ ...prev, [result.threadId]: [originalPost] }));

        console.log('Thread created successfully:', result.threadId);
      } else {
        // Fallback to mock behavior
        const threadId = `thread-${Date.now()}`;
        const messageId = `message-${Date.now()}`;

        const newThread: OrbitalThread = {
          id: threadId,
          orbitId: selectedGroupId || '',
          title,
          body, // Store the original post body
          author: userProfile.displayName,
          authorId: currentUserId || 'unknown',
          timestamp: Date.now(),
          replyCount: 0,
          hasMedia: mediaIds.length > 0,
          hasVideo: false,
          hasImage: mediaIds.length > 0,
          isUnread: false,
          avatarUrl: userProfile.avatarUrl || undefined,
          mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
        };

        const rootMessage: OrbitalMessageType = {
          id: messageId,
          author: userProfile.displayName,
          authorId: currentUserId || 'unknown',
          timestamp: Date.now(),
          body,
          level: 0,
          hasMedia: mediaIds.length > 0,
          mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
          avatarUrl: userProfile.avatarUrl || undefined,
        };

        setThreads(prev => [newThread, ...prev]);
        setIsCreatingThread(false);
        setActiveThreadId(threadId);
        setActiveChatId(null);
        setMessages([rootMessage]);
        setThreadMessagesCache(prev => ({ ...prev, [threadId]: [rootMessage] }));
      }
    } catch (err) {
      console.error('Failed to create thread:', err);
      // TODO: Show error message to user
    } finally {
      setIsSubmittingThread(false);
    }
  }, [selectedGroupId, createThreadAPI]);

  const handleSendMessage = useCallback(async (body: string, mediaIds: string[], parentReplyId?: string) => {
    if (!activeThreadId) {
      return;
    }

    // Get current user profile for display name and avatar
    const userProfile = getCurrentUserProfile();

    // Calculate the level based on parent message
    // Level 0 = top-level reply (no parent)
    // Level 1+ = nested reply (parent level + 1)
    let level = 0;
    if (parentReplyId) {
      const parentMessage = messages.find(m => m.id === parentReplyId);
      if (parentMessage) {
        level = parentMessage.level + 1;
      }
    }

    setIsSubmittingReply(true);
    try {
      if (createReplyAPI) {
        // Use real API - pass parentReplyId
        const result = await createReplyAPI(activeThreadId, body, mediaIds.length > 0 ? mediaIds : undefined, parentReplyId);

        // Create the reply message for UI
        const newMessage: OrbitalMessageType = {
          id: result.replyId,
          author: userProfile.displayName,
          authorId: currentUserId || 'unknown',
          timestamp: new Date(result.createdAt).getTime(),
          body,
          level,
          parentId: parentReplyId,
          hasMedia: mediaIds.length > 0,
          mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
          avatarUrl: userProfile.avatarUrl || undefined,
        };

        // Add to messages in tree order (after parent and its descendants)
        setMessages(prev => insertMessageInTreeOrder(prev, newMessage));

        // Update cache in tree order
        setThreadMessagesCache(prev => ({
          ...prev,
          [activeThreadId]: insertMessageInTreeOrder(prev[activeThreadId] || [], newMessage)
        }));

        // Update thread reply count
        setThreads(prev => prev.map(thread =>
          thread.id === activeThreadId
            ? { ...thread, replyCount: thread.replyCount + 1 }
            : thread
        ));

        console.log('Reply created successfully:', result.replyId);
      } else {
        // Fallback to mock behavior
        const messageId = `message-${Date.now()}`;

        const newMessage: OrbitalMessageType = {
          id: messageId,
          author: userProfile.displayName,
          authorId: currentUserId || 'unknown',
          timestamp: Date.now(),
          body,
          level,
          parentId: parentReplyId,
          hasMedia: mediaIds.length > 0,
          mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
          avatarUrl: userProfile.avatarUrl || undefined,
        };

        // Add to messages in tree order (after parent and its descendants)
        setMessages(prev => insertMessageInTreeOrder(prev, newMessage));
        setThreadMessagesCache(prev => ({
          ...prev,
          [activeThreadId]: insertMessageInTreeOrder(prev[activeThreadId] || [], newMessage)
        }));
        setThreads(prev => prev.map(thread =>
          thread.id === activeThreadId
            ? { ...thread, replyCount: thread.replyCount + 1 }
            : thread
        ));
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      // TODO: Show error message to user
    } finally {
      setIsSubmittingReply(false);
    }
  }, [activeThreadId, createReplyAPI, messages]);

  const handleReply = useCallback(async (parentId: string, body: string, mediaIds?: string[]) => {
    try {
      // TODO: Implement reply to Orbital backend
      console.log('Reply:', { parentId, body, mediaIds });
    } catch (err) {
      console.error('Failed to reply:', err);
    }
  }, []);

  const handleLoginSuccess = useCallback(() => {
    setIsLoggedIn(true);

    // Initialize notification service with user settings
    const notificationSettings: Partial<OrbitalNotificationSettings> = {
      enabled: getSetting('orbital.settings.notifications.enabled', true) ?? true,
      soundEnabled: getSetting('orbital.settings.notifications.soundEnabled', true) ?? true,
      showPreviews: (getSetting('orbital.settings.notifications.showPreviews', 'full') ?? 'full') as 'full' | 'name' | 'none',
    };
    orbitalNotifications.initialize(notificationSettings);
  }, []);

  // Handle logout - resets all state and shows login screen
  const handleLogout = useCallback(() => {
    // Clear auth state
    setIsLoggedIn(false);
    setCurrentUserId(null);
    // Clear cached user ID for settings storage
    clearUserIdCache();
    // Reset all data state
    setGroups([]);
    setSelectedGroupIdState(null);
    setThreads([]);
    setMessages([]);
    setChats([]);
    setChatMessages([]);
    setActiveThreadId(null);
    setActiveChatId(null);
    // Clear caches
    setThreadMessagesCache({});
    setChatMessagesCache({});
    // Reset UI state
    setShowSettings(false);
    setShowOrbitSelector(false);
    setShowCreateGroup(false);
    setIsCreatingThread(false);
    // Clear pending uploads
    setPendingUploadRequests([]);
    console.log('Logged out - showing login screen');
  }, []);

  // Pending uploads handlers
  const handleSharePendingUpload = useCallback(async (requestId: string) => {
    console.log('[OrbitalInbox] User chose to share files for request:', requestId);

    try {
      // Get items we can provide for this request
      const itemsWeCanProvide = await getItemsNeededForRequest(requestId);

      if (itemsWeCanProvide.length === 0) {
        console.log('[OrbitalInbox] No items we can provide for request:', requestId);
        setPendingUploadRequests(prev => prev.filter(r => r.requestId !== requestId));
        return;
      }

      console.log(`[OrbitalInbox] Uploading ${itemsWeCanProvide.length} items for request:`, requestId);

      // Upload each item
      for (const item of itemsWeCanProvide) {
        try {
          await uploadItemForSync({
            itemId: item.itemId,
            mediaId: item.mediaId,
            getAbsoluteAttachmentPath: getAbsoluteAttachmentPath,
          });
          console.log(`[OrbitalInbox] Uploaded item ${item.itemId}`);
        } catch (itemError) {
          console.error(`[OrbitalInbox] Failed to upload item ${item.itemId}:`, itemError);
          // Continue with other items even if one fails
        }
      }

      // Remove from pending list after upload attempt
      setPendingUploadRequests(prev => prev.filter(r => r.requestId !== requestId));
      console.log('[OrbitalInbox] Upload complete for request:', requestId);
    } catch (error) {
      console.error('[OrbitalInbox] Failed to share files for request:', requestId, error);
      // Keep in pending list if there was an error so user can retry
    }
  }, [getAbsoluteAttachmentPath]);

  const handleDeclinePendingUpload = useCallback((requestId: string) => {
    console.log('[OrbitalInbox] User declined to share files for request:', requestId);
    setPendingUploadRequests(prev => prev.filter(r => r.requestId !== requestId));
  }, []);

  const handleDismissPendingUploads = useCallback(() => {
    setShowPendingUploads(false);
  }, []);

  // Format relative time for pending uploads
  const formatRelativeTime = useCallback((timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  }, []);

  // Orbit selection handlers
  const handleSelectOrbit = useCallback(async (groupId: string) => {
    // No-op if selecting the already-selected orbit (fixes issue #77)
    if (groupId === selectedGroupId) {
      setShowOrbitSelector(false);
      setShowSettings(false);
      return;
    }

    try {
      await setSelectedGroupId(groupId);
      setSelectedGroupIdState(groupId);
      setShowOrbitSelector(false);
      setShowSettings(false); // Close settings when switching orbits
      // Clear THREAD data when switching orbits (threads are orbit-specific)
      setActiveThreadId(null);
      setThreads([]);
      setMessages([]);
      setThreadMessagesCache({});
      // DON'T clear chat data - chats are global (orbit-agnostic)
      // Chat list, active chat, and chat messages persist across orbit switches
      console.log('Selected orbit:', groupId);
    } catch (err) {
      console.error('Failed to select orbit:', err);
      setGroupsError('Failed to switch orbit. Please try again.');
    }
  }, [setSelectedGroupId, selectedGroupId]);

  const handleCreateOrbit = useCallback(() => {
    setShowOrbitSelector(false);
    setShowCreateGroup(true);
  }, []);

  const handleGroupCreated = useCallback(async (result: CreateGroupResult) => {
    console.log('[OrbitalInbox] handleGroupCreated called with result:', result);
    // Extract groupId from nested structure
    const newGroupId = result.group.groupId;
    console.log('[OrbitalInbox] Extracted groupId:', newGroupId);

    // Refresh groups list
    if (getGroups) {
      const updatedGroups = await getGroups();
      console.log('[OrbitalInbox] Updated groups list:', updatedGroups.map(g => ({ id: g.groupId, name: g.name })));
      setGroups(updatedGroups);
    }
    // Select the new group
    console.log('[OrbitalInbox] About to set selectedGroupId to:', newGroupId);
    if (setSelectedGroupId) {
      await setSelectedGroupId(newGroupId);
      console.log('[OrbitalInbox] setSelectedGroupId completed (persisted)');
      setSelectedGroupIdState(newGroupId);
      console.log('[OrbitalInbox] setSelectedGroupIdState completed (local state)');
    } else {
      console.log('[OrbitalInbox] WARNING: setSelectedGroupId is not defined!');
    }
    // Clear thread data for new orbit
    setActiveThreadId(null);
    setThreads([]);
    setMessages([]);
    setThreadMessagesCache({});
    // Close modals and settings
    setShowCreateGroup(false);
    setShowSettings(false);
    setShowOrbitSelector(false);
  }, [getGroups, setSelectedGroupId]);

  const handleJoinOrbit = useCallback(() => {
    // Show the JoinGroupModal
    setShowOrbitSelector(false);
    setShowSettings(false);
    setShowJoinGroup(true);
  }, []);

  // Handler for successful group join
  const handleGroupJoined = useCallback(async (result: JoinGroupResult) => {
    console.log('Successfully joined group:', result.group.groupId);
    setShowJoinGroup(false);
    // Refresh groups list
    if (getGroups) {
      const updatedGroups = await getGroups();
      setGroups(updatedGroups);
    }
    // Select the newly joined group
    if (setSelectedGroupId) {
      await setSelectedGroupId(result.group.groupId);
      setSelectedGroupIdState(result.group.groupId);
    }
  }, [getGroups, setSelectedGroupId]);

  // Derive current group from groups and selectedGroupId
  const currentGroup = groups.find(g => g.groupId === selectedGroupId) || null;

  const [chatMessages, setChatMessages] = useState<OrbitalMessageType[]>([]);

  const handleChatClick = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    setActiveThreadId(null); // Clear thread selection when selecting a chat
    setIsCreatingThread(false); // Cancel create mode when selecting a chat
    // Load messages from cache (no mock data fallback)
    const cachedMessages = chatMessagesCache[chatId];
    if (cachedMessages) {
      setChatMessages([...cachedMessages]);
    } else {
      // Start with empty messages - will be populated from API
      setChatMessages([]);
    }
  }, [chatMessagesCache]);

  const handleSendChatMessage = useCallback(async (body: string, mediaIds?: string[]) => {
    if (!activeChatId || !selectedGroupId) {
      return;
    }

    // Get current user profile for display name and avatar
    const userProfile = getCurrentUserProfile();

    try {
      // Create optimistic message
      const tempId = `chat-msg-${Date.now()}`;

      const newMessage: OrbitalMessageType = {
        id: tempId,
        author: userProfile.displayName,
        authorId: currentUserId || 'unknown',
        timestamp: Date.now(),
        body,
        level: 0,
        hasMedia: mediaIds ? mediaIds.length > 0 : false,
        mediaIds: mediaIds && mediaIds.length > 0 ? mediaIds : undefined,
        avatarUrl: userProfile.avatarUrl || undefined,
      };

      // Add to chat messages (optimistic update)
      setChatMessages(prev => [...prev, newMessage]);

      // Update cache (optimistic)
      setChatMessagesCache(prev => ({
        ...prev,
        [activeChatId]: [...(prev[activeChatId] || []), newMessage]
      }));

      // Send to backend via Signal relay
      // Use activeChatId (DM group ID) as conversation_id, not selectedGroupId (orbit)
      console.log('[OrbitalInbox] Sending chat message via Signal relay to DM:', activeChatId, 'mediaIds:', mediaIds);
      const result = await sendChatMessage(activeChatId, body, mediaIds);
      console.log('[OrbitalInbox] Chat message sent:', result.messageId);

      // Send media sync messages for key distribution (so recipient can decrypt media)
      if (mediaIds && mediaIds.length > 0) {
        console.log('[OrbitalInbox] Sending media sync for DM media keys:', mediaIds);
        // For DMs, use the DM group ID as both groupId and threadId
        // This distributes the media encryption keys to the recipient
        await sendMediaSyncMessages(activeChatId, activeChatId, mediaIds);
        console.log('[OrbitalInbox] Media sync messages sent for DM');
      }

      // Update message with real ID from server
      const finalMessage = { ...newMessage, id: result.messageId };
      setChatMessages(prev =>
        prev.map(m => m.id === tempId ? finalMessage : m)
      );
      setChatMessagesCache(prev => ({
        ...prev,
        [activeChatId]: (prev[activeChatId] || []).map(m =>
          m.id === tempId ? finalMessage : m
        )
      }));
    } catch (err) {
      console.error('[OrbitalInbox] Failed to send chat message:', err);
      // TODO: Show error to user, remove optimistic message
    }
  }, [activeChatId, selectedGroupId, sendChatMessage, currentUserId]);

  // Create mock draft operations for draft persistence per context
  const [draftOperations] = useState<DraftOperations>(() => createMockDraftOperations());

  // Show loading state
  if (isLoading) {
    return (
      <>
        <TitlebarDragArea />
        <div className="OrbitalInbox OrbitalInbox--loading">
          <div className="OrbitalInbox__loading-spinner" />
          <div className="OrbitalInbox__loading-text">Loading Orbital...</div>
        </div>
      </>
    );
  }

  // Show login screen if not logged in
  if (!isLoggedIn) {
    return (
      <>
        <TitlebarDragArea />
        <div className="OrbitalInbox OrbitalInbox--login">
          <OrbitalLogin
            i18n={i18n}
            onClose={() => {}} // No-op for now (can't close without logging in)
            onLoginSuccess={handleLoginSuccess}
          />
        </div>
      </>
    );
  }

  // Show orbit selector modal after login if no orbit is selected
  if (showOrbitSelector) {
    return (
      <>
        <TitlebarDragArea />
        <div className="OrbitalInbox OrbitalInbox--orbit-selector">
          <OrbitSelectorModal
            i18n={i18n}
            groups={groups}
            isLoading={isLoadingGroups}
            error={groupsError}
            onSelectOrbit={handleSelectOrbit}
            onCreateOrbit={handleCreateOrbit}
            onJoinOrbit={handleJoinOrbit}
          />
        </div>
      </>
    );
  }

  const activeThread = threads.find(t => t.id === activeThreadId);
  const activeChat = chats.find(c => c.id === activeChatId);

  return (
    <>
      <TitlebarDragArea />
      <FunProvider
        i18n={i18n}
        // Recents
        recentEmojis={MOCK_RECENT_EMOJIS}
        recentStickers={recentStickers}
        recentGifs={[]}
        // Emojis
        emojiSkinToneDefault={skinTone}
        onEmojiSkinToneDefaultChange={setSkinTone}
        onOpenCustomizePreferredReactionsModal={() => null}
        onSelectEmoji={() => null}
        // Stickers
        installedStickerPacks={packs}
        showStickerPickerHint={false}
        onClearStickerPickerHint={() => null}
        onSelectSticker={() => null}
        // Gifs
        fetchGifsSearch={() => Promise.resolve(MOCK_GIFS_PAGINATED_ONE_PAGE)}
        fetchGifsFeatured={() => Promise.resolve(MOCK_GIFS_PAGINATED_ONE_PAGE)}
        fetchGif={() => Promise.resolve(new Blob([new Uint8Array(1)]))}
        onSelectGif={() => null}
      >
        <div className="OrbitalInbox">
        {/* Pending Uploads Notification Banner */}
        {showPendingUploads && pendingUploadRequests.length > 0 && (
          <OrbitalPendingUploads
            requests={pendingUploadRequests}
            onShare={handleSharePendingUpload}
            onDecline={handleDeclinePendingUpload}
            onDismiss={handleDismissPendingUploads}
            formatBytes={formatFileSize}
            formatRelativeTime={formatRelativeTime}
          />
        )}
        {/* Left Sidebar - Settings Nav, Thread List, or Chat List */}
        <div className="OrbitalInbox__sidebar">
          {showSettings ? (
            <OrbitalSettingsNav
              activePage={settingsPage}
              onPageSelect={handleSettingsPageChange}
              onBack={handleCloseSettings}
            />
          ) : displayMode === DisplayMode.Threads ? (
            <OrbitalThreadList
              threads={threads}
              activeThreadId={activeThreadId || undefined}
              orbitName={currentGroup?.name}
              i18n={i18n}
              onThreadClick={handleThreadClick}
              onCreateThread={handleCreateThread}
              onSettingsClick={handleSettingsClick}
            />
          ) : (
            <OrbitalChatList
              chats={chats}
              activeChatId={activeChatId}
              i18n={i18n}
              onChatClick={handleChatClick}
              onCreateChat={handleCreateChat}
              onSettingsClick={handleSettingsClick}
            />
          )}
          {!showSettings && (
            <ChatsThreadsToggle
              displayMode={displayMode}
              onSetDisplayMode={setDisplayMode}
            />
          )}
        </div>

        {/* Main Content - Settings, Thread Detail, Chat Detail, or Create Thread */}
        <div className="OrbitalInbox__main">
          {showSettings ? (
            <OrbitalSettings
              page={settingsPage}
              groups={groups}
              selectedGroupId={selectedGroupId}
              currentGroup={currentGroup}
              isLoadingGroups={isLoadingGroups}
              groupsError={groupsError}
              onSelectOrbit={handleSelectOrbit}
              onCreateOrbit={handleCreateOrbit}
              onJoinOrbit={handleJoinOrbit}
              onLogout={handleLogout}
            />
          ) : activeThread ? (
            <OrbitalThreadDetail
              threadId={activeThread.id}
              groupId={selectedGroupId || 'unknown'}
              threadTitle={activeThread.title}
              threadAuthor={activeThread.author}
              threadTimestamp={activeThread.timestamp}
              messages={applyCurrentUserProfileToMessages(messages, currentUserId)}
              currentUserId={currentUserId || 'unknown'}
              i18n={i18n}
              onReply={handleReply}
              onSendMessage={handleSendMessage}
              getQuotaInfo={getQuotaInfo}
              checkUploadAllowed={checkUploadAllowed}
              formatBytes={formatBytes}
              uploadMedia={uploadMedia}
              getAbsoluteAttachmentPath={getAbsoluteAttachmentPath}
              downloadMedia={downloadMedia}
              getMediaDownloadStatus={getMediaDownloadStatus}
              deleteMedia={deleteMedia}
              draftOperations={draftOperations}
            />
          ) : activeChat ? (
            <OrbitalThreadDetail
              threadId={activeChat.id}
              groupId={selectedGroupId || 'unknown'}
              threadTitle={`Direct Messages with ${activeChat.name}`}
              threadAuthor={activeChat.name}
              threadTimestamp={activeChat.lastMessageTimestamp}
              messages={applyCurrentUserProfileToMessages(
                [...chatMessages].sort((a, b) => a.timestamp - b.timestamp),
                currentUserId
              )}
              currentUserId={currentUserId || 'unknown'}
              i18n={i18n}
              onReply={handleReply}
              onSendMessage={handleSendChatMessage}
              getQuotaInfo={getQuotaInfo}
              checkUploadAllowed={checkUploadAllowed}
              formatBytes={formatBytes}
              uploadMedia={uploadMedia}
              getAbsoluteAttachmentPath={getAbsoluteAttachmentPath}
              downloadMedia={downloadMedia}
              getMediaDownloadStatus={getMediaDownloadStatus}
              deleteMedia={deleteMedia}
              draftOperations={draftOperations}
            />
          ) : isCreatingThread ? (
            <div className="OrbitalInbox__create-thread">
              <div className="OrbitalInbox__create-thread-header">
                <h2>Create New Thread</h2>
              </div>
              <OrbitalComposer
                mode="thread"
                groupId={selectedGroupId || 'unknown'}
                i18n={i18n}
                onSubmit={handleSubmitNewThread}
                onCancel={handleCancelCreateThread}
                getQuotaInfo={getQuotaInfo}
                checkUploadAllowed={checkUploadAllowed}
                formatBytes={formatBytes}
                uploadMedia={uploadMedia as unknown as ComposerUploadMediaFunction}
                getAbsoluteAttachmentPath={getAbsoluteAttachmentPath}
                contextId="new-thread"
                draftOperations={draftOperations}
              />
            </div>
          ) : (
            <div className="OrbitalInbox__empty-state">
              <div className="OrbitalInbox__empty-state-icon">
                <img
                  src="images/orbital/orbital-logo-light-lg.svg"
                  alt="Orbital"
                  className="OrbitalInbox__empty-state-logo OrbitalInbox__empty-state-logo--light"
                />
                <img
                  src="images/orbital/orbital-logo-darkmode-lg.svg"
                  alt="Orbital"
                  className="OrbitalInbox__empty-state-logo OrbitalInbox__empty-state-logo--dark"
                />
              </div>
              <div className="OrbitalInbox__empty-state-title">
                Welcome to Orbital
              </div>
              <div className="OrbitalInbox__empty-state-description">
                Select a thread from the left to start reading, or create a new thread to start a discussion.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateGroup && createGroup && (
        <CreateGroupModal
          i18n={i18n}
          onClose={() => setShowCreateGroup(false)}
          onGroupCreated={handleGroupCreated}
          createGroup={createGroup}
        />
      )}

      {/* Join Group Modal */}
      {showJoinGroup && joinGroup && (
        <JoinGroupModal
          i18n={i18n}
          onClose={() => setShowJoinGroup(false)}
          onGroupJoined={handleGroupJoined}
          joinGroup={joinGroup}
          syncOrbitHistory={syncOrbitHistory}
          downloadAllPendingMedia={downloadAllPendingMedia}
          getAbsoluteAttachmentPath={getAbsoluteAttachmentPath}
        />
      )}

      {/* Contact Picker Modal */}
      {showContactPicker && (
        <ContactPickerModal
          i18n={i18n}
          contacts={availableContacts}
          onSelectContacts={handleSelectContacts}
          onClose={() => setShowContactPicker(false)}
        />
      )}
      </FunProvider>
    </>
  );
}
