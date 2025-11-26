// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback, useEffect } from 'react';
import {
  OrbitalSettingsSection,
  OrbitalSettingsButton,
} from './OrbitalSettingsControl';
import {
  generateInviteCode as apiGenerateInviteCode,
  generateInviteLink as apiGenerateInviteLink,
  getActiveInviteCodes,
} from '../../services/orbitalGroups.preload.js';
import type { GroupInfo } from '../../services/orbitalGroups.preload.js';

type InviteStatus = 'pending' | 'accepted' | 'expired';

type SentInvite = {
  id: string;
  code: string;
  method: 'code' | 'link';
  targetEmail: string;
  createdAt: number;
  expiresAt: number;
  status: InviteStatus;
};

export type OrbitalSettingsInvitesProps = {
  currentGroup?: GroupInfo | null;
  onCreateOrbit?: () => void;
};

function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function OrbitalSettingsInvites({
  currentGroup = null,
  onCreateOrbit = () => {},
}: OrbitalSettingsInvitesProps): JSX.Element {
  const [targetEmail, setTargetEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [shareableLink, setShareableLink] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Use passed-in group
  const currentGroupId = currentGroup?.groupId || null;

  // Track sent invites (loaded from API or mock)
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);

  // Load existing invite codes when group changes
  useEffect(() => {
    if (!currentGroupId) {
      return;
    }

    async function loadInvites() {
      try {
        const activeCodes = await getActiveInviteCodes(currentGroupId!);

        // Convert API response to SentInvite format
        const invites: SentInvite[] = activeCodes.map((code, index) => ({
          id: `invite-${index}-${code.code}`,
          code: code.code,
          method: code.link ? 'link' : 'code',
          targetEmail: code.targetEmail || '',
          createdAt: code.createdAt ? new Date(code.createdAt).getTime() : Date.now(),
          expiresAt: code.expiresAt ? new Date(code.expiresAt).getTime() : Date.now() + 24 * 60 * 60 * 1000,
          status: (code.status || 'pending') as InviteStatus,
        }));

        setSentInvites(invites);
      } catch (inviteError) {
        // Non-creators can't view invite codes - that's okay
        console.log('Could not load invite codes (user may not be group creator or API not available)');
      }
    }

    loadInvites();
  }, [currentGroupId]);

  const validateEmail = useCallback((): boolean => {
    if (!targetEmail.trim()) {
      setEmailError('Please enter the recipient\'s email address');
      return false;
    }
    if (!isValidEmail(targetEmail.trim())) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    setEmailError(null);
    return true;
  }, [targetEmail]);

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTargetEmail(e.target.value);
    if (emailError) {
      setEmailError(null);
    }
  }, [emailError]);

  const handleGenerateCode = useCallback(async () => {
    if (!validateEmail()) {
      return;
    }

    if (!currentGroupId) {
      setApiError('No orbit selected. Please create or join an orbit first.');
      return;
    }

    setIsGeneratingCode(true);
    setApiError(null);
    try {
      // Call the backend API to generate invite code
      const result = await apiGenerateInviteCode(currentGroupId, targetEmail.trim());
      setInviteCode(result.code);

      // Track the invite
      const newInvite: SentInvite = {
        id: `invite-${Date.now()}`,
        code: result.code,
        method: 'code',
        targetEmail: result.targetEmail || targetEmail.trim().toLowerCase(),
        createdAt: result.createdAt ? new Date(result.createdAt).getTime() : Date.now(),
        expiresAt: result.expiresAt ? new Date(result.expiresAt).getTime() : Date.now() + 24 * 60 * 60 * 1000,
        status: 'pending',
      };
      setSentInvites(prev => [newInvite, ...prev]);

      // Clear the email field after successful generation
      setTargetEmail('');
    } catch (error) {
      console.error('Failed to generate invite code:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate invite code';
      if (errorMessage.includes('Only group creator')) {
        setApiError('Only the orbit creator can generate invite codes.');
      } else if (errorMessage.includes('Not authenticated')) {
        setApiError('Please log in to generate invite codes.');
      } else {
        setApiError(errorMessage);
      }
    } finally {
      setIsGeneratingCode(false);
    }
  }, [currentGroupId, targetEmail, validateEmail]);

  const handleGenerateLink = useCallback(async () => {
    if (!validateEmail()) {
      return;
    }

    if (!currentGroupId) {
      setApiError('No orbit selected. Please create or join an orbit first.');
      return;
    }

    setIsGeneratingLink(true);
    setApiError(null);
    try {
      // Call the backend API to generate invite link
      const result = await apiGenerateInviteLink(currentGroupId, targetEmail.trim());
      setShareableLink(result.link || `orbital://invite/${result.code}`);

      // Track the invite
      const newInvite: SentInvite = {
        id: `invite-${Date.now()}`,
        code: result.code,
        method: 'link',
        targetEmail: result.targetEmail || targetEmail.trim().toLowerCase(),
        createdAt: result.createdAt ? new Date(result.createdAt).getTime() : Date.now(),
        expiresAt: result.expiresAt ? new Date(result.expiresAt).getTime() : Date.now() + 24 * 60 * 60 * 1000,
        status: 'pending',
      };
      setSentInvites(prev => [newInvite, ...prev]);

      // Clear the email field after successful generation
      setTargetEmail('');
    } catch (error) {
      console.error('Failed to generate shareable link:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate shareable link';
      if (errorMessage.includes('Only group creator')) {
        setApiError('Only the orbit creator can generate invite links.');
      } else if (errorMessage.includes('Not authenticated')) {
        setApiError('Please log in to generate invite links.');
      } else {
        setApiError(errorMessage);
      }
    } finally {
      setIsGeneratingLink(false);
    }
  }, [currentGroupId, targetEmail, validateEmail]);

  const handleCopyCode = useCallback(() => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  }, [inviteCode]);

  const handleCopyLink = useCallback(() => {
    if (shareableLink) {
      navigator.clipboard.writeText(shareableLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  }, [shareableLink]);

  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getExpiryText = (expiresAt: number): string => {
    const now = Date.now();
    if (now > expiresAt) return 'Expired';

    const remainingMs = expiresAt - now;
    const remainingHours = Math.ceil(remainingMs / 3600000);

    if (remainingHours <= 1) return 'Expires in <1h';
    if (remainingHours < 24) return `Expires in ${remainingHours}h`;
    return `Expires in ${Math.ceil(remainingHours / 24)}d`;
  };


  // Show create orbit prompt if no group selected
  if (!currentGroupId) {
    return (
      <div className="OrbitalSettingsInvites">
        <OrbitalSettingsSection title="Create Your First Orbit">
          <p className="OrbitalSettingsInvites__description">
            Before you can invite family members, you need to create an orbit.
            An orbit is a private space for your family to share memories together.
          </p>

          <OrbitalSettingsButton
            label="Create Orbit"
            onClick={onCreateOrbit}
            variant="primary"
          />
        </OrbitalSettingsSection>

        <OrbitalSettingsSection title="Or Join an Existing Orbit">
          <p className="OrbitalSettingsInvites__description">
            If someone has invited you to their orbit, you can join using an invite code.
            Contact your family member for the code.
          </p>
        </OrbitalSettingsSection>
      </div>
    );
  }

  return (
    <div className="OrbitalSettingsInvites">
      <OrbitalSettingsSection title="Invite to Your Orbit">
        <p className="OrbitalSettingsInvites__description">
          Share Orbital with family and friends. Enter the recipient's email
          address to generate a personalized invite code. Codes are single-use
          and expire after 24 hours.
        </p>

        {apiError && (
          <div className="OrbitalSettingsInvites__api-error">
            {apiError}
          </div>
        )}

        <div className="OrbitalSettingsInvites__form">
          <input
            id="invite-target-email"
            type="email"
            className={`OrbitalSettingsInvites__email-input ${
              emailError ? 'OrbitalSettingsInvites__email-input--error' : ''
            }`}
            value={targetEmail}
            onChange={handleEmailChange}
            placeholder="Recipient's Email Address"
            disabled={isGeneratingCode || isGeneratingLink || !currentGroupId}
          />
          {emailError && (
            <span className="OrbitalSettingsInvites__email-error">
              {emailError}
            </span>
          )}

          <div className="OrbitalSettingsInvites__buttons">
            <OrbitalSettingsButton
              label={isGeneratingCode ? 'Generating...' : 'Generate Invite Code'}
              onClick={handleGenerateCode}
              variant="primary"
              disabled={isGeneratingCode || isGeneratingLink || !currentGroupId}
            />
            <OrbitalSettingsButton
              label={isGeneratingLink ? 'Generating...' : 'Generate Shareable Link'}
              onClick={handleGenerateLink}
              variant="secondary"
              disabled={isGeneratingCode || isGeneratingLink || !currentGroupId}
            />
          </div>

          {inviteCode && (
            <div className="OrbitalSettingsInvites__code-display">
              <code>{inviteCode}</code>
              <button
                type="button"
                className="OrbitalSettingsInvites__copy-button"
                onClick={handleCopyCode}
              >
                {copiedCode ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}

          {shareableLink && (
            <div className="OrbitalSettingsInvites__link-display">
              <code>{shareableLink}</code>
              <button
                type="button"
                className="OrbitalSettingsInvites__copy-button"
                onClick={handleCopyLink}
              >
                {copiedLink ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      </OrbitalSettingsSection>

      <OrbitalSettingsSection title="Recent Invites">
        {sentInvites.length === 0 ? (
          <p className="OrbitalSettingsInvites__empty">
            No invites generated yet. Enter an email address above and create an
            invite code or link to invite someone to your orbit.
          </p>
        ) : (
          <div className="OrbitalSettingsInvites__list">
            {sentInvites.slice(0, 10).map(invite => (
              <div key={invite.id} className="OrbitalSettingsInvites__item">
                <div className="OrbitalSettingsInvites__item-info">
                  <span className="OrbitalSettingsInvites__item-email">
                    {invite.method === 'code' ? '🔑' : '🔗'} {invite.targetEmail}
                  </span>
                  <span className="OrbitalSettingsInvites__item-code">
                    Code: {invite.code}
                  </span>
                  <span className="OrbitalSettingsInvites__item-time">
                    {formatRelativeTime(invite.createdAt)} · {getExpiryText(invite.expiresAt)}
                  </span>
                </div>
                <span
                  className={`OrbitalSettingsInvites__item-status OrbitalSettingsInvites__item-status--${invite.status}`}
                >
                  {invite.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </OrbitalSettingsSection>

      <OrbitalSettingsSection title="About Invites">
        <div className="OrbitalSettingsInvites__info">
          <p>
            <strong>How invites work:</strong>
          </p>
          <ul>
            <li>Each invite is tied to a specific email address</li>
            <li>Only the person with that email can use the code</li>
            <li>Codes expire after 24 hours for security</li>
            <li>Your orbit can have up to 10 members</li>
          </ul>
        </div>
      </OrbitalSettingsSection>
    </div>
  );
}
