# Grid Snap Mode

## Overview
Add a toggleable grid snap mode that snaps objects to grid positions during drag, drop, and creation operations. Similar to the pan/select mode toggle, this provides an optional constraint system for precise object placement.

## Status
📋 **Planned** - Ready to implement when needed

## Prerequisites
- Board rendering core completed ✅
- Object dragging system completed ✅
- Exhaust/ready card rotation completed ✅

## Motivation
Many card and board games benefit from precise grid-based positioning:
- Tactical card games with positional mechanics
- Board game grid layouts
- Layout organization and alignment
- Precise spacing for multi-card arrangements
- Prevents card overlap when exhausting (90° rotation)

## Features

### Grid Mode Toggle
- Similar UX to pan/select mode toggle
- Keyboard shortcut (e.g., 'G' key)
- Simple React state (no persistence for now)
- No visual indicator needed (shadow preview provides sufficient feedback)

### Grid Specification
- **Fixed grid size**: 100px (sized for comfortable spacing)
  - Actual card dimensions: 63px wide × 88px tall (CARD_WIDTH × CARD_HEIGHT)
  - Exhausted (90° rotated): 88px wide × 63px tall
  - 100px grid provides 12px spacing between exhausted cards
- **Grid origin**: Center-based (0,0) grid alignment
- **Grid type**: Square grid only
- **No configuration UI**: Grid size is fixed (not user-adjustable)
- **No grid overlay**: No visual grid lines rendered (shadow preview provides all necessary feedback)

### Snap Behavior

**During Drag:**
- When grid mode is active, object positions snap to nearest grid point
- Shadow preview shows where object will land when dropped
- Shadow is local-only (not synced in multiplayer)
- Works with both single objects and multi-object selection

**During Drop:**
- Final position snaps to grid on pointer up
- Each object snaps independently to its nearest grid point
- Multi-object selection: objects spread out to grid spacing (minimum GRID_SIZE apart)
- All selected objects snap to grid simultaneously

**During Creation:**
- New objects created via actions snap to grid positions
- Applies to: drag-to-create, click-to-create, keyboard shortcuts

### Visual Feedback

**Snap Preview Ghost (Local Only):**
- Object follows cursor with blue glow (existing drag feedback)
- Separate semi-transparent "ghost" renders at snapped grid position
- Ghost shows where object will land when dropped
- Only visible on the local machine (not synced to other players)
- Uses same rendering as the object but with reduced opacity (40%)
- For multi-object selection, shows ghosts for all objects at their snapped positions
- Ghost disappears when drag ends

## Implementation Plan

### Task 1: Grid Toggle State
**Objective:** Add grid snap toggle to UI state

**Deliverables:**
- Grid enabled/disabled boolean state in React
- Fixed grid size constant (100px)
- No persistence (resets on page refresh)

**Spec:**
```typescript
// Fixed constants
const GRID_SIZE = 100; // pixels
const GRID_ORIGIN = { x: 0, y: 0 }; // world coordinates

// State (in table.$id.tsx)
const [gridSnapEnabled, setGridSnapEnabled] = useState<boolean>(false);
```

### Task 2: Snap Logic
**Objective:** Implement grid snapping mathematics

**Deliverables:**
- `snapToGrid(worldPos, enabled)` utility function
- Returns snapped position or original if grid disabled
- Uses GRID_SIZE constant

**Spec:**
```typescript
function snapToGrid(
  pos: { x: number; y: number },
  enabled: boolean
): { x: number; y: number } {
  if (!enabled) return pos;

  const relX = pos.x - GRID_ORIGIN.x;
  const relY = pos.y - GRID_ORIGIN.y;

  const snappedX = Math.round(relX / GRID_SIZE) * GRID_SIZE + GRID_ORIGIN.x;
  const snappedY = Math.round(relY / GRID_SIZE) * GRID_SIZE + GRID_ORIGIN.y;

  return { x: snappedX, y: snappedY };
}
```

### Task 3: Snap Preview Ghost
**Objective:** Add local-only snap preview ghost during drag

**Deliverables:**
- Ghost renderer showing snapped position during drag
- Semi-transparent preview (40% opacity)
- Multi-object ghost support
- Local-only rendering (no multiplayer sync)
- Separate from existing blue drag glow

**Integration Points:**
- Add ghost container to `AwarenessManager` or create new `GridSnapManager`
- Calculate ghost positions using `snapToGrid()` function
- Use object rendering behaviors with alpha override
- Clear ghosts on pointer up or drag cancel

**Rendering Strategy:**
- Reuse object rendering behaviors (same as remote drag ghosts)
- Render at snapped grid position (not current cursor position)
- Container similar to remote drag ghosts but for local preview
- Update ghost position on every pointer move when grid snap enabled

### Task 4: Integrate with Drag System
**Objective:** Apply grid snapping during drag operations

**Deliverables:**
- Modify `InputHandler` to apply grid snap during drag
- Update final drop positions with snapping
- Trigger shadow rendering during drag

**Integration Points:**
- `InputHandler.onPointerMove()` - calculate snapped preview position
- `InputHandler.onPointerUp()` - apply snap to final drop position
- Send shadow position to renderer for preview
- `moveObjects()` action - final position uses snapped coordinates

### Task 5: UI Toggle
**Objective:** Add grid mode toggle to UI

**Deliverables:**
- Grid mode toggle in GlobalMenuBar (similar to pan/select)
- Keyboard shortcut ('G' key)
- Simple React state (no persistence)

**UI Placement:**
- Toggle in GlobalMenuBar settings menu (⋮)
- Add new "Grid Snap" section in menu
- Keyboard shortcut hint in UI

## Testing Strategy

**Unit Tests:**
- `snapToGrid()` function with various positions using GRID_SIZE constant
- Multi-object independent snapping behavior
- Ghost position calculations for multiple objects

**E2E Tests:**
- Toggle grid mode on/off via keyboard ('G') and UI
- Drag object with grid snap enabled - ghost appears at snapped position
- Object follows cursor with blue glow while ghost shows snap target
- Drop object onto grid position (GRID_SIZE intervals)
- Create new object that snaps to grid
- Multi-object selection shows multiple ghosts at individual snap positions
- Multi-object selection: close objects spread out to grid spacing on drop
- Ghost disappears after drop
- Ghost not visible in multiplayer (local only)

**Performance Tests:**
- Drag performance with grid snap + shadow rendering enabled
- No frame drops during snap calculations or shadow updates

## Edge Cases

**Multi-Object Selection:**
- When dragging multiple objects, each snaps independently to its nearest grid point
- Objects that are close together will spread out to grid spacing
- Minimum spacing between snapped objects is GRID_SIZE
- Show ghosts for all selected objects at their individual snap positions

**Zoom Levels:**
- Snap behavior works consistently at all zoom levels
- Shadow preview scales correctly with zoom

**Pan Mode:**
- Grid snap disabled while in pan mode
- Automatically re-enabled when switching back to select mode

**Multiplayer:**
- Shadow preview is local-only (not sent to other players)
- Only final drop position is synced
- Grid snap toggle is per-user (not synced)
- Different players can have grid snap enabled or disabled independently

## Success Metrics

**Functional:**
- Grid mode toggles smoothly without lag
- Objects snap accurately to grid points on drop
- Ghost preview shows correct snapped position during drag
- Ghost is local-only (not visible to other players)
- Object follows cursor with blue glow, ghost shows snap target
- Multi-object selections: each object snaps independently to nearest grid point
- Objects spread out to grid spacing (minimum GRID_SIZE apart)
- Exhausted cards have comfortable spacing on grid

**Performance:**
- 60fps during drag with grid snap + ghost preview enabled
- Ghost rendering < 1ms per frame
- No perceptible lag when toggling grid mode

**UX:**
- Ghost preview provides clear feedback of snap position
- Object follows cursor naturally, ghost shows final destination
- Intuitive keyboard shortcut ('G') and UI toggle
- Grid snapping feels natural and helpful (not frustrating)
- Easy to enable/disable on the fly
- Grid provides comfortable spacing for card layout

## Notes

- Grid mode is optional and off by default
- Fixed grid size (GRID_SIZE constant) provides comfortable card spacing
- No configuration UI needed - simple toggle on/off
- Ghost preview is the only visual feedback - no grid overlay
- Ghost preview shows exactly where object will land on drop
- Ghost is local-only to avoid multiplayer clutter
- Performance is critical - snap calculations + ghost rendering happen on every pointer move
