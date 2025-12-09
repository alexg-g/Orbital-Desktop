# =============================================================================
# Orbital Desktop - Unsigned Windows Beta Build Script (PowerShell)
# =============================================================================
# Creates an unsigned Windows installer for Orbital Desktop beta testing.
#
# USAGE:
#   .\scripts\build-beta-windows.ps1              # Build for x64 (most common)
#   .\scripts\build-beta-windows.ps1 -Arch arm64  # Build for Windows ARM64
#   .\scripts\build-beta-windows.ps1 -All         # Build for both architectures
#   .\scripts\build-beta-windows.ps1 -Release     # Build and publish to GitHub
#   .\scripts\build-beta-windows.ps1 -Bump        # Bump alpha version before build
#
# EXAMPLES:
#   # Quick local build for testing
#   .\scripts\build-beta-windows.ps1
#
#   # Full release workflow (bump version, build, publish)
#   .\scripts\build-beta-windows.ps1 -Bump -Release
#
# NOTE FOR BETA TESTERS:
#   Unsigned Windows apps trigger SmartScreen warnings. To install:
#   1. Click "More info" on the SmartScreen dialog
#   2. Click "Run anyway"
# =============================================================================

param(
    [ValidateSet("x64", "arm64")]
    [string]$Arch = "x64",

    [switch]$All,
    [switch]$SkipGenerate,
    [switch]$Release,
    [switch]$Bump,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# Colors
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) { Write-Output $args }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Write-Success { Write-ColorOutput Green $args }
function Write-Info { Write-ColorOutput Cyan $args }
function Write-Warn { Write-ColorOutput Yellow $args }
function Write-Err { Write-ColorOutput Red $args }

if ($Help) {
    Write-Host @"
Orbital Desktop - Windows Beta Build Script

USAGE:
    .\scripts\build-beta-windows.ps1 [options]

OPTIONS:
    -Arch <x64|arm64>  Architecture to build (default: x64)
    -All               Build both x64 and arm64
    -SkipGenerate      Skip the generate step (if already run)
    -Release           Publish to GitHub as a pre-release
    -Bump              Bump alpha version before building
    -Help              Show this help message

EXAMPLES:
    .\scripts\build-beta-windows.ps1                 # Quick local build (x64)
    .\scripts\build-beta-windows.ps1 -All            # Build all architectures
    .\scripts\build-beta-windows.ps1 -Bump -Release  # Full release workflow
"@
    exit 0
}

# Get script directory and project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

# Get version from package.json
function Get-Version {
    $packageJson = Get-Content "package.json" | ConvertFrom-Json
    return $packageJson.version
}

# Bump alpha version
function Update-AlphaVersion {
    $currentVersion = Get-Version

    if ($currentVersion -match '^(.+)-alpha\.(\d+)$') {
        $base = $Matches[1]
        $alphaNum = [int]$Matches[2]
        $newAlphaNum = $alphaNum + 1
        $newVersion = "$base-alpha.$newAlphaNum"

        Write-Info "Bumping version: $currentVersion -> $newVersion"

        $content = Get-Content "package.json" -Raw
        $content = $content -replace "`"version`": `"$currentVersion`"", "`"version`": `"$newVersion`""
        Set-Content "package.json" $content -NoNewline

        return $newVersion
    } else {
        Write-Warn "Version '$currentVersion' is not an alpha version. Skipping bump."
        return $currentVersion
    }
}

# Bump version if requested
if ($Bump) {
    $Version = Update-AlphaVersion
} else {
    $Version = Get-Version
}

Write-Success "============================================="
Write-Success "  Orbital Desktop - Windows Beta Build"
Write-Success "============================================="
Write-Host ""
Write-Host "Version:        " -NoNewline; Write-Warn $Version
if ($All) {
    Write-Host "Architecture:   " -NoNewline; Write-Warn "x64 + arm64"
} else {
    Write-Host "Architecture:   " -NoNewline; Write-Warn $Arch
}
Write-Host "GitHub Release: " -NoNewline; Write-Warn $Release
Write-Host "Project:        " -NoNewline; Write-Warn $ProjectRoot
Write-Host ""

# Check prerequisites
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Err "Error: pnpm is not installed"
    Write-Host "Install with: npm install -g pnpm"
    exit 1
}

# Step 1: Generate assets
if (-not $SkipGenerate) {
    Write-Info "[1/4] Generating assets..."
    pnpm run generate
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Generate failed!"
        exit 1
    }
} else {
    Write-Warn "[1/4] Skipping generate step (-SkipGenerate)"
}

# Step 2: Build production bundles
Write-Info "[2/4] Building production bundles..."
pnpm run build:esbuild:prod
if ($LASTEXITCODE -ne 0) {
    Write-Err "Build failed!"
    exit 1
}

# Step 3: Build electron app (unsigned)
Write-Info "[3/4] Building Windows installer (unsigned)..."

$env:SIGNAL_ENV = "production"

if ($All) {
    # Build both architectures
    pnpm exec electron-builder `
        --win `
        --x64 `
        --arm64 `
        --config.directories.output=release `
        --config.win.signtoolOptions.certificateSha1= `
        --config.win.signtoolOptions.certificateSubjectName=
} else {
    pnpm exec electron-builder `
        --win `
        --$Arch `
        --config.directories.output=release `
        --config.win.signtoolOptions.certificateSha1= `
        --config.win.signtoolOptions.certificateSubjectName=
}

if ($LASTEXITCODE -ne 0) {
    Write-Err "Electron builder failed!"
    exit 1
}

# Step 4: Find installers
Write-Info "[4/4] Locating built installers..."

$Installers = Get-ChildItem -Path "release" -Filter "*.exe" -File | Select-Object -ExpandProperty FullName

if ($Installers.Count -eq 0) {
    Write-Err "Error: No installer found in release directory"
    Get-ChildItem -Path "release" -ErrorAction SilentlyContinue
    exit 1
}

foreach ($installer in $Installers) {
    $size = (Get-Item $installer).Length / 1MB
    $sizeStr = "{0:N1} MB" -f $size
    Write-Success "Found: $installer ($sizeStr)"
}

# Step 5: GitHub release
if ($Release) {
    Write-Info "Creating GitHub release..."

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Err "Error: GitHub CLI (gh) is not installed"
        Write-Host "Install with: winget install GitHub.cli"
        exit 1
    }

    $authStatus = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Error: Not authenticated with GitHub CLI"
        Write-Host "Run: gh auth login"
        exit 1
    }

    $Tag = "v$Version"

    # Check if release exists
    $releaseExists = gh release view $Tag --repo alexg-g/Orbital-Desktop 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Warn "Release $Tag exists. Uploading Windows assets..."

        foreach ($installer in $Installers) {
            Write-Host "Uploading: $installer"
            gh release upload $Tag $installer --repo alexg-g/Orbital-Desktop --clobber
        }
    } else {
        # Create new release
        $ReleaseNotes = @"
## Orbital Desktop $Version Beta (Windows)

### Installation (Windows)

1. Download the `.exe` installer for your architecture (most users need x64)
2. Run the installer - Windows SmartScreen may show a warning
3. Click "More info" then "Run anyway" to proceed
4. Follow the installation wizard

### Known Issues

- Unsigned app triggers SmartScreen warning on first install

---
Built with [Claude Code](https://claude.com/claude-code)
"@

        gh release create $Tag `
            --repo alexg-g/Orbital-Desktop `
            --title "$Version Beta Release" `
            --notes $ReleaseNotes `
            --prerelease `
            $Installers

        if ($LASTEXITCODE -eq 0) {
            Write-Success "GitHub release created: https://github.com/alexg-g/Orbital-Desktop/releases/tag/$Tag"
        } else {
            Write-Err "Error creating GitHub release"
            exit 1
        }
    }
} else {
    Write-Warn "Skipping GitHub release (use -Release to enable)"
}

# Summary
Write-Host ""
Write-Success "============================================="
Write-Success "  Build Complete!"
Write-Success "============================================="
Write-Host ""
Write-Host "Version:     " -NoNewline; Write-Warn $Version
Write-Host "Installers:"
foreach ($installer in $Installers) {
    Write-Host "             " -NoNewline; Write-Warn $installer
}

if ($Release) {
    Write-Host ""
    Write-Host "Release:     " -NoNewline; Write-Warn "https://github.com/alexg-g/Orbital-Desktop/releases/tag/v$Version"
}

Write-Host ""
Write-Info "To test locally:"
Write-Host "  Run the installer from the release directory"
Write-Host ""

if (-not $Release) {
    Write-Info "To publish a GitHub release:"
    Write-Host "  .\scripts\build-beta-windows.ps1 -Bump -Release"
    Write-Host ""
}

Write-Warn "Note: This is an unsigned build for beta testing only."
Write-Warn "Windows SmartScreen will show a warning on first install."
