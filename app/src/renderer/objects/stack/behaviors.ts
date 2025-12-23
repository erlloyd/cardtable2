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

export const StackBehaviors: ObjectBehaviors = {
  render(obj: TableObject, ctx: RenderContext): Graphics {
    const graphic = new Graphics();
    const color = getStackColor(obj);
    const cardCount = getCardCount(obj);

    // Scale stroke widths inversely with zoom for consistent visual appearance
    // Use square root for perceptual consistency (perceived width scales differently than linear)
    const zoomFactor = Math.max(1, Math.sqrt(ctx.cameraScale));
    const adjustedStrokeWidth3D = Math.max(0.5, 1 / zoomFactor);
    const adjustedStrokeWidthMain = Math.max(
      0.5,
      (ctx.isSelected ? 4 : 2) / zoomFactor,
    );

    // Skip expensive rendering during drag for performance (CI environments)
    // Text creation (rasterization + GPU upload) is too slow for frequent updates
    const skipExpensiveOperations = ctx.isDragging;

    // Draw 3D effect (background rectangle) for stacks with 2+ cards
    if (cardCount >= 2 && !skipExpensiveOperations) {
      graphic.rect(
        -STACK_WIDTH / 2 + STACK_3D_OFFSET_X,
        -STACK_HEIGHT / 2 + STACK_3D_OFFSET_Y,
        STACK_WIDTH,
        STACK_HEIGHT,
      );
      graphic.fill({ color: STACK_3D_COLOR, alpha: STACK_3D_ALPHA });
      graphic.stroke({
        width: adjustedStrokeWidth3D,
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
      width: adjustedStrokeWidthMain,
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
        width: Math.max(0.5, 2 / zoomFactor),
        color: 0xffffff,
        alpha: 0.5,
      });
    }

    // Draw count badge for stacks with 2+ cards (skip during drag to avoid expensive text creation)
    if (cardCount >= 2 && !skipExpensiveOperations) {
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
        width: Math.max(0.5, 1 / zoomFactor),
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
