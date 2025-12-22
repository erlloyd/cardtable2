import type { Application, Container } from 'pixi.js';
import type {
  RendererToMainMessage,
  InteractionMode,
} from '@cardtable2/shared';
import type { RenderMode } from './IRendererAdapter';
import type {
  AnimationManager,
  CoordinateConverter,
  CameraManager,
  GestureRecognizer,
  SelectionManager,
  DragManager,
  HoverManager,
  SelectionRectangleManager,
  AwarenessManager,
  VisualManager,
  GridSnapManager,
} from './managers';
import type { SceneManager } from './SceneManager';

/**
 * Context passed to all message handlers
 *
 * Provides access to:
 * - PixiJS app and world container
 * - All managers (camera, gestures, selection, etc.)
 * - Communication channel (postResponse)
 * - Mutable state (interactionMode)
 *
 * This context enables handlers to be pure functions that receive
 * all dependencies explicitly rather than accessing globals or
 * maintaining their own state.
 *
 * @example
 * ```typescript
 * export function handlePointerDown(
 *   message: Extract<MainToRendererMessage, { type: 'pointer-down' }>,
 *   context: RendererContext
 * ): void {
 *   const worldPos = context.camera.toWorld(message.event.clientX, message.event.clientY);
 *   const hit = context.sceneManager.hitTest(worldPos.x, worldPos.y);
 *   // ...
 * }
 * ```
 */
export interface RendererContext {
  // PixiJS
  app: Application;
  worldContainer: Container;
  renderMode: RenderMode;

  // Managers
  animation: AnimationManager;
  coordConverter: CoordinateConverter;
  camera: CameraManager;
  gestures: GestureRecognizer;
  selection: SelectionManager;
  drag: DragManager;
  hover: HoverManager;
  rectangleSelect: SelectionRectangleManager;
  awareness: AwarenessManager;
  visual: VisualManager;
  gridSnap: GridSnapManager;
  sceneManager: SceneManager;

  // Communication
  postResponse: (message: RendererToMainMessage) => void;

  // Debounced functions
  debouncedZoomEnd: () => void;

  // Mutable state (handlers can update)
  interactionMode: InteractionMode;
  gridSnapEnabled: boolean;
}
