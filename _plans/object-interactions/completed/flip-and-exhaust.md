# Card Flip and Exhaust/Ready Actions

## Overview
Implement card flip and exhaust/ready actions for card game mechanics. These actions allow toggling face up/down state and rotating cards between ready (0°) and exhausted (90°) states.

## Status
✅ **Completed** - PR #34 (Flip), PR #36 (Exhaust/Ready)

## Tasks

### Flip Cards ✅
**Status:** Completed (PR #34)

**Objective:** Implement card flip action to toggle face up/down state.

**Spec:**
- Action: `flipCards(store, ids: string[])`
- Toggle `_faceUp` boolean for stack objects and tokens
- Affects objects with `_kind: "stack"` or `_kind: "token"`
- Non-flippable objects ignored
- Transactional update (single Y.Doc transaction)
- Visual update via renderer message

**Deliverables:**
- ✅ `flipCards` action in `YjsActions.ts`
- ✅ Renderer support for face up/down visuals
- ✅ UI trigger (keyboard shortcut 'F', context menu, command palette)
- ✅ Migration system to backfill `_faceUp` property
- ✅ Centralized object defaults system

**Test Coverage:**
- ✅ Unit: flip single card stack
- ✅ Unit: flip multiple stacks in batch
- ✅ Unit: verify non-stack objects unaffected
- ✅ Unit: verify transaction atomicity
- ✅ E2E: visual verification of flip animation
- ✅ E2E: flip state persists after refresh
- ✅ E2E: migration tests for old objects without _faceUp

### Exhaust/Ready Cards ✅
**Status:** Completed (PR #36)

**Objective:** Implement exhaust/ready action for card game mechanics.

**Spec:**
- Action: `exhaustCards(store, ids: string[])`
- Toggle rotation between 0° (ready) and 90° (exhausted)
- Only applies to objects with `_kind: "stack"`
- Non-stack objects ignored
- Transactional update (single Y.Doc transaction)
- Visual update via renderer with smooth rotation animation

**Deliverables:**
- ✅ `exhaustCards` action in `YjsActions.ts`
- ✅ Smooth rotation animation (200ms with easeOut)
- ✅ UI trigger (keyboard shortcut 'E', action handle)
- ✅ Rotation normalization to [0, 360) range

**Test Coverage:**
- ✅ Unit: exhaust single card (0° → 90°)
- ✅ Unit: ready exhausted card (90° → 0°)
- ✅ Unit: batch exhaust multiple cards
- ✅ Unit: verify non-stack objects unaffected
- ✅ Unit: verify transaction atomicity
- ✅ E2E: visual verification of rotation animation
- ✅ E2E: rotation state persists after refresh

**Note:** This implements a specific card game mechanic (exhaust/ready) rather than general rotation. A future task could implement general `rotateObjects` with arbitrary angles if needed.

## Integration Notes

### Multiplayer Considerations
All actions work correctly in multiplayer scenarios:
- Concurrent flips by different actors
- Concurrent exhaust/ready actions (last write wins)

### Renderer Updates
Each action has corresponding renderer message handling:
- `flip-cards`: Update sprite textures with flip animation
- `exhaust-cards`: Update container rotation with smooth animation

### Testing Strategy
- Unit tests for all action functions (atomicity, edge cases)
- E2E tests for visual feedback and persistence
- Multiplayer conflict tests (two-tab scenarios)
- Performance tests (batch operations on 100+ objects)
