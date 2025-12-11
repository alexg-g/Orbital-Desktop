// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * OrbitalPendingUploads - Notification banner for sync requests
 *
 * Issue #79: Async peer-to-peer recovery for expired media.
 *
 * When another orbit member requests historic media recovery, this component
 * shows a notification banner letting the user know they can help by sharing
 * their local copies.
 *
 * Features:
 * - Notification count badge
 * - Expandable request list
 * - Share/Decline buttons per request
 * - Upload progress display
 */

import React, { useState, useCallback } from 'react';

export type PendingUploadRequest = {
  /** Request ID */
  requestId: string;
  /** User who made the request */
  requestorName: string;
  /** Group/orbit name */
  groupName: string;
  /** Number of items we can provide */
  itemsCount: number;
  /** Total bytes of items we can provide */
  totalBytes: number;
  /** When the request was received */
  receivedAt: number;
  /** When the request expires */
  expiresAt: number;
};

export type OrbitalPendingUploadsProps = {
  /** Pending upload requests */
  requests: PendingUploadRequest[];
  /** Callback when user clicks Share */
  onShare: (requestId: string) => Promise<void>;
  /** Callback when user clicks Decline */
  onDecline: (requestId: string) => void;
  /** Callback to dismiss notification */
  onDismiss?: () => void;
  /** Format bytes for display */
  formatBytes: (bytes: number) => string;
  /** Format relative time (e.g., "2 hours ago") */
  formatRelativeTime: (timestamp: number) => string;
};

export function OrbitalPendingUploads({
  requests,
  onShare,
  onDecline,
  onDismiss,
  formatBytes,
  formatRelativeTime,
}: OrbitalPendingUploadsProps): JSX.Element | null {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sharingRequestId, setSharingRequestId] = useState<string | null>(null);
  const [shareProgress, setShareProgress] = useState<Record<string, number>>({});

  // Don't render if no requests
  if (requests.length === 0) {
    return null;
  }

  // Handle share click
  const handleShare = useCallback(async (requestId: string) => {
    setSharingRequestId(requestId);
    setShareProgress(prev => ({ ...prev, [requestId]: 0 }));

    try {
      await onShare(requestId);
      setShareProgress(prev => ({ ...prev, [requestId]: 100 }));
    } catch (error) {
      console.error('Failed to share files:', error);
    } finally {
      setSharingRequestId(null);
    }
  }, [onShare]);

  // Calculate totals
  const totalItems = requests.reduce((sum, r) => sum + r.itemsCount, 0);
  const totalBytes = requests.reduce((sum, r) => sum + r.totalBytes, 0);

  return (
    <div className="OrbitalPendingUploads">
      {/* Header Banner */}
      <div
        className="OrbitalPendingUploads__banner"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyPress={e => e.key === 'Enter' && setIsExpanded(!isExpanded)}
      >
        <div className="OrbitalPendingUploads__icon">
          <span className="OrbitalPendingUploads__icon-emoji">
            {requests.length === 1 ? '1' : requests.length}
          </span>
        </div>
        <div className="OrbitalPendingUploads__summary">
          <div className="OrbitalPendingUploads__title">
            {requests.length === 1
              ? `${requests[0].requestorName} needs your help`
              : `${requests.length} orbit members need your help`}
          </div>
          <div className="OrbitalPendingUploads__subtitle">
            {totalItems} file{totalItems !== 1 ? 's' : ''} ({formatBytes(totalBytes)}) needed for media recovery
          </div>
        </div>
        <div className="OrbitalPendingUploads__expand">
          {isExpanded ? '▼' : '▶'}
        </div>
        {onDismiss && (
          <button
            type="button"
            className="OrbitalPendingUploads__dismiss"
            onClick={e => {
              e.stopPropagation();
              onDismiss();
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>

      {/* Expanded Request List */}
      {isExpanded && (
        <div className="OrbitalPendingUploads__list">
          {requests.map(request => (
            <div
              key={request.requestId}
              className="OrbitalPendingUploads__request"
            >
              <div className="OrbitalPendingUploads__request-info">
                <div className="OrbitalPendingUploads__request-name">
                  {request.requestorName}
                </div>
                <div className="OrbitalPendingUploads__request-group">
                  in {request.groupName}
                </div>
                <div className="OrbitalPendingUploads__request-details">
                  {request.itemsCount} file{request.itemsCount !== 1 ? 's' : ''} ({formatBytes(request.totalBytes)})
                  <span className="OrbitalPendingUploads__request-time">
                    {formatRelativeTime(request.receivedAt)}
                  </span>
                </div>
              </div>

              {/* Progress bar when sharing */}
              {sharingRequestId === request.requestId && (
                <div className="OrbitalPendingUploads__progress">
                  <div
                    className="OrbitalPendingUploads__progress-bar"
                    style={{ width: `${shareProgress[request.requestId] || 0}%` }}
                  />
                </div>
              )}

              {/* Actions */}
              {sharingRequestId !== request.requestId && (
                <div className="OrbitalPendingUploads__request-actions">
                  <button
                    type="button"
                    className="OrbitalPendingUploads__button OrbitalPendingUploads__button--share"
                    onClick={() => handleShare(request.requestId)}
                  >
                    Share Files
                  </button>
                  <button
                    type="button"
                    className="OrbitalPendingUploads__button OrbitalPendingUploads__button--decline"
                    onClick={() => onDecline(request.requestId)}
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Share All Button */}
          {requests.length > 1 && (
            <div className="OrbitalPendingUploads__actions">
              <button
                type="button"
                className="OrbitalPendingUploads__button OrbitalPendingUploads__button--share-all"
                onClick={async () => {
                  for (const request of requests) {
                    await handleShare(request.requestId);
                  }
                }}
                disabled={sharingRequestId !== null}
              >
                Share All ({totalItems} files)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Notification badge component for sidebar/header
 */
export function OrbitalPendingUploadsBadge({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}): JSX.Element | null {
  if (count === 0) {
    return null;
  }

  return (
    <button
      type="button"
      className="OrbitalPendingUploadsBadge"
      onClick={onClick}
      aria-label={`${count} pending upload request${count !== 1 ? 's' : ''}`}
    >
      <span className="OrbitalPendingUploadsBadge__count">{count}</span>
    </button>
  );
}
