// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Storybook mock for orbitalQuota.preload.ts
 * Provides stub implementations for quota functions that work in browser environment
 */

export type QuotaInfo = {
  used: number;
  total: number;
  remaining: number;
  percentage: number;
};

export async function getQuotaInfo(): Promise<QuotaInfo> {
  console.log('[Storybook Mock] getQuotaInfo called');
  return {
    used: 2.5 * 1024 * 1024 * 1024, // 2.5 GB
    total: 10 * 1024 * 1024 * 1024, // 10 GB
    remaining: 7.5 * 1024 * 1024 * 1024, // 7.5 GB
    percentage: 25,
  };
}

export async function checkQuota(_sizeBytes: number): Promise<{ allowed: boolean; remaining: number }> {
  console.log('[Storybook Mock] checkQuota called');
  return {
    allowed: true,
    remaining: 7.5 * 1024 * 1024 * 1024,
  };
}

export async function updateQuotaUsed(_deltaBytes: number): Promise<QuotaInfo> {
  console.log('[Storybook Mock] updateQuotaUsed called');
  return {
    used: 2.5 * 1024 * 1024 * 1024,
    total: 10 * 1024 * 1024 * 1024,
    remaining: 7.5 * 1024 * 1024 * 1024,
    percentage: 25,
  };
}
