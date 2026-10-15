import { describe, it, expect } from 'vitest';
import { ObjectKind, type TableObject } from '@cardtable2/shared';
import { Text, type Container, type TextOptions } from 'pixi.js';
import type { RenderContext } from '../types';
import { isDiscardZone } from './utils';
import {
  ZONE_DEFAULT_WIDTH,
  ZONE_DEFAULT_HEIGHT,
  ZONE_LABEL_GAP,
  ZONE_LABEL_HIT_HEIGHT,
} from './constants';
import { ZoneBehaviors } from './behaviors';

function createTestZone(meta?: Record<string, unknown>): TableObject {
  return {
    _kind: ObjectKind.Zone,
    _pos: { x: 0, y: 0, r: 0 },
    _containerId: null,
    _sortKey: '0',
    _locked: false,
    _selectedBy: null,
    _meta: meta ?? {},
  };
}

describe('isDiscardZone', () => {
  it('returns false for a plain zone with no _meta', () => {
    const zone = createTestZone();
    expect(isDiscardZone(zone)).toBe(false);
  });

  it('returns false when _meta.isDiscardZone is absent', () => {
    const zone = createTestZone({ color: 0xff0000 });
    expect(isDiscardZone(zone)).toBe(false);
  });

  it('returns false when _meta.isDiscardZone is false', () => {
    const zone = createTestZone({ isDiscardZone: false });
    expect(isDiscardZone(zone)).toBe(false);
  });

  it('returns true when _meta.isDiscardZone is true', () => {
    const zone = createTestZone({ isDiscardZone: true });
    expect(isDiscardZone(zone)).toBe(true);
  });
});

const LABEL_BAND = ZONE_LABEL_GAP + ZONE_LABEL_HIT_HEIGHT;

describe('ZoneBehaviors.getBounds', () => {
  it('includes the label band above a plain zone', () => {
    const zone = createTestZone();
    const bounds = ZoneBehaviors.getBounds(zone);
    expect(bounds.minX).toBe(-ZONE_DEFAULT_WIDTH / 2);
    expect(bounds.maxX).toBe(ZONE_DEFAULT_WIDTH / 2);
    expect(bounds.minY).toBe(-ZONE_DEFAULT_HEIGHT / 2 - LABEL_BAND);
    expect(bounds.maxY).toBe(ZONE_DEFAULT_HEIGHT / 2);
  });

  it('includes the label band above a discard zone', () => {
    const zone = createTestZone({ isDiscardZone: true });
    const bounds = ZoneBehaviors.getBounds(zone);
    expect(bounds.minX).toBe(-ZONE_DEFAULT_WIDTH / 2);
    expect(bounds.maxX).toBe(ZONE_DEFAULT_WIDTH / 2);
    expect(bounds.minY).toBe(-ZONE_DEFAULT_HEIGHT / 2 - LABEL_BAND);
    expect(bounds.maxY).toBe(ZONE_DEFAULT_HEIGHT / 2);
  });

  it('uses custom width/height from meta and offsets by position', () => {
    const zone = createTestZone({ isDiscardZone: true, width: 71, height: 96 });
    zone._pos = { x: 100, y: 200, r: 0 };
    const bounds = ZoneBehaviors.getBounds(zone);
    expect(bounds.minX).toBe(100 - 71 / 2);
    expect(bounds.maxX).toBe(100 + 71 / 2);
    expect(bounds.minY).toBe(200 - 96 / 2 - LABEL_BAND);
    expect(bounds.maxY).toBe(200 + 96 / 2);
  });
});

describe('ZoneBehaviors.render label', () => {
  function createCtx(minimal = false): RenderContext {
    return {
      isSelected: false,
      isHovered: false,
      isDragging: false,
      dragActionPreview: null,
      isStackTarget: false,
      isAttachTarget: false,
      minimal,
      cameraScale: 1,
      createText: (options: TextOptions) => new Text({ ...options }),
      createKindLabel: (text: string) => new Text({ text }),
      scaleStrokeWidth: (w: number) => w,
    };
  }

  function findLabel(container: Container): Text | undefined {
    return container.children.find((c): c is Text => c instanceof Text);
  }

  it('places a plain zone label above the top edge, anchored at its bottom', () => {
    const container = ZoneBehaviors.render(
      createTestZone({ width: 300, height: 200 }),
      createCtx(),
    );
    const label = findLabel(container);
    expect(label?.text).toBe('Zone');
    expect(label?.anchor.y).toBe(1);
    expect(label?.position.x).toBe(0);
    expect(label?.position.y).toBe(-200 / 2 - ZONE_LABEL_GAP);
  });

  it('shows the stored label for a plain zone', () => {
    const container = ZoneBehaviors.render(
      createTestZone({ label: 'Play Area' }),
      createCtx(),
    );
    expect(findLabel(container)?.text).toBe('Play Area');
  });

  it('omits the label in minimal mode', () => {
    const container = ZoneBehaviors.render(createTestZone(), createCtx(true));
    expect(findLabel(container)).toBeUndefined();
  });
});

describe('ZoneBehaviors.capabilities', () => {
  it('disallows flip/rotate/stack/unstack, allows lock', () => {
    expect(ZoneBehaviors.capabilities).toEqual({
      canFlip: false,
      canRotate: false,
      canStack: false,
      canUnstack: false,
      canLock: true,
    });
  });
});
