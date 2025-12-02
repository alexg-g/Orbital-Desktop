// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { LocalizerType } from '../../types/Util.std.js';
import { Modal } from '../Modal.dom.js';
import { Button, ButtonVariant } from '../Button.dom.js';
import type { JoinGroupResult } from '../../services/orbitalGroups.preload.js';

export type JoinGroupModalProps = {
  i18n: LocalizerType;
  onClose: () => void;
  onGroupJoined: (result: JoinGroupResult) => void;
  // Dependency injection for Node.js operations
  joinGroup: (inviteCode: string) => Promise<JoinGroupResult>;
  // Sync functions with progress (optional for backward compatibility)
  syncOrbitHistory?: (
    groupId: string,
    onProgress: (progress: { phase: string; current: number; total: number; percent: number }) => void
  ) => Promise<{ threadsAdded: number; totalThreads: number }>;
  downloadAllPendingMedia?: (options: {
    onProgress: (progress: number, current: number, total: number) => void;
    getAbsoluteAttachmentPath: (path: string) => string;
  }) => Promise<{ successful: number; failed: number }>;
  getAbsoluteAttachmentPath?: (path: string) => string;
};

type ModalState = 'input' | 'loading' | 'syncing' | 'success' | 'error';

/**
 * JoinGroupModal - Modal for joining an orbit with an invite code
 *
 * Features:
 * - Invite code input (8-char alphanumeric)
 * - Join button
 * - Format validation
 * - Server-side validation errors (expired, used, invalid, group full)
 * - On success: Show group name and close modal
 * - User-friendly error messages
 */
export function JoinGroupModal({
  i18n,
  onClose,
  onGroupJoined,
  joinGroup,
  syncOrbitHistory,
  downloadAllPendingMedia,
  getAbsoluteAttachmentPath,
}: JoinGroupModalProps): JSX.Element {
  const [inviteCode, setInviteCode] = useState('');
  const [modalState, setModalState] = useState<ModalState>('input');
  const [error, setError] = useState<string | null>(null);
  const [joinedResult, setJoinedResult] = useState<JoinGroupResult | null>(null);
  const [syncProgress, setSyncProgress] = useState<{
    phase: 'threads' | 'media' | 'complete';
    current: number;
    total: number;
    percent: number;
  }>({ phase: 'threads', current: 0, total: 0, percent: 0 });

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    if (modalState === 'input' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [modalState]);

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Convert to uppercase and filter to alphanumeric only
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Limit to 8 characters
    setInviteCode(value.slice(0, 8));
    setError(null);
  }, []);

  const validateCode = useCallback((code: string): string | null => {
    if (!code) {
      return 'Please enter an invite code';
    }

    if (code.length !== 8) {
      return 'Invite code must be 8 characters';
    }

    if (!/^[A-Z0-9]{8}$/.test(code)) {
      return 'Invite code must contain only letters and numbers';
    }

    return null;
  }, []);

  const handleSubmit = useCallback(async () => {
    const validationError = validateCode(inviteCode);
    if (validationError) {
      setError(validationError);
      return;
    }

    setModalState('loading');
    setError(null);

    try {
      const result = await joinGroup(inviteCode);
      setJoinedResult(result);

      // If sync functions are provided, sync orbit history and media
      if (syncOrbitHistory && downloadAllPendingMedia && getAbsoluteAttachmentPath) {
        setModalState('syncing');
        setSyncProgress({ phase: 'threads', current: 0, total: 0, percent: 0 });

        // Sync threads
        await syncOrbitHistory(result.group.groupId, (progress) => {
          setSyncProgress({
            phase: 'threads',
            current: progress.current,
            total: progress.total,
            percent: progress.total > 0 ? Math.round((progress.current / progress.total) * 50) : 0,
          });
        });

        // Download media (contributes to the second 50% of progress)
        setSyncProgress({ phase: 'media', current: 0, total: 0, percent: 50 });
        await downloadAllPendingMedia({
          onProgress: (progress: number, current: number, total: number) => {
            setSyncProgress({
              phase: 'media',
              current,
              total,
              percent: 50 + Math.round(progress * 0.5),
            });
          },
          getAbsoluteAttachmentPath,
        });

        setSyncProgress({ phase: 'complete', current: 0, total: 0, percent: 100 });
      }

      setModalState('success');
      onGroupJoined(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join orbit');
      setModalState('error');
    }
  }, [inviteCode, joinGroup, onGroupJoined, validateCode, syncOrbitHistory, downloadAllPendingMedia, getAbsoluteAttachmentPath]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && modalState === 'input') {
      e.preventDefault();
      handleSubmit();
    }
  }, [modalState, handleSubmit]);

  const handleTryAgain = useCallback(() => {
    setModalState('input');
    setError(null);
    setInviteCode('');
  }, []);

  // Render input state
  if (modalState === 'input' || modalState === 'error') {
    const footer = (
      <>
        <Button
          onClick={onClose}
          variant={ButtonVariant.Secondary}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant={ButtonVariant.Primary}
          disabled={inviteCode.length !== 8}
        >
          Join Orbit
        </Button>
      </>
    );

    return (
      <Modal
        modalName="JoinGroupModal"
        i18n={i18n}
        onClose={onClose}
        title="Join an Orbit"
        hasXButton
        modalFooter={footer}
      >
        <div className="JoinGroupModal">
          <p className="JoinGroupModal__description">
            Enter the invite code you received from a family member.
          </p>

          <div className="JoinGroupModal__field">
            <label htmlFor="invite-code" className="JoinGroupModal__label">
              Invite Code
            </label>
            <input
              ref={inputRef}
              id="invite-code"
              type="text"
              className="JoinGroupModal__input"
              placeholder="ABCD1234"
              value={inviteCode}
              onChange={handleCodeChange}
              onKeyDown={handleKeyDown}
              maxLength={8}
              autoComplete="off"
              spellCheck={false}
              aria-describedby={error ? 'invite-code-error' : 'invite-code-help'}
            />
            <div id="invite-code-help" className="JoinGroupModal__help">
              8 characters, letters and numbers only
            </div>
          </div>

          {error && (
            <div id="invite-code-error" className="JoinGroupModal__error" role="alert">
              {error}
            </div>
          )}
        </div>
      </Modal>
    );
  }

  // Render loading state
  if (modalState === 'loading') {
    return (
      <Modal
        modalName="JoinGroupModal"
        i18n={i18n}
        onClose={onClose}
        title="Joining Orbit..."
        noMouseClose
        noEscapeClose
      >
        <div className="JoinGroupModal JoinGroupModal--loading">
          <div className="JoinGroupModal__spinner">
            <div className="JoinGroupModal__spinner-ring">
              <div className="JoinGroupModal__spinner-dot JoinGroupModal__spinner-dot--one"><span /></div>
              <div className="JoinGroupModal__spinner-dot JoinGroupModal__spinner-dot--two"><span /></div>
              <div className="JoinGroupModal__spinner-dot JoinGroupModal__spinner-dot--three"><span /></div>
            </div>
          </div>
          <p>Verifying invite code...</p>
        </div>
      </Modal>
    );
  }

  // Render syncing state
  if (modalState === 'syncing') {
    return (
      <Modal
        modalName="JoinGroupModal"
        i18n={i18n}
        onClose={onClose}
        title="Syncing Orbit History..."
        noMouseClose
        noEscapeClose
      >
        <div className="JoinGroupModal JoinGroupModal--syncing">
          <div className="JoinGroupModal__sync-status">
            {syncProgress.phase === 'threads' && (
              <>
                <p className="JoinGroupModal__sync-phase">Syncing threads...</p>
                {syncProgress.total > 0 && (
                  <p className="JoinGroupModal__sync-count">
                    {syncProgress.current} of {syncProgress.total}
                  </p>
                )}
              </>
            )}
            {syncProgress.phase === 'media' && (
              <>
                <p className="JoinGroupModal__sync-phase">Downloading media...</p>
                {syncProgress.total > 0 && (
                  <p className="JoinGroupModal__sync-count">
                    {syncProgress.current} of {syncProgress.total}
                  </p>
                )}
              </>
            )}
            {syncProgress.phase === 'complete' && (
              <p className="JoinGroupModal__sync-phase">Sync complete!</p>
            )}
          </div>
          <div className="JoinGroupModal__progress-bar">
            <div
              className="JoinGroupModal__progress-fill"
              style={{ width: `${syncProgress.percent}%` }}
            />
          </div>
          <p className="JoinGroupModal__sync-hint">
            This may take a moment for orbits with lots of content.
          </p>
        </div>
      </Modal>
    );
  }

  // Render success state
  if (modalState === 'success' && joinedResult) {
    const footer = (
      <Button
        onClick={onClose}
        variant={ButtonVariant.Primary}
      >
        Get Started
      </Button>
    );

    return (
      <Modal
        modalName="JoinGroupModal"
        i18n={i18n}
        onClose={onClose}
        title="Welcome to the Orbit!"
        hasXButton
        modalFooter={footer}
      >
        <div className="JoinGroupModal JoinGroupModal--success">
          <div className="JoinGroupModal__success-icon">*</div>
          <p className="JoinGroupModal__success-message">
            You've joined <strong>{joinedResult.group.name}</strong>!
          </p>
          <p className="JoinGroupModal__success-hint">
            You can now see shared photos and videos, and start sharing your own memories.
          </p>
        </div>
      </Modal>
    );
  }

  // Fallback for error state that needs retry
  const errorFooter = (
    <>
      <Button
        onClick={onClose}
        variant={ButtonVariant.Secondary}
      >
        Cancel
      </Button>
      <Button
        onClick={handleTryAgain}
        variant={ButtonVariant.Primary}
      >
        Try Again
      </Button>
    </>
  );

  return (
    <Modal
      modalName="JoinGroupModal"
      i18n={i18n}
      onClose={onClose}
      title="Couldn't Join Orbit"
      hasXButton
      modalFooter={errorFooter}
    >
      <div className="JoinGroupModal JoinGroupModal--error">
        <div className="JoinGroupModal__error-icon">!</div>
        <p className="JoinGroupModal__error-message">
          {error || 'Something went wrong. Please check the invite code and try again.'}
        </p>
      </div>
    </Modal>
  );
}
