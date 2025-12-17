# Stack and Unstack Operations

## Overview
Implement stacking and unstacking actions to merge and separate card stacks. These operations allow combining multiple stacks into one and extracting individual cards from stacks.

## Status
📋 **Planned** - Next up in object interactions theme

## Prerequisites
- Card flip and exhaust/ready actions completed ✅

## Tasks

### Stack Objects
**Objective:** Implement stacking action to create/merge stacks.

**Spec:**
- Action: `stackObjects(store, ids: string[], targetId?: string)`
- Merge multiple stacks into one
- Combine `_cards` arrays in order
- Delete source stacks, keep/create target
- Use fractional indexing for z-order
- Preserve face-up state of target (or top card)

**Deliverables:**
- `stackObjects` action in `YjsActions.ts`
- Visual feedback for stack merging
- UI trigger (drag-and-drop stacks together)

**Test Plan:**
- Unit: merge two stacks
- Unit: merge multiple stacks (3+)
- Unit: verify card order preservation
- Unit: verify source stack deletion
- E2E: drag stack onto stack to merge
- E2E: merged stack persists after refresh

### Unstack
**Objective:** Implement unstacking action to separate cards.

**Dependencies:** Stack Objects (above)

**Spec:**
- Action: `unstackCard(store, stackId, cardIndex, pos)`
- Extract single card from stack
- Create new stack with one card
- Remove card from source stack
- Position new stack at specified location
- Support "draw from top/bottom" modes

**Deliverables:**
- `unstackCard` action in `YjsActions.ts`
- Visual feedback for card separation
- UI triggers (click to draw, drag to split)

**Test Plan:**
- Unit: extract card from multi-card stack
- Unit: extract last card (stack becomes empty, deleted)
- Unit: verify source stack updates correctly
- Unit: verify new stack created with correct properties
- E2E: drag card out of stack visually
- E2E: unstacked cards persist after refresh

## Integration Notes

### Multiplayer Considerations
All actions must work correctly in multiplayer scenarios:
- Stack merging race conditions
- Unstack operations on same stack

### Renderer Updates
Each action requires corresponding renderer message handling:
- `stack-objects`: Merge visuals, delete old containers
- `unstack-card`: Create new visual, update stack count

### Testing Strategy
- Unit tests for all action functions (atomicity, edge cases)
- E2E tests for visual feedback and persistence
- Multiplayer conflict tests (two-tab scenarios)
- Performance tests (batch operations on 100+ objects)

## Notes
- These actions enhance gameplay but are not blockers for core multiplayer
- Stack/unstack UI may require gesture detection improvements
