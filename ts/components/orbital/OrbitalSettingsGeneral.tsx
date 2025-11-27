// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  OrbitalToggle,
  OrbitalSelect,
  OrbitalSettingsSection,
  OrbitalSettingsButton,
} from './OrbitalSettingsControl';
import { getSetting, setSetting, validateDisplayName, sanitizeDisplayName } from './settingsStorage';
import { logout, getUsername } from '../../services/orbitalAuth.preload.js';

export type OrbitalSettingsGeneralProps = {
  onLogout?: () => void;
};

export function OrbitalSettingsGeneral({
  onLogout,
}: OrbitalSettingsGeneralProps): JSX.Element {
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

  // Account state
  const [loggedInUsername, setLoggedInUsername] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
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

        // Load logged-in username
        const username = await getUsername();
        setLoggedInUsername(username);
      } catch (error) {
        console.error('Failed to load general settings:', error);
      }
    };
    loadSettings();
  }, []);

  // Handle logout
  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;

    const confirmed = window.confirm(
      'Are you sure you want to log out? You will need to log in again to access Orbital.'
    );

    if (!confirmed) return;

    setIsLoggingOut(true);
    try {
      await logout();
      // Notify parent to update auth state and show login screen
      if (onLogout) {
        onLogout();
      }
    } catch (error) {
      console.error('Failed to logout:', error);
      setIsLoggingOut(false);
    }
  }, [isLoggingOut, onLogout]);

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

      // Validate file size (max 1.5MB for base64 storage)
      if (file.size > 1.5 * 1024 * 1024) {
        alert('Image must be less than 1.5MB');
        return;
      }

      // Convert file to base64 data URL for persistent storage
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          setAvatarUrl(dataUrl);
          try {
            await setSetting('orbital.settings.general.avatarUrl', dataUrl);
            console.log('Avatar saved as base64:', file.name);
          } catch (error) {
            console.error('Failed to save avatar:', error);
          }
        }
      };
      reader.onerror = () => {
        console.error('Failed to read avatar file');
        alert('Failed to read image file');
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleRemoveAvatar = useCallback(async () => {
    setAvatarUrl(null);

    try {
      await setSetting('orbital.settings.general.avatarUrl', null);
      console.log('Avatar removed');
    } catch (error) {
      console.error('Failed to remove avatar from storage:', error);
    }
  }, [avatarUrl]);

  const handleNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setDisplayName(newValue);
    // Clear error while typing
    setNameError(null);
  }, []);

  const saveDisplayName = useCallback(async (name: string) => {
    // Validate the name
    const validation = validateDisplayName(name);
    if (!validation.valid) {
      setNameError(validation.error || 'Invalid name');
      // Sanitize and save anyway to prevent losing the name
      const sanitized = sanitizeDisplayName(name);
      setDisplayName(sanitized);
      try {
        await setSetting('orbital.settings.general.displayName', sanitized);
        console.log('Display name sanitized and saved:', sanitized);
      } catch (error) {
        console.error('Failed to save display name:', error);
      }
      return;
    }

    setNameError(null);
    try {
      await setSetting('orbital.settings.general.displayName', name);
      console.log('Display name saved:', name);
    } catch (error) {
      console.error('Failed to save display name:', error);
    }
  }, []);

  const handleNameBlur = useCallback(async () => {
    setIsEditingName(false);
    await saveDisplayName(displayName);
  }, [displayName, saveDisplayName]);

  const handleNameKeyDown = useCallback(async (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      setIsEditingName(false);
      await saveDisplayName(displayName);
    }
  }, [displayName, saveDisplayName]);

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
                  maxLength={15}
                  placeholder="Enter your display name"
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
            {nameError && (
              <p className="OrbitalSettingsGeneral__name-error">{nameError}</p>
            )}
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

      <OrbitalSettingsSection title="Account">
        <div className="OrbitalSettingsGeneral__account">
          {loggedInUsername && (
            <p className="OrbitalSettingsGeneral__account-info">
              Logged in as <strong>{loggedInUsername}</strong>
            </p>
          )}
          <OrbitalSettingsButton
            label={isLoggingOut ? 'Logging out...' : 'Log Out'}
            onClick={handleLogout}
            variant="danger"
            disabled={isLoggingOut}
          />
        </div>
      </OrbitalSettingsSection>
    </div>
  );
}
