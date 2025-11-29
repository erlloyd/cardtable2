import type { Application, Container } from 'pixi.js';
import type { WheelEventData } from '@cardtable2/shared';
import { CoordinateConverter } from './CoordinateConverter';

/**
 * CameraManager - Handles camera zoom and pan operations.
 *
 * Manages camera transformations including:
 * - Zoom (mouse wheel, pinch gestures)
 * - Pan (drag, pinch translation)
 * - Coordinate conversions (delegated to CoordinateConverter)
 *
 * The camera is implemented by transforming the worldContainer:
 * - position.x/y controls pan
 * - scale controls zoom
 *
 * Extracted from RendererCore (Phase 1 - Hybrid Architecture Refactor).
 */
export class CameraManager {
  private coordConverter: CoordinateConverter;
  private worldContainer: Container | null = null;
  private app: Application | null = null;

  // Pinch zoom state
  private isPinching = false;
  private initialPinchScale = 1.0;
  private initialPinchMidpoint = { x: 0, y: 0 }; // Locked screen point
  private initialPinchWorldPoint = { x: 0, y: 0 }; // World coords under midpoint

  // Pan state
  private isPanningState = false;

  constructor(coordConverter: CoordinateConverter) {
    this.coordConverter = coordConverter;
  }

  /**
   * Initialize the camera with app and world container references.
   */
  initialize(app: Application, worldContainer: Container): void {
    this.app = app;
    this.worldContainer = worldContainer;

    // Center camera on screen center initially
    const width = app.renderer.width;
    const height = app.renderer.height;
    worldContainer.position.set(width / 2, height / 2);

    // Set initial scale from coord converter
    const initialScale = this.coordConverter.getCameraScale();
    worldContainer.scale.set(initialScale);
  }

  /**
   * Handle canvas resize - adjust camera position to maintain center.
   */
  handleResize(
    oldWidth: number,
    oldHeight: number,
    newWidth: number,
    newHeight: number,
  ): void {
    if (!this.worldContainer) return;

    // Calculate pan offset from previous center
    const offsetX = this.worldContainer.position.x - oldWidth / 2;
    const offsetY = this.worldContainer.position.y - oldHeight / 2;

    // Apply offset to new center
    this.worldContainer.position.set(
      newWidth / 2 + offsetX,
      newHeight / 2 + offsetY,
    );
  }

  /**
   * Start camera pan gesture.
   */
  startPan(): void {
    this.isPanningState = true;
  }

  /**
   * End camera pan gesture.
   */
  endPan(): void {
    this.isPanningState = false;
  }

  /**
   * Check if camera is currently being panned.
   */
  isPanningActive(): boolean {
    return this.isPanningState;
  }

  /**
   * Pan the camera by a delta amount (screen space).
   * @param deltaX - X movement in screen pixels
   * @param deltaY - Y movement in screen pixels
   */
  pan(deltaX: number, deltaY: number): void {
    if (!this.worldContainer) {
      return;
    }

    this.worldContainer.position.x += deltaX;
    this.worldContainer.position.y += deltaY;
  }

  /**
   * Zoom towards a specific screen point (wheel zoom).
   * @param event - Wheel event data
   */
  zoom(event: WheelEventData): void {
    if (!this.worldContainer) return;

    // Mouse position is already canvas-relative (converted in Board.tsx)
    const mouseX = event.clientX;
    const mouseY = event.clientY;

    // Convert mouse position to world coordinates before scaling
    const worldPoint = this.coordConverter.screenToWorld(
      mouseX,
      mouseY,
      this.worldContainer,
    );

    // Calculate zoom factor from wheel delta
    const zoomFactor = event.deltaY > 0 ? 0.95 : 1.05;

    // Apply new scale (no clamping - unlimited zoom)
    const newScale = this.coordConverter.getCameraScale() * zoomFactor;
    this.coordConverter.setCameraScale(newScale);
    this.worldContainer.scale.set(newScale);

    // Adjust position so the world point under cursor stays under cursor
    this.worldContainer.position.x = mouseX - worldPoint.x * newScale;
    this.worldContainer.position.y = mouseY - worldPoint.y * newScale;
  }

  /**
   * Start a pinch zoom gesture.
   * @param pointers - Array of pointer positions { lastX, lastY }
   */
  startPinch(pointers: Array<{ lastX: number; lastY: number }>): void {
    if (pointers.length !== 2 || !this.worldContainer) return;

    this.isPinching = true;
    this.initialPinchScale = this.coordConverter.getCameraScale();

    // Calculate and lock the midpoint (this should NOT change during the pinch)
    this.initialPinchMidpoint.x = (pointers[0].lastX + pointers[1].lastX) / 2;
    this.initialPinchMidpoint.y = (pointers[0].lastY + pointers[1].lastY) / 2;

    // Convert midpoint to world coordinates ONCE at start of pinch
    const worldPoint = this.coordConverter.screenToWorld(
      this.initialPinchMidpoint.x,
      this.initialPinchMidpoint.y,
      this.worldContainer,
    );
    this.initialPinchWorldPoint.x = worldPoint.x;
    this.initialPinchWorldPoint.y = worldPoint.y;
  }

  /**
   * Update pinch zoom with current pointer positions.
   * @param initialDistance - Initial distance between fingers
   * @param currentDistance - Current distance between fingers
   */
  updatePinch(initialDistance: number, currentDistance: number): void {
    if (!this.isPinching || !this.worldContainer) return;

    // Calculate scale change
    const scaleChange = currentDistance / initialDistance;
    const newScale = this.initialPinchScale * scaleChange;

    // Apply zoom (no clamping - unlimited zoom)
    this.coordConverter.setCameraScale(newScale);
    this.worldContainer.scale.set(newScale);

    // Adjust position so the LOCKED world point stays under the LOCKED screen midpoint
    // Formula: screenPos = cameraPos + worldPos * scale
    // Therefore: cameraPos = screenPos - worldPos * scale
    this.worldContainer.position.x =
      this.initialPinchMidpoint.x - this.initialPinchWorldPoint.x * newScale;
    this.worldContainer.position.y =
      this.initialPinchMidpoint.y - this.initialPinchWorldPoint.y * newScale;
  }

  /**
   * End pinch zoom gesture.
   */
  endPinch(): void {
    this.isPinching = false;
  }

  /**
   * Check if currently pinching.
   */
  isPinchingActive(): boolean {
    return this.isPinching;
  }

  /**
   * Request a render (convenience method).
   */
  requestRender(): void {
    if (this.app) {
      this.app.renderer.render(this.app.stage);
    }
  }
}
