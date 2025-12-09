#!/bin/bash
# =============================================================================
# Orbital Desktop - Unsigned Windows Beta Build Script
# =============================================================================
# Creates an unsigned Windows installer for Orbital Desktop beta testing.
#
# This script bypasses code signing, making the installer distributable for
# closed beta testing without requiring a Windows code signing certificate.
#
# USAGE:
#   ./scripts/build-beta-windows.sh              # Build for x64 (most common)
#   ./scripts/build-beta-windows.sh --arm64      # Build for Windows ARM64
#   ./scripts/build-beta-windows.sh --all        # Build for both architectures
#   ./scripts/build-beta-windows.sh --release    # Build and publish to GitHub
#   ./scripts/build-beta-windows.sh --bump       # Bump alpha version before build
#
# EXAMPLES:
#   # Quick local build for testing
#   ./scripts/build-beta-windows.sh
#
#   # Full release workflow (bump version, build, publish)
#   ./scripts/build-beta-windows.sh --bump --release
#
# OUTPUT:
#   release/Orbital Setup VERSION.exe            # NSIS installer
#   release/Orbital-VERSION-win-ARCH.exe         # Renamed for distribution
#   GitHub Release                               # Published release (with --release)
#
# NOTE FOR BETA TESTERS:
#   Unsigned Windows apps trigger SmartScreen warnings. To install:
#   1. Click "More info" on the SmartScreen dialog
#   2. Click "Run anyway"
#   This only needs to be done once per version.
#
# CROSS-COMPILATION NOTE:
#   Building Windows installers on macOS/Linux requires Wine.
#   It's recommended to build Windows releases on a Windows machine or CI.
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
ARCH="x64"
BUILD_ALL=false
SKIP_GENERATE=false
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
        --all)
            BUILD_ALL=true
            shift
            ;;
        --skip-generate)
            SKIP_GENERATE=true
            shift
            ;;
        --release)
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
            echo "  --x64            Build for x64/AMD64 (default, most common)"
            echo "  --arm64          Build for Windows ARM64"
            echo "  --all            Build for both architectures"
            echo "  --skip-generate  Skip the generate step (use if already run)"
            echo ""
            echo "Release Options:"
            echo "  --release        Publish to GitHub as a pre-release"
            echo "  --bump           Bump alpha version before building"
            echo ""
            echo "Examples:"
            echo "  $0                      # Quick local build (x64)"
            echo "  $0 --all                # Build all architectures"
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

        echo -e "${BLUE}Bumping version: ${current_version} -> ${new_version}${NC}" >&2

        # Update package.json - use different sed syntax for Linux vs macOS
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/\"version\": \"${current_version}\"/\"version\": \"${new_version}\"/" package.json
        else
            sed -i "s/\"version\": \"${current_version}\"/\"version\": \"${new_version}\"/" package.json
        fi

        echo "$new_version"
    else
        echo -e "${YELLOW}Warning: Version '${current_version}' is not an alpha version. Skipping bump.${NC}" >&2
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
echo -e "${GREEN}  Orbital Desktop - Windows Beta Build${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo -e "Version:       ${YELLOW}${VERSION}${NC}"
if [ "$BUILD_ALL" = true ]; then
    echo -e "Architecture:  ${YELLOW}x64 + arm64${NC}"
else
    echo -e "Architecture:  ${YELLOW}${ARCH}${NC}"
fi
echo -e "GitHub Release: ${YELLOW}${CREATE_RELEASE}${NC}"
echo -e "Project:       ${YELLOW}${PROJECT_ROOT}${NC}"
echo ""

# Check for cross-compilation requirements
if [[ "$OSTYPE" != "msys"* ]] && [[ "$OSTYPE" != "cygwin"* ]] && [[ "$OSTYPE" != "win32"* ]]; then
    echo -e "${YELLOW}Warning: Building Windows on non-Windows platform${NC}"
    echo -e "${YELLOW}This requires Wine for NSIS. If the build fails, consider:${NC}"
    echo -e "${YELLOW}  - Building on a Windows machine${NC}"
    echo -e "${YELLOW}  - Using GitHub Actions CI with windows-latest${NC}"
    echo ""
fi

# Step 1: Generate assets (protobuf, styles, etc.)
if [ "$SKIP_GENERATE" = false ]; then
    echo -e "${BLUE}[1/4] Generating assets...${NC}"
    pnpm run generate
else
    echo -e "${YELLOW}[1/4] Skipping generate step (--skip-generate)${NC}"
fi

# Step 2: Build production bundles
echo -e "${BLUE}[2/4] Building production bundles...${NC}"
pnpm run build:esbuild:prod

# Step 3: Build electron app (unsigned)
echo -e "${BLUE}[3/4] Building Windows installer (unsigned)...${NC}"

# Build command - disable signing by nullifying signtool options
# The sign script checks for certificateSha1 and skips if not present
if [ "$BUILD_ALL" = true ]; then
    # Build both architectures
    SIGNAL_ENV=production \
        pnpm exec electron-builder \
        --win \
        --x64 \
        --arm64 \
        --config.directories.output=release \
        --config.win.signtoolOptions.certificateSha1= \
        --config.win.signtoolOptions.certificateSubjectName=
else
    SIGNAL_ENV=production \
        pnpm exec electron-builder \
        --win \
        --${ARCH} \
        --config.directories.output=release \
        --config.win.signtoolOptions.certificateSha1= \
        --config.win.signtoolOptions.certificateSubjectName=
fi

BUILD_EXIT_CODE=$?

if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

# Find the built installer(s)
echo ""
echo -e "${BLUE}[4/4] Locating built installers...${NC}"

INSTALLERS=()
if [ "$BUILD_ALL" = true ]; then
    # Look for both architectures
    for arch in x64 arm64; do
        INSTALLER_PATH=$(find release -maxdepth 1 -name "*Setup*${arch}*.exe" -o -name "*-win-${arch}-*.exe" 2>/dev/null | head -1)
        if [ -n "$INSTALLER_PATH" ] && [ -f "$INSTALLER_PATH" ]; then
            INSTALLERS+=("$INSTALLER_PATH")
        fi
    done
else
    # Look for single architecture
    INSTALLER_PATH=$(find release -maxdepth 1 -name "*.exe" 2>/dev/null | head -1)
    if [ -n "$INSTALLER_PATH" ] && [ -f "$INSTALLER_PATH" ]; then
        INSTALLERS+=("$INSTALLER_PATH")
    fi
fi

if [ ${#INSTALLERS[@]} -eq 0 ]; then
    echo -e "${RED}Error: No installer found in release directory${NC}"
    echo "Contents of release directory:"
    ls -la release/ 2>/dev/null || echo "Directory not found"
    exit 1
fi

# Display found installers
for installer in "${INSTALLERS[@]}"; do
    SIZE=$(ls -lh "$installer" | awk '{print $5}')
    echo -e "${GREEN}Found: ${installer} (${SIZE})${NC}"
done

# Step 5: Create GitHub release if requested
if [ "$CREATE_RELEASE" = true ]; then
    echo ""
    echo -e "${BLUE}Creating GitHub release...${NC}"

    # Check if gh CLI is available
    if ! command -v gh &> /dev/null; then
        echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
        echo "Install with: brew install gh (macOS) or winget install GitHub.cli (Windows)"
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
        echo -e "${YELLOW}Release ${TAG} exists. Uploading Windows assets...${NC}"

        # Upload installers to existing release
        for installer in "${INSTALLERS[@]}"; do
            echo "Uploading: $installer"
            gh release upload "$TAG" "$installer" \
                --repo alexg-g/Orbital-Desktop \
                --clobber
        done
    else
        # Create new release
        RELEASE_NOTES=$(cat <<EOF
## Orbital Desktop ${VERSION} Beta (Windows)

### Installation (Windows)

1. Download the \`.exe\` installer for your architecture (most users need x64)
2. Run the installer - Windows SmartScreen may show a warning
3. Click "More info" then "Run anyway" to proceed
4. Follow the installation wizard

### What's New

See commit history for changes in this release.

### Known Issues

- Unsigned app triggers SmartScreen warning on first install
- Windows x64 build only (ARM64 may be available separately)

---
Built with [Claude Code](https://claude.com/claude-code)
EOF
)

        # Create release with installers
        RELEASE_URL=$(gh release create "$TAG" \
            --repo alexg-g/Orbital-Desktop \
            --title "${VERSION} Beta Release" \
            --notes "$RELEASE_NOTES" \
            --prerelease \
            "${INSTALLERS[@]}" 2>&1)

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}GitHub release created: ${RELEASE_URL}${NC}"
        else
            echo -e "${RED}Error creating GitHub release${NC}"
            echo "$RELEASE_URL"
            exit 1
        fi
    fi
else
    echo -e "${YELLOW}Skipping GitHub release (use --release to enable)${NC}"
fi

# Summary
echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}  Build Complete!${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo -e "Version:     ${YELLOW}${VERSION}${NC}"
echo -e "Installers:"
for installer in "${INSTALLERS[@]}"; do
    echo -e "             ${YELLOW}${installer}${NC}"
done

if [ "$CREATE_RELEASE" = true ]; then
    echo ""
    echo -e "Release:     ${YELLOW}https://github.com/alexg-g/Orbital-Desktop/releases/tag/v${VERSION}${NC}"
fi

echo ""
echo -e "${BLUE}To test locally (on Windows):${NC}"
echo "  Run the installer from the release directory"
echo ""

if [ "$CREATE_RELEASE" = false ]; then
    echo -e "${BLUE}To publish a GitHub release:${NC}"
    echo "  $0 --bump --release"
    echo ""
fi

echo -e "${YELLOW}Note: This is an unsigned build for beta testing only.${NC}"
echo -e "${YELLOW}Windows SmartScreen will show a warning on first install.${NC}"
