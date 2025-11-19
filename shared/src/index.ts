// Shared types and utilities will go here

// Example: Common types that will be shared between app and server
export const CARDTABLE_VERSION = '2.0.0';

// Object types on the table
// Note: Every card or group of cards is a 'stack' (even a single card is a stack of 1)
// Object kind enum for type-safe comparisons
export enum ObjectKind {
  Stack = 'stack',
  Token = 'token',
  Zone = 'zone',
  Mat = 'mat',
  Counter = 'counter',
}

// Position in world coordinates
export interface Position {
  x: number;
  y: number;
  r: number; // rotation in degrees
}

// Placeholder for Set JSON types (from MVP plan)
export interface SetJson {
  schema: 'ct-set@1';
  id: string;
  name: string;
  version: string;
  // TODO: Add full type definitions based on MVP plan
}

// Placeholder for Y.Doc object types
export interface TableObject {
  _kind: ObjectKind;
  _containerId: string | null; // ID of container (e.g., zone) this object is in
  _pos: Position; // Position in absolute world coordinates
  _sortKey: string; // Fractional index for z-ordering
  _locked: boolean;
  _selectedBy: string | null; // Actor ID who has this selected (exclusive)
  _meta: Record<string, unknown>; // Freeform metadata
}

// Stack-specific properties (when _kind === ObjectKind.Stack)
export interface StackObject extends TableObject {
  _kind: ObjectKind.Stack;
  _cards: string[]; // Array of card IDs in the stack (top to bottom)
  _faceUp: boolean; // Whether stack is face-up or face-down
}

// ============================================================================
// Renderer Message Types (M2-T1, M2-T2, M2-T3, M2-T6)
// ============================================================================

// Pointer event data (M2-T3)
export interface PointerEventData {
  pointerId: number;
  pointerType: 'mouse' | 'pen' | 'touch';
  clientX: number;
  clientY: number;
  button?: number;
  buttons?: number;
  isPrimary: boolean;
  // Modifier keys for multi-select support
  metaKey: boolean; // Cmd on Mac, Windows key on Windows
  ctrlKey: boolean; // Ctrl key
  shiftKey: boolean; // Shift key (for future range select)
}

// Wheel event data (M2-T3)
export interface WheelEventData {
  deltaY: number;
  clientX: number;
  clientY: number;
}

// Interaction mode for pan/select toggle
export type InteractionMode = 'pan' | 'select';

// Messages sent from main thread to renderer (worker or main thread)
export type MainToRendererMessage =
  | { type: 'ping'; data: string }
  | { type: 'echo'; data: string }
  | {
      type: 'init';
      canvas: OffscreenCanvas | HTMLCanvasElement;
      width: number;
      height: number;
      dpr: number;
      actorId: string; // Actor ID for deriving selection state (M3-T3)
    }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'test-animation' }
  | { type: 'set-interaction-mode'; mode: InteractionMode }
  | { type: 'pointer-down'; event: PointerEventData }
  | { type: 'pointer-move'; event: PointerEventData }
  | { type: 'pointer-up'; event: PointerEventData }
  | { type: 'pointer-cancel'; event: PointerEventData }
  | { type: 'pointer-leave' } // Cursor left canvas (M3-T4)
  | { type: 'wheel'; event: WheelEventData }
  | {
      type: 'sync-objects';
      objects: Array<{ id: string; obj: TableObject }>;
    }
  | {
      type: 'objects-added';
      objects: Array<{ id: string; obj: TableObject }>;
    }
  | {
      type: 'objects-updated';
      objects: Array<{ id: string; obj: TableObject }>;
    }
  | { type: 'objects-removed'; ids: Array<string> }
  | { type: 'clear-objects' }
  | {
      type: 'awareness-update'; // M3-T4: Remote awareness states
      states: Array<{
        clientId: number;
        state: AwarenessState;
      }>;
    };

// Messages sent from renderer to main thread
export type RendererToMainMessage =
  | { type: 'pong'; data: string }
  | { type: 'echo-response'; data: string }
  | { type: 'ready' }
  | { type: 'initialized' }
  | { type: 'error'; error: string; context?: string }
  | { type: 'warning'; message: string }
  | { type: 'animation-complete' }
  | {
      type: 'objects-moved';
      updates: Array<{ id: string; pos: Position }>;
    }
  | {
      type: 'objects-selected';
      ids: string[];
    }
  | {
      type: 'objects-unselected';
      ids: string[];
    }
  | {
      type: 'cursor-position'; // M3-T4: Cursor position in world coordinates
      x: number;
      y: number;
    }
  | {
      type: 'drag-state-update'; // M5-T1: Drag awareness
      gid: string;
      primaryId: string; // primary object ID
      pos: Position; // primary object position
      secondaryOffsets?: Record<string, { dx: number; dy: number; dr: number }>; // offsets by object ID
    }
  | { type: 'drag-state-clear' } // M5-T1: Clear drag awareness
  | {
      type: 'awareness-update-rate'; // M5-T1: Awareness update frequency monitoring
      hz: number; // Updates per second
    };

// ============================================================================
// Yjs Document Schema (M3-T1)
// ============================================================================

/**
 * Y.Doc document structure for table state.
 * Root contains:
 * - objects: Y.Map<string, Y.Map> keyed by object ID
 */
export interface YDocSchema {
  objects: Map<string, TableObject>;
}

/**
 * Actor ID format: random UUID v4
 * Used for _selectedBy and awareness tracking
 */
export type ActorId = string;

/**
 * Awareness state for real-time collaboration (M3-T4)
 * Updated at 30Hz, ephemeral (not persisted)
 */
export interface AwarenessState {
  actorId: ActorId;
  cursor?: {
    x: number;
    y: number;
  };
  drag?: {
    gid: string; // gesture ID
    primaryId: string; // primary object ID (the one being dragged)
    pos: { x: number; y: number; r: number }; // absolute world position (primary object)
    secondaryOffsets?: Record<string, { dx: number; dy: number; dr: number }>; // offsets of secondary objects by ID
    ts: number; // timestamp
    // Note: Uses absolute position instead of anchor+deltas for simplicity and resilience
    // to dropped frames. Receiving clients render ghost at this exact position.
  };
  hover?: string; // object ID being hovered
  lasso?: {
    // rectangle selection
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  toolMode?: 'pan' | 'select' | 'card' | 'token' | 'zone';
}
