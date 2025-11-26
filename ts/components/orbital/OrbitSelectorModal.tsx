// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import type { LocalizerType } from '../../types/Util.std.js';
import { Modal } from '../Modal.dom.js';
import { GroupSelector } from './GroupSelector';
import type { GroupInfo } from '../../services/orbitalGroups.preload.js';

export type OrbitSelectorModalProps = {
  i18n: LocalizerType;
  groups: GroupInfo[];
  isLoading: boolean;
  error?: string;
  onSelectOrbit: (groupId: string) => void;
  onCreateOrbit: () => void;
  onJoinOrbit: () => void;
};

/**
 * OrbitSelectorModal - Modal shown after login to select an orbit
 *
 * Features:
 * - Wraps GroupSelector in a modal dialog
 * - No close button - user must select an orbit
 * - Title: "Select Your Orbit"
 * - Shows loading state while fetching groups
 * - Allows creating or joining new orbits
 */
export function OrbitSelectorModal({
  i18n,
  groups,
  isLoading,
  error,
  onSelectOrbit,
  onCreateOrbit,
  onJoinOrbit,
}: OrbitSelectorModalProps): JSX.Element {
  return (
    <Modal
      modalName="OrbitSelectorModal"
      i18n={i18n}
      title="Select Your Orbit"
      noEscapeClose
      noMouseClose
      padded={false}
    >
      <div className="OrbitSelectorModal">
        <p className="OrbitSelectorModal__description">
          Choose which orbit you'd like to view. Each orbit is a private space
          for your family to share memories together.
        </p>

        <GroupSelector
          groups={groups}
          isLoading={isLoading}
          error={error}
          onSelectGroup={onSelectOrbit}
          onCreateGroup={onCreateOrbit}
          onJoinGroup={onJoinOrbit}
        />
      </div>
    </Modal>
  );
}
