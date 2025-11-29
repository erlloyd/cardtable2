# Phase 4: Board Refactor (DDD + Hooks + Message Bus) - Detailed Plan

## Overview

**Goal**: Refactor the Board component from 1,100 lines to ~300 lines using DDD principles, custom hooks, and the message bus pattern.

**Status**: Phase 3 complete (Message infrastructure + RendererMessageBus created)

**Prerequisites**:
- ✅ MessageHandlerRegistry infrastructure (Phase 3)
- ✅ RendererMessageBus created (Phase 3)
- ✅ app/src/hooks/ directory exists
- ⏸️ app/src/components/Board/ subdirectory (will create)
- ⏸️ BoardMessageBus (will create)

**Timeline**: 5-6 days

---

## Current State Analysis

### Board.tsx (1,100 lines)

**Breakdown**:
- **Lines 1-51**: Imports + Props interface (51 lines)
- **Lines 52-117**: State declarations + refs (66 lines)
- **Lines 118-401**: Renderer initialization + 228-line switch statement (284 lines)
- **Lines 403-501**: Store sync + awareness sync useEffect hooks (99 lines)
- **Lines 503-656**: Canvas lifecycle (wheel, init, resize) (154 lines)
- **Lines 658-689**: Debug handlers (ping, echo, animation) (32 lines)
- **Lines 691-745**: Test API (waitForRenderer, waitForSelectionSettled) (55 lines)
- **Lines 747-918**: Pointer event handlers + context menu (172 lines)
- **Lines 920-1100**: JSX render (181 lines)

**Key Problems**:
1. **Giant switch statement** (lines 162-390) - 228 lines handling all renderer messages
2. **Scattered state management** - 15+ useState calls, 8+ useRef calls
3. **Multiple concerns mixed** - lifecycle, sync, events, test API, UI all in one file
4. **No clear boundaries** - hard to test, hard to understand
5. **Debug UI embedded** - 125+ lines of debug JSX (lines 956-1081)

---

## Architecture Design

### Three-Layer Organization

```
app/src/
├── components/
│   └── Board/
│       ├── Board.tsx (~300 lines) - Composition root
│       ├── BoardMessageBus.ts - Message handler registry
│       ├── handlers/
│       │   ├── lifecycle.ts - ready, initialized
│       │   ├── objectState.ts - moved, selected, unselected
│       │   ├── camera.ts - pan/zoom started/ended
│       │   ├── awareness.ts - cursor-position, drag-state
│       │   ├── testing.ts - flushed, echo, pong
│       │   └── index.ts - Re-export all handlers
│       └── components/
│           ├── DebugPanel.tsx - Debug UI (replaces lines 956-1081)
│           ├── InteractionModeToggle.tsx - Pan/Select toggle
│           └── MultiSelectToggle.tsx - Multi-select toggle
├── hooks/
│   ├── useRenderer.ts - Renderer lifecycle (init, cleanup)
│   ├── useBoardState.ts - State management (coords, camera, etc.)
│   ├── useStoreSync.ts - Store change subscription
│   ├── useAwarenessSync.ts - Awareness subscription
│   ├── usePointerEvents.ts - Pointer handlers
│   ├── useCanvasLifecycle.ts - Canvas init, resize, wheel
│   ├── useTestAPI.ts - waitForRenderer, waitForSelectionSettled
│   └── useDebugHandlers.ts - ping, echo, animation
```

---

## Step-by-Step Implementation Plan

### Day 1: Extract Core Hooks (Foundation)

#### Step 1.1: Create `useRenderer` Hook

**Purpose**: Manage renderer lifecycle (creation, mode detection, cleanup)

**File**: `app/src/hooks/useRenderer.ts`

**Responsibilities**:
- Create renderer adapter (worker vs main-thread)
- Detect render mode (auto, forced)
- Handle cleanup on unmount
- Expose renderer instance and ready state

**Interface**:
```typescript
export interface UseRendererResult {
  renderer: IRendererAdapter | null;
  renderMode: RenderMode | null;
  isReady: boolean;
  isCanvasInitialized: boolean;
}

export function useRenderer(
  mode: RenderMode | 'auto'
): UseRendererResult;
```

**Extracted from**: Board.tsx lines 52, 89-92, 119-158

**Tests**: `useRenderer.test.ts` (8 tests)
- Creates renderer with auto mode
- Creates renderer with forced worker mode
- Creates renderer with forced main-thread mode
- Returns correct render mode
- Cleans up renderer on unmount
- Handles double initialization (strict mode)
- Updates ready state when renderer ready
- Updates canvas initialized state

---

#### Step 1.2: Create `useBoardState` Hook

**Purpose**: Centralize all Board component state management

**File**: `app/src/hooks/useBoardState.ts`

**Responsibilities**:
- Manage all useState declarations
- Manage debug coords, camera active, waiting for coords
- Manage interaction mode, multi-select mode
- Provide setters for all state

**Interface**:
```typescript
export interface UseBoardStateResult {
  // Debug state
  messages: string[];
  addMessage: (msg: string) => void;
  debugCoords: Array<{ id: string; x: number; y: number; width: number; height: number }> | null;
  setDebugCoords: (coords: Array<...> | null) => void;

  // Camera state
  isCameraActive: boolean;
  setIsCameraActive: (active: boolean) => void;
  isWaitingForCoords: boolean;
  setIsWaitingForCoords: (waiting: boolean) => void;

  // Interaction modes
  interactionMode: 'pan' | 'select';
  setInteractionMode: (mode: 'pan' | 'select') => void;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (enabled: boolean) => void;

  // Awareness
  awarenessHz: number;
  setAwarenessHz: (hz: number) => void;

  // Sync state
  isSynced: boolean;
  setIsSynced: (synced: boolean) => void;
}

export function useBoardState(
  externalInteractionMode?: 'pan' | 'select',
  onInteractionModeChange?: (mode: 'pan' | 'select') => void,
  externalIsMultiSelectMode?: boolean,
  onMultiSelectModeChange?: (enabled: boolean) => void
): UseBoardStateResult;
```

**Extracted from**: Board.tsx lines 88-117

**Tests**: `useBoardState.test.ts` (12 tests)
- Initializes with default state
- Manages messages array
- Manages debug coords
- Manages camera active state
- Manages waiting for coords state
- Uses external interaction mode when provided
- Uses internal interaction mode when external not provided
- Calls external callback when interaction mode changes
- Uses external multi-select mode when provided
- Uses internal multi-select mode when external not provided
- Calls external callback when multi-select mode changes
- Manages awareness Hz

---

#### Step 1.3: Create `useStoreSync` Hook

**Purpose**: Subscribe to store changes and forward to renderer

**File**: `app/src/hooks/useStoreSync.ts`

**Responsibilities**:
- Subscribe to store.onObjectsChange()
- Forward added/updated/removed objects to renderer
- Handle unsubscribe on cleanup
- Only activate when synced

**Interface**:
```typescript
export function useStoreSync(
  renderer: IRendererAdapter | null,
  store: YjsStore,
  isSynced: boolean
): void;
```

**Extracted from**: Board.tsx lines 403-459

**Tests**: `useStoreSync.test.ts` (7 tests)
- Does nothing when renderer is null
- Does nothing when not synced
- Subscribes to store changes when synced
- Forwards added objects to renderer
- Forwards updated objects to renderer
- Forwards removed objects to renderer
- Unsubscribes on cleanup

---

#### Step 1.4: Create `useAwarenessSync` Hook

**Purpose**: Subscribe to awareness changes and forward to renderer

**File**: `app/src/hooks/useAwarenessSync.ts`

**Responsibilities**:
- Subscribe to store.onAwarenessChange()
- Filter out local client (only forward remote awareness)
- Forward awareness updates to renderer
- Handle unsubscribe on cleanup

**Interface**:
```typescript
export function useAwarenessSync(
  renderer: IRendererAdapter | null,
  store: YjsStore,
  isSynced: boolean
): void;
```

**Extracted from**: Board.tsx lines 461-501

**Tests**: `useAwarenessSync.test.ts` (6 tests)
- Does nothing when renderer is null
- Does nothing when not synced
- Subscribes to awareness changes when synced
- Filters out local client awareness
- Forwards remote awareness to renderer
- Unsubscribes on cleanup

---

### Day 2: Extract Remaining Hooks

#### Step 2.1: Create `usePointerEvents` Hook

**Purpose**: Handle all pointer event serialization and forwarding

**File**: `app/src/hooks/usePointerEvents.ts`

**Responsibilities**:
- Serialize pointer events (React.PointerEvent → PointerEventData)
- Apply multi-select mode to touch events
- Convert to canvas-relative coordinates (account for DPR)
- Return pointer event handlers (down, move, up, cancel, leave)

**Interface**:
```typescript
export interface PointerEventHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  onPointerCancel: (event: React.PointerEvent) => void;
  onPointerLeave: () => void;
}

export function usePointerEvents(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  renderer: IRendererAdapter | null,
  store: YjsStore,
  isCanvasInitialized: boolean,
  isMultiSelectMode: boolean,
  throttledCursorUpdate: React.MutableRefObject<ThrottledFunction<(x: number, y: number) => void>>
): PointerEventHandlers;
```

**Extracted from**: Board.tsx lines 747-856

**Tests**: `usePointerEvents.test.ts` (10 tests)
- Returns no-op handlers when renderer is null
- Returns no-op handlers when canvas not initialized
- Serializes pointer events correctly
- Applies multi-select mode to touch events
- Converts to canvas-relative coordinates
- Handles pointer down event
- Handles pointer move event
- Handles pointer up event
- Handles pointer cancel event
- Handles pointer leave event (clears cursor from awareness)

---

#### Step 2.2: Create `useCanvasLifecycle` Hook

**Purpose**: Manage canvas initialization, resize, and wheel events

**File**: `app/src/hooks/useCanvasLifecycle.ts`

**Responsibilities**:
- Initialize canvas (transfer to OffscreenCanvas if worker mode)
- Send init message to renderer with actor ID
- Handle canvas resize (ResizeObserver)
- Handle wheel events (prevent default, forward to renderer)

**Interface**:
```typescript
export function useCanvasLifecycle(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  containerRef: React.RefObject<HTMLDivElement>,
  renderer: IRendererAdapter | null,
  renderMode: RenderMode | null,
  store: YjsStore,
  isReady: boolean,
  isCanvasInitialized: boolean,
  onCanvasInitialized: () => void
): void;
```

**Extracted from**: Board.tsx lines 503-656

**Tests**: `useCanvasLifecycle.test.ts` (9 tests)
- Does nothing when renderer not ready
- Does nothing when render mode is null
- Initializes canvas in worker mode (transfers to OffscreenCanvas)
- Initializes canvas in main-thread mode (uses canvas directly)
- Sends init message with correct parameters
- Handles canvas resize
- Handles wheel events
- Prevents wheel event default (no page scroll)
- Prevents double initialization (strict mode)

---

#### Step 2.3: Create `useTestAPI` Hook

**Purpose**: Expose test API for E2E tests

**File**: `app/src/hooks/useTestAPI.ts`

**Responsibilities**:
- Provide waitForRenderer() function (waits for 'flushed' message)
- Provide waitForSelectionSettled() function (waits for 'objects-selected' message)
- Expose test API on window.__TEST_BOARD__ in dev mode
- Clean up on unmount

**Interface**:
```typescript
export interface TestAPI {
  waitForRenderer: () => Promise<void>;
  waitForSelectionSettled: () => Promise<void>;
}

export function useTestAPI(
  renderer: IRendererAdapter | null,
  isCanvasInitialized: boolean,
  showDebugUI: boolean
): TestAPI;
```

**Extracted from**: Board.tsx lines 691-745

**Tests**: `useTestAPI.test.ts` (7 tests)
- Returns waitForRenderer function
- Returns waitForSelectionSettled function
- waitForRenderer sends flush message
- waitForRenderer resolves when flushed received
- waitForSelectionSettled resolves when selection settled
- Exposes test API on window in dev mode with debug UI
- Cleans up window.__TEST_BOARD__ on unmount

---

#### Step 2.4: Create `useDebugHandlers` Hook

**Purpose**: Provide debug handlers (ping, echo, animation)

**File**: `app/src/hooks/useDebugHandlers.ts`

**Responsibilities**:
- Provide handlePing function
- Provide handleEcho function
- Provide handleAnimation function

**Interface**:
```typescript
export interface DebugHandlers {
  handlePing: () => void;
  handleEcho: () => void;
  handleAnimation: () => void;
}

export function useDebugHandlers(
  renderer: IRendererAdapter | null,
  tableId: string,
  addMessage: (msg: string) => void
): DebugHandlers;
```

**Extracted from**: Board.tsx lines 658-689

**Tests**: `useDebugHandlers.test.ts` (5 tests)
- Returns debug handlers
- handlePing sends ping message
- handleEcho sends echo message
- handleAnimation sends test-animation message
- Handlers do nothing when renderer is null

---

### Day 3: Create BoardMessageBus + Handlers

#### Step 3.1: Extract Message Handlers

**Purpose**: Extract all message handling logic from switch statement

**Files to create**:

##### `app/src/components/Board/handlers/lifecycle.ts`

**Handlers**:
- `handleReady`: Set isReady state, add message
- `handleInitialized`: Set isCanvasInitialized, send initial sync, set isSynced

**Extracted from**: Board.tsx lines 163-189

**Tests**: 4 tests

---

##### `app/src/components/Board/handlers/objectState.ts`

**Handlers**:
- `handleObjectsMoved`: Update store with new positions
- `handleObjectsSelected`: Store screen coords, select objects in store, trigger callbacks
- `handleObjectsUnselected`: Clear coords, unselect objects in store, trigger callbacks

**Extracted from**: Board.tsx lines 208-271

**Tests**: 6 tests

---

##### `app/src/components/Board/handlers/camera.ts`

**Handlers**:
- `handlePanStarted`: Set isCameraActive(true)
- `handlePanEnded`: Set isCameraActive(false), request fresh coords
- `handleZoomStarted`: Set isCameraActive(true)
- `handleZoomEnded`: Set isCameraActive(false), request fresh coords
- `handleObjectDragStarted`: Set isCameraActive(true)
- `handleObjectDragEnded`: Set isCameraActive(false), request fresh coords
- `handleScreenCoords`: Update coords, set isWaitingForCoords(false)

**Extracted from**: Board.tsx lines 306-379

**Tests**: 14 tests

---

##### `app/src/components/Board/handlers/awareness.ts`

**Handlers**:
- `handleCursorPosition`: Throttled update to awareness
- `handleDragStateUpdate`: Throttled update to awareness
- `handleDragStateClear`: Cancel throttled updates, clear drag state
- `handleAwarenessUpdateRate`: Update awareness Hz display

**Extracted from**: Board.tsx lines 273-304

**Tests**: 8 tests

---

##### `app/src/components/Board/handlers/testing.ts`

**Handlers**:
- `handleFlushed`: Resolve pending flush callbacks
- `handlePong`: Add pong message
- `handleEchoResponse`: Add echo message
- `handleError`: Add error message
- `handleAnimationComplete`: Add animation complete message

**Extracted from**: Board.tsx lines 192-206

**Tests**: 10 tests

---

##### `app/src/components/Board/handlers/index.ts`

**Purpose**: Re-export all handlers

```typescript
export * from './lifecycle';
export * from './objectState';
export * from './camera';
export * from './awareness';
export * from './testing';
```

---

#### Step 3.2: Create BoardHandlerContext Interface

**File**: `app/src/components/Board/BoardMessageBus.ts` (part 1)

**Purpose**: Define context passed to all handlers

```typescript
import type { IRendererAdapter } from '../../renderer/IRendererAdapter';
import type { YjsStore } from '../../store/YjsStore';
import type { ThrottledFunction } from '../../utils/throttle';

export interface BoardHandlerContext {
  // Core dependencies
  renderer: IRendererAdapter;
  store: YjsStore;

  // State setters
  setIsReady: (ready: boolean) => void;
  setIsCanvasInitialized: (initialized: boolean) => void;
  setIsSynced: (synced: boolean) => void;
  setDebugCoords: (coords: Array<{ id: string; x: number; y: number; width: number; height: number }> | null) => void;
  setIsCameraActive: (active: boolean) => void;
  setIsWaitingForCoords: (waiting: boolean) => void;
  setAwarenessHz: (hz: number) => void;
  addMessage: (msg: string) => void;

  // Refs
  flushCallbacks: React.MutableRefObject<Array<() => void>>;
  selectionSettledCallbacks: React.MutableRefObject<Array<() => void>>;
  throttledCursorUpdate: React.MutableRefObject<ThrottledFunction<(x: number, y: number) => void>>;
  throttledDragStateUpdate: React.MutableRefObject<ThrottledFunction<(gid: string, primaryId: string, pos: { x: number; y: number; r: number }, secondaryOffsets?: Record<string, { dx: number; dy: number; dr: number }>) => void>>;
}
```

---

#### Step 3.3: Create BoardMessageBus

**File**: `app/src/components/Board/BoardMessageBus.ts` (part 2)

**Purpose**: Replace switch statement with handler registry

```typescript
import { MessageHandlerRegistry } from '../../messaging/MessageHandlerRegistry';
import type { RendererToMainMessage } from '@cardtable2/shared';
import {
  handleReady,
  handleInitialized,
  handleObjectsMoved,
  handleObjectsSelected,
  handleObjectsUnselected,
  handlePanStarted,
  handlePanEnded,
  handleZoomStarted,
  handleZoomEnded,
  handleObjectDragStarted,
  handleObjectDragEnded,
  handleScreenCoords,
  handleCursorPosition,
  handleDragStateUpdate,
  handleDragStateClear,
  handleAwarenessUpdateRate,
  handleFlushed,
  handlePong,
  handleEchoResponse,
  handleError,
  handleAnimationComplete,
} from './handlers';

export class BoardMessageBus {
  private registry = new MessageHandlerRegistry<
    RendererToMainMessage,
    BoardHandlerContext
  >();

  constructor() {
    this.registerHandlers();
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
    this.registry.register('object-drag-started', handleObjectDragStarted);
    this.registry.register('object-drag-ended', handleObjectDragEnded);
    this.registry.register('screen-coords', handleScreenCoords);

    // Awareness
    this.registry.register('cursor-position', handleCursorPosition);
    this.registry.register('drag-state-update', handleDragStateUpdate);
    this.registry.register('drag-state-clear', handleDragStateClear);
    this.registry.register('awareness-update-rate', handleAwarenessUpdateRate);

    // Testing
    this.registry.register('flushed', handleFlushed);
    this.registry.register('pong', handlePong);
    this.registry.register('echo-response', handleEchoResponse);
    this.registry.register('error', handleError);
    this.registry.register('animation-complete', handleAnimationComplete);
  }

  async handleMessage(
    message: RendererToMainMessage,
    context: BoardHandlerContext
  ): Promise<void> {
    await this.registry.handle(message, context);
  }
}
```

**Tests**: `BoardMessageBus.test.ts` (15 tests)
- Registers all handlers correctly
- Routes ready message to handleReady
- Routes initialized message to handleInitialized
- Routes objects-moved to handleObjectsMoved
- Routes objects-selected to handleObjectsSelected
- Routes objects-unselected to handleObjectsUnselected
- Routes pan-started to handlePanStarted
- Routes pan-ended to handlePanEnded
- Routes zoom-started to handleZoomStarted
- Routes zoom-ended to handleZoomEnded
- Routes object-drag-started to handleObjectDragStarted
- Routes object-drag-ended to handleObjectDragEnded
- Routes screen-coords to handleScreenCoords
- Routes cursor-position to handleCursorPosition
- Throws error for unregistered message type

---

### Day 4: Extract UI Components

#### Step 4.1: Create `DebugPanel` Component

**Purpose**: Extract debug UI from Board component

**File**: `app/src/components/Board/components/DebugPanel.tsx`

**Responsibilities**:
- Display table ID
- Display worker status (mode, ready, canvas initialized, WS, awareness Hz)
- Display messages list
- Display debug buttons (ping, echo, animation)

**Props**:
```typescript
export interface DebugPanelProps {
  tableId: string;
  renderMode: RenderMode | null;
  isWorkerReady: boolean;
  isCanvasInitialized: boolean;
  connectionStatus: string;
  awarenessHz: number;
  messages: string[];
  onPing: () => void;
  onEcho: () => void;
  onAnimation: () => void;
}

export function DebugPanel(props: DebugPanelProps): JSX.Element;
```

**Extracted from**: Board.tsx lines 956-1081 (125 lines)

**Tests**: `DebugPanel.test.tsx` (8 tests)
- Renders table ID
- Displays worker status correctly
- Displays messages list
- Calls onPing when ping button clicked
- Calls onEcho when echo button clicked
- Calls onAnimation when animation button clicked
- Disables ping/echo when worker not ready
- Disables animation when canvas not initialized

---

#### Step 4.2: Create `InteractionModeToggle` Component

**Purpose**: Extract interaction mode toggle button

**File**: `app/src/components/Board/components/InteractionModeToggle.tsx`

**Props**:
```typescript
export interface InteractionModeToggleProps {
  interactionMode: 'pan' | 'select';
  onToggle: () => void;
}

export function InteractionModeToggle(props: InteractionModeToggleProps): JSX.Element;
```

**Extracted from**: Board.tsx lines 980-1010 (31 lines)

**Tests**: `InteractionModeToggle.test.tsx` (4 tests)
- Displays pan mode icon/text when in pan mode
- Displays select mode icon/text when in select mode
- Calls onToggle when clicked
- Applies correct background color based on mode

---

#### Step 4.3: Create `MultiSelectToggle` Component

**Purpose**: Extract multi-select toggle button

**File**: `app/src/components/Board/components/MultiSelectToggle.tsx`

**Props**:
```typescript
export interface MultiSelectToggleProps {
  isMultiSelectMode: boolean;
  onToggle: () => void;
}

export function MultiSelectToggle(props: MultiSelectToggleProps): JSX.Element;
```

**Extracted from**: Board.tsx lines 1012-1039 (28 lines)

**Tests**: `MultiSelectToggle.test.tsx` (4 tests)
- Displays ON text when multi-select mode enabled
- Displays OFF text when multi-select mode disabled
- Calls onToggle when clicked
- Applies correct background color based on mode

---

#### Step 4.4: Create Index File

**File**: `app/src/components/Board/components/index.ts`

```typescript
export { DebugPanel } from './DebugPanel';
export { InteractionModeToggle } from './InteractionModeToggle';
export { MultiSelectToggle } from './MultiSelectToggle';
```

---

### Day 5: Refactor Board Component

#### Step 5.1: Refactor Board to Use Hooks + Message Bus

**Purpose**: Compose all hooks and use BoardMessageBus

**File**: `app/src/components/Board.tsx` (refactored)

**New structure** (~300 lines):

```typescript
import { useEffect, useRef, useMemo } from 'react';
import type { BoardProps } from './BoardProps';
import { useRenderer } from '../../hooks/useRenderer';
import { useBoardState } from '../../hooks/useBoardState';
import { useStoreSync } from '../../hooks/useStoreSync';
import { useAwarenessSync } from '../../hooks/useAwarenessSync';
import { usePointerEvents } from '../../hooks/usePointerEvents';
import { useCanvasLifecycle } from '../../hooks/useCanvasLifecycle';
import { useTestAPI } from '../../hooks/useTestAPI';
import { useDebugHandlers } from '../../hooks/useDebugHandlers';
import { BoardMessageBus } from './BoardMessageBus';
import { DebugPanel, InteractionModeToggle, MultiSelectToggle } from './components';
import { ActionHandle } from '../ActionHandle';
import { throttle, AWARENESS_UPDATE_INTERVAL_MS } from '../../utils/throttle';

function Board({
  tableId,
  store,
  connectionStatus,
  showDebugUI = false,
  onContextMenu,
  interactionMode: externalInteractionMode,
  onInteractionModeChange,
  isMultiSelectMode: externalIsMultiSelectMode,
  onMultiSelectModeChange,
  actionContext,
  onActionExecuted,
}: BoardProps) {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const storeRef = useRef<YjsStore>(store);
  storeRef.current = store;

  // Throttled updates (M3-T4)
  const throttledCursorUpdate = useRef(
    throttle((x: number, y: number) => {
      storeRef.current.setCursor(x, y);
    }, AWARENESS_UPDATE_INTERVAL_MS),
  );

  const throttledDragStateUpdate = useRef(
    throttle(
      (
        gid: string,
        primaryId: string,
        pos: { x: number; y: number; r: number },
        secondaryOffsets?: Record<string, { dx: number; dy: number; dr: number }>,
      ) => {
        storeRef.current.setDragState(gid, primaryId, pos, secondaryOffsets);
      },
      AWARENESS_UPDATE_INTERVAL_MS,
    ),
  );

  // Callback refs
  const flushCallbacksRef = useRef<Array<() => void>>([]);
  const selectionSettledCallbacksRef = useRef<Array<() => void>>([]);

  // Custom hooks
  const { renderer, renderMode, isReady, isCanvasInitialized } = useRenderer('auto');

  const {
    messages,
    addMessage,
    debugCoords,
    setDebugCoords,
    isCameraActive,
    setIsCameraActive,
    isWaitingForCoords,
    setIsWaitingForCoords,
    interactionMode,
    setInteractionMode,
    isMultiSelectMode,
    setIsMultiSelectMode,
    awarenessHz,
    setAwarenessHz,
    isSynced,
    setIsSynced,
  } = useBoardState(
    externalInteractionMode,
    onInteractionModeChange,
    externalIsMultiSelectMode,
    onMultiSelectModeChange,
  );

  // Message bus
  const messageBus = useMemo(() => new BoardMessageBus(), []);

  // Message handling
  useEffect(() => {
    if (!renderer) return;

    const unsubscribe = renderer.onMessage(async (message) => {
      const context = {
        renderer,
        store: storeRef.current,
        setIsReady: (ready) => {}, // Not needed anymore, but keep for context
        setIsCanvasInitialized: (initialized) => {}, // Managed by useCanvasLifecycle
        setIsSynced,
        setDebugCoords,
        setIsCameraActive,
        setIsWaitingForCoords,
        setAwarenessHz,
        addMessage,
        flushCallbacks: flushCallbacksRef,
        selectionSettledCallbacks: selectionSettledCallbacksRef,
        throttledCursorUpdate,
        throttledDragStateUpdate,
      };

      await messageBus.handleMessage(message, context);
    });

    return unsubscribe;
  }, [renderer, messageBus, setIsSynced, setDebugCoords, setIsCameraActive, setIsWaitingForCoords, setAwarenessHz, addMessage]);

  // Store sync
  useStoreSync(renderer, store, isSynced);

  // Awareness sync
  useAwarenessSync(renderer, store, isSynced);

  // Pointer events
  const pointerHandlers = usePointerEvents(
    canvasRef,
    renderer,
    store,
    isCanvasInitialized,
    isMultiSelectMode,
    throttledCursorUpdate,
  );

  // Canvas lifecycle
  useCanvasLifecycle(
    canvasRef,
    containerRef,
    renderer,
    renderMode,
    store,
    isReady,
    isCanvasInitialized,
    (initialized) => {}, // Managed internally by useCanvasLifecycle
  );

  // Test API
  const { waitForRenderer, waitForSelectionSettled } = useTestAPI(
    renderer,
    isCanvasInitialized,
    showDebugUI,
  );

  // Debug handlers
  const { handlePing, handleEcho, handleAnimation } = useDebugHandlers(
    renderer,
    tableId,
    addMessage,
  );

  // Send interaction mode changes to renderer
  useEffect(() => {
    if (!renderer || !isCanvasInitialized) return;

    renderer.sendMessage({
      type: 'set-interaction-mode',
      mode: interactionMode,
    });
  }, [interactionMode, isCanvasInitialized, renderer]);

  // Handle context menu
  const handleCanvasContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();

    if (!renderer || !isCanvasInitialized || !onContextMenu) {
      return;
    }

    // ... existing context menu logic (lines 858-918)
    // (Keep as is, no changes needed)
  };

  return (
    <div
      className={showDebugUI ? 'board-debug' : 'board-fullscreen'}
      data-testid="board"
    >
      <div
        ref={containerRef}
        style={{
          width: showDebugUI ? '800px' : '100%',
          height: showDebugUI ? '600px' : '100%',
          border: showDebugUI ? '1px solid #ccc' : 'none',
          position: 'relative',
          overflow: 'hidden',
        }}
        data-testid="canvas-container"
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            touchAction: 'none',
          }}
          data-testid="board-canvas"
          data-canvas-initialized={isCanvasInitialized ? 'true' : 'false'}
          {...pointerHandlers}
          onContextMenu={handleCanvasContextMenu}
        />
      </div>

      {/* Debug UI */}
      {showDebugUI && (
        <>
          <DebugPanel
            tableId={tableId}
            renderMode={renderMode}
            isWorkerReady={isReady}
            isCanvasInitialized={isCanvasInitialized}
            connectionStatus={connectionStatus}
            awarenessHz={awarenessHz}
            messages={messages}
            onPing={handlePing}
            onEcho={handleEcho}
            onAnimation={handleAnimation}
          />

          <InteractionModeToggle
            interactionMode={interactionMode}
            onToggle={() => setInteractionMode(interactionMode === 'pan' ? 'select' : 'pan')}
          />

          <MultiSelectToggle
            isMultiSelectMode={isMultiSelectMode}
            onToggle={() => setIsMultiSelectMode(!isMultiSelectMode)}
          />
        </>
      )}

      {/* Action Handle */}
      {!isCameraActive &&
        !isWaitingForCoords &&
        debugCoords &&
        debugCoords.length > 0 &&
        actionContext && (
          <ActionHandle
            key={debugCoords.map((c) => c.id).join(',')}
            screenCoords={debugCoords}
            actionContext={actionContext}
            onActionExecuted={onActionExecuted}
          />
        )}
    </div>
  );
}

export default Board;
```

**Key changes**:
- ✅ Reduced from 1,100 lines to ~300 lines
- ✅ All hooks composed at top
- ✅ BoardMessageBus replaces 228-line switch statement
- ✅ UI components extracted (DebugPanel, toggles)
- ✅ Clear separation of concerns
- ✅ Easy to test, easy to understand

---

#### Step 5.2: Extract BoardProps Interface

**File**: `app/src/components/Board/BoardProps.ts`

**Purpose**: Separate props interface for better organization

```typescript
import type { YjsStore } from '../../store/YjsStore';
import type { ActionContext } from '../../actions/types';

export interface BoardProps {
  tableId: string;
  store: YjsStore;
  connectionStatus: string;
  showDebugUI?: boolean;
  onContextMenu?: (x: number, y: number) => void;
  interactionMode?: 'pan' | 'select';
  onInteractionModeChange?: (mode: 'pan' | 'select') => void;
  isMultiSelectMode?: boolean;
  onMultiSelectModeChange?: (enabled: boolean) => void;
  actionContext?: ActionContext | null;
  onActionExecuted?: (actionId: string) => void;
}
```

---

### Day 6: Testing & Integration

#### Step 6.1: Update All Tests

**Tasks**:
- ✅ Run all existing Board tests (should still pass with refactored component)
- ✅ Add new hook tests (8 hook files × ~8 tests each = 64 tests)
- ✅ Add BoardMessageBus tests (15 tests)
- ✅ Add handler tests (6 handler files × ~7 tests each = 42 tests)
- ✅ Add UI component tests (3 component files × ~6 tests each = 18 tests)

**Expected test counts**:
- **Before**: 68 tests (existing)
- **After**: 68 + 64 + 15 + 42 + 18 = **207 tests**

**Command**:
```bash
pnpm run test
```

---

#### Step 6.2: Run E2E Tests

**Tasks**:
- ✅ Verify all E2E tests pass (camera, hover, selection, drag)
- ✅ Verify test API still works (waitForRenderer, waitForSelectionSettled)

**Command**:
```bash
cd app && pnpm run test:e2e
```

---

#### Step 6.3: Run Linting + Typecheck

**Tasks**:
- ✅ Fix any ESLint warnings
- ✅ Fix any TypeScript errors

**Commands**:
```bash
pnpm run lint
pnpm run typecheck
```

---

#### Step 6.4: Manual Testing

**Tasks**:
- ✅ Test debug UI (toggles, buttons, messages)
- ✅ Test pan mode (drag canvas, zoom)
- ✅ Test select mode (rectangle selection)
- ✅ Test multi-select mode (touch devices)
- ✅ Test awareness (remote cursors, drag ghosts)
- ✅ Test action handle (appears correctly, actions work)

**Test in both modes**:
```bash
# Worker mode
http://localhost:3000/table/test-table?renderMode=worker

# Main-thread mode
http://localhost:3000/table/test-table?renderMode=main-thread
```

---

## Success Metrics

### Code Reduction ✅
- **Board.tsx**: 1,100 → ~300 lines (73% reduction)
- **Average hook**: ~150 lines
- **Average handler**: ~30 lines
- **Average UI component**: ~50 lines

### File Organization ✅
- **Before**: 1 monolithic file (Board.tsx)
- **After**:
  - 8 custom hooks (app/src/hooks/)
  - 1 message bus (BoardMessageBus.ts)
  - 6 handler files (handlers/)
  - 3 UI components (components/)
  - 1 orchestrator (Board.tsx)

### Test Coverage ✅
- **Before**: 68 tests
- **After**: 207 tests (139 new tests)
- **Handler coverage**: 100%
- **Hook coverage**: 95%+

### Maintainability ✅
- **Clear boundaries**: Hooks → Message Bus → Handlers
- **Single responsibility**: Each file has one purpose
- **Easy to test**: Each piece tested in isolation
- **Easy to extend**: Add new handlers/hooks without modifying Board
- **No switch statements**: Registry-based message routing

---

## Migration Checklist

### Day 1: Core Hooks
- [ ] Create `useRenderer.ts` (8 tests)
- [ ] Create `useBoardState.ts` (12 tests)
- [ ] Create `useStoreSync.ts` (7 tests)
- [ ] Create `useAwarenessSync.ts` (6 tests)
- [ ] Run tests: `pnpm run test -- useRenderer useBoardState useStoreSync useAwarenessSync`

### Day 2: Remaining Hooks
- [ ] Create `usePointerEvents.ts` (10 tests)
- [ ] Create `useCanvasLifecycle.ts` (9 tests)
- [ ] Create `useTestAPI.ts` (7 tests)
- [ ] Create `useDebugHandlers.ts` (5 tests)
- [ ] Run tests: `pnpm run test -- usePointerEvents useCanvasLifecycle useTestAPI useDebugHandlers`

### Day 3: Message Bus + Handlers
- [ ] Create `BoardHandlerContext` interface
- [ ] Create `handlers/lifecycle.ts` (4 tests)
- [ ] Create `handlers/objectState.ts` (6 tests)
- [ ] Create `handlers/camera.ts` (14 tests)
- [ ] Create `handlers/awareness.ts` (8 tests)
- [ ] Create `handlers/testing.ts` (10 tests)
- [ ] Create `handlers/index.ts`
- [ ] Create `BoardMessageBus.ts` (15 tests)
- [ ] Run tests: `pnpm run test -- BoardMessageBus handlers`

### Day 4: UI Components
- [ ] Create `DebugPanel.tsx` (8 tests)
- [ ] Create `InteractionModeToggle.tsx` (4 tests)
- [ ] Create `MultiSelectToggle.tsx` (4 tests)
- [ ] Create `components/index.ts`
- [ ] Run tests: `pnpm run test -- DebugPanel InteractionModeToggle MultiSelectToggle`

### Day 5: Refactor Board
- [ ] Create `BoardProps.ts`
- [ ] Refactor `Board.tsx` to use hooks + message bus
- [ ] Update imports in Board.tsx
- [ ] Remove old code (switch statement, duplicated logic)
- [ ] Run tests: `pnpm run test Board`

### Day 6: Testing & Integration
- [ ] Run all unit tests: `pnpm run test`
- [ ] Run all E2E tests: `cd app && pnpm run test:e2e`
- [ ] Run linting: `pnpm run lint`
- [ ] Run typecheck: `pnpm run typecheck`
- [ ] Manual testing (debug UI, modes, awareness, action handle)
- [ ] Test in both worker and main-thread modes
- [ ] Verify 207 tests passing
- [ ] Verify 0 ESLint errors
- [ ] Verify 0 TypeScript errors

---

## Risk Assessment

### Low Risk ✅
- **Phased approach**: Each day is independently testable
- **Tests at each step**: 207 tests ensure correctness
- **Backward compatible**: All existing tests should pass
- **Clear rollback points**: Can revert after each day if needed

### Medium Risk ⚠️
- **Many new files**: 18+ new files to manage
- **Complex dependencies**: Hooks depend on each other
- **Context passing**: BoardHandlerContext has many fields

### Mitigation Strategies
- **Comprehensive testing**: 207 tests cover all paths
- **Clear documentation**: This plan + inline comments
- **Incremental rollout**: Day-by-day validation
- **E2E verification**: Existing E2E tests catch regressions

---

## Expected Outcome

### Clean Architecture ✅
- **Presentation Layer**: Board.tsx (composition root)
- **Application Layer**: Hooks (business logic)
- **Infrastructure Layer**: MessageBus + Handlers (communication)

### Improved Maintainability ✅
- **73% smaller** main component (1,100 → 300 lines)
- **Single responsibility** per file
- **Easy to test** in isolation
- **Easy to extend** (add hooks, handlers, components)

### Better Developer Experience ✅
- **No switch statements** (registry-based routing)
- **Clear boundaries** (hooks, message bus, handlers, components)
- **Type-safe** message handling
- **Modular** structure

---

## Post-Refactor Tasks

### Documentation
- [ ] Update `CLAUDE.md` with new architecture details
- [ ] Update `_plans/architecture_refactor_hybrid.md` (mark Phase 4 complete)
- [ ] Add inline comments to explain hook composition
- [ ] Document BoardHandlerContext interface

### Optimization (Optional)
- [ ] Profile performance (ensure no regressions)
- [ ] Add middleware for logging (if needed)
- [ ] Add middleware for performance tracking (if needed)

### Next Steps
- [ ] Consider Phase 5: Additional refactoring (if needed)
- [ ] Consider extracting more domain logic into services
- [ ] Consider adding middleware for telemetry

---

## Conclusion

Phase 4 is a comprehensive refactor that applies DDD principles to the Board component. By extracting hooks, creating a message bus, and extracting UI components, we achieve:

- **73% code reduction** (1,100 → 300 lines)
- **139 new tests** (68 → 207 tests)
- **18+ new files** (organized by concern)
- **Clear architecture** (Presentation → Application → Infrastructure)
- **Zero switch statements** (registry-based routing)

The result is a maintainable, testable, and extensible codebase that follows modern React patterns and DDD principles.
