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

  // Cursor style
  cursorStyle: 'default' | 'pointer' | 'grab' | 'grabbing';
  setCursorStyle: (style: 'default' | 'pointer' | 'grab' | 'grabbing') => void;

  // Interaction modes
  interactionMode: 'pan' | 'select';
  setInteractionMode: (mode: 'pan' | 'select') => void;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (enabled: boolean) => void;
  gridSnapEnabled: boolean;
  setGridSnapEnabled: (enabled: boolean) => void;

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
 * @param externalGridSnapEnabled - Optional external grid snap enabled state (for GlobalMenuBar integration)
 * @param onGridSnapEnabledChange - Optional callback for grid snap enabled changes
 * @returns All board state and setters
 */
export function useBoardState(
  externalInteractionMode?: 'pan' | 'select',
  onInteractionModeChange?: (mode: 'pan' | 'select') => void,
  externalIsMultiSelectMode?: boolean,
  onMultiSelectModeChange?: (enabled: boolean) => void,
  externalGridSnapEnabled?: boolean,
  onGridSnapEnabledChange?: (enabled: boolean) => void,
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

  // Cursor style
  const [cursorStyle, setCursorStyle] = useState<
    'default' | 'pointer' | 'grab' | 'grabbing'
  >('default');

  // Interaction modes (internal state)
  const [internalInteractionMode, setInternalInteractionMode] = useState<
    'pan' | 'select'
  >('pan');
  const [internalIsMultiSelectMode, setInternalIsMultiSelectMode] =
    useState(false);
  const [internalGridSnapEnabled, setInternalGridSnapEnabled] = useState(false);

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
  const gridSnapEnabled = externalGridSnapEnabled ?? internalGridSnapEnabled;
  const setGridSnapEnabled =
    onGridSnapEnabledChange ?? setInternalGridSnapEnabled;

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
    cursorStyle,
    setCursorStyle,
    interactionMode,
    setInteractionMode,
    isMultiSelectMode,
    setIsMultiSelectMode,
    gridSnapEnabled,
    setGridSnapEnabled,
    awarenessHz,
    setAwarenessHz,
    isSynced,
    setIsSynced,
  };
}
