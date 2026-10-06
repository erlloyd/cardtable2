import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ObjectKind, toCardEntries } from '@cardtable2/shared';
import { YjsStore } from './YjsStore';
import {
  createDiscardZoneForStack,
  createObject,
  setZoneLabel,
} from './YjsActions';

describe('setZoneLabel', () => {
  let store: YjsStore;
  let zoneId: string;

  beforeEach(() => {
    store = new YjsStore('test-table');
    const stackId = createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x: 0, y: 0, r: 0 },
      cards: toCardEntries(['card-a']),
    });
    const created = createDiscardZoneForStack(store, stackId);
    if (!created) throw new Error('discard zone was not created');
    zoneId = created;
  });

  it('writes a trimmed label and preserves the rest of _meta', () => {
    const before = store.getObjectYMap(zoneId)?.get('_meta');

    expect(setZoneLabel(store, zoneId, '  Encounter Discard  ')).toBe(true);

    const meta = store.getObjectYMap(zoneId)?.get('_meta');
    expect(meta).toEqual({ ...before, label: 'Encounter Discard' });
    expect(meta?.isDiscardZone).toBe(true);
  });

  it('is a no-op for empty or whitespace-only input', () => {
    expect(setZoneLabel(store, zoneId, '   ')).toBe(false);
    expect(store.getObjectYMap(zoneId)?.get('_meta')?.label).toBe('Discard');
  });

  it('is a no-op for a missing object', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(setZoneLabel(store, 'nope', 'X')).toBe(false);
    warn.mockRestore();
  });

  it('is a no-op for a non-zone object', () => {
    const stackId = createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x: 0, y: 0, r: 0 },
      cards: toCardEntries(['card-b']),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(setZoneLabel(store, stackId, 'X')).toBe(false);
    warn.mockRestore();
  });
});
