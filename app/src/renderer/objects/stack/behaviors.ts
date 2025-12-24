import { Graphics } from 'pixi.js';
import type { TableObject } from '@cardtable2/shared';
import type { ObjectBehaviors, RenderContext, ShadowConfig } from '../types';
import {
  STACK_WIDTH,
  STACK_HEIGHT,
  STACK_BORDER_RADIUS,
  STACK_BORDER_COLOR_NORMAL,
  STACK_BORDER_COLOR_SELECTED,
  STACK_3D_OFFSET_X,
  STACK_3D_OFFSET_Y,
  STACK_3D_COLOR,
  STACK_3D_ALPHA,
  STACK_BADGE_SIZE,
  STACK_BADGE_RADIUS,
  STACK_BADGE_COLOR,
  STACK_BADGE_ALPHA,
  STACK_BADGE_TEXT_COLOR,
  STACK_BADGE_FONT_SIZE,
} from './constants';
import { getStackColor, getCardCount } from './utils';

/**
 * Calculate counter-scaled stroke width for zoom-independent rendering.
 * Uses square root for perceptual consistency (perceived width scales differently than linear).
 *
 * Algorithm:
 * - At zoom < 1x: No counter-scaling applied (strokes scale naturally with zoom)
 * - At zoom >= 1x: Width = baseWidth / sqrt(zoom) with minimum of 0.5px
 *
 * @param baseWidth - The stroke width at 1x zoom
 * @param cameraScale - Current camera zoom level
 * @returns Adjusted stroke width (minimum 0.5 to remain visible)
 */
function getScaledStrokeWidth(baseWidth: number, cameraScale: number): number {
  // Validate inputs to prevent NaN/Infinity propagation
  if (!Number.isFinite(baseWidth) || baseWidth < 0) {
    console.error(
      '[StackBehaviors] Invalid baseWidth in getScaledStrokeWidth:',
      { baseWidth, cameraScale },
    );
    return 0.5; // Minimum visible width
  }

  if (!Number.isFinite(cameraScale) || cameraScale <= 0) {
    console.error(
      '[StackBehaviors] Invalid cameraScale in getScaledStrokeWidth:',
      { baseWidth, cameraScale },
    );
    return baseWidth; // Fall back to unscaled width
  }

  const zoomFactor = Math.max(1, Math.sqrt(cameraScale));
  const scaledWidth = Math.max(0.5, baseWidth / zoomFactor);

  // Final validation to catch any unexpected math results
  if (!Number.isFinite(scaledWidth)) {
    console.error(
      '[StackBehaviors] Math operation produced invalid stroke width:',
      { baseWidth, cameraScale, zoomFactor, scaledWidth },
    );
    return 0.5; // Minimum visible width
  }

  return scaledWidth;
}

export const StackBehaviors: ObjectBehaviors = {
  render(obj: TableObject, ctx: RenderContext): Graphics {
    const graphic = new Graphics();
    const color = getStackColor(obj);
    const cardCount = getCardCount(obj);

    // Draw 3D effect (background rectangle) for stacks with 2+ cards
    if (cardCount >= 2) {
      graphic.rect(
        -STACK_WIDTH / 2 + STACK_3D_OFFSET_X,
        -STACK_HEIGHT / 2 + STACK_3D_OFFSET_Y,
        STACK_WIDTH,
        STACK_HEIGHT,
      );
      graphic.fill({ color: STACK_3D_COLOR, alpha: STACK_3D_ALPHA });
      graphic.stroke({
        width: getScaledStrokeWidth(1, ctx.cameraScale),
        color: 0x000000,
        alpha: 0.3,
      });
    }

    // Draw main card rectangle
    graphic.rect(
      -STACK_WIDTH / 2,
      -STACK_HEIGHT / 2,
      STACK_WIDTH,
      STACK_HEIGHT,
    );
    graphic.fill(color);
    graphic.stroke({
      width: getScaledStrokeWidth(ctx.isSelected ? 4 : 2, ctx.cameraScale),
      color: ctx.isSelected
        ? STACK_BORDER_COLOR_SELECTED
        : STACK_BORDER_COLOR_NORMAL,
    });

    // Visual indicator for face-down state (diagonal lines)
    if ('_faceUp' in obj && obj._faceUp === false) {
      graphic.rect(
        -STACK_WIDTH / 2,
        -STACK_HEIGHT / 2,
        STACK_WIDTH,
        STACK_HEIGHT,
      );
      graphic.fill({ color: 0x000000, alpha: 0.2 });

      // Diagonal line pattern
      graphic.moveTo(-STACK_WIDTH / 2, -STACK_HEIGHT / 2);
      graphic.lineTo(STACK_WIDTH / 2, STACK_HEIGHT / 2);
      graphic.moveTo(-STACK_WIDTH / 2, STACK_HEIGHT / 2);
      graphic.lineTo(STACK_WIDTH / 2, -STACK_HEIGHT / 2);
      graphic.stroke({
        width: getScaledStrokeWidth(2, ctx.cameraScale),
        color: 0xffffff,
        alpha: 0.5,
      });
    }

    // Draw count badge for stacks with 2+ cards
    if (cardCount >= 2) {
      // Badge rounded square (top-center, half on/half off the card)
      const badgeX = 0;
      const badgeY = -STACK_HEIGHT / 2; // Position at top edge so half extends above

      graphic.roundRect(
        badgeX - STACK_BADGE_SIZE / 2,
        badgeY - STACK_BADGE_SIZE / 2,
        STACK_BADGE_SIZE,
        STACK_BADGE_SIZE,
        STACK_BADGE_RADIUS,
      );
      graphic.fill({ color: STACK_BADGE_COLOR, alpha: STACK_BADGE_ALPHA });
      graphic.stroke({
        width: getScaledStrokeWidth(1, ctx.cameraScale),
        color: 0xffffff,
        alpha: 0.3,
      });

      // Badge text (uses ctx.createText for automatic zoom-aware resolution)
      const text = ctx.createText({
        text: cardCount.toString(),
        style: {
          fontSize: STACK_BADGE_FONT_SIZE,
          fill: STACK_BADGE_TEXT_COLOR,
          fontWeight: 'bold',
        },
      });
      text.anchor.set(0.5, 0.5);
      text.position.set(badgeX, badgeY);
      graphic.addChild(text);

      // Unstack handle (upper-right corner, flush with card borders)
      const handleX = STACK_WIDTH / 2 - STACK_BADGE_SIZE / 2; // Right edge
      const handleY = -STACK_HEIGHT / 2 + STACK_BADGE_SIZE / 2; // Top edge

      graphic.rect(
        handleX - STACK_BADGE_SIZE / 2,
        handleY - STACK_BADGE_SIZE / 2,
        STACK_BADGE_SIZE,
        STACK_BADGE_SIZE,
      );
      graphic.fill({ color: STACK_BADGE_COLOR, alpha: STACK_BADGE_ALPHA });

      // Handle icon (unicode arrow, uses ctx.createText for automatic zoom-aware resolution)
      const handleIcon = ctx.createText({
        text: '⬆', // Upward arrow unicode character
        style: {
          fontSize: 14,
          fill: STACK_BADGE_TEXT_COLOR,
        },
      });
      handleIcon.anchor.set(0.5, 0.5);
      handleIcon.position.set(handleX, handleY);
      graphic.addChild(handleIcon);
    }

    return graphic;
  },

  getBounds(obj: TableObject) {
    return {
      minX: obj._pos.x - STACK_WIDTH / 2,
      minY: obj._pos.y - STACK_HEIGHT / 2,
      maxX: obj._pos.x + STACK_WIDTH / 2,
      maxY: obj._pos.y + STACK_HEIGHT / 2,
    };
  },

  getShadowConfig(_obj: TableObject): ShadowConfig {
    return {
      width: STACK_WIDTH,
      height: STACK_HEIGHT,
      shape: 'rect',
      borderRadius: STACK_BORDER_RADIUS,
    };
  },

  capabilities: {
    canFlip: true,
    canRotate: true,
    canStack: true,
    canUnstack: true,
    canLock: true,
  },
};
