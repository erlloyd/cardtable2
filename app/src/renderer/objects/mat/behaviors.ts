import { Graphics } from 'pixi.js';
import type { TableObject } from '@cardtable2/shared';
import type { ObjectBehaviors, RenderContext, ShadowConfig } from '../types';
import {
  MAT_BORDER_COLOR_NORMAL,
  MAT_BORDER_COLOR_SELECTED,
} from './constants';
import { getMatColor, getMatSize } from './utils';

export const MatBehaviors: ObjectBehaviors = {
  render(obj: TableObject, ctx: RenderContext): Graphics {
    const graphic = new Graphics();
    const color = getMatColor(obj);
    const radius = getMatSize(obj);

    graphic.circle(0, 0, radius);
    graphic.fill(color);
    graphic.stroke({
      width: ctx.isSelected ? 4 : 2,
      color: ctx.isSelected
        ? MAT_BORDER_COLOR_SELECTED
        : MAT_BORDER_COLOR_NORMAL,
    });

    return graphic;
  },

  getBounds(obj: TableObject) {
    const radius = getMatSize(obj);
    return {
      minX: obj._pos.x - radius,
      minY: obj._pos.y - radius,
      maxX: obj._pos.x + radius,
      maxY: obj._pos.y + radius,
    };
  },

  getShadowConfig(obj: TableObject): ShadowConfig {
    const radius = getMatSize(obj);
    return {
      width: radius * 2,
      height: radius * 2,
      shape: 'circle',
      borderRadius: 0,
    };
  },

  capabilities: {
    canFlip: false,
    canRotate: true,
    canStack: false,
    canUnstack: false,
    canLock: true,
  },
};
