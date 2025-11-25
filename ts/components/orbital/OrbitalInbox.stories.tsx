// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState } from 'react';
import type { Meta } from '@storybook/react';
import { OrbitalSettings } from './OrbitalSettings';
import { OrbitalSettingsNav } from './OrbitalSettingsNav';
import { OrbitalSettingsPage } from '../../types/Nav.std';

export default {
  title: 'Orbital/Settings',
  component: OrbitalSettings,
} satisfies Meta;

/**
 * Full Settings UI - Dual panel layout
 *
 * Shows the complete Orbital settings interface with:
 * - Settings navigation sidebar
 * - Settings content panel
 * - All settings pages (General, Appearance, Notifications, Privacy, Invites, Files)
 */
export function FullSettingsUI(): JSX.Element {
  const [activePage, setActivePage] = useState<OrbitalSettingsPage>(
    OrbitalSettingsPage.General
  );

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: '#FAF9F7',
        fontFamily: 'Verdana, sans-serif',
      }}
    >
      {/* Settings Navigation Sidebar */}
      <div
        style={{
          width: '320px',
          borderRight: '2px solid #D1D5DB',
          background: '#FAF9F7',
        }}
      >
        <OrbitalSettingsNav
          activePage={activePage}
          onPageSelect={setActivePage}
          onBack={() => alert('Back to inbox clicked!')}
        />
      </div>

      {/* Settings Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <OrbitalSettings page={activePage} />
      </div>
    </div>
  );
}

/**
 * General Settings Page
 */
export function GeneralSettings(): JSX.Element {
  return (
    <div style={{ maxWidth: '800px', padding: '20px' }}>
      <OrbitalSettings page={OrbitalSettingsPage.General} />
    </div>
  );
}

/**
 * Appearance Settings Page
 */
export function AppearanceSettings(): JSX.Element {
  return (
    <div style={{ maxWidth: '800px', padding: '20px' }}>
      <OrbitalSettings page={OrbitalSettingsPage.Appearance} />
    </div>
  );
}

/**
 * Notifications Settings Page
 */
export function NotificationsSettings(): JSX.Element {
  return (
    <div style={{ maxWidth: '800px', padding: '20px' }}>
      <OrbitalSettings page={OrbitalSettingsPage.Notifications} />
    </div>
  );
}

/**
 * Privacy Settings Page
 */
export function PrivacySettings(): JSX.Element {
  return (
    <div style={{ maxWidth: '800px', padding: '20px' }}>
      <OrbitalSettings page={OrbitalSettingsPage.Privacy} />
    </div>
  );
}

/**
 * Invites Settings Page
 */
export function InvitesSettings(): JSX.Element {
  return (
    <div style={{ maxWidth: '800px', padding: '20px' }}>
      <OrbitalSettings page={OrbitalSettingsPage.Invites} />
    </div>
  );
}

/**
 * Files Settings Page (Coming Soon)
 */
export function FilesSettings(): JSX.Element {
  return (
    <div style={{ maxWidth: '800px', padding: '20px' }}>
      <OrbitalSettings page={OrbitalSettingsPage.Files} />
    </div>
  );
}

/**
 * Settings Navigation Only
 */
export function SettingsNavOnly(): JSX.Element {
  const [activePage, setActivePage] = useState<OrbitalSettingsPage>(
    OrbitalSettingsPage.General
  );

  return (
    <div style={{ width: '320px', height: '600px', border: '2px solid #D1D5DB' }}>
      <OrbitalSettingsNav
        activePage={activePage}
        onPageSelect={setActivePage}
        onBack={() => alert('Back clicked!')}
      />
    </div>
  );
}

/**
 * Dark Mode - Full Settings UI
 *
 * Shows settings in dark mode theme
 */
export function DarkModeSettings(): JSX.Element {
  const [activePage, setActivePage] = useState<OrbitalSettingsPage>(
    OrbitalSettingsPage.Appearance
  );

  return (
    <div
      className="dark-theme"
      style={{
        display: 'flex',
        height: '100vh',
        background: '#1B1B1B',
        fontFamily: 'Verdana, sans-serif',
      }}
    >
      {/* Settings Navigation Sidebar */}
      <div
        style={{
          width: '320px',
          borderRight: '2px solid #3D3D3D',
          background: '#1B1B1B',
        }}
      >
        <OrbitalSettingsNav
          activePage={activePage}
          onPageSelect={setActivePage}
          onBack={() => alert('Back to inbox clicked!')}
        />
      </div>

      {/* Settings Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <OrbitalSettings page={activePage} />
      </div>
    </div>
  );
}
