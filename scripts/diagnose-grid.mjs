/**
 * Grid Layout Diagnostic Script
 * Direct Playwright script to inspect OrbitalMessage grid layout
 */

import { chromium } from 'playwright';

async function diagnose() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log('Navigating to Storybook...');
    await page.goto('http://localhost:6006');

    // Wait for Storybook to load
    await page.waitForLoadState('networkidle');

    // Navigate to OrbitalThreadingDemo story
    console.log('Opening OrbitalThreadingDemo...');
    await page.click('button:has-text("Orbital")');
    await page.waitForTimeout(500);
    await page.click('a:has-text("Orbital Threading Demo")');
    await page.waitForTimeout(1000);

    // Switch to the iframe
    const iframe = page.frameLocator('#storybook-preview-iframe');
    await iframe.locator('.OrbitalMessage').first().waitFor();

    console.log('\n======================================');
    console.log('GRID LAYOUT DIAGNOSIS');
    console.log('======================================\n');

    // Get all messages
    const messages = iframe.locator('.OrbitalMessage');
    const count = await messages.count();
    console.log(`Found ${count} OrbitalMessage components\n`);

    // Inspect first 3 messages
    for (let i = 0; i < Math.min(3, count); i++) {
      const message = messages.nth(i);
      const level = await message.getAttribute('data-level');

      console.log(`\n━━━ MESSAGE ${i + 1} (Level ${level}) ━━━\n`);

      // Get message container styles
      const messageStyles = await message.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          display: computed.display,
          gridTemplateColumns: computed.gridTemplateColumns,
          gridTemplateRows: computed.gridTemplateRows,
          gap: computed.gap,
          columnGap: computed.columnGap,
          rowGap: computed.rowGap,
          marginLeft: computed.marginLeft,
        };
      });

      console.log('📦 Message Container:');
      console.log('  display:', messageStyles.display);
      console.log('  grid-template-columns:', messageStyles.gridTemplateColumns);
      console.log('  grid-template-rows:', messageStyles.gridTemplateRows);
      console.log('  gap:', messageStyles.gap);
      console.log('  column-gap:', messageStyles.columnGap);
      console.log('  row-gap:', messageStyles.rowGap);
      console.log('  margin-left:', messageStyles.marginLeft);

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

        console.log('\n🖼️  Avatar:');
        console.log('  grid-column:', avatarStyles.gridColumn);
        console.log('  grid-row:', avatarStyles.gridRow);
        console.log('  grid-column-start:', avatarStyles.gridColumnStart);
        console.log('  grid-column-end:', avatarStyles.gridColumnEnd);
        console.log('  grid-row-start:', avatarStyles.gridRowStart);
        console.log('  grid-row-end:', avatarStyles.gridRowEnd);
        console.log('  width:', avatarStyles.width);
        console.log('  height:', avatarStyles.height);
        console.log('  align-self:', avatarStyles.alignSelf);
        console.log('  position:', avatarStyles.position);
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

        console.log('\n📄 Content Wrapper:');
        console.log('  display:', contentStyles.display);
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

        console.log('\n📌 Header:');
        console.log('  grid-column:', headerStyles.gridColumn);
        console.log('  grid-row:', headerStyles.gridRow);
        console.log('  grid-column-start:', headerStyles.gridColumnStart);
        console.log('  grid-column-end:', headerStyles.gridColumnEnd);
        console.log('  grid-row-start:', headerStyles.gridRowStart);
        console.log('  grid-row-end:', headerStyles.gridRowEnd);
        console.log('  display:', headerStyles.display);
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

        console.log('\n📝 Body:');
        console.log('  grid-column:', bodyStyles.gridColumn);
        console.log('  grid-row:', bodyStyles.gridRow);
        console.log('  grid-column-start:', bodyStyles.gridColumnStart);
        console.log('  grid-column-end:', bodyStyles.gridColumnEnd);
        console.log('  grid-row-start:', bodyStyles.gridRowStart);
        console.log('  grid-row-end:', bodyStyles.gridRowEnd);
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

        console.log('\n🔘 Actions:');
        console.log('  grid-column:', actionsStyles.gridColumn);
        console.log('  grid-row:', actionsStyles.gridRow);
        console.log('  grid-column-start:', actionsStyles.gridColumnStart);
        console.log('  grid-column-end:', actionsStyles.gridColumnEnd);
        console.log('  grid-row-start:', actionsStyles.gridRowStart);
        console.log('  grid-row-end:', actionsStyles.gridRowEnd);
      }

      // Check bounding boxes
      const avatarBox = avatarExists ? await avatar.boundingBox() : null;
      const headerBox = headerExists ? await header.boundingBox() : null;
      const bodyBox = bodyExists ? await body.boundingBox() : null;

      console.log('\n📐 Bounding Boxes:');
      if (avatarBox) {
        console.log(`  Avatar: x=${avatarBox.x.toFixed(1)}, y=${avatarBox.y.toFixed(1)}, w=${avatarBox.width.toFixed(1)}, h=${avatarBox.height.toFixed(1)}`);
      }
      if (headerBox) {
        console.log(`  Header: x=${headerBox.x.toFixed(1)}, y=${headerBox.y.toFixed(1)}, w=${headerBox.width.toFixed(1)}, h=${headerBox.height.toFixed(1)}`);
      }
      if (bodyBox) {
        console.log(`  Body:   x=${bodyBox.x.toFixed(1)}, y=${bodyBox.y.toFixed(1)}, w=${bodyBox.width.toFixed(1)}, h=${bodyBox.height.toFixed(1)}`);
      }

      // Check if avatar and header have same Y position
      if (avatarBox && headerBox) {
        const yDiff = Math.abs(avatarBox.y - headerBox.y);
        const sameY = yDiff < 2;
        console.log(`\n  ⚠️  Y-position difference: ${yDiff.toFixed(1)}px`);
        if (sameY) {
          console.log('  ❌ PROBLEM: Avatar and header at same Y position!');
        } else {
          console.log('  ✅ LOOKS CORRECT: Avatar and header at different Y positions');
        }
      }
    }

    // Take screenshot
    console.log('\n======================================');
    console.log('Taking screenshot...');
    await page.screenshot({
      path: 'test-results/grid-diagnosis.png',
      fullPage: true
    });
    console.log('Screenshot saved to test-results/grid-diagnosis.png');
    console.log('======================================\n');

    // Wait 5 seconds before closing so user can inspect
    console.log('Keeping browser open for 5 seconds for visual inspection...');
    await page.waitForTimeout(5000);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
    console.log('Done!');
  }
}

diagnose();
