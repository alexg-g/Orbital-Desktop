/**
 * Grid Layout Diagnostic Test
 *
 * This test inspects the OrbitalMessage component's CSS Grid layout
 * to diagnose why avatars might be moving with headers.
 */

import { test, expect } from '@playwright/test';

test.describe('OrbitalMessage Grid Layout Diagnosis', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Storybook
    await page.goto('http://localhost:6006');

    // Wait for Storybook to load
    await page.waitForLoadState('networkidle');

    // Navigate to OrbitalThreadingDemo story
    // First, expand the Orbital section
    await page.click('button:has-text("Orbital")');

    // Wait a bit for the tree to expand
    await page.waitForTimeout(500);

    // Click on OrbitalThreadingDemo
    await page.click('a:has-text("Orbital Threading Demo")');

    // Wait for the story to render
    await page.waitForTimeout(1000);

    // Switch to the iframe where the story renders
    const iframe = page.frameLocator('#storybook-preview-iframe');
    await iframe.locator('.OrbitalMessage').first().waitFor();
  });

  test('diagnose grid positioning', async ({ page }) => {
    const iframe = page.frameLocator('#storybook-preview-iframe');

    // Get all messages
    const messages = iframe.locator('.OrbitalMessage');
    const count = await messages.count();

    console.log(`\n======================================`);
    console.log(`Found ${count} OrbitalMessage components`);
    console.log(`======================================\n`);

    // Inspect first 3 messages (different levels)
    for (let i = 0; i < Math.min(3, count); i++) {
      const message = messages.nth(i);
      const level = await message.getAttribute('data-level');

      console.log(`\n--- MESSAGE ${i + 1} (Level ${level}) ---`);

      // Get the message container styles
      const messageStyles = await message.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          display: computed.display,
          gridTemplateColumns: computed.gridTemplateColumns,
          gridTemplateRows: computed.gridTemplateRows,
          gap: computed.gap,
          marginLeft: computed.marginLeft,
        };
      });

      console.log('Message container styles:');
      console.log(JSON.stringify(messageStyles, null, 2));

      // Get avatar styles
      const avatar = message.locator('.OrbitalMessage__avatar');
      const avatarExists = await avatar.count() > 0;

      if (avatarExists) {
        const avatarStyles = await avatar.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            gridColumn: computed.gridColumn,
            gridRow: computed.gridRow,
            gridColumnStart: computed.gridColumnStart,
            gridColumnEnd: computed.gridColumnEnd,
            gridRowStart: computed.gridRowStart,
            gridRowEnd: computed.gridRowEnd,
            width: computed.width,
            height: computed.height,
            alignSelf: computed.alignSelf,
            position: computed.position,
          };
        });

        console.log('\nAvatar styles:');
        console.log(JSON.stringify(avatarStyles, null, 2));
      }

      // Get content wrapper styles
      const content = message.locator('.OrbitalMessage__content');
      const contentExists = await content.count() > 0;

      if (contentExists) {
        const contentStyles = await content.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            display: computed.display,
          };
        });

        console.log('\nContent wrapper styles:');
        console.log(JSON.stringify(contentStyles, null, 2));
      }

      // Get header styles
      const header = message.locator('.OrbitalMessage__header');
      const headerExists = await header.count() > 0;

      if (headerExists) {
        const headerStyles = await header.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            gridColumn: computed.gridColumn,
            gridRow: computed.gridRow,
            gridColumnStart: computed.gridColumnStart,
            gridColumnEnd: computed.gridColumnEnd,
            gridRowStart: computed.gridRowStart,
            gridRowEnd: computed.gridRowEnd,
            display: computed.display,
          };
        });

        console.log('\nHeader styles:');
        console.log(JSON.stringify(headerStyles, null, 2));
      }

      // Get body styles
      const body = message.locator('.OrbitalMessage__body');
      const bodyExists = await body.count() > 0;

      if (bodyExists) {
        const bodyStyles = await body.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            gridColumn: computed.gridColumn,
            gridRow: computed.gridRow,
            gridColumnStart: computed.gridColumnStart,
            gridColumnEnd: computed.gridColumnEnd,
            gridRowStart: computed.gridRowStart,
            gridRowEnd: computed.gridRowEnd,
          };
        });

        console.log('\nBody styles:');
        console.log(JSON.stringify(bodyStyles, null, 2));
      }

      // Get actions styles
      const actions = message.locator('.OrbitalMessage__actions');
      const actionsExists = await actions.count() > 0;

      if (actionsExists) {
        const actionsStyles = await actions.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            gridColumn: computed.gridColumn,
            gridRow: computed.gridRow,
            gridColumnStart: computed.gridColumnStart,
            gridColumnEnd: computed.gridColumnEnd,
            gridRowStart: computed.gridRowStart,
            gridRowEnd: computed.gridRowEnd,
          };
        });

        console.log('\nActions styles:');
        console.log(JSON.stringify(actionsStyles, null, 2));
      }

      // Check bounding boxes to see actual positioning
      const avatarBox = avatarExists ? await avatar.boundingBox() : null;
      const headerBox = headerExists ? await header.boundingBox() : null;
      const bodyBox = bodyExists ? await body.boundingBox() : null;

      console.log('\nBounding boxes:');
      console.log('Avatar:', avatarBox);
      console.log('Header:', headerBox);
      console.log('Body:', bodyBox);

      // Check if avatar and header have same Y position (would indicate issue)
      if (avatarBox && headerBox) {
        const sameY = Math.abs(avatarBox.y - headerBox.y) < 2; // Within 2px tolerance
        console.log(`\n⚠️  Avatar and header at same Y? ${sameY ? 'YES - THIS IS THE PROBLEM' : 'NO - looks correct'}`);
      }
    }

    // Take a screenshot for visual inspection
    await page.screenshot({
      path: 'test-results/grid-diagnosis.png',
      fullPage: true
    });

    console.log('\n======================================');
    console.log('Screenshot saved to test-results/grid-diagnosis.png');
    console.log('======================================\n');
  });

  test('check for CSS conflicts', async ({ page }) => {
    const iframe = page.frameLocator('#storybook-preview-iframe');

    // Check if there are any overriding styles
    const message = iframe.locator('.OrbitalMessage').first();

    const cssConflicts = await message.evaluate(() => {
      const el = document.querySelector('.OrbitalMessage');
      if (!el) return null;

      // Get all stylesheets
      const stylesheets = Array.from(document.styleSheets);
      const conflicts: any[] = [];

      // Check for rules that might affect grid
      stylesheets.forEach(sheet => {
        try {
          const rules = Array.from(sheet.cssRules || []);
          rules.forEach((rule: any) => {
            if (rule.selectorText && rule.selectorText.includes('OrbitalMessage')) {
              const style = rule.style;
              const relevantProps = ['display', 'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row'];

              relevantProps.forEach(prop => {
                if (style[prop]) {
                  conflicts.push({
                    selector: rule.selectorText,
                    property: prop,
                    value: style[prop]
                  });
                }
              });
            }
          });
        } catch (e) {
          // CORS errors on some stylesheets
        }
      });

      return conflicts;
    });

    console.log('\n======================================');
    console.log('CSS Rules Affecting Grid:');
    console.log('======================================\n');
    console.log(JSON.stringify(cssConflicts, null, 2));
  });
});
