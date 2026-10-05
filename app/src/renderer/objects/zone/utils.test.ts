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

  it("falls back to 'Discard' when label is absent", () => {
    expect(getZoneLabel(createTestZone())).toBe('Discard');
  });

  it("falls back to 'Discard' when label is empty", () => {
    expect(getZoneLabel(createTestZone({ label: '' }))).toBe('Discard');
  });
});
