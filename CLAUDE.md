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

#### PixiJS Ticker Management
- **CRITICAL**: PixiJS is configured with `autoStart: false` to prevent iOS worker crashes
- Any code that uses animations via `app.ticker` **must manually start the ticker**:
  ```typescript
  this.app.ticker.add(callback);
  if (!this.app.ticker.started) {
    this.app.ticker.start();
  }
  ```
- This is intentional for performance: ticker only runs when animations are active
- Ticker should be stopped when animations complete to save CPU cycles

### Object Architecture
- **Registry Pattern**: Object behaviors mapped by `ObjectKind` (no switch statements)
- **Modular Structure**: Each object type has dedicated directory in `app/src/renderer/objects/`
- **Behavior Interface**: Three methods per type: `render()`, `getBounds()`, `getShadowConfig()`
- **Event System**: Default handlers with type-specific overrides (onHover, onClick, onDrag, onDrop, onDoubleClick)
- **Plain Data Model**: Objects remain plain `TableObject` data (Yjs-compatible, no class instances)
- **Type Safety**: TypeScript interfaces ensure correct implementations
- **Extensibility**: Add new object types without modifying core renderer code

To add a new object type:
1. Create directory in `app/src/renderer/objects/newtype/`
2. Implement behaviors (render, getBounds, getShadowConfig)
3. Register in `objects/index.ts`
4. Add to `ObjectKind` enum in `shared/src/index.ts`

See `app/src/renderer/objects/README.md` for full documentation.

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
- ✅ M2: Board Core (COMPLETED - all 6 tasks complete)
  - ✅ M2-T1: Basic Web Worker Communication
  - ✅ M2-T2: OffscreenCanvas + Simple PixiJS Rendering
  - ✅ M2-T3: Camera & Gestures (manual implementation with unlimited zoom, 11 E2E tests)
  - ✅ M2-T4: Scene Model + RBush Hit-Test (11 unit + 8 E2E tests, hover feedback)
  - ✅ M2-T5: Object Dragging (card selection, multi-select, pan/select mode, 16 Board + 11 SceneManager tests)
  - ✅ M2-T6: Dual-Mode Rendering Architecture
- ⏳ M3: Local Yjs (In Progress)
  - ✅ M3-T1: Y.Doc Schema + IndexedDB (20 unit + 3 E2E tests)
  - ✅ M3-T2: Engine Actions (createObject + moveObjects complete, 11 tests)
  - ✅ M3-T2.5: Store-Renderer Integration (bi-directional sync, all object types)
  - ✅ M3-Object-Architecture: Registry-Based Behavior System (eliminates switch statements, 34 files, 68 tests passing)
  - ⏸️ M3-T3: Selection Ownership + Clear All
  - ⏸️ M3-T4: Awareness (Cursors + Drag Ghosts)
- ⏸️ M4: Set Loader & Assets
- ⏸️ M5: Multiplayer Server
- ⏸️ M6: Frontend Multiplayer
- ⏸️ M7: Offline Support
- ⏸️ M8: Mobile & Input Polish
- ⏸️ M9: Performance & QA
- ⏸️ M10: Packaging & Documentation

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
- **CRITICAL**: Never add `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or similar suppression comments without:
  1. First attempting to fix the underlying type/lint issue properly
  2. Explicitly confirming with the user and explaining why it's necessary
  3. Providing a detailed comment explaining the reason if approved

### Deployment
- App deploys to GitHub Pages (beta.card-table.app) on merge to main
- Server deployment placeholder (future: container hosting)
- App and server deploy independently based on changes detected by PNPM

## Recent Changes

### M3 Object Architecture Refactoring (Completed 2025-11-16)
Complete refactoring from switch-statement-based object handling to modular, registry-based behavior system:
- **Phase 1**: Created object type modules (Stack, Token, Zone, Mat, Counter) with dedicated directories
- **Phase 2-3**: Replaced all switch statements in RendererCore and SceneManager with behavior registry lookups
- **Phase 4**: Added event handler infrastructure for future custom behaviors per object type
- **Architecture Benefits**:
  - Zero switch statements (eliminated 3 total)
  - Each object type isolated in own directory (constants, types, utils, behaviors, events)
  - Easy to add new object types without touching core renderer
  - Type-safe behavior implementations via TypeScript interfaces
  - Event system ready for type-specific interactions (grid snapping, card flipping, etc.)
- **Files Changed**: 34 new files, 8 modified files (-177 lines of switch statements)
- **Testing**: All 68 tests passing (52 unit + 16 integration)
- **Documentation**: Added objects/README.md and updated CLAUDE.md with architecture guide
- See `_plans/M3_object_architecture_refactor.md` for full implementation plan
- Branch: `feature/m3-object-architecture`

### M3-T2.5 Enhancements - Object Type Rendering & Hit-Testing (Completed 2025-11-16)
Polish improvements to store-renderer integration:
- **Text Labels**: All objects display their `_kind` type as text (stack, token, zone, mat, counter)
- **Refactored Shape Rendering**: Created `createBaseShapeGraphic()` as single source of truth for all object shapes
- **Fixed Hover Bug**: Objects now preserve their correct shapes during hover/selection (previously converted all to rectangles)
- **Fixed Hit-Testing**: Updated `SceneManager.getBoundingBox()` to calculate accurate bounding boxes per object type
  - Stacks: 100x140 card dimensions
  - Tokens/Mats/Counters: Circular with radius from metadata
  - Zones: Width/height from metadata
- **Enhanced Test Scene**: Reset button now spawns variety (5 stacks, 3 tokens, 2 zones, 3 mats, 2 counters) in organized layout
- Code quality: Eliminated duplication, single maintenance point for shape rendering
- Files: `app/src/renderer/RendererCore.ts`, `app/src/renderer/SceneManager.ts`, `app/src/routes/table.$id.tsx`

### M2-T5 - Object Dragging with Selection & Interaction Modes (Completed 2025-11-15)
Implemented comprehensive object manipulation with expanded scope beyond original plan:
- **Card Selection System**: Single-click select, Cmd/Ctrl multi-select, mobile toggle for touch devices
- **Multi-Card Dragging**: All selected cards move together maintaining relative positions
- **Pan/Select Mode Toggle**: Switch between pan mode (drag cards/pan camera) and select mode (draw selection rectangles)
- **Rectangle Selection**: Draw selection boxes in select mode, all touched cards are selected
- **Visual Feedback**: Red 4px border for selected cards, blue semi-transparent rectangle for selection area
- **Z-Order Management**: Dragged cards move to top using fractional indexing (CRDT-compatible)
- **Gesture Disambiguation**: Hit-test first, then check mode/modifiers to determine action
- **Performance Optimizations**: Deferred spatial index updates to pointer-up, mode-based shadow rendering
- **Bug Fixes**: Spatial index bbox caching (ghost hit-testing), selection timing (pointer-up), rectangle state preservation
- 16 Board component tests passing (4 new for interaction mode/multi-select)
- 11 SceneManager tests passing (including hitTestRect for rectangle selection)
- 300-card stress test successful with smooth 60fps performance
- Works identically in both worker and main-thread modes
- Files: `app/src/renderer/RendererCore.ts`, `app/src/renderer/SceneManager.ts`, `app/src/components/Board.tsx`, `shared/src/index.ts`

### M2-T3/T4 - E2E Test Coverage for Camera & Hover (Completed 2025-11-15)
Comprehensive E2E test suite added for camera and hover features:
- 11 camera E2E tests (pan, zoom, pinch-to-zoom, gestures)
- 8 hover E2E tests (visual feedback, pointer types, z-order)
- Tests use Chrome DevTools Protocol for multi-touch simulation
- All tests pass in both worker and main-thread modes
- Formalized M2-T3 as complete (manual camera implementation preferred over pixi-viewport)
- Confirmed unlimited zoom behavior (no artificial limits)
- Files: `app/e2e/camera.spec.ts`, `app/e2e/hover.spec.ts`

### M2-T4 - Scene Model + RBush Hit-Test (Completed 2025-11-14)
Implemented spatial indexing and hit-testing with hover feedback:
- SceneManager class with RBush spatial index
- O(log n + k) point and rect queries
- Z-order management via _sortKey sorting
- 11 unit tests covering all SceneManager functionality
- Hover feedback with smooth scale animation and diffuse shadow
- Pointer type filtering (mouse/pen only, not touch)
- Zoom-aware blur filter for consistent shadow appearance
- Works in both worker and main-thread modes
- Files: `app/src/renderer/SceneManager.ts`, `app/src/renderer/SceneManager.test.ts`

### M2-T3 - Camera & Gestures (Completed 2025-11-14)
Implemented camera controls with full gesture support:
- Manual camera implementation (world container transforms)
- Unlimited zoom in/out (no artificial limits)
- Pan with drag slop thresholds (touch: 12px, pen: 6px, mouse: 3px)
- Pinch-to-zoom with locked midpoint (correct zoom behavior)
- Smooth transition from pinch to pan
- Wheel zoom towards cursor position
- 60fps smooth rendering for all gestures
- Avoids pixi-viewport dependency issues in worker mode
- Implementation in `app/src/renderer/RendererCore.ts`

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
**M3-T2.5 Store-Renderer Integration is complete!** ✅ Full bi-directional sync between Yjs store and PixiJS renderer.

Next task: **M3-T3 - Selection Ownership + Clear All** (see `_plans/M3_yjs_local.md`)
- Implement exclusive selection system with `_selectedBy` field
- Selection actions: selectObjects, unselectObjects, clearAllSelections
- Actor ID management and conflict resolution
- When asked to plan something, always ask if it should be saved in the _plans folder