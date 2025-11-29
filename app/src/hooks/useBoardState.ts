import { useState } from 'react';

export interface UseBoardStateResult {
  // Renderer state
  isReady: boolean;
  setIsReady: (ready: boolean) => void;
  isCanvasInitialized: boolean;
  setIsCanvasInitialized: (initialized: boolean) => void;

  // Debug state
  messages: string[];
  addMessage: (msg: string) => void;
  debugCoords: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }> | null;
  setDebugCoords: (
    coords: Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }> | null,
  ) => void;

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

/**
 * Hook for managing Board component state
 *
 * Centralizes all useState declarations for Board component.
 * Handles both internal and external state management for interaction modes.
 *
 * @param externalInteractionMode - Optional external interaction mode (for GlobalMenuBar integration)
 * @param onInteractionModeChange - Optional callback for interaction mode changes
 * @param externalIsMultiSelectMode - Optional external multi-select mode (for GlobalMenuBar integration)
 * @param onMultiSelectModeChange - Optional callback for multi-select mode changes
 * @returns All board state and setters
 */
export function useBoardState(
  externalInteractionMode?: 'pan' | 'select',
  onInteractionModeChange?: (mode: 'pan' | 'select') => void,
  externalIsMultiSelectMode?: boolean,
  onMultiSelectModeChange?: (enabled: boolean) => void,
): UseBoardStateResult {
  // Renderer state
  const [isReady, setIsReady] = useState(false);
  const [isCanvasInitialized, setIsCanvasInitialized] = useState(false);

  // Debug state
  const [messages, setMessages] = useState<string[]>([]);
  const [debugCoords, setDebugCoords] = useState<Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }> | null>(null);

  // Camera state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isWaitingForCoords, setIsWaitingForCoords] = useState(false);

  // Interaction modes (internal state)
  const [internalInteractionMode, setInternalInteractionMode] = useState<
    'pan' | 'select'
  >('pan');
  const [internalIsMultiSelectMode, setInternalIsMultiSelectMode] =
    useState(false);

  // Awareness
  const [awarenessHz, setAwarenessHz] = useState<number>(0);

  // Sync state
  const [isSynced, setIsSynced] = useState(false);

  // Use external modes if provided (for GlobalMenuBar integration)
  const interactionMode = externalInteractionMode ?? internalInteractionMode;
  const setInteractionMode =
    onInteractionModeChange ?? setInternalInteractionMode;
  const isMultiSelectMode =
    externalIsMultiSelectMode ?? internalIsMultiSelectMode;
  const setIsMultiSelectMode =
    onMultiSelectModeChange ?? setInternalIsMultiSelectMode;

  // Helper to add a message to the messages array
  const addMessage = (msg: string) => {
    setMessages((prev) => [...prev, msg]);
  };

  return {
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
    interactionMode,
    setInteractionMode,
    isMultiSelectMode,
    setIsMultiSelectMode,
    awarenessHz,
    setAwarenessHz,
    isSynced,
    setIsSynced,
  };
}
