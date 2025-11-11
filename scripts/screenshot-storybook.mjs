#!/usr/bin/env node
/**
 * Screenshot Storybook components for visual verification
 */

import playwright from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function takeScreenshots() {
  console.log('Launching browser...');
  const browser = await playwright.chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  // Create screenshots directory
  const screenshotsDir = path.join(__dirname, '../test-results/screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  try {
    console.log('Navigating to Threading Demo...');
    await page.goto('http://localhost:6006/?path=/story/orbital-threadingdemo--full-demo', {
      waitUntil: 'load',
      timeout: 60000,
    });

    // Wait for Storybook iframe to load
    const frame = page.frameLocator('#storybook-preview-iframe');

    // Wait for the content to load in the iframe
    await frame.locator('.OrbitalMessage').first().waitFor({ timeout: 10000 });

    // Give time for styles to apply
    await page.waitForTimeout(2000);

    console.log('Taking full demo screenshot...');
    await page.screenshot({
      path: path.join(screenshotsDir, 'threading-demo-full.png'),
      fullPage: true,
    });

    // Get the iframe element for screenshots
    const iframeElement = await page.locator('#storybook-preview-iframe').elementHandle();
    if (iframeElement) {
      const iframe = await iframeElement.contentFrame();

      // Get the first message and screenshot it
      const firstMessage = iframe.locator('.OrbitalMessage').first();
      if (await firstMessage.count() > 0) {
        console.log('Taking first message screenshot...');
        await firstMessage.screenshot({
          path: path.join(screenshotsDir, 'first-message-detail.png'),
        });
      }

      // Check ALL messages for avatar visibility
      const messages = iframe.locator('.OrbitalMessage');
      const count = await messages.count();
      console.log(`\nFound ${count} messages\n`);

      for (let i = 0; i < Math.min(count, 5); i++) {
        const message = messages.nth(i);
        const level = await message.getAttribute('data-level');

        const layoutInfo = await message.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          const avatar = el.querySelector('.OrbitalMessage__avatar');
          const content = el.querySelector('.OrbitalMessage__content');

          let avatarStyles = null;
          if (avatar) {
            // Check what's inside the avatar
            const avatarHTML = avatar.outerHTML.substring(0, 300);
            const avatarComputed = window.getComputedStyle(avatar);
            const box = avatar.getBoundingClientRect();

            // Get ALL applied CSS rules for width
            const allRules = [];
            const sheets = Array.from(document.styleSheets);
            for (const sheet of sheets) {
              try {
                const rules = Array.from(sheet.cssRules || []);
                for (const rule of rules) {
                  if (rule.style && avatar.matches(rule.selectorText)) {
                    if (rule.style.width) {
                      allRules.push({
                        selector: rule.selectorText,
                        width: rule.style.width,
                      });
                    }
                  }
                }
              } catch (e) {
                // CORS error for external sheets, ignore
              }
            }

            avatarStyles = {
              html: avatarHTML,
              display: avatarComputed.display,
              visibility: avatarComputed.visibility,
              opacity: avatarComputed.opacity,
              width: avatarComputed.width,
              height: avatarComputed.height,
              gridColumn: avatarComputed.gridColumn,
              gridRow: avatarComputed.gridRow,
              minWidth: avatarComputed.minWidth,
              maxWidth: avatarComputed.maxWidth,
              flexShrink: avatarComputed.flexShrink,
              flexGrow: avatarComputed.flexGrow,
              flexBasis: avatarComputed.flexBasis,
              boundingBox: {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
              },
              widthRules: allRules,
            };
          }

          return {
            messageDisplay: computed.display,
            messageGridTemplateColumns: computed.gridTemplateColumns,
            messageMarginLeft: computed.marginLeft,
            hasAvatar: !!avatar,
            hasContent: !!content,
            avatarStyles,
          };
        });

        console.log(`Message ${i} (Level ${level}):`);
        console.log(JSON.stringify(layoutInfo, null, 2));
        console.log('');
      }
    }

    console.log('\nScreenshots saved to:', screenshotsDir);
  } catch (error) {
    console.error('Error taking screenshots:', error);
  } finally {
    await browser.close();
  }
}

takeScreenshots();
