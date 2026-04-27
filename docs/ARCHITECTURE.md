# Architecture

Detailed architectural reference for Cardtable 2.0. Loaded on-demand — see CLAUDE.md for the focused rule-set.

## Project Overview

Cardtable 2.0 is a solo-first virtual card table with optional multiplayer support. It's designed to handle any card/board game through manifest-only content (no game rules in code).

- **Frontend**: React 19 + TypeScript + PixiJS (Vite 7)
- **Backend**: Node 24 + Express 5 + y-websocket
- **Shared**: Common TypeScript types
- **Monorepo**: PNPM workspaces

## Technology Stack

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
├── docs/               # On-demand reference docs (this folder)
└── .github/
    └── workflows/
        ├── ci.yml           # CI/CD checks (lint, test, typecheck)
        ├── deploy.yml       # Production deployment (GitHub Pages + Railway)
        ├── pr-deploy.yml    # PR preview deployments
        └── cleanup-pr.yml   # PR environment cleanup
```

## Data Model

- All table objects use `_` prefixed properties for system fields
- Every card or group of cards is a "stack" (even single cards)
- Object types: `stack`, `token`, `zone`, `mat`, `counter`
- Yjs for CRDT-based multiplayer sync

## Rendering Architecture

- Dual-mode rendering: Worker-based (OffscreenCanvas) OR Main-thread (regular canvas)
- Worker mode for best performance on desktop/modern mobile (60fps with 300+ objects)
- Main-thread mode for maximum compatibility (iOS 16.x, debugging, user preference)
- Shared core logic (SceneManager, HitTester, InputHandler, RenderCore)
- User-toggleable in settings (auto-detect, force mode, debug tools)
- See `_plans/board-rendering/completed/` for detailed architecture documentation

### PixiJS Ticker Management

**CRITICAL**: PixiJS is configured with `autoStart: false` to prevent iOS worker crashes. Any code that uses animations via `app.ticker` **must manually start the ticker**:

```typescript
this.app.ticker.add(callback);
if (!this.app.ticker.started) {
  this.app.ticker.start();
}
```

This is intentional for performance: ticker only runs when animations are active. Ticker should be stopped when animations complete to save CPU cycles.

### High-Frequency Event Handlers (pointermove, scroll, etc.)

- Be suspicious of any work done on every pointer move. Pointer events fire 60-120+ times/second — only do work per-move if there is no better alternative.
- Prefer direct DOM mutation (via refs) over React state for values that change at pointer frequency.
- Prefer checks that bail out early (e.g., "has the value actually changed?") over unconditional updates.

## Object Architecture

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

## Shared Package

- Direct TypeScript imports (no build step)
- Contains common types used by both app and server
- Located at `@cardtable2/shared`

## Performance Targets

- 60 fps on mobile/desktop
- Sub-2ms hit-testing
- 300-500 object scenes
- 30Hz awareness updates

## Project Status & Planning

The folder structure is the source of truth.

Plans are organized by **theme** with **status** subfolders:

- **Themes**: core-infrastructure, board-rendering, data-layer, object-interactions, multiplayer, content-assets, ux-polish, performance, production, architecture
- **Status folders**: completed/, in-progress/, planned/, future/, reference/
- **Find work status**: Browse `_plans/{theme}/{status}/` directly — the folder location tells you the status
- **Structure overview**: See `_plans/README.md` for workflow and conventions

Don't look for status summaries in README files — just browse the folders to see what's completed, in-progress, planned, or future.
