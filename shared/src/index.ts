// Shared types and utilities will go here

// Example: Common types that will be shared between app and server
export const CARDTABLE_VERSION = '2.0.0';

// Object types on the table
// Note: Every card or group of cards is a 'stack' (even a single card is a stack of 1)
export type ObjectKind = 'stack' | 'token' | 'zone' | 'mat' | 'counter';

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

// Stack-specific properties (when _kind === 'stack')
export interface StackObject extends TableObject {
  _kind: 'stack';
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
}

// Wheel event data (M2-T3)
export interface WheelEventData {
  deltaY: number;
  clientX: number;
  clientY: number;
}

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
    }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'test-animation' }
  | { type: 'pointer-down'; event: PointerEventData }
  | { type: 'pointer-move'; event: PointerEventData }
  | { type: 'pointer-up'; event: PointerEventData }
  | { type: 'pointer-cancel'; event: PointerEventData }
  | { type: 'wheel'; event: WheelEventData };

// Messages sent from renderer to main thread
export type RendererToMainMessage =
  | { type: 'pong'; data: string }
  | { type: 'echo-response'; data: string }
  | { type: 'ready' }
  | { type: 'initialized' }
  | { type: 'error'; error: string; context?: string }
  | { type: 'warning'; message: string }
  | { type: 'animation-complete' };
