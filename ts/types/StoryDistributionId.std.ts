// Copyright 2022 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// REMOVED: Orbital cleanup - Stories feature removed
// This file exists as a stub to prevent import errors during the transition

import { v4 as generateUuid } from 'uuid';

export type StoryDistributionId = string;
export type StoryDistributionIdString = string;

export function generateStoryDistributionId(): StoryDistributionId {
  return generateUuid();
}

export function normalizeStoryDistributionId(id: string): StoryDistributionId {
  // Stub for Orbital - Stories feature removed
  // Just pass through the ID since we don't use stories
  return id;
}

export function isStoryDistributionId(value: unknown): value is StoryDistributionId {
  // Stub for Orbital - Stories feature removed
  // Since stories are never used in Orbital, this should always return false
  // But for safety with legacy code paths, we'll just check if it's a string
  return typeof value === 'string';
}
