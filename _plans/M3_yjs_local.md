# Milestone 3 — Yjs (Local)

## Overview
Implement local-first collaborative data model using Yjs with IndexedDB persistence, selection ownership, and awareness features.

## Prerequisites
- Milestone 2 completed (board core with rendering and hit-testing)

## Data Model
```typescript
// Y.Doc structure
objects: Y.Map<string, Y.Map> // keyed by object ID
  - _kind: "card" | "stack" | "token" | "zone" | "mat"
  - _containerId: string | null
  - _pos: { x: number, y: number, r: number } // absolute world coordinates
  - _sortKey: string // fractional index for ordering
  - _locked: boolean
  - _selectedBy: actorId | null // exclusive selection
  - _meta: Y.Map // freeform metadata

// Awareness (ephemeral)
- cursor: {x, y}
- drag: {gid, ids, anchor, dx, dy, dr, ts}
- hover, lasso, tool mode
```

## Tasks

### M3-T1: Y.Doc Schema + IndexedDB ✅ COMPLETED (2025-11-15)
**Objective:** Set up Yjs document structure with local persistence.

**Dependencies:** M2 complete

**Spec:**
- `objects` Y.Map with defined schema fields
- IndexedDB adapter for Y.Doc persistence
- Auto-save on changes
- Restore state on reload

**Deliverables:**
- ✅ Y.Doc schema types and initialization (`shared/src/index.ts`)
- ✅ IndexedDB persistence adapter (y-indexeddb)
- ✅ Auto-save mechanism (automatic via y-indexeddb)
- ✅ State restoration on app load (YjsStore.waitForReady())

**Implementation Details:**
- Created `YjsStore` class in `app/src/store/YjsStore.ts`
  - Wraps Y.Doc with type-safe accessors
  - Automatic IndexedDB persistence via y-indexeddb
  - Unique actor ID per store instance (UUID v4)
  - Change observers using `observeDeep` for nested Y.Map updates
  - Database naming: `cardtable-{tableId}` for per-table isolation
- Integrated at table route level (`app/src/routes/table.$id.tsx`)
  - Store initialization with React strict mode guards
  - Object count tracking and display
  - Global `window.__TEST_STORE__` for E2E testing (dev only)
- Added `toJSON()` debug helper for console inspection
- Dependencies: yjs@13.6.27, y-indexeddb@9.0.12, uuid@13.0.0

**Test Results:**
- ✅ E2E: 3/3 tests passing
  - State persistence across page reloads
  - Multiple tables with separate IndexedDB databases
  - Store initialization and ready status
- ✅ Unit: 20/20 tests passing (YjsStore.test.ts)
  - Initialization and actor ID uniqueness
  - CRUD operations (create, read, update, delete)
  - Change observers and subscriptions
  - Cleanup and destroy
- ✅ All existing tests still passing (52 unit, 30 E2E)

### M3-T2: Engine Actions
**Objective:** Implement core object manipulation actions with transactional updates.

**Dependencies:** M3-T1

**Spec:**
- Actions execute in Y.Doc transactions
- Each action is atomic
- Actions:
  - `createObject`: spawn new objects
  - `moveObjects`: update positions
  - `flipCards`: toggle face up/down
  - `rotateObjects`: change rotation
  - `stackObjects`: create/merge stacks
  - `unstack`: separate from stack

**Deliverables:**
- Action functions with Y.Doc transactions
- Type-safe action interfaces
- Undo/redo support via Yjs

**Test Plan:**
- Unit: apply each action to fresh doc, assert field changes
- Unit: verify transaction atomicity
- Unit: test undo/redo functionality

**Status:** In Progress
- ✅ createObject (completed 2025-11-15)
- ⏸️ moveObjects (pending)
- ⏸️ flipCards (pending)
- ⏸️ rotateObjects (pending)
- ⏸️ stackObjects (pending)
- ⏸️ unstack (pending)

### M3-T2.5: Store-Renderer Integration
**Objective:** Connect Yjs store to PixiJS renderer with bi-directional sync so objects in the store appear on screen.

**Dependencies:** M3-T1 complete, M3-T2 createObject complete

**Spec:**
- Full bi-directional sync between Yjs store and renderer
- Store changes automatically update visuals
- User interactions (drag) update store
- Incremental updates using Yjs event system (no manual diffing)
- Reset functionality: clear store or reset to test scene
- All object types rendered as labeled rectangles initially

**Phases:**

**Phase 1: Fix YjsStore Observer Pattern**
- Define `ObjectChanges` interface: `{added: [], updated: [], removed: []}`
- Update `onObjectsChange()` to parse Yjs Y.YEvent arrays
- Provide structured change information instead of bare callback
- Update existing usage in table route

**Phase 2: Message Types (shared/src/index.ts)**
- Main→Renderer: `sync-objects`, `add-object`, `update-object`, `remove-object`, `clear-objects`
- Renderer→Main: `object-moved`, `objects-moved`

**Phase 3: Board Store Integration (Board.tsx)**
- Subscribe to `store.onObjectsChange()`
- Send 'sync-objects' after renderer initialized
- Forward add/update/remove messages based on ObjectChanges
- Handle 'object-moved' messages, call moveObjects action
- Track drag ownership to prevent update echo

**Phase 4: moveObjects Action (YjsActions.ts)**
- Implement `moveObjects(store, updates: Array<{id, pos}>)`
- Update positions in single transaction
- Add comprehensive tests

**Phase 5: Renderer Message Handlers (RendererCore.ts)**
- Handle sync/add/update/remove/clear messages
- Update SceneManager when objects change
- Send 'object-moved' on drag end

**Phase 6: Object Type Rendering (RendererCore.ts)**
- Refactor `createCardVisual()` → `createVisualForObject(obj)`
- Switch on `obj._kind`:
  - Stack: 100x140 blue rect, "STACK (n)"
  - Token: 60x60 red square, "TOKEN"
  - Zone: 400x300 green translucent rect, "ZONE"
  - Mat: 500x350 purple translucent rect, "MAT"
  - Counter: 40x40 orange square, number or "COUNTER"
- Add text labels with PixiJS Text
- Apply position and rotation

**Phase 7: Reset Functionality (table.$id.tsx)**
- "Clear Store" button → `store.clearAllObjects()`
- "Reset Test Scene" button → clear + spawn samples (2 stacks, token, zone, counter)

**Phase 8: Testing**
- Manual: spawn, drag, refresh, verify persistence
- Manual: clear and reset buttons
- Unit: YjsStore observer events, moveObjects action

**Phase 9: Cleanup**
- Remove old test buttons and renderTestScene()
- Clean up debug logs

**Deliverables:**
- Yjs store drives all visual rendering
- Drag operations persist to store and IndexedDB
- Reset functionality for testing
- All object types visually distinguishable

**Test Plan:**
- E2E: Spawn card appears on screen
- E2E: Drag card, refresh, position persisted
- E2E: Clear store clears screen
- E2E: Reset test scene creates sample objects
- Unit: YjsStore provides correct change events
- Unit: moveObjects updates positions correctly

### M3-T3: Selection Ownership + Clear All
**Objective:** Implement exclusive selection system with ownership tracking.

**Dependencies:** M3-T2.5 (store-renderer integration)

**Spec:**
- `_selectedBy` field for exclusive ownership
- Selection fails if object owned by another actor
- Actions:
  - `selectObjects`: claim ownership
  - `unselectObjects`: release ownership
  - `clearAllSelections({excludeDragging:true})`: force clear

**Deliverables:**
- Selection action implementations
- Actor ID generation and management
- Conflict resolution logic
- "Clear All Selections" UI trigger

**Test Plan:**
- Unit: two actors contend for selection, verify exclusivity
- Unit: clear all frees non-dragging objects
- E2E: selection UI reflects ownership state

### M3-T4: Awareness (Cursors + Drag Ghosts)
**Objective:** Implement real-time awareness for cursors and drag operations.

**Dependencies:** M3-T3

**Spec:**
- 30Hz update rate
- Payload formats:
  - `{cursor:{x,y}}`
  - `{drag:{gid,ids,anchor,dx,dy,dr,ts}}`
- Lerp interpolation on receive
- <150ms observed latency

**Deliverables:**
- Awareness state management
- 30Hz throttling mechanism
- Interpolation system for smooth movement
- Drag ghost rendering

**Test Plan:**
- Two-tab local test: verify awareness sync
- Measure latency <150ms
- Verify 30Hz update rate
- Test interpolation smoothness