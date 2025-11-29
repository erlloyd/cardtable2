import { useEffect, useRef } from 'react';
import type { IRendererAdapter } from '../renderer/IRendererAdapter';
import { RenderMode } from '../renderer/IRendererAdapter';
import type { YjsStore } from '../store/YjsStore';
import type {
  MainToRendererMessage,
  WheelEventData,
} from '@cardtable2/shared';

/**
 * Hook for managing canvas lifecycle
 *
 * Handles canvas initialization, resize, and wheel events.
 * - Initializes canvas (transfers to OffscreenCanvas if worker mode)
 * - Sends init message to renderer with actor ID
 * - Handles canvas resize (ResizeObserver)
 * - Handles wheel events (prevents default, forwards to renderer)
 *
 * @param canvasRef - Canvas element ref
 * @param containerRef - Container element ref
 * @param renderer - Renderer instance
 * @param renderMode - Render mode (worker or main-thread)
 * @param store - Yjs store instance
 * @param isReady - Whether renderer is ready
 * @param isCanvasInitialized - Whether canvas is initialized
 * @param addMessage - Function to add message to debug UI
 */
export function useCanvasLifecycle(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  renderer: IRendererAdapter | null,
  renderMode: RenderMode | null,
  store: YjsStore,
  isReady: boolean,
  isCanvasInitialized: boolean,
  addMessage: (msg: string) => void,
): void {
  const canvasTransferredRef = useRef(false);

  // Wheel event listener
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const wheelHandler = (event: WheelEvent) => {
      if (!renderer || !isCanvasInitialized) return;

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
      renderer.sendMessage(message);
    };

    // Add with passive: false to allow preventDefault
    canvas.addEventListener('wheel', wheelHandler, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', wheelHandler);
    };
  }, [canvasRef, renderer, isCanvasInitialized]);

  // Canvas initialization
  useEffect(() => {
    // Wait for renderer to be ready
    if (
      !isReady ||
      !canvasRef.current ||
      !renderer ||
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
        console.log(
          '[useCanvasLifecycle] Transferring canvas to OffscreenCanvas...',
        );
        canvasToSend = canvas.transferControlToOffscreen();
        console.log('[useCanvasLifecycle] ✓ Canvas transferred successfully');
        addMessage('Canvas transferred to worker');
      } else {
        // Main-thread mode: use canvas directly
        console.log(
          '[useCanvasLifecycle] Using canvas directly (NO OffscreenCanvas)',
        );
        canvasToSend = canvas;
        console.log(
          '[useCanvasLifecycle] ✓ Canvas ready for main-thread rendering',
        );
        addMessage('Canvas using main thread');
      }

      const message: MainToRendererMessage = {
        type: 'init',
        canvas: canvasToSend,
        width,
        height,
        dpr,
        actorId: store.getActorId(),
      };

      console.log('[useCanvasLifecycle] Sending init message to renderer...');
      renderer.sendMessage(message);
      console.log('[useCanvasLifecycle] ✓ Init message sent');

      // Debug: Check canvas DOM size after init
      setTimeout(() => {
        console.log('[useCanvasLifecycle] Canvas element check:');
        console.log(
          '[useCanvasLifecycle] - canvas.width (attribute):',
          canvas.width,
        );
        console.log(
          '[useCanvasLifecycle] - canvas.height (attribute):',
          canvas.height,
        );
        console.log(
          '[useCanvasLifecycle] - canvas.style.width:',
          canvas.style.width,
        );
        console.log(
          '[useCanvasLifecycle] - canvas.style.height:',
          canvas.style.height,
        );
        console.log(
          '[useCanvasLifecycle] - canvas.clientWidth:',
          canvas.clientWidth,
        );
        console.log(
          '[useCanvasLifecycle] - canvas.clientHeight:',
          canvas.clientHeight,
        );
      }, 100);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[useCanvasLifecycle] ✗ Canvas init error:', errorMsg);
      addMessage(`Canvas init error: ${errorMsg}`);
      canvasTransferredRef.current = false; // Reset on error
    }
  }, [canvasRef, renderer, renderMode, store, isReady, addMessage]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !renderer || !isCanvasInitialized) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const dpr = window.devicePixelRatio || 1;
        const width = entry.contentRect.width * dpr;
        const height = entry.contentRect.height * dpr;

        // Send resize message to renderer
        const message: MainToRendererMessage = {
          type: 'resize',
          width,
          height,
          dpr,
        };
        renderer.sendMessage(message);
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [canvasRef, containerRef, renderer, isCanvasInitialized]);
}
