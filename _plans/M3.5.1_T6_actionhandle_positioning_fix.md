# M3.5.1-T6: Fix ActionHandle Positioning Using PixiJS toScreen()

## Problem
ActionHandle is not positioned correctly because we're manually calculating world-to-screen coordinate conversion, which doesn't account for PixiJS transforms and devicePixelRatio properly.

## Root Cause
- Manual coordinate conversion formula doesn't match PixiJS's internal transform calculations
- devicePixelRatio (2x on retina displays) causes mismatch between canvas and DOM coordinates
- Camera transforms (worldContainer position, scale) not properly accounted for

## Solution
Use PixiJS's built-in `toScreen()` method on existing DisplayObject visuals to get accurate DOM coordinates. The renderer already maintains a `Container` for each object in the `objectVisuals` map.

## Implementation Plan

### Phase 1: Validate toScreen() Coordinate Conversion

**Goal**: Verify that PixiJS toScreen() produces correct DOM coordinates before integrating with ActionHandle.

#### Step 1: Update Message Type
**File**: `shared/src/index.ts`

Add `screenCoords` field to `objects-selected` message:
```typescript
{
  type: 'objects-selected';
  ids: string[];
  screenCoords: Array<{
    id: string;
    x: number;      // DOM coordinates (center of object)
    y: number;      // DOM coordinates (center of object)
    width: number;  // Object width in DOM pixels
    height: number; // Object height in DOM pixels
  }>;
}
```

#### Step 2: Calculate Screen Coordinates in Renderer
**File**: `app/src/renderer/RendererCore.ts`

In `selectObjects()` method:
1. Iterate through all IDs in the `ids` array
2. For each ID:
   - Get visual from `objectVisuals.get(id)`
   - Use `visual.toScreen(visual.position)` to get screen coordinates
   - Divide by `this.devicePixelRatio` to convert canvas coords → DOM coords
   - Get object from `sceneManager.getObject(id)` to determine dimensions
   - Calculate width/height based on object type (Stack: use STACK_WIDTH/STACK_HEIGHT constants, Token/Mat/Counter: radius*2, Zone: meta width/height)
3. Build `screenCoords` array with all objects
4. Include `screenCoords` in the `objects-selected` message

#### Step 3: Create Debug Overlay Component
**File**: `app/src/components/DebugOverlay.tsx` (NEW)

Create a simple component that:
- Accepts `screenCoords` prop (array of coordinates)
- Renders a `position: fixed` div for the first object
- Styling:
  - Red border (4px solid)
  - Semi-transparent fill (rgba(255, 0, 0, 0.2))
  - Positioned at center using `transform: translate(-50%, -50%)`
- Purpose: Visual validation that DOM rectangle perfectly overlaps canvas object

#### Step 4: Wire Up Debug Overlay
**File**: `app/src/routes/table.$id.tsx`

1. Add state to store screen coordinates: `const [debugCoords, setDebugCoords] = useState(null)`
2. Update `objects-selected` message handler to extract and store `screenCoords`
3. Render DebugOverlay component when `debugCoords` is not null
4. Pass first object's coordinates to DebugOverlay

#### Step 5: Manual Testing & Validation

Test scenarios:
1. **Basic positioning**: Select objects in different positions - verify red rectangle overlaps perfectly
2. **Zoom in/out**: Change camera scale - verify rectangle scales and positions correctly
3. **Pan camera**: Move camera around - verify rectangle follows object
4. **Different object types**: Test stacks, tokens, zones - verify dimensions are correct
5. **Multi-select**: Cmd+click to add objects - verify rectangle updates to first object
6. **Rectangle select**: Drag-select multiple objects - verify rectangle shows first object

**Success criteria**: Red debug rectangle must perfectly overlay the selected canvas object in ALL scenarios.

#### Step 5.5: Hide Overlay During Pan/Zoom ✅ COMPLETE

**Problem**: Pan/zoom operations change camera transforms, making the overlay position stale. Updating DOM positions every frame is expensive and complex.

**Solution**: Hide overlay during camera operations, re-show with updated coordinates after operation completes.

**Implementation Summary:**
- Added 6 specific operation messages: `pan-started`, `pan-ended`, `zoom-started`, `zoom-ended`, `object-drag-started`, `object-drag-ended`
- Renderer sends messages at operation lifecycle events
- Board manages `isCameraActive` state to conditionally render overlay
- Board requests fresh coordinates via `request-screen-coords` when operations end
- Renderer handles `request-screen-coords` and responds with `screen-coords` message
- Created `debounce.ts` utility for zoom-ended debouncing (150ms)

**File**: `app/src/renderer/RendererCore.ts`

1. **Hide on gesture start:**
   - Pan start: Send `clear-overlay` message on pointer-down in pan mode
   - Zoom start: Send `clear-overlay` message on first wheel event
   - Pinch start: Send `clear-overlay` message on pinch gesture start

2. **Re-show on gesture end:**
   - Pan end: Re-send `objects-selected` message with fresh screenCoords on pointer-up
   - Zoom end: Debounce wheel events (~150ms), then re-send `objects-selected` with fresh coords
   - Pinch end: Re-send `objects-selected` message on pinch gesture end

3. **Add new message type** (optional):
   - `{ type: 'clear-overlay' }` - signals Board to clear debugCoords/ActionHandle state
   - Alternative: Board can clear on any camera operation start

**File**: `app/src/components/Board.tsx`

1. Handle `clear-overlay` message by setting `debugCoords` to null
2. Alternatively, clear on gesture start detection

**Benefits:**
- No expensive DOM updates during 60fps camera animations
- Simpler architecture - no camera state synchronization needed
- Better UX - clean view during interaction, stable UI when idle
- Matches ActionHandle progressive disclosure pattern

### Phase 2: Integrate with ActionHandle (After Validation)

#### Step 6: Update ActionHandle Component
**File**: `app/src/components/ActionHandle.tsx`

1. Add new prop: `screenCoords: Array<{ id, x, y, width, height }>`
2. Remove calculation logic - use `screenCoords[0]` directly for positioning
3. Keep `transform: translate(-50%, -50%)` for centering
4. Remove unused props: `cameraX`, `cameraY`, `cameraScale` (can be deprecated for now)

#### Step 7: Update ActionHandle Usage
**File**: `app/src/routes/table.$id.tsx`

1. Pass `screenCoords` from message handler to ActionHandle
2. Remove manual viewport width/height calculations

#### Step 8: Clean Up
1. Remove `calculateHandlePosition()` from `app/src/utils/selectionBounds.ts` (or deprecate)
2. Remove all `[ActionHandle-Debug]` console logs from:
   - `app/src/renderer/RendererCore.ts`
   - `app/src/components/ActionHandle.tsx`
   - `app/src/utils/selectionBounds.ts`
3. Remove DebugOverlay component after validation complete

## Implementation Notes

- **Return all screen coords**: The message includes coordinates for all selected objects, but ActionHandle will use only the first one initially
- **Future enhancement**: Can later use all coordinates to calculate selection bounds for multi-select
- **Backward compatibility**: Old props on ActionHandle can remain for now to avoid breaking changes

## Testing Checklist

Phase 1:
- [ ] Red rectangle overlaps object at various positions
- [ ] Red rectangle scales correctly with zoom
- [ ] Red rectangle follows object when panning
- [ ] Works for all object types (stack, token, zone, mat, counter)
- [ ] Works with multi-select (shows first object)
- [ ] Works with rectangle selection

Phase 2:
- [ ] ActionHandle appears at correct position
- [ ] ActionHandle follows camera zoom
- [ ] ActionHandle follows camera pan
- [ ] ActionHandle updates when adding to selection
- [ ] ActionHandle works for all object types

## Success Criteria

- ActionHandle positioned correctly using PixiJS screen coordinates
- No manual coordinate conversion needed in React components
- Works correctly with any camera transform, zoom level, and devicePixelRatio
- Clean, maintainable architecture with single source of truth (PixiJS)
