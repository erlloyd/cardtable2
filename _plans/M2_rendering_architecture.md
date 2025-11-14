# M2 - Rendering Architecture: Dual-Mode Strategy

## Overview

Cardtable 2 supports two rendering modes to maximize compatibility, performance, and debuggability across all platforms and use cases. This is a **first-class architectural choice**, not a fallback pattern.

## Rendering Modes

### Worker-Based Rendering (OffscreenCanvas)
**When to use:**
- Desktop browsers (Chrome, Firefox, Safari, Edge)
- Android devices
- iOS 17+ (stable OffscreenCanvas WebGL support)
- Production deployments
- Performance-critical scenarios with complex scenes

**Benefits:**
- True 60fps rendering isolated from main thread
- Main thread stays responsive during heavy rendering
- Better performance on complex scenes (300+ objects)
- Smooth animations even during UI interactions

**Trade-offs:**
- More complex debugging (worker context)
- Requires OffscreenCanvas support
- Message passing overhead for events

### Main-Thread Rendering (Regular Canvas)
**When to use:**
- iOS 16.x and earlier (unreliable OffscreenCanvas WebGL)
- Development/debugging (easier to inspect and profile)
- Browser compatibility issues
- User preference (settings toggle)
- Lower-end devices where worker overhead > benefits

**Benefits:**
- Maximum compatibility (works everywhere canvas works)
- Easier debugging (same context as app)
- Direct event handling (no message passing)
- Simpler error handling and stack traces

**Trade-offs:**
- Rendering blocks main thread
- Potential UI jank during complex rendering
- Lower theoretical maximum performance

## Reasons for Mode Selection

### Automatic Detection
1. **Browser Capability**: Check for OffscreenCanvas support and WebGL stability
2. **Platform Detection**: iOS version, Android vs desktop
3. **Performance Profile**: Device capabilities, scene complexity

### User Preference (Settings)
User should be able to override automatic selection:
- "Auto" (default): Use automatic detection
- "Worker Mode": Force worker rendering (if supported)
- "Main Thread Mode": Force main thread rendering
- "Best Performance": Always choose fastest for device
- "Best Compatibility": Always choose most stable

### Developer Tools
During development:
- Debug mode toggle in UI
- URL parameter override (`?render=worker` or `?render=main`)
- Console command to switch modes at runtime

### Use Cases Beyond Compatibility
1. **Debugging**: Main thread easier to inspect with DevTools
2. **Performance Testing**: Compare modes on same device
3. **Battery Saving**: Main thread may use less power on some devices
4. **Accessibility**: Some assistive tech works better with main thread
5. **Development**: Faster iteration without worker compilation

## Architecture

### Core Principle: Unified Message-Based Interface

**Key insight:** The rendering engine should be identical regardless of where it runs. The ONLY difference between modes is the message transport layer:
- **Worker mode**: Messages via `postMessage` to worker
- **Main thread mode**: Messages via direct function call to renderer

Same message types, same handlers, minimal code duplication.

### Message Flow

```
Board Component
      │
      ├─ MainToRendererMessage (unified format)
      │
      ▼
┌─────────────────┐
│ Message Adapter │  ◄─── ONLY difference between modes
└─────────────────┘
      │
      ├─ Worker Mode: postMessage(msg)
      ├─ Main Thread: handleMessage(msg)
      │
      ▼
┌─────────────────┐
│ Renderer Core   │  ◄─── IDENTICAL for both modes
│ - Scene         │
│ - Hit-test      │
│ - Input         │
│ - PixiJS        │
└─────────────────┘
      │
      ├─ RendererToMainMessage (unified format)
      │
      ▼
Board Component (response handlers)
```

### Shared Renderer Core (100% Identical Code)

The core renderer runs identically in both modes:

```typescript
// Shared between worker and main thread
class RendererCore {
  private app: Application;
  private scene: SceneManager;
  private hitTester: HitTester;
  private inputHandler: InputHandler;

  // Message handler - IDENTICAL in both modes
  async handleMessage(message: MainToRendererMessage): Promise<void> {
    switch (message.type) {
      case 'init':
        await this.initialize(message.canvas, message.options);
        this.postResponse({ type: 'initialized' });
        break;

      case 'add-object':
        this.scene.addObject(message.object);
        this.postResponse({ type: 'object-added', id: message.object._id });
        break;

      case 'pointer-event':
        this.inputHandler.handlePointer(message.event);
        break;

      // ... all other message types
    }
  }

  // Abstract response method - implemented differently per mode
  protected abstract postResponse(msg: RendererToMainMessage): void;
}
```

### Mode Implementations (Minimal Differences)

**Worker Mode (board.worker.ts):**
```typescript
import { RendererCore } from './renderer/RendererCore';

class WorkerRendererCore extends RendererCore {
  // ONLY difference: how responses are sent
  protected postResponse(msg: RendererToMainMessage): void {
    self.postMessage(msg);
  }
}

const renderer = new WorkerRendererCore();

// Listen for messages from main thread
self.addEventListener('message', (e: MessageEvent<MainToRendererMessage>) => {
  renderer.handleMessage(e.data);
});
```

**Main Thread Mode (MainThreadRenderer.ts):**
```typescript
import { RendererCore } from './renderer/RendererCore';

class MainThreadRendererCore extends RendererCore {
  private messageCallback: (msg: RendererToMainMessage) => void;

  setMessageCallback(cb: (msg: RendererToMainMessage) => void) {
    this.messageCallback = cb;
  }

  // ONLY difference: how responses are sent
  protected postResponse(msg: RendererToMainMessage): void {
    this.messageCallback?.(msg);
  }
}

export class MainThreadRenderer {
  private core: MainThreadRendererCore;

  constructor(onMessage: (msg: RendererToMainMessage) => void) {
    this.core = new MainThreadRendererCore();
    this.core.setMessageCallback(onMessage);
  }

  // Send message by direct function call
  sendMessage(msg: MainToRendererMessage): void {
    this.core.handleMessage(msg);
  }
}
```

### Message Adapter (Board Component Interface)

Board component uses the same code for both modes:

```typescript
// Unified renderer interface
interface IRendererAdapter {
  sendMessage(msg: MainToRendererMessage): void;
  onMessage(handler: (msg: RendererToMainMessage) => void): void;
  destroy(): void;
}

// Worker adapter
class WorkerRendererAdapter implements IRendererAdapter {
  private worker: Worker;

  constructor(worker: Worker) {
    this.worker = worker;
  }

  sendMessage(msg: MainToRendererMessage): void {
    this.worker.postMessage(msg);
  }

  onMessage(handler: (msg: RendererToMainMessage) => void): void {
    this.worker.addEventListener('message', (e) => handler(e.data));
  }

  destroy(): void {
    this.worker.terminate();
  }
}

// Main thread adapter
class MainThreadRendererAdapter implements IRendererAdapter {
  private renderer: MainThreadRenderer;

  constructor(renderer: MainThreadRenderer) {
    this.renderer = renderer;
  }

  sendMessage(msg: MainToRendererMessage): void {
    this.renderer.sendMessage(msg);
  }

  onMessage(handler: (msg: RendererToMainMessage) => void): void {
    // Handler already set in constructor
  }

  destroy(): void {
    this.renderer.destroy();
  }
}
```

### Board Component Integration

Board component is completely agnostic to render mode:

```typescript
function Board({ tableId }: BoardProps) {
  const [renderer, setRenderer] = useState<IRendererAdapter | null>(null);
  const renderMode = useRenderMode();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Factory creates appropriate adapter
    const adapter = createRendererAdapter(renderMode, onMessage);
    setRenderer(adapter);

    // Initialize - same message format regardless of mode
    adapter.sendMessage({
      type: 'init',
      canvas: renderMode === 'worker'
        ? canvas.transferControlToOffscreen()
        : canvas,
      width: canvas.width,
      height: canvas.height,
    });

    return () => adapter.destroy();
  }, [renderMode]);

  const handlePointerMove = (e: PointerEvent) => {
    // Same code for both modes
    renderer?.sendMessage({
      type: 'pointer-event',
      event: { x: e.clientX, y: e.clientY, type: e.type }
    });
  };

  // ... rest of component identical for both modes
}
```

### File Structure

```
app/src/renderer/
├── messages.ts                # Message type definitions (shared)
├── RendererCore.ts           # Core rendering logic (shared, runs in both modes)
├── SceneManager.ts           # Scene management (shared)
├── HitTester.ts              # Hit-testing (shared)
├── InputHandler.ts           # Input handling (shared)
├── adapters/
│   ├── IRendererAdapter.ts   # Adapter interface
│   ├── WorkerAdapter.ts      # Worker message adapter
│   └── MainThreadAdapter.ts  # Main thread adapter
├── MainThreadRenderer.ts     # Main thread wrapper (thin)
├── board.worker.ts           # Worker wrapper (thin)
└── factory.ts                # Creates appropriate adapter
```

### Code Sharing Breakdown

**100% Shared (runs identically in both modes):**
- RendererCore.ts (all rendering logic)
- SceneManager.ts
- HitTester.ts
- InputHandler.ts
- messages.ts (type definitions)

**Mode-Specific (minimal, <50 lines each):**
- WorkerAdapter.ts: postMessage wrapper
- MainThreadAdapter.ts: direct call wrapper
- board.worker.ts: Worker entry point
- MainThreadRenderer.ts: Main thread entry point

**Total difference: ~200 lines of adapter code vs thousands of lines of shared logic**

## Error Handling & Bidirectional Communication

### Core Principle: All Communication is Messages

**Key insight:** Errors, responses, events - everything flows through the same message protocol. No special error handling paths.

### Message Protocol Includes Errors

```typescript
// All messages from renderer to main thread
type RendererToMainMessage =
  | { type: 'ready' }
  | { type: 'initialized' }
  | { type: 'object-added'; id: string }
  | { type: 'render-complete'; frameTime: number }
  | { type: 'error'; error: string; context?: string }  // Errors are messages
  | { type: 'warning'; message: string }
  // ... other response types
```

### RendererCore Error Handling (Identical for Both Modes)

```typescript
class RendererCore {
  // All message handling wrapped in try/catch
  async handleMessage(message: MainToRendererMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'init':
          await this.initialize(message.canvas, message.options);
          this.postResponse({ type: 'initialized' });
          break;

        case 'add-object':
          this.scene.addObject(message.object);
          this.postResponse({ type: 'object-added', id: message.object._id });
          break;

        // ... other cases
      }
    } catch (error) {
      // Convert any error to error message
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.postResponse({
        type: 'error',
        error: errorMsg,
        context: `Handling message: ${message.type}`,
      });
    }
  }

  // Internal errors also become messages
  private handleInternalError(error: Error, context: string): void {
    this.postResponse({
      type: 'error',
      error: error.message,
      context,
    });
  }

  // Warnings, logs, etc. also use messages
  private warn(message: string): void {
    this.postResponse({ type: 'warning', message });
  }
}
```

### Adapter Layer: Unified Error Handling

**Worker Adapter:**
```typescript
class WorkerRendererAdapter implements IRendererAdapter {
  private worker: Worker;
  private messageHandler?: (msg: RendererToMainMessage) => void;

  constructor(worker: Worker) {
    this.worker = worker;

    // Worker messages -> unified handler
    this.worker.addEventListener('message', (e) => {
      this.messageHandler?.(e.data);
    });

    // Worker errors -> converted to error messages
    this.worker.addEventListener('error', (e) => {
      this.messageHandler?.({
        type: 'error',
        error: e.message,
        context: 'Worker error',
      });
    });

    // Unhandled rejections in worker
    this.worker.addEventListener('unhandledrejection', (e) => {
      this.messageHandler?.({
        type: 'error',
        error: String(e.reason),
        context: 'Worker unhandled rejection',
      });
    });
  }

  sendMessage(msg: MainToRendererMessage): void {
    try {
      this.worker.postMessage(msg);
    } catch (error) {
      // postMessage errors -> error messages
      this.messageHandler?.({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
        context: 'postMessage failed',
      });
    }
  }

  onMessage(handler: (msg: RendererToMainMessage) => void): void {
    this.messageHandler = handler;
  }

  destroy(): void {
    this.worker.terminate();
  }
}
```

**Main Thread Adapter:**
```typescript
class MainThreadRendererAdapter implements IRendererAdapter {
  private renderer: MainThreadRenderer;
  private messageHandler?: (msg: RendererToMainMessage) => void;

  constructor(onMessage: (msg: RendererToMainMessage) => void) {
    this.messageHandler = onMessage;
    this.renderer = new MainThreadRenderer((msg) => {
      // Renderer messages -> unified handler
      this.messageHandler?.(msg);
    });
  }

  sendMessage(msg: MainToRendererMessage): void {
    try {
      // Direct call to renderer
      this.renderer.sendMessage(msg);
    } catch (error) {
      // Synchronous errors -> error messages (same as worker)
      this.messageHandler?.({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
        context: 'Renderer call failed',
      });
    }
  }

  onMessage(handler: (msg: RendererToMainMessage) => void): void {
    this.messageHandler = handler;
  }

  destroy(): void {
    this.renderer.destroy();
  }
}
```

### Board Component: Mode-Agnostic Error Handling

```typescript
function Board({ tableId }: BoardProps) {
  const [renderer, setRenderer] = useState<IRendererAdapter | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handle ALL messages (responses, errors, events) the same way
  const handleRendererMessage = useCallback((msg: RendererToMainMessage) => {
    switch (msg.type) {
      case 'initialized':
        console.log('Renderer initialized');
        break;

      case 'error':
        // Handle errors from BOTH modes identically
        console.error(`Renderer error [${msg.context}]:`, msg.error);
        setError(msg.error);
        break;

      case 'warning':
        console.warn('Renderer warning:', msg.message);
        break;

      case 'object-added':
        console.log('Object added:', msg.id);
        break;

      // ... other message types
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create adapter - error handling is identical after this
    const adapter = createRendererAdapter(renderMode, handleRendererMessage);
    setRenderer(adapter);

    // Send init message
    adapter.sendMessage({
      type: 'init',
      canvas: renderMode === 'worker'
        ? canvas.transferControlToOffscreen()
        : canvas,
      width: canvas.width,
      height: canvas.height,
    });

    return () => adapter.destroy();
  }, [renderMode, handleRendererMessage]);

  // Error display - works for both modes
  if (error) {
    return <div className="error">Renderer error: {error}</div>;
  }

  // ... rest of component
}
```

### Error Handling Comparison

| Error Type | Worker Mode | Main Thread Mode | Board Component |
|------------|-------------|------------------|-----------------|
| Message handling error | `try/catch` → error message | `try/catch` → error message | Receives error message |
| Async operation error | `try/catch` → error message | `try/catch` → error message | Receives error message |
| Worker crash | `worker.onerror` → error message | N/A | Receives error message |
| Unhandled rejection | `unhandledrejection` → error message | `try/catch` → error message | Receives error message |
| postMessage failure | `try/catch` in adapter → error message | `try/catch` in adapter → error message | Receives error message |
| PixiJS error | `try/catch` in RendererCore → error message | `try/catch` in RendererCore → error message | Receives error message |

**Result:** Board component handles ALL errors identically through message protocol.

### Benefits of Unified Error Handling

1. **No special cases**: Board component has one error handler for both modes
2. **Testable**: Can test error handling with same test suite
3. **Debuggable**: All errors flow through same path
4. **Recoverable**: Can implement error recovery once for both modes
5. **Logging**: Single logging path captures all errors

### Example: Recoverable Errors

```typescript
// RendererCore can send non-fatal errors
class RendererCore {
  private addObject(obj: TableObject): void {
    try {
      this.scene.addObject(obj);
      this.postResponse({ type: 'object-added', id: obj._id });
    } catch (error) {
      // Non-fatal error: log but don't crash
      this.postResponse({
        type: 'warning',
        message: `Failed to add object ${obj._id}: ${error}`,
      });
      // Could still send success with flag
      this.postResponse({
        type: 'object-added',
        id: obj._id,
        hadWarnings: true,
      });
    }
  }
}

// Board component handles same way for both modes
const handleRendererMessage = (msg: RendererToMainMessage) => {
  if (msg.type === 'warning') {
    // Show toast notification
    showToast(msg.message, 'warning');
  }
};
```

### Async/Promise Error Handling

```typescript
// RendererCore handles async errors uniformly
class RendererCore {
  async handleMessage(message: MainToRendererMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'load-texture':
          // Async operation
          const texture = await this.loadTexture(message.url);
          this.postResponse({ type: 'texture-loaded', id: message.id });
          break;
      }
    } catch (error) {
      // Async errors also become messages
      this.postResponse({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
        context: `Async operation: ${message.type}`,
      });
    }
  }
}

// Both adapters handle async identically
// Worker: async errors caught in worker, sent as messages
// Main thread: async errors caught in renderer, sent as messages
// Board: receives error message in both cases
```

### Summary

**Zero Difference in Error Handling:**
1. All errors/warnings/responses are messages
2. RendererCore wraps all operations in try/catch
3. Adapters convert transport-level errors to messages
4. Board component handles all via single message handler
5. No mode-specific error handling code in Board component

**The only difference:**
- Worker: errors cross thread boundary via postMessage
- Main thread: errors cross function boundary via callback

**Both arrive at Board component as the same RendererToMainMessage.**

## Implementation Plan

### Phase 1: Refactor Existing Worker Code
- Extract shared logic from board.worker.ts into renderer-core
- Create IRenderer interface
- Implement WorkerRenderer wrapping existing worker

### Phase 2: Implement Main Thread Renderer
- Create MainThreadRenderer implementing IRenderer
- Share SceneManager, HitTester, RenderCore
- Direct event handling (no message passing)

### Phase 3: Detection & Factory
- Implement capability detection
- Create RendererFactory
- Add mode selection logic

### Phase 4: Settings & User Control
- Add render mode to user settings
- Implement settings UI toggle
- Add debug tools (URL params, console commands)

### Phase 5: Testing & Validation
- Unit tests for both renderers
- E2E tests verifying feature parity
- Performance benchmarks comparing modes
- Cross-platform validation (iOS, Android, Desktop)

## Decision Matrix

| Scenario | Auto Mode Choice | Rationale |
|----------|------------------|-----------|
| iOS 16.x | Main Thread | OffscreenCanvas WebGL unstable |
| iOS 17+ | Worker | Full OffscreenCanvas support |
| Android | Worker | Good OffscreenCanvas support |
| Desktop Chrome/Firefox | Worker | Best performance |
| Desktop Safari 16.4+ | Worker | Stable OffscreenCanvas |
| Development mode | Main Thread (default) | Easier debugging |
| Scene < 50 objects | Main Thread | Worker overhead not worth it |
| Scene > 200 objects | Worker | Need rendering off main thread |

## Testing Strategy

### Functional Parity
Both modes must pass identical test suites:
- Scene rendering (objects, positions, z-order)
- Hit-testing accuracy
- Input handling (drag, pan, zoom)
- Camera controls
- Performance targets (60fps, <2ms hit-test)

### Mode-Specific Tests
- Worker mode: Message passing, cleanup, isolation
- Main thread: Direct event handling, synchronous updates

### Switching Tests
- Runtime mode switching without data loss
- Settings persistence
- URL parameter overrides

## Success Criteria

1. **Feature Parity**: Both modes support all M2 features identically
2. **Performance**: Worker mode achieves 60fps on desktop with 300 objects
3. **Compatibility**: Main thread mode works on iOS 16.x without crashes
4. **Transparency**: App code uses IRenderer interface, agnostic to mode
5. **User Control**: Settings allow manual override with clear descriptions
6. **Developer Experience**: Easy to toggle modes during development

## Future Considerations

### M3+ Enhancements
- WebGPU renderer mode (when widely supported)
- Server-side rendering mode (for spectator views)
- Hybrid mode (some objects in worker, UI overlays in main)

### Performance Optimizations
- Automatic mode switching based on scene complexity
- Adaptive rendering (lower quality in worker if main thread blocked)
- Background tab throttling coordination

## Notes

- This architecture enables experimentation with new rendering tech
- User choice empowers accessibility and preference
- Shared core ensures consistency and reduces maintenance
- Platform detection is a convenience, not a restriction
