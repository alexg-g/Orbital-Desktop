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
import type { MediaSyncRequest, MediaSyncTimeRange } from '../../types/OrbitalMediaSync.std';
import type { OrbitalFileBrowserItem } from '../../types/OrbitalFileBrowser.std.js';

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
  // Logout handler (for General page)
  onLogout?: () => void;
  // Media sync handlers (for Files page)
  onCreateSyncRequest?: (params: {
    groupId: string;
    timeRange: MediaSyncTimeRange;
    maxBytes?: number;
  }) => Promise<MediaSyncRequest>;
  onGetActiveSyncRequests?: () => Promise<MediaSyncRequest[]>;
  onCancelSyncRequest?: (requestId: string) => Promise<void>;
  onDownloadReadyItems?: (requestId: string) => Promise<void>;
  formatBytes?: (bytes: number) => string;
  // File browser handlers (for Files page)
  onFileBrowserItemClick?: (item: OrbitalFileBrowserItem) => void;
  getAbsoluteAttachmentPath?: (relativePath: string) => string;
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

// Default no-op for required callbacks
const defaultNoOp = async () => { throw new Error('Not implemented'); };
const defaultFormatBytes = (bytes: number) => `${bytes} bytes`;

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
  onLogout,
  onCreateSyncRequest = defaultNoOp,
  onGetActiveSyncRequests = async () => [],
  onCancelSyncRequest = defaultNoOp,
  onDownloadReadyItems = defaultNoOp,
  formatBytes = defaultFormatBytes,
  onFileBrowserItemClick,
  getAbsoluteAttachmentPath,
}: OrbitalSettingsProps): JSX.Element {
  const renderPage = (): JSX.Element => {
    switch (page) {
      case OrbitalSettingsPage.General:
        return <OrbitalSettingsGeneral onLogout={onLogout} />;
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
        return (
          <OrbitalSettingsFiles
            groups={groups}
            selectedGroupId={selectedGroupId}
            onSelectOrbit={onSelectOrbit}
            onCreateRequest={onCreateSyncRequest}
            onGetActiveRequests={onGetActiveSyncRequests}
            onCancelRequest={onCancelSyncRequest}
            onDownloadReadyItems={onDownloadReadyItems}
            formatBytes={formatBytes}
            onFileBrowserItemClick={onFileBrowserItemClick}
            getAbsoluteAttachmentPath={getAbsoluteAttachmentPath}
          />
        );
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
        return <OrbitalSettingsGeneral onLogout={onLogout} />;
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
