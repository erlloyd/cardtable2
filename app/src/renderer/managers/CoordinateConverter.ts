import type { Container } from 'pixi.js';

/**
 * CoordinateConverter - Handles coordinate space transformations.
 *
 * Manages conversions between three coordinate systems:
 * - Screen coordinates: DOM pixel coordinates (pointer events)
 * - World coordinates: Game/scene coordinates (object positions)
 * - Canvas coordinates: PixiJS stage coordinates (accounting for DPR)
 *
 * Extracted from RendererCore (Phase 1 - Hybrid Architecture Refactor).
 */
export class CoordinateConverter {
  private cameraScale: number = 1.0;
  private devicePixelRatio: number = 1.0;

  /**
   * Set the current camera scale.
   * @param scale - The camera zoom level (1.0 = 100%)
   */
  setCameraScale(scale: number): void {
    this.cameraScale = scale;
  }

  /**
   * Get the current camera scale.
   */
  getCameraScale(): number {
    return this.cameraScale;
  }

  /**
   * Set the device pixel ratio.
   * @param dpr - The device pixel ratio (window.devicePixelRatio)
   */
  setDevicePixelRatio(dpr: number): void {
    this.devicePixelRatio = dpr;
  }

  /**
   * Get the device pixel ratio.
   */
  getDevicePixelRatio(): number {
    return this.devicePixelRatio;
  }

  /**
   * Convert screen coordinates to world coordinates.
   * @param screenX - X coordinate in screen space (DOM pixels)
   * @param screenY - Y coordinate in screen space (DOM pixels)
   * @param worldContainer - The PixiJS world container (for camera position)
   * @returns World coordinates { x, y }
   */
  screenToWorld(
    screenX: number,
    screenY: number,
    worldContainer: Container,
  ): { x: number; y: number } {
    const worldX = (screenX - worldContainer.position.x) / this.cameraScale;
    const worldY = (screenY - worldContainer.position.y) / this.cameraScale;
    return { x: worldX, y: worldY };
  }

  /**
   * Convert world coordinates to screen coordinates.
   * @param worldX - X coordinate in world space
   * @param worldY - Y coordinate in world space
   * @param worldContainer - The PixiJS world container (for camera position)
   * @returns Screen coordinates { x, y }
   */
  worldToScreen(
    worldX: number,
    worldY: number,
    worldContainer: Container,
  ): { x: number; y: number } {
    const screenX = worldContainer.position.x + worldX * this.cameraScale;
    const screenY = worldContainer.position.y + worldY * this.cameraScale;
    return { x: screenX, y: screenY };
  }

  /**
   * Convert canvas coordinates to DOM coordinates.
   * Canvas coordinates are in PixiJS "physical pixels" (DPR-adjusted).
   * DOM coordinates are in CSS pixels.
   *
   * @param canvasX - X coordinate in canvas space (physical pixels)
   * @param canvasY - Y coordinate in canvas space (physical pixels)
   * @returns DOM coordinates { x, y } (CSS pixels)
   */
  canvasToDom(canvasX: number, canvasY: number): { x: number; y: number } {
    return {
      x: canvasX / this.devicePixelRatio,
      y: canvasY / this.devicePixelRatio,
    };
  }

  /**
   * Convert DOM coordinates to canvas coordinates.
   * @param domX - X coordinate in DOM space (CSS pixels)
   * @param domY - Y coordinate in DOM space (CSS pixels)
   * @returns Canvas coordinates { x, y } (physical pixels)
   */
  domToCanvas(domX: number, domY: number): { x: number; y: number } {
    return {
      x: domX * this.devicePixelRatio,
      y: domY * this.devicePixelRatio,
    };
  }
}
