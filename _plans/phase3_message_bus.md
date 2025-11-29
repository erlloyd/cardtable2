# Phase 3: Message Bus + RendererOrchestrator

## Status
- **Phase 1 Complete**: 9 managers extracted ✅
- **Phase 2 Complete**: RendererCore uses managers ✅
- **Phase 3 Next**: Replace switch statement with message bus architecture

## Current State
- **RendererCore.ts**: 1,821 lines
- **Message types**: 20 (in giant switch statement)
- **Switch statement**: Lines 95-483 (~388 lines)
- **Problem**: Adding new message types requires modifying switch statement

## Goal
Replace switch-statement-based message handling with handler registry pattern:
- **RendererCore.ts**: DELETE (replaced by RendererOrchestrator.ts)
- **RendererOrchestrator.ts**: ~400 lines (initialization + coordination)
- **Message handlers**: 20 files × ~20-50 lines = ~600 lines total
- **Message bus infrastructure**: ~200 lines

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│            RendererOrchestrator (~400 lines)         │
│  ├─ Constructor: Initialize managers                 │
│  ├─ initialize(): Handle 'init' message             │
│  └─ handleMessage(): Delegate to MessageBus         │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│          RendererMessageBus (~150 lines)             │
│  ├─ Handler Registry (type → handler)               │
│  ├─ Middleware Stack (logging, perf, validation)    │
│  └─ Context (managers, app, postResponse, etc.)     │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│           Message Handlers (~20 files)               │
│  ├─ lifecycle.ts (init, resize, ping, echo)         │
│  ├─ pointer.ts (down, move, up, cancel, leave)      │
│  ├─ camera.ts (wheel, set-interaction-mode)         │
│  ├─ objects.ts (sync, add, update, remove, clear)   │
│  ├─ awareness.ts (awareness-update)                 │
│  ├─ testing.ts (flush, test-animation)              │
│  └─ coordinates.ts (request-screen-coords)          │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Step 1: Create Message Infrastructure (Day 1)

**1.1 Create MessageHandlerRegistry**
- File: `/app/src/messaging/MessageHandlerRegistry.ts`
- Purpose: Generic handler registry with middleware support
- Size: ~100 lines

```typescript
type MessageHandler<TMessage, TContext> = (
  message: TMessage,
  context: TContext
) => void | Promise<void>;

type Middleware<TMessage, TContext> = (
  message: TMessage,
  context: TContext,
  next: () => Promise<void>
) => Promise<void>;

export class MessageHandlerRegistry<TMessage extends { type: string }, TContext> {
  private handlers = new Map<string, MessageHandler<any, TContext>>();
  private middleware: Middleware<TMessage, TContext>[] = [];

  register<T extends TMessage['type']>(
    type: T,
    handler: MessageHandler<Extract<TMessage, { type: T }>, TContext>
  ): void {
    this.handlers.set(type, handler);
  }

  use(middleware: Middleware<TMessage, TContext>): void {
    this.middleware.push(middleware);
  }

  async handle(message: TMessage, context: TContext): Promise<void> {
    const handler = this.handlers.get(message.type);
    if (!handler) {
      throw new Error(`No handler registered for message type: ${message.type}`);
    }

    // Execute middleware chain
    let index = 0;
    const next = async (): Promise<void> => {
      if (index < this.middleware.length) {
        const middleware = this.middleware[index++];
        await middleware(message, context, next);
      } else {
        await handler(message, context);
      }
    };

    await next();
  }
}
```

**1.2 Create Middleware**
- File: `/app/src/messaging/middleware/index.ts`
- Purpose: Logging, performance tracking, error handling
- Size: ~100 lines

```typescript
export const loggingMiddleware: Middleware<any, any> = async (message, context, next) => {
  console.log(`[MessageBus] Handling: ${message.type}`);
  await next();
};

export const performanceMiddleware: Middleware<any, any> = async (message, context, next) => {
  const start = performance.now();
  await next();
  const duration = performance.now() - start;
  if (duration > 10) {
    console.warn(`[MessageBus] Slow handler: ${message.type} (${duration.toFixed(2)}ms)`);
  }
};

export const errorHandlingMiddleware: Middleware<any, any> = async (message, context, next) => {
  try {
    await next();
  } catch (error) {
    console.error(`[MessageBus] Handler error for ${message.type}:`, error);
    // Don't re-throw - log and continue
  }
};
```

**Success Criteria**:
- MessageHandlerRegistry tests pass (5 tests)
- Middleware tests pass (3 tests per middleware = 9 tests)
- TypeScript compiles

---

### Step 2: Create RendererContext (Day 1)

**2.1 Define RendererContext Interface**
- File: `/app/src/renderer/RendererContext.ts`
- Purpose: Context passed to all message handlers
- Size: ~50 lines

```typescript
import type { Application, Container } from 'pixi.js';
import type { RendererToMainMessage } from '@cardtable2/shared';
import type { RenderMode } from './IRendererAdapter';
import type { InteractionMode } from '@cardtable2/shared';
import type {
  CoordinateConverter,
  CameraManager,
  GestureRecognizer,
  SelectionManager,
  DragManager,
  HoverManager,
  SelectionRectangleManager,
  AwarenessManager,
  VisualManager,
} from './managers';
import type { SceneManager } from './SceneManager';

export interface RendererContext {
  // PixiJS
  app: Application;
  worldContainer: Container;
  renderMode: RenderMode;

  // Managers
  coordConverter: CoordinateConverter;
  camera: CameraManager;
  gestures: GestureRecognizer;
  selection: SelectionManager;
  drag: DragManager;
  hover: HoverManager;
  rectangleSelect: SelectionRectangleManager;
  awareness: AwarenessManager;
  visual: VisualManager;
  sceneManager: SceneManager;

  // Communication
  postResponse: (message: RendererToMainMessage) => void;

  // Mutable state (handlers can update)
  interactionMode: InteractionMode;
}
```

**Success Criteria**:
- TypeScript compiles
- All managers accessible via context

---

### Step 3: Extract Message Handlers (Day 2-3)

Create 7 handler files, grouping related message types:

**3.1 Lifecycle Handlers**
- File: `/app/src/renderer/handlers/lifecycle.ts`
- Messages: `resize`, `ping`, `echo`
- Size: ~60 lines

```typescript
export function handleResize(
  message: Extract<MainToRendererMessage, { type: 'resize' }>,
  context: RendererContext
): void {
  const { width, height, dpr } = message;

  // Store old dimensions
  const oldWidth = context.app.renderer.width;
  const oldHeight = context.app.renderer.height;

  // Resize renderer
  context.app.renderer.resize(width, height);
  context.app.renderer.resolution = dpr;

  // Reset canvas style (main-thread mode)
  if ('style' in context.app.canvas) {
    context.app.canvas.style.width = '100%';
    context.app.canvas.style.height = '100%';
  }

  // Update world container position (preserve pan offset)
  const offsetX = context.worldContainer.position.x - oldWidth / 2;
  const offsetY = context.worldContainer.position.y - oldHeight / 2;
  context.worldContainer.position.set(
    width / 2 + offsetX,
    height / 2 + offsetY
  );

  // Force render
  context.app.renderer.render(context.app.stage);
}

export function handlePing(
  message: Extract<MainToRendererMessage, { type: 'ping' }>,
  context: RendererContext
): void {
  context.postResponse({
    type: 'pong',
    data: `Pong! Received: ${message.data}`,
  });
}

export function handleEcho(
  message: Extract<MainToRendererMessage, { type: 'echo' }>,
  context: RendererContext
): void {
  context.postResponse({
    type: 'echo-response',
    data: message.data,
  });
}
```

**3.2 Pointer Handlers**
- File: `/app/src/renderer/handlers/pointer.ts`
- Messages: `pointer-down`, `pointer-move`, `pointer-up`, `pointer-cancel`, `pointer-leave`
- Size: ~300 lines (extract from RendererCore lines 529-836)

**3.3 Camera Handlers**
- File: `/app/src/renderer/handlers/camera.ts`
- Messages: `wheel`, `set-interaction-mode`
- Size: ~50 lines

**3.4 Object Handlers**
- File: `/app/src/renderer/handlers/objects.ts`
- Messages: `sync-objects`, `objects-added`, `objects-updated`, `objects-removed`, `clear-objects`
- Size: ~150 lines (extract from RendererCore lines 389-457)

**3.5 Awareness Handlers**
- File: `/app/src/renderer/handlers/awareness.ts`
- Messages: `awareness-update`
- Size: ~30 lines (extract from RendererCore lines 459-467)

**3.6 Testing Handlers**
- File: `/app/src/renderer/handlers/testing.ts`
- Messages: `flush`, `test-animation`
- Size: ~80 lines (extract from RendererCore lines 273-347)

**3.7 Coordinate Handlers**
- File: `/app/src/renderer/handlers/coordinates.ts`
- Messages: `request-screen-coords`
- Size: ~80 lines (extract from RendererCore lines 469-473 + handleRequestScreenCoords)

**Success Criteria**:
- Each handler file compiles
- Handlers are pure functions (no side effects beyond context mutations)
- All 20 message types have handlers

---

### Step 4: Create RendererMessageBus (Day 3)

**4.1 Build RendererMessageBus**
- File: `/app/src/renderer/RendererMessageBus.ts`
- Purpose: Register handlers and middleware
- Size: ~150 lines

```typescript
import { MessageHandlerRegistry } from '../messaging/MessageHandlerRegistry';
import type { MainToRendererMessage } from '@cardtable2/shared';
import type { RendererContext } from './RendererContext';
import {
  loggingMiddleware,
  performanceMiddleware,
  errorHandlingMiddleware,
} from '../messaging/middleware';
import * as lifecycle from './handlers/lifecycle';
import * as pointer from './handlers/pointer';
import * as camera from './handlers/camera';
import * as objects from './handlers/objects';
import * as awareness from './handlers/awareness';
import * as testing from './handlers/testing';
import * as coordinates from './handlers/coordinates';

export class RendererMessageBus {
  private registry = new MessageHandlerRegistry<MainToRendererMessage, RendererContext>();

  constructor() {
    this.registerMiddleware();
    this.registerHandlers();
  }

  private registerMiddleware(): void {
    this.registry.use(loggingMiddleware);
    this.registry.use(performanceMiddleware);
    this.registry.use(errorHandlingMiddleware);
  }

  private registerHandlers(): void {
    // Lifecycle
    this.registry.register('resize', lifecycle.handleResize);
    this.registry.register('ping', lifecycle.handlePing);
    this.registry.register('echo', lifecycle.handleEcho);

    // Pointer
    this.registry.register('pointer-down', pointer.handlePointerDown);
    this.registry.register('pointer-move', pointer.handlePointerMove);
    this.registry.register('pointer-up', pointer.handlePointerUp);
    this.registry.register('pointer-cancel', pointer.handlePointerCancel);
    this.registry.register('pointer-leave', pointer.handlePointerLeave);

    // Camera
    this.registry.register('wheel', camera.handleWheel);
    this.registry.register('set-interaction-mode', camera.handleSetInteractionMode);

    // Objects
    this.registry.register('sync-objects', objects.handleSyncObjects);
    this.registry.register('objects-added', objects.handleObjectsAdded);
    this.registry.register('objects-updated', objects.handleObjectsUpdated);
    this.registry.register('objects-removed', objects.handleObjectsRemoved);
    this.registry.register('clear-objects', objects.handleClearObjects);

    // Awareness
    this.registry.register('awareness-update', awareness.handleAwarenessUpdate);

    // Testing
    this.registry.register('flush', testing.handleFlush);
    this.registry.register('test-animation', testing.handleTestAnimation);

    // Coordinates
    this.registry.register('request-screen-coords', coordinates.handleRequestScreenCoords);
  }

  async handleMessage(message: MainToRendererMessage, context: RendererContext): Promise<void> {
    await this.registry.handle(message, context);
  }
}
```

**Success Criteria**:
- All 20 handlers registered
- Middleware chain works
- TypeScript compiles

---

### Step 5: Create RendererOrchestrator (Day 4)

**5.1 Build RendererOrchestrator**
- File: `/app/src/renderer/RendererOrchestrator.ts`
- Purpose: Replace RendererCore with message-bus-based orchestrator
- Size: ~400 lines

```typescript
import { Application, Container } from 'pixi.js';
import type { MainToRendererMessage, RendererToMainMessage } from '@cardtable2/shared';
import type { RenderMode } from './IRendererAdapter';
import { SceneManager } from './SceneManager';
import {
  CoordinateConverter,
  CameraManager,
  GestureRecognizer,
  SelectionManager,
  DragManager,
  HoverManager,
  SelectionRectangleManager,
  AwarenessManager,
  VisualManager,
} from './managers';
import { RendererMessageBus } from './RendererMessageBus';
import type { RendererContext } from './RendererContext';
import { debounce } from '../utils/debounce';

// Zoom debounce delay
const ZOOM_DEBOUNCE_DELAY_MS = 200;

export abstract class RendererOrchestrator {
  // PixiJS
  private app: Application | null = null;
  private worldContainer: Container | null = null;

  // Rendering mode
  protected renderMode: RenderMode = RenderMode.Worker;

  // Scene management
  private sceneManager: SceneManager = new SceneManager();

  // Managers
  private coordConverter: CoordinateConverter = new CoordinateConverter();
  private camera: CameraManager;
  private gestures: GestureRecognizer = new GestureRecognizer();
  private selection: SelectionManager = new SelectionManager();
  private drag: DragManager = new DragManager();
  private hover: HoverManager = new HoverManager();
  private rectangleSelect: SelectionRectangleManager = new SelectionRectangleManager();
  private awareness: AwarenessManager = new AwarenessManager();
  private visual: VisualManager = new VisualManager();

  // Message bus
  private messageBus: RendererMessageBus | null = null;

  // State
  private interactionMode: InteractionMode = 'pan';

  // Debounced zoom end
  private debouncedZoomEnd = debounce(() => {
    this.postResponse({ type: 'zoom-ended' });
  }, ZOOM_DEBOUNCE_DELAY_MS);

  constructor() {
    this.camera = new CameraManager(this.coordConverter);
  }

  /**
   * Send response message to main thread
   */
  protected abstract postResponse(message: RendererToMainMessage): void;

  /**
   * Handle incoming message
   */
  async handleMessage(message: MainToRendererMessage): Promise<void> {
    try {
      // Handle init separately (bootstraps the system)
      if (message.type === 'init') {
        await this.initialize(message);
        return;
      }

      // Delegate all other messages to message bus
      if (!this.messageBus || !this.app || !this.worldContainer) {
        throw new Error('RendererOrchestrator not initialized');
      }

      const context = this.createContext();
      await this.messageBus.handleMessage(message, context);

      // Sync selection cache for messages that affect objects
      if (this.shouldSyncSelectionCache(message.type)) {
        this.syncSelectionCache();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.postResponse({
        type: 'error',
        error: `Renderer error: ${errorMsg}`,
        context: 'handleMessage',
      });
    }
  }

  /**
   * Initialize renderer (handles 'init' message)
   */
  private async initialize(
    message: Extract<MainToRendererMessage, { type: 'init' }>
  ): Promise<void> {
    const { canvas, width, height, dpr, actorId } = message;

    // Initialize managers with basic config
    this.selection.setActorId(actorId);
    this.coordConverter.setDevicePixelRatio(dpr);
    this.coordConverter.setCameraScale(1.0);

    console.log('[RendererOrchestrator] Initializing PixiJS...');

    try {
      // Create PixiJS app
      this.app = new Application();
      await this.app.init({
        canvas,
        width,
        height,
        resolution: dpr,
        autoDensity: true,
        backgroundColor: 0xd4d4d4,
        autoStart: false, // Critical for iOS stability
      });

      console.log('[RendererOrchestrator] ✓ PixiJS initialized');

      // Verify ticker didn't auto-start
      if (this.app.ticker.started) {
        console.warn('[RendererOrchestrator] Ticker auto-started, stopping...');
        this.app.ticker.stop();
      }

      // Initialize viewport
      this.initializeViewport(width, height);

      // Initial render
      this.app.renderer.render(this.app.stage);

      // Reset canvas style (main-thread mode)
      if ('style' in canvas) {
        canvas.style.width = '100%';
        canvas.style.height = '100%';
      }

      // Create message bus
      this.messageBus = new RendererMessageBus();

      this.postResponse({ type: 'initialized' });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[RendererOrchestrator] Initialization failed:', error);
      this.postResponse({
        type: 'error',
        error: `PixiJS initialization failed: ${errorMsg}`,
        context: 'init',
      });
    }
  }

  /**
   * Initialize viewport and managers
   */
  private initializeViewport(width: number, height: number): void {
    if (!this.app) return;

    // Create world container
    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);
    this.worldContainer.position.set(width / 2, height / 2);
    this.worldContainer.scale.set(1.0);

    // Initialize managers
    this.camera.initialize(this.app, this.worldContainer);
    this.visual.initialize(this.app, this.renderMode);
    this.awareness.initialize(this.app.stage);
  }

  /**
   * Create context for handlers
   */
  private createContext(): RendererContext {
    if (!this.app || !this.worldContainer) {
      throw new Error('Cannot create context before initialization');
    }

    return {
      // PixiJS
      app: this.app,
      worldContainer: this.worldContainer,
      renderMode: this.renderMode,

      // Managers
      coordConverter: this.coordConverter,
      camera: this.camera,
      gestures: this.gestures,
      selection: this.selection,
      drag: this.drag,
      hover: this.hover,
      rectangleSelect: this.rectangleSelect,
      awareness: this.awareness,
      visual: this.visual,
      sceneManager: this.sceneManager,

      // Communication
      postResponse: this.postResponse.bind(this),

      // Mutable state
      interactionMode: this.interactionMode,
    };
  }

  /**
   * Check if message type requires selection cache sync
   */
  private shouldSyncSelectionCache(messageType: string): boolean {
    return (
      messageType === 'sync-objects' ||
      messageType === 'objects-added' ||
      messageType === 'objects-updated' ||
      messageType === 'objects-removed'
    );
  }

  /**
   * Sync selection cache from store
   */
  private syncSelectionCache(): void {
    const { added, removed } = this.selection.syncFromStore(this.sceneManager);

    // Redraw visuals for changed objects
    for (const id of [...added, ...removed]) {
      const isSelected = this.selection.isSelected(id);
      // TODO: Extract redrawCardVisual to helper or manager
      // this.redrawCardVisual(id, false, false, isSelected);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.worldContainer) {
      this.worldContainer.destroy();
      this.worldContainer = null;
    }
    if (this.app) {
      this.app.destroy();
      this.app = null;
    }
    this.gestures.clear();
    this.sceneManager.clear();
    if (this.worldContainer) {
      this.visual.clear(this.worldContainer);
    }
    this.hover.clearAll();
  }
}
```

**Success Criteria**:
- RendererOrchestrator ~400 lines
- All initialization logic preserved
- Message delegation works
- TypeScript compiles

---

### Step 6: Update Adapters (Day 4)

**6.1 Update WorkerRendererAdapter**
- File: `/app/src/renderer/WorkerRendererAdapter.ts`
- Change: Extend `RendererOrchestrator` instead of `RendererCore`

```typescript
import { RendererOrchestrator } from './RendererOrchestrator';
import type { RendererToMainMessage } from '@cardtable2/shared';
import { RenderMode } from './IRendererAdapter';

export class WorkerRendererAdapter extends RendererOrchestrator {
  constructor() {
    super();
    this.renderMode = RenderMode.Worker;
  }

  protected postResponse(message: RendererToMainMessage): void {
    self.postMessage(message);
  }
}
```

**6.2 Update MainThreadRendererAdapter**
- File: `/app/src/renderer/MainThreadRendererAdapter.ts`
- Change: Extend `RendererOrchestrator` instead of `RendererCore`

```typescript
import { RendererOrchestrator } from './RendererOrchestrator';
import type { RendererToMainMessage } from '@cardtable2/shared';
import { RenderMode } from './IRendererAdapter';

export class MainThreadRendererAdapter extends RendererOrchestrator {
  constructor(private callback: (message: RendererToMainMessage) => void) {
    super();
    this.renderMode = RenderMode.MainThread;
  }

  protected postResponse(message: RendererToMainMessage): void {
    this.callback(message);
  }
}
```

**Success Criteria**:
- Adapters compile
- Both worker and main-thread modes work
- All tests pass

---

### Step 7: Delete RendererCore + Test (Day 5)

**7.1 Delete RendererCore.ts**
```bash
git rm app/src/renderer/RendererCore.ts
```

**7.2 Run Full Test Suite**
```bash
pnpm run typecheck
pnpm run test
pnpm run test:e2e
```

**7.3 Manual Testing**
- Test in browser (both modes)
- Test on iOS (main-thread mode)
- Verify all interactions work

**Success Criteria**:
- All 209+ tests passing
- TypeScript compiles
- No runtime errors
- Dev server runs
- Both render modes work

---

## File Structure After Phase 3

```
app/src/
├── messaging/
│   ├── MessageHandlerRegistry.ts (~100 lines) ✨ NEW
│   └── middleware/
│       └── index.ts (~100 lines) ✨ NEW
├── renderer/
│   ├── RendererOrchestrator.ts (~400 lines) ✨ NEW (replaces RendererCore)
│   ├── RendererMessageBus.ts (~150 lines) ✨ NEW
│   ├── RendererContext.ts (~50 lines) ✨ NEW
│   ├── WorkerRendererAdapter.ts (~30 lines) ✅ UPDATED
│   ├── MainThreadRendererAdapter.ts (~30 lines) ✅ UPDATED
│   ├── managers/ (9 managers) ✅ EXISTS
│   └── handlers/ ✨ NEW
│       ├── lifecycle.ts (~60 lines)
│       ├── pointer.ts (~300 lines)
│       ├── camera.ts (~50 lines)
│       ├── objects.ts (~150 lines)
│       ├── awareness.ts (~30 lines)
│       ├── testing.ts (~80 lines)
│       └── coordinates.ts (~80 lines)
└── [RendererCore.ts DELETED] ❌
```

---

## Testing Strategy

### Unit Tests
- **MessageHandlerRegistry**: 5 tests
  - Register handler
  - Handle message
  - Unknown message type
  - Middleware execution order
  - Error handling

- **Middleware**: 9 tests (3 per middleware)
  - Logging middleware logs messages
  - Performance middleware warns on slow handlers
  - Error middleware catches and logs errors

- **Message Handlers**: ~40 tests (2 per handler)
  - Each handler processes message correctly
  - Each handler updates context appropriately

### Integration Tests
- **RendererOrchestrator**: 15 tests
  - Initialization
  - Message delegation
  - Context creation
  - Selection cache sync
  - Error handling

### E2E Tests
- All existing E2E tests should pass
- No new E2E tests needed (functionality unchanged)

---

## Success Metrics

### Code Metrics
- **Lines Removed**: 1,821 (RendererCore deleted)
- **Lines Added**: ~1,400 (orchestrator + bus + handlers)
- **Net Reduction**: ~400 lines
- **Average File Size**: ~80 lines (was: 1,821)

### Architecture Metrics
- **Switch Statements**: 0 (was: 1 giant switch)
- **Message Handler Files**: 7 (organized by domain)
- **Cyclomatic Complexity**: Low (small, focused functions)
- **Testability**: High (handlers are pure functions)

### Maintainability
- ✅ Adding new message type: Add 1 handler file (~20-50 lines)
- ✅ Modifying message handling: Edit 1 handler file
- ✅ Testing handlers: Unit test individual handler
- ✅ Debugging: Middleware provides logging/perf tracking

---

## Risks & Mitigations

### Risk 1: Breaking Existing Tests
**Mitigation**: Run tests after each step, fix incrementally

### Risk 2: Performance Overhead
**Mitigation**: Middleware adds <0.1ms, negligible at 60fps

### Risk 3: Complex Handler Dependencies
**Mitigation**: Keep handlers pure, pass all deps via context

### Risk 4: Missed Edge Cases
**Mitigation**: Extract handlers directly from switch cases, preserve all logic

---

## Timeline

- **Day 1**: Message infrastructure + context (Steps 1-2)
- **Day 2**: Extract first 4 handlers (Step 3.1-3.4)
- **Day 3**: Extract remaining handlers + message bus (Steps 3.5-3.7, Step 4)
- **Day 4**: Create orchestrator + update adapters (Steps 5-6)
- **Day 5**: Delete RendererCore + test + fix issues (Step 7)

**Total Estimate**: 5 days (can compress to 3-4 days if focused)

---

## Next Phase Preview

**Phase 4: Board Refactor**
- Extract custom hooks from Board component
- Create BoardMessageBus
- Reduce Board from 1,100 → ~300 lines
- Extract UI components

This will complete the full Hybrid Architecture refactor! 🎉
