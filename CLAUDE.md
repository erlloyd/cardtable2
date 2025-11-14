# Claude Development Context

This file contains important context and instructions for Claude when working on this project.

## Project Overview

Cardtable 2.0 is a solo-first virtual card table with optional multiplayer support. It's designed to handle any card/board game through manifest-only content (no game rules in code).

### Architecture
- **Frontend**: React 19 + TypeScript + PixiJS (Vite 7)
- **Backend**: Node 24 + Express 5 + y-websocket
- **Shared**: Common TypeScript types
- **Monorepo**: PNPM workspaces

### Technology Stack (Updated M1)
- **Node.js**: v24 (LTS Krypton)
- **React**: 19.2.0
- **React Router**: 7.9.5
- **Vite**: 7.2.2
- **Vitest**: 4.0.8
- **Playwright**: 1.56.1
- **Headless UI**: 2.2.9
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
│   │   ├── pages/      # Route pages (GameSelect, Table)
│   │   ├── components/ # React components (Board, GameCombobox)
│   │   └── types/      # TypeScript types
│   ├── e2e/            # Playwright E2E tests
│   ├── public/         # Static assets (gamesIndex.json)
│   ├── vite.config.ts
│   └── playwright.config.ts
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

# Run tests (unit tests)
pnpm run test

# Run E2E tests (Playwright)
cd app && pnpm run test:e2e

# Run E2E tests with UI
cd app && pnpm run test:e2e:ui

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

### Rendering Architecture
- Dual-mode rendering: Worker-based (OffscreenCanvas) OR Main-thread (regular canvas)
- Worker mode for best performance on desktop/modern mobile (60fps with 300+ objects)
- Main-thread mode for maximum compatibility (iOS 16.x, debugging, user preference)
- Shared core logic (SceneManager, HitTester, InputHandler, RenderCore)
- User-toggleable in settings (auto-detect, force mode, debug tools)
- See `_plans/M2_rendering_architecture.md` for full details

### Shared Package
- Direct TypeScript imports (no build step)
- Contains common types used by both app and server
- Located at `@cardtable2/shared`

### CI/CD
- Feature branch workflow: all development on feature branches
- Main branch protected: only merge via tested feature branches
- Selective deployment: only deploys changed packages on main
- Uses PNPM filtering to detect changes
- Changes to shared trigger both app and server deployments
- App deploys to GitHub Pages at beta.card-table.app

### Future Hosting Plans
- **Railway (https://railway.app/)** planned for production hosting
  - WebSocket support for y-websocket backend
  - Automatic PR preview deployments for both app and server
  - Single platform for full-stack deployment
  - Cost-effective usage-based pricing

## Performance Targets
- 60 fps on mobile/desktop
- Sub-2ms hit-testing
- 300-500 object scenes
- 30Hz awareness updates

## Current Status
- ✅ M0: Repo & Tooling (COMPLETED)
- ✅ M0.5: Tool Upgrades to Latest Stable (COMPLETED)
- ✅ M1: App Shell & Navigation (COMPLETED)
- ⏳ M2: Board Core (3/6 tasks complete)
  - ✅ M2-T1: Basic Web Worker Communication
  - ✅ M2-T2: OffscreenCanvas + Simple PixiJS Rendering
  - ⏳ M2-T3: Camera (pixi-viewport) & Gestures
  - ⏳ M2-T4: Scene Model + RBush Hit-Test
  - ⏳ M2-T5: Object Dragging
  - ✅ M2-T6: Dual-Mode Rendering Architecture
- ⏳ M3: Local Yjs
- ⏳ M4: Set Loader & Assets
- ⏳ M5: Multiplayer Server
- ⏳ M6: Frontend Multiplayer
- ⏳ M7: Offline Support
- ⏳ M8: Mobile & Input Polish
- ⏳ M9: Performance & QA
- ⏳ M10: Packaging & Documentation

## Important Notes

### Branching Strategy
- **IMPORTANT**: All work must be done on feature branches (e.g., `feature/m2-board-core`)
- Never commit directly to main unless explicitly instructed
- Branch naming: `feature/{milestone}-{description}` or `fix/{description}`
- Merge to main only after testing and validation
- CI/CD deploys automatically on merge to main

### Testing
- Unit tests use Vitest
- E2E tests use Playwright
- All tests must pass before merge to main

### Code Style
- TypeScript strict mode enabled
- ESLint + Prettier configured
- Pre-commit hooks auto-format code
- Pre-push hooks run typecheck

### Deployment
- App deploys to GitHub Pages (beta.card-table.app) on merge to main
- Server deployment placeholder (future: container hosting)
- App and server deploy independently based on changes detected by PNPM

## Recent Changes

### M2-T6 - Dual-Mode Rendering Architecture (Completed 2025-11-13)
Implemented unified rendering architecture supporting both worker and main-thread modes:
- RendererCore abstract class with all rendering logic (154 lines)
- IRendererAdapter interface for unified communication
- WorkerRendererAdapter (worker mode via postMessage)
- MainThreadRendererAdapter (main-thread mode via callback)
- Auto-detection: iOS 16.x → main-thread, iOS 17+/Desktop → worker
- Query parameter support: `?renderMode=worker|main-thread`
- Conditional canvas transfer (OffscreenCanvas only for worker mode)
- All 15 tests passing, verified on iOS Chrome (no crashes)
- Pattern set for M2-T3/T4/T5 to work identically in both modes
- See `_plans/M2_rendering_architecture.md` for full details

### M2-T1/T2 - Worker Communication & PixiJS Rendering (Completed)
Basic rendering infrastructure:
- Web worker with bidirectional message passing
- OffscreenCanvas + PixiJS 8 rendering
- React strict mode handling (no double-init)
- Simple test scene with colored shapes
- 15 tests passing (unit + integration)

### M1 - App Shell & Navigation (Completed)
Complete routing and navigation system:
- React Router v7 with lazy-loaded Board component
- Table IDs use human-readable `adjective-adjective-animal` format
- Game selection with Headless UI combobox
- Playwright E2E testing infrastructure
- Unit tests for all components (8 tests passing)
- ESLint config updated for test files

### M0.5 - Tool Upgrades (Completed)
All development tools upgraded to latest stable versions:
- React 18 → 19 (with React 19 JSX transform)
- Vite 5 → 7 (ESM-only, new browser targets)
- Vitest 2 → 4
- Express 4 → 5 (promise-based middleware)
- y-websocket 2 → 3
- Node.js 20/22 → 24 LTS
- All linting/formatting tools updated

## Next Steps
See `_plans/M2_board_core.md` for next milestone.
- When asked to plan something, always ask if it should be saved in the _plans folder