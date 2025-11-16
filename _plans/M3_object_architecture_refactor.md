# M3 - Object-Oriented Architecture Refactoring

## Overview
Refactor from switch-statement-based object handling to a modular, extensible architecture using behavior registries with one directory per object type.

## Goals
- Eliminate switch statements for object-type-specific logic
- Create extensible architecture for future object types
- Organize code by object type in dedicated directories
- Establish patterns for shared vs. type-specific behaviors
- Set up event handler infrastructure for future features

## Architecture Summary
- **Data Model**: Keep `TableObject` as plain data (Yjs-compatible, no class instances)
- **Behaviors**: Registry pattern mapping ObjectKind → behavior implementations
- **Events**: Event handler registry with default implementations that can be overridden
- **Structure**: One directory per object type containing all type-specific logic
- **Migration**: Big-bang refactoring (all changes in one PR)

## Current State Analysis

### Existing Switch Statements (3 total)
1. **RendererCore.ts** - `createBaseShapeGraphic()` (lines 912-972)
   - Renders visual appearance based on object type
   - Different shapes: cards, circles, rectangles
   - Different colors, sizes, borders

2. **RendererCore.ts** - `getShadowBounds()` (lines 883-906)
   - Calculates shadow dimensions for hover/drag effects
   - Type-specific sizing logic

3. **SceneManager.ts** - `getBoundingBox()` (lines 144-195)
   - Calculates axis-aligned bounding boxes for hit-testing
   - Type-specific dimensions from metadata

### Type-Agnostic Code (No Changes Needed)
- Event handling (hover, selection, dragging) - ~90% of codebase
- Z-order management (fractional indexing)
- Camera interactions
- Position/rotation updates
- Spatial index management

---

## Implementation Plan

## Phase 1: Create New Directory Structure

### 1.1 Create base directory and shared types

**File: `app/src/renderer/objects/types.ts`**
```typescript
import type { Graphics } from 'pixi.js';
import type { TableObject, PointerEventData } from '@cardtable2/shared';
import type { BBox } from '../SceneManager';

// Render context provides extra info during rendering
export interface RenderContext {
  isSelected: boolean;
  isHovered: boolean;
  isDragging: boolean;
  cameraScale: number;
}

// Shadow configuration
export interface ShadowConfig {
  width: number;
  height: number;
  shape: 'rect' | 'circle';
  borderRadius: number;
}

// Behavior interfaces
export type RenderBehavior = (obj: TableObject, ctx: RenderContext) => Graphics;
export type BoundsBehavior = (obj: TableObject) => Omit<BBox, 'id'>;
export type ShadowBehavior = (obj: TableObject) => ShadowConfig;

export interface ObjectBehaviors {
  render: RenderBehavior;
  getBounds: BoundsBehavior;
  getShadowConfig: ShadowBehavior;
}

// Event handler types
export type HoverHandler = (obj: TableObject, isHovered: boolean) => void;
export type ClickHandler = (obj: TableObject, event: PointerEventData) => void;
export type DragHandler = (obj: TableObject, delta: { x: number; y: number }) => void;
export type DropHandler = (zone: TableObject, droppedObj: TableObject | null) => void;
export type DoubleClickHandler = (obj: TableObject, event: PointerEventData) => void;

export interface EventHandlers {
  onHover?: HoverHandler;
  onClick?: ClickHandler;
  onDrag?: DragHandler;
  onDrop?: DropHandler;
  onDoubleClick?: DoubleClickHandler;
}
```

**File: `app/src/renderer/objects/base/defaultEvents.ts`**
```typescript
// Default event handlers used by most object types
// Individual types can override as needed

import type { EventHandlers } from '../types';

export const defaultEventHandlers: EventHandlers = {
  // Default hover: scale and shadow (implemented by RendererCore)
  // Default click: select (implemented by RendererCore)
  // Default drag: move (implemented by RendererCore)
  // No default drop behavior
  // No default double-click behavior
};
```

**File: `app/src/renderer/objects/base/index.ts`**
```typescript
export * from './defaultEvents';
```

### 1.2 Create Stack Module

**Directory: `app/src/renderer/objects/stack/`**

**File: `stack/constants.ts`**
```typescript
/** Standard card dimensions (poker card aspect ratio) */
export const STACK_WIDTH = 63;
export const STACK_HEIGHT = 88;

/** Border radius for card corners */
export const STACK_BORDER_RADIUS = 12;

/** Default card color if not specified */
export const STACK_DEFAULT_COLOR = 0x6c5ce7; // Purple

/** Border colors */
export const STACK_BORDER_COLOR_NORMAL = 0x2d3436; // Dark gray
export const STACK_BORDER_COLOR_SELECTED = 0xef4444; // Red
```

**File: `stack/types.ts`**
```typescript
import type { TableObject } from '@cardtable2/shared';

/** Stack-specific metadata interface */
export interface StackMeta {
  color?: number;
}

/** Type guard for Stack objects */
export function isStackObject(obj: TableObject): obj is StackObject {
  return obj._kind === 'stack' && '_cards' in obj && '_faceUp' in obj;
}

/** Full Stack object type with required fields */
export interface StackObject extends TableObject {
  _kind: 'stack';
  _cards: string[];
  _faceUp: boolean;
  _meta?: StackMeta;
}
```

**File: `stack/utils.ts`**
```typescript
import type { TableObject } from '@cardtable2/shared';
import { STACK_DEFAULT_COLOR } from './constants';

/** Get the color for a stack, with fallback to default */
export function getStackColor(obj: TableObject): number {
  return (obj._meta?.color as number) ?? STACK_DEFAULT_COLOR;
}

/** Get the number of cards in a stack */
export function getCardCount(obj: TableObject): number {
  if ('_cards' in obj && Array.isArray(obj._cards)) {
    return obj._cards.length;
  }
  return 0;
}

/** Check if stack is face up */
export function isFaceUp(obj: TableObject): boolean {
  if ('_faceUp' in obj) {
    return obj._faceUp as boolean;
  }
  return true;
}
```

**File: `stack/behaviors.ts`**
```typescript
import { Graphics } from 'pixi.js';
import type { TableObject } from '@cardtable2/shared';
import type { ObjectBehaviors, RenderContext, ShadowConfig } from '../types';
import {
  STACK_WIDTH,
  STACK_HEIGHT,
  STACK_BORDER_RADIUS,
  STACK_BORDER_COLOR_NORMAL,
  STACK_BORDER_COLOR_SELECTED,
} from './constants';
import { getStackColor } from './utils';

export const StackBehaviors: ObjectBehaviors = {
  render(obj: TableObject, ctx: RenderContext): Graphics {
    const graphic = new Graphics();
    const color = getStackColor(obj);

    graphic.rect(
      -STACK_WIDTH / 2,
      -STACK_HEIGHT / 2,
      STACK_WIDTH,
      STACK_HEIGHT,
    );
    graphic.fill(color);
    graphic.stroke({
      width: ctx.isSelected ? 4 : 2,
      color: ctx.isSelected ? STACK_BORDER_COLOR_SELECTED : STACK_BORDER_COLOR_NORMAL,
    });

    return graphic;
  },

  getBounds(obj: TableObject) {
    return {
      minX: obj._pos.x - STACK_WIDTH / 2,
      minY: obj._pos.y - STACK_HEIGHT / 2,
      maxX: obj._pos.x + STACK_WIDTH / 2,
      maxY: obj._pos.y + STACK_HEIGHT / 2,
    };
  },

  getShadowConfig(obj: TableObject): ShadowConfig {
    return {
      width: STACK_WIDTH,
      height: STACK_HEIGHT,
      shape: 'rect',
      borderRadius: STACK_BORDER_RADIUS,
    };
  },
};
```

**File: `stack/events.ts`**
```typescript
import type { EventHandlers } from '../types';

// Stack uses all default event handlers
// Future: Could add onDoubleClick for flipping cards
export const StackEventHandlers: Partial<EventHandlers> = {};
```

**File: `stack/index.ts`**
```typescript
export * from './constants';
export * from './types';
export * from './utils';
export * from './behaviors';
export * from './events';
```

### 1.3 Create Token Module

**Directory: `app/src/renderer/objects/token/`**

Similar structure with:
- `constants.ts` - TOKEN_DEFAULT_SIZE (40), TOKEN_DEFAULT_COLOR (0xe74c3c)
- `types.ts` - TokenMeta interface
- `utils.ts` - getTokenSize(), getTokenColor()
- `behaviors.ts` - Circle rendering, circular bounds, circular shadow
- `events.ts` - Empty (uses defaults)
- `index.ts` - Re-exports

### 1.4 Create Zone Module

**Directory: `app/src/renderer/objects/zone/`**

**File: `zone/constants.ts`**
```typescript
export const ZONE_DEFAULT_WIDTH = 400;
export const ZONE_DEFAULT_HEIGHT = 300;
export const ZONE_DEFAULT_COLOR = 0x3498db; // Blue
export const ZONE_FILL_ALPHA = 0.1;
export const ZONE_DEFAULT_GRID_SIZE = 50;
```

**File: `zone/types.ts`**
```typescript
export interface ZoneMeta {
  color?: number;
  width?: number;
  height?: number;
  gridSize?: number;
  snapToGrid?: boolean;
}
```

**File: `zone/utils.ts`**
```typescript
export function getZoneWidth(obj: TableObject): number {
  return (obj._meta?.width as number) ?? ZONE_DEFAULT_WIDTH;
}

export function getZoneHeight(obj: TableObject): number {
  return (obj._meta?.height as number) ?? ZONE_DEFAULT_HEIGHT;
}

export function getGridSize(obj: TableObject): number {
  return (obj._meta?.gridSize as number) ?? ZONE_DEFAULT_GRID_SIZE;
}

export function shouldSnapToGrid(obj: TableObject): boolean {
  return (obj._meta?.snapToGrid as boolean) ?? true;
}
```

**File: `zone/behaviors.ts`**
- Semi-transparent rectangle rendering
- Width/height from metadata
- Rectangular bounds and shadow

**File: `zone/events.ts`**
```typescript
import type { EventHandlers } from '../types';
import { getGridSize, shouldSnapToGrid } from './utils';

export const ZoneEventHandlers: Partial<EventHandlers> = {
  // Zone-specific drop behavior with grid snapping
  onDrop(zone: TableObject, droppedObj: TableObject | null) {
    if (!droppedObj) return;

    if (shouldSnapToGrid(zone)) {
      const gridSize = getGridSize(zone);
      const snappedX = Math.round(droppedObj._pos.x / gridSize) * gridSize;
      const snappedY = Math.round(droppedObj._pos.y / gridSize) * gridSize;

      droppedObj._pos.x = snappedX;
      droppedObj._pos.y = snappedY;
    }

    droppedObj._containerId = zone._id;
  },
};
```

### 1.5 Create Mat and Counter Modules

**Directories:**
- `app/src/renderer/objects/mat/` - Similar to Token (circular, different default color)
- `app/src/renderer/objects/counter/` - Similar to Token (circular, different default color)

### 1.6 Create Central Registry

**File: `app/src/renderer/objects/index.ts`**
```typescript
import { ObjectKind } from '@cardtable2/shared';
import type { ObjectBehaviors, EventHandlers } from './types';
import { StackBehaviors, StackEventHandlers } from './stack';
import { TokenBehaviors, TokenEventHandlers } from './token';
import { ZoneBehaviors, ZoneEventHandlers } from './zone';
import { MatBehaviors, MatEventHandlers } from './mat';
import { CounterBehaviors, CounterEventHandlers } from './counter';
import { defaultEventHandlers } from './base';

// Behavior registry
export const behaviorRegistry = new Map<ObjectKind, ObjectBehaviors>([
  [ObjectKind.Stack, StackBehaviors],
  [ObjectKind.Token, TokenBehaviors],
  [ObjectKind.Zone, ZoneBehaviors],
  [ObjectKind.Mat, MatBehaviors],
  [ObjectKind.Counter, CounterBehaviors],
]);

// Event handler registry (merges defaults with type-specific)
export const eventHandlerRegistry = new Map<ObjectKind, EventHandlers>([
  [ObjectKind.Stack, { ...defaultEventHandlers, ...StackEventHandlers }],
  [ObjectKind.Token, { ...defaultEventHandlers, ...TokenEventHandlers }],
  [ObjectKind.Zone, { ...defaultEventHandlers, ...ZoneEventHandlers }],
  [ObjectKind.Mat, { ...defaultEventHandlers, ...MatEventHandlers }],
  [ObjectKind.Counter, { ...defaultEventHandlers, ...CounterEventHandlers }],
]);

// Helper functions
export function getBehaviors(kind: ObjectKind): ObjectBehaviors {
  const behaviors = behaviorRegistry.get(kind);
  if (!behaviors) {
    throw new Error(`No behaviors registered for object kind: ${kind}`);
  }
  return behaviors;
}

export function getEventHandlers(kind: ObjectKind): EventHandlers {
  const handlers = eventHandlerRegistry.get(kind);
  if (!handlers) {
    throw new Error(`No event handlers registered for object kind: ${kind}`);
  }
  return handlers;
}

// Re-export types for convenience
export * from './types';
```

---

## Phase 2: Refactor RendererCore.ts

### 2.1 Add import
```typescript
import { getBehaviors } from './objects';
```

### 2.2 Replace createBaseShapeGraphic switch statement

**Before:**
```typescript
private createBaseShapeGraphic(obj: TableObject, isSelected: boolean): Graphics {
  const graphic = new Graphics();
  const borderColor = isSelected ? 0xef4444 : 0x2d3436;
  const borderWidth = isSelected ? 4 : 2;

  switch (obj._kind) {
    case ObjectKind.Stack: { /* ... */ break; }
    case ObjectKind.Token: { /* ... */ break; }
    case ObjectKind.Zone: { /* ... */ break; }
    case ObjectKind.Mat:
    case ObjectKind.Counter:
    default: { /* ... */ break; }
  }

  return graphic;
}
```

**After:**
```typescript
private createBaseShapeGraphic(obj: TableObject, isSelected: boolean): Graphics {
  const behaviors = getBehaviors(obj._kind);
  return behaviors.render(obj, {
    isSelected,
    isHovered: this.hoveredObjectId === /* get object id */,
    isDragging: this.draggedObjectId === /* get object id */,
    cameraScale: this.cameraScale,
  });
}
```

### 2.3 Replace getShadowBounds switch statement

**Before:**
```typescript
private getShadowBounds(obj: TableObject): { width: number; height: number } {
  switch (obj._kind) {
    case ObjectKind.Stack: {
      return { width: CARD_WIDTH, height: CARD_HEIGHT };
    }
    case ObjectKind.Token:
    case ObjectKind.Mat:
    case ObjectKind.Counter: {
      const radius = (obj._meta?.size as number) || 40;
      return { width: radius * 2, height: radius * 2 };
    }
    case ObjectKind.Zone: {
      const width = (obj._meta?.width as number) || 400;
      const height = (obj._meta?.height as number) || 300;
      return { width, height };
    }
    default: {
      return { width: CARD_WIDTH, height: CARD_HEIGHT };
    }
  }
}
```

**After:**
```typescript
private getShadowBounds(obj: TableObject): { width: number; height: number } {
  const behaviors = getBehaviors(obj._kind);
  const config = behaviors.getShadowConfig(obj);
  return { width: config.width, height: config.height };
}
```

### 2.4 Update shadow rendering to use shape config

**In `redrawCardVisual()`, update shadow shape logic:**

**Before:**
```typescript
if (
  obj._kind === ObjectKind.Token ||
  obj._kind === ObjectKind.Mat ||
  obj._kind === ObjectKind.Counter
) {
  // Circular shadow for round objects
  shadowGraphic.circle(0, 0, shadowBounds.width / 2 + shadowPadding);
} else {
  // Rectangular shadow for cards and zones
  shadowGraphic.roundRect(/* ... */, borderRadius);
}
```

**After:**
```typescript
const behaviors = getBehaviors(obj._kind);
const shadowConfig = behaviors.getShadowConfig(obj);

if (shadowConfig.shape === 'circle') {
  shadowGraphic.circle(0, 0, shadowConfig.width / 2 + shadowPadding);
} else {
  shadowGraphic.roundRect(
    -shadowConfig.width / 2 - shadowPadding,
    -shadowConfig.height / 2 - shadowPadding,
    shadowConfig.width + shadowPadding * 2,
    shadowConfig.height + shadowPadding * 2,
    shadowConfig.borderRadius,
  );
}
```

---

## Phase 3: Refactor SceneManager.ts

### 3.1 Add import
```typescript
import { getBehaviors } from './objects';
```

### 3.2 Replace getBoundingBox switch statement

**Before:**
```typescript
private getBoundingBox(id: string, obj: TableObject): BBox {
  const { x, y } = obj._pos;
  let halfWidth: number;
  let halfHeight: number;

  switch (obj._kind) {
    case ObjectKind.Stack: {
      halfWidth = CARD_WIDTH / 2;
      halfHeight = CARD_HEIGHT / 2;
      break;
    }
    case ObjectKind.Token:
    case ObjectKind.Mat:
    case ObjectKind.Counter: {
      const radius = (obj._meta?.size as number) || 40;
      halfWidth = radius;
      halfHeight = radius;
      break;
    }
    case ObjectKind.Zone: {
      const width = (obj._meta?.width as number) || 400;
      const height = (obj._meta?.height as number) || 300;
      halfWidth = width / 2;
      halfHeight = height / 2;
      break;
    }
    default: {
      halfWidth = CARD_WIDTH / 2;
      halfHeight = CARD_HEIGHT / 2;
      break;
    }
  }

  return {
    minX: x - halfWidth,
    minY: y - halfHeight,
    maxX: x + halfWidth,
    maxY: y + halfHeight,
    id,
  };
}
```

**After:**
```typescript
private getBoundingBox(id: string, obj: TableObject): BBox {
  const behaviors = getBehaviors(obj._kind);
  const bounds = behaviors.getBounds(obj);
  return { ...bounds, id };
}
```

---

## Phase 4: Add Event Handler Support (Infrastructure)

### 4.1 Add event handler hook to RendererCore

**Add new import:**
```typescript
import { getBehaviors, getEventHandlers } from './objects';
```

**Add new method:**
```typescript
/**
 * Call an event handler for an object if one is registered.
 * This provides infrastructure for future event-driven behaviors.
 */
private callEventHandler(
  obj: TableObject,
  eventName: keyof EventHandlers,
  ...args: any[]
): void {
  const handlers = getEventHandlers(obj._kind);
  const handler = handlers[eventName];
  if (handler) {
    handler(obj, ...args);
  }
}
```

### 4.2 Wire up example event hook (hover)

**In `updateHoverFeedback()` method, add comment showing future integration:**
```typescript
private updateHoverFeedback(objectId: string, isHovered: boolean): void {
  const visual = this.objectVisuals.get(objectId);
  if (!visual) return;

  const obj = this.sceneManager.getObject(objectId);
  if (!obj) return;

  // Future: Full event handler integration
  // this.callEventHandler(obj, 'onHover', isHovered);

  // Existing hover feedback implementation...
  visual.targetScale = isHovered ? 1.05 : 1.0;
  // ...
}
```

**Note:** Full event handler integration is optional and can be done in a future PR. This just establishes the pattern.

---

## Phase 5: Testing & Validation

### 5.1 Move constants
- Move `CARD_WIDTH`, `CARD_HEIGHT` from `app/src/renderer/constants.ts` to `objects/stack/constants.ts`
- Update imports throughout codebase
- Keep or remove `TEST_CARD_COLORS` as needed

### 5.2 Run tests
```bash
pnpm run test          # All 52 unit tests should pass
pnpm run test:e2e      # All 30 E2E tests should pass
pnpm run typecheck     # TypeScript compilation should succeed
```

### 5.3 Visual validation
- Start dev server
- Click "Reset to Test Scene"
- Verify all object types render correctly:
  - 5 stacks (portrait rectangles)
  - 3 tokens (circles)
  - 2 zones (large semi-transparent rectangles)
  - 3 mats (circles)
  - 2 counters (circles)
- Test hover on each type (scale + shadow)
- Test selection (red border)
- Test dragging (all behaviors work)

### 5.4 Performance check
- No performance regressions
- Registry lookups are O(1)
- Same rendering performance as before

---

## Phase 6: Cleanup & Documentation

### 6.1 Code cleanup
- Remove commented-out old switch statement code
- Clean up any unused imports
- Remove `TEST_CARD_COLORS` if no longer needed

### 6.2 Update documentation

**Update `CLAUDE.md`:**
```markdown
### Object Architecture
- Object-oriented behavior pattern using registries
- Each object type has dedicated directory in `app/src/renderer/objects/`
- Behaviors defined per-type: render, getBounds, getShadowConfig
- Event handlers support default implementations with opt-out
- To add new object type:
  1. Create directory in `objects/`
  2. Implement behaviors in `behaviors.ts`
  3. Register in `objects/index.ts`
```

**Create `app/src/renderer/objects/README.md`:**
```markdown
# Object Behavior System

This directory contains type-specific behaviors for all game objects.

## Architecture

- **Plain Data Model**: Objects remain plain `TableObject` data (Yjs-compatible)
- **Behavior Registry**: Maps `ObjectKind` → behavior implementations
- **Event Registry**: Maps `ObjectKind` → event handlers

## Directory Structure

Each object type has its own directory:
- `constants.ts` - Type-specific constants
- `types.ts` - Type-specific interfaces and type guards
- `utils.ts` - Helper functions
- `behaviors.ts` - Render, bounds, shadow implementations
- `events.ts` - Custom event handlers (optional)
- `index.ts` - Re-exports

## Adding a New Object Type

1. Create new directory: `objects/newtype/`
2. Implement required files (copy from stack/ as template)
3. Register in `objects/index.ts`:
   ```typescript
   import { NewTypeBehaviors, NewTypeEventHandlers } from './newtype';

   behaviorRegistry.set(ObjectKind.NewType, NewTypeBehaviors);
   eventHandlerRegistry.set(ObjectKind.NewType, {
     ...defaultEventHandlers,
     ...NewTypeEventHandlers
   });
   ```
4. Add to ObjectKind enum in `shared/src/index.ts`

## Extending Existing Types

To add custom behavior to an existing type:
- **Rendering**: Modify `behaviors.ts`
- **Events**: Override in `events.ts`
- **Helpers**: Add to `utils.ts`
- **Constants**: Add to `constants.ts`
```

---

## File Summary

### New Files (30 total)

**Core Infrastructure (3 files):**
1. `app/src/renderer/objects/types.ts`
2. `app/src/renderer/objects/index.ts`
3. `app/src/renderer/objects/README.md`

**Base (2 files):**
4. `app/src/renderer/objects/base/index.ts`
5. `app/src/renderer/objects/base/defaultEvents.ts`

**Stack (5 files):**
6. `app/src/renderer/objects/stack/index.ts`
7. `app/src/renderer/objects/stack/constants.ts`
8. `app/src/renderer/objects/stack/types.ts`
9. `app/src/renderer/objects/stack/utils.ts`
10. `app/src/renderer/objects/stack/behaviors.ts`
11. `app/src/renderer/objects/stack/events.ts`

**Token (5 files):**
12-16. Similar structure to stack/

**Zone (5 files):**
17-21. Similar structure to stack/

**Mat (5 files):**
22-26. Similar structure to stack/

**Counter (5 files):**
27-31. Similar structure to stack/

### Modified Files (2 files)
1. `app/src/renderer/RendererCore.ts` - Replace switch statements with registry lookups
2. `app/src/renderer/SceneManager.ts` - Replace getBoundingBox switch
3. `app/src/renderer/constants.ts` - Move CARD_WIDTH/HEIGHT to stack/ (optional)

### Updated Documentation (1 file)
1. `CLAUDE.md` - Add object architecture section

---

## Success Criteria

✅ All switch statements eliminated from RendererCore and SceneManager
✅ Each object type has its own dedicated directory
✅ Behavior registry successfully handles all 5 object types
✅ Event handler infrastructure in place
✅ All 52 unit tests pass
✅ All 30 E2E tests pass
✅ TypeScript compilation succeeds with no errors
✅ No visual regressions in rendering
✅ No performance regressions
✅ Code is more maintainable and extensible

## Future Benefits

### Immediate Benefits
- **Maintainability**: Each object type's logic is in one place
- **Discoverability**: Easy to find all code related to a type
- **Testing**: Can test object behaviors in isolation
- **Code Review**: Changes to one type don't touch others

### Future Extensions Enabled
- **New Object Types**: Just create directory + implement 3 behaviors
- **Custom Events**: Override in object's `events.ts`
- **Type-Specific Features**: Add to object's directory
- **Animations**: Add `animations.ts` to object directory
- **Asset Loading**: Add `assets.ts` to object directory
- **Validation**: Add `validators.ts` for metadata validation
- **AI Behaviors**: Add `ai.ts` for game-specific AI

---

## Risks & Mitigations

### Risk: Registry lookup overhead
**Mitigation**: Map.get() is O(1), negligible overhead. Measured performance should be identical.

### Risk: Breaking Yjs integration
**Mitigation**: Objects remain plain data, Yjs completely unchanged.

### Risk: Complex refactoring
**Mitigation**: Big-bang approach means all changes in one PR, easier to review atomically.

### Risk: Testing coverage gaps
**Mitigation**: Existing 82 tests should all pass unchanged. No new functionality added.

---

## Non-Goals (Out of Scope)

❌ Full event handler integration (infrastructure only, full integration can be later)
❌ Changing the data model or Yjs structure
❌ Adding new object types
❌ Adding new features or behaviors
❌ Performance optimizations
❌ Visual changes to rendering

This refactoring is **purely architectural** - establishing patterns for future extensibility without changing any user-facing behavior.
