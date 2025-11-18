# TypeScript Errors - Quick Fix Guide

**TL;DR:** Run these 4 commands to fix 93 critical TypeScript errors in ~60 minutes.

---

## Before You Start

**Current state:** 332 TypeScript errors
**After these fixes:** ~240 errors (all in disabled Signal features, safe to defer)
**Time required:** 60 minutes

```bash
# Check current error count
pnpm run check:types 2>&1 | grep "error TS" | wc -l
# Should output: ~332
```

---

## Step 1: Add Call Links Stubs (30 min)
**Fixes:** 27 blocking module resolution errors

```bash
cd /Users/alexg/Documents/GitHub/Orbital-Desktop

# Run the automated stub generator
npx tsx scripts/fix-call-links-stubs.ts

# Verify it worked
pnpm run check:types 2>&1 | grep "ts/sql/Server.node.ts.*TS2305" | wc -l
# Should output: 0
```

**What this does:** Adds missing stub exports to `ts/sql/server/callLinks.node.ts` for the disabled call links feature.

---

## Step 2: Delete Orphaned Files (5 min)
**Fixes:** 4 module resolution errors

```bash
cd /Users/alexg/Documents/GitHub/Orbital-Desktop

# Backup first
mkdir -p /tmp/orbital-unused-files-backup
cp ts/state/ducks/callingHelpers.std.ts /tmp/orbital-unused-files-backup/ 2>/dev/null || true
cp ts/util/isGroupOrAdhocCall.std.ts /tmp/orbital-unused-files-backup/ 2>/dev/null || true
cp ts/util/desktopCapturer.preload.ts /tmp/orbital-unused-files-backup/ 2>/dev/null || true
cp ts/state/selectors/stories2.dom.ts /tmp/orbital-unused-files-backup/ 2>/dev/null || true
cp ts/state/selectors/storyDistributionLists.dom.ts /tmp/orbital-unused-files-backup/ 2>/dev/null || true

# Delete (these files have zero imports, verified safe)
rm -f ts/state/ducks/callingHelpers.std.ts
rm -f ts/util/isGroupOrAdhocCall.std.ts
rm -f ts/util/desktopCapturer.preload.ts
rm -f ts/state/selectors/stories2.dom.ts
rm -f ts/state/selectors/storyDistributionLists.dom.ts

# Verify
pnpm run check:types 2>&1 | grep "Cannot find module"
# Should output: nothing
```

---

## Step 3: Fix Orbital Components (15 min)
**Fixes:** 3 type errors in Orbital code

### Fix 3a: OrbitalComposer.tsx - Sticker Property (2 min)

```bash
# Open the file
code ts/components/orbital/OrbitalComposer.tsx
```

**Line 329:** Change this:
```typescript
src={selectedSticker.sticker.url}
```

To this:
```typescript
src={selectedSticker.stickerUrl}
```

---

### Fix 3b: OrbitalThreadingDemo.tsx - MIME Type (5 min)

```bash
# Open the file
code ts/components/orbital/OrbitalThreadingDemo.tsx
```

**Step 1:** Add import at the top (around line 5):
```typescript
import type { MIMEType } from '../types/MIME';
```

**Step 2:** Find line ~310 with `contentType: 'image/jpeg'` and change to:
```typescript
contentType: 'image/jpeg' as MIMEType
```

---

### Fix 3c: OrbitalThreadList.stories.tsx - Remove Unused Import (1 min)

```bash
# Open the file
code ts/components/orbital/OrbitalThreadList.stories.tsx
```

**Line 4:** Delete this line:
```typescript
import React from 'react';
```

(Modern React doesn't require this import)

---

## Step 4: Auto-Fix Unused Variables (10 min)
**Fixes:** 55 unused variable/import errors

```bash
cd /Users/alexg/Documents/GitHub/Orbital-Desktop

# Fix Orbital files (priority)
npx eslint --fix ts/components/orbital/OrbitalQuillEditor.tsx
npx eslint --fix ts/components/orbital/OrbitalMediaViewer.tsx
npx eslint --fix ts/components/orbital/OrbitalThreadDetail.tsx
npx eslint --fix ts/components/orbital/OrbitalComposer.tsx
npx eslint --fix ts/components/orbital/OrbitalMessage.tsx
npx eslint --fix ts/services/orbitalMediaDownload.preload.ts
npx eslint --fix ts/services/orbitalMediaUpload.preload.ts

# Optional: Fix Signal files too (recommended)
npx eslint --fix ts/components/conversation/Message.dom.tsx
npx eslint --fix ts/components/conversation/TimelineMessage.dom.stories.tsx
npx eslint --fix ts/components/NavTabs.dom.tsx
npx eslint --fix ts/components/ConversationList.dom.tsx
npx eslint --fix ts/axo/_internal/AxoBaseSegmentedControl.dom.tsx
npx eslint --fix ts/axo/AxoSelect.dom.tsx
```

**Note:** ESLint will either remove the unused items or prefix them with `_` to indicate they're intentionally unused.

---

## Step 5: Verify Everything Works

```bash
# Check error count (should be ~240, down from 332)
pnpm run check:types 2>&1 | grep "error TS" | wc -l

# Check Orbital files are clean (should output nothing)
pnpm run check:types 2>&1 | grep "ts/components/orbital"
pnpm run check:types 2>&1 | grep "ts/services/orbitalMedia"

# Run the app (should start without crashes)
pnpm start

# In another terminal, run Storybook (should build successfully)
pnpm run dev
# Open http://localhost:6006 and check OrbitalThreadList story

# Run Orbital tests (should pass)
pnpm test OrbitalMediaRelay_test
pnpm test OrbitalAttachmentCrypto_test
```

---

## Step 6: Commit Your Changes

```bash
git add -A

git commit -m "fix: Resolve 93 critical TypeScript errors for MVP

- Add missing call links stub exports (27 errors)
- Delete orphaned calling/stories files (4 errors)
- Fix Orbital component type issues (3 errors)
- Remove unused variables in Orbital code (22 errors)
- Remove unused variables in Signal code (33 errors)

Remaining ~240 errors are in disabled Signal features (deferred to post-MVP).

Resolves critical TypeScript compilation issues blocking development.

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## What About the Remaining Errors?

The remaining ~240 errors are all in Signal legacy code for disabled features:
- Call history management (disabled)
- Story distribution lists (disabled)
- Backup/export (non-MVP)
- Storage sync (non-MVP)

**These don't affect Orbital functionality and will be removed during post-MVP cleanup.**

You can safely ignore them for now. They won't prevent the app from running or block MVP development.

---

## Troubleshooting

### "npx tsx not found"
```bash
npm install -g tsx
# or
pnpm add -D tsx
```

### "ESLint not found"
```bash
pnpm install
```

### "Still seeing errors in Orbital files"
Make sure you:
1. ✅ Fixed the sticker property: `selectedSticker.stickerUrl`
2. ✅ Added MIME type cast: `as MIMEType`
3. ✅ Removed React import from stories file
4. ✅ Ran ESLint auto-fix on all Orbital files

### "App won't start after fixes"
```bash
# Rollback everything
git reset --hard HEAD

# Restore deleted files
cp /tmp/orbital-unused-files-backup/* ts/state/ducks/
cp /tmp/orbital-unused-files-backup/* ts/util/
cp /tmp/orbital-unused-files-backup/* ts/state/selectors/

# Report the issue with details
```

---

## Need More Details?

See comprehensive documentation:
- **Executive Summary:** `/Users/alexg/Documents/GitHub/Orbital-Desktop/TS-ERROR-EXECUTIVE-SUMMARY.md`
- **Detailed Plan:** `/Users/alexg/Documents/GitHub/Orbital-Desktop/TS-ERROR-CLEANUP-PLAN.md`
- **Agent Tasks:** `/Users/alexg/Documents/GitHub/Orbital-Desktop/AGENT-TASKS-TS-CLEANUP.md`
- **Raw Data:** `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts-error-report.json`

---

## Quick Command Reference

```bash
# Check total error count
pnpm run check:types 2>&1 | grep "error TS" | wc -l

# Check errors in Orbital code only
pnpm run check:types 2>&1 | grep "orbital"

# Check for blocking module errors
pnpm run check:types 2>&1 | grep -E "TS2305|TS2307"

# Run app
pnpm start

# Run Storybook
pnpm run dev

# Run specific test
pnpm test <test-name>
```
