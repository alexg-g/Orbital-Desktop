# Implementation Roadmap: Electron Build & Distribution
## Issue #48 - Build and Package Electron App

---

## Phase 1: Beta Testing Build (Week 1-2)

### Objective
Create unsigned Electron app packages for beta testers.

### Dependencies
- ✅ Current code (ready)
- ⏳ Backend API endpoints (waiting on Backend Engineer)
- ⏳ Test machines (beta testers available)

### Tasks

#### 1.1 Create Unsigned Build Configuration (30 min)

**File:** Create `/Users/alexg/Documents/GitHub/Orbital-Desktop/scripts/build-beta-unsigned.sh`

```bash
#!/bin/bash
# Build unsigned app for beta testing
# Usage: ./scripts/build-beta-unsigned.sh

set -e

echo "Building Orbital Desktop for beta testing..."
echo "NOTE: This build is unsigned and runs on developer machines only"
echo

# Clear any cached signing preferences
export SIGN_MACOS_SCRIPT=""

# Build without code signing
SIGNAL_ENV=production pnpm run electron-builder \
  --config.directories.output=release \
  --skip-package

echo "✓ Build complete!"
echo "Output: release/mac/Orbital.app"
echo
echo "To test:"
echo "  ./release/mac/Orbital.app/Contents/MacOS/Orbital"
```

**Owner:** DevOps Engineer
**Status:** Ready
**Time:** 30 minutes

#### 1.2 Update Production Configuration (1 hour)

**File:** `/Users/alexg/Documents/GitHub/Orbital-Desktop/config/production.json`

```json
{
  "serverUrl": "https://api.orbitl.org",          // CHANGE: from chat.signal.org
  "storageUrl": "https://storage.orbitl.org",     // CHANGE: from storage.signal.org
  "directoryUrl": "https://dir.orbitl.org",       // CHANGE: from cdsi.signal.org
  "cdn": {
    "0": "https://cdn.orbitl.org",
    "2": "https://cdn2.orbitl.org",
    "3": "https://cdn3.orbitl.org"
  },
  "sfuUrl": "https://sfu.orbitl.org/",            // CHANGE: from sfu.voip.signal.org
  "updatesEnabled": true,
  "updatesUrl": "https://updates.orbitl.org/desktop"  // CHANGE: from updates.signal.org
}
```

**Dependencies:** Backend Engineer must provide actual Orbital server URLs
**Owner:** Backend Engineer (provide URLs) + DevOps (update config)
**Status:** Blocked (waiting for Backend)
**Time:** 30 minutes once URLs available

#### 1.3 Create Beta Distribution Documentation (1 hour)

**File:** Create `/Users/alexg/Documents/GitHub/Orbital-Desktop/docs/BETA_TESTING_GUIDE.md`

```markdown
# Orbital Desktop Beta Testing Guide

## Installing the Beta Build

### Requirements
- macOS 10.15 or later
- 500 MB free disk space
- Internet connection

### Installation Steps

1. Download `Orbital-mac-beta.zip` from [releases page](https://github.com/alexg-g/Orbital-Desktop/releases)

2. Extract the ZIP file:
   ```bash
   unzip Orbital-mac-beta.zip
   ```

3. Move app to Applications folder:
   ```bash
   mv Orbital.app /Applications/
   ```

4. First launch (may require security approval):
   ```bash
   /Applications/Orbital.app/Contents/MacOS/Orbital
   ```

5. You may see security warning:
   > "Orbital is not signed by a recognized developer"

   This is normal for unsigned beta builds. Click "Open" to proceed.

## Testing Checklist

- [ ] App launches without crashes
- [ ] Sign up / login works
- [ ] Can create groups
- [ ] Can send messages
- [ ] Can receive messages
- [ ] Group threading works
- [ ] Can upload media
- [ ] Can make calls (if enabled)

## Reporting Issues

Found a bug? [Create an issue](https://github.com/alexg-g/Orbital-Desktop/issues/new)

Include:
- macOS version
- Steps to reproduce
- Error messages or screenshots
```

**Owner:** Frontend Engineer (with Product Manager input)
**Status:** Ready
**Time:** 1 hour

#### 1.4 Build and Test (1-2 hours)

**Steps:**
```bash
# 1. Build unsigned app
./scripts/build-beta-unsigned.sh

# 2. Test on development machine
./release/mac/Orbital.app/Contents/MacOS/Orbital

# 3. Create distribution ZIP
cd release/mac
zip -r ../Orbital-mac-beta-7.80.0-alpha.1.zip Orbital.app

# 4. Verify ZIP
unzip -t ../Orbital-mac-beta-7.80.0-alpha.1.zip

# 5. Test on clean machine (ask colleague to test)
# Copy ZIP to their Mac and verify it runs
```

**Owner:** DevOps Engineer + QA Tester
**Status:** Ready
**Time:** 1-2 hours (includes cleanup testing)

#### 1.5 Create GitHub Release (30 min)

**Steps:**
1. Go to [GitHub Releases](https://github.com/alexg-g/Orbital-Desktop/releases)
2. Click "Draft a new release"
3. Set tag: `v7.80.0-alpha.1`
4. Title: `Orbital Desktop Beta v7.80.0-alpha.1`
5. Upload: `Orbital-mac-beta-7.80.0-alpha.1.zip`
6. Add description from `BUILD_FINDINGS_SUMMARY.md`
7. Mark as "Pre-release"
8. Publish

**Owner:** Project Manager
**Status:** Ready
**Time:** 30 minutes

---

## Phase 2: Production Build (Week 4-6)

### Objective
Create signed, distributable Electron apps with auto-update support.

### Prerequisites
- ✅ Beta testing complete and feedback incorporated
- ⏳ Apple Developer account (need to confirm if exists)
- ⏳ Code signing certificate obtained
- ✅ Orbital backend infrastructure ready

### Decision Point: Code Signing Certificate

**Question for Project Manager:**
- Does Orbital have an Apple Developer account?
- If yes: Get certificate details
- If no: Approve $99/year account cost?

**Impact:** Blocks all signed distribution

### Tasks

#### 2.1 Setup Code Signing (2-4 hours)

**Prerequisites:**
1. Apple Developer account active
2. Code signing certificate generated in Apple Developer portal
3. Certificate downloaded and added to Keychain

**Configuration:**

**Option A: System Certificate (Recommended)**
```bash
# 1. Add certificate to Keychain
# Download from apple.developer.com → Certificates, Identifiers & Profiles
# Double-click .cer file to add to Keychain

# 2. Verify certificate is available
security find-identity -v -p codesigning | grep "Developer ID Application"

# 3. Create signing script: ts/scripts/sign-macos.sh (NEW)
```

**File:** Create `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/scripts/sign-macos.sh`

```bash
#!/bin/bash
# Sign macOS app with Developer ID certificate

set -e

APP_PATH="$1"
CERTIFICATE_NAME="Developer ID Application: Orbital Inc"  # CHANGE: to your org name

if [ -z "$APP_PATH" ]; then
  echo "Usage: $0 <path_to_app>"
  exit 1
fi

echo "Signing $APP_PATH with certificate: $CERTIFICATE_NAME"

# Sign the app
codesign \
  --deep \
  --force \
  --verify \
  --verbose \
  --sign "$CERTIFICATE_NAME" \
  --options runtime \
  "$APP_PATH"

echo "✓ Code signing successful"
```

**Option B: Provide External Sign Script**
```bash
# If certificate is in external tool (CI/CD), create wrapper
# File: ts/scripts/sign-macos.sh

#!/bin/bash
# Call external signing service
curl -X POST https://sign-service.orbital.org/sign \
  -F "app=@$1" \
  -o "$1.signed"
```

**Owner:** DevOps Engineer
**Status:** Blocked (waiting for certificate)
**Time:** 1-2 hours

#### 2.2 Update electron-builder Configuration (1 hour)

**File:** Update `/Users/alexg/Documents/GitHub/Orbital-Desktop/package.json`

Change lines 455-459:
```json
"publish": [
  {
    "provider": "generic",
    "url": "https://updates.orbitl.org/desktop"  // CHANGE: from updates.signal.org
  }
],
```

Also verify lines 467-468:
```json
"sign": "./ts/scripts/sign-macos.sh",  // ENSURE: Points to signing script
```

**Owner:** DevOps Engineer
**Status:** Ready (once signing script created)
**Time:** 30 minutes

#### 2.3 Build Signed App (1 hour test)

**Commands:**
```bash
# 1. Build with signing enabled
SIGN_MACOS_SCRIPT="./ts/scripts/sign-macos.sh" \
pnpm run build

# 2. Verify signature
codesign -vv release/mac/Orbital.app

# 3. Verify DMG creation
ls -lh release/*.dmg

# 4. Mount and test DMG
hdiutil mount release/Orbital-mac-universal-7.80.0.dmg
# Verify: /Volumes/Orbital/Orbital.app works
hdiutil unmount /Volumes/Orbital
```

**Owner:** DevOps Engineer
**Status:** Ready (after signing configured)
**Time:** 1 hour

#### 2.4 Notarization Configuration (2 hours)

**Apple Requirement:** All macOS apps distributed must be notarized

**Setup:**
```bash
# 1. Create app-specific password in Apple account
# Account Settings → Security → Generate app-specific password
# Save password: ORBITAL_NOTARIZE_PASSWORD

# 2. Add to electron-builder config (package.json, lines 461-465)
"afterSign": "ts/scripts/notarize.node.js",

# 3. Create notarization script: ts/scripts/notarize.node.js (NEW)
```

**File:** Create `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/scripts/notarize.node.js`

```javascript
// Notarize app with Apple
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productName;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Notarizing ${appPath}`);

  return notarize({
    tool: 'notarytool',
    appPath: appPath,
    appleId: process.env.NOTARIZE_APPLE_ID,
    appleIdPassword: process.env.NOTARIZE_PASSWORD,
    teamId: process.env.NOTARIZE_TEAM_ID,
  });
};
```

**Environment Variables:**
```bash
export NOTARIZE_APPLE_ID="orbital@orbitl.org"        # Apple account email
export NOTARIZE_PASSWORD="xxxx-xxxx-xxxx-xxxx"      # App-specific password
export NOTARIZE_TEAM_ID="XXXXXXXXX"                  # Team ID from Apple
```

**Owner:** DevOps Engineer
**Status:** Can implement after apple account confirmed
**Time:** 2 hours

#### 2.5 Update Server Infrastructure (3-5 days)

**Requirement:** Auto-update functionality needs update server

**Options:**

**Option A: GitHub Releases (Simple)**
```json
// In package.json, line 456
"provider": "github",
"owner": "alexg-g",
"repo": "Orbital-Desktop"
```

Pros: Free, automatic, no infrastructure needed
Cons: Limited control, public releases

**Option B: Custom Update Server** (Recommended for production)
```json
"provider": "generic",
"url": "https://updates.orbitl.org/desktop"
```

Requires: Custom update server implementation
Owner: Backend Engineer
Timeline: 2-3 days

**Owner:** Backend Engineer (server) + DevOps Engineer (config)
**Status:** Waiting
**Time:** 3-5 days server implementation

#### 2.6 Testing Signed Build (2 hours)

**Validation Checklist:**
```bash
# ✅ Code signature verification
codesign -vv release/mac/Orbital.app

# ✅ Notarization status
xcrun notarytool log <SUBMISSION_ID> --apple-id $NOTARIZE_APPLE_ID

# ✅ DMG integrity
hdiutil verify release/Orbital-mac-universal-7.80.0.dmg

# ✅ Installation test (on clean machine)
# Mount DMG, drag Orbital.app to Applications
# Launch and verify it starts

# ✅ Auto-update test
# Check for updates in app settings
# Verify update server responds correctly
```

**Owner:** QA Tester + DevOps Engineer
**Status:** Ready (after signing complete)
**Time:** 2 hours

---

## Phase 3: Multi-Platform Support (Week 8-12)

### Objective
Build distributable packages for Windows and Linux.

### Tasks

#### 3.1 Windows Code Signing (1 week)

**Requirement:** Windows code signing certificate ($$ annually)

**Steps:**
1. Obtain EV code signing certificate
2. Update `package.json` build.win.signtoolOptions
3. Test building .exe and .msi
4. Verify signatures with `signtool verify`

#### 3.2 Linux DEB Package (2-3 days)

**Current config already supports it:**
```json
"linux": {
  "target": ["deb"],
  "executableName": "orbital-desktop"
}
```

**Steps:**
1. Test build on Linux: `pnpm run build-linux`
2. Verify deb package installs
3. Create desktop shortcuts
4. Test auto-update for Linux

---

## Timeline Summary

| Phase | Duration | Blockers | Status |
|-------|----------|----------|--------|
| **Phase 1: Beta** | 1-2 weeks | Backend config | ⏳ READY |
| **Phase 2: Production** | 3-4 weeks | Apple cert | ⏳ WAITING |
| **Phase 3: Multi-platform** | 2-3 weeks | Windows cert | ⏳ FUTURE |

---

## Critical Path

```
Today
  ↓
Phase 1: Unsigned Beta
  ├─ Build unsigned app (30 min) ✓
  ├─ Test app (1 hour) ✓
  ├─ Create GitHub release (30 min) ✓
  └─ Beta testing (1-2 weeks)
  ↓
Beta Feedback Incorporated
  ↓
Phase 2: Signed Production Build
  ├─ [DECISION] Apple Developer Account? (REQUIRED)
  ├─ Code signing certificate (1-2 days) [WAITING]
  ├─ Signing script (2 hours) [AFTER CERT]
  ├─ Notarization (2 hours) [AFTER CERT]
  ├─ Update server (3-5 days) [BACKEND]
  └─ Final testing (2 hours) [AFTER ALL]
  ↓
Production Ready
  ↓
Phase 3: Windows/Linux (Optional)
```

---

## Build Commands Reference

### Beta Testing
```bash
./scripts/build-beta-unsigned.sh
# Output: release/mac/Orbital.app (unsigned)
```

### Production with Signing
```bash
# Set up environment
export SIGN_MACOS_SCRIPT="./ts/scripts/sign-macos.sh"
export NOTARIZE_APPLE_ID="orbital@orbitl.org"
export NOTARIZE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export NOTARIZE_TEAM_ID="XXXXXXXXX"

# Build
pnpm run build

# Output:
#   - Orbital-mac-x64-7.80.0.zip (signed)
#   - Orbital-mac-arm64-7.80.0.zip (signed)
#   - Orbital-mac-universal-7.80.0.dmg (signed, notarized)
```

### Linux Build
```bash
pnpm run build-linux
# Output: release/Orbital-7.80.0-alpha.1.deb
```

---

## Risk Mitigation

### Risk: Code Signing Certificate Expires
**Mitigation:** Set calendar reminders for certificate renewal (30 days before expiry)

### Risk: App Notarization Takes > 24 hours
**Mitigation:** Submit early, have fallback unsigned build ready

### Risk: Update Server Goes Down
**Mitigation:** Use GitHub Releases as backup distribution method

### Risk: Build Fails on CI/CD
**Mitigation:** Test builds locally first, commit before pushing to CI

---

## Success Criteria

### Phase 1 Complete
- [ ] Unsigned app builds successfully
- [ ] Beta testers can launch app on their machines
- [ ] GitHub release created and accessible
- [ ] At least 5 beta testers have tested and provided feedback

### Phase 2 Complete
- [ ] Code signing certificate obtained
- [ ] Signed app builds successfully
- [ ] DMG installer works
- [ ] Notarization passes Apple verification
- [ ] Auto-update mechanism tested

### Phase 3 Complete (Optional)
- [ ] Windows installer builds and signs
- [ ] Linux deb package builds and installs
- [ ] All platforms have auto-update

---

## Owner Assignments

| Task | Owner | Status |
|------|-------|--------|
| Phase 1: Beta | DevOps Eng | Ready |
| Phase 2: Production | DevOps Eng | Blocked (cert) |
| Notarization | DevOps Eng | Ready (after cert) |
| Backend Server Config | Backend Eng | Blocked |
| Update Server | Backend Eng | Waiting |
| Windows Signing | DevOps Eng | Future (needs cert) |
| Testing | QA Spec | Ready |
| Release Management | PM | Ready |

---

**Document:** Implementation Roadmap for Issue #48
**Date:** November 27, 2025
**Version:** 1.0
**Repository:** [alexg-g/Orbital-Desktop](https://github.com/alexg-g/Orbital-Desktop)
