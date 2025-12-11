#!/bin/bash
# Orbital Test Reset Script
# Clears all Orbital data from both PostgreSQL and SQLCipher for clean testing

set -e

echo "=========================================="
echo "  Orbital Test Reset Script"
echo "=========================================="

# Configuration
POSTGRES_URL="postgresql://orbital_user:orbital_dev_password@localhost:5432/orbital"
SIGNAL_DEV_DIR="$HOME/Library/Application Support/Signal-development"
PSQL="/opt/homebrew/opt/postgresql@15/bin/psql"

# Check if psql exists
if [ ! -f "$PSQL" ]; then
    echo "ERROR: PostgreSQL not found at $PSQL"
    echo "Try: brew install postgresql@15"
    exit 1
fi

echo ""
echo "Step 1: Stopping Electron app..."
pkill -9 -f "Electron" 2>/dev/null || true
sleep 2

echo ""
echo "Step 2: Clearing PostgreSQL Orbital tables..."
$PSQL "$POSTGRES_URL" -c "
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
-- Keep users table - preserve test user credentials
" 2>/dev/null || echo "Some tables may not exist yet"

echo "PostgreSQL tables cleared."

# Verify PostgreSQL state
echo ""
echo "PostgreSQL verification:"
$PSQL "$POSTGRES_URL" -c "
SELECT 'groups' as table_name, COUNT(*) as count FROM groups
UNION ALL SELECT 'members', COUNT(*) FROM members
UNION ALL SELECT 'threads', COUNT(*) FROM threads
UNION ALL SELECT 'replies', COUNT(*) FROM replies;
"

echo ""
echo "Step 3: Clearing SQLCipher Signal-development folder..."
if [ -d "$SIGNAL_DEV_DIR" ]; then
    rm -rf "$SIGNAL_DEV_DIR"
    echo "Signal-development folder deleted."
else
    echo "Signal-development folder doesn't exist (already clean)."
fi

echo ""
echo "=========================================="
echo "  Reset Complete!"
echo "=========================================="
echo ""
echo "To test:"
echo "  1. Start backend:  cd orbital-backend && npm run dev"
echo "  2. Start frontend: pnpm start"
echo "  3. Login with 'alexg' or 'testuser'"
echo "  4. Create a new Orbit and test"
echo ""
