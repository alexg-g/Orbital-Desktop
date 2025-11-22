// Copyright 2024 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import classNames from 'classnames';
import { DisplayMode } from '../types/Nav.std.js';

export type PropsType = {
  displayMode: DisplayMode;
  onSetDisplayMode: (mode: DisplayMode) => void;
};

export function ChatsThreadsToggle({
  displayMode,
  onSetDisplayMode,
}: PropsType): JSX.Element {
  return (
    <div className="ChatsThreadsToggle">
      <button
        type="button"
        className={classNames('ChatsThreadsToggle__button', {
          'ChatsThreadsToggle__button--active': displayMode === DisplayMode.Chats,
        })}
        onClick={() => onSetDisplayMode(DisplayMode.Chats)}
        aria-pressed={displayMode === DisplayMode.Chats}
      >
        <span className="ChatsThreadsToggle__icon ChatsThreadsToggle__icon--chats" />
        <span className="ChatsThreadsToggle__label">Chats</span>
      </button>
      <button
        type="button"
        className={classNames('ChatsThreadsToggle__button', {
          'ChatsThreadsToggle__button--active': displayMode === DisplayMode.Threads,
        })}
        onClick={() => onSetDisplayMode(DisplayMode.Threads)}
        aria-pressed={displayMode === DisplayMode.Threads}
      >
        <span className="ChatsThreadsToggle__icon ChatsThreadsToggle__icon--threads" />
        <span className="ChatsThreadsToggle__label">Threads</span>
      </button>
    </div>
  );
}
