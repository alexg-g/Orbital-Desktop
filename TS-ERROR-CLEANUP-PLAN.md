# TypeScript Error Analysis & Cleanup Plan

**Generated:** 2025-11-17
**Total Errors:** 332
**Orbital-Specific:** 26
**Signal Legacy:** 306
**Auto-fixable:** 55

---

## Executive Summary

The codebase has 332 TypeScript compilation errors, primarily in Signal legacy code (92%). Only 26 errors (8%) are in Orbital-specific code. The good news:

- **55 errors (17%)** are auto-fixable unused variables/imports
- **31 blocking errors** are due to missing Call Links module exports (Signal feature we're removing)
- **Most Orbital errors are trivial** - unused variables and one type branding issue

**Recommendation:** Fix Orbital errors immediately (< 2 hours), defer Signal legacy errors to post-MVP except for critical blocking issues.

---

## Priority 0: BLOCKING ERRORS (31 errors)

### Issue: Missing Call Links Module Exports
**Files:** `ts/sql/Interface.std.ts`, `ts/sql/Server.node.ts`
**Root Cause:** Signal's call links feature has been partially removed/disabled
**Impact:** High - prevents type checking but may not prevent runtime

**Fix Strategy:**
1. **Option A (Quick):** Stub out the missing exports with no-op functions
2. **Option B (Clean):** Remove all call links references from SQL layer
3. **Option C (Defer):** Add `@ts-expect-error` comments to defer post-MVP

**Recommendation:** Option A for MVP, Option B post-launch
**Agent:** Backend-DB-Engineer
**Time:** 2-3 hours

**Files to fix:**
- `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/sql/server/callLinks.node.ts` - Add stub exports
- `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/sql/Interface.std.ts` - Remove invalid imports or add stubs
- `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/sql/Server.node.ts` - Update imports

### Issue: Missing Calling Module
**Files:**
- `ts/state/ducks/callingHelpers.std.ts`
- `ts/util/desktopCapturer.preload.ts`
- `ts/util/isGroupOrAdhocCall.std.ts`

**Root Cause:** Signal calling infrastructure partially removed
**Impact:** Medium - these are utility files, not core threading

**Fix Strategy:**
1. Check if these files are actually imported anywhere
2. If unused, delete them
3. If used, create stub modules

**Recommendation:** Delete if unused (likely)
**Agent:** Codebase-Archaeologist (automated check)
**Time:** 30 minutes

### Issue: Missing Story Distribution Lists Exports
**Files:** `ts/test-electron/state/ducks/conversations_test.preload.ts`
**Impact:** Low - test file only

**Fix Strategy:** Comment out the failing test or stub the imports
**Recommendation:** Defer to post-MVP (it's a test)
**Time:** 5 minutes

---

## Priority 1: ORBITAL-SPECIFIC ERRORS (26 errors)

### Category: Unused Variables (22 errors) - AUTO-FIXABLE
**Impact:** None (linting only)
**Agent:** Codebase-Archaeologist
**Time:** 5 minutes (automated)

**Files:**
```
ts/components/orbital/OrbitalQuillEditor.tsx (6 errors)
ts/services/orbitalMediaDownload.preload.ts (6 errors)
ts/services/orbitalMediaUpload.preload.ts (4 errors)
ts/components/orbital/OrbitalMediaViewer.tsx (3 errors)
ts/components/orbital/OrbitalThreadDetail.tsx (2 errors)
ts/components/orbital/OrbitalComposer.tsx (1 error)
ts/components/orbital/OrbitalMessage.tsx (1 error)
ts/components/orbital/OrbitalThreadList.stories.tsx (1 error)
```

**Fix:** Run automated cleanup script (see below)

### Category: Type Branding Issue (1 error) - MANUAL FIX REQUIRED

**File:** `ts/components/orbital/OrbitalThreadingDemo.tsx:310`
**Error:** `Type 'string' is not assignable to type 'string & BRAND<"mimeType">'`

**Fix:**
```typescript
// Current (line 310):
contentType: 'image/jpeg'

// Fixed:
contentType: 'image/jpeg' as MIMEType
```

**Agent:** Frontend-UX-Engineer
**Time:** 2 minutes
**Risk:** Low

### Category: Property Typo (1 error) - MANUAL FIX REQUIRED

**File:** `ts/components/orbital/OrbitalComposer.tsx:329`
**Error:** `Property 'sticker' does not exist. Did you mean 'stickerId'?`

**Current code investigation needed** - likely a typo
**Agent:** Frontend-UX-Engineer
**Time:** 5 minutes
**Risk:** Low

### Category: Storybook Import (1 error) - MANUAL FIX REQUIRED

**File:** `ts/components/orbital/OrbitalThreadList.stories.tsx:4`
**Error:** `'React' is declared but its value is never read`

**Fix:** Remove `import React from 'react'` (not needed in modern React)
**Agent:** Frontend-UX-Engineer
**Time:** 1 minute
**Risk:** None

### Category: Unused Props (1 error) - DESIGN DECISION

**File:** `ts/components/orbital/OrbitalComposer.tsx:48`
**Error:** `'onCancel' is declared but its value is never read`

**Investigation needed:** Is this prop actually needed?
**Agent:** Frontend-UX-Engineer
**Time:** 5 minutes
**Risk:** Low

---

## Priority 2: SIGNAL LEGACY ERRORS - STORAGE/BACKUP (83 errors)

### Category: Storage Service Call Links (33 errors)
**Files:** `ts/services/storage.preload.ts`, `ts/services/storageRecordOps.preload.ts`
**Impact:** Medium - storage sync with Signal servers (we may not need this)

**Fix Strategy:**
1. Determine if we need storage sync at all for MVP
2. If no: Add `@ts-expect-error` comments
3. If yes: Stub out call links in storage sync

**Recommendation:** Option 2 (defer post-MVP)
**Agent:** Backend-DB-Engineer (decision), then Codebase-Archaeologist (implementation)
**Time:** 1 hour (if deferring with comments)

### Category: Backup/Export Call Links (15 errors)
**Files:** `ts/services/backups/export.preload.ts`, `ts/services/backups/import.preload.ts`
**Impact:** Low - backup feature (non-MVP)

**Fix Strategy:** Add `@ts-expect-error` comments, defer to post-MVP
**Recommendation:** Defer
**Agent:** Codebase-Archaeologist
**Time:** 30 minutes

### Category: Link Preview (6 errors)
**Files:** `ts/services/LinkPreview.preload.ts`
**Impact:** Low - call link previews (disabled feature)

**Fix Strategy:** Add `@ts-expect-error` or stub
**Recommendation:** Defer
**Agent:** Codebase-Archaeologist
**Time:** 15 minutes

---

## Priority 3: SIGNAL LEGACY ERRORS - COMPONENTS (32 errors)

### Category: Unused Variables (17 errors)
**Auto-fixable** - see automated cleanup script

**Files:**
```
ts/components/conversation/Message.dom.tsx (4 errors)
ts/components/conversation/TimelineMessage.dom.stories.tsx (3 errors)
ts/components/NavTabs.dom.tsx (2 errors)
ts/axo/_internal/AxoBaseSegmentedControl.dom.tsx (1 error)
ts/axo/AxoSelect.dom.tsx (1 error)
ts/components/ConversationList.dom.tsx (1 error)
```

### Category: Type Mismatches (15 errors)
**Files:** Various Signal UI components
**Impact:** Low - mostly in disabled features (stories, donations, calls)

**Fix Strategy:** Defer to post-MVP unless blocking runtime
**Agent:** Defer
**Time:** N/A

---

## Priority 4: SIGNAL LEGACY ERRORS - OTHER (189 errors)

### Mostly in:
- Call history management (disabled)
- Story distribution (disabled)
- Donation badges (disabled)
- SQL schema for removed features

**Fix Strategy:** Defer all to post-MVP
**Recommendation:** These don't block Orbital functionality
**Time:** N/A for MVP

---

## Agent Task Assignments

### Task 1: Frontend-UX-Engineer (HIGH PRIORITY)
**Estimated Time:** 30 minutes
**Deadline:** Today

**Files to Fix:**
1. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/components/orbital/OrbitalThreadingDemo.tsx:310`
   - Change: `contentType: 'image/jpeg' as MIMEType`

2. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/components/orbital/OrbitalComposer.tsx:329`
   - Investigate and fix `sticker` vs `stickerId` property access
   - Check the actual property name in the object

3. `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/components/orbital/OrbitalComposer.tsx:48`
   - Review if `onCancel` prop is needed or should be removed from interface

### Task 2: Backend-DB-Engineer (BLOCKING)
**Estimated Time:** 2-3 hours
**Deadline:** Today

**Decision Required:** Do we need Call Links functionality at all?
- If NO: Proceed with stub implementation below
- If YES: Need to properly implement the missing exports

**Implementation (Stub Approach):**

Create stub exports in `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/sql/server/callLinks.node.ts`:

```typescript
// Add these stub exports for disabled call links feature
export const InsertOrUpdateCallLinkFromSyncResult = {} as any;
export const beginDeleteAllCallLinks = () => {};
export const beginDeleteCallLink = () => {};
export const callLinkExists = () => false;
export const defunctCallLinkExists = () => false;
export const deleteCallHistoryByRoomId = () => {};
export const deleteCallLinkAndHistory = () => {};
export const deleteCallLinkFromSync = () => {};
export const finalizeDeleteCallLink = () => {};
export const getAllCallLinkRecordsWithAdminKey = () => [];
export const getAllDefunctCallLinksWithAdminKey = () => [];
export const getAllMarkedDeletedCallLinkRoomIds = () => [];
export const getCallLinkRecordByRoomId = () => undefined;
export const insertDefunctCallLink = () => {};
export const insertOrUpdateCallLinkFromSync = () => {};
export const updateCallLinkState = () => {};
export const updateCallLinkStateAndEpoch = () => {};
export const updateDefunctCallLink = () => {};
```

### Task 3: Codebase-Archaeologist (AUTO-FIX)
**Estimated Time:** 15 minutes
**Deadline:** Today

**Run Automated Cleanup:**
See `/Users/alexg/Documents/GitHub/Orbital-Desktop/scripts/fix-unused-vars.sh` (created below)

**Manual Stubs for Low Priority:**
Add `@ts-expect-error` comments to defer these errors:
- Storage service call links errors
- Backup/export errors
- Link preview errors

---

## Quick Wins (Can be done immediately)

### 1. Auto-fix Unused Variables (5 minutes)
Run: `pnpm run fix:unused-vars` (script created below)

### 2. Delete Unused Helper Files (5 minutes)
Check if these are imported anywhere:
- `ts/state/ducks/callingHelpers.std.ts`
- `ts/util/isGroupOrAdhocCall.std.ts`

If not imported, delete them.

### 3. Fix Orbital Type Branding (2 minutes)
Add `as MIMEType` cast in OrbitalThreadingDemo.tsx

---

## Deferred to Post-MVP

All Signal legacy errors except:
- Call links stubs (needed to pass type checking)
- Critical imports that break compilation

**Total errors to defer:** ~280
**Errors to fix for MVP:** ~50
**Auto-fixable immediately:** 55

---

## Testing After Fixes

After applying fixes, run:

```bash
# Type checking
pnpm run check:types

# Ensure app still runs
pnpm start

# Run Orbital-specific tests
pnpm test OrbitalMediaRelay_test
pnpm test OrbitalAttachmentCrypto_test
```

---

## Automated Fix Scripts

See:
- `/Users/alexg/Documents/GitHub/Orbital-Desktop/scripts/fix-unused-vars.sh`
- `/Users/alexg/Documents/GitHub/Orbital-Desktop/scripts/check-unused-files.sh`

---

## Risk Assessment

**Low Risk (Safe to fix now):**
- Unused variable removal (automated)
- Type casts in Orbital code
- Stub exports for disabled features

**Medium Risk (Review needed):**
- Call links stubs (ensure no runtime impact)
- Storage service changes (test sync)

**High Risk (Defer to post-MVP):**
- SQL schema changes
- Backup format changes
- Core Signal infrastructure modifications

---

## Success Metrics

**MVP Ready When:**
- ✅ All 26 Orbital-specific errors fixed
- ✅ All blocking module resolution errors resolved
- ✅ App runs without TypeScript compilation failures
- ⚠️ Signal legacy errors deferred with `@ts-expect-error` where needed

**Post-MVP Cleanup:**
- Remove all deferred errors
- Proper cleanup of disabled features
- Full type safety across codebase
