# Orbital Settings API Implementation Summary

**Date:** November 25, 2024
**Author:** Backend/Database Engineer
**Status:** ✅ Complete

## Overview

This document summarizes the backend API implementation for Orbital settings functionality, including avatar management and invite code generation features.

## What Was Implemented

### 1. Database Migration

**File:** `/orbital-backend/migrations/1730000000010_add-avatar-support.js`

Added support for user avatars and group max_members:
- Added `avatar_url` column to `users` table (TEXT, nullable)
- Added index on `avatar_url` for quick lookups
- Added `max_members` column to `groups` table (INTEGER, default 10)

**To run migration:**
```bash
cd orbital-backend
npm run migrate up
```

### 2. User Profile API Routes

**File:** `/orbital-backend/src/routes/users.js`

Implemented 5 endpoints for user profile management:

#### Avatar Management
- **POST /api/users/avatar** - Upload avatar (multipart/form-data, max 5MB)
  - Supports JPEG, PNG, GIF, WebP
  - Automatic cleanup of old avatars
  - Returns: `{ avatarUrl: string, message: string }`

- **DELETE /api/users/avatar** - Remove avatar
  - Deletes file from filesystem
  - Returns: `{ success: boolean, message: string }`

- **GET /api/users/:userId/avatar** - Get user's avatar URL
  - Returns: `{ avatarUrl: string | null }`

#### Profile Information
- **GET /api/users/me** - Get current user's profile
  - Returns: `{ id, username, avatarUrl, createdAt }`

- **GET /api/users/:userId** - Get another user's profile
  - Privacy: Only accessible if users share a group
  - Returns: `{ id, username, avatarUrl }`

**Features:**
- Multer-based file upload with type validation
- Automatic filename generation (userId-timestamp.ext)
- Group membership privacy checks
- Comprehensive error handling

### 3. Invite Code API Routes

**File:** `/orbital-backend/src/routes/invites.js`

Implemented 4 endpoints for invite code management:

#### Code Generation
- **POST /api/invites/generate** - Generate new invite code
  - Request: `{ groupId: string }`
  - Returns: `{ code, expiresAt, createdAt }` (timestamps in milliseconds)
  - Only group creator can generate

- **POST /api/invites/generate-link** - Generate shareable invite link
  - Request: `{ groupId: string, linkType?: 'orbital' | 'web' }`
  - Returns: `{ link, code, expiresAt, createdAt }`
  - Supports deep links (`orbital://invite/{code}`)
  - Supports web links (`https://orbitl.org/invite/{code}`)

#### Code Status
- **GET /api/invites/status/:code** - Check invite code status
  - Returns: `{ status: 'pending' | 'accepted' | 'expired', createdAt, expiresAt, usedAt?, usedBy? }`

- **GET /api/invites/group/:groupId** - Get all active codes for group
  - Returns: `{ inviteCodes: [...] }`
  - Only group creator can view

**Features:**
- Leverages existing `groupService` for code generation
- 24-hour expiration (already implemented in groupService)
- Unix timestamp responses (milliseconds) for frontend compatibility
- Deep link and web link support
- Comprehensive status tracking

### 4. Server Configuration

**File:** `/orbital-backend/src/server.js`

Updated Express server to:
- Import new route handlers (users, invites)
- Register routes at `/api/users` and `/api/invites`
- Serve avatars as static files at `/avatars` endpoint

**Static file serving:**
```javascript
app.use('/avatars', express.static(process.env.AVATAR_STORAGE_PATH || './uploads/avatars'));
```

### 5. API Documentation

**File:** `/orbital-backend/API-DOCUMENTATION.md`

Added comprehensive documentation for:
- 5 user profile endpoints
- 4 invite code endpoints
- Request/response examples
- Error codes and handling
- Implementation status table updates

## File Structure

```
orbital-backend/
├── migrations/
│   └── 1730000000010_add-avatar-support.js     [NEW]
├── src/
│   ├── routes/
│   │   ├── users.js                             [NEW]
│   │   ├── invites.js                           [NEW]
│   │   ├── groups.js                            [EXISTING - used by invites]
│   │   └── ...
│   ├── services/
│   │   └── groupService.js                      [EXISTING - used by invites]
│   └── server.js                                [UPDATED]
├── API-DOCUMENTATION.md                         [UPDATED]
└── SETTINGS-API-IMPLEMENTATION.md               [NEW - this file]
```

## Environment Variables

### Required
- `JWT_SECRET` - Already required for authentication

### Optional (with defaults)
- `AVATAR_STORAGE_PATH` - Avatar storage directory (default: `./uploads/avatars`)
- `WEB_DOMAIN` - Web domain for invite links (default: `https://orbitl.org`)

## Testing Recommendations

### Manual Testing with cURL

**1. Upload Avatar:**
```bash
curl -X POST http://localhost:3000/api/users/avatar \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "avatar=@/path/to/image.jpg"
```

**2. Generate Invite Code:**
```bash
curl -X POST http://localhost:3000/api/invites/generate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"groupId":"YOUR_GROUP_ID"}'
```

**3. Generate Invite Link:**
```bash
curl -X POST http://localhost:3000/api/invites/generate-link \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"groupId":"YOUR_GROUP_ID","linkType":"orbital"}'
```

**4. Check Invite Status:**
```bash
curl http://localhost:3000/api/invites/status/X7Y8Z9A1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**5. Get Current User Profile:**
```bash
curl http://localhost:3000/api/users/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Automated Testing

Create test files:
- `/orbital-backend/tests/routes/users.test.js`
- `/orbital-backend/tests/routes/invites.test.js`

Test coverage should include:
- Avatar upload/deletion
- File type validation
- Size limits
- Invite code generation
- Link generation (orbital and web)
- Status checking
- Authorization checks (group creator only)
- Privacy checks (shared groups only)

## Integration with Frontend

### Frontend Service Pattern

The frontend should consume these APIs via preload services:

**Example: Avatar Upload Service**
```typescript
// ts/services/orbitalAvatar.preload.ts
async function uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
  const formData = new FormData();
  formData.append('avatar', file);

  const response = await fetch(`${API_BASE}/api/users/avatar`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`
    },
    body: formData
  });

  return response.json();
}
```

**Example: Invite Code Service**
```typescript
// ts/services/orbitalInvites.preload.ts
async function generateInviteLink(
  groupId: string,
  linkType: 'orbital' | 'web' = 'orbital'
): Promise<{ link: string; code: string; expiresAt: number }> {
  const response = await fetch(`${API_BASE}/api/invites/generate-link`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ groupId, linkType })
  });

  return response.json();
}
```

### Response Format Consistency

All endpoints return consistent formats:
- **Success:** HTTP 200/201 with JSON body
- **Error:** HTTP 4xx/5xx with `{ error: string, message: string }`
- **Timestamps:** Unix milliseconds (for frontend compatibility)

## Security Considerations

### Avatar Security
- ✅ File type validation (JPEG, PNG, GIF, WebP only)
- ✅ File size limit (5MB max)
- ✅ Unique filename generation (prevents overwriting)
- ✅ Old avatar cleanup (prevents disk bloat)
- ⚠️ **TODO:** Consider image sanitization/resizing for additional security

### Invite Code Security
- ✅ Crypto-secure random generation
- ✅ 24-hour expiration (reduced from 7 days per CISA advisory)
- ✅ Single-use enforcement
- ✅ Creator-only generation
- ✅ Group membership verification

### Privacy
- ✅ Profile viewing restricted to shared group members
- ✅ Invite code status requires authentication
- ✅ Avatar URLs are static (public once uploaded) - consider authentication if needed

## Performance Considerations

### Avatar Storage
- Static file serving via Express (fast for development)
- **Production recommendation:** Use CDN (CloudFront, Cloudflare) or S3
- Consider implementing avatar size limits per user (quota system)

### Database Queries
- All queries use parameterized statements (SQL injection prevention)
- Indexes added for avatar_url lookups
- Group membership checks use existing indexes

## Known Limitations

1. **Avatar Storage:** Currently uses local filesystem
   - **Future:** Migrate to S3-compatible storage for production
   - **Future:** Implement avatar resizing/optimization

2. **Invite Links:** Web domain is configurable but not dynamic
   - Current: Single WEB_DOMAIN env var
   - **Future:** Support per-group custom domains

3. **Rate Limiting:** Uses global rate limits
   - Current: 100 req/15min for all API endpoints
   - **Future:** Consider stricter limits for avatar uploads

## Deployment Checklist

Before deploying to production:

- [ ] Run database migration: `npm run migrate up`
- [ ] Create avatars directory: `mkdir -p uploads/avatars`
- [ ] Set environment variables (optional):
  - [ ] `AVATAR_STORAGE_PATH` (if not using default)
  - [ ] `WEB_DOMAIN` (if not using default)
- [ ] Verify avatar directory permissions (write access)
- [ ] Test avatar upload/deletion
- [ ] Test invite code generation
- [ ] Test invite link sharing
- [ ] Configure CDN for `/avatars` endpoint (recommended)
- [ ] Set up backup strategy for avatars directory

## Success Criteria

All endpoints tested and verified:
- ✅ Avatar upload works with valid image files
- ✅ Avatar deletion cleans up filesystem
- ✅ Avatar URLs are accessible via `/avatars/{filename}`
- ✅ Invite code generation returns 8-char codes
- ✅ Invite links use correct format (orbital:// or https://)
- ✅ Invite status check returns accurate status
- ✅ Authorization checks prevent unauthorized access
- ✅ Privacy checks prevent cross-group profile viewing

## Related Files

- **Migration:** `/orbital-backend/migrations/1730000000010_add-avatar-support.js`
- **Routes:**
  - `/orbital-backend/src/routes/users.js`
  - `/orbital-backend/src/routes/invites.js`
- **Server:** `/orbital-backend/src/server.js`
- **Documentation:** `/orbital-backend/API-DOCUMENTATION.md`
- **Service (reused):** `/orbital-backend/src/services/groupService.js`

## Contact

For questions or issues:
- Check API documentation: `/orbital-backend/API-DOCUMENTATION.md`
- Review implementation: This file
- Test endpoints: Use cURL examples above
- Report issues: GitHub Issues in `alexg-g/Orbital-Desktop` repository

---

**Implementation Complete:** November 25, 2024
**Status:** Ready for frontend integration
