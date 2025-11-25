// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import { OrbitalSettingsPage } from '../../types/Nav.std';
import { OrbitalSettingsGeneral } from './OrbitalSettingsGeneral';
import { OrbitalSettingsAppearance } from './OrbitalSettingsAppearance';
import { OrbitalSettingsNotifications } from './OrbitalSettingsNotifications';
import { OrbitalSettingsPrivacy } from './OrbitalSettingsPrivacy';
import { OrbitalSettingsInvites } from './OrbitalSettingsInvites';
import { OrbitalSettingsFiles } from './OrbitalSettingsFiles';

export type OrbitalSettingsProps = {
  page: OrbitalSettingsPage;
};

const PAGE_TITLES: Record<OrbitalSettingsPage, string> = {
  [OrbitalSettingsPage.General]: 'General',
  [OrbitalSettingsPage.Appearance]: 'Appearance',
  [OrbitalSettingsPage.Notifications]: 'Notifications',
  [OrbitalSettingsPage.Privacy]: 'Privacy',
  [OrbitalSettingsPage.Invites]: 'Invite Friends',
  [OrbitalSettingsPage.Files]: 'File Library',
};

export function OrbitalSettings({ page }: OrbitalSettingsProps): JSX.Element {
  const renderPage = (): JSX.Element => {
    switch (page) {
      case OrbitalSettingsPage.General:
        return <OrbitalSettingsGeneral />;
      case OrbitalSettingsPage.Appearance:
        return <OrbitalSettingsAppearance />;
      case OrbitalSettingsPage.Notifications:
        return <OrbitalSettingsNotifications />;
      case OrbitalSettingsPage.Privacy:
        return <OrbitalSettingsPrivacy />;
      case OrbitalSettingsPage.Invites:
        return <OrbitalSettingsInvites />;
      case OrbitalSettingsPage.Files:
        return <OrbitalSettingsFiles />;
      default:
        return <OrbitalSettingsGeneral />;
    }
  };

  return (
    <div className="OrbitalSettings">
      <div className="OrbitalSettings__header">
        <h2>{PAGE_TITLES[page]}</h2>
      </div>
      <div className="OrbitalSettings__content">{renderPage()}</div>
    </div>
  );
}
