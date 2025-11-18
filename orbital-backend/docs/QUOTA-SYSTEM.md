# Orbital Storage Quota System

## Overview

The Orbital backend implements a comprehensive storage quota system to manage group media storage and prevent abuse. Each group (orbit) has strict limits on both storage size and file count.

## Quota Limits

Per group/orbit:
- **Maximum Storage:** 10GB (10,737,418,240 bytes)
- **Maximum Files:** 100 media files
- **Warning Threshold:** 80% of either limit

## Architecture

### Database Schema

```sql
CREATE TABLE group_quotas (
  group_id UUID PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
  total_bytes BIGINT DEFAULT 0,
  media_count INTEGER DEFAULT 0,
  max_bytes BIGINT DEFAULT 10737418240,
  max_media_count INTEGER DEFAULT 100,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Quota Service

The quota service (`/src/services/quotaService.js`) provides centralized quota management with the following functions:

#### `checkQuotaAvailable(groupId, fileSize, client?)`

Checks if a group has quota available for a file upload.

**Parameters:**
- `groupId` (string): UUID of the group
- `fileSize` (number): Size of file in bytes
- `client` (optional): Database client for transactions

**Returns:**
```javascript
{
  allowed: boolean,
  currentUsage: {
    storage_bytes: number,
    max_bytes: number,
    file_count: number,
    max_files: number,
    storage_percent: number,
    files_percent: number,
    is_warning?: boolean  // Present only when allowed=true
  },
  reason?: string  // Present only when allowed=false
}
```

**Example:**
```javascript
const quotaCheck = await quotaService.checkQuotaAvailable(groupId, 5242880);

if (!quotaCheck.allowed) {
  throw new Error(quotaCheck.reason);
}
```

#### `getQuotaInfo(groupId)`

Retrieves current quota usage and limits for a group.

**Returns:**
```javascript
{
  group_id: string,
  storage: {
    used: number,
    limit: number,
    percentage: number,
    warning: boolean
  },
  files: {
    count: number,
    limit: number,
    percentage: number,
    warning: boolean
  },
  last_updated: string
}
```

#### `incrementQuota(groupId, fileSize, client?)`

Increments quota after successful upload. Should be called within a database transaction.

#### `decrementQuota(groupId, fileSize, client?)`

Decrements quota after file deletion/expiration. Should be called within a database transaction.

#### `initializeQuota(groupId, client?)`

Initializes quota for a new group. Called automatically when creating a group.

## API Endpoints

### GET /api/groups/:groupId/quota

Get current quota status for a group.

**Authentication:** Required

**Response:**
```json
{
  "group_id": "uuid",
  "total_bytes": 5368709120,
  "max_bytes": 10737418240,
  "media_count": 45,
  "max_media_count": 100,
  "usage_percent": 50,
  "warning_threshold": 80,
  "is_warning": false,
  "is_full": false
}
```

**HTTP Status Codes:**
- `200 OK` - Success
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not a member of the group
- `404 Not Found` - Group not found

### POST /api/media/upload

Upload media file (checks quota before accepting upload).

**Quota Enforcement:**
- Checked before file is processed
- Returns `413 Payload Too Large` if quota exceeded
- Atomically increments quota on success
- Rolls back quota if upload fails

**Error Response (Quota Exceeded):**
```json
{
  "error": "Storage quota exceeded. Available: 95.31MB, Required: 200.00MB. Delete old media to free up space."
}
```

### POST /api/media/upload/chunk

Upload media chunk (checks quota on first chunk only).

**Quota Enforcement:**
- Estimates total size based on chunk count
- Checks quota before accepting first chunk
- Final quota check on completion
- Prevents over-quota uploads

### POST /api/media/upload/complete

Complete chunked upload (final quota check).

**Quota Enforcement:**
- Verifies actual file size against quota
- Increments quota atomically
- Deletes file and returns error if quota exceeded

## Quota Enforcement Flow

### Upload Flow

```
1. User initiates upload
   ↓
2. Backend calls quotaService.checkQuotaAvailable()
   ↓
3a. If allowed=false → Return 413 error with reason
3b. If allowed=true → Continue
   ↓
4. Process file upload (save to disk)
   ↓
5. BEGIN TRANSACTION
   ↓
6. Create media record
   ↓
7. quotaService.incrementQuota()
   ↓
8. COMMIT TRANSACTION
   ↓
9. Return success
```

### Cleanup Flow (7-day expiration)

```
1. Cron job runs hourly
   ↓
2. Find expired media (expires_at < NOW())
   ↓
3. For each expired media:
   ↓
4. BEGIN TRANSACTION
   ↓
5. Delete file from disk
   ↓
6. quotaService.decrementQuota()
   ↓
7. Delete media record
   ↓
8. COMMIT TRANSACTION
```

## Warning System

When a group reaches 80% of either quota limit:

1. `is_warning` flag is set in `checkQuotaAvailable()` response
2. `warning` flag is set in quota info endpoint response
3. Client should display warning to users

**Warning Triggers:**
- Storage ≥ 8GB (80% of 10GB)
- File count ≥ 80 (80% of 100 files)

## Error Handling

### Quota Exceeded - Storage

```
HTTP 413 Payload Too Large

"Storage quota exceeded. Available: 95.31MB, Required: 200.00MB. Delete old media to free up space."
```

### Quota Exceeded - File Count

```
HTTP 413 Payload Too Large

"File count quota exceeded. Current: 100/100 files. Delete old media to add more."
```

### Race Conditions

The system handles concurrent uploads using database transactions:

1. Quota check happens outside transaction (advisory)
2. Final enforcement happens in transaction (authoritative)
3. `UPDATE group_quotas` with row-level locking prevents over-quota

**Example:**
```javascript
const client = await db.getClient();
try {
  await client.query('BEGIN');

  // Check quota (with transaction client)
  const quotaCheck = await quotaService.checkQuotaAvailable(groupId, fileSize, client);

  if (!quotaCheck.allowed) {
    throw new Error(quotaCheck.reason);
  }

  // Insert media record
  await client.query('INSERT INTO media ...');

  // Increment quota (atomic)
  await quotaService.incrementQuota(groupId, fileSize, client);

  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

## Testing

### Unit Tests

Located in `/tests/quota.unit.test.js`

**Coverage:**
- Quota checking (allowed/blocked scenarios)
- Warning thresholds (80%)
- Increment/decrement operations
- Edge cases (exact limits, very large files)
- Error handling
- Transaction support
- Invalid inputs

**Run tests:**
```bash
npm test -- tests/quota.unit.test.js
```

### Integration Tests

For full end-to-end testing with a real database, see `/tests/quota.test.js` (requires database setup).

## Monitoring & Debugging

### Check Quota Status

```sql
SELECT
  g.id,
  g.encrypted_name,
  q.total_bytes,
  q.max_bytes,
  q.media_count,
  q.max_media_count,
  ROUND((q.total_bytes::numeric / q.max_bytes) * 100, 2) as storage_percent,
  ROUND((q.media_count::numeric / q.max_media_count) * 100, 2) as files_percent
FROM groups g
JOIN group_quotas q ON q.group_id = g.id
ORDER BY storage_percent DESC;
```

### Find Groups Near Quota

```sql
SELECT
  g.id,
  q.total_bytes,
  q.media_count,
  ROUND((q.total_bytes::numeric / q.max_bytes) * 100, 2) as storage_percent
FROM groups g
JOIN group_quotas q ON q.group_id = g.id
WHERE
  (q.total_bytes::numeric / q.max_bytes) >= 0.8
  OR (q.media_count::numeric / q.max_media_count) >= 0.8
ORDER BY storage_percent DESC;
```

### Audit Quota Accuracy

```sql
-- Compare quota table with actual media sizes
SELECT
  g.id,
  q.total_bytes as quota_bytes,
  q.media_count as quota_count,
  COALESCE(SUM(m.size_bytes), 0) as actual_bytes,
  COALESCE(COUNT(m.id), 0) as actual_count,
  q.total_bytes - COALESCE(SUM(m.size_bytes), 0) as bytes_diff,
  q.media_count - COALESCE(COUNT(m.id), 0) as count_diff
FROM groups g
JOIN group_quotas q ON q.group_id = g.id
LEFT JOIN threads t ON t.group_id = g.id
LEFT JOIN media m ON m.thread_id = t.id AND m.expires_at > NOW()
GROUP BY g.id, q.total_bytes, q.media_count
HAVING q.total_bytes != COALESCE(SUM(m.size_bytes), 0)
    OR q.media_count != COALESCE(COUNT(m.id), 0);
```

## Performance Considerations

1. **Indexes:** The `group_quotas` table has an index on `group_id` for fast lookups
2. **Transactions:** All quota updates use transactions to prevent race conditions
3. **Caching:** Consider adding Redis cache for frequently accessed quota info
4. **Cleanup:** Hourly cleanup job prevents quota table from growing stale

## Security Considerations

1. **Authorization:** All quota endpoints verify group membership
2. **Input Validation:** File sizes are validated (positive numbers only)
3. **Rate Limiting:** Upload endpoints have rate limiting (100 req/15min)
4. **Atomic Updates:** PostgreSQL row-level locking prevents double-spending

## Future Enhancements

Potential improvements for future releases:

1. **Per-User Quotas:** Individual user quotas within a group
2. **Tiered Plans:** Different quota limits for different subscription levels
3. **Quota Notifications:** Email/push notifications at 80%, 90%, 100%
4. **Auto-Cleanup:** Automatically delete oldest files when quota exceeded
5. **Analytics:** Track quota usage trends over time
6. **Admin Override:** Allow admins to temporarily increase quotas
7. **Quota History:** Track quota changes for audit trail

## Troubleshooting

### Quota Stuck at Wrong Value

**Symptom:** Quota doesn't match actual media

**Solution:**
```sql
-- Recalculate and fix quota for a group
UPDATE group_quotas q
SET
  total_bytes = COALESCE(actual.total_bytes, 0),
  media_count = COALESCE(actual.media_count, 0),
  updated_at = NOW()
FROM (
  SELECT
    t.group_id,
    SUM(m.size_bytes) as total_bytes,
    COUNT(m.id) as media_count
  FROM media m
  JOIN threads t ON t.id = m.thread_id
  WHERE m.expires_at > NOW()
    AND t.group_id = 'GROUP_UUID_HERE'
  GROUP BY t.group_id
) actual
WHERE q.group_id = actual.group_id;
```

### Orphaned Quota Records

**Symptom:** Quota exists but group deleted

**Solution:**
```sql
-- Clean up orphaned quota records
DELETE FROM group_quotas
WHERE group_id NOT IN (SELECT id FROM groups);
```

This should never happen due to `ON DELETE CASCADE`, but can be used as a sanity check.

## References

- **API Specification:** `/planning-docs/api-specification.md`
- **Database Schema:** `/planning-docs/database-schema.md`
- **Product Requirements:** `/planning-docs/PRODUCT-REQUIREMENTS-DOCUMENT.md`
- **Source Code:** `/src/services/quotaService.js`
