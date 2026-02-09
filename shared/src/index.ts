// Shared types and utilities will go here

// Example: Common types that will be shared between app and server
export const CARDTABLE_VERSION = '2.0.0';

// Content System Types (Asset Packs, Scenarios, Cards, etc.)
export * from './content-types';

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

// ============================================================================
// On-Card Attachment System
// ============================================================================

/**
 * Attachment data structure stored in _meta.attachments
 * Each card/stack can have multiple attachments of each type
 *
 * Attachment types are completely defined by game asset packs:
 * - tokenTypes: defines available token types with images (e.g., threat, damage)
 * - statusTypes: defines available status effects with styling (e.g., stunned, confused)
 * - modifierStats: defines available stat modifiers with colors (e.g., ATK, THW, DEF)
 * - iconTypes: defines available icons with images (e.g., retaliate, guard)
 *
 * This keeps the core system game-agnostic - all game-specific types come from plugins.
 */
export interface AttachmentData {
  /** Token quantities by token type code (e.g., { threat: 3, damage: 5 }) */
  tokens?: Record<string, number>;
  /** Active status effects by status type code (e.g., ["stunned", "confused"]) */
  status?: string[];
  /** Stat modifiers by stat code (e.g., { THW: 1, ATK: -1 }) */
  modifiers?: Record<string, number>;
  /** Active icons by icon type code (e.g., ["retaliate", "guard"]) */
  icons?: string[];
}

// Position in world coordinates
export interface Position {
  x: number;
  y: number;
  r: number; // rotation in degrees
}

/**
 * Validates that a Position contains valid finite numbers.
 *
 * Returns false if any coordinate is NaN, Infinity, or not a number.
 * This prevents corrupted position data from breaking scene rendering.
 *
 * @param pos - Position to validate
 * @returns true if all coordinates are valid finite numbers
 */
export function isValidPosition(
  pos: Position | null | undefined,
): pos is Position {
  if (!pos || typeof pos !== 'object') {
    return false;
  }
  return (
    Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.r)
  );
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

// Type definition for Y.Map properties (M3.6-T1)
// This type represents the structure of properties stored in Y.Map<TableObjectProps>
// and supports all possible object kinds (stack, token, zone, mat, counter)
export type TableObjectProps = {
  _kind: ObjectKind;
  _containerId: string | null;
  _pos: Position;
  _sortKey: string;
  _locked: boolean;
  _selectedBy: string | null;
  _meta: Record<string, unknown>;
  // Stack-specific properties (when _kind === ObjectKind.Stack)
  _cards?: string[];
  _faceUp?: boolean;
  // Token-specific properties (when _kind === ObjectKind.Token)
  // (uses _faceUp from above)
};

// Stack-specific properties (when _kind === ObjectKind.Stack)
export interface StackObject extends TableObject {
  _kind: ObjectKind.Stack;
  _cards: string[]; // Array of card IDs in the stack (top to bottom)
  _faceUp: boolean; // Whether stack is face-up or face-down
}

// Token-specific properties (when _kind === ObjectKind.Token)
export interface TokenObject extends TableObject {
  _kind: ObjectKind.Token;
  _faceUp: boolean; // Whether token is face-up or face-down
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
  // Multi-select mode flag (for touch devices)
  // When true, touch events behave like Cmd/Ctrl is held for selection toggling
  // but should NOT trigger rectangle selection on empty space
  multiSelectModeActive?: boolean;
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
  | { type: 'flush'; pendingOperations?: number } // For E2E tests: wait for renderer to process all pending updates
  | {
      type: 'check-animation-state'; // For E2E tests: query animation state
      visualId?: string; // Optional: check specific visual (if omitted, checks any animations)
      animationType?: string; // Optional: check specific animation type
    }
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
  | { type: 'set-grid-snap-enabled'; enabled: boolean }
  | {
      type: 'set-game-assets';
      assets: import('./content-types').GameAssets | null;
    }
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
    }
  | { type: 'request-screen-coords'; ids: string[] }; // M3.5.1-T6: Request screen coordinates for objects

// Messages sent from renderer to main thread
export type RendererToMainMessage =
  | { type: 'pong'; data: string }
  | { type: 'echo-response'; data: string }
  | { type: 'ready' }
  | { type: 'initialized' }
  | { type: 'flushed' } // Response to flush: all pending updates processed
  | {
      type: 'animation-state'; // Response to check-animation-state
      isAnimating: boolean;
      visualId?: string;
      animationType?: string;
    }
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
      screenCoords: Array<{
        id: string;
        x: number; // DOM coordinates (center of object)
        y: number; // DOM coordinates (center of object)
        width: number; // Object width in DOM pixels
        height: number; // Object height in DOM pixels
      }>;
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
    }
  | {
      type: 'screen-coords'; // M3.5.1-T6: Response to request-screen-coords
      screenCoords: Array<{
        id: string;
        x: number; // DOM coordinates (center of object)
        y: number; // DOM coordinates (center of object)
        width: number; // Object width in DOM pixels
        height: number; // Object height in DOM pixels
      }>;
    }
  | { type: 'pan-started' } // M3.5.1-T6: Camera pan started
  | { type: 'pan-ended' } // M3.5.1-T6: Camera pan ended
  | { type: 'zoom-started' } // M3.5.1-T6: Zoom started (wheel or pinch)
  | { type: 'zoom-ended' } // M3.5.1-T6: Zoom ended
  | { type: 'object-drag-started' } // M3.5.1-T6: Object drag started
  | { type: 'object-drag-ended' } // M3.5.1-T6: Object drag ended
  | {
      type: 'stack-objects'; // Stack operations: merge multiple stacks into target
      ids: string[]; // Source stack IDs to merge
      targetId: string; // Target stack ID
    }
  | {
      type: 'unstack-card'; // Unstack operation: extract top card from stack
      stackId: string; // Source stack ID
      pos: Position; // Position for new single-card stack
    }
  | {
      type: 'object-hovered'; // Hover state changed (for card preview)
      objectId: string | null; // Object being hovered, or null if hover cleared
      isFaceUp: boolean; // Whether the object is face-up (only relevant for stacks)
      cardScreenWidth?: number; // Card's rendered width in screen pixels (for zoom threshold check)
      cardScreenHeight?: number; // Card's rendered height in screen pixels (for zoom threshold check)
    }
  | {
      type: 'cursor-style'; // Request cursor style change
      style: 'default' | 'pointer' | 'grab' | 'grabbing';
    }
  | {
      type: 'show-card-preview-modal'; // Show card preview in modal (mobile double-tap)
      objectId: string; // Object ID to preview
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
