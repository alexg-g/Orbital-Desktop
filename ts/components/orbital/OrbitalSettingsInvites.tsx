// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState, useCallback } from 'react';
import {
  OrbitalSettingsSection,
  OrbitalSettingsButton,
} from './OrbitalSettingsControl';

type InviteStatus = 'pending' | 'accepted' | 'expired';

type SentInvite = {
  id: string;
  code: string;
  method: 'code' | 'link';
  createdAt: number;
  expiresAt: number;
  status: InviteStatus;
};

export function OrbitalSettingsInvites(): JSX.Element {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [shareableLink, setShareableLink] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  // Track sent invites (in production, this would be loaded from storage)
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);

  const generateCode = useCallback((): string => {
    // Generate 8-character alphanumeric code (matching backend format)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }, []);

  const handleGenerateCode = useCallback(async () => {
    setIsGeneratingCode(true);
    try {
      // TODO: In production, call the backend API:
      // const result = await orbitalGroups.regenerateInviteCode(groupId);
      // setInviteCode(result.code);

      // For now, generate a mock code
      await new Promise(resolve => setTimeout(resolve, 300)); // Simulate API call
      const code = generateCode();
      setInviteCode(code);

      // Track the invite
      const newInvite: SentInvite = {
        id: `invite-${Date.now()}`,
        code,
        method: 'code',
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        status: 'pending',
      };
      setSentInvites(prev => [newInvite, ...prev]);
    } catch (error) {
      console.error('Failed to generate invite code:', error);
    } finally {
      setIsGeneratingCode(false);
    }
  }, [generateCode]);

  const handleGenerateLink = useCallback(async () => {
    setIsGeneratingLink(true);
    try {
      // TODO: In production, generate a proper deep link:
      // const result = await orbitalGroups.regenerateInviteCode(groupId);
      // setShareableLink(`orbital://invite/${result.code}`);

      // For now, generate a mock link
      await new Promise(resolve => setTimeout(resolve, 300)); // Simulate API call
      const code = generateCode();
      const link = `orbital://invite/${code}`;
      setShareableLink(link);

      // Track the invite
      const newInvite: SentInvite = {
        id: `invite-${Date.now()}`,
        code,
        method: 'link',
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        status: 'pending',
      };
      setSentInvites(prev => [newInvite, ...prev]);
    } catch (error) {
      console.error('Failed to generate shareable link:', error);
    } finally {
      setIsGeneratingLink(false);
    }
  }, [generateCode]);

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

  return (
    <div className="OrbitalSettingsInvites">
      <OrbitalSettingsSection title="Invite to Your Orbit">
        <p className="OrbitalSettingsInvites__description">
          Share Orbital with family and friends. Invite codes are single-use and
          expire after 24 hours for security.
        </p>

        <div className="OrbitalSettingsInvites__actions">
          <div className="OrbitalSettingsInvites__action-group">
            <OrbitalSettingsButton
              label={isGeneratingCode ? 'Generating...' : 'Generate Invite Code'}
              onClick={handleGenerateCode}
              variant="primary"
              disabled={isGeneratingCode}
            />
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
          </div>

          <div className="OrbitalSettingsInvites__action-group">
            <OrbitalSettingsButton
              label={isGeneratingLink ? 'Generating...' : 'Generate Shareable Link'}
              onClick={handleGenerateLink}
              variant="secondary"
              disabled={isGeneratingLink}
            />
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
        </div>
      </OrbitalSettingsSection>

      <OrbitalSettingsSection title="Recent Invites">
        {sentInvites.length === 0 ? (
          <p className="OrbitalSettingsInvites__empty">
            No invites generated yet. Create an invite code or link above to
            invite someone to your orbit.
          </p>
        ) : (
          <div className="OrbitalSettingsInvites__list">
            {sentInvites.slice(0, 10).map(invite => (
              <div key={invite.id} className="OrbitalSettingsInvites__item">
                <div className="OrbitalSettingsInvites__item-info">
                  <span className="OrbitalSettingsInvites__item-code">
                    {invite.method === 'code' ? '🔑' : '🔗'} {invite.code}
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
            <li>Each invite code can only be used once</li>
            <li>Codes expire after 24 hours for security</li>
            <li>Your orbit can have up to 10 members</li>
            <li>Share codes directly or use the shareable link</li>
          </ul>
        </div>
      </OrbitalSettingsSection>
    </div>
  );
}
