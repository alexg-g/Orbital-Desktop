// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  OrbitalToggle,
  OrbitalSelect,
  OrbitalSettingsSection,
  OrbitalSettingsButton,
} from './OrbitalSettingsControl';
import { getSetting, setSetting } from './settingsStorage';

export function OrbitalSettingsGeneral(): JSX.Element {
  // Local state for settings
  const [startMinimized, setStartMinimized] = useState(false);
  const [showInSystemTray, setShowInSystemTray] = useState(true);
  const [language, setLanguage] = useState('en');
  const [autoUpdate, setAutoUpdate] = useState(true);

  // Avatar state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('You');
  const [isEditingName, setIsEditingName] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = () => {
      try {
        setStartMinimized(getSetting('orbital.settings.general.startMinimized', false) ?? false);
        setShowInSystemTray(getSetting('orbital.settings.general.showInSystemTray', true) ?? true);
        setLanguage(getSetting('orbital.settings.general.language', 'en') ?? 'en');
        setAutoUpdate(getSetting('orbital.settings.general.autoUpdate', true) ?? true);
        setDisplayName(getSetting('orbital.settings.general.displayName', 'You') ?? 'You');
        const savedAvatarUrl = getSetting('orbital.settings.general.avatarUrl', null);
        if (savedAvatarUrl) {
          setAvatarUrl(savedAvatarUrl);
        }
      } catch (error) {
        console.error('Failed to load general settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleStartMinimizedChange = useCallback(async (value: boolean) => {
    setStartMinimized(value);
    try {
      await setSetting('orbital.settings.general.startMinimized', value);
      console.log('Start minimized setting saved:', value);
    } catch (error) {
      console.error('Failed to save startMinimized setting:', error);
    }
  }, []);

  const handleSystemTrayChange = useCallback(async (value: boolean) => {
    setShowInSystemTray(value);
    try {
      await setSetting('orbital.settings.general.showInSystemTray', value);
      console.log('Show in system tray setting saved:', value);
    } catch (error) {
      console.error('Failed to save showInSystemTray setting:', error);
    }
  }, []);

  const handleLanguageChange = useCallback(async (value: string) => {
    setLanguage(value);
    try {
      await setSetting('orbital.settings.general.language', value);
      console.log('Language setting saved:', value);
      // TODO: Trigger locale change in the app
    } catch (error) {
      console.error('Failed to save language setting:', error);
    }
  }, []);

  const handleAutoUpdateChange = useCallback(async (value: boolean) => {
    setAutoUpdate(value);
    try {
      await setSetting('orbital.settings.general.autoUpdate', value);
      console.log('Auto update setting saved:', value);
    } catch (error) {
      console.error('Failed to save autoUpdate setting:', error);
    }
  }, []);

  const handleAvatarClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image must be less than 5MB');
        return;
      }

      // Create preview URL
      const url = URL.createObjectURL(file);
      setAvatarUrl(url);

      try {
        await setSetting('orbital.settings.general.avatarUrl', url);
        console.log('Avatar selected and saved:', file.name);
      } catch (error) {
        console.error('Failed to save avatar URL:', error);
      }
    }
  }, []);

  const handleRemoveAvatar = useCallback(async () => {
    if (avatarUrl) {
      URL.revokeObjectURL(avatarUrl);
    }
    setAvatarUrl(null);

    try {
      await setSetting('orbital.settings.general.avatarUrl', null);
      console.log('Avatar removed');
    } catch (error) {
      console.error('Failed to remove avatar from storage:', error);
    }
  }, [avatarUrl]);

  const handleNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayName(event.target.value);
  }, []);

  const handleNameBlur = useCallback(async () => {
    setIsEditingName(false);
    try {
      await setSetting('orbital.settings.general.displayName', displayName);
      console.log('Display name saved:', displayName);
    } catch (error) {
      console.error('Failed to save display name:', error);
    }
  }, [displayName]);

  const handleNameKeyDown = useCallback(async (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      setIsEditingName(false);
      try {
        await setSetting('orbital.settings.general.displayName', displayName);
        console.log('Display name saved:', displayName);
      } catch (error) {
        console.error('Failed to save display name:', error);
      }
    }
  }, [displayName]);

  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'ja', label: '日本語' },
    { value: 'zh', label: '中文' },
  ];

  // Get initials for placeholder avatar
  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="OrbitalSettingsGeneral">
      <OrbitalSettingsSection title="Profile">
        <div className="OrbitalSettingsGeneral__profile">
          <div className="OrbitalSettingsGeneral__avatar-section">
            <button
              type="button"
              className="OrbitalSettingsGeneral__avatar"
              onClick={handleAvatarClick}
              aria-label="Change avatar"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Your avatar"
                  className="OrbitalSettingsGeneral__avatar-image"
                />
              ) : (
                <span className="OrbitalSettingsGeneral__avatar-placeholder">
                  {getInitials(displayName)}
                </span>
              )}
              <div className="OrbitalSettingsGeneral__avatar-overlay">
                <span>📷</span>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="OrbitalSettingsGeneral__file-input"
              aria-hidden="true"
            />
          </div>
          <div className="OrbitalSettingsGeneral__profile-info">
            <div className="OrbitalSettingsGeneral__name-row">
              {isEditingName ? (
                <input
                  type="text"
                  value={displayName}
                  onChange={handleNameChange}
                  onBlur={handleNameBlur}
                  onKeyDown={handleNameKeyDown}
                  className="OrbitalSettingsGeneral__name-input"
                  autoFocus
                  maxLength={32}
                />
              ) : (
                <button
                  type="button"
                  className="OrbitalSettingsGeneral__name-button"
                  onClick={() => setIsEditingName(true)}
                >
                  <span className="OrbitalSettingsGeneral__name">{displayName}</span>
                  <span className="OrbitalSettingsGeneral__edit-icon">✏️</span>
                </button>
              )}
            </div>
            <p className="OrbitalSettingsGeneral__profile-hint">
              Click on your avatar to change it, or click your name to edit it.
            </p>
          </div>
        </div>
        <div className="OrbitalSettingsGeneral__avatar-actions">
          <OrbitalSettingsButton
            label="Upload New Avatar"
            onClick={handleAvatarClick}
            variant="secondary"
          />
          {avatarUrl && (
            <OrbitalSettingsButton
              label="Remove Avatar"
              onClick={handleRemoveAvatar}
              variant="danger"
            />
          )}
        </div>
      </OrbitalSettingsSection>

      <OrbitalSettingsSection title="Startup">
        <OrbitalToggle
          label="Start minimized"
          description="Launch Orbital in the background when your computer starts"
          checked={startMinimized}
          onChange={handleStartMinimizedChange}
        />
        <OrbitalToggle
          label="Show in system tray"
          description="Keep Orbital accessible from the system tray"
          checked={showInSystemTray}
          onChange={handleSystemTrayChange}
        />
      </OrbitalSettingsSection>

      <OrbitalSettingsSection title="Language">
        <OrbitalSelect
          label="Application language"
          description="Choose your preferred language for the Orbital interface"
          options={languageOptions}
          value={language}
          onChange={handleLanguageChange}
        />
      </OrbitalSettingsSection>

      <OrbitalSettingsSection title="Updates">
        <OrbitalToggle
          label="Automatic updates"
          description="Automatically download and install updates"
          checked={autoUpdate}
          onChange={handleAutoUpdateChange}
        />
      </OrbitalSettingsSection>
    </div>
  );
}
