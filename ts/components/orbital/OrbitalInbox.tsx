// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback, useEffect } from 'react';
import type { LocalizerType } from '../../types/Util.std';
import { OrbitalThreadList, type OrbitalThread } from './OrbitalThreadList';
import { OrbitalThreadDetail, type OrbitalMessageType } from './OrbitalThreadDetail';
import { OrbitalLogin } from './OrbitalLogin';

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
  const [threads, setThreads] = useState<OrbitalThread[]>([]);
  const [messages, setMessages] = useState<OrbitalMessageType[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

        // For now, use empty state
        setThreads([]);
      } catch (err) {
        console.error('Failed to fetch threads:', err);
      }
    }

    fetchThreads();
  }, [isLoggedIn]);

  const handleThreadClick = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
  }, []);

  const handleCreateThread = useCallback(() => {
    // TODO: Implement thread creation
    console.log('Create thread clicked');
  }, []);

  const handleSendMessage = useCallback(async (body: string, mediaIds?: string[]) => {
    if (!activeThreadId) {
      return;
    }

    try {
      // TODO: Implement message sending to Orbital backend
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

  // Show loading state
  if (isLoading) {
    return (
      <div className="OrbitalInbox OrbitalInbox--loading">
        <div className="OrbitalInbox__loading-spinner" />
        <div className="OrbitalInbox__loading-text">Loading Orbital...</div>
      </div>
    );
  }

  // Show login screen if not logged in
  if (!isLoggedIn) {
    return (
      <div className="OrbitalInbox OrbitalInbox--login">
        <OrbitalLogin
          i18n={i18n}
          onClose={() => {}} // No-op for now (can't close without logging in)
          onLoginSuccess={handleLoginSuccess}
        />
      </div>
    );
  }

  const activeThread = threads.find(t => t.id === activeThreadId);

  return (
    <div className="OrbitalInbox">
      {/* Left Sidebar - Thread List */}
      <div className="OrbitalInbox__sidebar">
        <OrbitalThreadList
          threads={threads}
          activeThreadId={activeThreadId}
          i18n={i18n}
          onThreadClick={handleThreadClick}
          onCreateThread={handleCreateThread}
        />
      </div>

      {/* Main Content - Thread Detail */}
      <div className="OrbitalInbox__main">
        {activeThread ? (
          <OrbitalThreadDetail
            threadId={activeThread.id}
            threadTitle={activeThread.title}
            threadAuthor={activeThread.author}
            threadTimestamp={activeThread.timestamp}
            messages={messages}
            currentUserId="TODO_CURRENT_USER_ID"
            i18n={i18n}
            onReply={handleReply}
            onSendMessage={handleSendMessage}
          />
        ) : (
          <div className="OrbitalInbox__empty-state">
            <div className="OrbitalInbox__empty-state-icon">💬</div>
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
  );
}
