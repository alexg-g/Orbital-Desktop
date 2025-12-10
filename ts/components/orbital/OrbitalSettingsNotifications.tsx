// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback, useEffect } from 'react';
import {
  OrbitalToggle,
  OrbitalSelect,
  OrbitalSettingsSection,
} from './OrbitalSettingsControl';
import { getSetting, setSetting } from './settingsStorage';

// Lazy import of notification service to avoid breaking Storybook
// The service uses Node.js modules that aren't available in browser
let orbitalNotifications: {
  updateSettings: (settings: { enabled?: boolean; soundEnabled?: boolean; showPreviews?: 'full' | 'name' | 'none' }) => void;
} | null = null;

// Only import in Electron environment
if (typeof window !== 'undefined' && window.IPC) {
  import('../../services/orbitalNotifications.preload.js').then(module => {
    orbitalNotifications = module.orbitalNotifications;
  }).catch(() => {
    // Silently fail in Storybook
  });
}

export function OrbitalSettingsNotifications(): JSX.Element {
  // Local state for settings
  const [desktopNotifications, setDesktopNotifications] = useState(true);
  const [notificationSound, setNotificationSound] = useState(true);
  const [notificationContent, setNotificationContent] = useState('full');

  // Load settings on mount
  useEffect(() => {
    const loadSettings = () => {
      try {
        setDesktopNotifications(getSetting('orbital.settings.notifications.enabled', true) ?? true);
        setNotificationSound(getSetting('orbital.settings.notifications.soundEnabled', true) ?? true);
        setNotificationContent(getSetting('orbital.settings.notifications.showPreviews', 'full') ?? 'full');
      } catch (error) {
        console.error('Failed to load notification settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleDesktopNotificationsChange = useCallback(async (value: boolean) => {
    setDesktopNotifications(value);
    try {
      await setSetting('orbital.settings.notifications.enabled', value);
      // Update the notification service in real-time
      orbitalNotifications.updateSettings({ enabled: value });
      console.log('Desktop notifications setting saved:', value);
    } catch (error) {
      console.error('Failed to save notifications.enabled setting:', error);
    }
  }, []);

  const handleNotificationSoundChange = useCallback(async (value: boolean) => {
    setNotificationSound(value);
    try {
      await setSetting('orbital.settings.notifications.soundEnabled', value);
      // Update the notification service in real-time
      orbitalNotifications.updateSettings({ soundEnabled: value });
      console.log('Notification sound setting saved:', value);
    } catch (error) {
      console.error('Failed to save notifications.soundEnabled setting:', error);
    }
  }, []);

  const handleNotificationContentChange = useCallback(async (value: string) => {
    setNotificationContent(value);
    try {
      await setSetting('orbital.settings.notifications.showPreviews', value);
      // Update the notification service in real-time
      orbitalNotifications.updateSettings({ showPreviews: value as 'full' | 'name' | 'none' });
      console.log('Notification content setting saved:', value);
    } catch (error) {
      console.error('Failed to save notifications.showPreviews setting:', error);
    }
  }, []);

  const notificationContentOptions = [
    { value: 'full', label: 'Show name and message' },
    { value: 'name', label: 'Show name only' },
    { value: 'none', label: 'No name or message' },
  ];

  return (
    <div className="OrbitalSettingsNotifications">
      <OrbitalSettingsSection title="Desktop Notifications">
        <OrbitalToggle
          label="Enable notifications"
          description="Show desktop notifications for new messages and replies"
          checked={desktopNotifications}
          onChange={handleDesktopNotificationsChange}
        />
        <OrbitalToggle
          label="Notification sounds"
          description="Play a sound when you receive a notification"
          checked={notificationSound}
          onChange={handleNotificationSoundChange}
          disabled={!desktopNotifications}
        />
      </OrbitalSettingsSection>

      <OrbitalSettingsSection title="Privacy">
        <OrbitalSelect
          label="Notification content"
          description="Control how much information is shown in notifications"
          options={notificationContentOptions}
          value={notificationContent}
          onChange={handleNotificationContentChange}
          disabled={!desktopNotifications}
        />
      </OrbitalSettingsSection>
    </div>
  );
}
