// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback, useEffect } from 'react';
import {
  OrbitalToggle,
  OrbitalSettingsSection,
} from './OrbitalSettingsControl';
import { getSetting, setSetting } from './settingsStorage';

export function OrbitalSettingsPrivacy(): JSX.Element {
  // Local state for settings
  const [readReceipts, setReadReceipts] = useState(true);
  const [typingIndicators, setTypingIndicators] = useState(true);
  const [screenLock, setScreenLock] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = () => {
      try {
        setReadReceipts(getSetting('orbital.settings.privacy.readReceipts', true) ?? true);
        setTypingIndicators(getSetting('orbital.settings.privacy.typingIndicators', true) ?? true);
        setScreenLock(getSetting('orbital.settings.privacy.screenLock', false) ?? false);
      } catch (error) {
        console.error('Failed to load privacy settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleReadReceiptsChange = useCallback(async (value: boolean) => {
    setReadReceipts(value);
    try {
      await setSetting('orbital.settings.privacy.readReceipts', value);
      console.log('Read receipts setting saved:', value);
    } catch (error) {
      console.error('Failed to save privacy.readReceipts setting:', error);
    }
  }, []);

  const handleTypingIndicatorsChange = useCallback(async (value: boolean) => {
    setTypingIndicators(value);
    try {
      await setSetting('orbital.settings.privacy.typingIndicators', value);
      console.log('Typing indicators setting saved:', value);
    } catch (error) {
      console.error('Failed to save privacy.typingIndicators setting:', error);
    }
  }, []);

  const handleScreenLockChange = useCallback(async (value: boolean) => {
    setScreenLock(value);
    try {
      await setSetting('orbital.settings.privacy.screenLock', value);
      console.log('Screen lock setting saved:', value);
      // TODO: Configure actual screen lock functionality
    } catch (error) {
      console.error('Failed to save privacy.screenLock setting:', error);
    }
  }, []);

  return (
    <div className="OrbitalSettingsPrivacy">
      <OrbitalSettingsSection title="Activity Status">
        <OrbitalToggle
          label="Read receipts"
          description="Let others know when you've read their messages. If disabled, you won't see read receipts from others either."
          checked={readReceipts}
          onChange={handleReadReceiptsChange}
        />
        <OrbitalToggle
          label="Typing indicators"
          description="Show others when you're typing. If disabled, you won't see when others are typing either."
          checked={typingIndicators}
          onChange={handleTypingIndicatorsChange}
        />
      </OrbitalSettingsSection>

      <OrbitalSettingsSection title="Security">
        <OrbitalToggle
          label="Screen lock"
          description="Require your system password to view Orbital after inactivity"
          checked={screenLock}
          onChange={handleScreenLockChange}
        />
      </OrbitalSettingsSection>

      <OrbitalSettingsSection title="About">
        <div className="OrbitalSettingsPrivacy__info">
          <p>
            <strong>End-to-end encryption</strong>
          </p>
          <p>
            All messages and media in Orbital are protected with Signal Protocol
            end-to-end encryption. Only you and your family can read your messages.
          </p>
        </div>
      </OrbitalSettingsSection>
    </div>
  );
}
