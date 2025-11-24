// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback, useEffect } from 'react';
import type { LocalizerType } from '../../types/Util.std';
import { OrbitalThreadList, type OrbitalThread } from './OrbitalThreadList';
import { OrbitalThreadDetail, type OrbitalMessageType } from './OrbitalThreadDetail';
import { OrbitalComposer } from './OrbitalComposer';
import { OrbitalLogin } from './OrbitalLogin';
import { OrbitalChatList } from './OrbitalChatList';
import { MOCK_THREADS, MOCK_MESSAGES, MOCK_CHATS, MOCK_CHAT_MESSAGES } from './mockThreadData';
import { ChatsThreadsToggle } from '../ChatsThreadsToggle.dom';
import { DisplayMode } from '../../types/Nav.std';
import type { QuotaInfo } from '../../services/orbitalQuota.preload';
import type { UploadCheckResult } from './OrbitalMediaPicker';
import { FunProvider } from '../fun/FunProvider.dom';
import { packs, recentStickers } from '../stickers/mocks.std';
import { MOCK_GIFS_PAGINATED_ONE_PAGE, MOCK_RECENT_EMOJIS } from '../fun/mocks.dom';
import { EmojiSkinTone } from '../fun/data/emojis.std';
import { TitlebarDragArea } from '../TitlebarDragArea.dom';

// Browser-compatible type for authentication check
export type IsAuthenticatedFunction = () => Promise<boolean>;

export type OrbitalInboxProps = {
  i18n: LocalizerType;
  // Dependency injection for Node.js operations (allows Storybook mocking)
  isAuthenticated: IsAuthenticatedFunction;
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
export function OrbitalInbox({ i18n, isAuthenticated }: OrbitalInboxProps): JSX.Element {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [threads, setThreads] = useState<OrbitalThread[]>([]);
  const [messages, setMessages] = useState<OrbitalMessageType[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(DisplayMode.Threads);
  const [skinTone, setSkinTone] = useState<EmojiSkinTone>(EmojiSkinTone.None);

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

  // Fetch threads when logged in
  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    async function fetchThreads() {
      try {
        // TODO: Replace with real API call to Orbital backend
        // const response = await window.Signal.OrbitalAPI.getThreads();
        // setThreads(response.threads);

        // For now, use mock data
        setThreads([...MOCK_THREADS]);
      } catch (err) {
        console.error('Failed to fetch threads:', err);
      }
    }

    fetchThreads();
  }, [isLoggedIn]);

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
    // TODO: Implement create chat functionality
    // For now, just log to console
    console.log('Create chat clicked');
  }, []);

  const handleSubmitNewThread = useCallback((title: string, body: string, mediaIds: string[]) => {
    const threadId = `thread-${Date.now()}`;
    const messageId = `message-${Date.now()}`;

    // Create a new thread object
    const newThread: OrbitalThread = {
      id: threadId,
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
    console.log('Created new thread:', { title, body, mediaIds });
  }, []);

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

  const activeThread = threads.find(t => t.id === activeThreadId);
  const activeChat = MOCK_CHATS.find(c => c.id === activeChatId);

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
        {/* Left Sidebar - Thread List or Chat List */}
        <div className="OrbitalInbox__sidebar">
          {displayMode === DisplayMode.Threads ? (
            <OrbitalThreadList
              threads={threads}
              activeThreadId={activeThreadId}
              i18n={i18n}
              onThreadClick={handleThreadClick}
              onCreateThread={handleCreateThread}
            />
          ) : (
            <OrbitalChatList
              chats={MOCK_CHATS}
              activeChatId={activeChatId}
              i18n={i18n}
              onChatClick={handleChatClick}
              onCreateChat={handleCreateChat}
            />
          )}
          <ChatsThreadsToggle
            displayMode={displayMode}
            onSetDisplayMode={setDisplayMode}
          />
        </div>

        {/* Main Content - Thread Detail, Chat Detail, or Create Thread */}
        <div className="OrbitalInbox__main">
          {activeThread ? (
            <OrbitalThreadDetail
              threadId={activeThread.id}
              groupId="mock-group-id"
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
            />
          ) : activeChat ? (
            <OrbitalThreadDetail
              threadId={activeChat.id}
              groupId="mock-group-id"
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
            />
          ) : isCreatingThread ? (
            <div className="OrbitalInbox__create-thread">
              <div className="OrbitalInbox__create-thread-header">
                <h2>Create New Thread</h2>
              </div>
              <OrbitalComposer
                mode="thread"
                groupId="mock-group-id"
                i18n={i18n}
                onSubmit={handleSubmitNewThread}
                onCancel={handleCancelCreateThread}
                getQuotaInfo={mockGetQuotaInfo}
                checkUploadAllowed={mockCheckUploadAllowed}
                formatBytes={mockFormatBytes}
                uploadMedia={mockUploadMedia}
                getAbsoluteAttachmentPath={mockGetAbsoluteAttachmentPath}
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
      </FunProvider>
    </>
  );
}
