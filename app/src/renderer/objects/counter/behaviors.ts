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
  COUNTER_LABEL_STRIP_HEIGHT,
  COUNTER_LABEL_TEXT_COLOR,
  COUNTER_PILL_BORDER_RADIUS,
  COUNTER_PILL_HEIGHT,
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
  getCounterInteractiveCenterY,
  getCounterMax,
  getCounterMin,
  getCounterText,
  hasCounterLabel,
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

    // Interactive (bottom) region geometry (ct-ep4). The pill grows when a
    // label is present so the label has its own top strip; +/- glyphs,
    // value text, and hover/clamp visuals are anchored to the bottom
    // (original-height) region instead of the geometric pill center.
    const interactiveCenterY = getCounterInteractiveCenterY(obj);
    const interactiveHeight = COUNTER_PILL_HEIGHT;
    const interactiveTop = interactiveCenterY - interactiveHeight / 2;

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

    // Hover tint behind each side zone. The tint Graphics draws a flat
    // per-third rect over the interactive (bottom) region only, then a
    // roundRect mask clones the pill silhouette so the visible tint
    // never extends past the pill's rounded corners (ct-ep4). Drawn
    // before glyphs so glyphs sit on top.
    if (
      (zoneState?.hoveredZone === 'minus' && !atMin) ||
      (zoneState?.hoveredZone === 'plus' && !atMax)
    ) {
      const isMinus = zoneState?.hoveredZone === 'minus';
      const tint = new Graphics();
      const tintX = isMinus ? -width / 2 : width / 2 - thirdWidth;
      tint.rect(tintX, interactiveTop, thirdWidth, interactiveHeight);
      tint.fill({
        color: COUNTER_ZONE_HOVER_TINT_COLOR,
        alpha: COUNTER_ZONE_HOVER_TINT_ALPHA,
      });
      tint.label = isMinus
        ? 'counter-minus-zone-tint'
        : 'counter-plus-zone-tint';

      // Mask: clone of the pill body's roundRect so the tint is clipped
      // to the pill silhouette (no square corners poking past the pill).
      const tintMask = new Graphics();
      tintMask.roundRect(
        -width / 2,
        -height / 2,
        width,
        height,
        COUNTER_PILL_BORDER_RADIUS,
      );
      tintMask.fill(0xffffff);
      tintMask.label = 'counter-zone-tint-mask';
      container.addChild(tintMask);
      tint.mask = tintMask;
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

    // Minus glyph (left zone) — centered in the interactive bottom region.
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
    minusGlyph.position.set(-zoneCenterX, interactiveCenterY);
    minusGlyph.alpha = minusAlpha;
    container.addChild(minusGlyph);

    // Plus glyph (right zone) — centered in the interactive bottom region.
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
    plusGlyph.position.set(zoneCenterX, interactiveCenterY);
    plusGlyph.alpha = plusAlpha;
    container.addChild(plusGlyph);

    // Current value (center zone) — mirrors the stack count badge text style:
    // large bold white with a dark stroke for legibility against any fill.
    // Centered in the interactive bottom region rather than the pill's
    // geometric center so a label strip above doesn't shift the value.
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
    valueText.position.set(0, interactiveCenterY);
    container.addChild(valueText);

    // Optional label (`text`): rendered INSIDE a dedicated top strip of
    // the pill (ct-ep4). When a label is present the pill grows by
    // `COUNTER_LABEL_STRIP_HEIGHT` so this band exists; the label is
    // anchored center-top of the strip and sits inside the pill
    // silhouette rather than floating above it.
    if (hasCounterLabel(obj)) {
      const labelText = getCounterText(obj);
      const label = ctx.createText({
        // hasCounterLabel guarantees this is defined and non-empty.
        text: labelText ?? '',
        style: {
          fontSize: COUNTER_LABEL_FONT_SIZE,
          fill: COUNTER_LABEL_TEXT_COLOR,
          fontWeight: 'bold',
        },
      });
      label.label = 'counter-label';
      // Center the label vertically inside the top strip. Strip spans
      // local-y in [-height/2, -height/2 + COUNTER_LABEL_STRIP_HEIGHT].
      label.anchor.set(0.5, 0.5);
      label.position.set(0, -height / 2 + COUNTER_LABEL_STRIP_HEIGHT / 2);
      label.alpha = COUNTER_LABEL_ALPHA;
      container.addChild(label);
    }

    // Clamp-flash overlay (ct-d2p) — sits on top of every other layer so
    // it briefly washes the interactive region. Bounded to the bottom
    // region with the pill-silhouette mask so the label strip stays
    // unaffected (ct-ep4).
    if (zoneState?.clampFlash) {
      const flash = new Graphics();
      flash.rect(-width / 2, interactiveTop, width, interactiveHeight);
      flash.fill({
        color: COUNTER_CLAMP_FLASH_COLOR,
        alpha: COUNTER_CLAMP_FLASH_ALPHA,
      });
      flash.label = 'counter-clamp-flash';

      const flashMask = new Graphics();
      flashMask.roundRect(
        -width / 2,
        -height / 2,
        width,
        height,
        COUNTER_PILL_BORDER_RADIUS,
      );
      flashMask.fill(0xffffff);
      flashMask.label = 'counter-clamp-flash-mask';
      container.addChild(flashMask);
      flash.mask = flashMask;
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
