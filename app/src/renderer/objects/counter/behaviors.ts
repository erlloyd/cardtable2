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
  COUNTER_LABEL_LINE_Y,
  COUNTER_LABEL_TEXT_COLOR,
  COUNTER_PILL_BORDER_RADIUS,
  COUNTER_VALUE_FONT_SIZE,
  COUNTER_VALUE_FONT_SIZE_LABELED,
  COUNTER_VALUE_LINE_Y_LABELED,
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
  hasCounterLabel,
} from './utils';

/**
 * Counter render (ct-yxh + ct-d2p + ct-bmk): horizontal rounded-rectangle
 * pill with three conceptual zones — left third minus, center third value,
 * right third plus.
 *
 * The labeled and unlabeled counters share one fixed silhouette (ct-bmk):
 * the pill is always COUNTER_PILL_WIDTH x COUNTER_PILL_HEIGHT (90x44) in
 * both states — same fill, same border, same +/- treatment. The ONLY
 * difference is the text layout inside: bare counters render the value
 * centered at y=0 in the larger font; labeled counters stack a small
 * bold label on top (COUNTER_LABEL_LINE_Y) and a slightly-smaller numeric
 * value below (COUNTER_VALUE_LINE_Y_LABELED), both fitting inside the
 * same 44px pill height.
 *
 * Event wiring (ct-d2p) lives in the pointer pipeline, not in a per-object
 * Pixi event handler — the pill renders as a single hit target and the
 * pointer handler classifies the zone from world coordinates. This render
 * function consumes `ctx.counterZoneState` to drive the state-aware
 * visuals:
 *
 *   - Hovered side zone: glyph alpha 1.0 + faint white tint over the zone,
 *     clipped to the pill silhouette via a roundRect mask (ct-ep4).
 *   - At-rest side zone: glyph alpha ~0.55, no tint.
 *   - Boundary side zone (plus at max, minus at min): alpha 0.25, no
 *     hover response. The pointer pipeline also suppresses interaction.
 *   - Clamp flash: when a boundary tap occurs, a brief white overlay
 *     covers the pill body. Set by VisualManager for ~100ms then cleared.
 *     Body color is preserved (no body recolor).
 *
 * Coordinate system: visuals are centered at the object's `_pos`. Local
 * coordinates run from `-WIDTH/2 .. +WIDTH/2` on x and `-HEIGHT/2 ..
 * +HEIGHT/2` on y. Zone centers fall at `-WIDTH/3`, `0`, `+WIDTH/3`.
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
    const labeled = hasCounterLabel(obj);

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
    // per-third rect over the full pill height, then a roundRect mask
    // clones the pill silhouette so the visible tint never extends past
    // the pill's rounded corners (ct-ep4). Drawn before glyphs so glyphs
    // sit on top.
    if (
      (zoneState?.hoveredZone === 'minus' && !atMin) ||
      (zoneState?.hoveredZone === 'plus' && !atMax)
    ) {
      const isMinus = zoneState?.hoveredZone === 'minus';
      const tint = new Graphics();
      const tintX = isMinus ? -width / 2 : width / 2 - thirdWidth;
      tint.rect(tintX, -height / 2, thirdWidth, height);
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

    // +/- glyphs sit centered vertically on the pill in both states. The
    // pill height is fixed (ct-bmk) so a single centered y=0 works for
    // both labeled and bare — no per-state offset needed.
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

    // Center value text — mirrors the stack count-badge style (white fill,
    // dark stroke, bold). In the bare state it's the only center line and
    // sits at y=0 with the larger font. In the labeled state it shrinks
    // slightly and drops below center to make room for the label line
    // above it.
    const valueText = ctx.createText({
      text: currentValue.toString(),
      style: {
        fontSize: labeled
          ? COUNTER_VALUE_FONT_SIZE_LABELED
          : COUNTER_VALUE_FONT_SIZE,
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
    valueText.position.set(0, labeled ? COUNTER_VALUE_LINE_Y_LABELED : 0);
    container.addChild(valueText);

    // Optional label (`text`): small bold line above the value, inside the
    // same pill silhouette (ct-bmk). No separate visual band — the label
    // is just the upper of two stacked text lines.
    if (labeled) {
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
      label.anchor.set(0.5, 0.5);
      label.position.set(0, COUNTER_LABEL_LINE_Y);
      label.alpha = COUNTER_LABEL_ALPHA;
      container.addChild(label);
    }

    // Clamp-flash overlay (ct-d2p) — sits on top of every other layer so
    // it briefly washes the pill. Clipped to the pill silhouette so flat
    // corners don't poke past the rounded border (ct-ep4).
    if (zoneState?.clampFlash) {
      const flash = new Graphics();
      flash.rect(-width / 2, -height / 2, width, height);
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
