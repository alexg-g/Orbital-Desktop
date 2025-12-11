# Media Sync Backend Testing

## Changes Made

### 1. New Endpoint: GET /api/media/sync/:groupId
**Location:** `/orbital-backend/src/routes/media.js` (line 730)

Returns all media metadata for a group (excluding attachment keys which are shared via Signal Protocol).

**Response Format:**
```json
{
  "media": [
    {
      "media_id": "uuid",
      "thread_id": "uuid",
      "content_type": "video/mp4",
      "size": 123456,
      "file_name": "video.mp4",
      "blur_hash": "LGF5...",
      "width": 1920,
      "height": 1080,
      "duration": 60000,
      "expires_at": "2024-11-01T00:00:00Z",
      "uploaded_by": "user-uuid",
      "created_at": "2024-10-25T00:00:00Z"
    }
  ]
}
```

### 2. Enhanced WebSocket Broadcasts
**Location:** `/orbital-backend/src/routes/threads.js`

Added helper function `formatMediaForBroadcast()` (line 22) that:
- Parses `encrypted_metadata` JSON
- Extracts display fields (contentType, fileName, blurHash, dimensions, etc.)
- Returns enriched media objects for WebSocket broadcasts

Updated broadcasts for:
- `new_thread` events (line 161)
- `new_reply` events (line 526)

### 3. Media in Thread Responses
**Location:** `/orbital-backend/src/routes/threads.js`

**GET /api/threads/:threadId** (line 341):
- Now includes `media` array with full metadata

**GET /api/groups/:groupId/threads** (line 254):
- Now includes `media_count` for each thread

### 4. Updated Schema
**Location:** `/orbital-backend/schema.sql`

Updated media table definition to reflect migration:
- Added `group_id UUID NOT NULL` (for quota tracking)
- Changed `thread_id` from `NOT NULL` to nullable (allows upload before thread creation)
- Added index on `group_id`

## Testing Steps

### Local Testing (requires running backend)

```bash
# 1. Start backend
cd orbital-backend
npm run dev

# 2. Test media sync endpoint
curl -X GET http://localhost:3000/api/media/sync/{groupId} \
  -H "Authorization: Bearer {token}"

# 3. Create thread with media
curl -X POST http://localhost:3000/api/threads \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "group_id": "{groupId}",
    "encrypted_title": "test",
    "encrypted_body": "test",
    "media_ids": ["{mediaId}"]
  }'

# 4. Get thread details (should include media)
curl -X GET http://localhost:3000/api/threads/{threadId} \
  -H "Authorization: Bearer {token}"

# 5. List threads in group (should include media_count)
curl -X GET http://localhost:3000/api/groups/{groupId}/threads \
  -H "Authorization: Bearer {token}"
```

## Integration with Frontend

The frontend should:

1. **On orbit join/login**: Call `GET /api/media/sync/:groupId` to get all media metadata
2. **Store metadata locally**: Save to `orbital_media` table in SQLCipher
3. **Listen for WebSocket events**:
   - `new_thread` with `media` array
   - `new_reply` with `media` array
4. **Update UI**: Display media previews using `blurHash` while downloading

## Security Notes

- ✅ Endpoint verifies user is group member
- ✅ Only returns metadata, NOT attachment keys
- ✅ Attachment keys shared via encrypted Signal Protocol messages
- ✅ Server never decrypts media content

## Files Modified

1. `/orbital-backend/src/routes/media.js` - Added sync endpoint
2. `/orbital-backend/src/routes/threads.js` - Enhanced broadcasts and responses
3. `/orbital-backend/schema.sql` - Updated media table definition
