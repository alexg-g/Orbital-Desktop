// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback, useEffect } from 'react';
import {
  OrbitalSelect,
  OrbitalSettingsSection,
} from './OrbitalSettingsControl';
import { getSetting, setSetting } from './settingsStorage';

export function OrbitalSettingsAppearance(): JSX.Element {
  // Local state for settings
  const [theme, setTheme] = useState('system');
  const [fontSize, setFontSize] = useState('normal');

  // Load settings on mount
  useEffect(() => {
    const loadSettings = () => {
      try {
        const savedTheme = getSetting('orbital.settings.appearance.theme', 'system');
        if (savedTheme) {
          setTheme(savedTheme);
          applyTheme(savedTheme);
        }
        setFontSize(getSetting('orbital.settings.appearance.fontSize', 'normal') ?? 'normal');
      } catch (error) {
        console.error('Failed to load appearance settings:', error);
      }
    };
    loadSettings();
  }, []);

  // Helper function to apply theme to document
  const applyTheme = (value: string) => {
    const root = document.documentElement;
    if (value === 'dark') {
      root.classList.add('dark-theme');
      root.classList.remove('light-theme');
    } else if (value === 'light') {
      root.classList.remove('dark-theme');
      root.classList.add('light-theme');
    } else {
      // System preference
      root.classList.remove('dark-theme', 'light-theme');
    }
  };

  const handleThemeChange = useCallback(async (value: string) => {
    setTheme(value);
    applyTheme(value);

    try {
      await setSetting('orbital.settings.appearance.theme', value);
      console.log('Theme setting saved:', value);
    } catch (error) {
      console.error('Failed to save theme setting:', error);
    }
  }, []);

  const handleFontSizeChange = useCallback(async (value: string) => {
    setFontSize(value);
    try {
      await setSetting('orbital.settings.appearance.fontSize', value);
      console.log('Font size setting saved:', value);
      // TODO: Apply font size class to document
    } catch (error) {
      console.error('Failed to save fontSize setting:', error);
    }
  }, []);

  const themeOptions = [
    { value: 'system', label: 'System Default' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  const fontSizeOptions = [
    { value: 'small', label: 'Small' },
    { value: 'normal', label: 'Normal' },
    { value: 'large', label: 'Large' },
  ];

  return (
    <div className="OrbitalSettingsAppearance">
      <OrbitalSettingsSection title="Theme">
        <OrbitalSelect
          label="Color theme"
          description="Choose between light, dark, or match your system settings"
          options={themeOptions}
          value={theme}
          onChange={handleThemeChange}
        />
      </OrbitalSettingsSection>

      <OrbitalSettingsSection title="Text">
        <OrbitalSelect
          label="Font size"
          description="Adjust the text size throughout the application"
          options={fontSizeOptions}
          value={fontSize}
          onChange={handleFontSizeChange}
        />
      </OrbitalSettingsSection>
    </div>
  );
}
