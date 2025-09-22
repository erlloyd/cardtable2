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

### M3-T1: Y.Doc Schema + IndexedDB
**Objective:** Set up Yjs document structure with local persistence.

**Dependencies:** M2 complete

**Spec:**
- `objects` Y.Map with defined schema fields
- IndexedDB adapter for Y.Doc persistence
- Auto-save on changes
- Restore state on reload

**Deliverables:**
- Y.Doc schema types and initialization
- IndexedDB persistence adapter
- Auto-save mechanism
- State restoration on app load

**Test Plan:**
- E2E: create objects, reload page, verify state restored offline
- Unit: verify schema structure and field types
- Unit: IndexedDB save/load operations

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

### M3-T3: Selection Ownership + Clear All
**Objective:** Implement exclusive selection system with ownership tracking.

**Dependencies:** M3-T2

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