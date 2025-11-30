# Milestone 0 — Repo & Tooling

## Status: ✅ COMPLETED

## Overview
Initialize the monorepo structure with proper tooling, CI/CD, and development workflow setup.

## Actual Layout (with changes)
```
/shared/           # NEW: Shared types & utilities package
  src/
    index.ts      # Common types (ObjectKind, TableObject, etc.)
/app/
  src/
    App.tsx       # Basic placeholder app
    main.tsx
    index.css
  public/
  vite.config.ts
/server/
  src/
    index.ts      # Express + WebSocket server
```

## Tasks

### M0-T1: Initialize Monorepo + Toolchain ✅
**Objective:** Create `app/` (Vite React TS) and `server/` (Node) workspaces.

**Dependencies:** None

**Deliverables:**
- ✅ PNPM workspaces configuration (includes `shared/` package)
- ✅ Scripts (`dev/build/test/lint/typecheck/validate`)
- ✅ ESLint+Prettier setup with environment-specific configs
- ✅ TypeScript strict mode enabled
- ✅ Added `shared/` package for common types

**Test Results:**
- ✅ `pnpm run validate` passes
- ✅ All packages build successfully
- ✅ `pnpm run dev` starts both app (port 3000) and server (port 3001)

### M0-T2: CI Pipeline ✅
**Objective:** GitHub Actions running lint, type-check, tests, builds.

**Dependencies:** M0-T1

**Deliverables:**
- ✅ `.github/workflows/ci.yml` with Node 20/22 matrix
- ✅ Git-flow pattern (main branch only, no develop)
- ✅ Selective deployment based on changed packages
- ✅ Deploy job runs only on merge to main

**Changes from original plan:**
- Added selective deployment using PNPM filtering
- Removed `develop` branch - using git-flow with main only
- Deploy job checks what changed and deploys only affected packages

### M0-T3: Commit Hooks ✅
**Objective:** Husky + lint-staged; pre-push typecheck.

**Dependencies:** M0-T1

**Deliverables:**
- ✅ Husky configuration
- ✅ lint-staged configuration
- ✅ Pre-commit hook (auto-format and lint)
- ✅ Pre-push hook (typecheck)

**Test Results:**
- ✅ Pre-commit: auto-formats with Prettier and fixes ESLint issues
- ✅ Pre-push: runs typecheck to prevent bad TypeScript

## Key Architecture Decisions

1. **Added `shared/` package** for common types between app and server
2. **Direct TypeScript imports** - No build step for shared package
3. **Git-flow with main only** - Feature branches off main, deploy on merge
4. **Selective deployment** - Only deploy changed packages using PNPM filtering
5. **Improved type model**:
   - Renamed `CardKind` → `ObjectKind` (more accurate)
   - Every card/pile is a `stack` (single card = stack of 1)
   - Added `counter` type from MVP plan