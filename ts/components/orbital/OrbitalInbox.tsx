// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback, useEffect } from 'react';
import type { LocalizerType } from '../../types/Util.std';
import { OrbitalThreadList, type OrbitalThread } from './OrbitalThreadList';
import { OrbitalThreadDetail, type OrbitalMessageType } from './OrbitalThreadDetail';
import { OrbitalComposer } from './OrbitalComposer';
import { OrbitalLogin } from './OrbitalLogin';
import { OrbitalChatList } from './OrbitalChatList';
import type { OrbitalChat, OrbitalUser } from './orbitalTypes';
import { ContactPickerModal } from './ContactPickerModal';
import { ChatsThreadsToggle } from '../ChatsThreadsToggle.dom';
import { DisplayMode, OrbitalSettingsPage } from '../../types/Nav.std';
import type { QuotaInfo } from '../../services/orbitalQuota.preload';
import { OrbitalSettings } from './OrbitalSettings';
import { OrbitalSettingsNav } from './OrbitalSettingsNav';
import type { UploadCheckResult } from './OrbitalMediaPicker';
import { createMockDraftOperations, type DraftOperations } from './useDraft';
import { FunProvider } from '../fun/FunProvider.dom';
import { packs, recentStickers } from '../stickers/mocks.std';
import { MOCK_GIFS_PAGINATED_ONE_PAGE, MOCK_RECENT_EMOJIS } from '../fun/mocks.dom';
import { EmojiSkinTone } from '../fun/data/emojis.std';
import { TitlebarDragArea } from '../TitlebarDragArea.dom';
import { OrbitSelectorModal } from './OrbitSelectorModal';
import { CreateGroupModal } from './CreateGroupModal';
import type { GroupInfo, CreateGroupResult } from '../../services/orbitalGroups.preload.js';
import type {
  ThreadInfo,
  ReplyInfo,
  ListThreadsResult,
  ListRepliesResult,
  CreateThreadResult,
  CreateReplyResult,
} from '../../services/orbitalThreads.preload.js';
import {
  storeLocalThread,
  getLocalThreads,
  type LocalThread,
} from './localThreadStorage';
import { getCurrentUserProfile } from './settingsStorage';

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
  mediaIds?: string[]
) => Promise<CreateReplyResult>;

// Group API types
export type CreateGroupFunction = (name: string) => Promise<CreateGroupResult>;
export type JoinGroupFunction = (inviteCode: string) => Promise<{ groupId: string }>;

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

// WebSocket types
export type WebSocketConnectFunction = () => Promise<boolean>;
export type WebSocketDisconnectFunction = () => void;
export type WebSocketSubscribeFunction = (
  eventType: 'new_thread' | 'new_reply' | 'media_uploaded' | 'new_message' | 'member_left' | 'key_rotated' | 'all',
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
export type SendChatMessageFunction = (conversationId: string, text: string) => Promise<{
  messageId: string;
  serverTimestamp: number;
}>;
export type DecodeChatEnvelopeFunction = (groupId: string, base64: string) => Promise<{ type: string; body: string; sender: string; timestamp: number } | null>;

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
  currentUserId: string | null
): OrbitalThread {
  // For current user's posts, use current profile (phpBB style - profile updates reflect everywhere)
  const isCurrentUser = currentUserId !== null && thread.authorId === currentUserId;
  const currentProfile = isCurrentUser ? getCurrentUserProfile() : null;

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
    avatarUrl: isCurrentUser ? (currentProfile!.avatarUrl || undefined) : undefined,
  };
}

/**
 * Map ReplyInfo from backend to OrbitalMessageType for UI
 * Note: Avatar URL will be populated by phpBB-style profile transformation for current user
 */
function mapReplyInfoToOrbitalMessage(reply: ReplyInfo): OrbitalMessageType {
  return {
    id: reply.replyId,
    author: reply.authorUsername,
    authorId: reply.authorId,
    timestamp: new Date(reply.createdAt).getTime(),
    body: reply.encryptedBody, // Already decrypted by service
    level: 1, // Replies are always level 1 (flat structure for now)
    hasMedia: (reply.mediaCount || 0) > 0,
    mediaIds: reply.media?.map(m => m.mediaId),
    avatarUrl: undefined, // Will be set by profile transformation for current user
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

/**
 * Map LocalThread from local storage to OrbitalThread for UI
 * For current user's posts, always use their current profile (phpBB style)
 */
function mapLocalThreadToOrbitalThread(
  thread: LocalThread,
  currentUserId: string | null
): OrbitalThread {
  // For current user's posts, use current profile (phpBB style - profile updates reflect everywhere)
  const isCurrentUser = currentUserId !== null && thread.authorId === currentUserId;
  const currentProfile = isCurrentUser ? getCurrentUserProfile() : null;

  return {
    id: thread.threadId,
    orbitId: thread.groupId,
    title: thread.title,
    body: thread.body,
    author: isCurrentUser ? currentProfile!.displayName : thread.authorUsername,
    authorId: thread.authorId,
    timestamp: new Date(thread.createdAt).getTime(),
    replyCount: thread.replyCount,
    hasMedia: thread.hasMedia,
    hasVideo: thread.hasVideo,
    hasImage: thread.hasImage,
    isUnread: false,
    avatarUrl: isCurrentUser ? (currentProfile!.avatarUrl || undefined) : thread.avatarUrl,
  };
}

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
  wsIsConnected = defaultWsIsConnected,
  // Chat/Signal relay
  fetchChatMessages = defaultFetchChatMessages,
  sendChatMessage = defaultSendChatMessage,
  decodeChatEnvelope = defaultDecodeChatEnvelope,
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

  // Contact picker modal state
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [availableContacts, setAvailableContacts] = useState<OrbitalUser[]>([]);

  // Session caches for messages (persists user-posted messages during session)
  const [threadMessagesCache, setThreadMessagesCache] = useState<Record<string, OrbitalMessageType[]>>({});
  const [chatMessagesCache, setChatMessagesCache] = useState<Record<string, OrbitalMessageType[]>>({});

  // Current user identity (loaded dynamically from auth service)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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

  // Fetch chats when logged in (orbit-agnostic - chats are global)
  // TODO: Integrate with real chat API when available
  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    // Load chats from Signal relay
    async function loadChats() {
      if (!selectedGroupId) return;

      try {
        console.log('[OrbitalInbox] Fetching chats for group:', selectedGroupId);
        const result = await fetchChatMessages(selectedGroupId);

        // Group messages by sender to create chat list
        const chatMap = new Map<string, OrbitalChat>();

        for (const msg of result.messages) {
          const decoded = await decodeChatEnvelope(selectedGroupId, msg.encryptedEnvelope);
          if (!decoded) continue;

          const senderId = decoded.sender;
          if (!chatMap.has(senderId)) {
            chatMap.set(senderId, {
              id: `chat-${senderId}`,
              recipientId: senderId,
              name: senderId, // TODO: Look up username
              lastMessage: decoded.body,
              lastMessageTimestamp: decoded.timestamp,
              unreadCount: 0,
            });
          } else {
            const chat = chatMap.get(senderId)!;
            if (decoded.timestamp > chat.lastMessageTimestamp) {
              chat.lastMessage = decoded.body;
              chat.lastMessageTimestamp = decoded.timestamp;
            }
          }
        }

        setChats(Array.from(chatMap.values()));
        console.log('[OrbitalInbox] Loaded', chatMap.size, 'chats');
      } catch (err) {
        console.error('[OrbitalInbox] Failed to load chats:', err);
        setChats([]);
      }
    }

    loadChats();
  }, [isLoggedIn, selectedGroupId, fetchChatMessages, decodeChatEnvelope]);

  // Load contacts when logged in AND orbit selected (for Create Chat picker)
  // Contacts are group members from the selected orbit
  useEffect(() => {
    if (!isLoggedIn || !selectedGroupId) {
      setAvailableContacts([]);
      return;
    }

    async function loadContacts() {
      try {
        const contacts = await getContacts(selectedGroupId!);
        // Filter out current user from contacts
        const filteredContacts = contacts.filter(c => c.id !== currentUserId);
        setAvailableContacts(filteredContacts);
        console.log('[OrbitalInbox] Loaded contacts:', filteredContacts.length);
      } catch (err) {
        console.error('[OrbitalInbox] Failed to load contacts:', err);
        setAvailableContacts([]);
      }
    }

    loadContacts();
  }, [isLoggedIn, selectedGroupId, getContacts, currentUserId]);

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
      }
    });

    const unsubNewReply = wsSubscribe('new_reply', (event) => {
      console.log('[OrbitalInbox] Received new_reply event:', event);
      const data = event.data;
      // Update reply count for the thread
      setThreads(prevThreads =>
        prevThreads.map(t =>
          t.id === data.thread_id
            ? { ...t, replyCount: (t.replyCount || 0) + 1 }
            : t
        )
      );
      // If viewing this thread, add the reply to messages
      if (activeThreadId === data.thread_id) {
        setMessages(prevMessages => {
          // Check if reply already exists
          if (prevMessages.some(m => m.id === data.reply_id)) {
            return prevMessages;
          }
          const newReply: OrbitalMessageType = {
            id: data.reply_id,
            author: data.author_name || 'Unknown',
            authorId: data.author_id || 'unknown',
            timestamp: new Date(data.created_at).getTime(),
            body: data.encrypted_body || '',
            level: 1,
            hasMedia: false,
          };
          return [...prevMessages, newReply];
        });
      }
    });

    const unsubMediaUploaded = wsSubscribe('media_uploaded', (event) => {
      console.log('[OrbitalInbox] Received media_uploaded event:', event);
      // Trigger media download if needed - for now just log
      // TODO: Auto-download new media to local storage
    });

    // Handle incoming chat messages from Signal relay
    const unsubNewMessage = wsSubscribe('new_message', async (event) => {
      console.log('[OrbitalInbox] Received new_message event:', event);
      const data = event.data;

      // Get the group ID for decryption
      const groupId = data.conversation_id || selectedGroupId;
      if (!groupId) {
        console.warn('[OrbitalInbox] No group ID for decryption');
        return;
      }

      // Decrypt the message envelope with group key
      const decoded = await decodeChatEnvelope(groupId, data.encrypted_envelope);
      if (!decoded) {
        console.warn('[OrbitalInbox] Failed to decrypt message envelope');
        return;
      }

      // Skip messages from self (already handled optimistically)
      if (decoded.sender === currentUserId) {
        console.log('[OrbitalInbox] Skipping own message (already displayed)');
        return;
      }

      // Create message object for UI
      const newChatMessage: OrbitalMessageType = {
        id: data.message_id,
        author: decoded.sender, // TODO: Look up username
        authorId: decoded.sender,
        timestamp: decoded.timestamp,
        body: decoded.body,
        level: 0,
        hasMedia: false,
      };

      // Update chat list - add or update sender's chat
      setChats(prevChats => {
        const senderId = decoded.sender;
        const existingChatIndex = prevChats.findIndex(c => c.recipientId === senderId);

        if (existingChatIndex >= 0) {
          // Update existing chat
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
          // Create new chat entry
          const newChat: OrbitalChat = {
            id: `chat-${senderId}`,
            recipientId: senderId,
            name: senderId, // TODO: Look up username
            lastMessage: decoded.body,
            lastMessageTimestamp: decoded.timestamp,
            unreadCount: 1,
          };
          return [newChat, ...prevChats];
        }
      });

      // If viewing this sender's chat, add message to display
      const senderChatId = `chat-${decoded.sender}`;
      if (activeChatId === senderChatId || chats.some(c => c.id === activeChatId && c.recipientId === decoded.sender)) {
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
          [activeChatId!]: [...(prev[activeChatId!] || []), newChatMessage]
        }));
      }
    });

    // Cleanup on unmount or when deps change
    return () => {
      console.log('[OrbitalInbox] Unsubscribing from WebSocket events');
      unsubNewThread();
      unsubNewReply();
      unsubMediaUploaded();
      unsubNewMessage();
    };
  }, [isLoggedIn, selectedGroupId, activeThreadId, activeChatId, chats, currentUserId, wsConnect, wsDisconnect, wsSubscribe, decodeChatEnvelope]);

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
          // LOCAL-FIRST: listThreads reads from SQLCipher and triggers background server sync
          console.log('[OrbitalInbox] Using local-first thread storage...');
          const result = await listThreads(groupId, {
            limit: 50,
            sort: 'created_desc',
          });

          console.log('[OrbitalInbox] Local SQLCipher returned', result.threads.length, 'threads');
          const threads = result.threads.map(t => mapThreadInfoToOrbitalThread(t, currentUserId));
          setThreads(threads);
        } else {
          // Fallback: legacy local storage (deprecated)
          console.log('[OrbitalInbox] No listThreads API - using legacy local storage');
          const localThreads = await getLocalThreads(groupId);
          if (localThreads.length > 0) {
            console.log('[OrbitalInbox] Found', localThreads.length, 'threads in legacy storage');
            const mappedThreads = localThreads.map(t => mapLocalThreadToOrbitalThread(t, currentUserId));
            setThreads(mappedThreads);
          } else {
            console.log('[OrbitalInbox] No threads found');
            setThreads([]);
          }
        }
      } catch (err) {
        console.error('[OrbitalInbox] Failed to fetch threads:', err);
        // Fallback to legacy local storage on error
        try {
          const localThreads = await getLocalThreads(groupId);
          if (localThreads.length > 0) {
            console.log('[OrbitalInbox] Using legacy storage fallback:', localThreads.length, 'threads');
            const mappedThreads = localThreads.map(t => mapLocalThreadToOrbitalThread(t, currentUserId));
            setThreads(mappedThreads);
          } else {
            setThreads([]);
          }
        } catch (localErr) {
          console.error('[OrbitalInbox] Legacy storage fallback failed:', localErr);
          setThreads([]);
        }
      } finally {
        setIsLoadingThreads(false);
      }
    }

    fetchThreads();
  }, [isLoggedIn, selectedGroupId, listThreads, currentUserId]);

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
        const mappedReplies = result.replies.map(mapReplyInfoToOrbitalMessage);

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
            hasMedia: thread.hasMedia,
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
  }, [threadMessagesCache, getReplies, threads]);

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
  // TODO: Integrate with real chat API when available
  const handleSelectContacts = useCallback((contactIds: string[], groupName?: string) => {
    setShowContactPicker(false);

    if (contactIds.length === 1) {
      // 1:1 DM - check for existing chat in current state
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
        // Create new chat - get contact info from availableContacts
        const recipient = availableContacts.find(c => c.id === recipientId);
        if (!recipient) {
          console.warn('Contact not found:', recipientId);
          return;
        }

        const newChat: OrbitalChat = {
          id: `chat-${Date.now()}`,
          recipientId,
          name: recipient.name,
          avatarUrl: recipient.avatarUrl,
          lastMessage: '',
          lastMessageTimestamp: Date.now(),
          unreadCount: 0,
          isOnline: recipient.isOnline,
        };

        setChats(prev => [newChat, ...prev]);
        setActiveChatId(newChat.id);
        setActiveThreadId(null);
        setChatMessages([]);
        setChatMessagesCache(prev => ({ ...prev, [newChat.id]: [] }));
      }
    } else if (contactIds.length > 1) {
      // Group chat - create new
      const newGroupChat: OrbitalChat = {
        id: `group-${Date.now()}`,
        recipientId: contactIds.join(','),
        name: groupName || 'New Group',
        lastMessage: '',
        lastMessageTimestamp: Date.now(),
        unreadCount: 0,
      };

      setChats(prev => [newGroupChat, ...prev]);
      setActiveChatId(newGroupChat.id);
      setActiveThreadId(null);
      setChatMessages([]);
      setChatMessagesCache(prev => ({ ...prev, [newGroupChat.id]: [] }));
    }
  }, [chats, chatMessagesCache, availableContacts]);

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
        };

        // Also store thread locally for persistence across app restarts
        const localThread: LocalThread = {
          threadId: result.threadId,
          groupId: result.groupId,
          authorId: currentUserId || 'unknown',
          authorUsername: userProfile.displayName,
          title,
          body,
          replyCount: 0,
          createdAt: result.createdAt,
          hasMedia: mediaIds.length > 0,
          hasVideo: false,
          hasImage: mediaIds.length > 0,
          avatarUrl: userProfile.avatarUrl || undefined,
        };
        await storeLocalThread(localThread);
        console.log('[OrbitalInbox] Thread stored locally:', result.threadId);

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

  const handleSendMessage = useCallback(async (body: string, mediaIds?: string[]) => {
    if (!activeThreadId) {
      return;
    }

    // Get current user profile for display name and avatar
    const userProfile = getCurrentUserProfile();

    setIsSubmittingReply(true);
    try {
      if (createReplyAPI) {
        // Use real API
        const result = await createReplyAPI(activeThreadId, body, mediaIds);

        // Create the reply message for UI
        const newMessage: OrbitalMessageType = {
          id: result.replyId,
          author: userProfile.displayName,
          authorId: currentUserId || 'unknown',
          timestamp: new Date(result.createdAt).getTime(),
          body,
          level: 1,
          parentId: undefined,
          hasMedia: mediaIds ? mediaIds.length > 0 : false,
          mediaIds: mediaIds && mediaIds.length > 0 ? mediaIds : undefined,
          avatarUrl: userProfile.avatarUrl || undefined,
        };

        // Add to messages
        setMessages(prev => [...prev, newMessage]);

        // Update cache
        setThreadMessagesCache(prev => ({
          ...prev,
          [activeThreadId]: [...(prev[activeThreadId] || []), newMessage]
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
          level: 1,
          parentId: undefined,
          hasMedia: mediaIds ? mediaIds.length > 0 : false,
          mediaIds: mediaIds && mediaIds.length > 0 ? mediaIds : undefined,
          avatarUrl: userProfile.avatarUrl || undefined,
        };

        setMessages(prev => [...prev, newMessage]);
        setThreadMessagesCache(prev => ({
          ...prev,
          [activeThreadId]: [...(prev[activeThreadId] || []), newMessage]
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
  }, [activeThreadId, createReplyAPI]);

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
  }, []);

  // Handle logout - resets all state and shows login screen
  const handleLogout = useCallback(() => {
    // Clear auth state
    setIsLoggedIn(false);
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
    console.log('Logged out - showing login screen');
  }, []);

  // Orbit selection handlers
  const handleSelectOrbit = useCallback(async (groupId: string) => {
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
  }, [setSelectedGroupId]);

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
    // TODO: Navigate to join orbit flow or show modal
    console.log('Join orbit clicked');
    // For now, just switch to settings page with invites
    setShowOrbitSelector(false);
    setShowSettings(true);
    setSettingsPage(OrbitalSettingsPage.Invites);
  }, []);

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
      console.log('[OrbitalInbox] Sending chat message via Signal relay...');
      const result = await sendChatMessage(selectedGroupId, body);
      console.log('[OrbitalInbox] Chat message sent:', result.messageId);

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
                uploadMedia={uploadMedia}
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
