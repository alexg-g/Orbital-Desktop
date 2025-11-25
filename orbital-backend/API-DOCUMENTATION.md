# Orbital Backend API Documentation

**Version:** 0.1.0
**Base URL:** `http://localhost:3000`
**Authentication:** JWT Bearer Token

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

Tokens are obtained via the `/api/auth/login` endpoint and expire after 30 days (configurable).

---

## Group API Endpoints

### 1. Create Group

Create a new group (orbit) with an invite code.

**Endpoint:** `POST /api/groups`
**Authentication:** Required
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "encrypted_name": "string (client-side encrypted)",
  "encrypted_group_key": "string (encrypted key for creator)"
}
```

**Response:** `201 Created`
```json
{
  "group_id": "uuid",
  "invite_code": "A3B7C9D2",
  "expires_at": "2024-11-14T12:00:00.000Z",
  "created_at": "2024-11-07T12:00:00.000Z"
}
```

**Errors:**
- `400` - Missing required fields
- `401` - Unauthorized

**Features:**
- 8-character alphanumeric invite code (crypto-secure random)
- 7-day expiration on invite codes
- Creator automatically becomes first member
- Group quota initialized (10GB / 100 files)

---

### 2. Join Group

Join an existing group using an invite code.

**Endpoint:** `POST /api/groups/join`
**Authentication:** Required
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "invite_code": "A3B7C9D2",
  "encrypted_group_key": "string (encrypted key for joining user)"
}
```

**Response:** `200 OK`
```json
{
  "group_id": "uuid",
  "encrypted_name": "string (encrypted)",
  "member_count": 5,
  "joined_at": "2024-11-07T12:00:00.000Z"
}
```

**Errors:**
- `400` - Missing required fields
- `400` - `This invite code has already been used`
- `400` - `This invite code has expired`
- `400` - `Group has reached maximum capacity of 10 members`
- `401` - Unauthorized
- `404` - Invalid invite code
- `409` - Already a member of this group

**Features:**
- Single-use invite codes
- 7-day expiration validation
- Max 10 members enforcement
- Case-insensitive code matching

---

### 3. Generate New Invite Code

Generate a new invite code for an existing group. Only the group creator can generate new codes.

**Endpoint:** `POST /api/groups/:groupId/invite-codes`
**Authentication:** Required

**Response:** `201 Created`
```json
{
  "invite_code": "X7Y8Z9A1",
  "expires_at": "2024-11-14T12:00:00.000Z",
  "created_at": "2024-11-07T12:00:00.000Z"
}
```

**Errors:**
- `401` - Unauthorized
- `403` - Only group creator can generate new invite codes
- `404` - Group not found

**Features:**
- New 8-character crypto-secure code
- 7-day expiration from creation
- Previous unused codes remain valid

---

### 4. Get Active Invite Codes

Get all active (unused, unexpired) invite codes for a group. Only the group creator can view codes.

**Endpoint:** `GET /api/groups/:groupId/invite-codes`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "invite_codes": [
    {
      "id": "uuid",
      "code": "X7Y8Z9A1",
      "created_at": "2024-11-07T12:00:00.000Z",
      "expires_at": "2024-11-14T12:00:00.000Z"
    }
  ]
}
```

**Errors:**
- `401` - Unauthorized
- `403` - Only group creator can view invite codes
- `404` - Group not found

---

### 5. List User's Groups

Get all groups the user is a member of.

**Endpoint:** `GET /api/groups`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "groups": [
    {
      "group_id": "uuid",
      "encrypted_name": "string (encrypted)",
      "encrypted_group_key": "string (encrypted)",
      "member_count": 5,
      "max_members": 10,
      "is_creator": true,
      "active_invite_code": "A3B7C9D2",
      "joined_at": "2024-11-07T12:00:00.000Z"
    }
  ]
}
```

**Errors:**
- `401` - Unauthorized

**Features:**
- Returns all groups user is member of
- Includes member count and max members
- Indicates if user is creator
- Shows active invite code (for creators)

---

### 6. List Group Members

Get all members of a group.

**Endpoint:** `GET /api/groups/:groupId/members`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "members": [
    {
      "user_id": "uuid",
      "username": "string",
      "public_key": {},
      "joined_at": "2024-11-07T12:00:00.000Z"
    }
  ]
}
```

**Errors:**
- `401` - Unauthorized
- `403` - Not a member of this group

---

### 7. Get Group Quota

Get storage quota status for a group.

**Endpoint:** `GET /api/groups/:groupId/quota`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "group_id": "uuid",
  "storage": {
    "used": 5368709120,
    "limit": 10737418240,
    "percentage": 50.0,
    "warning": false
  },
  "files": {
    "count": 45,
    "limit": 100,
    "percentage": 45.0,
    "warning": false
  },
  "last_updated": "2024-11-07T12:00:00.000Z"
}
```

**Errors:**
- `401` - Unauthorized
- `403` - Not a member of this group

**Features:**
- Storage quota: 10GB per group
- File count quota: 100 files per group
- Warning flag at 80% threshold

---

### 8. Remove Group Member

Remove a member from a group. Only the group creator can remove members.

**Endpoint:** `DELETE /api/groups/:groupId/members/:userId`
**Authentication:** Required

**Response:** `204 No Content`

**Errors:**
- `400` - Cannot remove group creator
- `401` - Unauthorized
- `403` - Only group creator can remove members
- `404` - Group not found
- `404` - Member not found in group

---

## User Profile API Endpoints

### 1. Upload Avatar

Upload a new avatar image for the current user. Replaces any existing avatar.

**Endpoint:** `POST /api/users/avatar`
**Authentication:** Required
**Content-Type:** `multipart/form-data`

**Form Data:**
- `avatar` - Image file (JPEG, PNG, GIF, or WebP, max 5MB)

**Response:** `200 OK`
```json
{
  "avatarUrl": "/avatars/user-id-timestamp.jpg",
  "message": "Avatar uploaded successfully"
}
```

**Errors:**
- `400` - No avatar file uploaded
- `400` - Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.
- `401` - Unauthorized
- `404` - User not found

**Features:**
- Max 5MB file size
- Supports JPEG, PNG, GIF, WebP
- Automatic cleanup of previous avatar
- Unique filename generation (userId-timestamp.ext)

---

### 2. Remove Avatar

Remove the current user's avatar.

**Endpoint:** `DELETE /api/users/avatar`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Avatar removed successfully"
}
```

**Errors:**
- `401` - Unauthorized
- `404` - User not found

**Features:**
- Removes avatar_url from database
- Deletes avatar file from filesystem
- Idempotent (returns success if no avatar exists)

---

### 3. Get User Avatar

Get the avatar URL for a specific user.

**Endpoint:** `GET /api/users/:userId/avatar`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "avatarUrl": "/avatars/user-id-timestamp.jpg"
}
```

**Errors:**
- `401` - Unauthorized
- `404` - User not found

**Features:**
- Returns null if user has no avatar
- Avatar URL can be used directly in <img> tags

---

### 4. Get Current User Profile

Get the current user's profile information.

**Endpoint:** `GET /api/users/me`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "username": "alice",
  "avatarUrl": "/avatars/user-id-timestamp.jpg",
  "createdAt": "2024-11-07T12:00:00.000Z"
}
```

**Errors:**
- `401` - Unauthorized
- `404` - User not found

---

### 5. Get User Profile

Get another user's public profile information. Only accessible to users in the same groups.

**Endpoint:** `GET /api/users/:userId`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "username": "bob",
  "avatarUrl": "/avatars/user-id-timestamp.jpg"
}
```

**Errors:**
- `401` - Unauthorized
- `403` - Cannot view profile of users not in your groups
- `404` - User not found

**Features:**
- Privacy: Only users in shared groups can view profiles
- Returns limited public information (no email, password, etc.)

---

## Invite Code API Endpoints

### 1. Generate Invite Code

Generate a new invite code for a group. Only group creator can generate codes.

**Endpoint:** `POST /api/invites/generate`
**Authentication:** Required
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "groupId": "uuid"
}
```

**Response:** `201 Created`
```json
{
  "code": "X7Y8Z9A1",
  "expiresAt": 1699977600000,
  "createdAt": 1699372800000
}
```

**Errors:**
- `400` - Missing required field: groupId
- `401` - Unauthorized
- `403` - Only group creator can generate invite codes
- `404` - Group not found

**Features:**
- Returns Unix timestamps in milliseconds (not ISO strings)
- 8-character alphanumeric code
- 24-hour expiration
- Crypto-secure random generation

---

### 2. Generate Invite Link

Generate a shareable invite link for a group. Only group creator can generate links.

**Endpoint:** `POST /api/invites/generate-link`
**Authentication:** Required
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "groupId": "uuid",
  "linkType": "orbital"
}
```

**Parameters:**
- `groupId` - Group UUID (required)
- `linkType` - Either "orbital" or "web" (optional, defaults to "orbital")
  - `orbital` - Deep link format: `orbital://invite/{code}`
  - `web` - Web URL format: `https://orbitl.org/invite/{code}`

**Response:** `201 Created`
```json
{
  "link": "orbital://invite/X7Y8Z9A1",
  "code": "X7Y8Z9A1",
  "expiresAt": 1699977600000,
  "createdAt": 1699372800000
}
```

**Errors:**
- `400` - Missing required field: groupId
- `400` - linkType must be either "orbital" or "web"
- `401` - Unauthorized
- `403` - Only group creator can generate invite links
- `404` - Group not found

**Features:**
- Deep link support for Orbital app
- Web link support for browser/sharing
- Web domain configurable via WEB_DOMAIN env var
- Returns Unix timestamps in milliseconds

---

### 3. Check Invite Code Status

Check the status of an invite code. Anyone can check status.

**Endpoint:** `GET /api/invites/status/:code`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "status": "pending",
  "createdAt": 1699372800000,
  "expiresAt": 1699977600000,
  "usedAt": null,
  "usedBy": null
}
```

**Status Values:**
- `pending` - Code is valid and not yet used
- `accepted` - Code has been used
- `expired` - Code has expired (past 24 hours)

**Errors:**
- `400` - Invalid invite code format
- `401` - Unauthorized
- `404` - Invite code not found

**Features:**
- Returns detailed status information
- Includes usage information if code was accepted
- Returns Unix timestamps in milliseconds

---

### 4. Get Group Invite Codes

Get all active invite codes for a group. Only group creator can view codes.

**Endpoint:** `GET /api/invites/group/:groupId`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "inviteCodes": [
    {
      "id": "uuid",
      "code": "X7Y8Z9A1",
      "createdAt": 1699372800000,
      "expiresAt": 1699977600000,
      "status": "pending"
    }
  ]
}
```

**Errors:**
- `401` - Unauthorized
- `403` - Only group creator can view invite codes
- `404` - Group not found

**Features:**
- Returns only active (unused, unexpired) codes
- Returns Unix timestamps in milliseconds
- All codes in response have status "pending"

---

## Thread API Endpoints

### 1. Create Thread

Create a new discussion thread within a group.

**Endpoint:** `POST /api/threads`
**Authentication:** Required
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "group_id": "uuid",
  "encrypted_title": "string (encrypted)",
  "encrypted_body": "string (encrypted)",
  "root_message_id": "uuid (optional - links to Signal message)"
}
```

**Response:** `201 Created`
```json
{
  "thread_id": "uuid",
  "group_id": "uuid",
  "created_at": "2024-11-07T12:00:00.000Z"
}
```

**Errors:**
- `400` - Missing required fields
- `401` - Unauthorized (no/invalid token)
- `403` - Not a member of the group
- `404` - Group not found

**Features:**
- ✅ Validates required fields (group_id, encrypted_title, encrypted_body)
- ✅ Verifies user is member of group
- ✅ Optional Signal message linkage via root_message_id
- ✅ Logs thread creation events

---

### 2. List Threads in Group

Get paginated list of threads in a group.

**Endpoint:** `GET /api/groups/:groupId/threads`
**Authentication:** Required

**Query Parameters:**
- `limit` (optional, default: 50, max: 100) - Number of threads per page
- `offset` (optional, default: 0) - Pagination offset
- `sort` (optional, default: "created_desc") - Sort order: "created_asc" or "created_desc"

**Response:** `200 OK`
```json
{
  "threads": [
    {
      "thread_id": "uuid",
      "group_id": "uuid",
      "author_id": "uuid",
      "author_username": "string",
      "encrypted_title": "string (encrypted)",
      "encrypted_body": "string (encrypted)",
      "reply_count": 42,
      "created_at": "2024-11-07T12:00:00.000Z"
    }
  ],
  "total_count": 100,
  "has_more": true
}
```

**Errors:**
- `401` - Unauthorized
- `403` - Not a member of the group
- `404` - Group not found

**Features:**
- ✅ Pagination with configurable limit/offset
- ✅ Max 100 items per page (prevents abuse)
- ✅ Includes reply count for each thread
- ✅ Returns author username from JOIN
- ✅ Sort by creation time (ascending/descending)
- ✅ Returns total count and has_more flag

---

### 3. Get Single Thread

Retrieve details for a specific thread.

**Endpoint:** `GET /api/threads/:threadId`
**Authentication:** Required

**Response:** `200 OK`
```json
{
  "thread_id": "uuid",
  "group_id": "uuid",
  "author_id": "uuid",
  "author_username": "string",
  "encrypted_title": "string (encrypted)",
  "encrypted_body": "string (encrypted)",
  "reply_count": 42,
  "created_at": "2024-11-07T12:00:00.000Z"
}
```

**Errors:**
- `401` - Unauthorized
- `403` - Not a member of the group containing this thread
- `404` - Thread not found

**Features:**
- ✅ Membership verification (via thread's group_id)
- ✅ Includes reply count
- ✅ Returns author information

---

### 4. Get Thread Replies

Retrieve paginated replies to a thread.

**Endpoint:** `GET /api/threads/:threadId/replies`
**Authentication:** Required

**Query Parameters:**
- `limit` (optional, default: 50, max: 100) - Number of replies per page
- `offset` (optional, default: 0) - Pagination offset

**Response:** `200 OK`
```json
{
  "replies": [
    {
      "reply_id": "uuid",
      "thread_id": "uuid",
      "author_id": "uuid",
      "author_username": "string",
      "encrypted_body": "string (encrypted)",
      "created_at": "2024-11-07T12:00:00.000Z"
    }
  ],
  "total_count": 42,
  "has_more": false
}
```

**Errors:**
- `401` - Unauthorized
- `403` - Not a member of the group
- `404` - Thread not found

**Features:**
- ✅ Pagination (limit/offset)
- ✅ Replies sorted by creation time (chronological)
- ✅ Membership verification
- ✅ Total count and has_more pagination indicators

---

### 5. Create Reply

Post a reply to an existing thread.

**Endpoint:** `POST /api/threads/:threadId/replies`
**Authentication:** Required
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "encrypted_body": "string (encrypted)",
  "message_id": "uuid (optional - links to Signal message)"
}
```

**Response:** `201 Created`
```json
{
  "reply_id": "uuid",
  "thread_id": "uuid",
  "created_at": "2024-11-07T12:00:00.000Z"
}
```

**Errors:**
- `400` - Missing required field (encrypted_body)
- `401` - Unauthorized
- `403` - Not a member of the group
- `404` - Thread not found

**Features:**
- ✅ Validates encrypted_body required
- ✅ Optional Signal message linkage via message_id
- ✅ Membership verification
- ✅ Logs reply creation events

---

## Data Model

### Thread-to-Signal-Message Mapping

Threads can optionally link to Signal protocol messages:

- **Thread Creation:** `root_message_id` links thread to originating Signal message
- **Reply Creation:** `message_id` links reply to specific Signal message

This enables hybrid architecture where:
- Signal Protocol handles E2EE message transport
- Orbital server organizes messages into threaded discussions
- Client can map threads/replies back to Signal conversations

### Encryption

All content is encrypted **client-side** using Signal Protocol:
- `encrypted_title` - Thread title (encrypted with group's Sender Key)
- `encrypted_body` - Thread/reply body (encrypted with group's Sender Key)
- Server **never sees plaintext** - zero-knowledge architecture

### Pagination

All list endpoints support pagination:
- `limit` - Items per page (default: 50, max: 100)
- `offset` - Skip N items (for page 2: offset = limit)
- Response includes `total_count` and `has_more` for client UX

**Example Pagination:**
```
Page 1: ?limit=50&offset=0   (items 1-50)
Page 2: ?limit=50&offset=50  (items 51-100)
Page 3: ?limit=50&offset=100 (items 101-150)
```

---

## Security Features

### Authentication
- ✅ JWT-based authentication
- ✅ 30-day token expiration
- ✅ Automatic token validation on protected routes
- ✅ Secure token generation with `jsonwebtoken`

### Authorization
- ✅ Group membership verification on all operations
- ✅ Users can only access threads in groups they belong to
- ✅ Users can only create threads/replies in their groups

### Input Validation
- ✅ Required field validation
- ✅ Type validation (UUIDs, strings)
- ✅ Pagination limits enforced (max 100 items)
- ✅ SQL injection prevention (parameterized queries)

### Rate Limiting
- ✅ API-wide: 100 requests per 15 minutes per IP
- ✅ Auth endpoints: 10 requests per 15 minutes per IP

### Error Handling
- ✅ Consistent JSON error format
- ✅ Appropriate HTTP status codes
- ✅ Error logging (Winston)
- ✅ Stack traces in development only

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| **Group Management** | | |
| POST /api/groups | ✅ Complete | Create group with invite code |
| POST /api/groups/join | ✅ Complete | Join group via single-use invite code |
| POST /api/groups/:groupId/invite-codes | ✅ Complete | Regenerate invite code (creator only) |
| GET /api/groups/:groupId/invite-codes | ✅ Complete | View active invite codes |
| GET /api/groups | ✅ Complete | List user's groups |
| GET /api/groups/:groupId/members | ✅ Complete | List group members |
| GET /api/groups/:groupId/quota | ✅ Complete | Get storage quota status |
| DELETE /api/groups/:groupId/members/:userId | ✅ Complete | Remove member (creator only) |
| **User Profile Management** | | |
| POST /api/users/avatar | ✅ Complete | Upload avatar (5MB max, image files) |
| DELETE /api/users/avatar | ✅ Complete | Remove avatar |
| GET /api/users/:userId/avatar | ✅ Complete | Get user's avatar URL |
| GET /api/users/me | ✅ Complete | Get current user profile |
| GET /api/users/:userId | ✅ Complete | Get user profile (shared groups only) |
| **Invite Code API** | | |
| POST /api/invites/generate | ✅ Complete | Generate invite code |
| POST /api/invites/generate-link | ✅ Complete | Generate shareable invite link |
| GET /api/invites/status/:code | ✅ Complete | Check invite code status |
| GET /api/invites/group/:groupId | ✅ Complete | Get group's invite codes |
| **Invite Code System** | | |
| 8-char alphanumeric codes | ✅ Complete | Crypto-secure random generation |
| Single-use enforcement | ✅ Complete | Code marked as used on join |
| 24-hour expiration | ✅ Complete | Reduced from 7 days for security |
| Max 10 members limit | ✅ Complete | Enforced on join |
| Deep link support | ✅ Complete | orbital://invite/{code} format |
| Web link support | ✅ Complete | Configurable web domain |
| **Thread Management** | | |
| POST /api/threads | ✅ Complete | Create thread with Signal message linking |
| GET /api/groups/:groupId/threads | ✅ Complete | Paginated thread listing |
| GET /api/threads/:threadId | ✅ Complete | Single thread details |
| GET /api/threads/:threadId/replies | ✅ Complete | Paginated reply listing |
| POST /api/threads/:threadId/replies | ✅ Complete | Reply creation |
| **Infrastructure** | | |
| Authentication | ✅ Complete | JWT with 30-day expiration |
| Authorization | ✅ Complete | Group membership checks |
| Input Validation | ✅ Complete | Required fields validated |
| Pagination | ✅ Complete | limit/offset with max 100 |
| Error Handling | ✅ Complete | Consistent JSON responses |
| Rate Limiting | ✅ Complete | 100 req/15min (API), 10 req/15min (auth) |
| Logging | ✅ Complete | Winston logger with request tracking |
| Avatar Storage | ✅ Complete | Static file serving at /avatars |
| API Tests - Groups | ✅ Complete | 29 passing tests |
| API Tests - Quotas | ✅ Complete | Comprehensive quota tests |
| API Documentation | ✅ Complete | This file |

---

## Future Enhancements

### WebSocket Real-Time Updates
Currently, thread/reply creation has TODOs for WebSocket broadcasting:
```javascript
// TODO: Broadcast to WebSocket clients in group
```

**Planned:** Real-time thread/reply notifications via WebSocket

### Search
Not yet implemented:
- Full-text search across threads (encrypted, so limited)
- Thread filtering by author
- Date range filtering

### Media Attachments
Media endpoint exists (`/api/media`) but not yet integrated with threads:
- Attach images/videos to threads
- Attach media to replies
- 7-day server retention, permanent client storage

---

## Error Response Format

All errors return consistent JSON:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {
    "additional": "context (optional)"
  },
  "stack": "Stack trace (development only)"
}
```

### Common Error Codes

- `UNAUTHORIZED` (401) - Missing or invalid authentication
- `FORBIDDEN` (403) - Authenticated but lacks permission
- `NOT_FOUND` (404) - Resource not found
- `VALIDATION_ERROR` (400) - Invalid input
- `DUPLICATE_ENTRY` (409) - Resource already exists
- `TOO_MANY_REQUESTS` (429) - Rate limit exceeded
- `INTERNAL_ERROR` (500) - Server error

---

## Testing the API

### Manual Testing with curl

**1. Login to get JWT token:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}'
```

**2. Create a thread:**
```bash
curl -X POST http://localhost:3000/api/threads \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "group_id":"GROUP_UUID",
    "encrypted_title":"ENCRYPTED_TITLE",
    "encrypted_body":"ENCRYPTED_BODY"
  }'
```

**3. List threads:**
```bash
curl http://localhost:3000/api/groups/GROUP_UUID/threads?limit=10&offset=0 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**4. Get thread details:**
```bash
curl http://localhost:3000/api/threads/THREAD_UUID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**5. Create reply:**
```bash
curl -X POST http://localhost:3000/api/threads/THREAD_UUID/replies \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"encrypted_body":"ENCRYPTED_REPLY"}'
```

**6. Get replies:**
```bash
curl http://localhost:3000/api/threads/THREAD_UUID/replies?limit=50 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Automated Testing (Pending)

Jest + Supertest tests should cover:
- ✅ Authentication flows
- ✅ Thread CRUD operations
- ✅ Reply CRUD operations
- ✅ Pagination edge cases
- ✅ Authorization checks (non-members blocked)
- ✅ Input validation
- ✅ Error responses

**To implement:** Create `src/__tests__/threads.test.js`

---

## Database Schema Reference

### threads table
```sql
id              UUID PRIMARY KEY
group_id        UUID REFERENCES groups(id)
root_message_id UUID REFERENCES signal_messages(id) (optional)
author_id       UUID REFERENCES users(id)
encrypted_title TEXT
encrypted_body  TEXT
created_at      TIMESTAMPTZ
```

### replies table
```sql
id            UUID PRIMARY KEY
thread_id     UUID REFERENCES threads(id)
message_id    UUID REFERENCES signal_messages(id) (optional)
author_id     UUID REFERENCES users(id)
encrypted_body TEXT
created_at    TIMESTAMPTZ
```

---

## Related Documentation

- [Database Migrations](./migrations/README.md) - Migration system documentation
- [Backend README](./README.md) - General backend setup
- [WebSocket Protocol](./src/websocket/signalWebSocket.js) - Real-time features

---

**Last Updated:** November 20, 2024
**Maintained By:** Orbital Team
