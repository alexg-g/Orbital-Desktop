# Immediate Action Items - Critical Path to MVP Launch
**Generated:** December 1, 2025
**Status:** 6 Critical/High Priority Issues Blocking Launch

---

## Critical Path Summary

The project is **69% complete** but **5 days overdue** on the original Nov 26 MVP deadline. However, with focused effort on the following **6 critical/high-priority issues**, we can achieve **practical MVP launch by December 3-5, 2025**.

All other work (UI polish, security enhancements, auto-update, Windows support) should be deferred to post-MVP.

---

## BLOCKING ISSUES - DO FIRST

### Issue #63: Configure Orbital API endpoints in production.json
**Priority:** CRITICAL (Blocks all production API calls)
**Status:** OPEN
**Estimated Time:** 30 minutes
**Assignee:** Backend Engineer

**What's Needed:**
1. Determine final API endpoint URLs from DigitalOcean deployment (Issue #16 is complete)
2. Update `/ts/config/production.json` with production server endpoints
3. Rebuild Orbital app
4. Test API calls to production server (media upload/download, thread creation)
5. Verify WebSocket connection to production server
6. Close issue when API calls successfully hit production

**Acceptance Criteria:**
- [ ] `/ts/config/production.json` updated with correct endpoints
- [ ] App rebuilt with production config
- [ ] Media upload API successfully calls production server
- [ ] Thread creation API successfully calls production server
- [ ] WebSocket connects to production server
- [ ] No 404 or connection errors

**Blocked By:** Nothing (Issue #16 deployment is complete)
**Blocks:** Issues #21, #53, #54, #64, #69 - All need production API working

---

### Issue #64: Create beta testing distribution guide
**Priority:** HIGH (Beta testers need to know how to install)
**Status:** OPEN
**Estimated Time:** 1-2 hours
**Assignee:** QA/Documentation

**What's Needed:**
Create `/docs/BETA_TESTING_GUIDE.md` with:

1. **Installation Requirements Section**
   - macOS 10.13+ (or Windows/Linux equivalents)
   - 2GB disk space minimum
   - Internet connection (WiFi recommended)

2. **Installation Steps (macOS Focus)**
   - Download ZIP from GitHub releases
   - Extract to Downloads folder
   - Copy Orbital.app to Applications folder
   - First launch handling (security warning "App is damaged")
   - How to bypass Gatekeeper if needed

3. **Running the App**
   - Double-click to launch
   - What to expect on first run
   - Creating test account
   - Joining test orbit

4. **Feature Scope Section**
   - What's included (user signup, orbits, threading, media)
   - What's NOT ready (Windows build, auto-update, notifications)
   - Known limitations and bugs

5. **Feedback Section**
   - How to report bugs (GitHub issues)
   - What info to include (screenshot, steps to reproduce, OS version)
   - Feature requests vs. bug reports
   - Contact email for urgent issues

6. **Troubleshooting Section**
   - Common issues and solutions
   - Log file location
   - How to clear app data and restart

7. **Privacy & Security Section**
   - Data handling explanation
   - E2EE guarantee
   - Server retention (7 days)
   - No data collection

**Acceptance Criteria:**
- [ ] Document is clear for non-technical users
- [ ] Includes step-by-step screenshots or GIFs
- [ ] Covers security warnings for unsigned app
- [ ] Explains what's in beta and what's not
- [ ] Provides multiple feedback channels
- [ ] Includes troubleshooting common issues

**Blocked By:** Issue #62 (Unsigned beta build script - CLOSED)
**Blocks:** Issue #69 (Beta distribution release) and beta testing expansion

---

### Issue #69: Create beta distribution ZIP and release
**Priority:** HIGH (Needed to distribute to beta testers)
**Status:** OPEN
**Estimated Time:** 1 hour
**Assignee:** DevOps/Infrastructure

**What's Needed:**
1. Create unsigned beta build for macOS
   - Run build script from Issue #62
   - Generate DMG or ZIP package
   - Label as "Beta - Unsigned Build"

2. Create GitHub Release
   - Tag version (e.g., `v0.1.0-beta.1`)
   - Upload build artifact
   - Write release notes covering:
     - What's new (threading, media, orbits, auth)
     - Known issues
     - Link to BETA_TESTING_GUIDE.md (Issue #64)
     - How to report feedback

3. Test download and installation
   - Verify file downloads
   - Verify extraction works
   - Verify app launches

**Acceptance Criteria:**
- [ ] GitHub release created and published
- [ ] Build artifact uploaded and downloadable
- [ ] Release notes explain what to test
- [ ] Verification steps completed
- [ ] BETA_TESTING_GUIDE.md linked in release notes

**Blocked By:** Issues #64 (guide) and #63 (API config)
**Blocks:** Beta tester recruitment and actual testing

---

### Issue #53: Device recovery flow - verify lost device rejoins and syncs all content
**Priority:** CRITICAL (Core MVP feature - distributed backup)
**Status:** OPEN
**Estimated Time:** 2-3 hours
**Assignee:** QA/Testing Specialist

**What's Needed:**
Test the complete device recovery scenario:

1. **Setup Test Orbit with 2+ Members**
   - Device A (User 1): Create orbit
   - Device B (User 2): Join orbit via invite code
   - Create threads and share media on both devices

2. **Simulate Device Loss**
   - Note what content exists on Device A (threads, media)
   - Clear Device A's SQLCipher database (simulating lost phone)
   - OR uninstall and reinstall Orbital app on Device A

3. **Recovery Process**
   - Device A re-registers with same phone number
   - Device A re-joins orbit (using invite code or requesting re-invite)
   - Verify app starts syncing content from Device B

4. **Verify Complete Recovery**
   - All threads from orbit appear on Device A
   - All media files from orbit appear on Device A
   - Video playback works (stored locally)
   - Chat history is complete and readable
   - No data loss detected

5. **Document Results**
   - Time taken for full recovery
   - Any errors encountered
   - Whether all content recovered
   - Overall experience (user-friendly or confusing?)

**Acceptance Criteria:**
- [ ] Device A successfully re-registers
- [ ] Device A successfully re-joins orbit
- [ ] All threads sync to Device A
- [ ] All media files sync to Device A
- [ ] No data loss
- [ ] Recovery completes within 30 minutes (as per PRD NFR-2.8)
- [ ] Process is intuitive for non-technical users
- [ ] Issue closed with test report

**Blocked By:** Issue #63 (API config must work first for sync)
**Blocks:** Issue #21 (MVP Launch Readiness)

**Test Scenario Walkthrough:**
```
1. Create orbit on Device A: Alice's Family
   - Invite code: ABC12345
2. Join on Device B: Bob joins with same invite code
3. Create threads on Device A:
   - "Emma's First Steps!" + 100MB video
   - "Family Dinner Tonight"
4. Post replies on Device B
5. Clear Device A's app data (uninstall/reinstall)
6. Device A re-registers phone number
7. Device A re-enters invite code ABC12345
8. VERIFY: All threads appear
9. VERIFY: 100MB video is stored locally
10. VERIFY: Video plays without downloading
```

---

### Issue #54: Full orbit history sync when new member joins
**Priority:** HIGH (Core MVP feature - new members get all content)
**Status:** OPEN
**Estimated Time:** 2-3 hours
**Assignee:** QA/Testing Specialist

**What's Needed:**
Test the complete new member sync scenario:

1. **Setup: Create Orbit with Initial History**
   - Device A (Alice): Create orbit "Family Videos"
   - Create multiple threads (5-10) with varying content
   - Upload media to threads (photos, videos)
   - Wait for media to sync to local storage
   - Total content: 500MB+ to test substantial sync

2. **New Member Join Scenario**
   - Device B (Charlie): Download fresh Orbital app
   - Charlie creates account with new phone number
   - Charlie enters invite code from Alice's orbit
   - App should start full history sync

3. **Verify Complete Sync**
   - All threads appear on Device B
   - All media files downloaded to Device B
   - Progress indicator shows sync status
   - Can browse threads while sync is happening (background)
   - Sync completes within 30 minutes (NFR-2.8)
   - All media plays from local storage (no re-downloading)

4. **Test Edge Cases**
   - New member joins while Alice is posting new thread (concurrent)
   - New member joins then goes offline, reconnects (resume sync)
   - Large orbit with 10+ members and 1000+ messages
   - Large media files (100MB+ videos)

5. **Document Results**
   - Total sync time
   - Data transferred
   - Success percentage (any failed media?)
   - UX observations (confusing? clear progress?)

**Acceptance Criteria:**
- [ ] New member sees all existing threads
- [ ] New member sees all existing media
- [ ] No content is missing
- [ ] Sync completes within 30 minutes
- [ ] Media plays from local storage
- [ ] Sync works with concurrent new posts
- [ ] Sync resumes after network interruption
- [ ] Large orbits (10+ members, 1000+ msgs) handle correctly
- [ ] Issue closed with test report

**Blocked By:** Issue #63 (API config)
**Blocks:** Issue #21 (MVP Launch Readiness)

---

### Issue #67: Implement macOS app notarization for distribution
**Priority:** HIGH (Required for non-beta production)
**Status:** OPEN
**Estimated Time:** 1-2 hours
**Assignee:** DevOps/Infrastructure

**What's Needed:**
Notarize the macOS app for production distribution:

1. **Prepare App for Notarization**
   - Ensure code signing is correct (Issue #66 complete)
   - Build release version of app
   - Create DMG or PKG installer

2. **Submit for Notarization**
   - Use `xcrun altool --notarize-app` or similar
   - Apple Developer account credentials ready
   - Upload build to Apple servers
   - Wait for Apple review (typically 10-30 minutes)

3. **Handle Notarization Results**
   - Check notarization status
   - If approved: staple ticket to app
   - If rejected: fix issues and resubmit

4. **Test Notarized App**
   - Download and run on macOS
   - No "app is damaged" warning
   - No Gatekeeper issues
   - Verify code signature

5. **Create Production Release**
   - Update GitHub release with notarized build
   - Remove "Beta - Unsigned" label
   - Publish as official release
   - Update download links

**Acceptance Criteria:**
- [ ] App passes Apple notarization
- [ ] Notarization ticket stapled to app
- [ ] No security warnings on macOS
- [ ] Gatekeeper accepts app
- [ ] Code signature valid
- [ ] Production release created

**Blocked By:** Issue #66 (Code signing - CLOSED)
**Blocks:** Production launch to non-beta users

---

## SUPPORTING INFRASTRUCTURE - DO NEXT

### Issue #51: Implement 7-day media retention cleanup job
**Priority:** MEDIUM (Cost control - deletes expired media)
**Status:** OPEN
**Estimated Time:** 1-2 hours
**Assignee:** Backend Engineer

**What's Needed:**
- Create scheduled job that runs daily
- Find all media older than 7 days
- Delete server's encrypted copy
- Keep client-side copies (user's devices)
- Log deletion operations
- Alert if deletion fails

---

### Issue #52: Database backup automation with 7-day retention
**Priority:** MEDIUM (Data loss prevention)
**Status:** OPEN
**Estimated Time:** 1-2 hours
**Assignee:** DevOps/Infrastructure

**What's Needed:**
- Create automated daily backups
- Store backups with 7-day retention
- Test restoration process
- Document recovery procedure
- Alert on backup failure

---

## DEFER TO POST-MVP

All other open issues (#55-61, #42-44, #68, #70) should be explicitly deferred to post-MVP to avoid scope creep:

### Why Defer:
1. **Low Impact on MVP:** These are UI polish and optional features
2. **Risk to Schedule:** Every issue adds 2-4 hours of work
3. **PRD Explicit:** PRD section "Out of Scope" explicitly excludes these
4. **Core Features Done:** All essential MVP features are implemented

### Issues to Explicitly Close or Defer:
- #56: WiFi-only media sync [LOW]
- #57: Password strength indicator [LOW]
- #58: Success feedback after signup [LOW]
- #59: Unit tests for auth [MEDIUM]
- #60: Password complexity validation [LOW]
- #61: Sync display names [UNTAGGED]
- #42: Join notifications [DEFERRED]
- #43: Invite code revocation [DEFERRED]
- #44: Join approval workflow [DEFERRED]
- #68: Auto-update mechanism [MEDIUM, post-MVP]
- #70: Windows installer [NEW, can defer]

---

## Timeline to MVP Launch

### Day 1 (December 2)
- Morning: Fix Issue #63 (30 min) - UNBLOCK ALL APIS
- Mid-day: Complete Issue #64 (2 hours) - Beta testing guide
- Afternoon: Create Issue #69 release (1 hour) - Distribute to beta testers

**End of Day 1:** Beta testing can begin with real users

### Days 2-3 (December 3-4)
- Execute Issue #53 (2-3 hours) - Device recovery testing
- Execute Issue #54 (2-3 hours) - New member sync testing
- Implement Issue #67 (1-2 hours) - macOS notarization

**Parallel Work:**
- Implement Issue #51 (1-2 hours) - 7-day cleanup
- Implement Issue #52 (1-2 hours) - Database backups

### Day 4 (December 5)
- Review test results from Issues #53, #54
- Fix any critical bugs found
- Deploy final production build
- **LAUNCH MVP**

**Estimated Total Work:** ~25-30 hours across team
**Path Clear:** Yes, all blockers identified and actionable

---

## Success Metrics for MVP Launch

When these criteria are met, we can ship:

1. ✅ Issue #63 Fixed: All production APIs working
2. ✅ Issue #64 Done: Beta testers have clear installation guide
3. ✅ Issue #69 Done: Beta builds published and downloadable
4. ✅ Issue #53 Passed: Device recovery works end-to-end
5. ✅ Issue #54 Passed: New member sync works end-to-end
6. ✅ Issue #67 Done: App notarized for production
7. ✅ Issue #51 Done: 7-day cleanup automated
8. ✅ Issue #52 Done: Daily backups automated
9. ✅ No critical bugs from beta testing

---

## Questions for Project Lead

Before proceeding with fixes:

1. **API Endpoints:** What are the exact endpoint URLs from the DigitalOcean deployment?
   - Affects Issue #63 fix
   - Example: `https://orbital-api.example.com/api/v1`

2. **Beta Testing:** How many families/users are ready for beta?
   - Affects timeline for Issues #53, #54
   - Affects urgency of distribution (Issue #69)

3. **macOS Only?** Are we launching MVP for macOS only or including other platforms?
   - Issue #70 (Windows) can stay deferred if macOS-only for MVP
   - Simplifies Issue #69 packaging

4. **Notarization Timeline:** Should Issue #67 be done before or after beta testing?
   - Could wait until production release
   - Or do now to avoid last-minute surprises

---

## Team Assignments

**Critical Path (Must Complete for Launch):**
- **Backend Engineer:** Issue #63 (30 min)
- **QA/Testing:** Issues #53, #54 (6 hours)
- **DevOps/Docs:** Issues #64, #69 (3 hours)
- **DevOps:** Issue #67 (2 hours)

**Infrastructure (Should Complete Before Launch):**
- **Backend Engineer:** Issue #51 (2 hours)
- **DevOps:** Issue #52 (2 hours)

**Total Team Effort:** ~20-25 hours to MVP launch

---

## Next Steps

1. **TODAY (Dec 1):**
   - Review this action plan with team
   - Assign issues to specific people
   - Get API endpoint URLs for Issue #63

2. **TOMORROW (Dec 2):**
   - Fix Issue #63 (API config) first thing - CRITICAL
   - Run full QA suite on production API
   - Start Issue #64 (distribution guide)

3. **BY EOD DEC 2:**
   - Issues #63, #64, #69 DONE
   - Beta testing ready to start

4. **BY EOD DEC 4:**
   - Issues #53, #54 TESTED
   - Issues #51, #52 IMPLEMENTED
   - Issue #67 NOTARIZED

5. **DEC 5:**
   - Fix any critical bugs
   - LAUNCH MVP

---

**Report Generated:** December 1, 2025
**Status:** Ready to Execute
**Expected Launch:** December 3-5, 2025
