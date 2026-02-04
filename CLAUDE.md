# Claude Development Context

This file contains important context and instructions for Claude when working on this project.

## Project Overview

Cardtable 2.0 is a solo-first virtual card table with optional multiplayer support. It's designed to handle any card/board game through manifest-only content (no game rules in code).

### Architecture
- **Frontend**: React 19 + TypeScript + PixiJS (Vite 7)
- **Backend**: Node 24 + Express 5 + y-websocket
- **Shared**: Common TypeScript types
- **Monorepo**: PNPM workspaces

### Technology Stack
- **Node.js**: v24 (LTS Krypton)
- **React**: 19.2.0
- **TanStack Router**: 1.136.1
- **Vite**: 7.2.2
- **Vitest**: 4.0.8
- **Playwright**: 1.56.1
- **Headless UI**: 2.2.9
- **PixiJS**: 8.14.1
- **Express**: 5.1.0
- **Yjs (app)**: 13.6.27
- **Yjs (server)**: 13.6.20
- **y-websocket**: 3.0.0
- **TypeScript**: 5.7.2
- **ESLint**: 9.15.0
- **Prettier**: 3.4.1

## Project Structure

```
/
├── _plans/               # Planning documents organized by theme and status
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
│   ├── src/
│   │   └── index.ts    # Express + WebSocket server
│   └── Dockerfile      # Production container image
└── .github/
    └── workflows/
        ├── ci.yml           # CI/CD checks (lint, test, typecheck)
        ├── deploy.yml       # Production deployment (GitHub Pages + Railway)
        ├── pr-deploy.yml    # PR preview deployments
        └── cleanup-pr.yml   # PR environment cleanup
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

## Verification Requirements

**CRITICAL - ALWAYS VERIFY BEFORE STATING FACTS:**

1. **Background Tasks**: Before claiming how many tasks are running or their status, ALWAYS run `/tasks` or check the actual task list
2. **File Contents**: Before claiming what's in a file, ALWAYS read it first
3. **Command Output**: Before claiming what a command will output, ALWAYS run it first
4. **Test Results**: Before claiming tests pass, ALWAYS run them first
5. **Code Behavior**: Before claiming how code behaves, ALWAYS trace through it or test it

**Never say:**
- "There is only one X" without checking
- "This will do Y" without verifying
- "The file contains Z" without reading it
- "X should work" without testing it

**Always say:**
- "Let me check..." then verify
- "Let me run..." then execute
- "Let me read..." then examine
- If you make a claim and are proven wrong, immediately acknowledge the error and correct it

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
- See `_plans/board-rendering/completed/` for detailed architecture documentation

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

### CI/CD & Deployment
- **Feature branch workflow**: All development on feature branches
- **Main branch protected**: Only merge via tested feature branches
- **Selective deployment**: Only deploys changed packages on main
- **PNPM filtering**: Detects which packages have changed
- **Changes to shared**: Triggers both app and server deployments

#### GitHub Actions Workflows
1. **ci.yml** - Continuous Integration checks on all PRs:
   - Linting (ESLint)
   - Type checking (TypeScript)
   - Format checking (Prettier)
   - Unit tests (Vitest)
   - E2E tests (Playwright)
   - Build verification

2. **deploy.yml** - Production deployment (main branch only):
   - **App**: Deploys to GitHub Pages at `beta.card-table.app`
   - **Server**: Builds Docker image and deploys to Railway at `cardtable2-server-production.up.railway.app`
   - **Image registry**: Pushes to GitHub Container Registry (GHCR)
   - **Selective deployment**: Only builds/deploys changed components

3. **pr-deploy.yml** - PR preview environments:
   - Creates Railway preview services per PR
   - Builds Docker images for both app and server
   - Provides unique URLs for testing (e.g., `cardtable2-pr-123.up.railway.app`)
   - Only builds on first PR build or when package changes

4. **cleanup-pr.yml** - Resource cleanup:
   - Automatically removes Railway services when PR is closed
   - Keeps infrastructure costs manageable

#### Production Hosting
- **Railway (https://railway.app/)** - Current production platform:
  - WebSocket support for y-websocket backend
  - Automatic PR preview deployments for both app and server
  - Single platform for full-stack deployment
  - Container-based deployment using Docker
  - Cost-effective usage-based pricing
  - Environment variables managed via Railway CLI and GitHub Actions

## Performance Targets
- 60 fps on mobile/desktop
- Sub-2ms hit-testing
- 300-500 object scenes
- 30Hz awareness updates

## Project Status & Planning

**The folder structure is the source of truth.**

Plans are organized by **theme** with **status** subfolders:
- **Themes**: core-infrastructure, board-rendering, data-layer, object-interactions, multiplayer, content-assets, ux-polish, performance, production, architecture
- **Status folders**: completed/, in-progress/, planned/, future/, reference/
- **Find work status**: Browse `_plans/{theme}/{status}/` directly - the folder location tells you the status
- **Structure overview**: See `_plans/README.md` for workflow and conventions

Don't look for status summaries in README files - just browse the folders to see what's completed, in-progress, planned, or future.

## Important Notes

### Branching Strategy

**CRITICAL - NEVER PUSH TO MAIN WITHOUT EXPLICIT CONFIRMATION:**

1. **DEFAULT BEHAVIOR**: ALL work MUST be done on feature branches
   - Always create a feature branch for any work
   - Branch naming: `feature/{theme}-{description}` or `fix/{description}`
   - Example: `feature/zoom-quality`, `fix/selection-bug`

2. **BEFORE EVERY PUSH**:
   - Check current branch with `git branch --show-current`
   - If on `main`, STOP immediately
   - Ask user: "I'm currently on main. Should I push to main or create a feature branch?"
   - WAIT for explicit user confirmation before pushing to main

3. **NEVER ASSUME**:
   - Do NOT push to main just because changes look ready
   - Do NOT push to main because tests pass
   - Do NOT push to main because user said "push" (they might mean push feature branch)
   - ALWAYS explicitly confirm with user if pushing to main

4. **ONLY PUSH TO MAIN WHEN**:
   - User explicitly says "push to main" or "push this to main"
   - User confirms "yes" when you ask about pushing to main
   - User gives unambiguous instruction to commit/push directly to main

5. **AFTER FEATURE WORK**:
   - Push feature branch to remote
   - Let user decide when/how to merge to main
   - CI/CD deploys automatically when main is updated

**Why this matters**: Direct pushes to main trigger production deployments. Always use feature branches for safety.

### Testing Workflow

**CRITICAL: Always test before committing!**

Before attempting to commit code, you MUST run tests to ensure they pass:

```bash
# Run unit tests for specific modules
pnpm --filter @cardtable2/app test <pattern>   # e.g., "migrations", "ObjectDefaults"

# Run all unit tests
pnpm run test

# Run E2E tests (takes longer, run after unit tests pass)
cd app && pnpm run test:e2e
```

**Why this matters:**
- Pre-commit hooks run linting/formatting checks that often fail if tests weren't run first
- Type errors and lint issues are caught earlier when tests run first
- Saves time by catching issues before the commit hook runs
- Avoids frustrating commit failures and git stash cycles

**Best Practice Workflow:**
1. Write/modify code
2. Run relevant unit tests: `pnpm --filter @cardtable2/app test <module>`
3. Fix any test failures
4. Run linting: `pnpm run lint`
5. Run type check: `pnpm run typecheck`
6. If all pass, attempt commit
7. Run E2E tests before pushing: `cd app && pnpm run test:e2e`

### Testing
- Unit tests use Vitest
- E2E tests use Playwright
- All tests must pass before merge to main

### Pre-Push Checklist

Before pushing to remote, the following checks MUST pass (enforced by Git hooks and CI):

**Git Hooks:**
- **pre-commit**: `npx lint-staged` (auto-formats staged files)
- **pre-push**:
  - `pnpm run typecheck` (TypeScript type checking)
  - `pnpm run format:check` (Prettier formatting verification)

**CI Checks** (run on pull requests):
1. **Lint**: `pnpm run lint` (ESLint)
2. **Type Check**: `pnpm run typecheck` (TypeScript)
3. **Format Check**: `pnpm run format:check` (Prettier)
4. **Unit Tests**: `pnpm run test` (Vitest)
5. **E2E Tests**: `cd app && pnpm run test:e2e` (Playwright)
6. **Build**: `pnpm --filter @cardtable2/app build` + `pnpm --filter @cardtable2/server build`

**Quick validation before pushing:**
```bash
pnpm run validate  # Runs: lint + typecheck + test + build
```

**Fix common issues:**
```bash
pnpm run format      # Auto-fix formatting issues
pnpm run lint        # Check for lint errors
pnpm run typecheck   # Check for type errors
```

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
- **CRITICAL - AVOID TYPEOF CHECKS**: Do NOT use `typeof` or string comparisons for type validation as the default solution
  - **NEVER** use `typeof x === 'string'`, `typeof x === 'number'`, `typeof x === 'boolean'`, etc. without explicit justification
  - **NEVER** use string comparisons for property names like `'propertyName' in obj` as a type guard pattern
  - **Trust the type system**: If TypeScript types indicate a value should exist and be of a certain type, trust it
  - If data could genuinely be missing/corrupt, that's a data integrity issue - log it, handle it properly, don't silently default
  - Better solutions:
    - Proper TypeScript type assertions when you know the type
    - Type guards for legitimate runtime checks at system boundaries (user input, external APIs, deserialization)
    - Validation libraries (Zod, io-ts) for complex validation needs
    - Fix the root cause: ensure data is always in the correct state
  - **WHEN typeof IS ACCEPTABLE**:
    - At system boundaries (parsing user input, external API responses)
    - When using proper validation libraries that abstract the typeof checks
    - When the User explicitly requests runtime type checking
  - If you use typeof for internal type validation, you have failed
- **CRITICAL - NEVER USE INLINE IMPORTS**: Do NOT use inline `import()` expressions for type casting without explicit user approval
  - **NEVER** use patterns like `as import('@module').Type`
  - **ALWAYS** add proper import statements at the top of the file
  - Inline imports make code harder to read, harder to search, and bypass IDE tooling
  - **Proper approach**:
    ```typescript
    // At top of file
    import type { StackObject } from '@cardtable2/shared';

    // In code
    const stackObj = obj as StackObject;
    ```
  - **Bad approach**:
    ```typescript
    const stackObj = obj as import('@cardtable2/shared').StackObject;
    ```
  - If you use inline imports without asking first, you have failed

### Container Deployment
- **Docker support**: Multi-stage Dockerfiles for production builds
- **Base image**: Node.js 24-slim for minimal footprint
- **Process manager**: Tini for proper signal handling and zombie reaping
- **Registry**: Images pushed to GitHub Container Registry (ghcr.io)
- **Production runtime**: Railway container platform

## Planning & Documentation

When asked to plan something, always ask if it should be saved in the `_plans/` folder.

Plans are organized by theme with status subfolders:
- Place new plans in the appropriate theme folder (`object-interactions/`, `multiplayer/`, etc.)
- Use status subfolders: `planned/` for ready work, `in-progress/` for active work, `completed/` for finished work
- See `_plans/README.md` for the complete structure and guidelines