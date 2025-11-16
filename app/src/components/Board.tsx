import { useEffect, useRef, useState } from 'react';
import type {
  MainToRendererMessage,
  RendererToMainMessage,
  PointerEventData,
  WheelEventData,
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

interface BoardProps {
  tableId: string;
  store: YjsStore;
}

function Board({ tableId, store }: BoardProps) {
  const rendererRef = useRef<IRendererAdapter | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasTransferredRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const storeUnsubscribeRef = useRef<(() => void) | null>(null);
  const storeRef = useRef<YjsStore>(store);

  // Keep store ref up to date
  storeRef.current = store;

  const [messages, setMessages] = useState<string[]>([]);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const [isCanvasInitialized, setIsCanvasInitialized] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [renderMode, setRenderMode] = useState<RenderMode | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>(
    'pan',
  );

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

  return (
    <div className="board" data-testid="board">
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
        {isCanvasInitialized ? 'Initialized' : 'Not initialized'}
      </div>

      <div
        ref={containerRef}
        style={{
          width: '800px',
          height: '600px',
          border: '1px solid #ccc',
          position: 'relative',
          overflow: 'hidden', // Prevent scrollbars on container
        }}
        data-testid="canvas-container"
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            touchAction: 'none', // Prevent default touch behaviors
          }}
          data-testid="board-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
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
    </div>
  );
}

export default Board;
