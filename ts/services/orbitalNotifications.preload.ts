// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Desktop Notifications Service
 *
 * Provides desktop notifications for Orbital events (new threads, replies, media, etc.)
 * Uses Electron's Notification API and respects user preferences from settings.
 */

import { createLogger } from '../logging/log.std.js';
import { Sound, SoundType } from '../util/Sound.std.js';
import { drop } from '../util/drop.std.js';

const log = createLogger('orbital-notifications');

// OS detection without Node.js dependencies (works in browser/Storybook)
const isLinux = (): boolean => {
  if (typeof navigator !== 'undefined') {
    return navigator.platform.toLowerCase().includes('linux');
  }
  return false;
};

// Notification types for Orbital events
export enum OrbitalNotificationType {
  NewThread = 'NewThread',
  NewReply = 'NewReply',
  NewMedia = 'NewMedia',
  NewMessage = 'NewMessage',
  MemberJoined = 'MemberJoined',
}

// Notification data structure
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

// Notification settings from user preferences
export type OrbitalNotificationSettings = {
  enabled: boolean;
  soundEnabled: boolean;
  showPreviews: 'full' | 'name' | 'none';
  // Per-type settings (future enhancement)
  newThreads?: boolean;
  newReplies?: boolean;
  newMedia?: boolean;
  newMessages?: boolean;
  memberJoined?: boolean;
};

// Default settings
const DEFAULT_SETTINGS: OrbitalNotificationSettings = {
  enabled: true,
  soundEnabled: true,
  showPreviews: 'full',
  newThreads: true,
  newReplies: true,
  newMedia: true,
  newMessages: true,
  memberJoined: true,
};

// Singleton service instance
class OrbitalNotificationService {
  #lastNotification: Notification | null = null;
  #settings: OrbitalNotificationSettings = DEFAULT_SETTINGS;
  #isInitialized = false;

  /**
   * Initialize the notification service with user settings
   */
  initialize(settings?: Partial<OrbitalNotificationSettings>): void {
    if (this.#isInitialized) {
      log.info('OrbitalNotificationService already initialized, updating settings');
    }

    this.#settings = { ...DEFAULT_SETTINGS, ...settings };
    this.#isInitialized = true;
    log.info('OrbitalNotificationService initialized', this.#settings);
  }

  /**
   * Update notification settings
   */
  updateSettings(settings: Partial<OrbitalNotificationSettings>): void {
    this.#settings = { ...this.#settings, ...settings };
    log.info('OrbitalNotificationService settings updated', this.#settings);
  }

  /**
   * Get current settings
   */
  getSettings(): OrbitalNotificationSettings {
    return { ...this.#settings };
  }

  /**
   * Check if app is currently active/focused
   */
  #isAppActive(): boolean {
    try {
      if (window.SignalContext?.activeWindowService) {
        return window.SignalContext.activeWindowService.isActive();
      }
    } catch (error) {
      log.warn('Failed to check app active state:', error);
    }
    // Default to false (show notification) if we can't determine
    return false;
  }

  /**
   * Check if notification should be shown based on type and settings
   */
  #shouldShowNotification(type: OrbitalNotificationType): boolean {
    if (!this.#settings.enabled) {
      log.info('Notifications disabled globally');
      return false;
    }

    // Check per-type settings
    switch (type) {
      case OrbitalNotificationType.NewThread:
        return this.#settings.newThreads !== false;
      case OrbitalNotificationType.NewReply:
        return this.#settings.newReplies !== false;
      case OrbitalNotificationType.NewMedia:
        return this.#settings.newMedia !== false;
      case OrbitalNotificationType.NewMessage:
        return this.#settings.newMessages !== false;
      case OrbitalNotificationType.MemberJoined:
        return this.#settings.memberJoined !== false;
      default:
        return true;
    }
  }

  /**
   * Format notification content based on privacy settings
   */
  #formatNotification(data: OrbitalNotificationData): { title: string; body: string } {
    const { showPreviews } = this.#settings;

    switch (showPreviews) {
      case 'none':
        return {
          title: 'Orbital',
          body: 'New activity',
        };
      case 'name':
        return {
          title: data.authorName || 'Orbital',
          body: this.#getGenericBody(data.type),
        };
      case 'full':
      default:
        return {
          title: data.title,
          body: data.body,
        };
    }
  }

  /**
   * Get generic notification body for privacy mode
   */
  #getGenericBody(type: OrbitalNotificationType): string {
    switch (type) {
      case OrbitalNotificationType.NewThread:
        return 'Posted a new thread';
      case OrbitalNotificationType.NewReply:
        return 'Replied to a thread';
      case OrbitalNotificationType.NewMedia:
        return 'Shared media';
      case OrbitalNotificationType.NewMessage:
        return 'Sent a message';
      case OrbitalNotificationType.MemberJoined:
        return 'Joined the orbit';
      default:
        return 'New activity';
    }
  }

  /**
   * Show a desktop notification
   */
  notify(data: OrbitalNotificationData): void {
    // Check if we should show this notification
    if (!this.#shouldShowNotification(data.type)) {
      log.info(`Notification type ${data.type} is disabled`);
      return;
    }

    // Don't show if app is focused/active
    if (this.#isAppActive()) {
      log.info('App is active, skipping notification');
      return;
    }

    // Format notification based on privacy settings
    const { title, body } = this.#formatNotification(data);

    log.info('Showing notification:', { type: data.type, title });

    // Close previous notification
    if (this.#lastNotification) {
      this.#lastNotification.close();
      this.#lastNotification = null;
    }

    try {
      // Use Electron's Notification API
      const notification = new window.Notification(title, {
        body: isLinux() ? this.#filterText(body) : body,
        icon: data.iconUrl,
        silent: true, // We handle sound separately
        tag: data.threadId || data.conversationId || 'orbital',
      });

      notification.onclick = () => {
        log.info('Notification clicked:', data.type);
        // Focus the window
        window.IPC?.showWindow?.();

        // Navigate to the relevant content
        this.#handleNotificationClick(data);
      };

      this.#lastNotification = notification;

      // Play sound if enabled
      if (this.#settings.soundEnabled) {
        drop(new Sound({ soundType: SoundType.Pop }).play());
      }
    } catch (error) {
      log.error('Failed to show notification:', error);
    }
  }

  /**
   * Handle notification click - navigate to relevant content
   */
  #handleNotificationClick(data: OrbitalNotificationData): void {
    // Emit custom event for the app to handle navigation
    const event = new CustomEvent('orbital-notification-click', {
      detail: {
        type: data.type,
        threadId: data.threadId,
        orbitId: data.orbitId,
        conversationId: data.conversationId,
      },
    });
    window.dispatchEvent(event);
  }

  /**
   * Filter text for Linux notifications (escape HTML entities)
   */
  #filterText(text: string): string {
    return (text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Clear any active notifications
   */
  clear(): void {
    if (this.#lastNotification) {
      this.#lastNotification.close();
      this.#lastNotification = null;
    }
  }

  // =========================================================================
  // Convenience methods for specific notification types
  // =========================================================================

  /**
   * Show notification for a new thread
   */
  notifyNewThread(params: {
    threadId: string;
    orbitId: string;
    title: string;
    authorName: string;
    orbitName?: string;
  }): void {
    this.notify({
      type: OrbitalNotificationType.NewThread,
      title: params.orbitName
        ? `New thread in ${params.orbitName}`
        : 'New thread',
      body: `${params.authorName}: ${params.title}`,
      threadId: params.threadId,
      orbitId: params.orbitId,
      authorName: params.authorName,
    });
  }

  /**
   * Show notification for a new reply
   */
  notifyNewReply(params: {
    threadId: string;
    orbitId: string;
    threadTitle: string;
    authorName: string;
    replyPreview?: string;
  }): void {
    this.notify({
      type: OrbitalNotificationType.NewReply,
      title: `Reply to "${params.threadTitle}"`,
      body: params.replyPreview
        ? `${params.authorName}: ${params.replyPreview}`
        : `${params.authorName} replied`,
      threadId: params.threadId,
      orbitId: params.orbitId,
      authorName: params.authorName,
    });
  }

  /**
   * Show notification for new media
   */
  notifyNewMedia(params: {
    threadId?: string;
    orbitId: string;
    authorName: string;
    mediaType?: 'image' | 'video';
  }): void {
    const mediaLabel = params.mediaType === 'video' ? 'a video' : 'media';
    this.notify({
      type: OrbitalNotificationType.NewMedia,
      title: 'New media shared',
      body: `${params.authorName} shared ${mediaLabel}`,
      threadId: params.threadId,
      orbitId: params.orbitId,
      authorName: params.authorName,
    });
  }

  /**
   * Show notification for a new direct message
   */
  notifyNewMessage(params: {
    conversationId: string;
    authorName: string;
    messagePreview?: string;
  }): void {
    this.notify({
      type: OrbitalNotificationType.NewMessage,
      title: params.authorName,
      body: params.messagePreview || 'Sent a message',
      conversationId: params.conversationId,
      authorName: params.authorName,
    });
  }

  /**
   * Show notification when a member joins
   */
  notifyMemberJoined(params: {
    orbitId: string;
    memberName: string;
    orbitName?: string;
  }): void {
    this.notify({
      type: OrbitalNotificationType.MemberJoined,
      title: params.orbitName || 'Orbit',
      body: `${params.memberName} joined the orbit`,
      orbitId: params.orbitId,
      authorName: params.memberName,
    });
  }
}

// Export singleton instance
export const orbitalNotifications = new OrbitalNotificationService();

// Export types
export type { OrbitalNotificationService };
