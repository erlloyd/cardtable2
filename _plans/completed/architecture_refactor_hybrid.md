# Approach 4: Hybrid Synthesis (RECOMMENDED)

## Philosophy

Combine the best elements from all three approaches:
- **Composition** for structure (managers, hooks, small modules)
- **Message-Driven** for communication (handler registries, middleware)
- **DDD** for organization (layered architecture, separation of concerns)

Pragmatic balance between clean architecture and practical implementation. Best of all worlds.

## Why Hybrid?

### Problems with Pure Approaches

**Composition-First Alone**:
- Doesn't address switch statement problems
- No clear communication patterns
- Can become scattered without structure

**Message-Driven Alone**:
- Doesn't extract managers/logic
- Handlers still contain business logic
- No framework independence

**DDD Alone**:
- High initial complexity
- Steep learning curve
- Over-engineering for some parts

### Hybrid Solution

**Use Composition for**: Structure and logic extraction
**Use Message-Driven for**: Communication between layers
**Use DDD for**: Organizational principles and boundaries

---

## Architecture Vision

### Three-Layer Architecture with Composition

```
┌───────────────────────────────────────────────────────────┐
│                  PRESENTATION LAYER                        │
│  Board Component (~300 lines)                              │
│  ├─ Custom Hooks (useRenderer, useStoreSync, etc.)        │
│  ├─ Message Bus (BoardMessageBus)                         │
│  └─ UI Components (DebugPanel, ActionOverlay)             │
└──────────────────┬────────────────────────────────────────┘
                   │ message passing
                   ▼
┌───────────────────────────────────────────────────────────┐
│                  APPLICATION LAYER                         │
│  Renderer Orchestrator (~400 lines)                       │
│  ├─ Managers (Camera, Selection, Drag, etc.)              │
│  ├─ Message Bus (RendererMessageBus)                      │
│  └─ Handler Registry (type-safe message routing)          │
└──────────────────┬────────────────────────────────────────┘
                   │ delegates to
                   ▼
┌───────────────────────────────────────────────────────────┐
│                   MANAGER LAYER                            │
│  Small, Focused Managers (9 managers, ~100-300 lines)     │
│  ├─ CameraManager (pure math)                             │
│  ├─ SelectionManager (ownership rules)                    │
│  ├─ DragManager (movement logic)                          │
│  ├─ GestureRecognizer (input logic)                       │
│  ├─ HoverManager, AwarenessManager, etc.                  │
│  └─ Each manager is independently testable                │
└──────────────────┬────────────────────────────────────────┘
                   │ uses
                   ▼
┌───────────────────────────────────────────────────────────┐
│                INFRASTRUCTURE LAYER                        │
│  PixiJS, Yjs, Workers (framework implementations)          │
└───────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Composition for Managers**: Break logic into small, focused managers
2. **Message Buses for Communication**: Replace switch statements with handler registries
3. **Middleware for Cross-Cutting Concerns**: Logging, metrics, validation
4. **Layered Organization**: Clear dependencies (Presentation → Application → Managers → Infrastructure)
5. **Pragmatic Purity**: Managers are mostly pure, but don't over-abstract infrastructure

---

## Detailed Design

### 1. Manager Layer (Composition Pattern)

**Extract 9 focused managers from RendererCore**:

#### CameraManager (~200 lines)
```typescript
// /src/renderer/managers/CameraManager.ts

export class CameraManager {
  private scale = 1.0;
  private x = 0;
  private y = 0;

  constructor(
    private width: number,
    private height: number,
    private onViewportChange: (scale: number, x: number, y: number) => void
  ) {}

  zoom(factor: number, screenX: number, screenY: number): void {
    const worldPoint = this.toWorld(screenX, screenY);

    this.scale *= factor;
    this.scale = Math.max(0.1, Math.min(10, this.scale));

    const newScreenPoint = this.worldToScreen(worldPoint.x, worldPoint.y);
    this.x += screenX - newScreenPoint.x;
    this.y += screenY - newScreenPoint.y;

    this.onViewportChange(this.scale, this.x, this.y);
  }

  pan(deltaX: number, deltaY: number): void {
    this.x += deltaX;
    this.y += deltaY;
    this.onViewportChange(this.scale, this.x, this.y);
  }

  toWorld(screenX: number, screenY: number): { x: number; y: number } {
    const centerX = this.width / 2;
    const centerY = this.height / 2;

    return {
      x: (screenX - centerX - this.x) / this.scale,
      y: (screenY - centerY - this.y) / this.scale,
    };
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const centerX = this.width / 2;
    const centerY = this.height / 2;

    return {
      x: worldX * this.scale + centerX + this.x,
      y: worldY * this.scale + centerY + this.y,
    };
  }

  getScale(): number { return this.scale; }
  getPosition(): { x: number; y: number } { return { x: this.x, y: this.y }; }
}
```

**Why This Design**:
- Pure math (easily testable)
- Callback for viewport changes (decoupled from PixiJS)
- Small interface, single responsibility

#### Other Managers (similar patterns)

- **GestureRecognizer** (~250 lines): Pointer tracking, gesture detection
- **SelectionManager** (~200 lines): Selection cache, ownership validation
- **DragManager** (~300 lines): Drag state, multi-drag, position updates
- **HoverManager** (~150 lines): Hover detection, animation
- **SelectionRectangleManager** (~150 lines): Rectangle selection
- **AwarenessManager** (~300 lines): Remote cursors/ghosts
- **VisualManager** (~400 lines): Object rendering
- **SceneManager** (~150 lines): Spatial indexing (already exists)

---

### 2. Message Bus Pattern (Message-Driven)

#### Renderer Message Bus

**Replace RendererCore's 400-line switch statement**:

```typescript
// /src/renderer/RendererMessageBus.ts

export class RendererMessageBus {
  private registry = new MessageHandlerRegistry<MainToRendererMessage>();

  constructor(private context: RendererContext) {
    this.registerHandlers();
    this.registerMiddleware();
  }

  private registerHandlers(): void {
    // Initialization
    this.registry.register('init', (msg) => this.handleInit(msg));
    this.registry.register('resize', (msg) => this.handleResize(msg));

    // Input
    this.registry.register('pointer-down', (msg) => this.handlePointerDown(msg));
    this.registry.register('pointer-move', (msg) => this.handlePointerMove(msg));
    this.registry.register('pointer-up', (msg) => this.handlePointerUp(msg));
    this.registry.register('wheel', (msg) => this.handleWheel(msg));

    // Objects
    this.registry.register('sync-objects', (msg) => this.handleSyncObjects(msg));
    this.registry.register('objects-added', (msg) => this.handleObjectsAdded(msg));
    // ... etc
  }

  private registerMiddleware(): void {
    this.registry.use(loggingMiddleware);
    this.registry.use(performanceMiddleware);
  }

  private handlePointerDown(msg: Extract<MainToRendererMessage, { type: 'pointer-down' }>): void {
    const { event } = msg;

    // Track gesture
    this.context.gestures.trackPointer(event);

    // Convert coordinates
    const worldPos = this.context.camera.toWorld(event.x, event.y);

    // Delegate to managers based on gesture
    const gestureType = this.context.gestures.getGestureType();

    if (gestureType === 'drag') {
      this.handleObjectDragStart(worldPos, event);
    } else if (gestureType === 'rect-select') {
      this.context.selectionRect.startRectangle(worldPos.x, worldPos.y);
    } else if (gestureType === 'pan') {
      this.context.postResponse({ type: 'pan-started' });
    }
  }

  private handleObjectDragStart(
    worldPos: { x: number; y: number },
    event: PointerEventData
  ): void {
    const hit = this.context.sceneManager.hitTest(worldPos.x, worldPos.y);

    if (hit && this.context.selection.isSelected(hit.id)) {
      this.context.drag.startDrag(hit.id, worldPos.x, worldPos.y);
      this.context.postResponse({ type: 'object-drag-started' });
    }
  }

  async handleMessage(message: MainToRendererMessage): Promise<void> {
    await this.registry.handle(message, this.context);
  }
}
```

**RendererContext** (passed to handlers):
```typescript
interface RendererContext {
  // PixiJS
  app: Application;
  worldContainer: Container;

  // Managers
  camera: CameraManager;
  gestures: GestureRecognizer;
  selection: SelectionManager;
  drag: DragManager;
  hover: HoverManager;
  selectionRect: SelectionRectangleManager;
  awareness: AwarenessManager;
  visuals: VisualManager;
  sceneManager: SceneManager;

  // Communication
  postResponse: (msg: RendererToMainMessage) => void;

  // State
  actorId: string;
  devicePixelRatio: number;
  interactionMode: 'pan' | 'select';
}
```

#### Board Message Bus

**Replace Board's 228-line switch statement**:

```typescript
// /src/components/Board/BoardMessageBus.ts

export class BoardMessageBus {
  private registry = new MessageHandlerRegistry<RendererToMainMessage>();

  constructor() {
    this.registerHandlers();
    this.registerMiddleware();
  }

  private registerHandlers(): void {
    // Lifecycle
    this.registry.register('ready', handleReady);
    this.registry.register('initialized', handleInitialized);

    // Object state
    this.registry.register('objects-moved', handleObjectsMoved);
    this.registry.register('objects-selected', handleObjectsSelected);
    this.registry.register('objects-unselected', handleObjectsUnselected);

    // Camera
    this.registry.register('pan-started', handlePanStarted);
    this.registry.register('pan-ended', handlePanEnded);
    this.registry.register('zoom-started', handleZoomStarted);
    this.registry.register('zoom-ended', handleZoomEnded);

    // Awareness
    this.registry.register('cursor-position', handleCursorPosition);
    this.registry.register('drag-state-update', handleDragStateUpdate);

    // ... etc
  }

  async handleMessage(
    message: RendererToMainMessage,
    context: BoardHandlerContext
  ): Promise<void> {
    await this.registry.handle(message, context);
  }
}
```

**Handler Example** (extracted from switch statement):
```typescript
// /src/components/Board/handlers/objectState.ts

export function handleObjectsMoved(
  message: Extract<RendererToMainMessage, { type: 'objects-moved' }>,
  context: BoardHandlerContext
): void {
  console.log(`[Board] ${message.updates.length} object(s) moved`);
  moveObjects(context.store, message.updates);
}

export function handleObjectsSelected(
  message: Extract<RendererToMainMessage, { type: 'objects-selected' }>,
  context: BoardHandlerContext
): void {
  console.log(`[Board] ${message.ids.length} object(s) selected`);

  context.setDebugCoords(
    message.screenCoords.length > 0 ? message.screenCoords : null
  );

  const result = selectObjects(
    context.store,
    message.ids,
    context.store.getActorId()
  );

  if (result.failed.length > 0) {
    console.warn(
      `[Board] Failed to select ${result.failed.length} object(s)`,
      result.failed
    );
  }

  context.triggerSelectionCallbacks();
}
```

---

### 3. Renderer Orchestrator (Composition + Messages)

**Thin orchestrator that composes managers**:

```typescript
// /src/renderer/RendererOrchestrator.ts

export class RendererOrchestrator {
  private app: Application | null = null;
  private worldContainer: Container | null = null;

  // Managers
  private camera!: CameraManager;
  private gestures!: GestureRecognizer;
  private selection!: SelectionManager;
  private drag!: DragManager;
  private hover!: HoverManager;
  private selectionRect!: SelectionRectangleManager;
  private awareness!: AwarenessManager;
  private visuals!: VisualManager;
  private sceneManager = new SceneManager();

  // Message bus
  private messageBus!: RendererMessageBus;

  constructor(protected postResponse: (msg: RendererToMainMessage) => void) {}

  async handleMessage(message: MainToRendererMessage): Promise<void> {
    if (message.type === 'init') {
      await this.initialize(message);
      return;
    }

    // Delegate to message bus
    await this.messageBus.handleMessage(message);
  }

  private async initialize(message: Extract<MainToRendererMessage, { type: 'init' }>): Promise<void> {
    const { canvas, width, height, dpr, actorId } = message;

    // Initialize PixiJS
    this.app = new Application();
    await this.app.init({
      canvas,
      width,
      height,
      resolution: dpr,
      autoDensity: true,
      backgroundColor: 0xd4d4d4,
      autoStart: false,
    });

    // Create world container
    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);
    this.worldContainer.position.set(width / 2, height / 2);

    // Initialize managers
    this.camera = new CameraManager(width, height, (scale, x, y) => {
      this.applyViewport(scale, x, y);
    });

    this.gestures = new GestureRecognizer();

    this.selection = new SelectionManager(
      this.sceneManager,
      actorId,
      this.postResponse
    );

    this.drag = new DragManager(
      this.sceneManager,
      this.selection,
      this.postResponse
    );

    this.hover = new HoverManager(this.sceneManager, this.app);

    this.selectionRect = new SelectionRectangleManager(
      this.worldContainer,
      this.sceneManager
    );

    this.awareness = new AwarenessManager(this.app);

    this.visuals = new VisualManager(this.worldContainer, this.app);

    // Initialize message bus
    const context: RendererContext = {
      app: this.app,
      worldContainer: this.worldContainer,
      camera: this.camera,
      gestures: this.gestures,
      selection: this.selection,
      drag: this.drag,
      hover: this.hover,
      selectionRect: this.selectionRect,
      awareness: this.awareness,
      visuals: this.visuals,
      sceneManager: this.sceneManager,
      postResponse: this.postResponse,
      actorId,
      devicePixelRatio: dpr,
      interactionMode: 'pan',
    };

    this.messageBus = new RendererMessageBus(context);

    // Initial render
    this.app.renderer.render(this.app.stage);

    this.postResponse({ type: 'initialized' });
  }

  private applyViewport(scale: number, x: number, y: number): void {
    if (!this.worldContainer || !this.app) return;

    this.worldContainer.scale.set(scale);
    this.worldContainer.position.set(
      this.camera.getWidth() / 2 + x,
      this.camera.getHeight() / 2 + y
    );

    this.app.renderer.render(this.app.stage);
  }
}
```

---

### 4. Board Component (React Hooks + Messages)

**Refactored Board using hooks and message bus**:

```typescript
// /src/components/Board.tsx

function Board({ tableId, store, /* ... */ }: BoardProps) {
  // Compose custom hooks
  const { renderer, renderMode, isReady } = useRenderer('auto');
  const { setDebugCoords, setIsCameraActive, /* ... */ } = useBoardState();
  const messageBus = useMemo(() => new BoardMessageBus(), []);

  // Message handling
  useEffect(() => {
    if (!renderer) return;

    const context: BoardHandlerContext = {
      store,
      renderer,
      setDebugCoords,
      setIsCameraActive,
      setIsWaitingForCoords,
      setAwarenessHz,
      throttledCursorUpdate: throttledCursorUpdate.current,
      throttledDragStateUpdate: throttledDragStateUpdate.current,
      triggerSelectionCallbacks: () => {
        /* ... */
      },
    };

    const unsubscribe = renderer.onMessage((message) => {
      messageBus.handleMessage(message, context);
    });

    return unsubscribe;
  }, [renderer, messageBus, store]);

  // Store sync
  useStoreSync(renderer, store, isSynced);

  // Awareness sync
  useAwarenessSync(renderer, store, isSynced);

  // Pointer events
  const pointerHandlers = usePointerEvents(renderer, isMultiSelectMode);

  return (
    <div ref={containerRef}>
      <canvas ref={canvasRef} {...pointerHandlers} />

      {showDebugUI && <DebugPanel /* ... */ />}

      {actionContext && debugCoords && (
        <ActionOverlay
          coords={debugCoords}
          context={actionContext}
          onActionExecuted={onActionExecuted}
        />
      )}
    </div>
  );
}
```

---

## Migration Strategy

### Phase 1: Extract Managers (Week 1-2)

**Goal**: Break RendererCore into 9 focused managers

**Week 1**:
- Day 1-2: CameraManager + GestureRecognizer
- Day 3-4: HoverManager + SelectionManager
- Day 5: DragManager (Part 1)

**Week 2**:
- Day 1: DragManager (Part 2)
- Day 2: SelectionRectangleManager
- Day 3-4: AwarenessManager + VisualManager
- Day 5: Integration testing

**Success Criteria**:
- 9 managers extracted
- 120+ new tests
- RendererCore still works (calls managers)

### Phase 2: Message Buses (Week 3)

**Goal**: Replace switch statements with handler registries

**Steps**:
- Day 1-2: Build MessageHandlerRegistry + middleware
- Day 3: Extract Board handlers, create BoardMessageBus
- Day 4: Extract Renderer handlers, create RendererMessageBus
- Day 5: Integration testing

**Success Criteria**:
- Switch statements removed
- 60+ new handler tests
- All existing tests pass

### Phase 3: Orchestrator (Week 4)

**Goal**: Create RendererOrchestrator that composes managers + message bus

**Steps**:
- Day 1-3: Build RendererOrchestrator
- Day 4: Update adapters (Worker/MainThread)
- Day 5: Delete RendererCore, test

**Success Criteria**:
- RendererCore deleted
- RendererOrchestrator: ~400 lines
- All tests pass

### Phase 4: Board Refactor (Week 5)

**Goal**: Refactor Board using hooks + message bus

**Steps**:
- Day 1-2: Extract custom hooks
- Day 3: Refactor Board component
- Day 4-5: UI component extraction, testing

**Success Criteria**:
- Board: 1,100 → ~300 lines
- All tests pass
- E2E tests pass

---

## Trade-offs Analysis

### Pros ✅

1. **Best of All Worlds** - Composition + Messages + Layering
2. **Pragmatic** - Not over-engineered, not under-designed
3. **Testability** - Managers testable, handlers testable
4. **Clear Communication** - Message buses, no switch statements
5. **Organized** - Layered architecture, clear boundaries
6. **Flexibility** - Can swap implementations
7. **Maintainability** - Small files, focused concerns
8. **Debuggability** - Middleware for logging/metrics
9. **Incremental** - Can adopt gradually
10. **Proven Patterns** - Combines well-known patterns

### Cons ❌

1. **Still Complex** - 100+ files (vs current 2)
   - Mitigation: Clear organization, good documentation

2. **Multiple Patterns** - Team needs to learn 3 approaches
   - Mitigation: Patterns complement each other, not contradictory

3. **Initial Setup** - 5 weeks of refactoring
   - Mitigation: Phased approach, tests pass at each phase

4. **Overhead** - Managers + messages + layers
   - Mitigation: <2% performance overhead, negligible

### When to Choose Hybrid

**Choose Hybrid if**:
- Want clean architecture without over-engineering
- Need testability and maintainability
- Want clear communication patterns
- Prefer pragmatic solutions
- Have 4-6 weeks for refactoring
- Solo or small team (2-5 developers)

**This approach is recommended for most projects.**

---

## Success Metrics

### Code Reduction
- RendererCore: 2,466 → 0 (deleted, replaced by orchestrator)
- RendererOrchestrator: ~400 lines
- Board: 1,100 → ~300 lines
- Average manager: ~200 lines
- Average handler: ~20 lines

### Test Coverage
- Manager tests: 120+
- Handler tests: 60+
- Hook tests: 30+
- Integration tests: 40+
- Total: 68 → 250+

### Performance
- Manager overhead: <0.5ms
- Message bus overhead: <0.1ms
- Overall: 60fps maintained
- Memory: <3% increase

### Maintainability
- Average file size: ~150 lines (was: 1,783)
- Clear layer boundaries
- No switch statements
- Business logic isolated

---

## Critical Files

### Managers (Week 1-2)
1-9. Same as Composition-First approach (9 managers)

### Message Infrastructure (Week 3)
10. `/src/messaging/MessageHandlerRegistry.ts`
11. `/src/messaging/middleware/index.ts`

### Message Handlers (Week 3)
12. `/src/components/Board/BoardMessageBus.ts`
13. `/src/components/Board/handlers/*.ts` (6 files)
14. `/src/renderer/RendererMessageBus.ts`
15. `/src/renderer/handlers/*.ts` (7 files)

### Orchestrator (Week 4)
16. `/src/renderer/RendererOrchestrator.ts`
17. `/src/renderer/WorkerRendererAdapter.ts` (updated)
18. `/src/renderer/MainThreadRendererAdapter.ts` (updated)

### Board Refactor (Week 5)
19. `/src/hooks/*.ts` (8 hooks)
20. `/src/components/Board.tsx` (refactored)
21. `/src/components/Board/*.tsx` (4 UI components)

### Deletions
22. `/src/renderer/RendererCore.ts` - **DELETE**

---

## Why This Is Recommended

### Balances All Concerns

**Composition** gives us:
- Small, focused managers
- Easy testing
- Reusability

**Message-Driven** gives us:
- Clean communication
- No switch statements
- Middleware for cross-cutting concerns

**DDD** gives us:
- Layered organization
- Clear boundaries
- Separation of concerns

### Pragmatic Trade-offs

- **Not too pure** (like full DDD with entities and value objects)
- **Not too scattered** (like pure Composition without structure)
- **Not too abstract** (like full event sourcing)

### Right for This Project

- Solo developer (you) with potential for growth
- 3,566 lines of monolithic code
- Complex interactions (camera, selection, dragging, awareness)
- Real-time multiplayer requirements
- Performance requirements (60fps)
- Long-term maintenance horizon

---

## Conclusion

The Hybrid Synthesis approach provides clean architecture without over-engineering. It combines proven patterns in a pragmatic way that balances complexity, maintainability, and implementation effort.

**Timeline**: 5 weeks
**Risk**: Low-Medium (phased, testable, proven patterns)
**Outcome**: Clean, maintainable, testable architecture

**This is the recommended approach for Cardtable 2.0.**

It gives you the benefits of all three approaches while avoiding their individual weaknesses. The result is a codebase that's easy to understand, test, maintain, and extend—exactly what you need for long-term success.
