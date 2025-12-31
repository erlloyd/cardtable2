import { Graphics } from 'pixi.js';
import type { TableObject } from '@cardtable2/shared';
import type { ObjectBehaviors, RenderContext, ShadowConfig } from '../types';
import {
  STACK_WIDTH,
  STACK_HEIGHT,
  STACK_BORDER_RADIUS,
  STACK_BORDER_COLOR_NORMAL,
  STACK_BORDER_COLOR_SELECTED,
  STACK_BORDER_COLOR_TARGET,
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

    // Draw 3D effect (background rectangle) for stacks with 2+ cards
    // Skip decorative elements in minimal mode (e.g., ghost previews)
    if (cardCount >= 2 && !ctx.minimal) {
      graphic.rect(
        -STACK_WIDTH / 2 + STACK_3D_OFFSET_X,
        -STACK_HEIGHT / 2 + STACK_3D_OFFSET_Y,
        STACK_WIDTH,
        STACK_HEIGHT,
      );
      graphic.fill({ color: STACK_3D_COLOR, alpha: STACK_3D_ALPHA });
      graphic.stroke({
        width: ctx.scaleStrokeWidth(1),
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

    // Determine border color based on visual state (priority: selected > target > normal)
    let borderColor = STACK_BORDER_COLOR_NORMAL;
    let borderWidth = 2;
    if (ctx.isSelected) {
      borderColor = STACK_BORDER_COLOR_SELECTED; // For selected state
      borderWidth = 4;
    } else if (ctx.isStackTarget) {
      borderColor = STACK_BORDER_COLOR_TARGET; // For drop target state
      borderWidth = 4;
    }

    graphic.stroke({
      width: ctx.scaleStrokeWidth(borderWidth),
      color: borderColor,
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
        width: ctx.scaleStrokeWidth(2),
        color: 0xffffff,
        alpha: 0.5,
      });
    }

    // Draw count badge and unstack handle for stacks with 2+ cards
    // Skip decorative elements in minimal mode (e.g., ghost previews)
    if (cardCount >= 2 && !ctx.minimal) {
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
        width: ctx.scaleStrokeWidth(1),
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
    // If no rotation, use simple axis-aligned bounds
    if (obj._pos.r === 0) {
      return {
        minX: obj._pos.x - STACK_WIDTH / 2,
        minY: obj._pos.y - STACK_HEIGHT / 2,
        maxX: obj._pos.x + STACK_WIDTH / 2,
        maxY: obj._pos.y + STACK_HEIGHT / 2,
      };
    }

    // With rotation, calculate axis-aligned bounding box of rotated rectangle
    // Transform all four corners and find min/max
    const angleRad = (obj._pos.r * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    // Four corners in local space (centered at origin)
    const corners = [
      { x: -STACK_WIDTH / 2, y: -STACK_HEIGHT / 2 }, // Top-left
      { x: STACK_WIDTH / 2, y: -STACK_HEIGHT / 2 }, // Top-right
      { x: -STACK_WIDTH / 2, y: STACK_HEIGHT / 2 }, // Bottom-left
      { x: STACK_WIDTH / 2, y: STACK_HEIGHT / 2 }, // Bottom-right
    ];

    // Transform corners by rotation and translate to world position
    const transformed = corners.map((corner) => ({
      x: corner.x * cos - corner.y * sin + obj._pos.x,
      y: corner.x * sin + corner.y * cos + obj._pos.y,
    }));

    // Find axis-aligned bounding box
    const xs = transformed.map((p) => p.x);
    const ys = transformed.map((p) => p.y);

    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
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
