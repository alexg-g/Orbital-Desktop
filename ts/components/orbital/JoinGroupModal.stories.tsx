// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState } from 'react';
import type { Meta } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { JoinGroupModal } from './JoinGroupModal';
import type { JoinGroupResult } from '../../services/orbitalGroups.preload';

const { i18n } = window.SignalContext;

export default {
  title: 'Orbital/JoinGroupModal',
  component: JoinGroupModal,
} satisfies Meta;

// Mock join group function - success
const mockJoinGroupSuccess = async (inviteCode: string): Promise<JoinGroupResult> => {
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
  action('joinGroup')(inviteCode);

  return {
    group: {
      groupId: 'joined-group-456',
      name: 'Smith Family',
      encryptedName: 'encrypted-name',
      memberCount: 6,
      createdAt: '2024-01-01T00:00:00Z',
      isOwner: false,
    },
  };
};

// Mock join group function - expired code
const mockJoinGroupExpired = async (inviteCode: string): Promise<JoinGroupResult> => {
  await new Promise(resolve => setTimeout(resolve, 800));
  action('joinGroup - expired')(inviteCode);
  throw new Error('This invite code has expired');
};

// Mock join group function - already used
const mockJoinGroupUsed = async (inviteCode: string): Promise<JoinGroupResult> => {
  await new Promise(resolve => setTimeout(resolve, 800));
  action('joinGroup - used')(inviteCode);
  throw new Error('This invite code has already been used');
};

// Mock join group function - group full
const mockJoinGroupFull = async (inviteCode: string): Promise<JoinGroupResult> => {
  await new Promise(resolve => setTimeout(resolve, 800));
  action('joinGroup - full')(inviteCode);
  throw new Error('This orbit is full (max 10 members)');
};

// Mock join group function - invalid
const mockJoinGroupInvalid = async (inviteCode: string): Promise<JoinGroupResult> => {
  await new Promise(resolve => setTimeout(resolve, 800));
  action('joinGroup - invalid')(inviteCode);
  throw new Error('Invalid invite code');
};

// Wrapper to control modal visibility
function ModalWrapper({
  joinGroup,
}: {
  joinGroup: (inviteCode: string) => Promise<JoinGroupResult>;
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
    <JoinGroupModal
      i18n={i18n}
      onClose={() => {
        setIsOpen(false);
        action('onClose')();
      }}
      onGroupJoined={result => {
        action('onGroupJoined')(result);
      }}
      joinGroup={joinGroup}
    />
  );
}

/**
 * Default - Input state
 */
export function Default(): JSX.Element {
  return <ModalWrapper joinGroup={mockJoinGroupSuccess} />;
}

/**
 * Success state
 */
export function Success(): JSX.Element {
  // Fast return for demo
  const fastJoin = async (inviteCode: string): Promise<JoinGroupResult> => {
    action('joinGroup')(inviteCode);
    return {
      group: {
        groupId: 'joined-group-456',
        name: "Grandma's House",
        encryptedName: 'encrypted-name',
        memberCount: 4,
        createdAt: '2024-03-15T00:00:00Z',
        isOwner: false,
      },
    };
  };

  return <ModalWrapper joinGroup={fastJoin} />;
}

/**
 * Error - Expired code
 */
export function ExpiredCode(): JSX.Element {
  return <ModalWrapper joinGroup={mockJoinGroupExpired} />;
}

/**
 * Error - Already used code
 */
export function UsedCode(): JSX.Element {
  return <ModalWrapper joinGroup={mockJoinGroupUsed} />;
}

/**
 * Error - Group full
 */
export function GroupFull(): JSX.Element {
  return <ModalWrapper joinGroup={mockJoinGroupFull} />;
}

/**
 * Error - Invalid code
 */
export function InvalidCode(): JSX.Element {
  return <ModalWrapper joinGroup={mockJoinGroupInvalid} />;
}

/**
 * Loading state
 */
export function Loading(): JSX.Element {
  // Never resolves to keep loading state
  const neverResolve = () => new Promise<JoinGroupResult>(() => {});

  return <ModalWrapper joinGroup={neverResolve} />;
}

/**
 * Interactive demo with all error scenarios
 */
export function Interactive(): JSX.Element {
  const [lastResult, setLastResult] = useState<JoinGroupResult | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [scenario, setScenario] = useState<'success' | 'expired' | 'used' | 'full' | 'invalid'>('success');

  const joinFunctions = {
    success: mockJoinGroupSuccess,
    expired: mockJoinGroupExpired,
    used: mockJoinGroupUsed,
    full: mockJoinGroupFull,
    invalid: mockJoinGroupInvalid,
  };

  return (
    <div style={{ padding: '20px' }}>
      {!isOpen && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ marginRight: '8px' }}>Test Scenario:</label>
            <select
              value={scenario}
              onChange={e => setScenario(e.target.value as any)}
              style={{ padding: '4px 8px' }}
            >
              <option value="success">Success</option>
              <option value="expired">Expired Code</option>
              <option value="used">Already Used</option>
              <option value="full">Group Full</option>
              <option value="invalid">Invalid Code</option>
            </select>
          </div>

          <button onClick={() => setIsOpen(true)}>Open Modal</button>

          {lastResult && (
            <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#e8f5e9', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 8px 0' }}>Successfully Joined:</h4>
              <p style={{ margin: '0' }}>
                <strong>Orbit:</strong> {lastResult.group.name}
              </p>
              <p style={{ margin: '8px 0 0 0' }}>
                <strong>Members:</strong> {lastResult.group.memberCount}
              </p>
            </div>
          )}
        </div>
      )}

      {isOpen && (
        <JoinGroupModal
          i18n={i18n}
          onClose={() => setIsOpen(false)}
          onGroupJoined={result => {
            setLastResult(result);
            action('onGroupJoined')(result);
          }}
          joinGroup={joinFunctions[scenario]}
        />
      )}
    </div>
  );
}
