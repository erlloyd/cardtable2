import { Graphics, Container } from 'pixi.js';
import type { TableObject } from '@cardtable2/shared';
import type { ObjectBehaviors, RenderContext, ShadowConfig } from '../types';
import {
  COUNTER_BORDER_COLOR_NORMAL,
  COUNTER_BORDER_COLOR_SELECTED,
} from './constants';
import { getCounterColor, getCounterSize } from './utils';

export const CounterBehaviors: ObjectBehaviors = {
  render(obj: TableObject, ctx: RenderContext): Container {
    const container = new Container();
    const graphic = new Graphics();
    const color = getCounterColor(obj);
    const radius = getCounterSize(obj);

    graphic.circle(0, 0, radius);
    graphic.fill(color);
    graphic.stroke({
      width: ctx.isSelected ? 4 : 2,
      color: ctx.isSelected
        ? COUNTER_BORDER_COLOR_SELECTED
        : COUNTER_BORDER_COLOR_NORMAL,
    });

    container.addChild(graphic);

    // Add kind label text (unless in minimal mode)
    if (!ctx.minimal) {
      const text = ctx.createKindLabel(obj._kind);
      text.anchor.set(0.5);
      text.position.set(0, 0);
      container.addChild(text);
    }

    return container;
  },

  getBounds(obj: TableObject) {
    const radius = getCounterSize(obj);
    return {
      minX: obj._pos.x - radius,
      minY: obj._pos.y - radius,
      maxX: obj._pos.x + radius,
      maxY: obj._pos.y + radius,
    };
  },

  getShadowConfig(obj: TableObject): ShadowConfig {
    const radius = getCounterSize(obj);
    return {
      width: radius * 2,
      height: radius * 2,
      shape: 'circle',
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
