import { useCallback } from 'react';
import type { IRendererAdapter } from '../renderer/IRendererAdapter';
import type { YjsStore } from '../store/YjsStore';
import type { PointerEventData, MainToRendererMessage } from '@cardtable2/shared';
import type { ThrottledFunction } from '../utils/throttle';

export interface PointerEventHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  onPointerCancel: (event: React.PointerEvent) => void;
  onPointerLeave: () => void;
}

/**
 * Hook for handling pointer events and forwarding to renderer
 *
 * Serializes pointer events (React.PointerEvent → PointerEventData).
 * Applies multi-select mode to touch events.
 * Converts to canvas-relative coordinates (accounts for DPR).
 * Returns pointer event handlers for canvas element.
 *
 * @param canvasRef - Canvas element ref
 * @param renderer - Renderer instance
 * @param store - Yjs store instance
 * @param isCanvasInitialized - Whether canvas is initialized
 * @param isMultiSelectMode - Whether multi-select mode is enabled
 * @param throttledCursorUpdate - Throttled cursor update function ref
 * @returns Pointer event handlers
 */
export function usePointerEvents(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  renderer: IRendererAdapter | null,
  store: YjsStore,
  isCanvasInitialized: boolean,
  isMultiSelectMode: boolean,
  throttledCursorUpdate: React.MutableRefObject<
    ThrottledFunction<(x: number, y: number) => void>
  >,
): PointerEventHandlers {
  // Helper to serialize pointer events
  const serializePointerEvent = useCallback(
    (event: React.PointerEvent): PointerEventData => {
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
    },
    [canvasRef, isMultiSelectMode],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!renderer || !isCanvasInitialized) return;

      // Ignore right-click (button 2) - context menu handles this
      if (event.button === 2) {
        return;
      }

      const message: MainToRendererMessage = {
        type: 'pointer-down',
        event: serializePointerEvent(event),
      };
      renderer.sendMessage(message);
    },
    [renderer, isCanvasInitialized, serializePointerEvent],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!renderer || !isCanvasInitialized) return;

      const message: MainToRendererMessage = {
        type: 'pointer-move',
        event: serializePointerEvent(event),
      };
      renderer.sendMessage(message);
    },
    [renderer, isCanvasInitialized, serializePointerEvent],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (!renderer || !isCanvasInitialized) return;

      const message: MainToRendererMessage = {
        type: 'pointer-up',
        event: serializePointerEvent(event),
      };
      renderer.sendMessage(message);
    },
    [renderer, isCanvasInitialized, serializePointerEvent],
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent) => {
      if (!renderer || !isCanvasInitialized) return;

      const message: MainToRendererMessage = {
        type: 'pointer-cancel',
        event: serializePointerEvent(event),
      };
      renderer.sendMessage(message);
    },
    [renderer, isCanvasInitialized, serializePointerEvent],
  );

  const handlePointerLeave = useCallback(() => {
    if (!renderer || !isCanvasInitialized) return;

    // Cancel any pending throttled updates
    throttledCursorUpdate.current.cancel();

    // Clear cursor from awareness
    store.clearCursor();

    // Notify renderer
    const message: MainToRendererMessage = {
      type: 'pointer-leave',
    };
    renderer.sendMessage(message);
  }, [renderer, isCanvasInitialized, throttledCursorUpdate, store]);

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onPointerLeave: handlePointerLeave,
  };
}
