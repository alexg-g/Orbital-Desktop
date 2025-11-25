// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import { OrbitalSettingsPage } from '../../types/Nav.std';

export type OrbitalSettingsNavProps = {
  activePage: OrbitalSettingsPage;
  onPageSelect: (page: OrbitalSettingsPage) => void;
  onBack: () => void;
};

type SettingsNavItem = {
  page: OrbitalSettingsPage;
  label: string;
  emoji: string;
};

const SETTINGS_NAV_ITEMS: Array<SettingsNavItem> = [
  { page: OrbitalSettingsPage.General, label: 'General', emoji: '⚙️' },
  { page: OrbitalSettingsPage.Appearance, label: 'Appearance', emoji: '🎨' },
  { page: OrbitalSettingsPage.Notifications, label: 'Notifications', emoji: '🔔' },
  { page: OrbitalSettingsPage.Privacy, label: 'Privacy', emoji: '🔒' },
  { page: OrbitalSettingsPage.Invites, label: 'Invite Friends', emoji: '👥' },
  { page: OrbitalSettingsPage.Files, label: 'File Library', emoji: '📁' },
];

export function OrbitalSettingsNav({
  activePage,
  onPageSelect,
  onBack,
}: OrbitalSettingsNavProps): JSX.Element {
  return (
    <div className="OrbitalSettingsNav">
      <div className="OrbitalSettingsNav__header">
        <button
          type="button"
          className="OrbitalSettingsNav__back-button"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          ← Back
        </button>
        <h2>Settings</h2>
      </div>
      <div className="OrbitalSettingsNav__items">
        {SETTINGS_NAV_ITEMS.map(({ page, label, emoji }) => (
          <button
            key={page}
            type="button"
            className={`OrbitalSettingsNav__item ${
              activePage === page ? 'OrbitalSettingsNav__item--active' : ''
            }`}
            onClick={() => onPageSelect(page)}
          >
            <span className="OrbitalSettingsNav__item-icon">{emoji}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
