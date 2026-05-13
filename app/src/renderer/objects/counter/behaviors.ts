import { Graphics, Container } from 'pixi.js';
import type { TableObject } from '@cardtable2/shared';
import type { ObjectBehaviors, RenderContext, ShadowConfig } from '../types';
import {
  COUNTER_BORDER_COLOR_NORMAL,
  COUNTER_BORDER_COLOR_SELECTED,
  COUNTER_CLAMP_FLASH_ALPHA,
  COUNTER_CLAMP_FLASH_COLOR,
  COUNTER_LABEL_ALPHA,
  COUNTER_LABEL_FONT_SIZE,
  COUNTER_LABEL_TEXT_COLOR,
  COUNTER_PILL_BORDER_RADIUS,
  COUNTER_VALUE_FONT_SIZE,
  COUNTER_VALUE_STROKE_COLOR,
  COUNTER_VALUE_STROKE_WIDTH,
  COUNTER_VALUE_TEXT_COLOR,
  COUNTER_ZONE_GLYPH_ALPHA,
  COUNTER_ZONE_GLYPH_ALPHA_ACTIVE,
  COUNTER_ZONE_GLYPH_ALPHA_BOUNDARY,
  COUNTER_ZONE_GLYPH_COLOR,
  COUNTER_ZONE_GLYPH_FONT_SIZE,
  COUNTER_ZONE_HOVER_TINT_ALPHA,
  COUNTER_ZONE_HOVER_TINT_COLOR,
} from './constants';
import {
  getCounterColor,
  getCounterCurrentValue,
  getCounterDimensions,
  getCounterMax,
  getCounterMin,
  getCounterText,
} from './utils';

/**
 * Counter render (ct-yxh + ct-d2p): horizontal rounded-rectangle pill with
 * three conceptual zones — left third minus, center third value, right
 * third plus.
 *
 * Event wiring (ct-d2p) lives in the pointer pipeline, not in a per-object
 * Pixi event handler — the pill renders as a single hit target and the
 * pointer handler classifies the zone from world coordinates. This render
 * function consumes `ctx.counterZoneState` to drive the state-aware
 * visuals:
 *
 *   - Hovered side zone: glyph alpha 1.0 + faint white tint over the zone.
 *   - At-rest side zone: glyph alpha ~0.55, no tint.
 *   - Boundary side zone (plus at max, minus at min): alpha 0.25, no
 *     hover response. The pointer pipeline also suppresses interaction.
 *   - Clamp flash: when a boundary tap occurs, a brief white overlay
 *     covers the pill body. Set by VisualManager for ~100ms then cleared.
 *     Body color is preserved (no body recolor).
 *
 * Coordinate system: visuals are centered at the object's `_pos`. World
 * coordinates inside this render run from `-WIDTH/2 .. +WIDTH/2` on x and
 * `-HEIGHT/2 .. +HEIGHT/2` on y. Zone centers fall at `-WIDTH/3`, `0`,
 * `+WIDTH/3`.
 */
export const CounterBehaviors: ObjectBehaviors = {
  render(obj: TableObject, ctx: RenderContext): Container {
    const container = new Container();
    const { width, height } = getCounterDimensions(obj);
    const color = getCounterColor(obj);
    const zoneState = ctx.counterZoneState ?? null;
    const currentValue = getCounterCurrentValue(obj);
    const atMin = currentValue <= getCounterMin(obj);
    const atMax = currentValue >= getCounterMax(obj);

    // Pill body: rounded rectangle fill + border
    const body = new Graphics();
    body.roundRect(
      -width / 2,
      -height / 2,
      width,
      height,
      COUNTER_PILL_BORDER_RADIUS,
    );
    body.fill(color);
    body.stroke({
      width: ctx.isSelected ? 4 : 2,
      color: ctx.isSelected
        ? COUNTER_BORDER_COLOR_SELECTED
        : COUNTER_BORDER_COLOR_NORMAL,
    });
    container.addChild(body);

    if (ctx.minimal) {
      return container;
    }

    const zoneCenterX = width / 3; // distance from center to side-zone center
    const thirdWidth = width / 3;

    // Hover tint behind each side zone — kept clipped to the third's
    // rectangle (not rounded) so the visible edge is the pill's own border.
    // Drawn before glyphs so glyphs sit on top.
    if (zoneState?.hoveredZone === 'minus' && !atMin) {
      const tint = new Graphics();
      tint.rect(-width / 2, -height / 2, thirdWidth, height);
      tint.fill({
        color: COUNTER_ZONE_HOVER_TINT_COLOR,
        alpha: COUNTER_ZONE_HOVER_TINT_ALPHA,
      });
      tint.label = 'counter-minus-zone-tint';
      container.addChild(tint);
    } else if (zoneState?.hoveredZone === 'plus' && !atMax) {
      const tint = new Graphics();
      tint.rect(width / 2 - thirdWidth, -height / 2, thirdWidth, height);
      tint.fill({
        color: COUNTER_ZONE_HOVER_TINT_COLOR,
        alpha: COUNTER_ZONE_HOVER_TINT_ALPHA,
      });
      tint.label = 'counter-plus-zone-tint';
      container.addChild(tint);
    }

    // Resolve per-zone alpha. Boundary > active > at-rest.
    const minusAlpha = atMin
      ? COUNTER_ZONE_GLYPH_ALPHA_BOUNDARY
      : zoneState?.hoveredZone === 'minus'
        ? COUNTER_ZONE_GLYPH_ALPHA_ACTIVE
        : COUNTER_ZONE_GLYPH_ALPHA;
    const plusAlpha = atMax
      ? COUNTER_ZONE_GLYPH_ALPHA_BOUNDARY
      : zoneState?.hoveredZone === 'plus'
        ? COUNTER_ZONE_GLYPH_ALPHA_ACTIVE
        : COUNTER_ZONE_GLYPH_ALPHA;

    // Minus glyph (left zone)
    const minusGlyph = ctx.createText({
      text: '−', // Unicode MINUS SIGN — wider and visually balanced vs ASCII '-'
      style: {
        fontSize: COUNTER_ZONE_GLYPH_FONT_SIZE,
        fill: COUNTER_ZONE_GLYPH_COLOR,
        fontWeight: 'bold',
      },
    });
    minusGlyph.label = 'counter-minus-glyph';
    minusGlyph.anchor.set(0.5, 0.5);
    minusGlyph.position.set(-zoneCenterX, 0);
    minusGlyph.alpha = minusAlpha;
    container.addChild(minusGlyph);

    // Plus glyph (right zone)
    const plusGlyph = ctx.createText({
      text: '+',
      style: {
        fontSize: COUNTER_ZONE_GLYPH_FONT_SIZE,
        fill: COUNTER_ZONE_GLYPH_COLOR,
        fontWeight: 'bold',
      },
    });
    plusGlyph.label = 'counter-plus-glyph';
    plusGlyph.anchor.set(0.5, 0.5);
    plusGlyph.position.set(zoneCenterX, 0);
    plusGlyph.alpha = plusAlpha;
    container.addChild(plusGlyph);

    // Current value (center zone) — mirrors the stack count badge text style:
    // large bold white with a dark stroke for legibility against any fill.
    const valueText = ctx.createText({
      text: currentValue.toString(),
      style: {
        fontSize: COUNTER_VALUE_FONT_SIZE,
        fill: COUNTER_VALUE_TEXT_COLOR,
        fontWeight: 'bold',
        stroke: {
          color: COUNTER_VALUE_STROKE_COLOR,
          width: COUNTER_VALUE_STROKE_WIDTH,
        },
      },
    });
    valueText.label = 'counter-value';
    valueText.anchor.set(0.5, 0.5);
    valueText.position.set(0, 0);
    container.addChild(valueText);

    // Optional label (`text`): small, semi-opaque, top-left of center zone.
    // Bounds of the center zone in local space: x in [-width/6, +width/6].
    const labelText = getCounterText(obj);
    if (labelText !== undefined && labelText.length > 0) {
      const label = ctx.createText({
        text: labelText,
        style: {
          fontSize: COUNTER_LABEL_FONT_SIZE,
          fill: COUNTER_LABEL_TEXT_COLOR,
          fontWeight: 'bold',
        },
      });
      label.label = 'counter-label';
      label.anchor.set(0, 0); // top-left
      label.position.set(-width / 6 + 1, -height / 2 + 3);
      label.alpha = COUNTER_LABEL_ALPHA;
      container.addChild(label);
    }

    // Clamp-flash overlay (ct-d2p) — sits on top of every other layer so
    // it briefly washes the entire pill. Drawn with the same rounded-rect
    // geometry as the body so it follows the pill silhouette.
    if (zoneState?.clampFlash) {
      const flash = new Graphics();
      flash.roundRect(
        -width / 2,
        -height / 2,
        width,
        height,
        COUNTER_PILL_BORDER_RADIUS,
      );
      flash.fill({
        color: COUNTER_CLAMP_FLASH_COLOR,
        alpha: COUNTER_CLAMP_FLASH_ALPHA,
      });
      flash.label = 'counter-clamp-flash';
      container.addChild(flash);
    }

    return container;
  },

  getBounds(obj: TableObject) {
    const { width, height } = getCounterDimensions(obj);
    return {
      minX: obj._pos.x - width / 2,
      minY: obj._pos.y - height / 2,
      maxX: obj._pos.x + width / 2,
      maxY: obj._pos.y + height / 2,
    };
  },

  getShadowConfig(obj: TableObject): ShadowConfig {
    const { width, height } = getCounterDimensions(obj);
    return {
      width,
      height,
      shape: 'rect',
      borderRadius: COUNTER_PILL_BORDER_RADIUS,
    };
  },

  capabilities: {
    canFlip: false,
    canRotate: false,
    canStack: false,
    canUnstack: false,
    canLock: true,
  },
};
