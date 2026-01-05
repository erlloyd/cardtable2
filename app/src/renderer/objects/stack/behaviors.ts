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
 * Helper: Render 3D background effect for multi-card stacks
 *
 * Adds a slightly offset background rectangle to give visual depth.
 * Only rendered for stacks with 2+ cards in non-minimal mode.
 */
function render3DBackground(
  container: Container,
  cardCount: number,
  ctx: RenderContext,
): void {
  if (cardCount < 2 || ctx.minimal) {
    return;
  }

  const bg3d = new Graphics();
  bg3d.rect(
    -STACK_WIDTH / 2 + STACK_3D_OFFSET_X,
    -STACK_HEIGHT / 2 + STACK_3D_OFFSET_Y,
    STACK_WIDTH,
    STACK_HEIGHT,
  );
  bg3d.fill({ color: STACK_3D_COLOR, alpha: STACK_3D_ALPHA });
  bg3d.stroke({
    width: ctx.scaleStrokeWidth(1),
    color: 0x000000,
    alpha: 0.3,
  });
  container.addChild(bg3d);
}

/**
 * Helper: Render main card visual (image sprite or placeholder)
 *
 * Checks for cached texture and renders sprite if available.
 * Falls back to placeholder graphic and starts async texture load.
 */
function renderMainCard(
  container: Container,
  obj: StackObject,
  ctx: RenderContext,
): void {
  const color = getStackColor(obj);
  const imageUrl = getCardImageUrl(obj, ctx);
  const cachedTexture = imageUrl && ctx.textureLoader?.get(imageUrl);

  if (cachedTexture) {
    // Create sprite with card image
    const sprite = new Sprite(cachedTexture);
    sprite.width = STACK_WIDTH;
    sprite.height = STACK_HEIGHT;
    sprite.anchor.set(0.5, 0.5);
    container.addChild(sprite);

    // Add border for selection/drop target state
    if (ctx.isSelected || ctx.isStackTarget) {
      const borderGraphic = new Graphics();
      borderGraphic.rect(
        -STACK_WIDTH / 2,
        -STACK_HEIGHT / 2,
        STACK_WIDTH,
        STACK_HEIGHT,
      );

      // Determine border color based on visual state (priority: selected > target)
      const borderColor = ctx.isSelected
        ? STACK_BORDER_COLOR_SELECTED
        : STACK_BORDER_COLOR_TARGET;

      borderGraphic.stroke({
        width: ctx.scaleStrokeWidth(4),
        color: borderColor,
      });

      container.addChild(borderGraphic);
    }
  } else {
    // No cached texture - render placeholder graphic
    const graphic = createPlaceholderGraphic(color, obj, ctx);
    container.addChild(graphic);

    // Add card code text (top card ID) on placeholder
    // Skip decorative text in minimal mode (like badges and handles)
    if (obj._cards && obj._cards.length > 0 && !ctx.minimal) {
      const topCardCode = obj._cards[0];
      const text = ctx.createKindLabel(topCardCode);
      text.anchor.set(0.5, 0.5);
      text.position.set(0, 0);
      container.addChild(text);
    }

    // Start async texture load for next render (fire-and-forget)
    if (imageUrl && ctx.textureLoader) {
      ctx.textureLoader.load(imageUrl).catch((error) => {
        console.error(
          `[StackBehaviors] Failed to preload texture for ${imageUrl}:`,
          error,
        );
      });
    }
  }
}

/**
 * Helper: Render stack decorations (count badge and unstack handle)
 *
 * Only rendered for stacks with 2+ cards in non-minimal mode.
 * Includes count badge at top-center and unstack handle at top-right.
 */
function renderStackDecorations(
  container: Container,
  cardCount: number,
  ctx: RenderContext,
): void {
  if (cardCount < 2 || ctx.minimal) {
    return;
  }

  // Create graphics for badge and handle backgrounds
  const decorGraphic = new Graphics();

  // Badge rounded square (top-center, half on/half off the card)
  const badgeX = 0;
  const badgeY = -STACK_HEIGHT / 2;

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

  // Badge text (count)
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
  const handleX = STACK_WIDTH / 2 - STACK_BADGE_SIZE / 2;
  const handleY = -STACK_HEIGHT / 2 + STACK_BADGE_SIZE / 2;

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

  // Handle icon - stack-pop
  const iconGraphic = new Graphics();
  renderStackPopIcon(iconGraphic, {
    color: STACK_BADGE_TEXT_COLOR,
    strokeWidth: 1.5,
    x: handleX,
    y: handleY,
  });
  container.addChild(iconGraphic);
}

/**
 * Helper: Create placeholder graphic for a stack (colored rectangle with decorations)
 *
 * Used when card textures are not available. Renders a colored rectangle
 * with borders and face-down indicators. The 3D effect for multi-card stacks
 * is rendered separately in the main render function.
 */
function createPlaceholderGraphic(
  color: number,
  obj: StackObject,
  ctx: RenderContext,
): Graphics {
  const graphic = new Graphics();

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
    const container = new Container();
    const stackObj = obj as StackObject;
    const cardCount = getCardCount(obj);

    // Layer 1: 3D background for multi-card stacks
    render3DBackground(container, cardCount, ctx);

    // Layer 2: Main card (image sprite or placeholder)
    renderMainCard(container, stackObj, ctx);

    // Layer 3: Badge and unstack handle for multi-card stacks
    renderStackDecorations(container, cardCount, ctx);

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
