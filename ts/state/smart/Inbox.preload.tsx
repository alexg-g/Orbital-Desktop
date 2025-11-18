// Copyright 2022 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2025 Orbital

import React, { memo } from 'react';
import { SmartOrbitalInbox } from './OrbitalInbox.preload.js';

/**
 * SmartInbox - Root inbox component for Orbital
 *
 * This component has been replaced with OrbitalInbox, which provides
 * Orbital's threaded forum UI instead of Signal's chat interface.
 */
export const SmartInbox = memo(function SmartInbox(): JSX.Element {
  return <SmartOrbitalInbox />;
});
