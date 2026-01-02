import { Graphics, Container } from 'pixi.js';
import type { TableObject } from '@cardtable2/shared';
import type { ObjectBehaviors, RenderContext, ShadowConfig } from '../types';
import {
  TOKEN_BORDER_COLOR_NORMAL,
  TOKEN_BORDER_COLOR_SELECTED,
} from './constants';
import { getTokenColor, getTokenSize } from './utils';

export const TokenBehaviors: ObjectBehaviors = {
  render(obj: TableObject, ctx: RenderContext): Container {
    const container = new Container();
    const graphic = new Graphics();
    const color = getTokenColor(obj);
    const radius = getTokenSize(obj);

    graphic.circle(0, 0, radius);
    graphic.fill(color);
    graphic.stroke({
      width: ctx.isSelected ? 4 : 2,
      color: ctx.isSelected
        ? TOKEN_BORDER_COLOR_SELECTED
        : TOKEN_BORDER_COLOR_NORMAL,
    });

    // Visual indicator for face-down state (cross pattern)
    if ('_faceUp' in obj && obj._faceUp === false) {
      graphic.circle(0, 0, radius);
      graphic.fill({ color: 0x000000, alpha: 0.2 });

      // Cross pattern (horizontal + vertical lines)
      graphic.moveTo(-radius, 0);
      graphic.lineTo(radius, 0);
      graphic.moveTo(0, -radius);
      graphic.lineTo(0, radius);
      graphic.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
    }

    container.addChild(graphic);
    return container;
  },

  getBounds(obj: TableObject) {
    const radius = getTokenSize(obj);
    return {
      minX: obj._pos.x - radius,
      minY: obj._pos.y - radius,
      maxX: obj._pos.x + radius,
      maxY: obj._pos.y + radius,
    };
  },

  getShadowConfig(obj: TableObject): ShadowConfig {
    const radius = getTokenSize(obj);
    return {
      width: radius * 2,
      height: radius * 2,
      shape: 'circle',
      borderRadius: 0,
    };
  },

  capabilities: {
    canFlip: true,
    canRotate: true,
    canStack: false,
    canUnstack: false,
    canLock: true,
  },
};
