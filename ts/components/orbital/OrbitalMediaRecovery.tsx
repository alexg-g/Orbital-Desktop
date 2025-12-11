// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * OrbitalMediaRecovery - Request historic media recovery
 *
 * Issue #79: Async peer-to-peer recovery for expired media.
 *
 * Features:
 * - Time range selector (last month, 6 months, all time)
 * - Estimated size display
 * - Create recovery request
 * - Progress display for active requests
 * - Download ready items
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { MediaSyncRequest, MediaSyncTimeRange } from '../../types/OrbitalMediaSync.std';
import type { GroupInfo } from '../../services/orbitalGroups.preload';

export type OrbitalMediaRecoveryProps = {
  /** List of all groups user is a member of */
  groups: GroupInfo[];
  /** Currently selected group ID */
  selectedGroupId?: string;
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
};

const TIME_RANGE_OPTIONS: Array<{
  value: MediaSyncTimeRange;
  label: string;
  description: string;
}> = [
  {
    value: 'last_month',
    label: 'Last Month',
    description: 'Media from the past 30 days',
  },
  {
    value: 'last_6_months',
    label: 'Last 6 Months',
    description: 'Media from the past 180 days',
  },
  {
    value: 'all_time',
    label: 'All Time',
    description: 'All media ever shared in this orbit',
  },
];

export function OrbitalMediaRecovery({
  groups,
  selectedGroupId,
  onSelectOrbit,
  onCreateRequest,
  onGetActiveRequests,
  onCancelRequest,
  onDownloadReadyItems,
  formatBytes,
}: OrbitalMediaRecoveryProps): JSX.Element {
  const [selectedTimeRange, setSelectedTimeRange] = useState<MediaSyncTimeRange>('last_month');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRequests, setActiveRequests] = useState<MediaSyncRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);

  // Get current group name for display
  const currentGroup = groups.find(g => g.groupId === selectedGroupId);

  // Load active requests on mount and when group changes
  useEffect(() => {
    async function loadRequests() {
      if (!selectedGroupId) {
        setActiveRequests([]);
        setIsLoadingRequests(false);
        return;
      }
      try {
        const requests = await onGetActiveRequests();
        setActiveRequests(requests.filter(r => r.groupId === selectedGroupId));
      } catch (err) {
        console.error('Failed to load sync requests:', err);
      } finally {
        setIsLoadingRequests(false);
      }
    }
    loadRequests();
  }, [selectedGroupId, onGetActiveRequests]);

  // Create new request
  const handleCreateRequest = useCallback(async () => {
    if (!selectedGroupId) {
      setError('Please select an orbit first');
      return;
    }
    setIsCreating(true);
    setError(null);

    try {
      const request = await onCreateRequest({
        groupId: selectedGroupId,
        timeRange: selectedTimeRange,
      });

      setActiveRequests(prev => [request, ...prev]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create recovery request';
      setError(message);
    } finally {
      setIsCreating(false);
    }
  }, [selectedGroupId, selectedTimeRange, onCreateRequest]);

  // Cancel request
  const handleCancelRequest = useCallback(async (requestId: string) => {
    try {
      await onCancelRequest(requestId);
      setActiveRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (err) {
      console.error('Failed to cancel request:', err);
    }
  }, [onCancelRequest]);

  // Download ready items
  const handleDownloadReady = useCallback(async (requestId: string) => {
    try {
      await onDownloadReadyItems(requestId);
      // Refresh requests after download
      const requests = await onGetActiveRequests();
      setActiveRequests(requests.filter(r => r.groupId === selectedGroupId));
    } catch (err) {
      console.error('Failed to download items:', err);
    }
  }, [selectedGroupId, onDownloadReadyItems, onGetActiveRequests]);

  // Check if there's an active request for this group
  const hasActiveRequest = activeRequests.some(
    r => r.status === 'pending' || r.status === 'in_progress'
  );

  // Handle orbit selection change
  const handleOrbitChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newGroupId = e.target.value;
    if (newGroupId && onSelectOrbit) {
      onSelectOrbit(newGroupId);
    }
  }, [onSelectOrbit]);

  return (
    <div className="OrbitalMediaRecovery">
      <div className="OrbitalMediaRecovery__header">
        <h3 className="OrbitalMediaRecovery__title">Recover Historic Media</h3>
        <p className="OrbitalMediaRecovery__description">
          Request media that has expired from the server. Other orbit members
          who have the files locally can share them with you.
        </p>
      </div>

      {/* Orbit Selector */}
      <div className="OrbitalMediaRecovery__orbit-selector">
        <label className="OrbitalMediaRecovery__orbit-label">
          Select Orbit:
        </label>
        <select
          className="OrbitalMediaRecovery__orbit-select"
          value={selectedGroupId || ''}
          onChange={handleOrbitChange}
          disabled={groups.length === 0}
        >
          {groups.length === 0 ? (
            <option value="">No orbits available</option>
          ) : (
            <>
              {!selectedGroupId && <option value="">Choose an orbit...</option>}
              {groups.map(group => (
                <option key={group.groupId} value={group.groupId}>
                  {group.name}
                </option>
              ))}
            </>
          )}
        </select>
        {currentGroup && (
          <span className="OrbitalMediaRecovery__orbit-hint">
            Changing this will also update your active orbit
          </span>
        )}
      </div>

      {/* Show content only if orbit is selected */}
      {!selectedGroupId ? (
        <div className="OrbitalMediaRecovery__no-orbit">
          <p>Select an orbit above to recover historic media.</p>
        </div>
      ) : (
        <>
          {/* Active Requests */}
      {activeRequests.length > 0 && (
        <div className="OrbitalMediaRecovery__active-requests">
          <h4 className="OrbitalMediaRecovery__section-title">Active Requests</h4>
          {activeRequests.map(request => (
            <div
              key={request.id}
              className={`OrbitalMediaRecovery__request OrbitalMediaRecovery__request--${request.status}`}
            >
              <div className="OrbitalMediaRecovery__request-info">
                <div className="OrbitalMediaRecovery__request-status">
                  {request.status === 'pending' && 'Waiting for orbit members...'}
                  {request.status === 'in_progress' && `${request.itemsReady} of ${request.itemsTotal} ready`}
                  {request.status === 'completed' && 'Completed'}
                  {request.status === 'expired' && 'Expired'}
                  {request.status === 'cancelled' && 'Cancelled'}
                </div>
                <div className="OrbitalMediaRecovery__request-details">
                  {request.itemsTotal} items ({formatBytes(request.maxBytes)})
                </div>
                {(request.status === 'pending' || request.status === 'in_progress') && (
                  <div className="OrbitalMediaRecovery__request-progress">
                    <div
                      className="OrbitalMediaRecovery__request-progress-bar"
                      style={{
                        width: `${
                          request.itemsTotal > 0
                            ? (request.itemsCompleted / request.itemsTotal) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="OrbitalMediaRecovery__request-actions">
                {request.itemsReady > 0 && request.status !== 'completed' && (
                  <button
                    type="button"
                    className="OrbitalMediaRecovery__button OrbitalMediaRecovery__button--primary"
                    onClick={() => handleDownloadReady(request.id)}
                  >
                    Download {request.itemsReady} Ready
                  </button>
                )}
                {(request.status === 'pending' || request.status === 'in_progress') && (
                  <button
                    type="button"
                    className="OrbitalMediaRecovery__button OrbitalMediaRecovery__button--secondary"
                    onClick={() => handleCancelRequest(request.id)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create New Request */}
      {!hasActiveRequest && (
        <div className="OrbitalMediaRecovery__create">
          <h4 className="OrbitalMediaRecovery__section-title">Create New Request</h4>

          {/* Time Range Selector */}
          <div className="OrbitalMediaRecovery__time-range">
            {TIME_RANGE_OPTIONS.map(option => (
              <label
                key={option.value}
                className={`OrbitalMediaRecovery__time-option ${
                  selectedTimeRange === option.value
                    ? 'OrbitalMediaRecovery__time-option--selected'
                    : ''
                }`}
              >
                <input
                  type="radio"
                  name="timeRange"
                  value={option.value}
                  checked={selectedTimeRange === option.value}
                  onChange={() => setSelectedTimeRange(option.value)}
                  className="OrbitalMediaRecovery__time-radio"
                />
                <div className="OrbitalMediaRecovery__time-label">
                  <span className="OrbitalMediaRecovery__time-name">{option.label}</span>
                  <span className="OrbitalMediaRecovery__time-description">
                    {option.description}
                  </span>
                </div>
              </label>
            ))}
          </div>

          {/* Error Display */}
          {error && (
            <div className="OrbitalMediaRecovery__error">
              {error}
            </div>
          )}

          {/* Create Button */}
          <button
            type="button"
            className="OrbitalMediaRecovery__button OrbitalMediaRecovery__button--create"
            onClick={handleCreateRequest}
            disabled={isCreating}
          >
            {isCreating ? 'Creating Request...' : 'Request Media Recovery'}
          </button>

          <p className="OrbitalMediaRecovery__note">
            Other orbit members will be notified and can share their copies.
            Recovery requests expire after 7 days.
          </p>
        </div>
      )}

      {/* Loading State */}
      {isLoadingRequests && (
        <div className="OrbitalMediaRecovery__loading">
          Loading...
        </div>
      )}
        </>
      )}
    </div>
  );
}
