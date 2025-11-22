// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrbitalThread } from './OrbitalThreadList';
import type { OrbitalMessageType } from './OrbitalThreadDetail';

/**
 * Mock thread data for development/testing
 * This will be replaced with real database queries once backend is connected
 */
export const MOCK_THREADS: ReadonlyArray<OrbitalThread> = [
  {
    id: 'thread-1',
    title: "Emma's First Steps!",
    author: 'Mom',
    authorId: 'user-mom',
    timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    replyCount: 8,
    hasMedia: true,
    hasVideo: true,
    hasImage: false,
    isUnread: false,
    lastReplyTimestamp: Date.now() - 30 * 60 * 1000, // 30 min ago
    lastReplyAuthor: 'Grandma',
  },
  {
    id: 'thread-2',
    title: 'Family Dinner This Weekend?',
    author: 'Dad',
    authorId: 'user-dad',
    timestamp: Date.now() - 5 * 60 * 60 * 1000, // 5 hours ago
    replyCount: 4,
    hasMedia: false,
    hasVideo: false,
    hasImage: false,
    isUnread: true,
    lastReplyTimestamp: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
    lastReplyAuthor: 'Uncle',
  },
  {
    id: 'thread-3',
    title: 'Check out these vacation photos',
    author: 'Aunt Sarah',
    authorId: 'user-aunt',
    timestamp: Date.now() - 24 * 60 * 60 * 1000, // Yesterday
    replyCount: 12,
    hasMedia: true,
    hasVideo: false,
    hasImage: true,
    isUnread: false,
  },
  {
    id: 'thread-4',
    title: 'Recipe for Grandmas cookies?',
    author: 'Cousin',
    authorId: 'user-cousin',
    timestamp: Date.now() - 48 * 60 * 60 * 1000, // 2 days ago
    replyCount: 6,
    hasMedia: false,
    hasVideo: false,
    hasImage: false,
    isUnread: false,
  },
  {
    id: 'thread-5',
    title: "Baby shower planning - it's a boy!",
    author: 'Aunt Sarah',
    authorId: 'user-aunt',
    timestamp: Date.now() - 72 * 60 * 60 * 1000, // 3 days ago
    replyCount: 15,
    hasMedia: true,
    hasVideo: false,
    hasImage: true,
    isUnread: true,
    lastReplyTimestamp: Date.now() - 4 * 60 * 60 * 1000,
    lastReplyAuthor: 'Mom',
  },
  {
    id: 'thread-6',
    title: 'Summer road trip ideas?',
    author: 'Uncle',
    authorId: 'user-uncle',
    timestamp: Date.now() - 96 * 60 * 60 * 1000, // 4 days ago
    replyCount: 9,
    hasMedia: false,
    hasVideo: false,
    hasImage: false,
    isUnread: false,
    lastReplyTimestamp: Date.now() - 24 * 60 * 60 * 1000,
    lastReplyAuthor: 'Dad',
  },
];

/**
 * Mock messages for each thread
 * Keyed by thread ID
 */
export const MOCK_MESSAGES: Record<string, ReadonlyArray<OrbitalMessageType>> = {
  'thread-1': [
    {
      id: 'msg-1-1',
      author: 'Mom',
      authorId: 'user-mom',
      timestamp: Date.now() - 2 * 60 * 60 * 1000,
      body: "Emma took her first steps today! I'm so proud of her! 🎉",
      level: 0,
      hasMedia: true,
      mediaType: 'video',
    },
    {
      id: 'msg-1-2',
      author: 'Grandma',
      authorId: 'user-grandma',
      timestamp: Date.now() - 1.5 * 60 * 60 * 1000,
      body: "Oh my goodness! She's getting so big! I can't believe it!",
      level: 1,
      parentId: 'msg-1-1',
      hasMedia: false,
    },
    {
      id: 'msg-1-3',
      author: 'Dad',
      authorId: 'user-dad',
      timestamp: Date.now() - 1 * 60 * 60 * 1000,
      body: "She's been trying all week! So determined.",
      level: 1,
      parentId: 'msg-1-1',
      hasMedia: false,
    },
    {
      id: 'msg-1-4',
      author: 'Grandma',
      authorId: 'user-grandma',
      timestamp: Date.now() - 30 * 60 * 1000,
      body: "I'll bring her a special present this weekend!",
      level: 2,
      parentId: 'msg-1-3',
      hasMedia: false,
    },
  ],
  'thread-2': [
    {
      id: 'msg-2-1',
      author: 'Dad',
      authorId: 'user-dad',
      timestamp: Date.now() - 5 * 60 * 60 * 1000,
      body: "Anyone free for family dinner this Saturday? Thinking we could do BBQ at our place.",
      level: 0,
      hasMedia: false,
    },
    {
      id: 'msg-2-2',
      author: 'Mom',
      authorId: 'user-mom',
      timestamp: Date.now() - 4 * 60 * 60 * 1000,
      body: "Sounds great! I'll bring my potato salad.",
      level: 1,
      parentId: 'msg-2-1',
      hasMedia: false,
    },
    {
      id: 'msg-2-3',
      author: 'Uncle',
      authorId: 'user-uncle',
      timestamp: Date.now() - 1 * 60 * 60 * 1000,
      body: "Count us in! What time?",
      level: 1,
      parentId: 'msg-2-1',
      hasMedia: false,
    },
  ],
  'thread-3': [
    {
      id: 'msg-3-1',
      author: 'Aunt Sarah',
      authorId: 'user-aunt',
      timestamp: Date.now() - 24 * 60 * 60 * 1000,
      body: "Just got back from Hawaii! Here are some photos from the trip.",
      level: 0,
      hasMedia: true,
      mediaType: 'image',
    },
    {
      id: 'msg-3-2',
      author: 'Cousin',
      authorId: 'user-cousin',
      timestamp: Date.now() - 23 * 60 * 60 * 1000,
      body: "Wow, that beach looks amazing! Which island?",
      level: 1,
      parentId: 'msg-3-1',
      hasMedia: false,
    },
    {
      id: 'msg-3-3',
      author: 'Aunt Sarah',
      authorId: 'user-aunt',
      timestamp: Date.now() - 22 * 60 * 60 * 1000,
      body: "That was Maui! The sunset there was unreal.",
      level: 2,
      parentId: 'msg-3-2',
      hasMedia: false,
    },
  ],
  'thread-4': [
    {
      id: 'msg-4-1',
      author: 'Cousin',
      authorId: 'user-cousin',
      timestamp: Date.now() - 48 * 60 * 60 * 1000,
      body: "Does anyone have Grandma's secret cookie recipe? I've been craving them!",
      level: 0,
      hasMedia: false,
    },
    {
      id: 'msg-4-2',
      author: 'Mom',
      authorId: 'user-mom',
      timestamp: Date.now() - 47 * 60 * 60 * 1000,
      body: "I have it written down somewhere. Let me find it!",
      level: 1,
      parentId: 'msg-4-1',
      hasMedia: false,
    },
  ],
  'thread-5': [
    {
      id: 'msg-5-1',
      author: 'Aunt Sarah',
      authorId: 'user-aunt',
      timestamp: Date.now() - 72 * 60 * 60 * 1000,
      body: "We just found out - it's a boy! 💙 Time to start planning the baby shower!",
      level: 0,
      hasMedia: true,
      mediaType: 'image',
    },
    {
      id: 'msg-5-2',
      author: 'Mom',
      authorId: 'user-mom',
      timestamp: Date.now() - 4 * 60 * 60 * 1000,
      body: "So exciting! I can help with decorations. What theme are you thinking?",
      level: 1,
      parentId: 'msg-5-1',
      hasMedia: false,
    },
  ],
  'thread-6': [
    {
      id: 'msg-6-1',
      author: 'Uncle',
      authorId: 'user-uncle',
      timestamp: Date.now() - 96 * 60 * 60 * 1000,
      body: "Thinking about a family road trip this summer. Any destination ideas?",
      level: 0,
      hasMedia: false,
    },
    {
      id: 'msg-6-2',
      author: 'Dad',
      authorId: 'user-dad',
      timestamp: Date.now() - 24 * 60 * 60 * 1000,
      body: "What about the Grand Canyon? Kids would love it!",
      level: 1,
      parentId: 'msg-6-1',
      hasMedia: false,
    },
  ],
};
