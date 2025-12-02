# Electron Build Configuration Analysis - Issue #48
## Build and Package Electron App for Distribution

**Status:** Phase 1 Complete - Exploration and Analysis

**Date:** November 27, 2025

---

## Executive Summary

The Orbital-Desktop codebase inherits a mature Electron build configuration from Signal-Desktop. The production build process is **functional and reaches the Mac app build stage** but **fails at code signing** due to missing Orbital-specific configuration. The build infrastructure is well-structured and requires only targeted adjustments for Orbital, not a complete rebuild.

**Key Finding:** The build successfully creates `release/mac/Orbital.app` but fails during the macOS code signing step because no signing certificate is configured.

---

## Current Build Configuration Status

### Package.json Build Configuration

**File:** `/Users/alexg/Documents/GitHub/Orbital-Desktop/package.json` (lines 444-716)

#### General Build Settings
```json
{
  "appId": "org.orbitl.orbital-desktop",
  "productName": "Orbital",
  "name": "orbital-desktop",
  "nativeRebuilder": "parallel"
}
```

**Status:** ✅ ORBITAL-SPECIFIC
- AppID correctly set to `org.orbitl.orbital-desktop` (not Signal's org.whispersystems)
- Product name is "Orbital"
- Already configured for Orbital branding

#### macOS Configuration (lines 447-487)

**Target Format:**
- ZIP archives: x64 and arm64 architectures
- DMG installer: universal binary (requires code signing)

**Code Signing (BLOCKER):**
```json
"sign": "./ts/scripts/sign-macos.node.js"
```

**Issue Discovered:**
The signing script requires environment variable `SIGN_MACOS_SCRIPT` which is not set. Error during build:
```
ERROR: path to macos sign script must be provided in environment variable SIGN_MACOS_SCRIPT
```

**Update URL (NEEDS CHANGE):**
```json
"publish": [{
  "provider": "generic",
  "url": "https://updates.signal.org/desktop"  // Still points to Signal!
}]
```

**Entitlements Configuration:**
- Mac entitlements: `./build/entitlements.mac.plist` ✅ EXISTS
- Mac entitlements inherit: `./build/entitlements.mac.inherit.plist` ✅ EXISTS
- Icons: `build/icons/mac/icon.icns` ✅ EXISTS

#### Build Assets Present

✅ All required icon assets exist:
- `/Users/alexg/Documents/GitHub/Orbital-Desktop/build/icons/mac/icon.icns` - macOS app icon
- `/Users/alexg/Documents/GitHub/Orbital-Desktop/build/icons/png/` - PNG icons (1024x1024, 512x512, etc.)
- `/Users/alexg/Documents/GitHub/Orbital-Desktop/build/icons/win/icon.ico` - Windows icon

---

## Build Pipeline Analysis

### Build Commands

**Primary Build Command:**
```bash
pnpm run build
```

**Command Chain:**
1. `generate` - Transpile TypeScript, compile styles, generate locales
2. `build:esbuild:prod` - Production minification
3. `build:release` - Package with electron-builder

### Build Process Flow

```
pnpm run build
  ↓
generate (Phase 0)
  ↓ build:esbuild:scripts (no-bundle)
  ↓
generate (Phase 1)
  ├─ build:esbuild:bundle (scripts)
  ├─ build:icu-types
  ├─ build:compact-locales
  ├─ build:styles (SASS + Tailwind)
  └─ copy-components, get-expire-time
  ↓
build:esbuild:prod (with minification)
  ↓
build:release
  ├─ SIGNAL_ENV=production
  ├─ electron-builder
  ├─ Create app: release/mac/Orbital.app
  ├─ Prepare for packaging (ZIP, DMG)
  ├─ [FAILS] Code signing (missing SIGN_MACOS_SCRIPT)
  └─ [BLOCKED] DMG packaging
```

### Build Test Results

**Test Command Run:** `pnpm run build` (November 27, 2025)

**Results:**
- ✅ Generate phase: ALL SUCCESS (TypeScript → JS, styles, locales)
- ✅ ESBuild prod: SUCCESS (minification)
- ✅ Native module rebuild: SUCCESS (all 6 native modules)
- ✅ Mac app structure created: `/Users/alexg/Documents/GitHub/Orbital-Desktop/release/mac/Orbital.app`
- ❌ Code signing: FAILED
  - Error: `path to macos sign script must be provided in environment variable SIGN_MACOS_SCRIPT`
  - Location: `ts/scripts/sign-macos.node.js:41`
- ❌ DMG packaging: BLOCKED (depends on signing)

**Build Output:** `/Users/alexg/Documents/GitHub/Orbital-Desktop/release/`
- `release/mac/Orbital.app` - Functional unsigned macOS app
- `release/builder-debug.yml` - electron-builder configuration debug log

**Time to unsigned app:** ~2-3 minutes (from source on M1/M2 Mac)

---

## Configuration Files Found

### Build Assets
- `build/entitlements.mac.plist` - macOS security entitlements
- `build/entitlements.mac.inherit.plist` - entitlements inheritance
- `build/icons/mac/icon.icns` - macOS app icon (Orbital branded)
- `build/icons/png/` - 9 PNG icon variants (16x16 to 1024x1024)
- `build/icons/win/icon.ico` - Windows icon

### Configuration Files
- `config/production.json` - Production environment config
  - **ISSUE:** Still points to Signal servers (chat.signal.org, etc.)
  - **Needs:** Orbital API endpoints (api.orbitl.org, etc.)
- `config/default.json` - Base configuration (Signal defaults)

### Build Scripts
- `scripts/esbuild.js` - Main bundler configuration
- `scripts/prepare_beta_build.js` - Beta channel preparation
- `ts/scripts/sign-macos.node.js` - macOS code signing script (compiled)
- `ts/scripts/sign-windows.node.js` - Windows code signing script

---

## Orbital-Specific Issues Identified

### 1. Code Signing (CRITICAL BLOCKER)

**Status:** ❌ NOT CONFIGURED

**Requirements:**
- macOS requires code signing for:
  - Running on other computers (sandboxing restrictions)
  - Creating DMG installer
  - Auto-update distribution
  - App Store submission (if desired)

**Current State:**
- Signing script exists: `ts/scripts/sign-macos.node.js`
- Script expects environment variable: `SIGN_MACOS_SCRIPT`
- No sign script provided, build fails

**Solution Options:**
1. **For beta testing:** Skip signing with `--skip-package` flag
   ```bash
   electron-builder --skip-package --config.directories.output=release
   ```

2. **For distribution (recommended):**
   - Obtain Apple Developer Certificate ($99/year)
   - Export signing credentials
   - Provide sign script in `SIGN_MACOS_SCRIPT` env var
   - Or configure certificate directly in electron-builder

3. **For ad-hoc distribution (temporary):**
   - Use self-signing (`security` command)
   - Limited to single machine
   - Not recommended for public distribution

### 2. Server Configuration (MUST CHANGE)

**Status:** ❌ STILL POINTS TO SIGNAL

**File:** `config/production.json`

**Signal endpoints currently configured:**
```json
{
  "serverUrl": "https://chat.signal.org",
  "storageUrl": "https://storage.signal.org",
  "directoryUrl": "https://cdsi.signal.org",
  "cdn": {
    "0": "https://cdn.signal.org",
    "2": "https://cdn2.signal.org",
    "3": "https://cdn3.signal.org"
  },
  "sfuUrl": "https://sfu.voip.signal.org/",
  ...
}
```

**Required Changes for Orbital:**
- `serverUrl` → `https://api.orbitl.org` (or configured Orbital backend)
- `storageUrl` → Media relay server
- `directoryUrl` → User directory service
- CDN URLs → Orbital CDN
- `sfuUrl` → Orbital voice/video server
- `publish[0].url` → Update server (currently `https://updates.signal.org/desktop`)

**Note:** This is separate from the build process but essential for runtime functionality.

### 3. Auto-Update Configuration

**Status:** ⚠️ SIGNAL-SPECIFIC

**Current config:**
```json
"publish": [{
  "provider": "generic",
  "url": "https://updates.signal.org/desktop"
}]
```

**For Orbital:**
- Need Orbital update server infrastructure (DevOps responsibility)
- Or use GitHub releases for beta distribution
- Configuration: Change URL to Orbital infrastructure

### 4. Windows Code Signing

**Status:** ❌ NOT CONFIGURED

**Current config:**
```json
"win": {
  "signtoolOptions": {
    "certificateSubjectName": "Signal Messenger, LLC",
    "certificateSha1": "8D5E3CD800736C5E1FE459A1F5AA48287D4F6EC6"
  }
}
```

**Required for distribution:**
- Obtain Windows code signing certificate ($$ annually)
- Configure certificateSubjectName and certificateSha1

**For beta testing:** Can build unsigned and users will see security warnings.

---

## Asset Status Review

### Branding/Icons

✅ **Orbital icons exist and are properly configured**
- `build/icons/mac/icon.icns` - macOS app icon
- `build/icons/png/1024x1024.png` through `build/icons/png/16x16.png`
- App name in package.json: "Orbital"

### Entitlements

✅ **Entitlements files present**
- `build/entitlements.mac.plist` - Main entitlements
- `build/entitlements.mac.inherit.plist` - Inherited entitlements

**Entitlements included:**
- Network access (for Signal Protocol communication)
- Microphone/Camera (for calls)
- Display recording (for screen sharing)
- Keychain access
- Automatic code signing enabled

---

## What Works vs. What Fails

### ✅ WORKING

| Component | Status | Notes |
|-----------|--------|-------|
| TypeScript compilation | ✅ | esbuild --prod minifies correctly |
| Style compilation | ✅ | SASS + Tailwind CSS working |
| Locale generation | ✅ | All 50+ languages compiled |
| Asset bundling | ✅ | Icons, fonts, images packaged |
| Native module rebuild | ✅ | All 6 native modules for target platform |
| App bundle creation | ✅ | `Orbital.app` created successfully |
| Universal binary prep | ✅ | Both x64 and arm64 detected |
| App folder structure | ✅ | Electron framework installed |

### ❌ FAILING

| Component | Status | Issue |
|-----------|--------|-------|
| macOS code signing | ❌ | Missing SIGN_MACOS_SCRIPT env var |
| DMG packaging | ❌ | Blocked by signing failure |
| Windows signing | ❌ | Missing certificate configuration |
| Update server URL | ❌ | Still points to Signal servers |

### ⚠️ PARTIALLY CONFIGURED

| Component | Status | Notes |
|-----------|--------|-------|
| Beta build preparation | ⚠️ | Exists but package.json not updated for beta naming |
| Production config | ⚠️ | Points to Signal servers, not Orbital |
| DMG target | ⚠️ | Configured but unreachable due to signing |

---

## Build Artifacts Generated

### Current Release Directory
```
release/
  ├── mac/
  │   └── Orbital.app          (unsigned, 450+ MB)
  │       ├── Contents/
  │       │   ├── MacOS/
  │       │   ├── Frameworks/  (Electron + dependencies)
  │       │   ├── Resources/
  │       │   └── Info.plist
  │       └── ...
  └── builder-debug.yml       (electron-builder config dump)
```

### What Would Be Generated (with signing fixed)
```
release/
  ├── Orbital-mac-x64-7.80.0-alpha.1.zip      (~250 MB compressed)
  ├── Orbital-mac-arm64-7.80.0-alpha.1.zip    (~250 MB compressed)
  ├── Orbital-mac-universal-7.80.0-alpha.1.dmg (~350 MB)
  ├── builder-debug.yml
  └── mac/
      └── Orbital.app (unsigned intermediate)
```

---

## Configuration Needed for Beta Testing (Unsigned)

To create distributable beta packages **without code signing** (for limited testing):

```bash
# Build and skip code signing
SIGN_MACOS_SCRIPT="" \
electron-builder \
  --config.extraMetadata.environment=production \
  --skip-package \
  --config.directories.output=release
```

This would:
- Create the unsigned `Orbital.app` ✅
- Allow local testing on developer machine ✅
- **NOT** allow distribution to other machines (security restrictions)
- **NOT** create DMG installer (requires signing)

---

## Estimated Work Remaining

### For Beta Distribution (Unsigned)
- **Effort:** 2-3 hours
- **Tasks:**
  1. Create Orbital update server configuration (~1 hour)
  2. Create unsigned ZIP distribution script (~30 min)
  3. Test on clean machine (~1 hour)
  4. Document beta testing process (~30 min)

### For Production/Signed Distribution
- **Effort:** 1-2 weeks
- **Tasks:**
  1. Apple Developer account setup (~1-2 days)
  2. Code signing certificate acquisition (~1-2 days)
  3. Configure signing in electron-builder (~4 hours)
  4. Test signed DMG creation (~4 hours)
  5. Auto-update infrastructure setup (~1-2 days, DevOps)
  6. Notarization testing (~4 hours)

---

## Blockers and Dependencies

### Critical Blockers

1. **Code Signing Certificate (Apple)**
   - Required for: DMG packaging, distribution outside dev machine
   - Dependency: Apple Developer Account ($99/year)
   - Timeline: 1-2 days to acquire

2. **Orbital Backend API Configuration**
   - Required for: App to connect to Orbital servers
   - Dependency: Backend infrastructure (api.orbitl.org)
   - Timeline: Depends on backend deployment

3. **Update Server Infrastructure**
   - Required for: Auto-update functionality
   - Dependency: DevOps infrastructure
   - Alternative: Can use GitHub releases for beta

### Nice-to-Have

- App notarization (Apple requirement for Monterey+)
- Windows code signing certificate
- Custom installer branding (DMG background, etc.)

---

## Key File Locations Reference

| Purpose | Path | Status |
|---------|------|--------|
| Build config | `/Users/alexg/Documents/GitHub/Orbital-Desktop/package.json` (lines 444-716) | ✅ Orbital-specific |
| macOS script | `/Users/alexg/Documents/GitHub/Orbital-Desktop/ts/scripts/sign-macos.node.js` | ✅ Exists (compiled) |
| Icons | `/Users/alexg/Documents/GitHub/Orbital-Desktop/build/icons/mac/icon.icns` | ✅ Orbital branded |
| Production config | `/Users/alexg/Documents/GitHub/Orbital-Desktop/config/production.json` | ❌ Needs update |
| Entitlements | `/Users/alexg/Documents/GitHub/Orbital-Desktop/build/entitlements.mac.plist` | ✅ Present |
| Generated app | `/Users/alexg/Documents/GitHub/Orbital-Desktop/release/mac/Orbital.app` | ✅ Created |

---

## Recommendations

### Phase 2: Immediate Next Steps

1. **For Beta Testing** (1-2 weeks before MVP):
   ```bash
   # Option A: Unsigned distribution to beta testers
   - Create unsigned ZIP packages
   - Document: "For testing on your own Mac only"
   - Use GitHub releases for distribution
   ```

2. **For Production** (Before public launch):
   ```bash
   # Prerequisite: Apple Developer Account
   # Prerequisite: Code signing certificate
   - Implement signing script
   - Test DMG creation and installation
   - Setup auto-update infrastructure
   ```

### Phase 3: Long-term Infrastructure

1. **Auto-Update Server**
   - Use GitHub releases (simple)
   - Or setup Orbital update infrastructure
   - Enable auto-update in electron-builder config

2. **Windows/Linux Builds**
   - Windows: Requires code signing certificate
   - Linux: Can be built unsigned (deb package)
   - Timeline: After macOS launch

3. **App Notarization**
   - Required for macOS 10.15+ distribution
   - Automated via electron-builder
   - Timeline: Before production release

---

## Conclusion

**Current State:** Build infrastructure is mature and functional. Unsigned app package successfully created. Ready for beta testing with minimal setup.

**Critical Path:** Code signing certificate acquisition is the main blocker for distribution beyond local testing.

**Timeline Estimate:**
- Beta testing (unsigned): **2-4 weeks** (minimal configuration)
- Production release (signed): **4-6 weeks** (includes certificate acquisition and infrastructure setup)

**Next Action:** Determine beta testing timeline and whether to obtain Apple Developer account immediately.

---

**Generated:** November 27, 2025
**Build Version:** 7.80.0-alpha.1
**Repository:** alexg-g/Orbital-Desktop
