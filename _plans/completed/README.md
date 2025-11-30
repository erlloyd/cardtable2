# Completed Plans

This directory contains planning documents for completed milestones and tasks.

## Completed Milestones

### Core Infrastructure
- **M0_repo_and_tooling.md** - Initial repository setup and tooling configuration
- **M0.5_tool_upgrades.md** - Upgrade to latest stable versions (Node 24, React 19, Vite 7, etc.)
- **M1_app_shell_and_navigation.md** - App shell with React Router 7 navigation
- **tanstack_router_migration.md** - Migration to TanStack Router (later superseded by React Router 7)

### Board Core
- **M2_board_core.md** - Complete board rendering system
  - M2-T1: Basic Web Worker Communication
  - M2-T2: OffscreenCanvas + PixiJS Rendering
  - M2-T3: Camera & Gestures (manual implementation with unlimited zoom)
  - M2-T4: Scene Model + RBush Hit-Test
  - M2-T5: Object Dragging
  - M2-T6: Dual-Mode Rendering Architecture
- **M2_rendering_architecture.md** - Detailed dual-mode rendering architecture (worker + main-thread)

### Data Layer
- **M3_yjs_local.md** - Complete local Yjs implementation
  - M3-T1: Y.Doc Schema + IndexedDB
  - M3-T2: Engine Actions (createObject, moveObjects)
  - M3-T2.5: Store-Renderer Integration
  - M3-T3: Selection Ownership + Clear All
  - M3-T4: Awareness (Cursors & Drag Ghosts)
- **M3_object_architecture_refactor.md** - Registry-based object behavior system

### UI/UX
- **M3.5.1_ui_action_architecture.md** - ActionHandle component with progressive disclosure
- **M3.5.1_T6_actionhandle_positioning_fix.md** - Smart positioning with camera awareness
- **M3.5.1_T6_debug_overlay_implementation.md** - Debug overlay for coordinate validation

## Architecture Refactors

### Phase 2-4: Board Component Refactor (November 2025)
Complete restructuring of the Board component to improve maintainability and testability:

- **phase2_renderer_refactor.md** - Extracted RendererContext and managers
- **phase3_message_bus.md** - Message bus architecture for renderer-to-main communication
- **architecture_refactor_phase4_detailed.md** - Detailed plan for Phase 4 hooks extraction
- **phase4_progress.md** - Progress tracking for Phase 4 implementation
- **architecture_refactor_hybrid.md** - Hybrid approach combining architecture review and refactoring

**Results:**
- Reduced Board.tsx from 800+ lines to ~350 lines
- Created 6 reusable hooks: useRenderer, useBoardState, useStoreSync, useAwarenessSync, usePointerEvents, useWheelEvents
- Extracted message handling to BoardMessageBus class
- Improved testability with isolated, focused components
- Maintained 100% test coverage throughout refactor

## Status Summary

**Completed:** M0, M0.5, M1, M2 (all tasks), M3 (all tasks)

**In Progress:** M5 (only T1 complete - server scaffold)

**Upcoming:** M3.5 (additional functionality), M4-M10
