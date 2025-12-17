# Grid Snap Mode

## Overview
Add a toggleable grid snap mode that snaps objects to grid positions during drag, drop, and creation operations. Similar to the pan/select mode toggle, this provides an optional constraint system for precise object placement.

## Status
📋 **Planned** - Ready to implement when needed

## Prerequisites
- Board rendering core completed ✅
- Object dragging system completed ✅

## Motivation
Many card and board games benefit from precise grid-based positioning:
- Tactical card games with positional mechanics
- Board games with hex or square grids
- Layout organization and alignment
- Precise spacing for multi-card arrangements

## Features

### Grid Mode Toggle
- Similar UX to pan/select mode toggle
- Keyboard shortcut (e.g., 'G' key)
- Persistent preference (store in IndexedDB)
- Visual indicator in UI when grid mode is active

### Grid Configuration
- **Grid size**: Configurable spacing (e.g., 50px, 100px, 150px)
- **Grid origin**: Center-based (0,0) grid alignment
- **Grid type**: Square grid (future: hex grid support)
- **Snap threshold**: Configurable snap distance (default: 50% of grid size)

### Snap Behavior

**During Drag:**
- When grid mode is active, object positions snap to nearest grid point
- Live snapping feedback as user drags
- Smooth visual transition to snapped position
- Works with both single objects and multi-object selection

**During Drop:**
- Final position snaps to grid on pointer up
- Maintains relative offsets for multi-object selection
- All selected objects snap to grid simultaneously

**During Creation:**
- New objects created via actions snap to grid positions
- Applies to: drag-to-create, click-to-create, keyboard shortcuts

### Visual Feedback

**Grid Overlay (Optional):**
- Subtle grid lines rendered on canvas
- Toggleable independently from snap mode
- Fades at high zoom out, becomes more prominent when zoomed in
- Low-opacity lines that don't interfere with gameplay
- Configurable color/opacity

**Snap Indicators:**
- Highlight nearest grid point while dragging
- Visual "magnetism" effect as object approaches grid point
- Clear feedback that grid mode is affecting placement

## Implementation Plan

### Task 1: Grid Configuration System
**Objective:** Add grid settings to store and UI

**Deliverables:**
- Grid configuration in YjsStore or local settings
- UI controls for grid size, visibility, and snap threshold
- Persistence of grid preferences

**Spec:**
```typescript
interface GridSettings {
  enabled: boolean;
  visible: boolean;
  size: number; // pixels
  snapThreshold: number; // 0-1, percentage of grid size
  origin: { x: number; y: number }; // world coordinates
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

### Task 3: Integrate with Drag System
**Objective:** Apply grid snapping during drag operations

**Deliverables:**
- Modify `InputHandler` to apply grid snap during drag
- Update drag preview positions with snapping
- Maintain smooth visual feedback

**Integration Points:**
- `InputHandler.onPointerMove()` - apply snap to drag position
- `DragGhost` rendering - show snapped preview positions
- `moveObjects()` action - final position uses snapped coordinates

### Task 4: Grid Overlay Renderer
**Objective:** Add visual grid overlay to canvas

**Deliverables:**
- Grid line renderer in PixiJS scene
- Zoom-aware line thickness and opacity
- Performance-optimized (cull off-screen lines)
- Configurable appearance

**Rendering Strategy:**
- Use PixiJS Graphics for lines
- Calculate visible grid range based on camera viewport
- Update on camera move/zoom
- Low z-index (render below all objects)

### Task 5: UI Controls and Toggle
**Objective:** Add grid mode controls to UI

**Deliverables:**
- Grid mode toggle button (similar to pan/select)
- Grid settings panel (size, visibility, snap threshold)
- Keyboard shortcut ('G' key)
- Status indicator when grid mode active

**UI Placement:**
- Toggle button in main toolbar
- Settings in preferences/options menu
- Keyboard shortcut hint in UI

## Testing Strategy

**Unit Tests:**
- `snapToGrid()` function with various positions and grid sizes
- Grid configuration persistence
- Snap threshold calculations
- Multi-object relative positioning preservation

**E2E Tests:**
- Toggle grid mode on/off via keyboard and UI
- Drag object with grid snap enabled
- Drop object onto grid position
- Create new object that snaps to grid
- Multi-object selection maintains relative positions
- Grid overlay visibility toggles correctly
- Grid settings persist after refresh

**Performance Tests:**
- Grid rendering with 1000+ grid lines (zoom out scenario)
- Drag performance with grid snap enabled
- No frame drops during snap calculations

## Edge Cases

**Multi-Object Selection:**
- When dragging multiple objects, snap the "primary" object (first selected)
- Maintain relative offsets for other objects
- All objects move together, relative positions preserved

**Grid Size Changes:**
- Objects don't automatically re-snap when grid size changes
- Only affects new drag/drop operations
- Provide "Snap All to Grid" action for bulk re-alignment

**Zoom Levels:**
- Grid overlay fades out at low zoom (< 0.5x)
- Grid overlay becomes more prominent at high zoom (> 2x)
- Snap behavior works consistently at all zoom levels

**Pan Mode:**
- Grid snap disabled while in pan mode
- Automatically re-enabled when switching back to select mode
- Grid overlay still visible in pan mode (if enabled)

## Future Enhancements

**Phase 2 (Later):**
- Hex grid support
- Isometric grid support
- Custom grid origins per zone/mat
- Grid-aligned rotation (45°, 90° snaps)
- "Snap to objects" mode (align with nearby objects)
- Grid templates for specific game boards

## Success Metrics

**Functional:**
- Grid mode toggles smoothly without lag
- Objects snap accurately to grid points
- Multi-object selections maintain relative positions
- Grid overlay renders clearly at various zoom levels
- Settings persist across sessions

**Performance:**
- 60fps during drag with grid snap enabled
- Grid overlay rendering < 2ms per frame
- No perceptible lag when toggling grid mode

**UX:**
- Clear visual feedback when grid mode active
- Intuitive keyboard shortcut and UI controls
- Grid snapping feels natural and helpful (not frustrating)
- Easy to enable/disable on the fly

## Notes

- Grid mode is optional and off by default
- Should feel like a helpful tool, not a constraint
- Consider game-specific grid presets (e.g., "Chess 8x8", "Hex Grid")
- Grid visualization should be subtle and not distracting
- Performance is critical - grid calculations happen on every pointer move during drag
