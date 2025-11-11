// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Test to verify the Twitter-style layout (avatar left, content right)
 * for OrbitalMessage components
 */

import { test, expect } from '@playwright/test';

test.describe('OrbitalMessage Layout', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Storybook
    await page.goto('http://localhost:6006');
    await page.waitForLoadState('networkidle');
  });

  test('should display threading demo with new layout', async ({ page }) => {
    // Navigate to the Threading Demo story
    await page.goto('http://localhost:6006/?path=/story/orbital-threadingdemo--full-demo');

    // Wait for content to load
    await page.waitForSelector('.OrbitalMessage', { timeout: 10000 });

    // Take a full screenshot
    await page.screenshot({
      path: 'test-results/screenshots/threading-demo-new-layout.png',
      fullPage: true,
    });

    // Verify the message structure
    const firstMessage = page.locator('.OrbitalMessage').first();

    // Check that avatar exists
    const avatar = firstMessage.locator('.OrbitalMessage__avatar');
    await expect(avatar).toBeVisible();

    // Check that content wrapper exists
    const content = firstMessage.locator('.OrbitalMessage__content');
    await expect(content).toBeVisible();

    // Take a screenshot of just the first message
    await firstMessage.screenshot({
      path: 'test-results/screenshots/single-message-new-layout.png',
    });
  });

  test('should display color depth guide', async ({ page }) => {
    // Navigate to the Color Depth Guide story
    await page.goto('http://localhost:6006/?path=/story/orbital-threadingdemo--color-depth-guide');

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    // Take a screenshot
    await page.screenshot({
      path: 'test-results/screenshots/color-depth-guide.png',
      fullPage: true,
    });
  });

  test('should verify flexbox layout structure', async ({ page }) => {
    await page.goto('http://localhost:6006/?path=/story/orbital-threadingdemo--full-demo');

    // Wait for messages to load
    await page.waitForSelector('.OrbitalMessage', { timeout: 10000 });

    const firstMessage = page.locator('.OrbitalMessage').first();

    // Check CSS display property is flex
    const displayValue = await firstMessage.evaluate((el) => {
      return window.getComputedStyle(el).display;
    });

    expect(displayValue).toBe('flex');

    // Check that avatar is first child
    const firstChild = await firstMessage.evaluate((el) => {
      const first = el.firstElementChild;
      return first?.classList.contains('OrbitalMessage__avatar');
    });

    expect(firstChild).toBe(true);

    // Check that content wrapper is second child
    const secondChild = await firstMessage.evaluate((el) => {
      const second = el.children[1];
      return second?.classList.contains('OrbitalMessage__content');
    });

    expect(secondChild).toBe(true);
  });
});
