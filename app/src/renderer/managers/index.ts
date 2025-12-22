/**
 * Managers Index
 *
 * Exports all manager classes for the hybrid architecture refactor.
 * These managers were extracted from RendererCore to improve separation
 * of concerns and maintainability.
 *
 * Manager responsibilities:
 * - AnimationManager: Generic property animations with easing
 * - AwarenessManager: Remote cursor and drag ghost rendering
 * - CameraManager: Zoom and pan operations
 * - CoordinateConverter: Screen/world/canvas coordinate transformations
 * - DragManager: Object dragging logic and multi-select drag
 * - GestureRecognizer: Pointer event interpretation and gesture detection
 * - GridSnapManager: Local grid snap preview ghosts during drag
 * - HoverManager: Hover state and visual feedback
 * - SelectionManager: Object selection state (derived from store)
 * - SelectionRectangleManager: Rectangle selection state and visuals
 * - VisualManager: Visual effects, shadows, highlights, animations
 */

export { AnimationManager, Easing } from './AnimationManager';
export { AwarenessManager } from './AwarenessManager';
export { CameraManager } from './CameraManager';
export { CoordinateConverter } from './CoordinateConverter';
export { DragManager } from './DragManager';
export { GestureRecognizer } from './GestureRecognizer';
export { GridSnapManager } from './GridSnapManager';
export { HoverManager } from './HoverManager';
export { SelectionManager } from './SelectionManager';
export { SelectionRectangleManager } from './SelectionRectangleManager';
export { VisualManager } from './VisualManager';
