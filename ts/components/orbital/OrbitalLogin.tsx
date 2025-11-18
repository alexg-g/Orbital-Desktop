// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Login Component
 *
 * Simple login form for Orbital authentication.
 * Matches Signal's minimal UI aesthetic.
 */

import React, { useState, useCallback } from 'react';
import type { LocalizerType } from '../../types/Util.std.js';
import { Modal } from '../Modal.dom.js';
import { Button, ButtonVariant } from '../Button.dom.js';
import { Input } from '../Input.dom.js';
import { Spinner } from '../Spinner.dom.js';
import { login } from '../../services/orbitalAuth.preload.js';

export type PropsType = {
  i18n: LocalizerType;
  onClose: () => void;
  onLoginSuccess?: () => void;
};

export function OrbitalLogin({
  i18n,
  onClose,
  onLoginSuccess,
}: PropsType): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (!username.trim() || !password.trim()) {
        setError('Please enter both username and password.');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        await login({ username: username.trim(), password });

        // Success - token now stored in SQLCipher
        if (onLoginSuccess) {
          onLoginSuccess();
        }

        // Close the modal
        onClose();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Login failed';

        if (errorMessage.includes('401') || errorMessage.includes('failed')) {
          setError('Invalid username or password. Please try again.');
        } else if (errorMessage.includes('network') || errorMessage.includes('ENOTFOUND')) {
          setError('Could not connect to Orbital server. Please check your internet connection.');
        } else {
          setError('An unexpected error occurred. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    },
    [username, password, onClose, onLoginSuccess]
  );

  return (
    <Modal
      modalName="OrbitalLogin"
      hasXButton={false}
      i18n={i18n}
      onClose={onClose}
      noEscapeClose
      title="Log in to Orbital"
    >
      <div className="OrbitalLogin">
        <div className="OrbitalLogin__description">
          Please log in with your Orbital account credentials.
        </div>

        <form onSubmit={handleSubmit} className="OrbitalLogin__form">
          <div className="OrbitalLogin__field">
            <label htmlFor="orbital-username" className="OrbitalLogin__label">
              Username
            </label>
            <Input
              i18n={i18n}
              id="orbital-username"
              value={username}
              onChange={setUsername}
              placeholder="Enter your username"
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="OrbitalLogin__field">
            <label htmlFor="orbital-password" className="OrbitalLogin__label">
              Password
            </label>
            <div className="OrbitalLogin__password-wrapper">
              <input
                type="password"
                id="orbital-password"
                className="Input__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={loading}
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && (
            <div className="OrbitalLogin__error" role="alert">
              {error}
            </div>
          )}

          <div className="OrbitalLogin__buttons">
            <Button
              type="submit"
              variant={ButtonVariant.Primary}
              disabled={loading || !username.trim() || !password.trim()}
            >
              {loading ? (
                <>
                  <Spinner size="20px" svgSize="small" />
                  <span style={{ marginLeft: '8px' }}>Logging in...</span>
                </>
              ) : (
                'Log In'
              )}
            </Button>
          </div>
        </form>

        <div className="OrbitalLogin__footer">
          This is a closed beta. Accounts are created by invitation only.
        </div>
      </div>
    </Modal>
  );
}
