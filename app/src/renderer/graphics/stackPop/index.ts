import type { Graphics } from 'pixi.js';
import type { SvgGraphicOptions } from '../types';

/**
 * Stack Pop Icon
 *
 * Renders a "stack-pop" icon showing stacked layers with an upward arrow.
 * Used for the unstack handle on card stacks.
 *
 * Source: icon.svg (16x16 viewBox)
 * Original SVG paths:
 * - Path 1 (layers): m4.25 6.75-2.5 1.25 6.25 3.25 6.25-3.25-2.5-1.25m-10 4.25 6.25 3.25 6.25-3.25
 * - Path 2 (arrow): m8 8.25v-6.5m-2.25 2 2.25-2 2.25 2
 *
 * @param graphic - PixiJS Graphics object to render into
 * @param options - Rendering options (color, stroke width, position)
 */
export function renderStackPopIcon(
  graphic: Graphics,
  options: SvgGraphicOptions,
): void {
  const { color, strokeWidth = 1.5, x = 0, y = 0 } = options;

  // SVG viewBox is 16x16, so offset by -8 to center
  const offsetX = x - 8;
  const offsetY = y - 8;

  // Path 1: Stacked layers
  // SVG path: m4.25 6.75-2.5 1.25 6.25 3.25 6.25-3.25-2.5-1.25m-10 4.25 6.25 3.25 6.25-3.25
  let px = 4.25;
  let py = 6.75;
  graphic.moveTo(px + offsetX, py + offsetY);
  px += -2.5;
  py += 1.25;
  graphic.lineTo(px + offsetX, py + offsetY);
  px += 6.25;
  py += 3.25;
  graphic.lineTo(px + offsetX, py + offsetY);
  px += 6.25;
  py += -3.25;
  graphic.lineTo(px + offsetX, py + offsetY);
  px += -2.5;
  py += -1.25;
  graphic.lineTo(px + offsetX, py + offsetY);
  // Second layer (move command)
  px += -10;
  py += 4.25;
  graphic.moveTo(px + offsetX, py + offsetY);
  px += 6.25;
  py += 3.25;
  graphic.lineTo(px + offsetX, py + offsetY);
  px += 6.25;
  py += -3.25;
  graphic.lineTo(px + offsetX, py + offsetY);
  graphic.stroke({
    width: strokeWidth,
    color: color,
    cap: 'round',
    join: 'round',
  });

  // Path 2: Upward arrow
  // SVG path: m8 8.25v-6.5m-2.25 2 2.25-2 2.25 2
  px = 8;
  py = 8.25;
  graphic.moveTo(px + offsetX, py + offsetY);
  py += -6.5; // v-6.5 (vertical line)
  graphic.lineTo(px + offsetX, py + offsetY);
  // Arrow head
  px += -2.25;
  py += 2;
  graphic.moveTo(px + offsetX, py + offsetY);
  px += 2.25;
  py += -2;
  graphic.lineTo(px + offsetX, py + offsetY);
  px += 2.25;
  py += 2;
  graphic.lineTo(px + offsetX, py + offsetY);
  graphic.stroke({
    width: strokeWidth,
    color: color,
    cap: 'round',
    join: 'round',
  });
}
