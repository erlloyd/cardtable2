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
- Persistent preference (store in IndexedDB)
- No visual indicator needed (shadow preview provides sufficient feedback)

### Grid Configuration
- **Grid size**: Default sized to accommodate exhausted cards without overlap
  - Standard card dimensions: ~100px wide × 140px tall
  - Exhausted (90° rotated): 140px wide × 100px tall
  - Recommended grid size: 150px (allows slight spacing between exhausted cards)
- **Grid origin**: Center-based (0,0) grid alignment
- **Grid type**: Square grid only
- **Snap threshold**: Cards snap to nearest grid point (no threshold configuration needed)
- **No grid overlay**: No visual grid lines rendered (shadow preview provides all necessary feedback)

### Snap Behavior

**During Drag:**
- When grid mode is active, object positions snap to nearest grid point
- Shadow preview shows where object will land when dropped
- Shadow is local-only (not synced in multiplayer)
- Works with both single objects and multi-object selection

**During Drop:**
- Final position snaps to grid on pointer up
- Maintains relative offsets for multi-object selection
- All selected objects snap to grid simultaneously

**During Creation:**
- New objects created via actions snap to grid positions
- Applies to: drag-to-create, click-to-create, keyboard shortcuts

### Visual Feedback

**Drop Shadow Preview (Local Only):**
- Semi-transparent "ghost" shows where object will snap when dropped
- Renders at the snapped grid position while dragging
- Only visible on the local machine (not synced to other players)
- Uses same rendering as the object but with reduced opacity (e.g., 40%)
- For multi-object selection, shows shadows for all objects at their snapped positions

## Implementation Plan

### Task 1: Grid Configuration System
**Objective:** Add grid settings to store and UI

**Deliverables:**
- Grid configuration in local settings (IndexedDB)
- UI controls for grid size
- Persistence of grid preferences
- Default grid size: 150px (accommodates exhausted cards)

**Spec:**
```typescript
interface GridSettings {
  enabled: boolean;
  size: number; // pixels, default 150
  origin: { x: number; y: number }; // world coordinates, default (0, 0)
}
```

### Task 2: Snap Logic
**Objective:** Implement grid snapping mathematics

**Deliverables:**
- `snapToGrid(worldPos, gridSettings)` utility function
- Returns snapped position or original if grid disabled
- Handles multi-object relative positioning

**Spec:**
```typescript
function snapToGrid(
  pos: Position,
  gridSettings: GridSettings
): Position {
  if (!gridSettings.enabled) return pos;

  const { size, origin } = gridSettings;
  const relX = pos.x - origin.x;
  const relY = pos.y - origin.y;

  const snappedX = Math.round(relX / size) * size + origin.x;
  const snappedY = Math.round(relY / size) * size + origin.y;

  return { x: snappedX, y: snappedY };
}
```

### Task 3: Drop Shadow Preview
**Objective:** Add local-only shadow preview during drag

**Deliverables:**
- Shadow renderer that shows snapped position during drag
- Semi-transparent preview (40% opacity)
- Multi-object shadow support
- Local-only rendering (no multiplayer sync)

**Integration Points:**
- Render shadows in `SceneManager` during drag operations
- Calculate shadow positions using `snapToGrid()` function
- Use existing object rendering logic with opacity override
- Clear shadows on pointer up or drag cancel

**Rendering Strategy:**
- Reuse existing object rendering with opacity parameter
- Render at snapped grid position (not current drag position)
- Z-index below drag ghosts but above static objects
- Update shadow position on every pointer move

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

### Task 5: UI Controls and Toggle
**Objective:** Add grid mode controls to UI

**Deliverables:**
- Grid mode toggle button (similar to pan/select)
- Grid settings panel (size)
- Keyboard shortcut ('G' key)

**UI Placement:**
- Toggle button in main toolbar
- Settings in preferences/options menu
- Keyboard shortcut hint in UI

## Testing Strategy

**Unit Tests:**
- `snapToGrid()` function with various positions and grid sizes
- Grid configuration persistence
- Multi-object relative positioning preservation
- Shadow position calculations

**E2E Tests:**
- Toggle grid mode on/off via keyboard and UI
- Drag object with grid snap enabled - shadow appears at snapped position
- Drop object onto grid position
- Create new object that snaps to grid
- Multi-object selection shows multiple shadows
- Multi-object selection maintains relative positions
- Grid settings persist after refresh
- Shadow disappears after drop
- Shadow not visible in multiplayer (local only)

**Performance Tests:**
- Drag performance with grid snap + shadow rendering enabled
- No frame drops during snap calculations or shadow updates

## Edge Cases

**Multi-Object Selection:**
- When dragging multiple objects, snap the "primary" object (first selected)
- Maintain relative offsets for other objects
- All objects move together, relative positions preserved
- Show shadows for all selected objects

**Grid Size Changes:**
- Objects don't automatically re-snap when grid size changes
- Only affects new drag/drop operations
- Provide "Snap All to Grid" action for bulk re-alignment

**Zoom Levels:**
- Snap behavior works consistently at all zoom levels
- Shadow preview scales correctly with zoom

**Pan Mode:**
- Grid snap disabled while in pan mode
- Automatically re-enabled when switching back to select mode

**Multiplayer:**
- Shadow preview is local-only (not sent to other players)
- Only final drop position is synced
- Grid settings are per-user (not synced)
- Different players can have different grid settings

## Success Metrics

**Functional:**
- Grid mode toggles smoothly without lag
- Objects snap accurately to grid points
- Shadow preview shows correct snapped position
- Shadow is local-only (not visible to other players)
- Multi-object selections maintain relative positions
- Settings persist across sessions
- Exhausted cards don't overlap on default grid size

**Performance:**
- 60fps during drag with grid snap + shadow enabled
- Shadow rendering < 1ms per frame
- No perceptible lag when toggling grid mode

**UX:**
- Shadow preview provides clear feedback of snap position
- Intuitive keyboard shortcut and UI controls
- Grid snapping feels natural and helpful (not frustrating)
- Easy to enable/disable on the fly
- Grid size accommodates exhausted cards without overlap

## Notes

- Grid mode is optional and off by default
- Default grid size (150px) is sized for exhausted card clearance
- Shadow preview is the only visual feedback - no grid overlay needed
- Shadow preview shows exactly where object will land
- Shadow is local-only to avoid multiplayer clutter
- Performance is critical - snap calculations + shadow rendering happen on every pointer move
