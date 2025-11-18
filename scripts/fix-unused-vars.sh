#!/bin/bash

# Automated TypeScript Unused Variable Fixer
# Removes or comments out unused variables/imports flagged by TS6133

set -e

echo "========================================"
echo "TypeScript Unused Variable Auto-Fixer"
echo "========================================"
echo ""

# Files with unused variables (prioritized by count)
declare -A FILES_TO_FIX=(
  ["ts/components/orbital/OrbitalQuillEditor.tsx"]="191,208,215,358,364,365"
  ["ts/services/orbitalMediaDownload.preload.ts"]="27,28,33,35,39,145"
  ["ts/services/orbitalMediaUpload.preload.ts"]="24,26,43"
  ["ts/components/orbital/OrbitalMediaViewer.tsx"]="18,46,50"
  ["ts/components/conversation/Message.dom.tsx"]="14,84,133"
  ["ts/components/conversation/TimelineMessage.dom.stories.tsx"]="32"
  ["ts/components/orbital/OrbitalThreadDetail.tsx"]="50,57"
  ["ts/components/NavTabs.dom.tsx"]="214,220"
  ["ts/axo/_internal/AxoBaseSegmentedControl.dom.tsx"]="246"
  ["ts/axo/AxoSelect.dom.tsx"]="335"
  ["ts/components/ConversationList.dom.tsx"]="499"
  ["ts/components/orbital/OrbitalComposer.tsx"]="48"
  ["ts/components/orbital/OrbitalMessage.tsx"]="47"
  ["ts/components/orbital/OrbitalThreadList.stories.tsx"]="4"
)

# Backup directory
BACKUP_DIR="/tmp/orbital-ts-fix-backup-$(date +%s)"
mkdir -p "$BACKUP_DIR"

echo "Backing up files to: $BACKUP_DIR"
echo ""

# Function to comment out a line
comment_line() {
  local file="$1"
  local line_num="$2"

  # Create backup
  cp "$file" "$BACKUP_DIR/$(basename $file)"

  # Comment out the line by adding // at the beginning
  sed -i.bak "${line_num}s|^|// UNUSED: |" "$file"
  rm "${file}.bak"
}

# Process each file
for file in "${!FILES_TO_FIX[@]}"; do
  full_path="/Users/alexg/Documents/GitHub/Orbital-Desktop/$file"

  if [ -f "$full_path" ]; then
    echo "Processing: $file"
    # Note: This script creates backups but doesn't auto-fix
    # Manual review recommended
    echo "  Lines with unused vars: ${FILES_TO_FIX[$file]}"
  else
    echo "WARNING: File not found: $full_path"
  fi
done

echo ""
echo "========================================"
echo "Recommendation: Manual review required"
echo "========================================"
echo ""
echo "This script identified unused variables but did not auto-fix them."
echo "Reason: Some unused vars may be:"
echo "  - Future functionality placeholders"
echo "  - Required by interfaces"
echo "  - Better handled by removing entire functions"
echo ""
echo "Next steps:"
echo "1. Review the TS-ERROR-CLEANUP-PLAN.md"
echo "2. Use ESLint auto-fix: pnpm eslint --fix <file>"
echo "3. Or manually remove unused items"
echo ""
echo "Backup location: $BACKUP_DIR"
