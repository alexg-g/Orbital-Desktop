# TypeScript Error Cleanup - Agent Task Assignments

**Generated:** 2025-11-17
**Total Errors:** 332
**Critical Path Errors:** 52 (must fix for MVP)
**Deferrable Errors:** 280 (post-MVP)

---

## Critical Path: Fix These for MVP

### TASK 1: Backend-DB-Engineer - Fix Call Links Stubs (BLOCKING)
**Priority:** P0 - BLOCKING
**Estimated Time:** 30 minutes
**Errors Fixed:** 27

#### What to Do:
Run the automated stub generator script:

```bash
npx tsx /Users/alexg/Documents/GitHub/Orbital-Desktop/scripts/fix-call-links-stubs.ts
```

This will add missing stub exports to `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/sql/server/callLinks.node.ts`

#### Verification:
After running, these errors should be resolved:
- `ts/sql/Interface.std.ts:61` - InsertOrUpdateCallLinkFromSyncResult
- `ts/sql/Server.node.ts:188-210` - 20+ missing export errors

#### Test:
```bash
pnpm run check:types 2>&1 | grep -c "ts/sql/Server.node.ts.*TS2305"
# Should output: 0
```

---

### TASK 2: Codebase-Archaeologist - Delete Unused Files
**Priority:** P0 - BLOCKING
**Estimated Time:** 5 minutes
**Errors Fixed:** 4

#### What to Do:
Delete these orphaned files (verified to have zero imports):

```bash
cd /Users/alexg/Documents/GitHub/Orbital-Desktop

# Backup first
mkdir -p /tmp/orbital-unused-files-backup
cp ts/state/ducks/callingHelpers.std.ts /tmp/orbital-unused-files-backup/
cp ts/util/isGroupOrAdhocCall.std.ts /tmp/orbital-unused-files-backup/
cp ts/util/desktopCapturer.preload.ts /tmp/orbital-unused-files-backup/
cp ts/state/selectors/stories2.dom.ts /tmp/orbital-unused-files-backup/
cp ts/state/selectors/storyDistributionLists.dom.ts /tmp/orbital-unused-files-backup/

# Delete
rm ts/state/ducks/callingHelpers.std.ts
rm ts/util/isGroupOrAdhocCall.std.ts
rm ts/util/desktopCapturer.preload.ts
rm ts/state/selectors/stories2.dom.ts
rm ts/state/selectors/storyDistributionLists.dom.ts
```

#### Verification:
```bash
pnpm run check:types 2>&1 | grep "Cannot find module"
# Should output: nothing (all module errors resolved)
```

---

### TASK 3: Frontend-UX-Engineer - Fix Orbital Component Errors
**Priority:** P1 - HIGH
**Estimated Time:** 15 minutes
**Errors Fixed:** 3

#### Fix 1: OrbitalComposer.tsx - Sticker Property Access
**File:** `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/components/orbital/OrbitalComposer.tsx:329`

**Current (WRONG):**
```typescript
src={selectedSticker.sticker.url}
```

**Fixed:**
```typescript
src={selectedSticker.stickerUrl}
```

**Explanation:** The `FunStickerSelection` type has `stickerUrl`, not `sticker.url`. See type definition at `ts/components/fun/panels/FunPanelStickers.dom.tsx:184`.

---

#### Fix 2: OrbitalThreadingDemo.tsx - MIME Type Branding
**File:** `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/components/orbital/OrbitalThreadingDemo.tsx:310`

**Current (line ~310):**
```typescript
contentType: 'image/jpeg'
```

**Fixed:**
```typescript
contentType: 'image/jpeg' as MIMEType
```

**Add import at top:**
```typescript
import type { MIMEType } from '../types/MIME';
```

---

#### Fix 3: OrbitalThreadList.stories.tsx - Remove Unused Import
**File:** `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/components/orbital/OrbitalThreadList.stories.tsx:4`

**Current:**
```typescript
import React from 'react';
```

**Fixed:**
```typescript
// Remove the line entirely - React 17+ doesn't require this import
```

---

### TASK 4: Codebase-Archaeologist - Auto-Fix Unused Variables
**Priority:** P1 - HIGH
**Estimated Time:** 10 minutes
**Errors Fixed:** 22 in Orbital files, 33 in Signal files

#### What to Do:
Use ESLint's auto-fix for unused variables:

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

# Optional: Fix Signal files too
npx eslint --fix ts/components/conversation/Message.dom.tsx
npx eslint --fix ts/components/conversation/TimelineMessage.dom.stories.tsx
npx eslint --fix ts/components/NavTabs.dom.tsx
npx eslint --fix ts/components/ConversationList.dom.tsx
npx eslint --fix ts/axo/_internal/AxoBaseSegmentedControl.dom.tsx
npx eslint --fix ts/axo/AxoSelect.dom.tsx
```

#### Manual Review Required:
Some unused variables may be:
- Future functionality (keep with `_` prefix: `_threadId`)
- Required by interface contracts (add `// Used by parent` comment)

**Check these manually:**
- `ts/components/orbital/OrbitalComposer.tsx:48` - `onCancel` prop
  - If not needed by parent, remove from interface
  - If needed, prefix with `_onCancel`

---

### TASK 5: Backend-DB-Engineer - Stub Distribution Lists (OPTIONAL)
**Priority:** P2 - MEDIUM
**Estimated Time:** 15 minutes
**Errors Fixed:** 4

**Note:** Only do this if distribution lists errors are blocking the build.

#### What to Do:
Add stubs to `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/sql/main.ts`:

```typescript
// Stub for disabled story distribution lists feature
const distributionListStub = {
  createDistributionList: () => undefined,
  modifyDistributionList: () => undefined,
  removeMemberFromAllDistributionLists: () => undefined,
};

// Export or assign to window.SignalContext if needed
```

---

## Post-MVP: Defer These Errors

### Category: Storage Service (33 errors)
**Files:** `ts/services/storage.preload.ts`, `ts/services/storageRecordOps.preload.ts`
**Reason:** Storage sync with Signal servers - not needed for MVP
**Action:** Add `@ts-expect-error` comments for now

### Category: Backup/Export (15 errors)
**Files:** `ts/services/backups/export.preload.ts`, `ts/services/backups/import.preload.ts`
**Reason:** Backup feature is non-MVP
**Action:** Add `@ts-expect-error` comments

### Category: Component Type Mismatches (15 errors)
**Files:** Various Signal UI components
**Reason:** Mostly in disabled features (stories, donations, calls)
**Action:** Defer to post-MVP cleanup sprint

### Category: SQL Schema Errors (180+ errors)
**Files:** `ts/sql/Server.node.ts`, `ts/sql/migrations/*`
**Reason:** Call history and call links schema - disabled features
**Action:** Will be resolved when we do full Signal feature removal

---

## Testing Protocol

After completing Tasks 1-4, run this test sequence:

```bash
# 1. Type check
pnpm run check:types

# Expected: ~280 errors (down from 332)
# All blocking P0/P1 errors should be gone

# 2. Verify Orbital-specific files are clean
pnpm run check:types 2>&1 | grep "ts/components/orbital"
pnpm run check:types 2>&1 | grep "ts/services/orbitalMedia"

# Expected: No output (0 errors in Orbital code)

# 3. Run the app
pnpm start

# Expected: App starts without crashes

# 4. Test Storybook
pnpm run dev

# Expected: Storybook builds successfully
# Navigate to: http://localhost:6006
# Check: OrbitalThreadList story renders

# 5. Run Orbital tests
pnpm test OrbitalMediaRelay_test
pnpm test OrbitalAttachmentCrypto_test

# Expected: All tests pass
```

---

## Success Criteria

### Minimum for MVP:
- ✅ Zero TypeScript errors in `ts/components/orbital/**`
- ✅ Zero TypeScript errors in `ts/services/orbitalMedia*`
- ✅ Zero blocking module resolution errors (TS2305, TS2307)
- ✅ App runs without crashes
- ✅ Storybook builds successfully

### Post-MVP:
- All 332 errors resolved
- Full type safety across codebase
- Proper removal of disabled Signal features

---

## Quick Reference: Error Counts by Agent

| Agent | Task | Errors Fixed | Time | Priority |
|-------|------|--------------|------|----------|
| Backend-DB-Engineer | Call links stubs | 27 | 30 min | P0 |
| Codebase-Archaeologist | Delete unused files | 4 | 5 min | P0 |
| Frontend-UX-Engineer | Orbital components | 3 | 15 min | P1 |
| Codebase-Archaeologist | Unused variables | 55 | 10 min | P1 |
| Backend-DB-Engineer | Distribution lists | 4 | 15 min | P2 |
| **TOTAL FOR MVP** | **5 tasks** | **93** | **75 min** | - |

---

## Rollback Plan

If any fixes break the app:

```bash
# 1. Check git status
git status

# 2. Revert specific file
git checkout HEAD -- path/to/file.ts

# 3. Or revert all changes
git reset --hard HEAD

# 4. Restore deleted files from backup
cp /tmp/orbital-unused-files-backup/* ts/state/ducks/
cp /tmp/orbital-unused-files-backup/* ts/util/
cp /tmp/orbital-unused-files-backup/* ts/state/selectors/
```

---

## Files Modified by These Tasks

### Created:
- None (only modifications)

### Modified:
1. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/sql/server/callLinks.node.ts` (Task 1)
2. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/components/orbital/OrbitalComposer.tsx` (Tasks 3, 4)
3. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/components/orbital/OrbitalThreadingDemo.tsx` (Task 3)
4. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/components/orbital/OrbitalThreadList.stories.tsx` (Task 3)
5. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/components/orbital/OrbitalQuillEditor.tsx` (Task 4)
6. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/components/orbital/OrbitalMediaViewer.tsx` (Task 4)
7. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/components/orbital/OrbitalThreadDetail.tsx` (Task 4)
8. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/components/orbital/OrbitalMessage.tsx` (Task 4)
9. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/services/orbitalMediaDownload.preload.ts` (Task 4)
10. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/services/orbitalMediaUpload.preload.ts` (Task 4)

### Deleted:
1. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/state/ducks/callingHelpers.std.ts` (Task 2)
2. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/util/isGroupOrAdhocCall.std.ts` (Task 2)
3. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/util/desktopCapturer.preload.ts` (Task 2)
4. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/state/selectors/stories2.dom.ts` (Task 2)
5. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/state/selectors/storyDistributionLists.dom.ts` (Task 2)

---

## Next Steps After Completion

1. **Commit the fixes:**
   ```bash
   git add -A
   git commit -m "fix: Resolve 93 critical TypeScript errors for MVP

   - Add missing call links stub exports (27 errors)
   - Delete orphaned calling/stories files (4 errors)
   - Fix Orbital component type issues (3 errors)
   - Remove unused variables in Orbital code (22 errors)
   - Remove unused variables in Signal code (33 errors)

   Remaining 280 errors are in disabled Signal features (deferred to post-MVP).

   🤖 Generated with Claude Code

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

2. **Update GitHub issue:**
   - Close or update issue related to TypeScript errors
   - Document remaining 280 deferred errors

3. **Focus on MVP features:**
   - Threading implementation
   - Media relay
   - Orbital UI polish
