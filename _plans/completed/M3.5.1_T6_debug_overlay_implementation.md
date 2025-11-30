# Debug Overlay Implementation (M3.5.1-T6)

## Purpose
The DebugOverlay was used to validate that PixiJS `toGlobal()` coordinate conversion produces correct DOM coordinates for positioning UI elements (like ActionHandle) above canvas objects.

## Implementation

### Component: `app/src/components/DebugOverlay.tsx`

```typescript
interface DebugOverlayProps {
  screenCoords: Array<{
    id: string;
    x: number;      // DOM coordinates (center of object)
    y: number;      // DOM coordinates (center of object)
    width: number;  // Object width in DOM pixels
    height: number; // Object height in DOM pixels
  }>;
}

export function DebugOverlay({ screenCoords }: DebugOverlayProps) {
  // Show only first selected object
  const coord = screenCoords[0];

  return (
    <div
      style={{
        position: 'fixed',
        left: `${coord.x}px`,
        top: `${coord.y}px`,
        width: `${coord.width}px`,
        height: `${coord.height}px`,
        transform: 'translate(-50%, -50%)',
        border: '4px solid lime',
        backgroundColor: 'rgba(0, 255, 0, 0.2)',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
      data-testid="debug-overlay"
    />
  );
}
```

### Integration in Board.tsx

```typescript
// State for debug overlay
const [debugCoords, setDebugCoords] = useState<Array<{
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}> | null>(null);
const [isCameraActive, setIsCameraActive] = useState(false);
const [isWaitingForCoords, setIsWaitingForCoords] = useState(false);

// Message handler - objects-selected
case 'objects-selected': {
  setDebugCoords(message.screenCoords.length > 0 ? message.screenCoords : null);
  // ... rest of handler
}

// Message handler - objects-unselected
case 'objects-unselected': {
  setDebugCoords(null);
  // ... rest of handler
}

// Message handlers - camera operations
case 'pan-started':
case 'zoom-started':
case 'object-drag-started': {
  setIsCameraActive(true);
  break;
}

case 'pan-ended':
case 'zoom-ended':
case 'object-drag-ended': {
  setIsCameraActive(false);
  const selectedIds = getSelectedObjectIds(storeRef.current);
  if (selectedIds.length > 0) {
    setIsWaitingForCoords(true);
    rendererRef.current?.sendMessage({
      type: 'request-screen-coords',
      ids: selectedIds,
    });
  }
  break;
}

case 'screen-coords': {
  setDebugCoords(message.screenCoords.length > 0 ? message.screenCoords : null);
  setIsWaitingForCoords(false);
  break;
}

// Render (shows alongside ActionHandle)
{!isCameraActive &&
  !isWaitingForCoords &&
  debugCoords &&
  debugCoords.length > 0 && (
    <DebugOverlay screenCoords={debugCoords} />
  )}
```

### Coordinate Calculation in RendererCore.ts

```typescript
private handleRequestScreenCoords(ids: string[]): void {
  const screenCoords: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];

  if (this.worldContainer && ids.length > 0) {
    for (const id of ids) {
      const visual = this.objectVisuals.get(id);
      const obj = this.sceneManager.getObject(id);

      if (visual && obj) {
        // Use PixiJS toGlobal() to convert visual's position to canvas coordinates
        const canvasPos = visual.toGlobal({ x: 0, y: 0 });

        // Convert to DOM coordinates (divide by devicePixelRatio)
        const domX = canvasPos.x / this.devicePixelRatio;
        const domY = canvasPos.y / this.devicePixelRatio;

        // Calculate dimensions based on object type
        let width = 0;
        let height = 0;

        if (obj._kind === ObjectKind.Stack) {
          width = (STACK_WIDTH * this.cameraScale) / this.devicePixelRatio;
          height = (STACK_HEIGHT * this.cameraScale) / this.devicePixelRatio;
        } else if (
          obj._kind === ObjectKind.Zone &&
          obj._meta?.width &&
          obj._meta?.height
        ) {
          width = ((obj._meta.width as number) * this.cameraScale) / this.devicePixelRatio;
          height = ((obj._meta.height as number) * this.cameraScale) / this.devicePixelRatio;
        } else if (obj._kind === ObjectKind.Token) {
          const radius = (getTokenSize(obj) * this.cameraScale) / this.devicePixelRatio;
          width = radius * 2;
          height = radius * 2;
        } else if (obj._kind === ObjectKind.Mat) {
          const radius = (getMatSize(obj) * this.cameraScale) / this.devicePixelRatio;
          width = radius * 2;
          height = radius * 2;
        } else if (obj._kind === ObjectKind.Counter) {
          const radius = (getCounterSize(obj) * this.cameraScale) / this.devicePixelRatio;
          width = radius * 2;
          height = radius * 2;
        }

        screenCoords.push({
          id,
          x: domX,
          y: domY,
          width,
          height,
        });
      }
    }
  }

  // Send screen coordinates response
  this.postResponse({
    type: 'screen-coords',
    screenCoords,
  });
}
```

### Message Types in shared/src/index.ts

```typescript
export interface ScreenCoordinate {
  id: string;
  x: number;      // DOM coordinates (center of object)
  y: number;      // DOM coordinates (center of object)
  width: number;  // Object width in DOM pixels
  height: number; // Object height in DOM pixels
}

// Message from renderer with screen coordinates
export interface ScreenCoordsMessage {
  type: 'screen-coords';
  screenCoords: ScreenCoordinate[];
}

// Message to request screen coordinates
export interface RequestScreenCoordsMessage {
  type: 'request-screen-coords';
  ids: string[];
}

// Camera operation lifecycle messages
export interface PanStartedMessage {
  type: 'pan-started';
}

export interface PanEndedMessage {
  type: 'pan-ended';
}

export interface ZoomStartedMessage {
  type: 'zoom-started';
}

export interface ZoomEndedMessage {
  type: 'zoom-ended';
}

export interface ObjectDragStartedMessage {
  type: 'object-drag-started';
}

export interface ObjectDragEndedMessage {
  type: 'object-drag-ended';
}

// Include in ObjectsSelectedMessage
export interface ObjectsSelectedMessage {
  type: 'objects-selected';
  ids: string[];
  screenCoords: ScreenCoordinate[]; // Added for debug overlay
}
```

## Key Insights

### Coordinate System Validation
The debug overlay proved that PixiJS `toGlobal()` combined with `devicePixelRatio` conversion produces **pixel-perfect** DOM coordinates:
- Lime rectangle overlay matched canvas object exactly
- Worked correctly at all zoom levels
- Worked correctly at all pan positions
- Worked correctly for all object types

### Async State Pattern
The overlay used an async state pattern to avoid race conditions:
1. Camera operation ends → Set `isWaitingForCoords = true`
2. Request fresh coordinates from renderer
3. Receive `screen-coords` response → Set `isWaitingForCoords = false`
4. Overlay renders only when `!isCameraActive && !isWaitingForCoords && hasCoords`

This ensures the overlay never flashes with stale coordinates.

### Architecture Benefits
This pattern proved that:
- Renderer is the single source of truth for screen positions
- PixiJS handles all camera transforms (no manual calculation needed)
- React components can receive exact DOM coordinates via message passing
- Pattern works identically in both worker and main-thread rendering modes

## Restoring the Debug Overlay

To bring back the debug overlay for debugging:

1. **Uncomment the DebugOverlay render in Board.tsx:**
   ```typescript
   {/* Debug overlay */}
   {!isCameraActive &&
     !isWaitingForCoords &&
     debugCoords &&
     debugCoords.length > 0 && (
       <DebugOverlay screenCoords={debugCoords} />
     )}
   ```

2. **The component file exists at:** `app/src/components/DebugOverlay.tsx`

3. **All message handlers and state are already in place** - just uncomment the render

4. **No changes needed to renderer or shared types** - infrastructure is permanent

## Production Usage

The coordinate calculation infrastructure (screen-coords messages, toGlobal conversion) is **permanent** and used by ActionHandle. Only the visual debug overlay is removed for production.
