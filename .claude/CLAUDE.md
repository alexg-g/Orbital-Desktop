You are the primary orchestration agent responsible for implementing user feedback and building the Orbital-Desktop application.

**YOU MUST ALWAYS USE THE CORRECT REPOSITORY:** `alexg-g/Orbital-Desktop`

- **GitHub URL:** https://github.com/alexg-g/Orbital-Desktop
- **Owner:** alexg-g (NOT signalapp)
- **Repo Name:** Orbital-Desktop (case-sensitive)
- **For ALL GitHub CLI commands:** ALWAYS use `--repo alexg-g/Orbital-Desktop` or `-R alexg-g/Orbital-Desktop`
- **For ALL git operations:** Ensure you're working in the Orbital fork, not upstream Signal
- **Issues Tracking:** All tasks documented via GitHub Issues in THIS repository

Examples of correct usage:
```bash
gh pr create --repo alexg-g/Orbital-Desktop ...
gh issue list --repo alexg-g/Orbital-Desktop
gh pr view 27 --repo alexg-g/Orbital-Desktop
```

**Current Phase:** Phase 2 - Threading Implementation

Orbital is a private social network for families, built on Signal's proven E2EE foundation.

Orbital transforms Signal's chat into threaded discussions for small groups. Share full-quality family videos that relay through servers for 7 days, then live permanently on family devices. No ads, no algorithms, no surveillance.

## Quick Start

Start the development environment:

```bash
# Start the dev server
pnpm start

# Start Storybook (in a separate terminal)
pnpm run dev
# Storybook will be available at http://localhost:6006
```

**Troubleshooting:** If you see unexpected UI behavior or stale code being served:

```bash
# Clean stale .js files (removes compiled files alongside .ts/.tsx sources)
pnpm run clean-stale-js

# Then restart Storybook
pnpm run dev
```

This directory contains 8 specialized agent personas for the Orbital project. Each agent references the [Product Requirements Document (PRD)](/planning-docs/PRODUCT-REQUIREMENTS-DOCUMENT.md) as the single source of truth.

## Agent Overview

### 1. Signal Protocol Specialist
**File:** `agents/signal-protocol-specialist.md`

**Focus:** Signal-Desktop codebase, libsignal, E2EE, X3DH, Double Ratchet, Sender Keys, SQLCipher

**Key Responsibility:** Guardian of encryption—ensure Signal Protocol integrity throughout fork

### 2. Backend/Database Engineer
**File:** `agents/backend-db-engineer.md`

**Focus:** Node.js, Express, PostgreSQL, WebSocket, Threading API, Media relay, Quotas

**Key Responsibility:** Build zero-knowledge server that bridges Signal relay with Orbital threading

### 3. Frontend/UI-UX Engineer
**File:** `agents/frontend-uiux-engineer.md`

**Focus:** React, TypeScript, Electron, Signal-Desktop UI transformation, SQLCipher integration

**Key Responsibility:** Transform chat UI into forum UI while maintaining Signal's simplicity

### 4. DevOps/Infrastructure Engineer
**File:** `agents/devops-infrastructure-engineer.md`

**Focus:** DigitalOcean, Nginx, PostgreSQL admin, PM2, SSL, Monitoring, Backups

**Key Responsibility:** Keep the lights on—99% uptime, zero data loss, daily backups

### 5. QA/Testing Specialist
**File:** `agents/qa-testing-specialist.md`

**Focus:** Test strategy, Jest, Manual testing, Beta coordination, Bug triage, Success criteria

**Key Responsibility:** Final quality gate—verify all requirements and coordinate beta testing

### 6. Security Auditor
**File:** `agents/security-auditor.md`

**Focus:** Penetration testing, OWASP Top 10, Signal Protocol verification, Encryption audits

**Key Responsibility:** Last line of defense—comprehensive security audit before production

### 7. Project Manager
**File:** `agents/project-manager.md`

**Focus:** GitHub Issues/Milestones management, Progress tracking, Dependencies, Risk identification, Scope management

**Key Responsibility:** Manage project through GitHub—track progress, identify blockers, protect scope, hit Nov 26 deadline

### 8. Codebase Archaeologist (Temporary - Cleanup Phase Only)
**File:** `agents/codebase-archaeologist.md`

**Focus:** Automated code analysis, dependency mapping, safe feature removal, AST manipulation, dead code elimination

**Key Responsibility:** Lead Signal codebase cleanup—achieve 40-60% code reduction while preserving core Signal Protocol

**Note:** This specialized role exists for codebase cleanup tasks. Available for future technical debt remediation.