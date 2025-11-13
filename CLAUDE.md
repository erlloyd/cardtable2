# Claude Development Context

This file contains important context and instructions for Claude when working on this project.

## Project Overview

Cardtable 2.0 is a solo-first virtual card table with optional multiplayer support. It's designed to handle any card/board game through manifest-only content (no game rules in code).

### Architecture
- **Frontend**: React 19 + TypeScript + PixiJS (Vite 7)
- **Backend**: Node 24 + Express 5 + y-websocket
- **Shared**: Common TypeScript types
- **Monorepo**: PNPM workspaces

### Technology Stack (Updated M0.5)
- **Node.js**: v24 (LTS Krypton)
- **React**: 19.2.0
- **Vite**: 7.2.2
- **Vitest**: 4.0.8
- **Express**: 5.1.0
- **Yjs**: 13.6.27
- **y-websocket**: 3.0.0
- **TypeScript**: 5.9.2
- **ESLint**: 9.36.0
- **Prettier**: 3.6.2

## Project Structure

```
/
├── _plans/               # Milestone task plans (M0-M10)
├── shared/              # Shared types & utilities
│   └── src/
│       └── index.ts    # ObjectKind, TableObject types
├── app/                # Frontend (React + PixiJS)
│   ├── src/
│   ├── public/
│   └── vite.config.ts
├── server/             # Backend (Node + y-websocket)
│   └── src/
│       └── index.ts    # Express + WebSocket server
└── .github/
    └── workflows/
        └── ci.yml      # GitHub Actions CI/CD
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development servers (app on :3000, server on :3001)
pnpm run dev

# Build for production
pnpm run build

# Run tests
pnpm run test

# Run linting
pnpm run lint

# Run type checking
pnpm run typecheck

# Run full validation (lint, typecheck, test, build)
pnpm run validate

# Format code
pnpm run format
```

## Key Design Decisions

### Data Model
- All table objects use `_` prefixed properties for system fields
- Every card or group of cards is a "stack" (even single cards)
- Object types: `stack`, `token`, `zone`, `mat`, `counter`
- Yjs for CRDT-based multiplayer sync

### Shared Package
- Direct TypeScript imports (no build step)
- Contains common types used by both app and server
- Located at `@cardtable2/shared`

### CI/CD
- Git-flow pattern with main branch only
- Selective deployment: only deploys changed packages
- Uses PNPM filtering to detect changes
- Changes to shared trigger both app and server deployments

## Performance Targets
- 60 fps on mobile/desktop
- Sub-2ms hit-testing
- 300-500 object scenes
- 30Hz awareness updates

## Current Status
- ✅ M0: Repo & Tooling (COMPLETED)
- ✅ M0.5: Tool Upgrades to Latest Stable (COMPLETED)
- ⏳ M1: App Shell & Navigation
- ⏳ M2: Board Core
- ⏳ M3: Local Yjs
- ⏳ M4: Set Loader & Assets
- ⏳ M5: Multiplayer Server
- ⏳ M6: Frontend Multiplayer
- ⏳ M7: Offline Support
- ⏳ M8: Mobile & Input Polish
- ⏳ M9: Performance & QA
- ⏳ M10: Packaging & Documentation

## Important Notes

### Testing
- Unit tests use Vitest
- E2E tests will use Playwright
- All tests must pass before merge to main

### Code Style
- TypeScript strict mode enabled
- ESLint + Prettier configured
- Pre-commit hooks auto-format code
- Pre-push hooks run typecheck

### Deployment
- Placeholder deployment on merge to main
- App and server deploy independently based on changes
- Future: App to static hosting, server to container

## Recent Changes (M0.5 - Completed)
All development tools upgraded to latest stable versions:
- React 18 → 19 (with React 19 JSX transform)
- Vite 5 → 7 (ESM-only, new browser targets)
- Vitest 2 → 4
- Express 4 → 5 (promise-based middleware)
- y-websocket 2 → 3
- Node.js 20/22 → 24 LTS
- All linting/formatting tools updated

## Next Steps
See `_plans/M1_app_shell_and_navigation.md` for next milestone.