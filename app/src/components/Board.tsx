import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  MainToRendererMessage,
  RendererToMainMessage,
  PointerEventData,
  WheelEventData,
  AwarenessState,
} from '@cardtable2/shared';
import {
  RenderMode,
  type IRendererAdapter,
} from '../renderer/IRendererAdapter';
import { createRenderer } from '../renderer/RendererFactory';
import type { YjsStore, ObjectChanges } from '../store/YjsStore';
import {
  moveObjects,
  selectObjects,
  unselectObjects,
} from '../store/YjsActions';
import { throttle, AWARENESS_UPDATE_INTERVAL_MS } from '../utils/throttle';

export interface BoardProps {
  tableId: string;
  store: YjsStore;
  connectionStatus: string;
  showDebugUI?: boolean; // M3.5.1-T0: Control debug UI visibility
  onContextMenu?: (x: number, y: number) => void; // M3.5.1-T4: Context menu integration
  interactionMode?: 'pan' | 'select'; // M3.5.1-T5: Global menu bar integration
  onInteractionModeChange?: (mode: 'pan' | 'select') => void; // M3.5.1-T5: Global menu bar integration
}

function Board({
  tableId,
  store,
  connectionStatus,
  showDebugUI = false,
  onContextMenu,
  interactionMode: externalInteractionMode,
  onInteractionModeChange,
}: BoardProps) {
  const rendererRef = useRef<IRendererAdapter | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasTransferredRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const storeUnsubscribeRef = useRef<(() => void) | null>(null);
  const awarenessUnsubscribeRef = useRef<(() => void) | null>(null);
  const storeRef = useRef<YjsStore>(store);

  // Keep store ref up to date
  storeRef.current = store;

  // Throttled cursor position update (M3-T4)
  const throttledCursorUpdate = useRef(
    throttle((x: number, y: number) => {
      storeRef.current.setCursor(x, y);
    }, AWARENESS_UPDATE_INTERVAL_MS),
  );

  // Throttled drag state update (M5-T1)
  const throttledDragStateUpdate = useRef(
    throttle(
      (
        gid: string,
        primaryId: string,
        pos: { x: number; y: number; r: number },
        secondaryOffsets?: Record<
          string,
          { dx: number; dy: number; dr: number }
        >,
      ) => {
        storeRef.current.setDragState(gid, primaryId, pos, secondaryOffsets);
      },
      AWARENESS_UPDATE_INTERVAL_MS,
    ),
  );

  const [messages, setMessages] = useState<string[]>([]);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const [isCanvasInitialized, setIsCanvasInitialized] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [renderMode, setRenderMode] = useState<RenderMode | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [internalInteractionMode, setInternalInteractionMode] = useState<
    'pan' | 'select'
  >('pan');
  const [awarenessHz, setAwarenessHz] = useState<number>(0);

  // M3.5.1-T5: Use external interaction mode if provided (for GlobalMenuBar integration)
  const interactionMode = externalInteractionMode ?? internalInteractionMode;
  const setInteractionMode =
    onInteractionModeChange ?? setInternalInteractionMode;

  // Initialize renderer on mount
  useEffect(() => {
    // Prevent double initialization in React strict mode
    if (rendererRef.current) {
      return;
    }

    // Check for renderMode query parameter to force a specific mode
    const params = new URLSearchParams(window.location.search);
    const renderModeParam = params.get('renderMode');
    let mode: RenderMode | 'auto' = 'auto';

    // Query param is a string, so compare against enum values
    if (renderModeParam === 'worker') {
      mode = RenderMode.Worker;
      console.log(`[Board] Forcing render mode: ${mode}`);
    } else if (renderModeParam === 'main-thread') {
      mode = RenderMode.MainThread;
      console.log(`[Board] Forcing render mode: ${mode}`);
    } else {
      console.log('[Board] Using auto-detected render mode');
    }

    // Create renderer adapter
    const renderer = createRenderer(mode);

    // Store renderer reference
    rendererRef.current = renderer;

    // Get the actual mode from the renderer
    const actualMode = renderer.mode;
    setRenderMode(actualMode);
    console.log(`[Board] ========================================`);
    console.log(`[Board] RENDER MODE: ${actualMode}`);
    console.log(
      `[Board] Worker will ${actualMode === RenderMode.Worker ? 'BE' : 'NOT be'} used`,
    );
    console.log(
      `[Board] OffscreenCanvas will ${actualMode === RenderMode.Worker ? 'BE' : 'NOT be'} used`,
    );
    console.log(`[Board] ========================================`);

    // Handle messages from renderer
    renderer.onMessage((message: RendererToMainMessage) => {
      switch (message.type) {
        case 'ready':
          setIsWorkerReady(true);
          setMessages((prev) => [...prev, 'Worker is ready']);
          break;

        case 'initialized': {
          setIsCanvasInitialized(true);
          setMessages((prev) => [...prev, 'Canvas initialized']);

          // Send initial sync of all objects from store
          const allObjects = storeRef.current.getAllObjects();
          const objectsArray = Array.from(allObjects.entries()).map(
            ([id, obj]) => ({
              id,
              obj,
            }),
          );

          console.log(
            `[Board] Syncing ${objectsArray.length} objects to renderer`,
          );
          renderer.sendMessage({
            type: 'sync-objects',
            objects: objectsArray,
          });
          setIsSynced(true);
          break;
        }

        case 'pong':
          setMessages((prev) => [...prev, `Worker: ${message.data}`]);
          break;

        case 'echo-response':
          setMessages((prev) => [...prev, `Echo: ${message.data}`]);
          break;

        case 'error':
          setMessages((prev) => [...prev, `Error: ${message.error}`]);
          break;

        case 'animation-complete':
          setMessages((prev) => [...prev, 'Animation completed!']);
          break;

        case 'objects-moved': {
          console.log(`[Board] ${message.updates.length} object(s) moved`);
          // Update store with new positions (M3-T2.5 bi-directional sync)
          moveObjects(storeRef.current, message.updates);
          // Decrement pending operations counter (E2E Test API)
          const prevCount = pendingOperationsRef.current;
          pendingOperationsRef.current = Math.max(
            0,
            pendingOperationsRef.current - 1,
          );
          console.log(
            `[Board] pendingOperations-- → ${pendingOperationsRef.current} (was ${prevCount}, objects-moved)`,
          );
          break;
        }

        case 'objects-selected': {
          console.log(`[Board] ${message.ids.length} object(s) selected`);
          // Update store with selection ownership (M3-T3)
          const result = selectObjects(
            storeRef.current,
            message.ids,
            storeRef.current.getActorId(),
          );
          if (result.failed.length > 0) {
            console.warn(
              `[Board] Failed to select ${result.failed.length} object(s):`,
              result.failed,
            );
          }
          // Decrement pending operations counter (E2E Test API)
          const prevCountSel = pendingOperationsRef.current;
          pendingOperationsRef.current = Math.max(
            0,
            pendingOperationsRef.current - 1,
          );
          console.log(
            `[Board] pendingOperations-- → ${pendingOperationsRef.current} (was ${prevCountSel}, objects-selected)`,
          );

          // M3.5.1-T4: Trigger selection settled callbacks
          if (selectionSettledCallbacksRef.current.length > 0) {
            console.log(
              `[Board] Triggering ${selectionSettledCallbacksRef.current.length} selection settled callback(s)`,
            );
            const callbacks = selectionSettledCallbacksRef.current;
            selectionSettledCallbacksRef.current = [];
            callbacks.forEach((cb) => cb());
          }
          break;
        }

        case 'objects-unselected': {
          console.log(`[Board] ${message.ids.length} object(s) unselected`);
          // Release selection ownership (M3-T3)
          unselectObjects(
            storeRef.current,
            message.ids,
            storeRef.current.getActorId(),
          );
          // Decrement pending operations counter (E2E Test API)
          pendingOperationsRef.current = Math.max(
            0,
            pendingOperationsRef.current - 1,
          );

          // M3.5.1-T4: Trigger selection settled callbacks (for context menu timing)
          if (selectionSettledCallbacksRef.current.length > 0) {
            console.log(
              `[Board] Triggering ${selectionSettledCallbacksRef.current.length} selection settled callback(s) after unselect`,
            );
            const callbacks = selectionSettledCallbacksRef.current;
            selectionSettledCallbacksRef.current = [];
            callbacks.forEach((cb) => cb());
          }
          break;
        }

        case 'cursor-position': {
          // M3-T4: Renderer sends world coordinates for cursor
          // Throttled update to awareness at 30Hz
          throttledCursorUpdate.current(message.x, message.y);
          break;
        }

        case 'drag-state-update': {
          // M5-T1: Update drag awareness
          // Throttled update to awareness at 30Hz
          throttledDragStateUpdate.current(
            message.gid,
            message.primaryId,
            message.pos,
            message.secondaryOffsets,
          );
          break;
        }

        case 'drag-state-clear': {
          // M5-T1: Clear drag awareness
          // Cancel any pending throttled updates
          throttledDragStateUpdate.current.cancel();
          storeRef.current.clearDragState();
          break;
        }

        case 'awareness-update-rate': {
          // M5-T1: Update awareness Hz display
          setAwarenessHz(message.hz);
          break;
        }

        case 'flushed': {
          // E2E Test API: Renderer has processed all pending messages
          // Resolve all pending flush callbacks
          console.log(
            `[Board] Received 'flushed' message, pending ops now: ${pendingOperationsRef.current}`,
          );
          const callbacks = flushCallbacksRef.current;
          flushCallbacksRef.current = [];
          callbacks.forEach((cb) => cb());
          break;
        }
      }
    });

    // Cleanup on unmount
    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
      canvasTransferredRef.current = false;
    };
  }, []);

  // Subscribe to store changes and forward to renderer
  useEffect(() => {
    // Only subscribe after renderer is initialized and synced
    if (!isSynced || !rendererRef.current) {
      return;
    }

    console.log('[Board] Subscribing to store changes');

    const unsubscribe = store.onObjectsChange((changes: ObjectChanges) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      // Forward added objects (batched)
      if (changes.added.length > 0) {
        console.log(
          `[Board] Forwarding ${changes.added.length} added object(s)`,
        );
        renderer.sendMessage({
          type: 'objects-added',
          objects: changes.added,
        });
      }

      // Forward updated objects (batched)
      if (changes.updated.length > 0) {
        console.log(
          `[Board] Forwarding ${changes.updated.length} updated object(s)`,
        );
        renderer.sendMessage({
          type: 'objects-updated',
          objects: changes.updated,
        });
      }

      // Forward removed objects (batched)
      if (changes.removed.length > 0) {
        console.log(
          `[Board] Forwarding ${changes.removed.length} removed object(s)`,
        );
        renderer.sendMessage({
          type: 'objects-removed',
          ids: changes.removed,
        });
      }
    });

    storeUnsubscribeRef.current = unsubscribe;

    return () => {
      if (storeUnsubscribeRef.current) {
        console.log('[Board] Unsubscribing from store changes');
        storeUnsubscribeRef.current();
        storeUnsubscribeRef.current = null;
      }
    };
  }, [isSynced, store]);

  // Subscribe to awareness changes and forward to renderer (M3-T4)
  useEffect(() => {
    // Only subscribe after renderer is initialized and synced
    if (!isSynced || !rendererRef.current) {
      return;
    }

    console.log('[Board] Subscribing to awareness changes');

    const unsubscribe = store.onAwarenessChange((states) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      // Filter out local client (only send remote awareness)
      const localClientId = store.getDoc().clientID;
      const remoteStates: Array<{ clientId: number; state: AwarenessState }> =
        [];

      states.forEach((state, clientId) => {
        if (clientId !== localClientId) {
          remoteStates.push({ clientId, state });
        }
      });

      // Forward to renderer
      renderer.sendMessage({
        type: 'awareness-update',
        states: remoteStates,
      });
    });

    awarenessUnsubscribeRef.current = unsubscribe;

    return () => {
      if (awarenessUnsubscribeRef.current) {
        console.log('[Board] Unsubscribing from awareness changes');
        awarenessUnsubscribeRef.current();
        awarenessUnsubscribeRef.current = null;
      }
    };
  }, [isSynced, store]);

  // Add wheel event listener with passive: false to prevent page scroll
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const wheelHandler = (event: WheelEvent) => {
      if (!rendererRef.current || !isCanvasInitialized) return;

      // Prevent default browser zoom AND page scroll
      event.preventDefault();

      // Convert to canvas-relative coordinates (accounting for DPR)
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const canvasX = (event.clientX - rect.left) * dpr;
      const canvasY = (event.clientY - rect.top) * dpr;

      const wheelData: WheelEventData = {
        deltaY: event.deltaY,
        clientX: canvasX,
        clientY: canvasY,
      };

      const message: MainToRendererMessage = {
        type: 'wheel',
        event: wheelData,
      };
      rendererRef.current.sendMessage(message);
    };

    // Add with passive: false to allow preventDefault
    canvas.addEventListener('wheel', wheelHandler, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', wheelHandler);
    };
  }, [isCanvasInitialized]);

  // Initialize canvas and transfer to renderer
  useEffect(() => {
    // Wait for renderer to be ready
    if (
      !isWorkerReady ||
      !canvasRef.current ||
      !rendererRef.current ||
      !renderMode ||
      !store
    ) {
      return;
    }

    // Prevent double transfer in React strict mode
    if (canvasTransferredRef.current) {
      return;
    }

    // Mark as transferred immediately to prevent race conditions
    canvasTransferredRef.current = true;

    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth * dpr;
    const height = canvas.clientHeight * dpr;

    try {
      let canvasToSend: OffscreenCanvas | HTMLCanvasElement;

      if (renderMode === RenderMode.Worker) {
        // Worker mode: transfer to OffscreenCanvas
        console.log('[Board] Transferring canvas to OffscreenCanvas...');
        canvasToSend = canvas.transferControlToOffscreen();
        console.log('[Board] ✓ Canvas transferred successfully');
        setMessages((prev) => [...prev, 'Canvas transferred to worker']);
      } else {
        // Main-thread mode: use canvas directly
        console.log('[Board] Using canvas directly (NO OffscreenCanvas)');
        canvasToSend = canvas;
        console.log('[Board] ✓ Canvas ready for main-thread rendering');
        setMessages((prev) => [...prev, 'Canvas using main thread']);
      }

      const message: MainToRendererMessage = {
        type: 'init',
        canvas: canvasToSend,
        width,
        height,
        dpr,
        actorId: store.getActorId(), // Pass actor ID for derived selection state (M3-T3)
      };

      console.log('[Board] Sending init message to renderer...');
      rendererRef.current.sendMessage(message);
      console.log('[Board] ✓ Init message sent');

      // Debug: Check canvas DOM size after init
      setTimeout(() => {
        console.log('[Board] Canvas element check:');
        console.log('[Board] - canvas.width (attribute):', canvas.width);
        console.log('[Board] - canvas.height (attribute):', canvas.height);
        console.log('[Board] - canvas.style.width:', canvas.style.width);
        console.log('[Board] - canvas.style.height:', canvas.style.height);
        console.log('[Board] - canvas.clientWidth:', canvas.clientWidth);
        console.log('[Board] - canvas.clientHeight:', canvas.clientHeight);
      }, 100);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[Board] ✗ Canvas init error:', errorMsg);
      setMessages((prev) => [...prev, `Canvas init error: ${errorMsg}`]);
      canvasTransferredRef.current = false; // Reset on error
    }
  }, [isWorkerReady, renderMode, store]);

  // Send interaction mode changes to renderer
  useEffect(() => {
    if (!rendererRef.current || !isCanvasInitialized) return;

    const message: MainToRendererMessage = {
      type: 'set-interaction-mode',
      mode: interactionMode,
    };
    rendererRef.current.sendMessage(message);
  }, [interactionMode, isCanvasInitialized]);

  // Handle canvas resize (M3.5.1-T0)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !rendererRef.current || !isCanvasInitialized)
      return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const dpr = window.devicePixelRatio || 1;
        const width = entry.contentRect.width * dpr;
        const height = entry.contentRect.height * dpr;

        // Send resize message to renderer
        // PixiJS will handle updating canvas dimensions via app.renderer.resize()
        const message: MainToRendererMessage = {
          type: 'resize',
          width,
          height,
          dpr,
        };
        rendererRef.current!.sendMessage(message);
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isCanvasInitialized, renderMode]);

  // Send ping message to renderer
  const handlePing = () => {
    if (!rendererRef.current) return;

    const message: MainToRendererMessage = {
      type: 'ping',
      data: `Hello from table ${tableId}`,
    };
    rendererRef.current.sendMessage(message);
  };

  // Send echo message to renderer
  const handleEcho = () => {
    if (!rendererRef.current) return;

    const message: MainToRendererMessage = {
      type: 'echo',
      data: `Echo test at ${new Date().toLocaleTimeString()}`,
    };
    rendererRef.current.sendMessage(message);
  };

  // Trigger test animation (rotates circle for 2 seconds)
  const handleAnimation = () => {
    if (!rendererRef.current) return;

    const message: MainToRendererMessage = {
      type: 'test-animation',
    };
    rendererRef.current.sendMessage(message);
    setMessages((prev) => [...prev, 'Starting animation...']);
  };

  // Ref to store pending flush promises
  const flushCallbacksRef = useRef<Array<() => void>>([]);

  // Ref to track pending renderer operations (E2E Test API)
  // Incremented when forwarding pointer events to renderer
  // Decremented when renderer sends back objects-moved/objects-selected/objects-unselected
  const pendingOperationsRef = useRef<number>(0);

  // M3.5.1-T4: Ref to track pending selection operations for context menu
  const selectionSettledCallbacksRef = useRef<Array<() => void>>([]);

  // Test API for E2E: Wait for renderer to process all pending messages
  const waitForRenderer = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (!rendererRef.current || !isCanvasInitialized) {
        resolve();
        return;
      }

      // Register callback for 'flushed' response
      flushCallbacksRef.current.push(resolve);

      // Send flush message with current pending operations count
      const pendingCount = pendingOperationsRef.current;
      console.log(
        `[Board] waitForRenderer() called with ${pendingCount} pending operations`,
      );
      const message: MainToRendererMessage = {
        type: 'flush',
        pendingOperations: pendingCount,
      };
      rendererRef.current.sendMessage(message);
    });
  }, [isCanvasInitialized]);

  // M3.5.1-T4: Wait for selection to settle after synthetic pointer events
  const waitForSelectionSettled = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      // If there are no pending operations, resolve immediately
      if (pendingOperationsRef.current === 0) {
        console.log(
          '[Board] waitForSelectionSettled: No pending operations, resolving immediately',
        );
        resolve();
        return;
      }

      // Register callback to be triggered when next selection completes
      console.log(
        '[Board] waitForSelectionSettled: Registering callback for pending selection',
      );
      selectionSettledCallbacksRef.current.push(resolve);
    });
  }, []);

  // Expose test API in dev mode only
  useEffect(() => {
    if (import.meta.env.DEV && showDebugUI) {
      window.__TEST_BOARD__ = {
        waitForRenderer,
        waitForSelectionSettled,
      };
      return () => {
        delete window.__TEST_BOARD__;
      };
    }
  }, [
    showDebugUI,
    isCanvasInitialized,
    waitForRenderer,
    waitForSelectionSettled,
  ]);

  // Helper to serialize pointer events (M2-T3)
  const serializePointerEvent = (
    event: React.PointerEvent,
  ): PointerEventData => {
    const pointerType = event.pointerType;
    const isValidType =
      pointerType === 'mouse' ||
      pointerType === 'pen' ||
      pointerType === 'touch';

    if (!isValidType) {
      console.warn(
        'Unexpected pointer type:',
        pointerType,
        'defaulting to mouse',
      );
    }

    // Convert to canvas-relative coordinates (accounting for DPR)
    const canvas = canvasRef.current;
    let canvasX = event.clientX;
    let canvasY = event.clientY;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvasX = (event.clientX - rect.left) * dpr;
      canvasY = (event.clientY - rect.top) * dpr;
    }

    return {
      pointerId: event.pointerId,
      pointerType: isValidType ? pointerType : 'mouse',
      clientX: canvasX,
      clientY: canvasY,
      button: event.button,
      buttons: event.buttons,
      isPrimary: event.isPrimary,
      // Apply multi-select mode for touch events when mode is enabled
      metaKey:
        event.metaKey || (isMultiSelectMode && event.pointerType === 'touch'),
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
    };
  };

  // Handle pointer down (M2-T3)
  const handlePointerDown = (event: React.PointerEvent) => {
    if (!rendererRef.current || !isCanvasInitialized) return;

    // Ignore right-click (button 2) - context menu handles this (M3.5.1-T4)
    if (event.button === 2) {
      return;
    }

    // Track pending operation (E2E Test API)
    pendingOperationsRef.current++;
    console.log(
      `[Board] pendingOperations++ → ${pendingOperationsRef.current} (pointer-down)`,
    );

    const message: MainToRendererMessage = {
      type: 'pointer-down',
      event: serializePointerEvent(event),
    };
    rendererRef.current.sendMessage(message);
  };

  // Handle pointer move (M2-T3)
  const handlePointerMove = (event: React.PointerEvent) => {
    if (!rendererRef.current || !isCanvasInitialized) return;

    const message: MainToRendererMessage = {
      type: 'pointer-move',
      event: serializePointerEvent(event),
    };
    rendererRef.current.sendMessage(message);
  };

  // Handle pointer up (M2-T3)
  const handlePointerUp = (event: React.PointerEvent) => {
    if (!rendererRef.current || !isCanvasInitialized) return;

    const message: MainToRendererMessage = {
      type: 'pointer-up',
      event: serializePointerEvent(event),
    };
    rendererRef.current.sendMessage(message);
  };

  // Handle pointer cancel (M2-T3)
  const handlePointerCancel = (event: React.PointerEvent) => {
    if (!rendererRef.current || !isCanvasInitialized) return;

    const message: MainToRendererMessage = {
      type: 'pointer-cancel',
      event: serializePointerEvent(event),
    };
    rendererRef.current.sendMessage(message);
  };

  // Handle pointer leave (M3-T4)
  const handlePointerLeave = () => {
    if (!rendererRef.current || !isCanvasInitialized) return;

    // Cancel any pending throttled updates
    throttledCursorUpdate.current.cancel();

    // Clear cursor from awareness
    store.clearCursor();

    // Notify renderer
    const message: MainToRendererMessage = {
      type: 'pointer-leave',
    };
    rendererRef.current.sendMessage(message);
  };

  // Handle context menu (M3.5.1-T4)
  const handleCanvasContextMenu = (event: React.MouseEvent) => {
    event.preventDefault(); // Prevent browser context menu

    if (!rendererRef.current || !isCanvasInitialized || !onContextMenu) {
      return;
    }

    // Synthetic pointer ID used for context menu selection events
    const CONTEXT_MENU_POINTER_ID = 999;

    // Simulate a pointer-down/up to trigger selection logic
    // This ensures right-clicking an object selects it before showing the context menu
    const syntheticPointerEvent: PointerEventData = {
      pointerId: CONTEXT_MENU_POINTER_ID,
      pointerType: 'mouse',
      clientX: event.clientX,
      clientY: event.clientY,
      button: 0, // Left button (for selection logic)
      buttons: 1,
      isPrimary: true,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
    };

    // Convert to canvas-relative coordinates
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      syntheticPointerEvent.clientX = (event.clientX - rect.left) * dpr;
      syntheticPointerEvent.clientY = (event.clientY - rect.top) * dpr;
    }

    // Track pending operation
    pendingOperationsRef.current++;
    console.log(
      `[Board] Context menu: pendingOperations++ → ${pendingOperationsRef.current} (synthetic pointer-down/up)`,
    );

    // Send synthetic pointer-down
    rendererRef.current.sendMessage({
      type: 'pointer-down',
      event: syntheticPointerEvent,
    });

    // Send synthetic pointer-up immediately
    rendererRef.current.sendMessage({
      type: 'pointer-up',
      event: syntheticPointerEvent,
    });

    // Wait for selection to settle, then open context menu
    void (async () => {
      await waitForSelectionSettled();
      const selectionCount = store.getAllObjects
        ? Array.from(store.getAllObjects().values()).filter(
            (obj) => obj._selectedBy === store.getActorId(),
          ).length
        : 0;
      console.log(
        `[Board] Selection settled, opening context menu (selection count: ${selectionCount})`,
      );
      onContextMenu(event.clientX, event.clientY);
    })();
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
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
          onContextMenu={handleCanvasContextMenu}
        />
      </div>

      {/* Debug UI - only shown when showDebugUI is true */}
      {showDebugUI && (
        <>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 'bold',
              padding: '4px 0',
              marginBottom: '4px',
            }}
          >
            Board: {tableId}
          </div>

          <div
            className="worker-status"
            data-testid="worker-status"
            style={{ fontSize: '12px', marginBottom: '8px' }}
          >
            Mode: {renderMode} | Worker:{' '}
            {isWorkerReady ? 'Ready' : 'Initializing...'} | Canvas:{' '}
            {isCanvasInitialized ? 'Initialized' : 'Not initialized'} | WS:{' '}
            {connectionStatus} | Awareness: {awarenessHz} Hz
          </div>

          {/* Interaction mode toggle */}
          <div style={{ marginTop: '12px', marginBottom: '8px' }}>
            <button
              onClick={() =>
                setInteractionMode(interactionMode === 'pan' ? 'select' : 'pan')
              }
              data-testid="interaction-mode-toggle"
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 'bold',
                backgroundColor:
                  interactionMode === 'select' ? '#3b82f6' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {interactionMode === 'pan' ? '🖐️ Pan Mode' : '⬚ Select Mode'}
            </button>
            <span
              style={{
                marginLeft: '12px',
                fontSize: '12px',
                color: '#6b7280',
              }}
            >
              (Hold Cmd/Ctrl to invert)
            </span>
          </div>

          {/* Mobile multi-select toggle */}
          <div style={{ marginBottom: '8px' }}>
            <button
              onClick={() => setIsMultiSelectMode(!isMultiSelectMode)}
              data-testid="multi-select-toggle"
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 'bold',
                backgroundColor: isMultiSelectMode ? '#ef4444' : '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {isMultiSelectMode ? '✓ Multi-Select ON' : 'Multi-Select OFF'}
            </button>
            <span
              style={{
                marginLeft: '12px',
                fontSize: '12px',
                color: '#6b7280',
              }}
            >
              (Mobile: Tap to toggle selection)
            </span>
          </div>

          <div className="controls">
            <button
              onClick={handlePing}
              disabled={!isWorkerReady}
              data-testid="ping-button"
            >
              Send Ping
            </button>
            <button
              onClick={handleEcho}
              disabled={!isWorkerReady}
              data-testid="echo-button"
            >
              Send Echo
            </button>
            <button
              onClick={handleAnimation}
              disabled={!isCanvasInitialized}
              data-testid="animation-button"
              style={{
                backgroundColor: '#4CAF50',
                color: 'white',
                fontWeight: 'bold',
              }}
            >
              Test Animation (3s)
            </button>
          </div>

          <div className="messages" data-testid="messages">
            <h3>Messages:</h3>
            <ul>
              {messages.map((msg, index) => (
                <li key={index} data-testid={`message-${index}`}>
                  {msg}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

export default Board;
