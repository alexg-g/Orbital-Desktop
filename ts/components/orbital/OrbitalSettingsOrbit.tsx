// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import { OrbitalSettingsSection } from './OrbitalSettingsControl';
import { GroupSelector } from './GroupSelector';
import type { GroupInfo } from '../../services/orbitalGroups.preload.js';

export type OrbitalSettingsOrbitProps = {
  groups: GroupInfo[];
  selectedGroupId: string | null;
  currentGroup: GroupInfo | null;
  isLoading: boolean;
  error?: string;
  onSelectOrbit: (groupId: string) => void;
  onCreateOrbit: () => void;
  onJoinOrbit: () => void;
};

/**
 * OrbitalSettingsOrbit - Settings page for switching between orbits
 *
 * Features:
 * - Shows current orbit name prominently
 * - Lists all user's orbits using GroupSelector
 * - Allows switching to a different orbit
 * - Create/Join orbit options
 */
export function OrbitalSettingsOrbit({
  groups,
  selectedGroupId,
  currentGroup,
  isLoading,
  error,
  onSelectOrbit,
  onCreateOrbit,
  onJoinOrbit,
}: OrbitalSettingsOrbitProps): JSX.Element {
  return (
    <div className="OrbitalSettingsOrbit">
      <OrbitalSettingsSection title="Current Orbit">
        {currentGroup ? (
          <div className="OrbitalSettingsOrbit__current">
            <span className="OrbitalSettingsOrbit__current-name">
              {currentGroup.name}
            </span>
            <span className="OrbitalSettingsOrbit__current-meta">
              {currentGroup.memberCount}{' '}
              {currentGroup.memberCount === 1 ? 'member' : 'members'}
              {currentGroup.isOwner && ' - You are the owner'}
            </span>
          </div>
        ) : (
          <div className="OrbitalSettingsOrbit__no-current">
            No orbit selected
          </div>
        )}
      </OrbitalSettingsSection>

      <OrbitalSettingsSection title="Your Orbits">
        <p className="OrbitalSettingsOrbit__description">
          Select a different orbit to switch to it. Your threads and content
          are organized separately for each orbit.
        </p>
        <GroupSelector
          groups={groups}
          selectedGroupId={selectedGroupId || undefined}
          isLoading={isLoading}
          error={error}
          onSelectGroup={onSelectOrbit}
          onCreateGroup={onCreateOrbit}
          onJoinGroup={onJoinOrbit}
        />
      </OrbitalSettingsSection>
    </div>
  );
}
