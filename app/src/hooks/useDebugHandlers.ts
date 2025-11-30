import { useCallback } from 'react';
import type { IRendererAdapter } from '../renderer/IRendererAdapter';
import type { MainToRendererMessage } from '@cardtable2/shared';

export interface DebugHandlers {
  handlePing: () => void;
  handleEcho: () => void;
  handleAnimation: () => void;
}

/**
 * Hook for providing debug message handlers
 *
 * Provides functions for debug UI buttons (ping, echo, test animation).
 * Handlers do nothing if renderer is null.
 *
 * @param renderer - Renderer instance
 * @param tableId - Table ID for ping message
 * @param addMessage - Function to add message to debug UI
 * @returns Debug handler functions
 */
export function useDebugHandlers(
  renderer: IRendererAdapter | null,
  tableId: string,
  addMessage: (msg: string) => void,
): DebugHandlers {
  const handlePing = useCallback(() => {
    if (!renderer) return;

    const message: MainToRendererMessage = {
      type: 'ping',
      data: `Hello from table ${tableId}`,
    };
    renderer.sendMessage(message);
  }, [renderer, tableId]);

  const handleEcho = useCallback(() => {
    if (!renderer) return;

    const message: MainToRendererMessage = {
      type: 'echo',
      data: `Echo test at ${new Date().toLocaleTimeString()}`,
    };
    renderer.sendMessage(message);
  }, [renderer]);

  const handleAnimation = useCallback(() => {
    if (!renderer) return;

    const message: MainToRendererMessage = {
      type: 'test-animation',
    };
    renderer.sendMessage(message);
    addMessage('Starting animation...');
  }, [renderer, addMessage]);

  return {
    handlePing,
    handleEcho,
    handleAnimation,
  };
}
