// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Storybook mock for orbitalNotifications.preload.ts
 * Provides stub implementations for notification functions that work in browser environment
 */

export enum OrbitalNotificationType {
  NewThread = 'NewThread',
  NewReply = 'NewReply',
  NewMedia = 'NewMedia',
  NewMessage = 'NewMessage',
  MemberJoined = 'MemberJoined',
}

export type OrbitalNotificationData = {
  type: OrbitalNotificationType;
  title: string;
  body: string;
  threadId?: string;
  orbitId?: string;
  conversationId?: string;
  authorName?: string;
  iconUrl?: string;
};

export type OrbitalNotificationSettings = {
  enabled: boolean;
  soundEnabled: boolean;
  showPreviews: 'full' | 'name' | 'none';
  newThreads?: boolean;
  newReplies?: boolean;
  newMedia?: boolean;
  newMessages?: boolean;
  memberJoined?: boolean;
};

class MockOrbitalNotificationService {
  #settings: OrbitalNotificationSettings = {
    enabled: true,
    soundEnabled: true,
    showPreviews: 'full',
  };

  initialize(settings?: Partial<OrbitalNotificationSettings>): void {
    console.log('[Storybook Mock] OrbitalNotificationService.initialize called', settings);
    if (settings) {
      this.#settings = { ...this.#settings, ...settings };
    }
  }

  updateSettings(settings: Partial<OrbitalNotificationSettings>): void {
    console.log('[Storybook Mock] OrbitalNotificationService.updateSettings called', settings);
    this.#settings = { ...this.#settings, ...settings };
  }

  getSettings(): OrbitalNotificationSettings {
    return { ...this.#settings };
  }

  notify(data: OrbitalNotificationData): void {
    console.log('[Storybook Mock] OrbitalNotificationService.notify called', data);
  }

  notifyNewThread(params: {
    threadId: string;
    orbitId: string;
    title: string;
    authorName: string;
    orbitName?: string;
  }): void {
    console.log('[Storybook Mock] notifyNewThread called', params);
  }

  notifyNewReply(params: {
    threadId: string;
    orbitId: string;
    threadTitle: string;
    authorName: string;
    replyPreview?: string;
  }): void {
    console.log('[Storybook Mock] notifyNewReply called', params);
  }

  notifyNewMedia(params: {
    threadId?: string;
    orbitId: string;
    authorName: string;
    mediaType?: 'image' | 'video';
  }): void {
    console.log('[Storybook Mock] notifyNewMedia called', params);
  }

  notifyNewMessage(params: {
    conversationId: string;
    authorName: string;
    messagePreview?: string;
  }): void {
    console.log('[Storybook Mock] notifyNewMessage called', params);
  }

  notifyMemberJoined(params: {
    orbitId: string;
    memberName: string;
    orbitName?: string;
  }): void {
    console.log('[Storybook Mock] notifyMemberJoined called', params);
  }

  clear(): void {
    console.log('[Storybook Mock] OrbitalNotificationService.clear called');
  }
}

export const orbitalNotifications = new MockOrbitalNotificationService();

export type { MockOrbitalNotificationService as OrbitalNotificationService };
