// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import classNames from 'classnames';
import type { GroupInfo } from '../../services/orbitalGroups.preload.js';

export type GroupSelectorProps = {
  groups: GroupInfo[];
  selectedGroupId?: string;
  onSelectGroup: (groupId: string) => void;
  onCreateGroup: () => void;
  onJoinGroup: () => void;
  isLoading?: boolean;
  error?: string;
};

/**
 * GroupSelector - Select from user's orbits or create/join new ones
 *
 * Features:
 * - List all user's orbits
 * - Show member count for each orbit
 * - Create Orbit button opens CreateGroupModal
 * - Join Orbit button opens JoinGroupModal
 * - Selected orbit indicator
 * - Loading state while fetching groups
 * - Empty state when no groups
 */
export function GroupSelector({
  groups,
  selectedGroupId,
  onSelectGroup,
  onCreateGroup,
  onJoinGroup,
  isLoading = false,
  error,
}: GroupSelectorProps): JSX.Element {
  return (
    <div className="GroupSelector">
      {/* Header with action buttons */}
      <div className="GroupSelector__header">
        <h2 className="GroupSelector__title">Your Orbits</h2>
        <div className="GroupSelector__actions">
          <button
            type="button"
            className="GroupSelector__action-btn GroupSelector__action-btn--create"
            onClick={onCreateGroup}
            aria-label="Create a new orbit"
          >
            + Create
          </button>
          <button
            type="button"
            className="GroupSelector__action-btn GroupSelector__action-btn--join"
            onClick={onJoinGroup}
            aria-label="Join an orbit with invite code"
          >
            Join
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="GroupSelector__error" role="alert">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="GroupSelector__loading">
          <div className="orbital-loader">
            <div className="orbital-loader__ring">
              <div className="orbital-loader__dot orbital-loader__dot--one"><span /></div>
              <div className="orbital-loader__dot orbital-loader__dot--two"><span /></div>
              <div className="orbital-loader__dot orbital-loader__dot--three"><span /></div>
            </div>
          </div>
          <span>Loading orbits...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && groups.length === 0 && (
        <div className="GroupSelector__empty">
          <div className="GroupSelector__empty-icon">*</div>
          <p className="GroupSelector__empty-text">
            You haven't joined any orbits yet.
          </p>
          <p className="GroupSelector__empty-hint">
            Create a new orbit or join one with an invite code.
          </p>
        </div>
      )}

      {/* Group list */}
      {!isLoading && groups.length > 0 && (
        <div className="GroupSelector__list" role="listbox" aria-label="Your orbits">
          {groups.map(group => (
            <button
              key={group.groupId}
              type="button"
              className={classNames('GroupSelector__item', {
                'GroupSelector__item--selected': group.groupId === selectedGroupId,
              })}
              onClick={() => onSelectGroup(group.groupId)}
              role="option"
              aria-selected={group.groupId === selectedGroupId}
            >
              <div className="GroupSelector__item-content">
                <div className="GroupSelector__item-name">
                  {group.name}
                  {group.isOwner && (
                    <span className="GroupSelector__item-owner-badge" title="You created this orbit">
                      *
                    </span>
                  )}
                </div>
                <div className="GroupSelector__item-meta">
                  <span className="GroupSelector__item-members">
                    {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                  </span>
                </div>
              </div>
              {group.groupId === selectedGroupId && (
                <div className="GroupSelector__item-selected-indicator" aria-hidden="true">
                  &gt;
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
