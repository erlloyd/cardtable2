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

### M3-T2.5: Store-Renderer Integration ✅ COMPLETED (2025-11-16)
**Objective:** Connect Yjs store to PixiJS renderer with bi-directional sync so objects in the store appear on screen.

**Dependencies:** M3-T1 complete, M3-T2 createObject complete

**Spec:**
- Full bi-directional sync between Yjs store and renderer
- Store changes automatically update visuals
- User interactions (drag) update store
- Incremental updates using Yjs event system (no manual diffing)
- Reset functionality: clear store or reset to test scene
- All object types rendered as labeled shapes with text

**Phases:**

**Phase 1: Fix YjsStore Observer Pattern** ✅ COMPLETED
- ✅ Define `ObjectChanges` interface: `{added: [], updated: [], removed: []}`
- ✅ Update `onObjectsChange()` to parse Yjs Y.YEvent arrays
- ✅ Provide structured change information instead of bare callback
- ✅ Update existing usage in table route

**Phase 2: Message Types (shared/src/index.ts)** ✅ COMPLETED
- ✅ Main→Renderer: `sync-objects`, `objects-added`, `objects-updated`, `objects-removed`, `clear-objects`
- ✅ Renderer→Main: `objects-moved`

**Phase 3: Board Store Integration (Board.tsx)** ✅ COMPLETED
- ✅ Subscribe to `store.onObjectsChange()`
- ✅ Send 'sync-objects' after renderer initialized
- ✅ Forward add/update/remove messages based on ObjectChanges
- ✅ Handle 'objects-moved' messages, call moveObjects action

**Phase 4: moveObjects Action (YjsActions.ts)** ✅ COMPLETED
- ✅ Implement `moveObjects(store, updates: Array<{id, pos}>)`
- ✅ Update positions in single transaction
- ✅ Add comprehensive tests (11 unit tests passing)

**Phase 5: Renderer Message Handlers (RendererCore.ts)** ✅ COMPLETED
- ✅ Handle sync/add/update/remove/clear messages
- ✅ Update SceneManager when objects change
- ✅ Send 'objects-moved' on drag end with batched position updates

**Phase 6: Object Type Rendering (RendererCore.ts)** ✅ COMPLETED
- ✅ Refactor `createCardVisual()` → `createVisualForObject(obj)`
- ✅ Switch on `obj._kind`:
  - Stack: Portrait card (100x140) with color from metadata
  - Token: Circle with size from metadata
  - Zone: Large translucent rectangle with width/height from metadata
  - Mat: Circle (same as token, different default color)
  - Counter: Circle (same as token, different default color)
- ✅ Add text labels with PixiJS Text showing `_kind`
- ✅ Apply position and rotation
- ✅ Refactored shape rendering to eliminate duplication via `createBaseShapeGraphic()`
- ✅ Fixed hover/selection to preserve object shapes (not convert all to cards)
- ✅ Updated `SceneManager.getBoundingBox()` for accurate hit-testing per object type

**Phase 7: Reset Functionality (table.$id.tsx)** ✅ COMPLETED
- ✅ "Clear Store" button → `store.clearAllObjects()`
- ✅ "Reset Test Scene" button → clear + spawn samples
  - Enhanced to spawn variety: 5 stacks, 3 tokens, 2 zones, 3 mats, 2 counters
  - Objects arranged in organized layout for easy visual verification

**Phase 8: Testing** ✅ COMPLETED
- ✅ Manual: spawn, drag, refresh, verify persistence
- ✅ Manual: clear and reset buttons
- ✅ Unit: YjsStore observer events, moveObjects action

**Phase 9: Cleanup** ✅ COMPLETED
- ✅ Remove old test buttons and renderTestScene()
- ✅ Clean up debug logs

**Enhancements (2025-11-16):**
- ✅ Added text labels showing `_kind` on all objects (stack, token, zone, mat, counter)
- ✅ Refactored shape rendering to single source of truth (`createBaseShapeGraphic()`)
- ✅ Fixed hover/selection bug that converted all shapes to rectangles
- ✅ Fixed hit-testing for different object sizes via `SceneManager.getBoundingBox()`
- ✅ Enhanced reset scene to spawn variety of object types for better testing

**Deliverables:**
- ✅ Yjs store drives all visual rendering
- ✅ Drag operations persist to store and IndexedDB
- ✅ Reset functionality for testing
- ✅ All object types visually distinguishable with text labels
- ✅ Proper hit-testing for all object shapes
- ✅ Consistent shape rendering across all interactions (hover, drag, selection)

**Test Results:**
- ✅ E2E: Spawn card appears on screen
- ✅ E2E: Drag card, refresh, position persisted
- ✅ E2E: Clear store clears screen
- ✅ E2E: Reset test scene creates sample objects
- ✅ Unit: YjsStore provides correct change events
- ✅ Unit: moveObjects updates positions correctly (11 tests passing)

**Known Issues / TODO:**
- ❌ **Z-order persistence**: When dragging an object, the renderer updates its `_sortKey` to bring it to the front. However, this sortKey change is NOT synced back to the store. Result: dragged object positions persist after refresh, but z-order reverts to original. Need to determine proper fix - possibly a separate `reorderObjects` action or extending `moveObjects` to handle sortKey updates.

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
  - `{drag:{gid,ids,pos,ts}}` - uses absolute position instead of anchor+deltas for simplicity and resilience to dropped frames
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