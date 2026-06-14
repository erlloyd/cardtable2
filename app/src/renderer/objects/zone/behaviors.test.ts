import { describe, it, expect } from 'vitest';
import { ObjectKind, type TableObject } from '@cardtable2/shared';
import { isDiscardZone } from './utils';
import { ZONE_DEFAULT_WIDTH, ZONE_DEFAULT_HEIGHT } from './constants';
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

describe('ZoneBehaviors.getBounds', () => {
  it('returns centered rect for a plain zone', () => {
    const zone = createTestZone();
    const bounds = ZoneBehaviors.getBounds(zone);
    expect(bounds.minX).toBe(-ZONE_DEFAULT_WIDTH / 2);
    expect(bounds.maxX).toBe(ZONE_DEFAULT_WIDTH / 2);
    expect(bounds.minY).toBe(-ZONE_DEFAULT_HEIGHT / 2);
    expect(bounds.maxY).toBe(ZONE_DEFAULT_HEIGHT / 2);
  });

  it('returns centered rect for a discard zone (same dimensions)', () => {
    const zone = createTestZone({ isDiscardZone: true });
    const bounds = ZoneBehaviors.getBounds(zone);
    expect(bounds.minX).toBe(-ZONE_DEFAULT_WIDTH / 2);
    expect(bounds.maxX).toBe(ZONE_DEFAULT_WIDTH / 2);
    expect(bounds.minY).toBe(-ZONE_DEFAULT_HEIGHT / 2);
    expect(bounds.maxY).toBe(ZONE_DEFAULT_HEIGHT / 2);
  });

  it('uses custom width/height from meta when present', () => {
    const zone = createTestZone({ isDiscardZone: true, width: 71, height: 96 });
    const bounds = ZoneBehaviors.getBounds(zone);
    expect(bounds.minX).toBe(-71 / 2);
    expect(bounds.maxX).toBe(71 / 2);
    expect(bounds.minY).toBe(-96 / 2);
    expect(bounds.maxY).toBe(96 / 2);
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
