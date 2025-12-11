#!/bin/bash
# Orbital Production Reset Script
# Clears all Orbital data from the production PostgreSQL database
#
# Usage: Run this on the production droplet via SSH
#   ssh root@api.orbitl.org 'bash -s' < scripts/orbital-reset-production.sh
#
# Or copy to server and run:
#   scp scripts/orbital-reset-production.sh root@api.orbitl.org:/tmp/
#   ssh root@api.orbitl.org 'bash /tmp/orbital-reset-production.sh'

set -e

echo "=========================================="
echo "  Orbital Production Reset Script"
echo "=========================================="
echo ""
echo "WARNING: This will DELETE ALL DATA from production!"
echo ""

# Check if running on the production server
if [ ! -f /root/orbital-backend/.env ]; then
    echo "ERROR: This script must be run on the production server"
    echo "       Could not find /root/orbital-backend/.env"
    exit 1
fi

# Load production database credentials from .env
source /root/orbital-backend/.env

# Extract database connection info
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_NAME="${DATABASE_NAME:-orbital}"
DB_USER="${DATABASE_USER:-orbital_user}"

echo "Database: $DB_NAME on $DB_HOST:$DB_PORT"
echo ""

# Confirm before proceeding
read -p "Are you sure you want to delete ALL production data? (type 'yes' to confirm): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "Step 1: Stopping backend service..."
pm2 stop orbital-backend 2>/dev/null || systemctl stop orbital-backend 2>/dev/null || echo "Service not running via pm2/systemd"

echo ""
echo "Step 2: Clearing PostgreSQL Orbital tables..."
PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
-- Clear orbital-specific data in correct order (child tables first, foreign key dependencies)
TRUNCATE TABLE media_sync_items CASCADE;
TRUNCATE TABLE media_sync_requests CASCADE;
TRUNCATE TABLE media_downloads CASCADE;
TRUNCATE TABLE media CASCADE;
TRUNCATE TABLE temp_uploads CASCADE;
TRUNCATE TABLE replies CASCADE;
TRUNCATE TABLE threads CASCADE;
TRUNCATE TABLE signal_messages CASCADE;
TRUNCATE TABLE invite_codes CASCADE;
TRUNCATE TABLE members CASCADE;
TRUNCATE TABLE group_quotas CASCADE;
TRUNCATE TABLE groups CASCADE;
-- Keep users table - preserve registered accounts
" 2>/dev/null || echo "Some tables may not exist yet"

echo "PostgreSQL tables cleared."

# Verify PostgreSQL state
echo ""
echo "PostgreSQL verification:"
PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 'groups' as table_name, COUNT(*) as count FROM groups
UNION ALL SELECT 'members', COUNT(*) FROM members
UNION ALL SELECT 'threads', COUNT(*) FROM threads
UNION ALL SELECT 'replies', COUNT(*) FROM replies;
"

echo ""
echo "Step 3: Restarting backend service..."
pm2 start orbital-backend 2>/dev/null || systemctl start orbital-backend 2>/dev/null || echo "Please restart the backend manually"

echo ""
echo "=========================================="
echo "  Production Reset Complete!"
echo "=========================================="
echo ""
echo "Users preserved. All groups, threads, and media cleared."
echo ""
