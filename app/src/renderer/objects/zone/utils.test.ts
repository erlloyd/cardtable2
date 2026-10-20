import { describe, it, expect } from 'vitest';
import { ObjectKind, type TableObject } from '@cardtable2/shared';
import { getZoneLabel } from './utils';

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

describe('getZoneLabel', () => {
  it('returns _meta.label when set', () => {
    expect(getZoneLabel(createTestZone({ label: 'Encounter Discard' }))).toBe(
      'Encounter Discard',
    );
  });

  it("falls back to 'Discard' when label is empty on a discard zone", () => {
    expect(
      getZoneLabel(createTestZone({ label: '', isDiscardZone: true })),
    ).toBe('Discard');
  });

  it("falls back to 'Discard' for a discard zone without a label", () => {
    expect(getZoneLabel(createTestZone({ isDiscardZone: true }))).toBe(
      'Discard',
    );
  });

  it("falls back to 'Zone' for a plain zone without a label", () => {
    expect(getZoneLabel(createTestZone())).toBe('Zone');
  });

  it("falls back to 'Zone' when a plain zone's label is empty", () => {
    expect(getZoneLabel(createTestZone({ label: '' }))).toBe('Zone');
  });
});
