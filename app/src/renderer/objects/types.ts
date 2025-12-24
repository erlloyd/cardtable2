import type { Graphics, Text, TextOptions } from 'pixi.js';
import type { TableObject, PointerEventData } from '@cardtable2/shared';
import type { BBox } from '../SceneManager';

// Render context provides extra info during rendering
export interface RenderContext {
  isSelected: boolean;
  isHovered: boolean;
  isDragging: boolean;
  cameraScale: number; // Current zoom level for zoom-aware rendering (strokes, effects, etc.)
  createText: (options: TextOptions) => Text; // Helper that automatically applies zoom-aware resolution
}

// Shadow configuration
export interface ShadowConfig {
  width: number;
  height: number;
  shape: 'rect' | 'circle';
  borderRadius: number;
}

// Object capabilities (what actions are supported)
export interface ObjectCapabilities {
  canFlip: boolean; // Toggle face up/down state
  canRotate: boolean; // Rotate object
  canStack: boolean; // Merge with other stacks
  canUnstack: boolean; // Extract cards from stack
  canLock: boolean; // Prevent movement/editing
}

// Behavior interfaces
export type RenderBehavior = (obj: TableObject, ctx: RenderContext) => Graphics;
export type BoundsBehavior = (obj: TableObject) => Omit<BBox, 'id'>;
export type ShadowBehavior = (obj: TableObject) => ShadowConfig;

export interface ObjectBehaviors {
  render: RenderBehavior;
  getBounds: BoundsBehavior;
  getShadowConfig: ShadowBehavior;
  capabilities: ObjectCapabilities;
}

// Event handler types
export type HoverHandler = (obj: TableObject, isHovered: boolean) => void;
export type ClickHandler = (obj: TableObject, event: PointerEventData) => void;
export type DragHandler = (
  obj: TableObject,
  delta: { x: number; y: number },
) => void;
export type DropHandler = (
  zone: TableObject,
  droppedObj: TableObject | null,
) => void;
export type DoubleClickHandler = (
  obj: TableObject,
  event: PointerEventData,
) => void;

export interface EventHandlers {
  onHover?: HoverHandler;
  onClick?: ClickHandler;
  onDrag?: DragHandler;
  onDrop?: DropHandler;
  onDoubleClick?: DoubleClickHandler;
}
