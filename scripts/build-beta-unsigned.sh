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
#   ./scripts/build-beta-unsigned.sh --universal # Build universal binary
#
# OUTPUT:
#   release/mac-*/Orbital.app    # The unsigned application bundle
#   release/*.dmg                # DMG installer (if --dmg flag used)
#
# NOTE FOR BETA TESTERS:
#   Unsigned apps trigger macOS Gatekeeper. To open:
#   1. Right-click the app → "Open"
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
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --arm64          Build for Apple Silicon only"
            echo "  --x64            Build for Intel only"
            echo "  --universal      Build universal binary (both architectures)"
            echo "  --dmg            Also create DMG installer"
            echo "  --skip-generate  Skip the generate step (use if already run)"
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

echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}  Orbital Desktop - Unsigned Beta Build${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo -e "Architecture: ${YELLOW}${ARCH}${NC}"
echo -e "Build DMG:    ${YELLOW}${BUILD_DMG}${NC}"
echo -e "Project:      ${YELLOW}${PROJECT_ROOT}${NC}"
echo ""

# Step 1: Generate assets (protobuf, styles, etc.)
if [ "$SKIP_GENERATE" = false ]; then
    echo -e "${BLUE}[1/3] Generating assets...${NC}"
    pnpm run generate
else
    echo -e "${YELLOW}[1/3] Skipping generate step (--skip-generate)${NC}"
fi

# Step 2: Build production bundles
echo -e "${BLUE}[2/3] Building production bundles...${NC}"
pnpm run build:esbuild:prod

# Step 3: Build electron app (unsigned)
echo -e "${BLUE}[3/3] Building Electron app (unsigned)...${NC}"

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

# Now ad-hoc sign the app for Apple Silicon compatibility
if [ $BUILD_EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${BLUE}[4/4] Ad-hoc signing for Apple Silicon...${NC}"

    # Use the specific output directory based on architecture
    APP_PATH="release/mac-${ARCH}/Orbital.app"

    if [ -d "$APP_PATH" ]; then
        echo "Signing app at: $APP_PATH"

        # Sign all .dylib files first
        echo "Signing dynamic libraries..."
        find "$APP_PATH" -name "*.dylib" -exec codesign --force --sign - {} \; 2>/dev/null

        # Sign all .node files (native modules)
        echo "Signing native modules..."
        find "$APP_PATH" -name "*.node" -exec codesign --force --sign - {} \; 2>/dev/null

        # Sign helper apps inside the framework
        echo "Signing helper apps..."
        find "$APP_PATH/Contents/Frameworks" -name "*Helper*" -type d | while read helper; do
            codesign --force --sign - "$helper" 2>/dev/null
        done

        # Sign frameworks (deepest first)
        echo "Signing frameworks..."
        find "$APP_PATH/Contents/Frameworks" -name "*.framework" -type d -depth | while read framework; do
            codesign --force --sign - "$framework" 2>/dev/null
        done

        # Sign the main app bundle
        echo "Signing main app bundle..."
        codesign --force --sign - "$APP_PATH" 2>&1

        SIGN_RESULT=$?
        if [ $SIGN_RESULT -eq 0 ]; then
            echo -e "${GREEN}Ad-hoc signing complete${NC}"
            # Verify
            codesign -v "$APP_PATH" 2>&1 || echo -e "${YELLOW}Signature verification warning (this is often OK for ad-hoc)${NC}"
        else
            echo -e "${YELLOW}Warning: Ad-hoc signing returned code $SIGN_RESULT${NC}"
        fi
    else
        echo -e "${RED}Error: App not found at $APP_PATH${NC}"
    fi
fi

# Check if build succeeded
if [ $BUILD_EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${GREEN}=============================================${NC}"
    echo -e "${GREEN}  Build Complete!${NC}"
    echo -e "${GREEN}=============================================${NC}"
    echo ""

    # Find and display the output
    if [ "$TARGET" = "dir" ]; then
        APP_PATH=$(find release -name "Orbital.app" -type d 2>/dev/null | head -1)
        if [ -n "$APP_PATH" ]; then
            echo -e "App bundle: ${YELLOW}${APP_PATH}${NC}"
            echo ""
            echo -e "${BLUE}To test the app:${NC}"
            echo "  open \"$APP_PATH\""
            echo ""
            echo -e "${BLUE}To distribute to testers:${NC}"
            echo "  1. Zip the .app: zip -r Orbital-beta.zip \"$APP_PATH\""
            echo "  2. Share the zip file with testers"
            echo "  3. Testers: right-click → Open to bypass Gatekeeper"
        fi
    else
        DMG_PATH=$(find release -name "*.dmg" 2>/dev/null | head -1)
        if [ -n "$DMG_PATH" ]; then
            echo -e "DMG installer: ${YELLOW}${DMG_PATH}${NC}"
            echo ""
            echo -e "${BLUE}To distribute:${NC}"
            echo "  Share the DMG file with testers"
            echo "  Testers: right-click → Open to bypass Gatekeeper"
        fi
    fi

    echo ""
    echo -e "${YELLOW}Note: This is an unsigned build for beta testing only.${NC}"
    echo -e "${YELLOW}macOS will show a security warning on first launch.${NC}"
else
    echo ""
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi
