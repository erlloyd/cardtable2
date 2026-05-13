/**
 * Unit tests for buildActionContext (ct-w2x).
 *
 * Focused on the SelectionInfo computation — in particular the new
 * `hasCounters` flag that future counter-specific actions will gate on.
 */

import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { ObjectKind, type TableObject } from '@cardtable2/shared';
import { buildActionContext } from './buildActionContext';
import type { YjsStore } from '../store/YjsStore';
import type { TableObjectYMap } from '../store/types';

/**
 * Build a Y.Map from a partial TableObject for testing. Y.Maps must be
 * attached to a Y.Doc before their `.get(...)` returns values, so the helper
 * inserts each map into a shared scratch doc under the given id.
 */
function makeYMap(
  doc: Y.Doc,
  id: string,
  kind: ObjectKind,
  locked = false,
): TableObjectYMap {
  const yMap = new Y.Map() as TableObjectYMap;
  const objects = doc.getMap<TableObjectYMap>('objects');
  objects.set(id, yMap);
  const obj: Partial<TableObject> = {
    _kind: kind,
    _locked: locked,
  };
  for (const [key, value] of Object.entries(obj)) {
    yMap.set(key as keyof TableObject, value as never);
  }
  return yMap;
}

function makeStore(): YjsStore {
  return {
    getActorId: () => 'test-actor',
  } as unknown as YjsStore;
}

describe('buildActionContext', () => {
  it('returns null when store is null', () => {
    expect(buildActionContext(null, [])).toBeNull();
  });

  describe('SelectionInfo.hasCounters', () => {
    it('is false when selection is empty', () => {
      const ctx = buildActionContext(makeStore(), []);
      expect(ctx?.selection.hasCounters).toBe(false);
    });

    it('is false when selection has only stacks', () => {
      const doc = new Y.Doc();
      const ctx = buildActionContext(makeStore(), [
        { id: 's1', yMap: makeYMap(doc, 's1', ObjectKind.Stack) },
      ]);
      expect(ctx?.selection.hasCounters).toBe(false);
      expect(ctx?.selection.hasStacks).toBe(true);
      expect(ctx?.selection.hasMixed).toBe(false);
    });

    it('is false when selection has only tokens', () => {
      const doc = new Y.Doc();
      const ctx = buildActionContext(makeStore(), [
        { id: 't1', yMap: makeYMap(doc, 't1', ObjectKind.Token) },
      ]);
      expect(ctx?.selection.hasCounters).toBe(false);
      expect(ctx?.selection.hasTokens).toBe(true);
    });

    it('is true when selection has a single counter', () => {
      const doc = new Y.Doc();
      const ctx = buildActionContext(makeStore(), [
        { id: 'c1', yMap: makeYMap(doc, 'c1', ObjectKind.Counter) },
      ]);
      expect(ctx?.selection.hasCounters).toBe(true);
      expect(ctx?.selection.hasStacks).toBe(false);
      expect(ctx?.selection.hasTokens).toBe(false);
      expect(ctx?.selection.hasMixed).toBe(false);
    });

    it('is true when selection mixes counters with stacks (hasMixed too)', () => {
      const doc = new Y.Doc();
      const ctx = buildActionContext(makeStore(), [
        { id: 's1', yMap: makeYMap(doc, 's1', ObjectKind.Stack) },
        { id: 'c1', yMap: makeYMap(doc, 'c1', ObjectKind.Counter) },
      ]);
      expect(ctx?.selection.hasCounters).toBe(true);
      expect(ctx?.selection.hasStacks).toBe(true);
      expect(ctx?.selection.hasMixed).toBe(true);
    });

    it('is true when selection contains multiple counters', () => {
      const doc = new Y.Doc();
      const ctx = buildActionContext(makeStore(), [
        { id: 'c1', yMap: makeYMap(doc, 'c1', ObjectKind.Counter) },
        { id: 'c2', yMap: makeYMap(doc, 'c2', ObjectKind.Counter) },
      ]);
      expect(ctx?.selection.hasCounters).toBe(true);
      expect(ctx?.selection.count).toBe(2);
      expect(ctx?.selection.hasMixed).toBe(false);
    });
  });
});
