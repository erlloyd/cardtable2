import type { Text, TextOptions, Container } from 'pixi.js';
import type { TableObject, PointerEventData } from '@cardtable2/shared';
import type { BBox } from '../SceneManager';
import type { GameAssets } from '../../content';
import type { TextureLoader } from '../services/TextureLoader';

// Render context provides extra info during rendering
export interface RenderContext {
  readonly objectId?: string; // ID of the object being rendered - used for triggering visual updates after async operations
  readonly isSelected: boolean; // Whether this object is in the current selection set
  readonly isHovered: boolean; // Whether the pointer is currently over this object
  readonly isDragging: boolean; // Whether this object is being actively dragged
  readonly isStackTarget: boolean; // Whether this stack is a valid drop target for dragged stacks
  readonly minimal?: boolean; // When true, skip decorative elements (badges, 3D effects, handles). Used for ghost previews and simplified rendering.
  readonly cameraScale: number; // Current zoom level (1.0 = 100%, 2.0 = 200%). Use for manual counter-scaling or pass to scaleStrokeWidth helper
  readonly createText: (options: TextOptions) => Text; // Helper that automatically applies zoom-aware resolution (DO NOT create Text objects directly)
  readonly createKindLabel: (text: string) => Text; // Helper that creates a text label with white text and black outline (standard style for object labels)
  readonly scaleStrokeWidth: (baseWidth: number) => number; // Helper that counter-scales stroke widths using sqrt(cameraScale) for visual consistency
  readonly gameAssets?: GameAssets | null; // Game assets (cards, tokens, etc.) for texture loading - undefined during initial render before packs load, null when explicitly unset
  readonly textureLoader?: TextureLoader; // Texture loader service for loading card/token images - optional for backward compatibility
  readonly onTextureLoaded?: (url: string) => void; // Callback invoked when a texture finishes loading - used to trigger visual updates
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
// Note: Always returns Container (PixiJS v8 requirement for addChild() operations)
// Even simple Graphics should be wrapped in a Container for consistency
export type RenderBehavior = (
  obj: TableObject,
  ctx: RenderContext,
) => Container;
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
