#!/bin/bash

# Check if potentially unused TypeScript files are actually imported anywhere

set -e

echo "========================================"
echo "Unused File Detector"
echo "========================================"
echo ""

REPO_ROOT="/Users/alexg/Documents/GitHub/Orbital-Desktop"
cd "$REPO_ROOT"

# Files suspected to be unused (from module resolution errors)
SUSPECT_FILES=(
  "ts/state/ducks/callingHelpers.std.ts"
  "ts/util/isGroupOrAdhocCall.std.ts"
  "ts/util/desktopCapturer.preload.ts"
  "ts/state/selectors/stories2.dom.ts"
  "ts/state/selectors/storyDistributionLists.dom.ts"
)

echo "Checking if these files are imported anywhere..."
echo ""

for file in "${SUSPECT_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "❌ NOT FOUND: $file"
    continue
  fi

  # Get the module name without extension for import searching
  module_name=$(basename "$file" | sed 's/\.[^.]*$//')

  # Search for imports of this module
  # Patterns to search:
  #   - import ... from './callingHelpers'
  #   - import ... from '../callingHelpers'
  #   - require('./callingHelpers')

  import_count=$(grep -r \
    --include="*.ts" \
    --include="*.tsx" \
    --include="*.js" \
    -E "from ['\"].*${module_name}['\"]|require\(['\"].*${module_name}['\"]" \
    "$REPO_ROOT/ts" 2>/dev/null | \
    grep -v "^${file}:" | \
    wc -l | tr -d ' ')

  if [ "$import_count" -eq 0 ]; then
    echo "✅ SAFE TO DELETE: $file"
    echo "   No imports found"
  else
    echo "⚠️  KEEP: $file"
    echo "   Found $import_count import(s)"
    echo "   Locations:"
    grep -r \
      --include="*.ts" \
      --include="*.tsx" \
      --include="*.js" \
      -E "from ['\"].*${module_name}['\"]|require\(['\"].*${module_name}['\"]" \
      "$REPO_ROOT/ts" 2>/dev/null | \
      grep -v "^${file}:" | \
      head -5 | \
      sed 's/^/     /'
  fi
  echo ""
done

echo "========================================"
echo "Summary"
echo "========================================"
echo ""
echo "Files marked 'SAFE TO DELETE' can be removed to eliminate"
echo "module resolution errors."
echo ""
echo "Files marked 'KEEP' are still imported somewhere."
echo "Review the import locations to decide if they should be:"
echo "  1. Kept and fixed"
echo "  2. Removed along with their imports"
