# Object Behavior System

This directory contains type-specific behaviors for all game objects.

## Architecture

- **Plain Data Model**: Objects remain plain `TableObject` data (Yjs-compatible)
- **Behavior Registry**: Maps `ObjectKind` → behavior implementations
- **Event Registry**: Maps `ObjectKind` → event handlers

## Directory Structure

Each object type has its own directory:
- `constants.ts` - Type-specific constants (dimensions, colors, etc.)
- `types.ts` - Type-specific interfaces and type guards
- `utils.ts` - Helper functions for working with the object type
- `behaviors.ts` - Render, bounds, and shadow implementations
- `events.ts` - Custom event handlers (optional overrides)
- `index.ts` - Re-exports all public APIs

## Adding a New Object Type

1. **Create directory structure**: `objects/newtype/`
2. **Implement required files** (use `stack/` as template):
   ```bash
   cp -r objects/stack objects/newtype
   # Then customize for your object type
   ```
3. **Register in `objects/index.ts`**:
   ```typescript
   import { NewTypeBehaviors, NewTypeEventHandlers } from './newtype';

   behaviorRegistry.set(ObjectKind.NewType, NewTypeBehaviors);
   eventHandlerRegistry.set(ObjectKind.NewType, {
     ...defaultEventHandlers,
     ...NewTypeEventHandlers
   });
   ```
4. **Add to ObjectKind enum** in `shared/src/index.ts`

## Extending Existing Types

To add custom behavior to an existing type:
- **Rendering**: Modify `behaviors.ts` (render function)
- **Events**: Override in `events.ts` (onHover, onClick, onDrag, onDrop, onDoubleClick)
- **Helpers**: Add to `utils.ts`
- **Constants**: Add to `constants.ts`

## Behavior Interfaces

### ObjectBehaviors
```typescript
interface ObjectBehaviors {
  render: (obj: TableObject, ctx: RenderContext) => Graphics;
  getBounds: (obj: TableObject) => Omit<BBox, 'id'>;
  getShadowConfig: (obj: TableObject) => ShadowConfig;
}
```

### EventHandlers
```typescript
interface EventHandlers {
  onHover?: (obj: TableObject, isHovered: boolean) => void;
  onClick?: (obj: TableObject, event: PointerEventData) => void;
  onDrag?: (obj: TableObject, delta: { x: number; y: number }) => void;
  onDrop?: (zone: TableObject, droppedObj: TableObject | null) => void;
  onDoubleClick?: (obj: TableObject, event: PointerEventData) => void;
}
```

## Example: Custom Zone Behavior

```typescript
// objects/zone/events.ts
export const ZoneEventHandlers: Partial<EventHandlers> = {
  onDrop(zone: TableObject, droppedObj: TableObject | null) {
    if (!droppedObj) return;

    // Snap to grid
    if (shouldSnapToGrid(zone)) {
      const gridSize = getGridSize(zone);
      droppedObj._pos.x = Math.round(droppedObj._pos.x / gridSize) * gridSize;
      droppedObj._pos.y = Math.round(droppedObj._pos.y / gridSize) * gridSize;
    }
  },
};
```

## Current Object Types

- **Stack** (`objects/stack/`) - Card stacks (portrait rectangles)
- **Token** (`objects/token/`) - Circular game tokens
- **Zone** (`objects/zone/`) - Semi-transparent rectangular areas with grid snapping
- **Mat** (`objects/mat/`) - Circular player mats
- **Counter** (`objects/counter/`) - Circular counters/markers

## Design Principles

1. **Separation of Concerns**: Object data (TableObject) is separate from behavior
2. **Extensibility**: Easy to add new object types without modifying core code
3. **No Switch Statements**: Registry pattern eliminates type-based branching
4. **Yjs Compatibility**: Objects remain plain data for CRDT sync
5. **Type Safety**: TypeScript interfaces ensure correct implementations
