# Phase 2: Refactor RendererCore to Use Managers

## Status
- **Phase 1 Complete**: All 9 managers extracted (commits: `47384b1`, `fca9cdb`)
- **Baseline Established**: 209 tests passing ✅, TypeScript compiles ✅
- **Next**: Replace ~1,500 lines of inline logic with manager method calls

## Managers Available

1. **CoordinateConverter** - Screen/world/canvas transformations
2. **CameraManager** - Zoom, pan, pinch gestures
3. **GestureRecognizer** - Pointer event interpretation
4. **SelectionManager** - Derived selection state cache
5. **DragManager** - Single/multi-object dragging
6. **HoverManager** - Hover state tracking
7. **SelectionRectangleManager** - Rectangle selection
8. **AwarenessManager** - Remote cursors/drag ghosts
9. **VisualManager** - Shadows, highlights, animations

## Refactoring Strategy

### Step 1: Add Manager Instances (Constructor)
```typescript
export abstract class RendererCore {
  // Managers
  private coordConverter: CoordinateConverter;
  private camera: CameraManager;
  private gestures: GestureRecognizer;
  private selection: SelectionManager;
  private drag: DragManager;
  private hover: HoverManager;
  private rectangleSelect: SelectionRectangleManager;
  private awareness: AwarenessManager;
  private visual: VisualManager;

  constructor() {
    this.coordConverter = new CoordinateConverter();
    this.camera = new CameraManager(this.coordConverter);
    this.gestures = new GestureRecognizer();
    this.selection = new SelectionManager();
    this.drag = new DragManager();
    this.hover = new HoverManager();
    this.rectangleSelect = new SelectionRectangleManager();
    this.awareness = new AwarenessManager();
    this.visual = new VisualManager();
  }
}
```

### Step 2: Remove Duplicate State
Delete these fields (now in managers):
- Lines 50-53: `hoveredObjectId`, `objectVisuals`, `hoverAnimationActive`
- Lines 58-63: `actorId`, `selectedObjectIds`, `pendingOperations`
- Lines 66-76: Drag state (`draggedObjectId`, positions, gesture ID, etc.)
- Lines 79-80: `cameraScale`, `devicePixelRatio`
- Lines 83-98: Pointer tracking, pinch state
- Lines 104-107: Rectangle selection state
- Lines 110-111: Blur filters
- Lines 114-130: Awareness state

### Step 3: Update `init` Message Handler
Replace initialization logic:
```typescript
case 'init': {
  const { canvas, width, height, dpr, actorId } = message;

  // Initialize managers
  this.selection.setActorId(actorId);
  this.coordConverter.setDevicePixelRatio(dpr);
  this.coordConverter.setCameraScale(1.0);

  // ... PixiJS init ...

  // Initialize managers with app/containers
  this.camera.initialize(this.app, this.worldContainer);
  this.visual.initialize(this.app, this.renderMode);
  this.awareness.initialize(this.app.stage);
}
```

### Step 4: Refactor Pointer Handlers

#### `handlePointerDown` (Lines 586-680)
- Replace pointer tracking: `this.gestures.addPointer(event)`
- Replace pinch detection: `this.gestures.isPinchGesture(event)`
- Replace camera pinch start: `this.camera.startPinch(...)`
- Replace hit-testing + drag prep: Use managers
- Replace selection logic: Use `SelectionManager` + `DragManager`

#### `handlePointerMove` (Lines 685-1050)
- Replace pointer updates: `this.gestures.updatePointer(event)`
- Replace pinch zoom: `this.camera.updatePinch(...)`
- Replace drag slop check: `this.gestures.exceedsDragSlop(...)`
- Replace object drag start: `this.drag.startObjectDrag(...)`
- Replace drag position updates: `this.drag.updateDragPositions(...)`
- Replace camera pan: `this.camera.pan(...)`
- Replace rectangle update: `this.rectangleSelect.updateRectangle(...)`
- Replace hover logic: `this.hover.shouldProcessHover(...)` + `this.visual.updateHoverFeedback(...)`

#### `handlePointerUp/Cancel` (Lines 1519-1638)
- Replace pointer removal: `this.gestures.removePointer(...)`
- Replace pinch end: `this.camera.endPinch()`
- Replace drag end: `this.drag.endObjectDrag(...)`
- Replace rectangle selection complete: Use managers
- Replace selection logic: Use `SelectionManager`

#### `handleWheel` (Lines 1644-1674)
- Replace zoom logic: `this.camera.zoom(event)`

### Step 5: Refactor Visual Methods

#### `updateHoverFeedback` (Lines 1056-1071)
Move to: `this.visual.updateHoverFeedback(...)`

#### `updateDragFeedback` (Lines 1077-1092)
Move to: `this.visual.updateDragFeedback(...)`

#### `redrawCardVisual` (Lines 1223-1309)
Already in `VisualManager.redrawVisual()` - just call it

#### Shadow/animation methods (Lines 1314-1365)
Already in `VisualManager` - remove duplicates

### Step 6: Refactor Selection Methods

#### `syncSelectionCache` (Lines 1792-1834)
Replace with: `this.selection.syncFromStore(this.sceneManager)`

#### `selectObjects` (Lines 1850-1944)
Coordinate conversion now handled by `VisualManager.calculateScreenCoords()`

#### `unselectObjects` (Lines 2033-2040)
Keep as thin wrapper, most logic in `SelectionManager`

### Step 7: Refactor Awareness Methods

#### `updateRemoteAwareness` (Lines 2196-2290)
Replace with: `this.awareness.updateRemoteAwareness(...)`

#### `renderRemoteCursor` (Lines 2295-2357)
Now private in `AwarenessManager`

#### `renderDragGhost` (Lines 2362-2465)
Now private in `AwarenessManager`

### Step 8: Clean Up Helper Methods

Remove these (now in managers):
- `getPointerDistance` (Line 574-581) - in `GestureRecognizer`
- `updateSelectionRectangle` (Lines 1097-1124) - in `SelectionRectangleManager`
- `clearSelectionRectangle` (Lines 1129-1135) - in `SelectionRectangleManager`

### Step 9: Update Object Lifecycle

#### `addObjectVisual` (Lines 1680-1705)
Use `VisualManager.createObjectVisual()` and `addVisual()`

#### `updateObjectVisual` (Lines 1711-1727)
Delegate to managers

#### `removeObjectVisual` (Lines 1732-1757)
Use `VisualManager.removeVisual()` + manager cleanup

#### `clearObjects` (Lines 2045-2061)
Delegate to all managers' clear methods

## Testing Strategy

### After Each Step:
1. Run `pnpm run typecheck` - must pass
2. Run `pnpm run test` - all 209 tests must pass
3. Commit incrementally with clear messages

### Final Validation:
1. All unit tests pass (209)
2. TypeScript compiles cleanly
3. Dev server runs without errors
4. Manual smoke test in browser

## Estimated Line Count Reduction

- **Before**: RendererCore = 2,467 lines
- **After**: RendererCore ≈ 800-1,000 lines (orchestration only)
- **Reduction**: ~1,500 lines moved to focused managers

## Success Criteria

- ✅ All 209 tests passing
- ✅ TypeScript compiles without errors
- ✅ No runtime errors in dev server
- ✅ RendererCore focuses on message routing and coordination
- ✅ Each manager handles its own domain independently
