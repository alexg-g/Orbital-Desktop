// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import { OrbitalSettingsSection } from './OrbitalSettingsControl';
import { OrbitalMediaRecovery } from './OrbitalMediaRecovery';
import { OrbitalFileBrowser } from './OrbitalFileBrowser';
import type { GroupInfo } from '../../services/orbitalGroups.preload';
import type { MediaSyncRequest, MediaSyncTimeRange } from '../../types/OrbitalMediaSync.std';
import type {
  OrbitalFileBrowserItem,
  GetOrbitalFileBrowserMediaOptions,
  GetOrbitalFileBrowserMediaResult,
} from '../../types/OrbitalFileBrowser.std';

export type OrbitalSettingsFilesProps = {
  /** List of all groups user is a member of */
  groups: GroupInfo[];
  /** Currently selected group ID */
  selectedGroupId?: string | null;
  /** Callback when user selects a different orbit (syncs with Switch Orbit menu) */
  onSelectOrbit?: (groupId: string) => void;
  /** Callback to create sync request */
  onCreateRequest: (params: {
    groupId: string;
    timeRange: MediaSyncTimeRange;
    maxBytes?: number;
  }) => Promise<MediaSyncRequest>;
  /** Callback to get active requests */
  onGetActiveRequests: () => Promise<MediaSyncRequest[]>;
  /** Callback to cancel a request */
  onCancelRequest: (requestId: string) => Promise<void>;
  /** Callback to download ready items */
  onDownloadReadyItems: (requestId: string) => Promise<void>;
  /** Format bytes for display */
  formatBytes: (bytes: number) => string;
  /** Callback when user clicks a media item in the file browser */
  onFileBrowserItemClick?: (item: OrbitalFileBrowserItem) => void;
  /** Function to convert relative paths to absolute paths */
  getAbsoluteAttachmentPath?: (relativePath: string) => string;
  /** Function to fetch media items for the file browser */
  getFileBrowserMedia: (
    options: GetOrbitalFileBrowserMediaOptions
  ) => Promise<GetOrbitalFileBrowserMediaResult>;
};

export function OrbitalSettingsFiles({
  groups,
  selectedGroupId,
  onSelectOrbit,
  onCreateRequest,
  onGetActiveRequests,
  onCancelRequest,
  onDownloadReadyItems,
  formatBytes,
  onFileBrowserItemClick,
  getAbsoluteAttachmentPath,
  getFileBrowserMedia,
}: OrbitalSettingsFilesProps): JSX.Element {
  return (
    <div className="OrbitalSettingsFiles">
      <OrbitalSettingsSection title="Media Recovery">
        <OrbitalMediaRecovery
          groups={groups}
          selectedGroupId={selectedGroupId ?? undefined}
          onSelectOrbit={onSelectOrbit}
          onCreateRequest={onCreateRequest}
          onGetActiveRequests={onGetActiveRequests}
          onCancelRequest={onCancelRequest}
          onDownloadReadyItems={onDownloadReadyItems}
          formatBytes={formatBytes}
        />
      </OrbitalSettingsSection>

      <OrbitalSettingsSection title="Browse Media">
        <OrbitalFileBrowser
          groups={groups}
          selectedGroupId={selectedGroupId}
          onSelectOrbit={onSelectOrbit}
          onItemClick={onFileBrowserItemClick}
          getAbsoluteAttachmentPath={getAbsoluteAttachmentPath}
          getFileBrowserMedia={getFileBrowserMedia}
        />
      </OrbitalSettingsSection>
    </div>
  );
}
