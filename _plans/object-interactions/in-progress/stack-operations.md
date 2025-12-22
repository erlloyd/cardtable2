# Stack and Unstack Operations

## Overview
Implement stacking and unstacking actions to merge and separate card stacks. These operations allow combining multiple stacks into one and extracting individual cards from stacks.

**CRITICAL:** All stack operations and visuals apply ONLY to `ObjectKind.Stack` - not tokens, zones, mats, or other object types.

## Status
🚧 **In Progress** - Visual design and core actions being implemented

## Prerequisites
- Card flip and exhaust/ready actions completed ✅

## Visual Design

### Stack Appearance (2+ Cards)
Stacks with 2+ cards display three visual elements:

1. **3D Effect**: Grey rectangle offset lower-left behind the card
   - Only visible for stacks with `_cards.length >= 2`
   - Rotates with card rotation (`_rotation`)
   - Fixed opacity/color (to be determined during implementation)

2. **Count Badge**: Shows number of cards in stack
   - Position: Top-center of card
   - Style: Dark circular background, white text, slightly transparent
   - Always visible for stacks with 2+ cards
   - Remains visible when stack is selected (renders on top of selection indicator)

3. **Unstack Handle**: Icon for extracting cards
   - Position: Upper-right corner of card
   - Style: Similar to count badge (dark circle, slightly transparent)
   - Icon: To be designed (arrow/separation symbol)
   - Always visible for stacks with 2+ cards
   - Remains visible when stack is selected

### Single Card Appearance (1 Card)
Stacks with 1 card display as a plain card with no additional elements.

**Note:** Current rendering uses placeholder colored rectangles (no card images yet).

## Tasks

### Visual Stack Rendering
**Objective:** Implement visual distinction for multi-card stacks.

**Spec:**
- Enhance stack rendering in `app/src/renderer/objects/stack/behaviors.ts`
- Add 3D effect (grey rectangle offset lower-left) for 2+ card stacks
- Add count badge (top-center) showing `_cards.length`
- Add unstack handle (upper-right corner) for interaction
- All elements rotate with card rotation
- Badge and handle render on top of selection indicator

**Deliverables:**
- Updated `StackBehaviors.render()` function
- Visual elements scale appropriately with card dimensions
- Handle hit-test region for unstack interaction

**Test Plan:**
- Visual: Single card shows no badge/handle/3D effect
- Visual: 2+ card stack shows all three elements
- Visual: Elements rotate with exhausted/rotated cards
- Visual: Elements remain visible when stack selected
- E2E: Verify rendering at different zoom levels

### Stack Objects Action
**Objective:** Implement stacking action to merge stacks via drag-and-drop.

**Spec:**
- Action: `stackObjects(store, ids: string[], targetId?: string)`
  - `targetId` optional: if not provided, use first id in `ids` array
  - Error if `targetId` appears in `ids` array
- **Physical card behavior**: All cards from source stacks placed on top of target stack's cards
  - Target stack cards remain at bottom
  - Source stacks placed on top in any order (order between source stacks doesn't matter)
  - Card order within each individual stack preserved
- **Target stack state wins**: Merged stack uses target's `_faceUp` and `_exhausted` states
  - All cards adopt target's face-up/face-down state
  - All cards adopt target's exhausted/ready state
- Target stack position preserved
- Source stacks deleted after merge
- Use fractional indexing for z-order

**Deliverables:**
- `stackObjects` action in `YjsActions.ts`
- Drag-and-drop trigger: when dragging selected stacks onto a target stack
- Visual indication on target stack when within distance threshold
  - Threshold: Center-to-center distance (to be determined based on card size)
- Single `stackObjects` call at drag end for all selected stacks
- Timing: same as current object movement (on drag end)

**Test Plan:**
- Unit: merge two stacks (verify card order: target bottom, source top)
- Unit: merge multiple stacks (3+)
- Unit: verify target state wins (_faceUp, _exhausted)
- Unit: verify source stack deletion
- Unit: error when targetId in ids array
- Unit: targetId defaults to first id when not provided
- E2E: drag stack onto stack shows visual indication
- E2E: merged stack persists after refresh
- E2E: drag multiple selected stacks onto target merges all

### Unstack Action
**Objective:** Implement unstacking via drag handle.

**Dependencies:** Stack Objects (above), Visual Stack Rendering (above)

**Spec:**
- Action: `unstackCard(store, stackId, pos)`
  - Always extracts top card (index 0) for now
  - Creates new single-card stack at specified position
  - Removes card from source stack
  - If source stack becomes empty, delete it
- **UI Trigger**: Drag unstack handle (upper-right corner)
  - Only active when 0 or 1 stacks selected (not during multi-select)
  - After slop detection: top card separates visually from stack
  - Source stack count badge updates in real-time during drag
- **Unstacked card behavior**: Behaves exactly like any other stack
  - Respects grid snap mode
  - Shows drag ghost for remote users
  - Gets proper z-order
  - Can be stacked onto other stacks

**Deliverables:**
- `unstackCard` action in `YjsActions.ts`
- Drag handle hit-test region in renderer
- Visual feedback: card separation and real-time count update
- Handle only responds to drag when 0-1 stacks selected

**Test Plan:**
- Unit: extract card from multi-card stack
- Unit: extract last card (source stack deleted)
- Unit: verify source stack updates correctly
- Unit: verify new stack created with correct properties
- E2E: drag handle extracts top card visually
- E2E: source count badge updates during drag
- E2E: unstacked card respects grid snap
- E2E: unstacked cards persist after refresh
- E2E: handle ignores drag when 2+ stacks selected

### Stack Flip Behavior
**Objective:** Ensure flipping a stack follows physical card rules.

**Spec:**
- When flipping a stack, reverse the `_cards` array order
- This simulates physically flipping a stack of cards
- Top card becomes bottom, bottom becomes top

**Deliverables:**
- Update flip action to reverse card order for stacks
- Ensure flip preserves all other stack properties

**Test Plan:**
- Unit: flip stack reverses card order
- Unit: verify top/bottom cards swap positions
- E2E: visual verification of flip behavior

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
