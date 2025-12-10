// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Storybook mock for orbitalThreads.preload.ts
 * Provides stub implementations for thread functions that work in browser environment
 */

export type Thread = {
  threadId: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  groupId: string;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
  lastReplyAt?: string;
  isPinned?: boolean;
};

export type Reply = {
  replyId: string;
  threadId: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateThreadResult = {
  success: boolean;
  thread?: Thread;
  error?: string;
};

export type CreateReplyResult = {
  success: boolean;
  reply?: Reply;
  error?: string;
};

export async function getThreads(_groupId: string, _options?: { limit?: number; offset?: number }): Promise<Thread[]> {
  console.log('[Storybook Mock] getThreads called');
  return [
    {
      threadId: 'mock-thread-1',
      title: 'Welcome to the family orbit!',
      content: 'This is our first thread. Share your favorite memories here!',
      authorId: 'user-1',
      authorName: 'Mom',
      groupId: _groupId,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
      replyCount: 3,
      lastReplyAt: new Date(Date.now() - 3600000).toISOString(),
      isPinned: true,
    },
    {
      threadId: 'mock-thread-2',
      title: 'Birthday photos from last week',
      content: 'Here are all the photos from the birthday party!',
      authorId: 'user-2',
      authorName: 'Dad',
      groupId: _groupId,
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      updatedAt: new Date(Date.now() - 172800000).toISOString(),
      replyCount: 5,
      lastReplyAt: new Date(Date.now() - 43200000).toISOString(),
    },
  ];
}

export async function getThread(_threadId: string): Promise<Thread | null> {
  console.log('[Storybook Mock] getThread called');
  return {
    threadId: _threadId,
    title: 'Mock Thread',
    content: 'This is mock thread content.',
    authorId: 'user-1',
    authorName: 'Mom',
    groupId: 'mock-group',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    replyCount: 0,
  };
}

export async function createThread(_groupId: string, _title: string, _content: string): Promise<CreateThreadResult> {
  console.log('[Storybook Mock] createThread called');
  return {
    success: true,
    thread: {
      threadId: 'new-mock-thread',
      title: _title,
      content: _content,
      authorId: 'current-user',
      authorName: 'You',
      groupId: _groupId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      replyCount: 0,
    },
  };
}

export async function getReplies(_threadId: string, _options?: { limit?: number; offset?: number }): Promise<Reply[]> {
  console.log('[Storybook Mock] getReplies called');
  return [
    {
      replyId: 'mock-reply-1',
      threadId: _threadId,
      content: 'Great idea!',
      authorId: 'user-2',
      authorName: 'Dad',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ];
}

export async function createReply(_threadId: string, _content: string): Promise<CreateReplyResult> {
  console.log('[Storybook Mock] createReply called');
  return {
    success: true,
    reply: {
      replyId: 'new-mock-reply',
      threadId: _threadId,
      content: _content,
      authorId: 'current-user',
      authorName: 'You',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function incrementThreadReplyCount(_threadId: string): void {
  console.log('[Storybook Mock] incrementThreadReplyCount called');
}

export async function deleteThread(_threadId: string): Promise<{ success: boolean }> {
  console.log('[Storybook Mock] deleteThread called');
  return { success: true };
}

export async function deleteReply(_replyId: string): Promise<{ success: boolean }> {
  console.log('[Storybook Mock] deleteReply called');
  return { success: true };
}

export async function pinThread(_threadId: string): Promise<{ success: boolean }> {
  console.log('[Storybook Mock] pinThread called');
  return { success: true };
}

export async function unpinThread(_threadId: string): Promise<{ success: boolean }> {
  console.log('[Storybook Mock] unpinThread called');
  return { success: true };
}
