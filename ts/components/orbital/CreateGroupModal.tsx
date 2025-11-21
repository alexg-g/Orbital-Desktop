// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { LocalizerType } from '../../types/Util.std.js';
import { Modal } from '../Modal.dom.js';
import { Button, ButtonVariant } from '../Button.dom.js';
import type { CreateGroupResult } from '../../services/orbitalGroups.preload.js';

export type CreateGroupModalProps = {
  i18n: LocalizerType;
  onClose: () => void;
  onGroupCreated: (result: CreateGroupResult) => void;
  // Dependency injection for Node.js operations
  createGroup: (name: string) => Promise<CreateGroupResult>;
};

type ModalState = 'input' | 'loading' | 'success' | 'error';

/**
 * CreateGroupModal - Modal for creating a new orbit
 *
 * Features:
 * - Group name input
 * - Create button
 * - On success: Display invite code prominently
 * - Show expiration date (7 days from now)
 * - Copy Code button with clipboard API
 * - Success message
 * - Loading state during creation
 * - Error handling
 */
export function CreateGroupModal({
  i18n,
  onClose,
  onGroupCreated,
  createGroup,
}: CreateGroupModalProps): JSX.Element {
  const [groupName, setGroupName] = useState('');
  const [modalState, setModalState] = useState<ModalState>('input');
  const [error, setError] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<CreateGroupResult | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    if (modalState === 'input' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [modalState]);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setGroupName(e.target.value);
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedName = groupName.trim();

    if (!trimmedName) {
      setError('Please enter a name for your orbit');
      return;
    }

    if (trimmedName.length > 100) {
      setError('Orbit name must be 100 characters or less');
      return;
    }

    setModalState('loading');
    setError(null);

    try {
      const result = await createGroup(trimmedName);
      setCreatedResult(result);
      setModalState('success');
      onGroupCreated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create orbit');
      setModalState('error');
    }
  }, [groupName, createGroup, onGroupCreated]);

  const handleCopyCode = useCallback(async () => {
    if (!createdResult?.inviteCode.code) return;

    try {
      await navigator.clipboard.writeText(createdResult.inviteCode.code);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy invite code:', err);
    }
  }, [createdResult]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && modalState === 'input') {
      e.preventDefault();
      handleSubmit();
    }
  }, [modalState, handleSubmit]);

  // Format expiration date for display
  const formatExpirationDate = (isoDate: string): string => {
    const date = new Date(isoDate);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

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
          disabled={!groupName.trim()}
        >
          Create Orbit
        </Button>
      </>
    );

    return (
      <Modal
        modalName="CreateGroupModal"
        i18n={i18n}
        onClose={onClose}
        title="Create New Orbit"
        hasXButton
        modalFooter={footer}
      >
        <div className="CreateGroupModal">
          <p className="CreateGroupModal__description">
            Your orbit is a private space for your family to share memories together.
          </p>

          <div className="CreateGroupModal__field">
            <label htmlFor="group-name" className="CreateGroupModal__label">
              Orbit Name
            </label>
            <input
              ref={inputRef}
              id="group-name"
              type="text"
              className="CreateGroupModal__input"
              placeholder="e.g., Smith Family, Grandma's House"
              value={groupName}
              onChange={handleNameChange}
              onKeyDown={handleKeyDown}
              maxLength={100}
              aria-describedby={error ? 'group-name-error' : undefined}
            />
            <div className="CreateGroupModal__char-count">
              {groupName.length} / 100
            </div>
          </div>

          {error && (
            <div id="group-name-error" className="CreateGroupModal__error" role="alert">
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
        modalName="CreateGroupModal"
        i18n={i18n}
        onClose={onClose}
        title="Creating Orbit..."
        noMouseClose
        noEscapeClose
      >
        <div className="CreateGroupModal CreateGroupModal--loading">
          <div className="CreateGroupModal__spinner">
            <div className="CreateGroupModal__spinner-ring">
              <div className="CreateGroupModal__spinner-dot CreateGroupModal__spinner-dot--one"><span /></div>
              <div className="CreateGroupModal__spinner-dot CreateGroupModal__spinner-dot--two"><span /></div>
              <div className="CreateGroupModal__spinner-dot CreateGroupModal__spinner-dot--three"><span /></div>
            </div>
          </div>
          <p>Setting up your orbit...</p>
        </div>
      </Modal>
    );
  }

  // Render success state
  if (modalState === 'success' && createdResult) {
    const footer = (
      <Button
        onClick={onClose}
        variant={ButtonVariant.Primary}
      >
        Done
      </Button>
    );

    return (
      <Modal
        modalName="CreateGroupModal"
        i18n={i18n}
        onClose={onClose}
        title="Orbit Created!"
        hasXButton
        modalFooter={footer}
      >
        <div className="CreateGroupModal CreateGroupModal--success">
          <div className="CreateGroupModal__success-icon">*</div>
          <p className="CreateGroupModal__success-message">
            <strong>{createdResult.group.name}</strong> has been created!
          </p>

          <div className="CreateGroupModal__invite-section">
            <p className="CreateGroupModal__invite-label">
              Share this invite code with your family:
            </p>

            <div className="CreateGroupModal__invite-code-container">
              <code className="CreateGroupModal__invite-code">
                {createdResult.inviteCode.code}
              </code>
              <button
                type="button"
                className="CreateGroupModal__copy-btn"
                onClick={handleCopyCode}
                aria-label="Copy invite code to clipboard"
              >
                {copySuccess ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <p className="CreateGroupModal__invite-expiry">
              Expires: {formatExpirationDate(createdResult.inviteCode.expiresAt)}
            </p>

            <p className="CreateGroupModal__invite-note">
              This code can only be used once. You can generate more codes later.
            </p>
          </div>
        </div>
      </Modal>
    );
  }

  // Fallback
  return (
    <Modal
      modalName="CreateGroupModal"
      i18n={i18n}
      onClose={onClose}
      title="Error"
      hasXButton
    >
      <div className="CreateGroupModal CreateGroupModal--error">
        <p>Something went wrong. Please try again.</p>
      </div>
    </Modal>
  );
}
