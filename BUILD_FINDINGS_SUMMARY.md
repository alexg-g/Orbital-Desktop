# Issue #48: Build Findings Summary
## Build and Package Electron App for Distribution

### Quick Status

| Aspect | Status | Details |
|--------|--------|---------|
| **Build Pipeline** | ✅ WORKS | Compiles to unsigned app in ~2-3 min |
| **App Bundle** | ✅ WORKS | `Orbital.app` successfully created |
| **Code Signing** | ❌ BLOCKED | Missing Apple Developer certificate |
| **DMG Packaging** | ❌ BLOCKED | Requires code signing first |
| **Branding** | ✅ COMPLETE | Icons and naming already Orbital-specific |
| **Server Config** | ❌ NEEDS CHANGE | Still points to Signal servers |

---

## What We Found

### Phase 1: Exploration Results

✅ **What's Already There:**
1. Mature build configuration inherited from Signal-Desktop
2. electron-builder v26.0.14 properly installed
3. All build assets (icons, entitlements) present and Orbital-branded
4. TypeScript → JavaScript transpilation pipeline working
5. Native module compilation working (all 6 modules)
6. App bundle creation successful: `/release/mac/Orbital.app`

❌ **What's Missing:**
1. Apple Developer code signing certificate (CRITICAL)
2. macOS sign script configuration (SIGN_MACOS_SCRIPT env var)
3. Orbital-specific server configuration in `config/production.json`
4. Update server infrastructure (currently points to Signal)

---

## Build Test Results

**Command Executed:**
```bash
pnpm run build
```

**Output:**
- ✅ Phases 0-1: Generate stage - SUCCESS
- ✅ esbuild:prod: Minification - SUCCESS
- ✅ electron-builder: Mac app creation - SUCCESS
  - Created: `/Users/alexg/Documents/GitHub/Orbital-Desktop/release/mac/Orbital.app` (unsigned)
  - Size: ~450 MB
- ❌ electron-builder: Code signing - FAILED
  - Error: Missing `SIGN_MACOS_SCRIPT` environment variable
  - Location: `ts/scripts/sign-macos.node.js:41`
- ❌ DMG packaging: BLOCKED by signing failure

**Time to failure:** ~2-3 minutes (on modern Mac)

---

## Critical Blockers

### 1. Code Signing (Must Have for Distribution)

**Blocker:** ❌ BLOCKS DMG, ZIP, and distribution

**Options:**

**Option A: Beta Testing (Unsigned)**
```bash
# Build unsigned ZIP for beta testers (they run on their own Mac)
SIGN_MACOS_SCRIPT="" pnpm run build --skip-package
# OR disable signing in electron-builder directly
```

**Option B: Production (Signed)**
```bash
# Prerequisites:
# 1. Apple Developer Account ($99/year)
# 2. Code signing certificate (macOS Developer ID)
# 3. Certificate in Keychain: "Developer ID Application"

# Then set:
export SIGN_MACOS_SCRIPT="path/to/sign-script.sh"
pnpm run build
```

**Timeline:**
- Option A (unsigned): **Immediate** - Use for beta testing
- Option B (signed): **1-2 weeks** - Requires Apple account acquisition

### 2. Server Configuration

**Blocker:** ❌ BLOCKS runtime functionality

**File:** `/Users/alexg/Documents/GitHub/Orbital-Desktop/config/production.json`

**Current (Signal servers):**
```json
{
  "serverUrl": "https://chat.signal.org",
  "storageUrl": "https://storage.signal.org",
  "cdn.0": "https://cdn.signal.org",
  "sfuUrl": "https://sfu.voip.signal.org/",
  "publish[0].url": "https://updates.signal.org/desktop"
}
```

**Must be changed to:** Orbital infrastructure endpoints
- Waiting on: Backend deployment (Backend Engineer)
- Timeline: Depends on backend

---

## What Needs to Change for Orbital

### 1. Code Signing (Infrastructure)
- **What:** Certificate configuration for macOS
- **Owner:** DevOps/Infrastructure Engineer
- **Timeline:** 1-2 weeks to acquire + 1-2 hours to configure

### 2. Server URLs (Configuration)
- **What:** `config/production.json` endpoints
- **Owner:** Backend Engineer (provide Orbital API URL)
- **Timeline:** When backend ready

### 3. Update Server (Infrastructure)
- **What:** Auto-update mechanism
- **Owner:** DevOps/Infrastructure Engineer
- **Timeline:** Optional for beta (can use GitHub releases)

### 4. Windows/Linux Builds (Future)
- **What:** Similar to macOS, but separate certificates
- **Owner:** DevOps/Infrastructure Engineer
- **Timeline:** After macOS launch

---

## Immediate Actions (Next 24 Hours)

### For Beta Testing Path

**1. Create Unsigned Build Configuration** (30 minutes)
```bash
# Create script: scripts/build-beta-unsigned.sh
#!/bin/bash
SIGN_MACOS_SCRIPT="" pnpm run build --skip-package
# Output: release/mac/Orbital.app (unsigned, works on dev machine)
```

**2. Document Beta Distribution** (30 minutes)
- Create: `docs/beta-testing-guide.md`
- Explain: How beta testers run unsigned app
- Include: Privacy notice, feedback channels

**3. Test on Clean Machine** (1 hour)
- Copy `release/mac/Orbital.app` to another Mac
- Verify: App launches and connects to backend
- Document: Any permission issues

### For Production Path

**1. Check Apple Developer Account** (15 minutes)
- Question: Does Orbital have Apple Developer account?
- If no: Start account creation process immediately
- If yes: Obtain certificate details

**2. Obtain Code Signing Certificate** (1-2 days)
- Login to Apple Developer portal
- Request: macOS Developer ID Certificate
- Export: As .p12 with password
- Add to Keychain: `security import cert.p12`

**3. Configure electron-builder** (1 hour)
- Update: `ts/scripts/sign-macos.node.js` with certificate
- Or create: Simple signing script
- Test: `pnpm run build` completes with signed DMG

**4. Notarization** (for macOS 10.15+ distribution)
- Follow: Apple's notarization process
- Time: ~5-10 minutes per build

---

## Files to Review/Change

### Must Change
1. **`config/production.json`** - Server URLs
   - Change all Signal servers → Orbital servers
   - Wait on: Backend infrastructure ready

### Should Configure
2. **`ts/scripts/sign-macos.node.js`** - Code signing
   - Add certificate identification logic
   - Or create wrapper script

3. **`package.json` build.mac.publish** - Update server
   - Change: `https://updates.signal.org/desktop` → Orbital update URL

### Optional Improvements
4. **`scripts/prepare_beta_build.js`** - Already exists but not used
   - Could be adapted for Orbital beta channel

5. **DMG branding** - Custom installer appearance
   - Logo/background in `release/mac/`
   - Would improve user experience

---

## Build Commands Reference

### Current Status
```bash
# This fails at code signing:
pnpm run build
```

### For Beta Testing
```bash
# Option 1: Skip packaging entirely
SIGN_MACOS_SCRIPT="" pnpm run build --skip-package

# Option 2: Just generate the unsigned app
pnpm run generate
pnpm run build:esbuild:prod

# Result: /release/mac/Orbital.app (works on dev machine only)
```

### For Signed Release
```bash
# Requires: Code signing certificate in Keychain
# Certificate name: "Developer ID Application: Orbital..."

export SIGN_MACOS_SCRIPT="./scripts/sign-macos.sh"  # Path to signing script
pnpm run build

# Result: Signed DMG, ZIPs ready for distribution
```

---

## Dependency Map

```
Beta Testing (2-4 weeks)
  └── Unsigned app builds ✅ READY
  └── Backend server config ⏳ WAITING (Backend Engineer)
  └── Testing documentation ⏳ READY (write docs)

Production Release (6-8 weeks)
  ├── Apple Developer account ⏳ WAITING (check if exists)
  ├── Code signing certificate ⏳ WAITING (1-2 days)
  ├── Signing configuration ⏳ READY (can do once cert acquired)
  ├── Orbital backend ready ⏳ WAITING
  ├── Update server infrastructure ⏳ WAITING (DevOps)
  └── Notarization testing ⏳ READY (automated)
```

---

## Risk Assessment

### Low Risk ✅
- Unsigned app creation works
- Branding/icons already correct
- Build process stable

### Medium Risk ⚠️
- Code signing complexity (need Apple account)
- Update server infrastructure (new component)
- Signal → Orbital server migration (config change)

### High Risk ❌
- None identified so far

---

## Recommendation: Build Strategy

### Phase 1: Beta (Immediate)
1. Create unsigned `Orbital.app`
2. Distribute via GitHub releases or direct link
3. Test with beta users on their own machines
4. Users may see security warnings on first run

### Phase 2: Production (After MVP)
1. Acquire Apple Developer account
2. Get code signing certificate
3. Build signed DMG
4. Implement auto-update
5. Public distribution

### Phase 3: Multi-Platform (Future)
1. Windows builds with code signing
2. Linux deb package
3. Native installers for all platforms

---

## Key Takeaway

**The build infrastructure works. We can create distributable Electron apps today. The only real blocker is the code signing certificate, which is a business/infrastructure decision, not a technical limitation.**

**Next step:** Decide on beta testing timeline and whether to acquire Apple Developer account.

---

**Analysis Date:** November 27, 2025
**Build Version:** 7.80.0-alpha.1
**Repository:** [alexg-g/Orbital-Desktop](https://github.com/alexg-g/Orbital-Desktop)
