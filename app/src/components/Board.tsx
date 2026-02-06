import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ObjectKind,
  type PointerEventData,
  type Card,
  type StackObject,
} from '@cardtable2/shared';
import type { YjsStore } from '../store/YjsStore';
import type { ActionContext } from '../actions/types';
import type { GameAssets } from '../content';
import { throttle, AWARENESS_UPDATE_INTERVAL_MS } from '../utils/throttle';
import { getCardOrientation } from '../content/utils';
import {
  getPreviewDimensions,
  getLandscapeDimensions,
  DEFAULT_PREVIEW_SIZE,
} from '../constants/previewSizes';

// Hooks
import { useRenderer } from '../hooks/useRenderer';
import { useBoardState } from '../hooks/useBoardState';
import { useStoreSync } from '../hooks/useStoreSync';
import { useAwarenessSync } from '../hooks/useAwarenessSync';
import { usePointerEvents } from '../hooks/usePointerEvents';
import { useCanvasLifecycle } from '../hooks/useCanvasLifecycle';
import { useTestAPI } from '../hooks/useTestAPI';
import { useDebugHandlers } from '../hooks/useDebugHandlers';

// Message Bus
import { BoardMessageBus } from './Board/BoardMessageBus';

// UI Components
import {
  DebugPanel,
  InteractionModeToggle,
  MultiSelectToggle,
} from './Board/components';
import { ActionHandle } from './ActionHandle';
import { CardPreview } from './CardPreview';

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
  gridSnapEnabled?: boolean;
  onGridSnapEnabledChange?: (enabled: boolean) => void;
  actionContext?: ActionContext | null;
  onActionExecuted?: (actionId: string) => void;
  gameAssets?: GameAssets | null;
}

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
  gridSnapEnabled: externalGridSnapEnabled,
  onGridSnapEnabledChange,
  actionContext,
  onActionExecuted,
  gameAssets,
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

  // Callback refs
  const flushCallbacksRef = useRef<Array<() => void>>([]);
  const selectionSettledCallbacksRef = useRef<Array<() => void>>([]);
  const animationStateCallbacksRef = useRef<
    Array<(isAnimating: boolean) => void>
  >([]);

  // Card preview state (hover mode)
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const [previewPosition, setPreviewPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const lastCursorPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Modal preview state (mobile double-tap)
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalPreviewCard, setModalPreviewCard] = useState<Card | null>(null);
  const modalOpenTimeRef = useRef<number>(0);
  const IGNORE_GESTURES_MS = 300; // Match DOUBLE_TAP_THRESHOLD

  // Custom hooks
  const { renderer, renderMode } = useRenderer('auto');

  const {
    isReady,
    setIsReady,
    isCanvasInitialized,
    setIsCanvasInitialized,
    messages,
    addMessage,
    debugCoords,
    setDebugCoords,
    isCameraActive,
    setIsCameraActive,
    isWaitingForCoords,
    setIsWaitingForCoords,
    cursorStyle,
    setCursorStyle,
    interactionMode,
    setInteractionMode,
    isMultiSelectMode,
    setIsMultiSelectMode,
    gridSnapEnabled,
    awarenessHz,
    setAwarenessHz,
    isSynced,
    setIsSynced,
  } = useBoardState(
    externalInteractionMode,
    onInteractionModeChange,
    externalIsMultiSelectMode,
    onMultiSelectModeChange,
    externalGridSnapEnabled,
    onGridSnapEnabledChange,
  );

  // Helper: Get card from stack object
  const getCardFromStack = useCallback(
    (objectId: string): Card | null => {
      const obj = storeRef.current.getObject(objectId);
      if (!obj || obj._kind !== ObjectKind.Stack) {
        return null;
      }

      const stackObj = obj as StackObject;
      if (!stackObj._cards || stackObj._cards.length === 0) {
        return null;
      }

      const topCardCode = stackObj._cards[0];
      return gameAssets?.cards[topCardCode] ?? null;
    },
    [gameAssets],
  );

  // Handle hover state changes from renderer (for card preview)
  const setHoveredObject = useCallback(
    (objectId: string | null, isFaceUp: boolean) => {
      // Clear any pending hover timer
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }

      // If hover cleared or not face-up, hide preview
      if (!objectId || !isFaceUp) {
        setPreviewCard(null);
        setPreviewPosition(null);
        return;
      }

      // Get the card using helper
      const card = getCardFromStack(objectId);
      if (!card || !gameAssets) {
        return;
      }

      // Calculate preview dimensions based on card orientation
      const orientation = getCardOrientation(card, gameAssets);
      const isLandscape = orientation === 'landscape';
      let dimensions = getPreviewDimensions(DEFAULT_PREVIEW_SIZE);
      if (isLandscape) {
        dimensions = getLandscapeDimensions(dimensions);
      }

      // Calculate viewport-aware position
      const cursorPos = lastCursorPosRef.current;
      const offset = 20; // Default offset from cursor
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Default: position to right and below cursor
      let x = cursorPos.x + offset;
      let y = cursorPos.y + offset;

      // If preview would overflow right edge, flip to left of cursor
      if (x + dimensions.width > viewportWidth) {
        x = cursorPos.x - dimensions.width - offset;
      }

      // If preview would overflow bottom edge, flip above cursor
      if (y + dimensions.height > viewportHeight) {
        y = cursorPos.y - dimensions.height - offset;
      }

      // Ensure preview doesn't go off left or top edge
      x = Math.max(offset, x);
      y = Math.max(offset, y);

      setPreviewPosition({ x, y });
      setPreviewCard(card);
    },
    [gameAssets, getCardFromStack],
  );

  // Handle modal preview request from renderer (mobile double-tap)
  const showCardPreviewModal = useCallback(
    (objectId: string) => {
      // Get the card using helper
      const card = getCardFromStack(objectId);
      if (!card) {
        return;
      }

      modalOpenTimeRef.current = Date.now();
      setModalPreviewCard(card);
      setIsModalVisible(true);
    },
    [getCardFromStack],
  );

  // Track cursor position for preview positioning
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      lastCursorPosRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Message bus
  const messageBus = useMemo(() => new BoardMessageBus(), []);

  // Message handling
  useEffect(() => {
    if (!renderer) return;

    const unsubscribe = renderer.onMessage((message) => {
      const context = {
        renderer,
        store: storeRef.current,
        setIsReady,
        setIsCanvasInitialized,
        setIsSynced,
        setDebugCoords,
        setIsCameraActive,
        setIsWaitingForCoords,
        setAwarenessHz,
        setCursorStyle,
        setHoveredObject,
        showCardPreviewModal,
        addMessage,
        flushCallbacks: flushCallbacksRef,
        selectionSettledCallbacks: selectionSettledCallbacksRef,
        animationStateCallbacks: animationStateCallbacksRef,
        throttledCursorUpdate,
        throttledDragStateUpdate,
      };

      // Fire and forget - message handlers are synchronous
      void messageBus.handleMessage(message, context);
    });

    return unsubscribe;
  }, [
    renderer,
    messageBus,
    setIsReady,
    setIsCanvasInitialized,
    setIsSynced,
    setDebugCoords,
    setIsCameraActive,
    setIsWaitingForCoords,
    setAwarenessHz,
    setCursorStyle,
    setHoveredObject,
    showCardPreviewModal,
    addMessage,
  ]);

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
    addMessage,
  );

  // Apply cursor style to canvas
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.style.cursor = cursorStyle;
    }
  }, [cursorStyle]);

  // Test API
  useTestAPI(
    renderer,
    isCanvasInitialized,
    showDebugUI,
    flushCallbacksRef,
    selectionSettledCallbacksRef,
    animationStateCallbacksRef,
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

  // Send grid snap enabled changes to renderer
  useEffect(() => {
    if (!renderer || !isCanvasInitialized) return;

    renderer.sendMessage({
      type: 'set-grid-snap-enabled',
      enabled: gridSnapEnabled,
    });
  }, [gridSnapEnabled, isCanvasInitialized, renderer]);

  // Send game assets to renderer
  useEffect(() => {
    if (!renderer || !isCanvasInitialized) {
      return;
    }

    renderer.sendMessage({
      type: 'set-game-assets',
      assets: gameAssets ?? null,
    });
  }, [gameAssets, isCanvasInitialized, renderer]);

  // Handle context menu
  const handleCanvasContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();

    if (!renderer || !isCanvasInitialized || !onContextMenu) {
      return;
    }

    // Synthetic pointer ID used for context menu selection events
    const CONTEXT_MENU_POINTER_ID = 999;

    // Simulate a pointer-down/up to trigger selection logic
    const syntheticPointerEvent: PointerEventData = {
      pointerId: CONTEXT_MENU_POINTER_ID,
      pointerType: 'mouse',
      clientX: event.clientX,
      clientY: event.clientY,
      button: 0,
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

    // Send synthetic pointer-down
    renderer.sendMessage({
      type: 'pointer-down',
      event: syntheticPointerEvent,
    });

    // Send synthetic pointer-up immediately
    renderer.sendMessage({
      type: 'pointer-up',
      event: syntheticPointerEvent,
    });

    // Wait for selection to settle, then open context menu
    void (async () => {
      // Wait for selection settled callback
      await new Promise<void>((resolve) => {
        selectionSettledCallbacksRef.current.push(resolve);
      });

      // Count selected objects using Y.Map iteration (M3.6-T5)
      const selectionCount = store.getObjectsSelectedBy(
        store.getActorId(),
      ).length;
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
            onToggle={() =>
              setInteractionMode(interactionMode === 'pan' ? 'select' : 'pan')
            }
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

      {/* Card Preview - Hover Mode */}
      <CardPreview
        card={previewCard}
        gameAssets={gameAssets ?? null}
        mode="hover"
        position={previewPosition ?? undefined}
        onClose={() => {
          setPreviewCard(null);
          setPreviewPosition(null);
          if (hoverTimerRef.current !== null) {
            window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
          }
        }}
      />

      {/* Blurred Overlay - Mobile Double-Tap (rendered via portal to escape stacking context) */}
      {isModalVisible &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[99999] flex items-center justify-center"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 99999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={(e) => {
              // Close modal on backdrop click (after timing threshold to avoid gesture conflicts)
              const elapsed = Date.now() - modalOpenTimeRef.current;
              if (
                elapsed > IGNORE_GESTURES_MS &&
                e.target === e.currentTarget
              ) {
                setIsModalVisible(false);
                setModalPreviewCard(null);
              }
            }}
          >
            {/* Card image */}
            {modalPreviewCard ? (
              <img
                src={modalPreviewCard.face}
                alt="Card preview"
                style={{
                  maxWidth: '90vw',
                  maxHeight: '90vh',
                  borderRadius: '8px',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                }}
              />
            ) : (
              <div
                style={{
                  width: '300px',
                  height: '420px',
                  backgroundColor: '#4a5568',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '16px',
                }}
              >
                Loading...
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export default Board;
