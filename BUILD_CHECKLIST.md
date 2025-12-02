# Build & Package Checklist - Issue #48
## Quick Reference for Implementation

---

## PHASE 1: BETA BUILD (Week 1)

### Immediate Actions (Today)

- [ ] **Review findings**
  - Read: `BUILD_FINDINGS_SUMMARY.md`
  - Owner: Project Manager

- [ ] **Backend config decision**
  - Question: Can Backend Engineer provide Orbital API URLs?
  - Timeline: ⏳ Waiting
  - Owner: Backend Engineer

- [ ] **Create unsigned build script**
  - File: `/scripts/build-beta-unsigned.sh`
  - Owner: DevOps Engineer
  - Time: 30 min

- [ ] **Create beta testing guide**
  - File: `/docs/BETA_TESTING_GUIDE.md`
  - Owner: Frontend Engineer
  - Time: 1 hour

### Day 1-2

- [ ] **Update config/production.json**
  - Change: Signal servers → Orbital servers
  - Needs: Backend Engineer API URLs
  - Owner: DevOps Engineer
  - Time: 30 min (once URLs provided)

- [ ] **Build unsigned app**
  - Command: `./scripts/build-beta-unsigned.sh`
  - Output: `release/mac/Orbital.app`
  - Owner: DevOps Engineer
  - Time: 3 min build + 1 hour testing

- [ ] **Test on development machine**
  - Launch app and verify no crashes
  - Check basic functionality
  - Owner: QA Tester
  - Time: 1 hour

### Day 2-3

- [ ] **Create beta distribution ZIP**
  - Command: `cd release/mac && zip -r ../Orbital-mac-beta.zip Orbital.app`
  - Size: ~250 MB
  - Owner: DevOps Engineer
  - Time: 10 min

- [ ] **Test on clean machine**
  - Copy ZIP to colleague's Mac
  - Extract and run app
  - Verify it works
  - Owner: QA Tester
  - Time: 1 hour

- [ ] **Create GitHub release**
  - Tag: `v7.80.0-alpha.1`
  - Upload: ZIP file
  - Mark as: "Pre-release"
  - Owner: Project Manager
  - Time: 30 min

- [ ] **Send to beta testers**
  - Distribute: GitHub release link
  - Include: `BETA_TESTING_GUIDE.md`
  - Request: Feedback via GitHub issues
  - Owner: Project Manager
  - Time: 30 min

### Week 1 Success Criteria
- [ ] Unsigned app builds successfully
- [ ] At least 3 beta testers have received build
- [ ] No crash reports in first 24 hours
- [ ] Basic messaging/groups functionality confirmed working

---

## PHASE 2: PRODUCTION BUILD (Week 4-6)

### Prerequisites Check

- [ ] **Apple Developer Account**
  - Status: Active? Yes / No / Unknown
  - Owner: Project Manager / DevOps Engineer
  - Action if No: Create account at developer.apple.com ($99/year)
  - Timeline: 1-2 days for approval

- [ ] **Code Signing Certificate**
  - Status: Available? Yes / No
  - Owner: DevOps Engineer
  - Action if No: Generate from Apple Developer portal
  - Timeline: 1-2 days

- [ ] **Backend ready for production config**
  - Status: API endpoints finalized? Yes / No
  - Owner: Backend Engineer
  - Needed: Actual URLs for api.orbitl.org endpoints

### Week 4: Code Signing Setup

- [ ] **Obtain code signing certificate**
  - Login: Apple Developer portal
  - Create: macOS Developer ID Certificate
  - Export: As .p12 format
  - Owner: DevOps Engineer
  - Time: 1 day

- [ ] **Add certificate to Keychain**
  - Command: `security import cert.p12`
  - Verify: `security find-identity -v -p codesigning`
  - Owner: DevOps Engineer
  - Time: 10 min

- [ ] **Create signing script**
  - File: `ts/scripts/sign-macos.sh`
  - Template: See `BUILD_IMPLEMENTATION_ROADMAP.md`
  - Owner: DevOps Engineer
  - Time: 1 hour

- [ ] **Test signing script**
  - Build: `pnpm run build`
  - Verify: `codesign -vv release/mac/Orbital.app`
  - Owner: DevOps Engineer
  - Time: 30 min

### Week 5: Notarization Setup

- [ ] **Create app-specific password**
  - Go: Apple account Settings → Security
  - Create: App-specific password
  - Save: In password manager
  - Owner: DevOps Engineer
  - Time: 10 min

- [ ] **Create notarization script**
  - File: `ts/scripts/notarize.node.js`
  - Install: `pnpm add -D @electron/notarize`
  - Owner: DevOps Engineer
  - Time: 1 hour

- [ ] **Test notarization**
  - Build: `pnpm run build` (will notarize automatically)
  - Check: notarization status
  - Owner: DevOps Engineer
  - Time: 30 min + wait time

### Week 5-6: Update Server

- [ ] **Decide: GitHub Releases or Custom Server**
  - Decision: Which method?
  - Owner: Project Manager + Backend Engineer
  - Time: 1 hour discussion

- [ ] **Configure update server**
  - If GitHub: Update `package.json` build.mac.publish
  - If Custom: Wait for Backend to deploy server
  - Owner: DevOps Engineer
  - Time: 30 min (GitHub) or 3+ days (custom)

### Week 6: Testing & Release

- [ ] **Build signed, notarized app**
  - Command: `pnpm run build`
  - Verify: All artifacts present
  - Owner: DevOps Engineer
  - Time: 2 hours

- [ ] **Test signed app**
  - Mount DMG
  - Install app
  - Launch and verify functionality
  - Check for security warnings (should be none)
  - Owner: QA Tester
  - Time: 1 hour

- [ ] **Test auto-update**
  - Publish v7.80.0
  - Use app to check for updates
  - Verify update downloads and installs
  - Owner: QA Tester
  - Time: 2 hours

- [ ] **Create production release**
  - Tag: `v7.80.0` (remove -alpha)
  - Upload: Signed DMG + ZIPs
  - Mark as: "Latest release"
  - Owner: Project Manager
  - Time: 30 min

- [ ] **Announce to users**
  - Update: Website downloads page
  - Send: Email to beta testers
  - Post: Social media (if applicable)
  - Owner: Marketing / PM
  - Time: 1 hour

### Week 6 Success Criteria
- [ ] Signed DMG builds successfully
- [ ] Notarization passes Apple verification
- [ ] Auto-update mechanism tested and working
- [ ] No security warnings on launch
- [ ] Production release published

---

## PHASE 3: MULTI-PLATFORM (Week 8-12)

### Windows Support

- [ ] **Obtain Windows code signing certificate**
  - Cost: $150-300/year
  - Owner: Project Manager (budget)
  - Timeline: 3-5 days

- [ ] **Test Windows build**
  - Command: `pnpm run build-win32-all`
  - Owner: DevOps Engineer
  - Time: 2 hours

- [ ] **Configure Windows signing**
  - Update: `ts/scripts/sign-windows.node.js`
  - Owner: DevOps Engineer
  - Time: 1 hour

- [ ] **Create Windows installer**
  - Format: .exe (NSIS)
  - Sign: With Windows certificate
  - Owner: DevOps Engineer
  - Time: 2 hours

### Linux Support

- [ ] **Test Linux build**
  - Command: `pnpm run build-linux`
  - Output: `.deb` package
  - Owner: DevOps Engineer
  - Time: 1 hour

- [ ] **Test Linux installation**
  - Install on Ubuntu 20.04+
  - Launch app and verify functionality
  - Owner: QA Tester
  - Time: 1 hour

- [ ] **Create desktop entry**
  - Location: `/usr/share/applications/orbital.desktop`
  - Owner: DevOps Engineer
  - Time: 30 min

- [ ] **Test auto-update on Linux**
  - Verify update mechanism works
  - Owner: QA Tester
  - Time: 1 hour

---

## BLOCKING DEPENDENCIES

### Critical Blockers (Must Resolve)

| Blocker | Owner | Timeline | Status |
|---------|-------|----------|--------|
| Apple Developer Account | PM / DevOps | 1-2 days | ⏳ Waiting |
| Code Signing Certificate | DevOps | 1-2 days | ⏳ Waiting |
| Orbital API Endpoints | Backend Eng | 3-7 days | ⏳ Waiting |

### Optional Blockers (Can Defer)

| Item | Owner | Timeline | Status |
|------|-------|----------|--------|
| Auto-update Server | Backend Eng | 3-5 days | ⏳ Can use GitHub Releases |
| Windows Code Signing | PM | $$$$ | ⏳ Optional for Phase 1 |
| Linux Support | DevOps | 2-3 days | ⏳ Optional for Phase 1 |
| App Notarization | DevOps | 1-2 hours | ⏳ After cert obtained |

---

## COMMANDS QUICK REFERENCE

### Build Unsigned (Beta)
```bash
./scripts/build-beta-unsigned.sh
```

### Build Signed (Production - requires cert)
```bash
export SIGN_MACOS_SCRIPT="./ts/scripts/sign-macos.sh"
export NOTARIZE_APPLE_ID="orbital@orbitl.org"
export NOTARIZE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export NOTARIZE_TEAM_ID="XXXXXXXXX"

pnpm run build
```

### Build Windows
```bash
pnpm run build-win32-all
```

### Build Linux
```bash
pnpm run build-linux
```

### Create ZIP
```bash
cd release/mac
zip -r ../Orbital-mac-beta.zip Orbital.app
```

### Verify Signature
```bash
codesign -vv release/mac/Orbital.app
```

### Mount and Test DMG
```bash
hdiutil mount release/Orbital-mac-universal-7.80.0.dmg
# App appears in /Volumes/Orbital/Orbital.app
hdiutil unmount /Volumes/Orbital
```

---

## OWNER ASSIGNMENTS

| Task | Primary | Secondary | Status |
|------|---------|-----------|--------|
| Phase 1 Build | DevOps | QA | Ready |
| Code Signing | DevOps | PM | Blocked |
| Notarization | DevOps | QA | Blocked |
| Backend Config | Backend | DevOps | Blocked |
| Update Server | Backend | DevOps | Waiting |
| Testing | QA | Frontend | Ready |
| Release Management | PM | DevOps | Ready |
| Windows Build | DevOps | - | Future |
| Linux Build | DevOps | - | Future |

---

## DECISION POINTS

### Decision 1: Code Signing Certificate
**Question:** Should Orbital invest in Apple Developer account ($99/year)?
**Options:**
- A) Yes, get certificate and build signed apps
- B) No, distribute unsigned apps only (limited testing)

**Impact:** Affects distribution method and user experience
**Recommendation:** Option A (needed for production)
**Timeline:** Decide immediately

### Decision 2: Update Server
**Question:** GitHub Releases or custom update server?
**Options:**
- A) GitHub Releases (free, simple, public)
- B) Custom server (private, controlled, more complex)

**Impact:** Auto-update implementation
**Recommendation:** GitHub Releases for Phase 1, custom later if needed
**Timeline:** Decide in week 3-4

### Decision 3: Multi-Platform Launch
**Question:** Launch Windows at same time as macOS?
**Options:**
- A) Launch macOS first, Windows later
- B) Launch both simultaneously

**Impact:** Windows requires separate code signing cert
**Recommendation:** Option A (stagger releases)
**Timeline:** Decide in week 6

---

## SUCCESS METRICS

### Phase 1 (Beta)
- [ ] Unsigned app builds without errors
- [ ] 5+ beta testers successfully running app
- [ ] No critical crash reports
- [ ] Basic functionality confirmed working
- [ ] Feedback incorporated into Phase 2

### Phase 2 (Production)
- [ ] Signed app builds without errors
- [ ] DMG installer created and tested
- [ ] Auto-update mechanism verified
- [ ] No security warnings on launch
- [ ] 100+ users can download and install

### Phase 3 (Multi-Platform)
- [ ] Windows .exe builds and signs
- [ ] Linux .deb builds and installs
- [ ] All platforms have auto-update
- [ ] Users can auto-update on any platform

---

## DOCUMENT REFERENCES

| Document | Purpose | Audience |
|----------|---------|----------|
| `BUILD_FINDINGS_SUMMARY.md` | High-level overview | PM, all leads |
| `ELECTRON_BUILD_ANALYSIS.md` | Technical deep-dive | DevOps, Backend |
| `BUILD_IMPLEMENTATION_ROADMAP.md` | Implementation plan | DevOps, Backend, QA |
| `BUILD_CHECKLIST.md` | This file - actionable tasks | Everyone |

---

**Checklist Version:** 1.0
**Date:** November 27, 2025
**Issue:** #48 - Build and Package Electron App for Distribution
**Repository:** [alexg-g/Orbital-Desktop](https://github.com/alexg-g/Orbital-Desktop)

---

## Next Steps (Right Now)

1. **Project Manager:** Read `BUILD_FINDINGS_SUMMARY.md` (10 min)
2. **Project Manager:** Make decision: Apple Developer account? (1 hour)
3. **DevOps Engineer:** Read `ELECTRON_BUILD_ANALYSIS.md` (30 min)
4. **Backend Engineer:** Provide Orbital API URLs (ASAP)
5. **All Leads:** Review `BUILD_IMPLEMENTATION_ROADMAP.md` (30 min)
6. **Team:** Discuss Phase 1 timeline and blockers (30 min meeting)

**Time to beta build:** 2-3 days (if all inputs ready)
**Time to production:** 4-6 weeks (including Apple cert acquisition)
