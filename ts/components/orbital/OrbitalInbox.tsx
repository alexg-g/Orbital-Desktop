// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback, useEffect } from 'react';
import type { LocalizerType } from '../../types/Util.std';
import { OrbitalThreadList, type OrbitalThread } from './OrbitalThreadList';
import { OrbitalThreadDetail, type OrbitalMessageType } from './OrbitalThreadDetail';
import { OrbitalComposer } from './OrbitalComposer';
import { OrbitalLogin } from './OrbitalLogin';
import { OrbitalChatList } from './OrbitalChatList';
import {
  MOCK_MESSAGES,
  MOCK_CHAT_MESSAGES,
  MOCK_ORBITS,
  DEMO_ORBIT_ID,
  getThreadsByOrbit,
  getAllChats,
  getAllContacts,
  findExistingChat,
  getUserById,
  isOrbitOwner,
  type OrbitalChat,
  type OrbitalUser,
} from './mockThreadData';
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
import type { GroupInfo } from '../../services/orbitalGroups.preload.js';

// Browser-compatible type for authentication check
export type IsAuthenticatedFunction = () => Promise<boolean>;

// Orbit management types
export type GetGroupsFunction = () => Promise<GroupInfo[]>;
export type GetSelectedGroupIdFunction = () => Promise<string | null>;
export type SetSelectedGroupIdFunction = (groupId: string) => Promise<void>;

export type OrbitalInboxProps = {
  i18n: LocalizerType;
  // Dependency injection for Node.js operations (allows Storybook mocking)
  isAuthenticated: IsAuthenticatedFunction;
  // Orbit management (injected for testability)
  getGroups?: GetGroupsFunction;
  getSelectedGroupId?: GetSelectedGroupIdFunction;
  setSelectedGroupId?: SetSelectedGroupIdFunction;
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
// Mock functions for orbit management (used when no injection provided)
// Uses MOCK_ORBITS from mockThreadData.ts for consistency
const mockGetGroups: GetGroupsFunction = async () => {
  const currentUserId = 'testuser';
  return Object.values(MOCK_ORBITS).map(orbit => ({
    groupId: orbit.groupId,
    name: orbit.name,
    encryptedName: orbit.encryptedName,
    memberCount: orbit.memberCount,
    createdAt: orbit.createdAt,
    isOwner: isOrbitOwner(orbit.groupId, currentUserId),
  }));
};
const mockGetSelectedGroupId: GetSelectedGroupIdFunction = async () => null;
const mockSetSelectedGroupId: SetSelectedGroupIdFunction = async () => {};

export function OrbitalInbox({
  i18n,
  isAuthenticated,
  getGroups = mockGetGroups,
  getSelectedGroupId = mockGetSelectedGroupId,
  setSelectedGroupId = mockSetSelectedGroupId,
}: OrbitalInboxProps): JSX.Element {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [threads, setThreads] = useState<OrbitalThread[]>([]);
  const [chats, setChats] = useState<OrbitalChat[]>([]); // Global chats (orbit-agnostic)
  const [messages, setMessages] = useState<OrbitalMessageType[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
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

  // Contact picker modal state
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [availableContacts, setAvailableContacts] = useState<OrbitalUser[]>([]);

  // Session caches for messages (persists user-posted messages during session)
  const [threadMessagesCache, setThreadMessagesCache] = useState<Record<string, OrbitalMessageType[]>>({});
  const [chatMessagesCache, setChatMessagesCache] = useState<Record<string, OrbitalMessageType[]>>({});

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
        setGroups(userGroups);

        // Check for previously selected group
        const savedGroupId = await getSelectedGroupId();

        if (savedGroupId && userGroups.some(g => g.groupId === savedGroupId)) {
          // User has a valid saved selection - use it
          setSelectedGroupIdState(savedGroupId);
          setShowOrbitSelector(false);
        } else {
          // No saved selection or invalid - show orbit selector modal
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
  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    async function fetchChats() {
      try {
        // Load all chats - chats are global, not orbit-specific
        const allChats = getAllChats();
        setChats([...allChats]);
      } catch (err) {
        console.error('Failed to fetch chats:', err);
      }
    }

    fetchChats();
  }, [isLoggedIn]); // Only depends on login, NOT selectedGroupId

  // Load contacts when logged in (for Create Chat picker)
  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    // Load all contacts (excluding current user)
    const contacts = getAllContacts('testuser');
    setAvailableContacts([...contacts]);
  }, [isLoggedIn]);

  // Fetch threads when logged in AND orbit is selected (orbit-specific)
  useEffect(() => {
    if (!isLoggedIn || !selectedGroupId) {
      return;
    }

    // Capture the value for use in async function (TypeScript narrowing)
    const groupId = selectedGroupId;

    async function fetchThreads() {
      try {
        // TODO: Replace with real API call to Orbital backend filtered by groupId
        // const response = await window.Signal.OrbitalAPI.getThreads({ groupId });
        // setThreads(response.threads);

        // For now, use mock data filtered by orbit
        const orbitThreads = getThreadsByOrbit(groupId);
        setThreads([...orbitThreads]);
      } catch (err) {
        console.error('Failed to fetch threads:', err);
      }
    }

    fetchThreads();
  }, [isLoggedIn, selectedGroupId]);

  const handleThreadClick = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    setActiveChatId(null); // Clear chat selection when selecting a thread
    setIsCreatingThread(false); // Cancel create mode when selecting a thread
    // Load messages from cache first, then fall back to mock data
    const cachedMessages = threadMessagesCache[threadId];
    if (cachedMessages) {
      setMessages([...cachedMessages]);
    } else {
      const threadMessages = MOCK_MESSAGES[threadId] || [];
      setMessages([...threadMessages]);
      // Initialize cache with mock data
      setThreadMessagesCache(prev => ({ ...prev, [threadId]: [...threadMessages] }));
    }
  }, [threadMessagesCache]);

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
  const handleSelectContacts = useCallback((contactIds: string[], groupName?: string) => {
    setShowContactPicker(false);

    if (contactIds.length === 1) {
      // 1:1 DM - check for existing chat
      const recipientId = contactIds[0];
      const existingChat = findExistingChat(recipientId);

      if (existingChat) {
        // Open existing chat
        setActiveChatId(existingChat.id);
        setActiveThreadId(null);
        const cachedMessages = chatMessagesCache[existingChat.id];
        if (cachedMessages) {
          setChatMessages([...cachedMessages]);
        } else {
          const chatMsgs = MOCK_CHAT_MESSAGES[existingChat.id] || [];
          setChatMessages([...chatMsgs]);
          setChatMessagesCache(prev => ({ ...prev, [existingChat.id]: [...chatMsgs] }));
        }
      } else {
        // Create new chat
        const recipient = getUserById(recipientId);
        if (!recipient) return;

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
  }, [chatMessagesCache]);

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

  const handleSubmitNewThread = useCallback((title: string, body: string, mediaIds: string[]) => {
    const threadId = `thread-${Date.now()}`;
    const messageId = `message-${Date.now()}`;

    // Create a new thread object with orbitId
    const newThread: OrbitalThread = {
      id: threadId,
      orbitId: selectedGroupId || DEMO_ORBIT_ID, // Associate with current orbit
      title,
      author: 'You', // TODO: Get from current user
      authorId: 'testuser',
      timestamp: Date.now(),
      replyCount: 0, // No replies yet (root post doesn't count)
      hasMedia: mediaIds.length > 0,
      hasVideo: false,
      hasImage: mediaIds.length > 0,
      isUnread: false,
    };

    // Create the root message (original post)
    const rootMessage: OrbitalMessageType = {
      id: messageId,
      author: 'You',
      authorId: 'testuser',
      timestamp: Date.now(),
      body,
      level: 0, // Root level
      hasMedia: mediaIds.length > 0,
      mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
    };

    // Add to threads list at the top
    setThreads(prev => [newThread, ...prev]);

    // Exit create mode and select the new thread
    setIsCreatingThread(false);
    setActiveThreadId(threadId);
    setActiveChatId(null); // Clear chat selection

    // Initialize with root message
    setMessages([rootMessage]);

    // Initialize cache for the new thread
    setThreadMessagesCache(prev => ({ ...prev, [threadId]: [rootMessage] }));

    // TODO: Send to backend API
    console.log('Created new thread:', { title, body, mediaIds, orbitId: selectedGroupId });
  }, [selectedGroupId]);

  const handleSendMessage = useCallback(async (body: string, mediaIds?: string[]) => {
    if (!activeThreadId) {
      return;
    }

    try {
      const messageId = `message-${Date.now()}`;

      // Create the reply message
      const newMessage: OrbitalMessageType = {
        id: messageId,
        author: 'You',
        authorId: 'testuser',
        timestamp: Date.now(),
        body,
        level: 1, // Reply level (could be adjusted for nested replies)
        parentId: undefined, // Direct reply to thread (not nested)
        hasMedia: mediaIds ? mediaIds.length > 0 : false,
        mediaIds: mediaIds && mediaIds.length > 0 ? mediaIds : undefined,
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

      // TODO: Send to backend API
      console.log('Send message:', { body, mediaIds, threadId: activeThreadId });
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }, [activeThreadId]);

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

  // Orbit selection handlers
  const handleSelectOrbit = useCallback(async (groupId: string) => {
    try {
      await setSelectedGroupId(groupId);
      setSelectedGroupIdState(groupId);
      setShowOrbitSelector(false);
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
    // TODO: Navigate to create orbit flow or show modal
    console.log('Create orbit clicked');
    // For now, just switch to settings page with invites
    setShowOrbitSelector(false);
    setShowSettings(true);
    setSettingsPage(OrbitalSettingsPage.Invites);
  }, []);

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
    // Load messages from cache first, then fall back to mock data
    const cachedMessages = chatMessagesCache[chatId];
    if (cachedMessages) {
      setChatMessages([...cachedMessages]);
    } else {
      const chatMsgs = MOCK_CHAT_MESSAGES[chatId] || [];
      setChatMessages([...chatMsgs]);
      // Initialize cache with mock data
      setChatMessagesCache(prev => ({ ...prev, [chatId]: [...chatMsgs] }));
    }
  }, [chatMessagesCache]);

  const handleSendChatMessage = useCallback(async (body: string, mediaIds?: string[]) => {
    if (!activeChatId) {
      return;
    }

    try {
      const messageId = `chat-msg-${Date.now()}`;

      const newMessage: OrbitalMessageType = {
        id: messageId,
        author: 'You',
        authorId: 'testuser',
        timestamp: Date.now(),
        body,
        level: 0,
        hasMedia: mediaIds ? mediaIds.length > 0 : false,
        mediaIds: mediaIds && mediaIds.length > 0 ? mediaIds : undefined,
      };

      // Add to chat messages
      setChatMessages(prev => [...prev, newMessage]);

      // Update cache
      setChatMessagesCache(prev => ({
        ...prev,
        [activeChatId]: [...(prev[activeChatId] || []), newMessage]
      }));

      console.log('Send chat message:', { body, mediaIds, chatId: activeChatId });
    } catch (err) {
      console.error('Failed to send chat message:', err);
    }
  }, [activeChatId]);

  // Mock functions for dependency injection
  const mockGetQuotaInfo = useCallback(async (_groupId: string): Promise<QuotaInfo> => ({
    storageUsedBytes: 0,
    storageLimitBytes: 1024 * 1024 * 1024,
    bandwidthUsedBytes: 0,
    bandwidthLimitBytes: 5 * 1024 * 1024 * 1024,
    bandwidthResetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    mediaCount: 0,
    mediaLimit: 1000,
  }), []);

  const mockCheckUploadAllowed = useCallback(async (_groupId: string, _fileSizeBytes: number): Promise<UploadCheckResult> => ({
    allowed: true,
    reason: undefined,
  }), []);

  const mockFormatBytes = useCallback((bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }, []);

  const mockUploadMedia = useCallback(async () => ({ mediaId: 'mock-id' }), []);
  const mockGetAbsoluteAttachmentPath = useCallback((path: string) => path, []);
  const mockDownloadMedia = useCallback(async () => '/mock/path', []);
  const mockGetMediaDownloadStatus = useCallback(async () => ({ status: 'complete' }), []);
  const mockDeleteMedia = useCallback(async () => {}, []);

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
              activeThreadId={activeThreadId}
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
            />
          ) : activeThread ? (
            <OrbitalThreadDetail
              threadId={activeThread.id}
              groupId={selectedGroupId || 'unknown'}
              threadTitle={activeThread.title}
              threadAuthor={activeThread.author}
              threadTimestamp={activeThread.timestamp}
              messages={messages}
              currentUserId="testuser"
              i18n={i18n}
              onReply={handleReply}
              onSendMessage={handleSendMessage}
              getQuotaInfo={mockGetQuotaInfo}
              checkUploadAllowed={mockCheckUploadAllowed}
              formatBytes={mockFormatBytes}
              uploadMedia={mockUploadMedia}
              getAbsoluteAttachmentPath={mockGetAbsoluteAttachmentPath}
              downloadMedia={mockDownloadMedia}
              getMediaDownloadStatus={mockGetMediaDownloadStatus}
              deleteMedia={mockDeleteMedia}
              draftOperations={draftOperations}
            />
          ) : activeChat ? (
            <OrbitalThreadDetail
              threadId={activeChat.id}
              groupId={selectedGroupId || 'unknown'}
              threadTitle={`Direct Messages with ${activeChat.name}`}
              threadAuthor={activeChat.name}
              threadTimestamp={activeChat.lastMessageTimestamp}
              messages={chatMessages}
              currentUserId="testuser"
              i18n={i18n}
              onReply={handleReply}
              onSendMessage={handleSendChatMessage}
              getQuotaInfo={mockGetQuotaInfo}
              checkUploadAllowed={mockCheckUploadAllowed}
              formatBytes={mockFormatBytes}
              uploadMedia={mockUploadMedia}
              getAbsoluteAttachmentPath={mockGetAbsoluteAttachmentPath}
              downloadMedia={mockDownloadMedia}
              getMediaDownloadStatus={mockGetMediaDownloadStatus}
              deleteMedia={mockDeleteMedia}
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
                getQuotaInfo={mockGetQuotaInfo}
                checkUploadAllowed={mockCheckUploadAllowed}
                formatBytes={mockFormatBytes}
                uploadMedia={mockUploadMedia}
                getAbsoluteAttachmentPath={mockGetAbsoluteAttachmentPath}
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
