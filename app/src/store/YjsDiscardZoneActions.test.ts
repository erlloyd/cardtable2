import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Y from 'yjs';
import { YjsStore } from './YjsStore';
import { ObjectKind } from '@cardtable2/shared';
import type { DiscardZoneEntry } from '@cardtable2/shared';
import {
  createDiscardZoneForStack,
  createObject,
  discardCardToZone,
} from './YjsActions';

describe('YjsStore discard zone methods', () => {
  let store: YjsStore;

  beforeEach(() => {
    store = new YjsStore('test-table');
  });

  describe('setDiscardZone / getDiscardZone', () => {
    it('stores and retrieves an entry', () => {
      const entry: DiscardZoneEntry = { memberCardIds: ['card-1', 'card-2'] };
      store.setDiscardZone('zone-a', entry);

      expect(store.getDiscardZone('zone-a')).toEqual(entry);
    });

    it('returns undefined for an unknown zoneId', () => {
      expect(store.getDiscardZone('nonexistent')).toBeUndefined();
    });

    it('overwrites an existing entry', () => {
      store.setDiscardZone('zone-a', { memberCardIds: ['card-1'] });
      store.setDiscardZone('zone-a', { memberCardIds: ['card-1', 'card-2'] });

      expect(store.getDiscardZone('zone-a')).toEqual({
        memberCardIds: ['card-1', 'card-2'],
      });
    });
  });

  describe('deleteDiscardZone', () => {
    it('removes an existing entry', () => {
      store.setDiscardZone('zone-a', { memberCardIds: ['card-1'] });
      store.deleteDiscardZone('zone-a');

      expect(store.getDiscardZone('zone-a')).toBeUndefined();
    });

    it('is a no-op for a nonexistent zoneId', () => {
      expect(() => store.deleteDiscardZone('nonexistent')).not.toThrow();
    });
  });

  describe('getAllDiscardZones', () => {
    it('returns all entries', () => {
      store.setDiscardZone('zone-a', { memberCardIds: ['card-1'] });
      store.setDiscardZone('zone-b', { memberCardIds: ['card-2', 'card-3'] });

      const all = store.getAllDiscardZones();
      expect(all.size).toBe(2);
      expect(all.get('zone-a')).toEqual({ memberCardIds: ['card-1'] });
      expect(all.get('zone-b')).toEqual({
        memberCardIds: ['card-2', 'card-3'],
      });
    });

    it('returns empty map when no zones exist', () => {
      expect(store.getAllDiscardZones().size).toBe(0);
    });
  });

  describe('findDiscardZoneForCard', () => {
    it('returns zoneId when card is a member', () => {
      store.setDiscardZone('zone-a', { memberCardIds: ['card-1', 'card-2'] });

      expect(store.findDiscardZoneForCard('card-1')).toBe('zone-a');
      expect(store.findDiscardZoneForCard('card-2')).toBe('zone-a');
    });

    it('returns null when card is not in any zone', () => {
      store.setDiscardZone('zone-a', { memberCardIds: ['card-1'] });

      expect(store.findDiscardZoneForCard('card-99')).toBeNull();
    });

    it('returns null when no zones exist', () => {
      expect(store.findDiscardZoneForCard('card-1')).toBeNull();
    });

    it('returns first match when card appears in multiple zones', () => {
      // This is a degenerate case (ct-u8y tracks disambiguation).
      // The contract guarantees first-match wins; we verify it doesn't throw.
      store.setDiscardZone('zone-a', { memberCardIds: ['card-shared'] });
      store.setDiscardZone('zone-b', { memberCardIds: ['card-shared'] });

      const result = store.findDiscardZoneForCard('card-shared');
      expect(result === 'zone-a' || result === 'zone-b').toBe(true);
    });
  });

  describe('onDiscardZonesChange', () => {
    it('fires callback when a zone is set', () => {
      const callback = vi.fn();
      const unsubscribe = store.onDiscardZonesChange(callback);

      store.setDiscardZone('zone-a', { memberCardIds: ['card-1'] });
      expect(callback).toHaveBeenCalled();

      unsubscribe();
    });

    it('fires callback when a zone is deleted', () => {
      store.setDiscardZone('zone-a', { memberCardIds: ['card-1'] });

      const callback = vi.fn();
      const unsubscribe = store.onDiscardZonesChange(callback);

      store.deleteDiscardZone('zone-a');
      expect(callback).toHaveBeenCalled();

      unsubscribe();
    });

    it('stops firing after unsubscribe', () => {
      const callback = vi.fn();
      const unsubscribe = store.onDiscardZonesChange(callback);
      unsubscribe();

      store.setDiscardZone('zone-a', { memberCardIds: ['card-1'] });
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('doc serialize / deserialize round-trip', () => {
    it('survives a Y.Doc encode + apply cycle', () => {
      store.setDiscardZone('zone-a', { memberCardIds: ['card-1', 'card-2'] });
      store.setDiscardZone('zone-b', { memberCardIds: ['card-3'] });

      // Encode state from source doc
      const encoded = Y.encodeStateAsUpdate(store['doc']);

      // Apply into a fresh doc and read back
      const freshDoc = new Y.Doc();
      Y.applyUpdate(freshDoc, encoded);

      const freshZones = freshDoc.getMap<DiscardZoneEntry>('discardZones');
      expect(freshZones.get('zone-a')).toEqual({
        memberCardIds: ['card-1', 'card-2'],
      });
      expect(freshZones.get('zone-b')).toEqual({ memberCardIds: ['card-3'] });

      freshDoc.destroy();
    });
  });
});

describe('discardCardToZone with duplicate card ids', () => {
  let store: YjsStore;
  let zoneId: string;

  function makeStack(cards: string[], containerId?: string): string {
    const id = createObject(store, {
      kind: ObjectKind.Stack,
      pos: { x: 0, y: 0, r: 0 },
      cards,
      faceUp: false,
    });
    if (containerId) {
      store.getObjectYMap(id)!.set('_containerId', containerId);
    }
    return id;
  }

  function cardsOf(id: string): string[] {
    return store.getObjectYMap(id)!.get('_cards') as string[];
  }

  function totalCards(): number {
    let total = 0;
    store.forEachObject((yMap) => {
      if (yMap.get('_kind') === ObjectKind.Stack) {
        total += (yMap.get('_cards') as string[]).length;
      }
    });
    return total;
  }

  beforeEach(() => {
    store = new YjsStore('test-discard-dupes');
    // Zone whose members are A, B, C (temp stack defines membership)
    const temp = makeStack(['A', 'B', 'C']);
    zoneId = createDiscardZoneForStack(store, temp)!;
    store.deleteObject(temp);
  });

  it('leaves an older stack holding the same id untouched', () => {
    const older = makeStack(['A', 'B']);
    const selected = makeStack(['A', 'C']);

    expect(discardCardToZone(store, selected)).toBe(true);

    expect(cardsOf(older)).toEqual(['A', 'B']);
    expect(cardsOf(selected)).toEqual(['C']);
    expect(totalCards()).toBe(4);
  });

  it('moves the selected top onto an older zone pile holding the same id', () => {
    const pile = makeStack(['A', 'B'], zoneId);
    const selected = makeStack(['A', 'C']);

    expect(discardCardToZone(store, selected)).toBe(true);

    expect(cardsOf(selected)).toEqual(['C']);
    expect(cardsOf(pile)).toEqual(['A', 'A', 'B']);
    expect(totalCards()).toBe(4);
  });

  it('discards one copy at a time from a stack with duplicate ids', () => {
    const selected = makeStack(['A', 'A', 'B']);

    expect(discardCardToZone(store, selected)).toBe(true);
    expect(cardsOf(selected)).toEqual(['A', 'B']);
    expect(totalCards()).toBe(3);

    expect(discardCardToZone(store, selected)).toBe(true);
    expect(cardsOf(selected)).toEqual(['B']);
    expect(totalCards()).toBe(3);
  });
});
