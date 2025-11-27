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
- ✅ M3: Local Yjs (COMPLETED)
  - ✅ M3-T1: Y.Doc Schema + IndexedDB (20 unit + 3 E2E tests)
  - ✅ M3-T2: Engine Actions - Core (createObject + moveObjects, 11 tests)
  - ✅ M3-T2.5: Store-Renderer Integration (bi-directional sync, all object types)
  - ✅ M3-Object-Architecture: Registry-Based Behavior System (eliminates switch statements, 34 files, 68 tests passing)
  - ✅ M3-T3: Selection Ownership + Clear All (22 unit + 5 E2E tests, drag regression fixed)
  - ✅ M3-T4: Awareness - Cursors & Drag Ghosts (17 tests, PR #13 merged)
- 🚧 M5: Multiplayer Server (IN PROGRESS)
  - ✅ M5-T1: WS Server Scaffold (9 tests, Railway deployment, Docker + CI/CD)
  - ⏸️ M5-T2: Persistence Adapter (NEXT - LevelDB integration)
  - ⏸️ M5-T3: TTL Sweeper
- ⏸️ M3.5: Additional Functionality (flip, rotate, stack, unstack)
- ⏸️ M4: Set Loader & Assets
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

#### E2E Testing Best Practices

**Testing Pointer Events on Canvas:**
When writing E2E tests that interact with canvas elements (especially React components with `onPointerDown/Up/Move` handlers):

1. **Don't use `page.mouse`** - It dispatches `mousedown/mousemove/mouseup` events, which won't trigger React's `onPointer*` handlers
2. **Use `canvas.dispatchEvent()`** instead:
   ```typescript
   await canvas.dispatchEvent('pointerdown', {
     bubbles: true,
     cancelable: true,
     composed: true,
     pointerId: 1,
     pointerType: 'mouse',
     isPrimary: true,
     clientX: viewportX,
     clientY: viewportY,
     screenX: viewportX,
     screenY: viewportY,
     pageX: viewportX,
     pageY: viewportY,
     button: 0,
     buttons: 1,
   });
   ```
3. **Coordinate Systems Matter**:
   - World coordinates: Object positions in the game/scene space
   - Canvas-relative: `worldX + canvasWidth/2, worldY + canvasHeight/2`
   - Viewport-absolute: Canvas-relative + canvas bounding box offset
   - `clientX/clientY` in pointer events are **viewport-absolute**, not canvas-relative
4. **Always query canvas position dynamically**:
   ```typescript
   const canvasBBox = await canvas.boundingBox();
   const viewportX = canvasBBox.x + canvasRelativeX;
   const viewportY = canvasBBox.y + canvasRelativeY;
   ```
5. **Why this matters**: Canvas position in the viewport can change due to layout, responsive design, or viewport size. Dynamic queries ensure tests remain robust.

See `e2e/selection.spec.ts:362` ("clicking on an unselected object selects it") for a complete example.

### Code Style
- TypeScript strict mode enabled
- ESLint + Prettier configured
- Pre-commit hooks auto-format code
- Pre-push hooks run typecheck
- **CRITICAL - NEVER VIOLATE THIS RULE**: Suppression comments are FORBIDDEN without explicit user approval
  - **NEVER** add `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or similar comments
  - **ALWAYS** fix the underlying type/lint issue properly first
  - Common solutions:
    - Type assertions: `import('module') as { export: Type }`
    - Proper type imports: `import type { Type } from 'module'`
    - Type guards and narrowing
    - Refactoring to satisfy type safety
  - **ONLY IF** a proper fix is impossible:
    1. Stop and ask the user for permission
    2. Explain why suppression is necessary
    3. Wait for explicit approval before proceeding
  - If you add a suppression comment without asking first, you have failed

### Deployment
- App deploys to GitHub Pages (beta.card-table.app) on merge to main
- Server deployment placeholder (future: container hosting)
- App and server deploy independently based on changes detected by PNPM

## Recent Changes

### M3.5.1-T6 - ActionHandle Component with Smart Positioning (Completed 2025-11-27)
Progressive disclosure action bar with PixiJS coordinate integration:
- **Progressive Disclosure UI**: Collapsed by default (small icon), expands on hover/click/E key
- **PixiJS Coordinate Integration**: Uses PixiJS `toGlobal()` for pixel-perfect DOM positioning
  - Renderer calculates screen coordinates using `visual.toGlobal()` and `devicePixelRatio`
  - Coordinates passed to React via `screenCoords` array in `objects-selected` message
  - Single source of truth: PixiJS handles all camera transforms automatically
- **Camera Operation Handling**: Hide-during-operation pattern for performance
  - Hides overlay during pan/zoom/drag operations (no expensive 60fps DOM updates)
  - Re-shows with fresh coordinates after operation completes
  - Debounced zoom-ended messages (150ms) to avoid flickering
- **Smart Positioning**: Fallback logic tries top → right → left → bottom → center
- **Touch-Aware Design**: Larger hit targets on touch devices (44x44px vs 28x28px)
- **Keyboard Shortcuts**: E to toggle, Escape to collapse
- **Testing**: 529 unit tests + 6 E2E tests passing
  - Tests cover appearance, movement, camera operations, positioning fallback
  - All tests use proper pointer event dispatching (not `page.mouse`)
- **Architecture**: Message-based async coordinate pattern prevents race conditions
- **Files**: ActionHandle.tsx, DebugOverlay.tsx (for validation), debounce.ts utility
- **Documentation**: Two detailed plan documents in `_plans/` directory
- Branch: `feature/m3.5.1-t6-action-handle`

### M5-T1 - WS Server Scaffold + Railway Deployment (Completed 2025-11-21)
Complete multiplayer server infrastructure with automated deployment:
- **Server Implementation**: Express + y-websocket server with WebSocket upgrade handling
  - Health check endpoint (`GET /health`)
  - Room-based synchronization via query params (`?room=<roomId>`)
  - Uses `@y/websocket-server` for server-side Yjs coordination
  - Port configuration via `PORT` env var (default 3001)
- **Testing**: 9 comprehensive API tests
  - Health endpoint verification (2 tests)
  - WebSocket connection handling (2 tests)
  - Y.js synchronization between clients (2 tests)
  - Room isolation verification (3 tests)
  - Tests use `y-websocket` client library to verify server behavior
- **Docker Infrastructure**: Multi-stage production-ready Dockerfile
  - Builder stage: TypeScript compilation with PNPM workspaces
  - Production stage: Node 24 slim with tini for signal handling
  - Optimized for Railway deployment
- **Railway Deployment**: Full CI/CD automation via GitHub Actions
  - Production: `cardtable2-server-production.up.railway.app`
  - PR Previews: `cardtable2-server-pr-{number}-prs.up.railway.app`
  - Docker images pushed to GHCR (GitHub Container Registry)
  - Automated service creation/redeployment via Railway GraphQL API
  - Environment-specific configurations (production + PR environments)
  - App deployment includes server URL injection (`VITE_WS_URL`)
- **CI/CD Workflows**:
  - Selective deployment based on PNPM change detection
  - Docker build caching for faster deployments
  - 3-minute deployment timeout with status polling
  - Health check verification
- **Next Steps**: M5-T2 Persistence Adapter (LevelDB integration for document persistence)
- Files: `server/src/index.ts`, `server/src/index.test.ts`, `server/Dockerfile`, `.github/workflows/deploy.yml`, `.github/workflows/pr-deploy.yml`, `.github/scripts/deploy-railway.sh`
- Branch: `feature/m5-t1-tests`

### Milestone Reordering (2025-11-17)
Reorganized project roadmap to prioritize multiplayer implementation:
- **M3 Complete**: All local Yjs tasks finished (112 unit + 41 E2E tests passing)
- **M3-T4 Merged**: Awareness features (cursors & drag ghosts) completed in PR #13
- **New Milestone Order**:
  1. M5 — Multiplayer Server (NEXT)
  2. M3.5 — Additional Functionality (flip, rotate, stack, unstack)
  3. M4 — Set Loader & Assets
  4. M6-M10 — Remaining milestones
- **Rationale**: M3-T4 awareness features are designed for multiplayer. Completing M5 next enables real multiplayer testing, while additional object actions (M3.5) enhance gameplay but aren't blockers for core multiplayer functionality.
- **Deferred Actions**: Moved `flipCards`, `rotateObjects`, `stackObjects`, `unstack` from M3-T2 to new M3.5 milestone
- Files updated: `_plans/M3_yjs_local.md`, new `_plans/M3.5_additional_functionality.md`, `CLAUDE.md`

### M3-T4 - Awareness (Cursors & Drag Ghosts) (Completed 2025-11-17)
Complete awareness system for real-time remote cursor and drag ghost rendering:
- **Infrastructure**: Integrated `y-protocols/awareness` with YjsStore, created reusable 30Hz throttle utility
- **Features**:
  - Remote cursor rendering (blue triangle with actor labels)
  - Drag ghost rendering (semi-transparent object copies)
  - 30Hz throttled awareness updates
  - Simulation UI for testing without multiplayer
- **Architecture**: Message passing Store → Board → Renderer, ephemeral state (not persisted), drop-in compatible with y-websocket
- **Testing**: 10 unit tests (YjsStore awareness), 7 unit tests (throttle), 6 E2E tests (simulation UI)
- **Copilot Feedback Addressed**:
  - Split simulation interval refs (defensive programming)
  - Drag ghost now updates when dragged object IDs change
- Files: `YjsStore.ts` (+127), `RendererCore.ts` (+257), `Board.tsx` (+77), new `throttle.ts`
- Branch: `feature/m3-t4-awareness`, merged via PR #13

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
  - Stacks: Dimensions from `STACK_WIDTH` and `STACK_HEIGHT` constants (see `app/src/renderer/objects/stack/constants.ts`)
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