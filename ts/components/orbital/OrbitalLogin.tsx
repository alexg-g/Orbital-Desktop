// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Orbital Login/Signup Component
 *
 * Handles both login and account creation.
 * Signup requires an invite code tied to the user's email.
 */

import React, { useState, useCallback } from 'react';
import type { LocalizerType } from '../../types/Util.std.js';
import { Button, ButtonVariant } from '../Button.dom.js';
import { Input } from '../Input.dom.js';
import { Spinner } from '../Spinner.dom.js';
import { login, signup } from '../../services/orbitalAuth.preload.js';

export type PropsType = {
  i18n: LocalizerType;
  onClose: () => void;
  onLoginSuccess?: () => void;
};

type AuthMode = 'login' | 'signup';

function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function OrbitalLogin({
  i18n,
  onClose,
  onLoginSuccess,
}: PropsType): JSX.Element {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleModeSwitch = useCallback(() => {
    setMode(prev => (prev === 'login' ? 'signup' : 'login'));
    setError(null);
    // Clear signup-only fields when switching to login
    if (mode === 'signup') {
      setEmail('');
      setInviteCode('');
    }
  }, [mode]);

  const validateSignupFields = useCallback((): string | null => {
    if (!email.trim()) {
      return 'Email address is required';
    }
    if (!isValidEmail(email.trim())) {
      return 'Please enter a valid email address';
    }
    if (!inviteCode.trim()) {
      return 'Invite code is required';
    }
    if (inviteCode.trim().length !== 8) {
      return 'Invite code must be 8 characters';
    }
    if (!username.trim()) {
      return 'Username is required';
    }
    if (username.trim().length < 3) {
      return 'Username must be at least 3 characters';
    }
    if (!password) {
      return 'Password is required';
    }
    if (password.length < 12) {
      return 'Password must be at least 12 characters';
    }
    return null;
  }, [email, inviteCode, username, password]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (mode === 'login') {
        if (!username.trim() || !password.trim()) {
          setError('Please enter both username and password.');
          return;
        }
      } else {
        const validationError = validateSignupFields();
        if (validationError) {
          setError(validationError);
          return;
        }
      }

      setLoading(true);
      setError(null);

      try {
        if (mode === 'login') {
          await login({ username: username.trim(), password });
        } else {
          // Call signup API with invite code
          await signup({
            username: username.trim(),
            password,
            email: email.trim(),
            inviteCode: inviteCode.trim().toUpperCase(),
          });
        }

        // Success - token now stored in SQLCipher
        if (onLoginSuccess) {
          onLoginSuccess();
        }

        // Close the modal
        onClose();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Authentication failed';

        if (errorMessage.includes('401') || errorMessage.includes('Invalid credentials')) {
          setError('Invalid username or password. Please try again.');
        } else if (errorMessage.includes('email') && errorMessage.includes('different')) {
          setError('This invite code was sent to a different email address.');
        } else if (errorMessage.includes('already been used')) {
          setError('This invite code has already been used.');
        } else if (errorMessage.includes('expired')) {
          setError('This invite code has expired.');
        } else if (errorMessage.includes('Invalid invite')) {
          setError('Invalid invite code. Please check and try again.');
        } else if (errorMessage.includes('Username already')) {
          setError('This username is already taken. Please choose another.');
        } else if (errorMessage.includes('email already')) {
          setError('An account with this email already exists.');
        } else if (errorMessage.includes('network') || errorMessage.includes('ENOTFOUND')) {
          setError('Could not connect to Orbital server. Please check your internet connection.');
        } else {
          setError(errorMessage || 'An unexpected error occurred. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    },
    [mode, username, password, email, inviteCode, onClose, onLoginSuccess, validateSignupFields]
  );

  const isFormValid = mode === 'login'
    ? username.trim() && password.trim()
    : email.trim() && inviteCode.trim() && username.trim() && password;

  return (
    <div className="OrbitalLogin">
      <div className="OrbitalLogin__card">
        <div className="OrbitalLogin__logo">
          <img
            src="images/orbital/orbital-logo-light-lg.svg"
            alt="Orbital"
            className="OrbitalLogin__logo-img OrbitalLogin__logo-img--light"
          />
          <img
            src="images/orbital/orbital-logo-darkmode-lg.svg"
            alt="Orbital"
            className="OrbitalLogin__logo-img OrbitalLogin__logo-img--dark"
          />
        </div>

        <h1 className="OrbitalLogin__title">
          {mode === 'login' ? 'Log in to Orbital' : 'Create Your Account'}
        </h1>

        <div className="OrbitalLogin__description">
          {mode === 'login'
            ? 'Enter your credentials to continue.'
            : 'Enter your invite code and create your account.'}
        </div>

        <form onSubmit={handleSubmit} className="OrbitalLogin__form">
          {mode === 'signup' && (
            <>
              <div className="OrbitalLogin__field">
                <label htmlFor="orbital-email" className="OrbitalLogin__label">
                  Email Address
                </label>
                <div className="OrbitalLogin__input-wrapper">
                  <input
                    type="email"
                    id="orbital-email"
                    className="Input__input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="The email your invite was sent to"
                    disabled={loading}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>

              <div className="OrbitalLogin__field">
                <label htmlFor="orbital-invite-code" className="OrbitalLogin__label">
                  Invite Code
                </label>
                <div className="OrbitalLogin__input-wrapper">
                  <input
                    type="text"
                    id="orbital-invite-code"
                    className="Input__input OrbitalLogin__invite-code-input"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase().slice(0, 8))}
                    placeholder="8-character code (e.g., ABC12345)"
                    disabled={loading}
                    autoComplete="off"
                    maxLength={8}
                  />
                </div>
              </div>
            </>
          )}

          <div className="OrbitalLogin__field">
            <label htmlFor="orbital-username" className="OrbitalLogin__label">
              Username
            </label>
            <Input
              i18n={i18n}
              id="orbital-username"
              value={username}
              onChange={setUsername}
              placeholder={mode === 'signup' ? 'Choose a username' : 'Enter your username'}
              disabled={loading}
              autoFocus={mode === 'login'}
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
                placeholder={mode === 'signup' ? 'Create a password (min. 12 chars)' : 'Enter your password'}
                disabled={loading}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
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
              disabled={loading || !isFormValid}
            >
              {loading ? (
                <>
                  <Spinner size="20px" svgSize="small" />
                  <span style={{ marginLeft: '8px' }}>
                    {mode === 'login' ? 'Logging in...' : 'Creating account...'}
                  </span>
                </>
              ) : (
                mode === 'login' ? 'Log In' : 'Create Account'
              )}
            </Button>
          </div>
        </form>

        <div className="OrbitalLogin__mode-switch">
          {mode === 'login' ? (
            <>
              Have an invite code?{' '}
              <button
                type="button"
                className="OrbitalLogin__mode-switch-link"
                onClick={handleModeSwitch}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="OrbitalLogin__mode-switch-link"
                onClick={handleModeSwitch}
              >
                Log in
              </button>
            </>
          )}
        </div>

        <div className="OrbitalLogin__footer">
          This is a closed beta. Accounts are created by invitation only.
        </div>
      </div>
    </div>
  );
}
