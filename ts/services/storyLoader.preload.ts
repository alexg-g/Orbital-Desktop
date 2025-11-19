// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

// Stub file for Orbital - Stories feature removed
// This file provides minimal exports to satisfy imports in other files
// All story-related code paths are dead code since Orbital doesn't use stories

import type { MessageAttributesType } from '../model-types.d.ts';

export function getStoryDataFromMessageAttributes(
  _attributes: MessageAttributesType
): null {
  // Stories are not used in Orbital, always return null
  // This will cause the calling code to early-return (see MessageCache.preload.ts:314-316)
  return null;
}
