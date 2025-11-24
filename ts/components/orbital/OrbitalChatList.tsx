// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback } from 'react';
import type { LocalizerType } from '../../types/Util.std';
import type { OrbitalChat } from './mockThreadData';

export type OrbitalChatListProps = {
  chats: ReadonlyArray<OrbitalChat>;
  activeChatId: string | null;
  i18n: LocalizerType;
  onChatClick: (chatId: string) => void;
  onCreateChat: () => void;
};

/**
 * OrbitalChatList - Displays a list of direct message chats
 *
 * Simple Signal-style chat list for 1:1 conversations
 */
export function OrbitalChatList({
  chats,
  activeChatId,
  onChatClick,
  onCreateChat,
}: OrbitalChatListProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState<string>('');

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
  }, []);

  // Filter chats based on search query
  const filteredChats = searchQuery
    ? chats.filter(chat =>
        chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chat.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : chats;

  return (
    <div className="OrbitalChatList">
      <div className="OrbitalChatList__header">
        <h2>Chats</h2>
        <button
          type="button"
          className="OrbitalComposer__button-primary"
          onClick={onCreateChat}
        >
          Create Chat
        </button>
      </div>

      {/* Search Bar */}
      <div className="OrbitalChatList__search">
        <input
          type="text"
          className="OrbitalChatList__search-input"
          placeholder="Search chats..."
          value={searchQuery}
          onChange={handleSearchChange}
          aria-label="Search chats"
        />
        {searchQuery && (
          <button
            type="button"
            className="OrbitalChatList__search-clear"
            onClick={handleSearchClear}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <div className="OrbitalChatList__items">
        {filteredChats.map(chat => (
          <button
            key={chat.id}
            type="button"
            className={`OrbitalChatList__item ${
              chat.id === activeChatId ? 'OrbitalChatList__item--active' : ''
            } ${chat.unreadCount > 0 ? 'OrbitalChatList__item--unread' : ''}`}
            onClick={() => onChatClick(chat.id)}
          >
            <div className="OrbitalChatList__avatar">
              {chat.avatarUrl ? (
                <img src={chat.avatarUrl} alt={chat.name} />
              ) : (
                <div className="OrbitalChatList__avatar-placeholder">
                  {chat.name.charAt(0)}
                </div>
              )}
              {chat.isOnline && (
                <div className="OrbitalChatList__online-indicator" />
              )}
            </div>
            <div className="OrbitalChatList__content">
              <div className="OrbitalChatList__name">{chat.name}</div>
              <div className="OrbitalChatList__last-message">
                {chat.lastMessage}
              </div>
            </div>
            <div className="OrbitalChatList__meta">
              <div className="OrbitalChatList__time">
                {formatTimestamp(chat.lastMessageTimestamp)}
              </div>
              {chat.unreadCount > 0 && (
                <div className="OrbitalChatList__unread-badge">
                  {chat.unreadCount}
                </div>
              )}
            </div>
          </button>
        ))}
        {filteredChats.length === 0 && (
          <div className="OrbitalChatList__empty">
            {searchQuery ? 'No chats match your search.' : 'No chats yet. Start a conversation!'}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return `${diffMins}m`;
  }
  if (diffHours < 24) {
    return `${Math.floor(diffHours)}h`;
  }
  if (diffHours < 48) {
    return 'Yesterday';
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
