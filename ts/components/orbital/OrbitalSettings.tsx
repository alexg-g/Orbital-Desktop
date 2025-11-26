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
import { OrbitalSettingsOrbit } from './OrbitalSettingsOrbit';
import type { GroupInfo } from '../../services/orbitalGroups.preload.js';

export type OrbitalSettingsProps = {
  page: OrbitalSettingsPage;
  // Orbit-related props (optional, only needed for Orbit page)
  groups?: GroupInfo[];
  selectedGroupId?: string | null;
  currentGroup?: GroupInfo | null;
  isLoadingGroups?: boolean;
  groupsError?: string;
  onSelectOrbit?: (groupId: string) => void;
  onCreateOrbit?: () => void;
  onJoinOrbit?: () => void;
};

const PAGE_TITLES: Record<OrbitalSettingsPage, string> = {
  [OrbitalSettingsPage.General]: 'General',
  [OrbitalSettingsPage.Appearance]: 'Appearance',
  [OrbitalSettingsPage.Notifications]: 'Notifications',
  [OrbitalSettingsPage.Privacy]: 'Privacy',
  [OrbitalSettingsPage.Invites]: 'Invite Friends',
  [OrbitalSettingsPage.Files]: 'File Library',
  [OrbitalSettingsPage.Orbit]: 'Switch Orbit',
};

export function OrbitalSettings({
  page,
  groups = [],
  selectedGroupId = null,
  currentGroup = null,
  isLoadingGroups = false,
  groupsError,
  onSelectOrbit = () => {},
  onCreateOrbit = () => {},
  onJoinOrbit = () => {},
}: OrbitalSettingsProps): JSX.Element {
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
        return (
          <OrbitalSettingsInvites
            currentGroup={currentGroup}
            onCreateOrbit={onCreateOrbit}
          />
        );
      case OrbitalSettingsPage.Files:
        return <OrbitalSettingsFiles />;
      case OrbitalSettingsPage.Orbit:
        return (
          <OrbitalSettingsOrbit
            groups={groups}
            selectedGroupId={selectedGroupId}
            currentGroup={currentGroup}
            isLoading={isLoadingGroups}
            error={groupsError}
            onSelectOrbit={onSelectOrbit}
            onCreateOrbit={onCreateOrbit}
            onJoinOrbit={onJoinOrbit}
          />
        );
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
