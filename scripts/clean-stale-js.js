#!/usr/bin/env node
// Copyright 2025 Orbital
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Clean stale .js files that have corresponding .ts/.tsx source files
 *
 * This prevents webpack/storybook from serving old compiled JavaScript
 * instead of compiling fresh from TypeScript source.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TS_DIR = path.join(__dirname, '..', 'ts');

let removedCount = 0;

/**
 * Recursively find all .tsx and .ts files and remove corresponding .js files
 */
function cleanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and other build directories
      if (
        entry.name === 'node_modules' ||
        entry.name === 'build' ||
        entry.name === 'dist'
      ) {
        continue;
      }
      cleanDirectory(fullPath);
    } else if (entry.isFile()) {
      // Check if this is a .tsx or .ts file
      if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        const baseName = entry.name.replace(/\.tsx?$/, '');
        const jsFile = path.join(dir, `${baseName}.js`);

        // If a .js file exists alongside the TypeScript source, remove it
        if (fs.existsSync(jsFile)) {
          console.log(`Removing stale: ${path.relative(process.cwd(), jsFile)}`);
          fs.unlinkSync(jsFile);
          removedCount++;
        }
      }
    }
  }
}

console.log('🧹 Cleaning stale .js files...\n');
cleanDirectory(TS_DIR);

if (removedCount > 0) {
  console.log(`\n✅ Removed ${removedCount} stale .js file(s)`);
} else {
  console.log('\n✨ No stale .js files found');
}
