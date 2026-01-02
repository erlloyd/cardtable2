import type { Graphics } from 'pixi.js';

/**
 * SVG Graphics Definition
 *
 * Defines an SVG-based graphic that can be rendered using PixiJS Graphics.
 * Each SVG graphic should have its own directory with:
 * - icon.svg: The original SVG file (for reference)
 * - index.ts: Implementation that exports a render function
 *
 * Example structure:
 * ```
 * renderer/graphics/
 *   myIcon/
 *     icon.svg         # Original SVG for reference
 *     index.ts         # Implements renderMyIcon(graphic, options)
 * ```
 */
export interface SvgGraphicOptions {
  /** Color to use for strokes/fills (PixiJS color number) */
  color: number;
  /** Stroke width in pixels (not counter-scaled with zoom) */
  strokeWidth?: number;
  /** X offset for positioning */
  x?: number;
  /** Y offset for positioning */
  y?: number;
}

/**
 * SVG Graphic Renderer Function
 *
 * Takes a Graphics object and renders the SVG paths manually.
 * SVG paths are manually drawn because PixiJS .svg() method requires DOM
 * which is not available in Web Workers.
 *
 * @param graphic - PixiJS Graphics object to render into
 * @param options - Rendering options (color, stroke width, position)
 */
export type SvgGraphicRenderer = (
  graphic: Graphics,
  options: SvgGraphicOptions,
) => void;
