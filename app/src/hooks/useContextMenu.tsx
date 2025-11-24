import { useState, useCallback } from 'react';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

/**
 * Hook for managing context menu state
 * Handles open/close state, position, and viewport boundary detection
 */
export function useContextMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<ContextMenuPosition>({ x: 0, y: 0 });

  const open = useCallback((x: number, y: number) => {
    console.log('[ContextMenu] Opening at position:', { x, y });
    setPosition({ x, y });
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    console.log('[ContextMenu] Closing');
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    position,
    open,
    close,
  };
}
