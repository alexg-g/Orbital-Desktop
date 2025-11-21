// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState } from 'react';
import type { Meta } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { CreateGroupModal } from './CreateGroupModal';
import type { CreateGroupResult } from '../../services/orbitalGroups.preload';

const { i18n } = window.SignalContext;

export default {
  title: 'Orbital/CreateGroupModal',
  component: CreateGroupModal,
} satisfies Meta;

// Mock create group function - success
const mockCreateGroupSuccess = async (name: string): Promise<CreateGroupResult> => {
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
  action('createGroup')(name);

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 7);

  return {
    group: {
      groupId: 'new-group-123',
      name: name,
      encryptedName: 'encrypted-name',
      memberCount: 1,
      createdAt: new Date().toISOString(),
      isOwner: true,
    },
    inviteCode: {
      code: 'ABC12XYZ',
      expiresAt: expiryDate.toISOString(),
      groupId: 'new-group-123',
      groupName: name,
    },
  };
};

// Mock create group function - error
const mockCreateGroupError = async (name: string): Promise<CreateGroupResult> => {
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
  action('createGroup - error')(name);
  throw new Error('Network error: Unable to connect to server');
};

// Wrapper to control modal visibility
function ModalWrapper({
  createGroup,
}: {
  createGroup: (name: string) => Promise<CreateGroupResult>;
}) {
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) {
    return (
      <div style={{ padding: '20px' }}>
        <button onClick={() => setIsOpen(true)}>Open Modal</button>
        <p style={{ marginTop: '10px', color: '#666' }}>Modal closed</p>
      </div>
    );
  }

  return (
    <CreateGroupModal
      i18n={i18n}
      onClose={() => {
        setIsOpen(false);
        action('onClose')();
      }}
      onGroupCreated={result => {
        action('onGroupCreated')(result);
      }}
      createGroup={createGroup}
    />
  );
}

/**
 * Default - Input state
 */
export function Default(): JSX.Element {
  return <ModalWrapper createGroup={mockCreateGroupSuccess} />;
}

/**
 * Success state - Shows invite code
 */
export function Success(): JSX.Element {
  // Auto-submit to show success state
  const autoSubmit = async (_name: string): Promise<CreateGroupResult> => {
    // Instant return for demo
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);

    return {
      group: {
        groupId: 'new-group-123',
        name: 'Smith Family',
        encryptedName: 'encrypted-name',
        memberCount: 1,
        createdAt: new Date().toISOString(),
        isOwner: true,
      },
      inviteCode: {
        code: 'XK7M2PQN',
        expiresAt: expiryDate.toISOString(),
        groupId: 'new-group-123',
        groupName: 'Smith Family',
      },
    };
  };

  return <ModalWrapper createGroup={autoSubmit} />;
}

/**
 * Error state - Network error
 */
export function WithError(): JSX.Element {
  return <ModalWrapper createGroup={mockCreateGroupError} />;
}

/**
 * Loading state
 */
export function Loading(): JSX.Element {
  // Never resolves to keep loading state
  const neverResolve = () => new Promise<CreateGroupResult>(() => {});

  return <ModalWrapper createGroup={neverResolve} />;
}

/**
 * With long group name
 */
export function LongGroupName(): JSX.Element {
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) {
    return (
      <div style={{ padding: '20px' }}>
        <button onClick={() => setIsOpen(true)}>Open Modal</button>
      </div>
    );
  }

  return (
    <CreateGroupModal
      i18n={i18n}
      onClose={() => setIsOpen(false)}
      onGroupCreated={action('onGroupCreated')}
      createGroup={mockCreateGroupSuccess}
    />
  );
}

/**
 * Interactive demo
 */
export function Interactive(): JSX.Element {
  const [lastResult, setLastResult] = useState<CreateGroupResult | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div style={{ padding: '20px' }}>
      {!isOpen && (
        <div>
          <button onClick={() => setIsOpen(true)}>Open Modal</button>
          {lastResult && (
            <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f0f0f0', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 8px 0' }}>Last Created Group:</h4>
              <p style={{ margin: '0' }}>
                <strong>Name:</strong> {lastResult.group.name}
              </p>
              <p style={{ margin: '8px 0 0 0' }}>
                <strong>Invite Code:</strong> {lastResult.inviteCode.code}
              </p>
            </div>
          )}
        </div>
      )}

      {isOpen && (
        <CreateGroupModal
          i18n={i18n}
          onClose={() => setIsOpen(false)}
          onGroupCreated={result => {
            setLastResult(result);
            action('onGroupCreated')(result);
          }}
          createGroup={mockCreateGroupSuccess}
        />
      )}
    </div>
  );
}
