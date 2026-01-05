import { Graphics, Container, Sprite } from 'pixi.js';
import type { TableObject, StackObject } from '@cardtable2/shared';
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
import { renderStackPopIcon } from '../../graphics/stackPop';

/**
 * Helper: Get the card image URL for the top card in a stack
 *
 * Returns the appropriate image URL (face or back) based on _faceUp state.
 * Returns null if gameAssets is unavailable or card not found.
 */
function getCardImageUrl(obj: StackObject, ctx: RenderContext): string | null {
  // Check if we have gameAssets and the object has cards
  if (!ctx.gameAssets || !obj._cards || obj._cards.length === 0) {
    return null;
  }

  // Get the top card ID (first in array)
  const topCardId = obj._cards[0];
  const card = ctx.gameAssets.cards[topCardId];

  if (!card) {
    console.warn(`[StackBehaviors] Card ${topCardId} not found in gameAssets`);
    return null;
  }

  // Determine which image to show (face or back)
  if (obj._faceUp) {
    // Face up - show card face
    return card.face;
  } else {
    // Face down - show card back (from card override or card type default)
    if (card.back) {
      return card.back;
    }

    // Fall back to card type's back image
    const cardType = ctx.gameAssets.cardTypes[card.type];
    if (cardType?.back) {
      return cardType.back;
    }

    console.warn(
      `[StackBehaviors] No back image found for card ${topCardId} (type: ${card.type})`,
    );
    return null;
  }
}

/**
 * Helper: Create placeholder graphic for a stack (colored rectangle with decorations)
 *
 * Used when card textures are not available. Renders a colored rectangle
 * with borders, 3D effect for multi-card stacks, and face-down indicators.
 */
function createPlaceholderGraphic(
  color: number,
  obj: StackObject,
  ctx: RenderContext,
): Graphics {
  const graphic = new Graphics();
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
  graphic.rect(-STACK_WIDTH / 2, -STACK_HEIGHT / 2, STACK_WIDTH, STACK_HEIGHT);
  graphic.fill(color);

  // Determine border color based on visual state (priority: selected > target > normal)
  let borderColor = STACK_BORDER_COLOR_NORMAL;
  let borderWidth = 2;
  if (ctx.isSelected) {
    borderColor = STACK_BORDER_COLOR_SELECTED;
    borderWidth = 4;
  } else if (ctx.isStackTarget) {
    borderColor = STACK_BORDER_COLOR_TARGET;
    borderWidth = 4;
  }

  graphic.stroke({
    width: ctx.scaleStrokeWidth(borderWidth),
    color: borderColor,
  });

  // Visual indicator for face-down state (diagonal lines)
  if (obj._faceUp === false) {
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

  return graphic;
}

export const StackBehaviors: ObjectBehaviors = {
  render(obj: TableObject, ctx: RenderContext): Container {
    // Use Container instead of Graphics to support children (text, icons)
    // Required for PixiJS v8 compatibility
    const container = new Container();
    const stackObj = obj as StackObject;
    const color = getStackColor(obj);
    const cardCount = getCardCount(obj);

    // Try to get card image texture (synchronous, only if already cached)
    const imageUrl = getCardImageUrl(stackObj, ctx);
    const cachedTexture = imageUrl && ctx.textureLoader?.get(imageUrl);

    // If we have a cached texture, create sprite; otherwise render placeholder
    if (cachedTexture) {
      // Create sprite with card image
      const sprite = new Sprite(cachedTexture);

      // Scale sprite to fit stack dimensions
      sprite.width = STACK_WIDTH;
      sprite.height = STACK_HEIGHT;

      // Center sprite (PixiJS sprites are anchored at top-left by default)
      sprite.anchor.set(0.5, 0.5);

      container.addChild(sprite);
    } else {
      // No cached texture - render placeholder graphic
      const graphic = createPlaceholderGraphic(color, stackObj, ctx);
      container.addChild(graphic);

      // Start async texture load for next render (fire-and-forget)
      // This ensures textures are loaded for subsequent renders
      if (imageUrl && ctx.textureLoader) {
        ctx.textureLoader.load(imageUrl).catch((error) => {
          console.error(
            `[StackBehaviors] Failed to preload texture for ${imageUrl}:`,
            error,
          );
        });
      }
    }

    // Draw count badge and unstack handle for stacks with 2+ cards
    // Skip decorative elements in minimal mode (e.g., ghost previews)
    if (cardCount >= 2 && !ctx.minimal) {
      // Create graphics for decorative elements (badge and handle)
      const decorGraphic = new Graphics();

      // Badge rounded square (top-center, half on/half off the card)
      const badgeX = 0;
      const badgeY = -STACK_HEIGHT / 2; // Position at top edge so half extends above

      decorGraphic.roundRect(
        badgeX - STACK_BADGE_SIZE / 2,
        badgeY - STACK_BADGE_SIZE / 2,
        STACK_BADGE_SIZE,
        STACK_BADGE_SIZE,
        STACK_BADGE_RADIUS,
      );
      decorGraphic.fill({ color: STACK_BADGE_COLOR, alpha: STACK_BADGE_ALPHA });
      decorGraphic.stroke({
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

      // Unstack handle (upper-right corner, flush with card borders)
      const handleX = STACK_WIDTH / 2 - STACK_BADGE_SIZE / 2; // Right edge
      const handleY = -STACK_HEIGHT / 2 + STACK_BADGE_SIZE / 2; // Top edge

      decorGraphic.rect(
        handleX - STACK_BADGE_SIZE / 2,
        handleY - STACK_BADGE_SIZE / 2,
        STACK_BADGE_SIZE,
        STACK_BADGE_SIZE,
      );
      decorGraphic.fill({ color: STACK_BADGE_COLOR, alpha: STACK_BADGE_ALPHA });

      // Add decorative graphics to container
      container.addChild(decorGraphic);
      container.addChild(text);

      // Handle icon - stack-pop (see renderer/graphics/stackPop/)
      const iconGraphic = new Graphics();
      renderStackPopIcon(iconGraphic, {
        color: STACK_BADGE_TEXT_COLOR,
        strokeWidth: 1.5,
        x: handleX,
        y: handleY,
      });
      container.addChild(iconGraphic);
    }

    return container;
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
