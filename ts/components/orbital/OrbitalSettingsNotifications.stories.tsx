// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import type { Meta } from '@storybook/react';
import { OrbitalSettingsNotifications } from './OrbitalSettingsNotifications';

export default {
  title: 'Orbital/Settings/Notifications',
  component: OrbitalSettingsNotifications,
  decorators: [
    (Story) => (
      <div style={{
        padding: '24px',
        maxWidth: '600px',
        backgroundColor: '#FAF9F7',
        minHeight: '400px',
      }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

/**
 * Default notification settings panel
 */
export function Default(): JSX.Element {
  return <OrbitalSettingsNotifications />;
}

/**
 * Settings panel in dark mode context (simulated)
 */
export function DarkMode(): JSX.Element {
  return (
    <div style={{
      backgroundColor: '#1a1a1a',
      padding: '24px',
      minHeight: '400px',
    }}>
      <div className="dark-theme">
        <OrbitalSettingsNotifications />
      </div>
    </div>
  );
}

/**
 * Narrow width (mobile-like)
 */
export function NarrowWidth(): JSX.Element {
  return (
    <div style={{
      maxWidth: '320px',
      padding: '16px',
      backgroundColor: '#FAF9F7',
    }}>
      <OrbitalSettingsNotifications />
    </div>
  );
}
