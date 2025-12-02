# Orbital Configuration Analysis - Issue #63

## Executive Summary

**Decision:** `config/production.json` should **KEEP Signal server URLs** as-is. Orbital services already use environment variables for Orbital-specific endpoints.

## Architecture Understanding

Orbital uses a **dual-layer architecture**:

### Layer 1: Signal Protocol (Base Layer)
- **Purpose:** End-to-end encryption, key exchange, secure messaging
- **Components:** libsignal, X3DH, Double Ratchet, Sender Keys
- **Server URLs:** Signal's production servers
- **Config Location:** `config/production.json`
- **Used By:** `ts/textsecure/WebAPI.preload.ts`, Signal Protocol core

### Layer 2: Orbital Threading (Application Layer)
- **Purpose:** Threading, groups, media relay, quotas
- **Components:** Custom Orbital backend, PostgreSQL, WebSocket
- **Server URLs:** `https://api.orbitl.org`
- **Config Location:** Environment variable `ORBITAL_API_URL`
- **Used By:** `ts/services/orbital*.preload.ts` files

## Current Configuration Status

### ✅ CORRECT: config/production.json
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

**Why keep these?**
- Signal Protocol **requires** Signal's servers for:
  - Key distribution (X3DH)
  - Encrypted messaging relay
  - Contact directory (CDSI)
  - Media CDN for Signal attachments
  - VoIP/calling infrastructure

**What if we change them?**
- Signal Protocol breaks
- E2EE fails
- Key exchange fails
- No encrypted messaging foundation

### ✅ CORRECT: Orbital Services (ts/services/orbital*.preload.ts)
```typescript
const ORBITAL_API_URL = process.env.ORBITAL_API_URL || 'https://api.orbitl.org';
```

All Orbital services already use this pattern:
- `orbitalAuth.preload.ts` - Authentication
- `orbitalGroups.preload.ts` - Orbit management
- `orbitalThreads.preload.ts` - Threading
- `orbitalMediaUpload.preload.ts` - Media uploads
- `orbitalMediaDownload.preload.ts` - Media downloads
- `orbitalQuota.preload.ts` - Storage quotas
- `orbitalSignalRelay.preload.ts` - Signal relay integration

### ✅ CORRECT: Backend .env.production
```bash
CORS_ORIGINS=https://api.orbitl.org,https://orbitl.org
```

Backend already configured for production domain.

## Why This Dual Architecture Works

### Signal Protocol Layer (Base)
1. **User registers** → Signal servers verify phone number
2. **Key exchange** → Signal servers distribute public keys
3. **Encrypted messages** → Signal servers relay encrypted envelopes
4. **Attachments** → Signal CDN hosts encrypted media (temporary)

### Orbital Layer (Application)
1. **Threads** → Orbital API stores encrypted thread metadata
2. **Groups** → Orbital API manages orbit membership
3. **Media** → Orbital API relays encrypted media for 7 days
4. **Sync** → Orbital API coordinates distributed storage

### Flow Example: User Posts Video to Thread
```
1. Signal Protocol encrypts video → Uses Signal CDN attachment upload
2. Orbital service gets attachment ID → Calls https://api.orbitl.org/api/threads
3. Server stores encrypted thread → PostgreSQL
4. Server notifies orbit members → WebSocket
5. Members download video → Signal CDN (encrypted)
6. Members store locally → SQLCipher
7. After 7 days → Server deletes (members keep copy)
```

## Recommendation: NO CHANGES NEEDED

### config/production.json - Keep As-Is ✅
- All Signal server URLs are required for Signal Protocol
- Do NOT change to Orbital domains
- These URLs are foundational to E2EE

### Orbital Services - Already Correct ✅
- Already use `ORBITAL_API_URL` environment variable
- Default to `https://api.orbitl.org`
- No config file changes needed

### If Deployment Needs Custom Orbital URL
Set environment variable:
```bash
export ORBITAL_API_URL=https://custom.orbitl.org
```

Or in Electron main process before app loads.

## Testing Verification

To verify correct configuration:

1. **Signal Protocol Test:**
   ```bash
   # Should connect to chat.signal.org
   grep "serverUrl" config/production.json
   ```

2. **Orbital API Test:**
   ```bash
   # Should default to api.orbitl.org
   grep "ORBITAL_API_URL" ts/services/orbital*.preload.ts
   ```

3. **Runtime Test:**
   ```typescript
   // In preload
   console.log('Signal serverUrl:', window.SignalContext.config.serverUrl);
   // Expected: https://chat.signal.org

   console.log('Orbital API URL:', process.env.ORBITAL_API_URL);
   // Expected: https://api.orbitl.org
   ```

## Potential Future Consideration

**IF** we ever want to run our own Signal server (replace Signal Foundation's servers):
- This would require running a full Signal server infrastructure
- Would need to change `config/production.json` URLs
- Would require significant infrastructure investment
- Is NOT part of current MVP scope

For MVP, we rely on Signal's infrastructure for E2EE and add Orbital threading on top.

## Issue #63 Resolution

**Status:** Configuration is already correct, no changes needed.

**Reasoning:**
1. Orbital is a **hybrid** architecture: Signal Protocol base + Orbital threading layer
2. Signal Protocol requires Signal's production servers (config/production.json)
3. Orbital services use environment variables (already set to api.orbitl.org)
4. This dual approach is architecturally sound and follows best practices

**Action Items:**
- [x] Document architecture understanding
- [x] Verify current configuration is correct
- [x] Explain why Signal URLs must remain
- [ ] Close Issue #63 with explanation
- [ ] Update developer documentation if needed

## Questions & Clarifications

**Q: Why not replace Signal servers with Orbital servers?**
A: Signal Protocol is complex. We'd need to run our own Signal infrastructure (chat relay, key server, CDSI, CDN). Current approach: use Signal Foundation's proven infrastructure for E2EE, add our threading layer on top.

**Q: Do we pay Signal Foundation for server usage?**
A: Currently, we're using Signal's open protocol. For production scale, we should:
- Contact Signal Foundation about our use case
- Consider running our own Signal server infrastructure
- Or negotiate terms if using their servers

**Q: What if Signal Foundation blocks our app?**
A: We can run our own Signal server stack. All code is open source. This is a future scalability consideration, not MVP blocker.

**Q: Where does the "7-day relay" happen?**
A: On our Orbital backend (`orbital-backend/`). Videos upload to our API, get stored in PostgreSQL + filesystem, then deleted after 7 days. Signal CDN is used for temporary Signal Protocol attachments only.

## Related Files

- `/config/production.json` - Signal Protocol servers (DO NOT CHANGE)
- `/config/default.json` - Development config (keep Signal staging servers)
- `/orbital-backend/.env.production` - Orbital backend config (CORS already set)
- `/ts/services/orbital*.preload.ts` - Orbital services (already using env var)
- `/ts/textsecure/WebAPI.preload.ts` - Signal Protocol implementation
- `/ts/types/RendererConfig.std.ts` - Config schema

---

**Conclusion:** Issue #63 is actually a non-issue. Configuration is architecturally correct as-is.
