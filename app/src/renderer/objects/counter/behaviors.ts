import { Graphics, Container } from 'pixi.js';
import type { TableObject } from '@cardtable2/shared';
import type { ObjectBehaviors, RenderContext, ShadowConfig } from '../types';
import {
  COUNTER_BORDER_COLOR_NORMAL,
  COUNTER_BORDER_COLOR_SELECTED,
  COUNTER_LABEL_ALPHA,
  COUNTER_LABEL_FONT_SIZE,
  COUNTER_LABEL_TEXT_COLOR,
  COUNTER_PILL_BORDER_RADIUS,
  COUNTER_VALUE_FONT_SIZE,
  COUNTER_VALUE_STROKE_COLOR,
  COUNTER_VALUE_STROKE_WIDTH,
  COUNTER_VALUE_TEXT_COLOR,
  COUNTER_ZONE_GLYPH_ALPHA,
  COUNTER_ZONE_GLYPH_COLOR,
  COUNTER_ZONE_GLYPH_FONT_SIZE,
} from './constants';
import {
  getCounterColor,
  getCounterCurrentValue,
  getCounterDimensions,
  getCounterText,
} from './utils';

/**
 * Counter render (ct-yxh): horizontal rounded-rectangle pill with three
 * conceptual zones — left third minus, center third value, right third plus.
 *
 * The +/- glyphs are rendered at moderate opacity as visual affordances
 * only; event wiring (clicks/taps to mutate `currentValue`) is the next
 * bead (ct-d2p).
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

    // Minus glyph (left zone, decorative only — no event wiring in this bead)
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
    minusGlyph.alpha = COUNTER_ZONE_GLYPH_ALPHA;
    container.addChild(minusGlyph);

    // Plus glyph (right zone, decorative only — no event wiring in this bead)
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
    plusGlyph.alpha = COUNTER_ZONE_GLYPH_ALPHA;
    container.addChild(plusGlyph);

    // Current value (center zone) — mirrors the stack count badge text style:
    // large bold white with a dark stroke for legibility against any fill.
    const currentValue = getCounterCurrentValue(obj);
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
