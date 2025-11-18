// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

import React, { memo } from 'react';
import { useSelector } from 'react-redux';
import { OrbitalInbox } from '../../components/orbital/OrbitalInbox';
import { getIntl } from '../selectors/user.std';

export const SmartOrbitalInbox = memo(function SmartOrbitalInbox(): JSX.Element {
  const i18n = useSelector(getIntl);

  return <OrbitalInbox i18n={i18n} />;
});
