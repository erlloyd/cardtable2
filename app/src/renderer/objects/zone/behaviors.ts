import { Graphics, Container } from 'pixi.js';
import type { TableObject } from '@cardtable2/shared';
import type { ObjectBehaviors, RenderContext, ShadowConfig } from '../types';
import {
  ZONE_FILL_ALPHA,
  ZONE_BORDER_COLOR_NORMAL,
  ZONE_BORDER_COLOR_SELECTED,
  ZONE_DISCARD_BORDER_COLOR,
  ZONE_DISCARD_FILL_COLOR,
  ZONE_DISCARD_FILL_ALPHA,
} from './constants';
import {
  getZoneColor,
  getZoneWidth,
  getZoneHeight,
  isDiscardZone,
} from './utils';

export const ZoneBehaviors: ObjectBehaviors = {
  render(obj: TableObject, ctx: RenderContext): Container {
    const container = new Container();
    const graphic = new Graphics();
    const discard = isDiscardZone(obj);
    const fillColor = discard ? ZONE_DISCARD_FILL_COLOR : getZoneColor(obj);
    const fillAlpha = discard ? ZONE_DISCARD_FILL_ALPHA : ZONE_FILL_ALPHA;
    const width = getZoneWidth(obj);
    const height = getZoneHeight(obj);

    graphic.rect(-width / 2, -height / 2, width, height);
    graphic.fill({ color: fillColor, alpha: fillAlpha });
    graphic.stroke({
      width: ctx.isSelected ? 4 : 2,
      color: ctx.isSelected
        ? ZONE_BORDER_COLOR_SELECTED
        : discard
          ? ZONE_DISCARD_BORDER_COLOR
          : ZONE_BORDER_COLOR_NORMAL,
    });

    container.addChild(graphic);

    // Add kind label text (unless in minimal mode)
    if (!ctx.minimal) {
      const label = discard ? 'Discard' : obj._kind;
      const text = ctx.createKindLabel(label);
      text.anchor.set(0.5);
      text.position.set(0, 0);
      container.addChild(text);
    }

    return container;
  },

  getBounds(obj: TableObject) {
    const width = getZoneWidth(obj);
    const height = getZoneHeight(obj);
    return {
      minX: obj._pos.x - width / 2,
      minY: obj._pos.y - height / 2,
      maxX: obj._pos.x + width / 2,
      maxY: obj._pos.y + height / 2,
    };
  },

  getShadowConfig(obj: TableObject): ShadowConfig {
    const width = getZoneWidth(obj);
    const height = getZoneHeight(obj);
    return {
      width,
      height,
      shape: 'rect',
      borderRadius: 0,
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
