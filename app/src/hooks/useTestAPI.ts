import { useEffect, useCallback } from 'react';
import type { IRendererAdapter } from '../renderer/IRendererAdapter';
import type { MainToRendererMessage } from '@cardtable2/shared';

export interface TestAPI {
  waitForRenderer: () => Promise<void>;
  waitForSelectionSettled: () => Promise<void>;
}

/**
 * Hook for exposing test API to E2E tests
 *
 * Provides functions for E2E tests to wait for async operations:
 * - waitForRenderer: Waits for renderer to process all pending messages
 * - waitForSelectionSettled: Waits for selection operation to complete
 *
 * Only exposes API in dev mode with debug UI enabled.
 *
 * @param renderer - Renderer instance
 * @param isCanvasInitialized - Whether canvas is initialized
 * @param showDebugUI - Whether debug UI is enabled
 * @param flushCallbacks - Ref to flush callbacks array
 * @param selectionSettledCallbacks - Ref to selection settled callbacks array
 * @returns Test API functions
 */
export function useTestAPI(
  renderer: IRendererAdapter | null,
  isCanvasInitialized: boolean,
  showDebugUI: boolean,
  flushCallbacks: React.MutableRefObject<Array<() => void>>,
  selectionSettledCallbacks: React.MutableRefObject<Array<() => void>>,
): TestAPI {
  // Wait for renderer to process all pending messages
  const waitForRenderer = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (!renderer || !isCanvasInitialized) {
        resolve();
        return;
      }

      // Register callback for 'flushed' response
      flushCallbacks.current.push(resolve);

      // Send flush message
      console.log('[useTestAPI] waitForRenderer() called');
      const message: MainToRendererMessage = {
        type: 'flush',
      };
      renderer.sendMessage(message);
    });
  }, [renderer, isCanvasInitialized, flushCallbacks]);

  // Wait for selection to settle after synthetic pointer events
  const waitForSelectionSettled = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      console.log(
        '[useTestAPI] waitForSelectionSettled: Registering callback for selection',
      );
      selectionSettledCallbacks.current.push(resolve);
    });
  }, [selectionSettledCallbacks]);

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
  }, [showDebugUI, waitForRenderer, waitForSelectionSettled]);

  return {
    waitForRenderer,
    waitForSelectionSettled,
  };
}
