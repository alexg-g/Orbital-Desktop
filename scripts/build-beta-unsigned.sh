#!/bin/bash
# =============================================================================
# Orbital Desktop - Unsigned Beta Build Script
# =============================================================================
# Creates an unsigned Orbital.app for beta testing distribution.
#
# This script bypasses code signing, making the app distributable for
# closed beta testing without requiring an Apple Developer account.
#
# USAGE:
#   ./scripts/build-beta-unsigned.sh           # Build for current architecture
#   ./scripts/build-beta-unsigned.sh --arm64   # Build for Apple Silicon only
#   ./scripts/build-beta-unsigned.sh --x64     # Build for Intel only
#   ./scripts/build-beta-unsigned.sh --zip     # Build and create distributable zip
#   ./scripts/build-beta-unsigned.sh --release # Build, zip, and publish to GitHub
#   ./scripts/build-beta-unsigned.sh --bump    # Bump alpha version before build
#
# EXAMPLES:
#   # Quick local build for testing
#   ./scripts/build-beta-unsigned.sh
#
#   # Full release workflow (bump version, build, zip, publish)
#   ./scripts/build-beta-unsigned.sh --bump --release
#
# OUTPUT:
#   release/mac-*/Orbital.app                    # The unsigned application bundle
#   release/Orbital-VERSION-mac-ARCH.zip         # Distributable zip (with --zip)
#   GitHub Release                               # Published release (with --release)
#
# NOTE FOR BETA TESTERS:
#   Unsigned apps trigger macOS Gatekeeper. To open:
#   1. Right-click the app -> "Open"
#   2. Click "Open" in the dialog
#   This only needs to be done once.
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
ARCH=""
BUILD_DMG=false
SKIP_GENERATE=false
CREATE_ZIP=false
CREATE_RELEASE=false
BUMP_VERSION=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --arm64)
            ARCH="arm64"
            shift
            ;;
        --x64)
            ARCH="x64"
            shift
            ;;
        --universal)
            ARCH="universal"
            shift
            ;;
        --dmg)
            BUILD_DMG=true
            shift
            ;;
        --skip-generate)
            SKIP_GENERATE=true
            shift
            ;;
        --zip)
            CREATE_ZIP=true
            shift
            ;;
        --release)
            CREATE_ZIP=true  # Release implies zip
            CREATE_RELEASE=true
            shift
            ;;
        --bump)
            BUMP_VERSION=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Build Options:"
            echo "  --arm64          Build for Apple Silicon only"
            echo "  --x64            Build for Intel only"
            echo "  --universal      Build universal binary (both architectures)"
            echo "  --dmg            Also create DMG installer"
            echo "  --skip-generate  Skip the generate step (use if already run)"
            echo ""
            echo "Release Options:"
            echo "  --zip            Create distributable zip file"
            echo "  --release        Create zip and publish GitHub release"
            echo "  --bump           Bump alpha version before building"
            echo ""
            echo "Examples:"
            echo "  $0                      # Quick local build"
            echo "  $0 --zip                # Build and create zip"
            echo "  $0 --bump --release     # Full release workflow"
            echo ""
            echo "  -h, --help       Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Auto-detect architecture if not specified
if [ -z "$ARCH" ]; then
    if [ "$(uname -m)" = "arm64" ]; then
        ARCH="arm64"
    else
        ARCH="x64"
    fi
    echo -e "${BLUE}Auto-detected architecture: ${ARCH}${NC}"
fi

cd "$PROJECT_ROOT"

# Get current version from package.json
get_version() {
    grep '"version"' package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/'
}

# Bump alpha version (e.g., 7.80.0-alpha.1 -> 7.80.0-alpha.2)
bump_alpha_version() {
    local current_version=$(get_version)

    if [[ $current_version =~ ^(.+)-alpha\.([0-9]+)$ ]]; then
        local base="${BASH_REMATCH[1]}"
        local alpha_num="${BASH_REMATCH[2]}"
        local new_alpha_num=$((alpha_num + 1))
        local new_version="${base}-alpha.${new_alpha_num}"

        echo -e "${BLUE}Bumping version: ${current_version} -> ${new_version}${NC}"

        # Update package.json
        sed -i '' "s/\"version\": \"${current_version}\"/\"version\": \"${new_version}\"/" package.json

        echo "$new_version"
    else
        echo -e "${YELLOW}Warning: Version '${current_version}' is not an alpha version. Skipping bump.${NC}"
        echo "$current_version"
    fi
}

# Bump version if requested
if [ "$BUMP_VERSION" = true ]; then
    VERSION=$(bump_alpha_version)
else
    VERSION=$(get_version)
fi

echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}  Orbital Desktop - Unsigned Beta Build${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo -e "Version:      ${YELLOW}${VERSION}${NC}"
echo -e "Architecture: ${YELLOW}${ARCH}${NC}"
echo -e "Build DMG:    ${YELLOW}${BUILD_DMG}${NC}"
echo -e "Create Zip:   ${YELLOW}${CREATE_ZIP}${NC}"
echo -e "GitHub Release: ${YELLOW}${CREATE_RELEASE}${NC}"
echo -e "Project:      ${YELLOW}${PROJECT_ROOT}${NC}"
echo ""

# Step 1: Generate assets (protobuf, styles, etc.)
if [ "$SKIP_GENERATE" = false ]; then
    echo -e "${BLUE}[1/6] Generating assets...${NC}"
    pnpm run generate
else
    echo -e "${YELLOW}[1/6] Skipping generate step (--skip-generate)${NC}"
fi

# Step 2: Build production bundles
echo -e "${BLUE}[2/6] Building production bundles...${NC}"
pnpm run build:esbuild:prod

# Step 3: Build electron app (unsigned)
echo -e "${BLUE}[3/6] Building Electron app (unsigned)...${NC}"

# Determine target format
if [ "$BUILD_DMG" = true ]; then
    TARGET="dmg"
else
    TARGET="dir"  # Just the .app directory, no installer
fi

# Build command - skip signing during build, we'll ad-hoc sign after
# - identity=null skips electron-builder's signing
# - sign=null disables the custom sign script
SIGNAL_ENV=production \
    pnpm exec electron-builder \
    --mac \
    --${ARCH} \
    --${TARGET} \
    --config.directories.output=release \
    --config.mac.identity=null \
    --config.mac.sign=null

BUILD_EXIT_CODE=$?

# Step 4: Ad-hoc sign the app for Apple Silicon compatibility
if [ $BUILD_EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${BLUE}[4/6] Ad-hoc signing for Apple Silicon...${NC}"

    APP_PATH="release/mac-${ARCH}/Orbital.app"

    if [ -d "$APP_PATH" ]; then
        echo "Signing app at: $APP_PATH"

        # Sign all .dylib files first
        echo "Signing dynamic libraries..."
        find "$APP_PATH" -name "*.dylib" -exec codesign --force --sign - {} \; 2>/dev/null || true

        # Sign all .node files (native modules)
        echo "Signing native modules..."
        find "$APP_PATH" -name "*.node" -exec codesign --force --sign - {} \; 2>/dev/null || true

        # Sign helper apps inside the framework
        echo "Signing helper apps..."
        find "$APP_PATH/Contents/Frameworks" -name "*Helper*" -type d 2>/dev/null | while read helper; do
            codesign --force --sign - "$helper" 2>/dev/null || true
        done

        # Sign frameworks (deepest first)
        echo "Signing frameworks..."
        find "$APP_PATH/Contents/Frameworks" -name "*.framework" -type d -depth 2>/dev/null | while read framework; do
            codesign --force --sign - "$framework" 2>/dev/null || true
        done

        # Sign the main app bundle with --deep as final step
        echo "Signing main app bundle..."
        codesign --force --deep --sign - "$APP_PATH" 2>&1

        SIGN_RESULT=$?
        if [ $SIGN_RESULT -eq 0 ]; then
            echo -e "${GREEN}Ad-hoc signing complete${NC}"
        else
            echo -e "${YELLOW}Warning: Ad-hoc signing returned code $SIGN_RESULT${NC}"
        fi
    else
        echo -e "${RED}Error: App not found at $APP_PATH${NC}"
        exit 1
    fi
else
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

# Step 5: Create zip if requested
ZIP_PATH=""
if [ "$CREATE_ZIP" = true ]; then
    echo ""
    echo -e "${BLUE}[5/6] Creating distributable zip...${NC}"

    ZIP_NAME="Orbital-${VERSION}-mac-${ARCH}.zip"
    ZIP_PATH="release/${ZIP_NAME}"

    # Remove old zip if exists
    rm -f "$ZIP_PATH"

    # Create zip preserving symlinks
    cd "release/mac-${ARCH}"
    zip -r -y "../${ZIP_NAME}" "Orbital.app"
    cd "$PROJECT_ROOT"

    if [ -f "$ZIP_PATH" ]; then
        ZIP_SIZE=$(ls -lh "$ZIP_PATH" | awk '{print $5}')
        echo -e "${GREEN}Created: ${ZIP_PATH} (${ZIP_SIZE})${NC}"
    else
        echo -e "${RED}Error: Failed to create zip${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}[5/6] Skipping zip creation (use --zip to enable)${NC}"
fi

# Step 6: Create GitHub release if requested
if [ "$CREATE_RELEASE" = true ]; then
    echo ""
    echo -e "${BLUE}[6/6] Creating GitHub release...${NC}"

    # Check if gh CLI is available
    if ! command -v gh &> /dev/null; then
        echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
        echo "Install with: brew install gh"
        exit 1
    fi

    # Check if authenticated
    if ! gh auth status &> /dev/null; then
        echo -e "${RED}Error: Not authenticated with GitHub CLI${NC}"
        echo "Run: gh auth login"
        exit 1
    fi

    TAG="v${VERSION}"

    # Check if release already exists
    if gh release view "$TAG" --repo alexg-g/Orbital-Desktop &> /dev/null; then
        echo -e "${YELLOW}Release ${TAG} already exists. Deleting and recreating...${NC}"
        gh release delete "$TAG" --repo alexg-g/Orbital-Desktop --yes 2>/dev/null || true
        git push origin --delete "$TAG" 2>/dev/null || true
    fi

    # Create release notes
    RELEASE_NOTES=$(cat <<EOF
## Orbital Desktop ${VERSION} Beta

### Installation (macOS)

1. Download \`Orbital-${VERSION}-mac-${ARCH}.zip\`
2. Unzip and move \`Orbital.app\` to Applications
3. Right-click -> Open (first time only, to bypass Gatekeeper)

### What's New

See commit history for changes in this release.

### Known Issues

- Unsigned app requires right-click -> Open on first launch
- macOS only (Apple Silicon) in this build

---
Built with [Claude Code](https://claude.com/claude-code)
EOF
)

    # Create the release
    RELEASE_URL=$(gh release create "$TAG" \
        --repo alexg-g/Orbital-Desktop \
        --title "${VERSION} Beta Release" \
        --notes "$RELEASE_NOTES" \
        --prerelease \
        "$ZIP_PATH" 2>&1)

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}GitHub release created: ${RELEASE_URL}${NC}"
    else
        echo -e "${RED}Error creating GitHub release${NC}"
        echo "$RELEASE_URL"
        exit 1
    fi
else
    echo -e "${YELLOW}[6/6] Skipping GitHub release (use --release to enable)${NC}"
fi

# Summary
echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}  Build Complete!${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo -e "Version:    ${YELLOW}${VERSION}${NC}"
echo -e "App:        ${YELLOW}release/mac-${ARCH}/Orbital.app${NC}"

if [ -n "$ZIP_PATH" ] && [ -f "$ZIP_PATH" ]; then
    echo -e "Zip:        ${YELLOW}${ZIP_PATH}${NC}"
fi

if [ "$CREATE_RELEASE" = true ]; then
    echo -e "Release:    ${YELLOW}${RELEASE_URL}${NC}"
fi

echo ""
echo -e "${BLUE}To test locally:${NC}"
echo "  open \"release/mac-${ARCH}/Orbital.app\""
echo ""

if [ "$CREATE_ZIP" = false ]; then
    echo -e "${BLUE}To create a distributable zip:${NC}"
    echo "  $0 --zip"
    echo ""
fi

if [ "$CREATE_RELEASE" = false ]; then
    echo -e "${BLUE}To publish a GitHub release:${NC}"
    echo "  $0 --bump --release"
    echo ""
fi

echo -e "${YELLOW}Note: This is an unsigned build for beta testing only.${NC}"
echo -e "${YELLOW}macOS will show a security warning on first launch.${NC}"
