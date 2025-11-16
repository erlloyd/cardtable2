import { Graphics } from 'pixi.js';
import type { TableObject } from '@cardtable2/shared';
import type { ObjectBehaviors, RenderContext, ShadowConfig } from '../types';
import {
  ZONE_FILL_ALPHA,
  ZONE_BORDER_COLOR_NORMAL,
  ZONE_BORDER_COLOR_SELECTED,
} from './constants';
import { getZoneColor, getZoneWidth, getZoneHeight } from './utils';

export const ZoneBehaviors: ObjectBehaviors = {
  render(obj: TableObject, ctx: RenderContext): Graphics {
    const graphic = new Graphics();
    const color = getZoneColor(obj);
    const width = getZoneWidth(obj);
    const height = getZoneHeight(obj);

    graphic.rect(-width / 2, -height / 2, width, height);
    graphic.fill({ color, alpha: ZONE_FILL_ALPHA });
    graphic.stroke({
      width: ctx.isSelected ? 4 : 2,
      color: ctx.isSelected
        ? ZONE_BORDER_COLOR_SELECTED
        : ZONE_BORDER_COLOR_NORMAL,
    });

    return graphic;
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
};
