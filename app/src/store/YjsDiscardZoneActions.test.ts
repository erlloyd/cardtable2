import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Y from 'yjs';
import { YjsStore } from './YjsStore';
import type { DiscardZoneEntry } from '@cardtable2/shared';

// Mock y-indexeddb to avoid IndexedDB in tests
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class MockIndexeddbPersistence {
    private listeners: Map<string, Array<() => void>> = new Map();

    constructor(_dbName: string, _doc: unknown) {
      setTimeout(() => {
        const syncedListeners = this.listeners.get('synced') || [];
        syncedListeners.forEach((listener) => listener());
      }, 0);
    }

    on(event: string, listener: () => void) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event)!.push(listener);
    }

    destroy() {
      this.listeners.clear();
    }
  },
}));

describe('YjsStore discard zone methods', () => {
  let store: YjsStore;

  beforeEach(async () => {
    store = new YjsStore('test-table');
    await store.waitForReady();
  });

  afterEach(() => {
    store.destroy();
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
