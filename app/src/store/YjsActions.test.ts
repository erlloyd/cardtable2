import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YjsStore, type ObjectChanges, toTableObject } from './YjsStore';
import {
  createObject,
  moveObjects,
  selectObjects,
  unselectObjects,
  clearAllSelections,
  exhaustCards,
  flipCards,
  stackObjects,
  unstackCard,
} from './YjsActions';
import {
  ObjectKind,
  type StackObject,
  type TableObject,
} from '@cardtable2/shared';

// Mock y-indexeddb to avoid IndexedDB in tests
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class MockIndexeddbPersistence {
    private listeners: Map<string, Array<() => void>> = new Map();

    constructor(_dbName: string, _doc: unknown) {
      // Immediately trigger synced event to simulate quick load
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

describe('YjsActions - createObject', () => {
  let store: YjsStore;

  beforeEach(async () => {
    store = new YjsStore('test-table');
    await store.waitForReady();
  });

  afterEach(() => {
    if (store) {
      store.destroy();
    }
  });

  describe('Basic Object Creation', () => {
    it('creates a stack object with required fields', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
        cards: ['card-1', 'card-2'],
        faceUp: true,
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj).not.toBeNull();
      expect(obj?._kind).toBe(ObjectKind.Stack);
      expect(obj?._pos).toEqual({ x: 100, y: 200, r: 0 });
      expect(obj?._locked).toBe(false);
      expect(obj?._selectedBy).toBeNull();
      expect(obj?._containerId).toBeNull();

      // Stack-specific fields (type narrowing)
      if (
        obj &&
        obj._kind === ObjectKind.Stack &&
        '_cards' in obj &&
        '_faceUp' in obj
      ) {
        expect(obj._cards).toEqual(['card-1', 'card-2']);
        expect(obj._faceUp).toBe(true);
      }
    });

    it('creates a token object', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 50, y: 75, r: 45 },
        meta: { color: 'red', value: 5 },
      });

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj).not.toBeNull();
      expect(obj?._kind).toBe(ObjectKind.Token);
      expect(obj?._pos).toEqual({ x: 50, y: 75, r: 45 });
      expect(obj?._meta).toEqual({ color: 'red', value: 5 });
    });

    it('creates a zone object', () => {
      const id = createObject(store, {
        kind: ObjectKind.Zone,
        pos: { x: 0, y: 0, r: 0 },
        meta: { width: 500, height: 300 },
      });

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj).not.toBeNull();
      expect(obj?._kind).toBe(ObjectKind.Zone);
      expect(obj?._meta).toEqual({ width: 500, height: 300 });
    });
  });

  describe('Default Values', () => {
    it('uses default values when optional fields are not provided', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._locked).toBe(false);
      expect(obj?._selectedBy).toBeNull();
      expect(obj?._containerId).toBeNull();
      expect(obj?._meta).toEqual({});
    });

    it('uses default faceUp=true for stacks when not provided', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
      });

      const obj = toTableObject(store.getObjectYMap(id)!);
      if (
        obj &&
        obj._kind === ObjectKind.Stack &&
        '_cards' in obj &&
        '_faceUp' in obj
      ) {
        expect(obj._faceUp).toBe(true);
      }
    });

    it('uses empty array for cards when not provided', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
      });

      const obj = toTableObject(store.getObjectYMap(id)!);
      if (
        obj &&
        obj._kind === ObjectKind.Stack &&
        '_cards' in obj &&
        '_faceUp' in obj
      ) {
        expect(obj._cards).toEqual([]);
      }
    });
  });

  describe('Optional Fields', () => {
    it('allows setting locked=true', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
        locked: true,
      });

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._locked).toBe(true);
    });

    it('allows setting containerId', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
        containerId: 'zone-1',
      });

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._containerId).toBe('zone-1');
    });

    it('allows setting custom metadata', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
        meta: { health: 10, defense: 5, name: 'Guard' },
      });

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._meta).toEqual({ health: 10, defense: 5, name: 'Guard' });
    });

    it('allows setting faceUp=false for stacks', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        faceUp: false,
      });

      const obj = toTableObject(store.getObjectYMap(id)!);
      if (
        obj &&
        obj._kind === ObjectKind.Stack &&
        '_cards' in obj &&
        '_faceUp' in obj
      ) {
        expect(obj._faceUp).toBe(false);
      }
    });
  });

  describe('SortKey Generation', () => {
    it('generates a sortKey for the first object', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._sortKey).toBeDefined();
      expect(typeof obj?._sortKey).toBe('string');
    });

    it('generates sortKeys that place newer objects on top', () => {
      const id1 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      const id2 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 10, y: 10, r: 0 },
      });

      const id3 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 20, y: 20, r: 0 },
      });

      const obj1 = toTableObject(store.getObjectYMap(id1)!) as
        | TableObject
        | undefined;
      const obj2 = toTableObject(store.getObjectYMap(id2)!) as
        | TableObject
        | undefined;
      const obj3 = toTableObject(store.getObjectYMap(id3)!) as
        | TableObject
        | undefined;

      // Higher sortKey = on top (lexicographic comparison for strings)
      expect(obj2!._sortKey > obj1!._sortKey).toBe(true);
      expect(obj3!._sortKey > obj2!._sortKey).toBe(true);
    });

    it('generates sortKeys in fractional indexing format', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      const obj = toTableObject(store.getObjectYMap(id)!);
      // Should match format: "number|letter"
      expect(obj?._sortKey).toMatch(/^\d+\|[a-z]+$/);
    });
  });

  describe('Multiple Object Types', () => {
    it('creates multiple objects of different kinds', () => {
      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['card-1'],
      });

      const tokenId = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 100, y: 100, r: 0 },
      });

      const zoneId = createObject(store, {
        kind: ObjectKind.Zone,
        pos: { x: 200, y: 200, r: 0 },
      });

      expect(store.objects.size).toBe(3);

      const stack = toTableObject(store.getObjectYMap(stackId)!) as
        | TableObject
        | undefined;
      const token = toTableObject(store.getObjectYMap(tokenId)!) as
        | TableObject
        | undefined;
      const zone = toTableObject(store.getObjectYMap(zoneId)!) as
        | TableObject
        | undefined;

      expect(stack?._kind).toBe(ObjectKind.Stack);
      expect(token?._kind).toBe(ObjectKind.Token);
      expect(zone?._kind).toBe(ObjectKind.Zone);
    });
  });

  describe('Store Integration', () => {
    it('object is persisted in YjsStore', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      // Verify object exists in store
      const allObjects = store.objects;
      expect(allObjects.has(id)).toBe(true);
    });

    it('notifies observers when object is created', async () => {
      const callback = vi.fn();
      store.onObjectsChange(callback);

      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      // Wait for Yjs to trigger observers
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalled();

      // Verify the callback received change information
      const changes = callback.mock.calls[0]?.[0] as ObjectChanges | undefined;
      expect(changes).toBeDefined();
      expect(changes).toHaveProperty('added');
      expect(changes).toHaveProperty('updated');
      expect(changes).toHaveProperty('removed');

      if (changes) {
        expect(changes.added).toHaveLength(1);
        expect(changes.added[0]?.id).toBe(id);
      }
    });
  });
});

describe('YjsActions - moveObjects', () => {
  let store: YjsStore;

  beforeEach(async () => {
    store = new YjsStore('test-table');
    await store.waitForReady();
  });

  afterEach(() => {
    if (store) {
      store.destroy();
    }
  });

  describe('Single Object Movement', () => {
    it('updates position of a single object', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 100, y: 200, r: 0 },
      });

      moveObjects(store, [{ id, pos: { x: 150, y: 250, r: 45 } }]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._pos).toEqual({ x: 150, y: 250, r: 45 });
    });

    it('preserves all other object properties when moving', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
        meta: { color: 'red', value: 5 },
        locked: true,
      });

      moveObjects(store, [{ id, pos: { x: 100, y: 100, r: 90 } }]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._kind).toBe(ObjectKind.Token);
      expect(obj?._meta).toEqual({ color: 'red', value: 5 });
      expect(obj?._locked).toBe(true);
      expect(obj?._pos).toEqual({ x: 100, y: 100, r: 90 });
    });

    it('handles rotation changes', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 50, y: 50, r: 0 },
      });

      moveObjects(store, [{ id, pos: { x: 50, y: 50, r: 180 } }]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._pos.r).toBe(180);
      expect(obj?._pos.x).toBe(50);
      expect(obj?._pos.y).toBe(50);
    });
  });

  describe('Multiple Object Movement', () => {
    it('moves multiple objects in a single transaction', () => {
      const id1 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });
      const id2 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 10, y: 10, r: 0 },
      });
      const id3 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 20, y: 20, r: 0 },
      });

      moveObjects(store, [
        { id: id1, pos: { x: 100, y: 100, r: 0 } },
        { id: id2, pos: { x: 200, y: 200, r: 0 } },
        { id: id3, pos: { x: 300, y: 300, r: 0 } },
      ]);

      const obj1 = toTableObject(store.getObjectYMap(id1)!) as
        | TableObject
        | undefined;
      const obj2 = toTableObject(store.getObjectYMap(id2)!) as
        | TableObject
        | undefined;
      const obj3 = toTableObject(store.getObjectYMap(id3)!) as
        | TableObject
        | undefined;

      expect(obj1?._pos).toEqual({ x: 100, y: 100, r: 0 });
      expect(obj2?._pos).toEqual({ x: 200, y: 200, r: 0 });
      expect(obj3?._pos).toEqual({ x: 300, y: 300, r: 0 });
    });

    it('handles partial batch updates correctly', () => {
      const id1 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });
      const id2 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 10, y: 10, r: 0 },
      });

      // Only move id1, leave id2 unchanged
      moveObjects(store, [{ id: id1, pos: { x: 500, y: 500, r: 0 } }]);

      const obj1 = toTableObject(store.getObjectYMap(id1)!) as
        | TableObject
        | undefined;
      const obj2 = toTableObject(store.getObjectYMap(id2)!) as
        | TableObject
        | undefined;

      expect(obj1?._pos).toEqual({ x: 500, y: 500, r: 0 });
      expect(obj2?._pos).toEqual({ x: 10, y: 10, r: 0 }); // Unchanged
    });
  });

  describe('Stack-Specific Movement', () => {
    it('preserves stack-specific properties when moving', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['card-1', 'card-2', 'card-3'],
        faceUp: false,
      });

      moveObjects(store, [{ id, pos: { x: 250, y: 350, r: 0 } }]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._pos).toEqual({ x: 250, y: 350, r: 0 });

      if (
        obj &&
        obj._kind === ObjectKind.Stack &&
        '_cards' in obj &&
        '_faceUp' in obj
      ) {
        expect(obj._cards).toEqual(['card-1', 'card-2', 'card-3']);
        expect(obj._faceUp).toBe(false);
      }
    });
  });

  describe('Edge Cases', () => {
    it('warns when trying to move non-existent object', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      moveObjects(store, [
        { id: 'non-existent-id', pos: { x: 100, y: 100, r: 0 } },
      ]);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[moveObjects] Object non-existent-id not found',
      );

      consoleWarnSpy.mockRestore();
    });

    it('handles empty updates array', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      // Should not throw
      moveObjects(store, []);

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._pos).toEqual({ x: 0, y: 0, r: 0 }); // Unchanged
    });

    it('handles mix of valid and invalid object IDs', () => {
      const validId = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      moveObjects(store, [
        { id: validId, pos: { x: 100, y: 100, r: 0 } },
        { id: 'invalid-id', pos: { x: 200, y: 200, r: 0 } },
      ]);

      // Valid object should be moved
      const obj = toTableObject(store.getObjectYMap(validId)!) as
        | TableObject
        | undefined;
      expect(obj?._pos).toEqual({ x: 100, y: 100, r: 0 });

      // Should warn about invalid ID
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[moveObjects] Object invalid-id not found',
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Store Integration', () => {
    it('triggers observer callbacks when objects are moved', async () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      // Wait for create event to clear
      await new Promise((resolve) => setTimeout(resolve, 10));

      const callback = vi.fn();
      store.onObjectsChange(callback);

      moveObjects(store, [{ id, pos: { x: 100, y: 100, r: 0 } }]);

      // Wait for Yjs to trigger observers
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalled();

      const changes = callback.mock.calls[0]?.[0] as ObjectChanges | undefined;
      expect(changes).toBeDefined();

      if (changes) {
        expect(changes.updated).toHaveLength(1);
        expect(changes.updated[0]?.id).toBe(id);
        expect(changes.updated[0]?.yMap.get('_pos')).toEqual({
          x: 100,
          y: 100,
          r: 0,
        });
      }
    });

    it('uses single transaction for atomic updates', async () => {
      const id1 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });
      const id2 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 10, y: 10, r: 0 },
      });

      // Wait for create events
      await new Promise((resolve) => setTimeout(resolve, 10));

      const callback = vi.fn();
      store.onObjectsChange(callback);

      moveObjects(store, [
        { id: id1, pos: { x: 100, y: 100, r: 0 } },
        { id: id2, pos: { x: 200, y: 200, r: 0 } },
      ]);

      // Wait for Yjs to trigger observers
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should be called once with both updates (atomic transaction)
      expect(callback).toHaveBeenCalledTimes(1);

      const changes = callback.mock.calls[0]?.[0] as ObjectChanges | undefined;
      expect(changes).toBeDefined();

      if (changes) {
        expect(changes.updated).toHaveLength(2);
      }
    });
  });
});

describe('YjsActions - Selection Ownership (M3-T3)', () => {
  let store: YjsStore;
  let actorId: string;

  beforeEach(async () => {
    store = new YjsStore('test-table');
    await store.waitForReady();
    actorId = store.getActorId();
  });

  afterEach(() => {
    if (store) {
      store.destroy();
    }
  });

  describe('selectObjects', () => {
    it('selects objects and sets _selectedBy field', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      const result = selectObjects(store, [id], actorId);

      expect(result.selected).toEqual([id]);
      expect(result.failed).toEqual([]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._selectedBy).toBe(actorId);
    });

    it('selects multiple objects at once', () => {
      const id1 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });
      const id2 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 10, y: 10, r: 0 },
      });

      const result = selectObjects(store, [id1, id2], actorId);

      expect(result.selected).toEqual([id1, id2]);
      expect(result.failed).toEqual([]);

      const obj1 = toTableObject(store.getObjectYMap(id1)!) as
        | TableObject
        | undefined;
      const obj2 = toTableObject(store.getObjectYMap(id2)!) as
        | TableObject
        | undefined;
      expect(obj1?._selectedBy).toBe(actorId);
      expect(obj2?._selectedBy).toBe(actorId);
    });

    it('fails to select objects already owned by another actor', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      // First actor selects
      const actor1 = 'actor-1';
      selectObjects(store, [id], actor1);

      // Second actor tries to select
      const actor2 = 'actor-2';
      const result = selectObjects(store, [id], actor2);

      expect(result.selected).toEqual([]);
      expect(result.failed).toEqual([id]);

      // Should still be owned by first actor
      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._selectedBy).toBe(actor1);
    });

    it('allows same actor to re-select already selected object', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      selectObjects(store, [id], actorId);
      const result = selectObjects(store, [id], actorId);

      // Should succeed (already owned by same actor)
      expect(result.selected).toEqual([]);
      expect(result.failed).toEqual([]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._selectedBy).toBe(actorId);
    });

    it('fails to select locked objects', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
        locked: true,
      });

      const result = selectObjects(store, [id], actorId);

      expect(result.selected).toEqual([]);
      expect(result.failed).toEqual([id]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._selectedBy).toBeNull();
    });

    it('handles partial selection (mix of valid and invalid)', () => {
      const id1 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });
      const id2 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 10, y: 10, r: 0 },
        locked: true,
      });

      const result = selectObjects(store, [id1, id2], actorId);

      expect(result.selected).toEqual([id1]);
      expect(result.failed).toEqual([id2]);

      const obj1 = toTableObject(store.getObjectYMap(id1)!) as
        | TableObject
        | undefined;
      const obj2 = toTableObject(store.getObjectYMap(id2)!) as
        | TableObject
        | undefined;
      expect(obj1?._selectedBy).toBe(actorId);
      expect(obj2?._selectedBy).toBeNull();
    });

    it('warns when trying to select non-existent object', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const result = selectObjects(store, ['non-existent'], actorId);

      expect(result.selected).toEqual([]);
      expect(result.failed).toEqual(['non-existent']);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[selectObjects] Object non-existent not found',
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('unselectObjects', () => {
    it('unselects objects owned by actor', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      selectObjects(store, [id], actorId);
      const result = unselectObjects(store, [id], actorId);

      expect(result).toEqual([id]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._selectedBy).toBeNull();
    });

    it('unselects multiple objects at once', () => {
      const id1 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });
      const id2 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 10, y: 10, r: 0 },
      });

      selectObjects(store, [id1, id2], actorId);
      const result = unselectObjects(store, [id1, id2], actorId);

      expect(result).toEqual([id1, id2]);

      const obj1 = toTableObject(store.getObjectYMap(id1)!) as
        | TableObject
        | undefined;
      const obj2 = toTableObject(store.getObjectYMap(id2)!) as
        | TableObject
        | undefined;
      expect(obj1?._selectedBy).toBeNull();
      expect(obj2?._selectedBy).toBeNull();
    });

    it('fails to unselect objects owned by another actor', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      const actor1 = 'actor-1';
      selectObjects(store, [id], actor1);

      const actor2 = 'actor-2';
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const result = unselectObjects(store, [id], actor2);

      expect(result).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalled();

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._selectedBy).toBe(actor1); // Still owned by actor1

      consoleWarnSpy.mockRestore();
    });

    it('handles unselecting already unselected objects', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const result = unselectObjects(store, [id], actorId);

      expect(result).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('warns when trying to unselect non-existent object', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const result = unselectObjects(store, ['non-existent'], actorId);

      expect(result).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[unselectObjects] Object non-existent not found',
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('clearAllSelections', () => {
    it('clears all selections in the store', () => {
      const id1 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });
      const id2 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 10, y: 10, r: 0 },
      });

      selectObjects(store, [id1, id2], actorId);

      const cleared = clearAllSelections(store);

      expect(cleared).toBe(2);

      const obj1 = toTableObject(store.getObjectYMap(id1)!) as
        | TableObject
        | undefined;
      const obj2 = toTableObject(store.getObjectYMap(id2)!) as
        | TableObject
        | undefined;
      expect(obj1?._selectedBy).toBeNull();
      expect(obj2?._selectedBy).toBeNull();
    });

    it('clears selections from multiple actors', () => {
      const id1 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });
      const id2 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 10, y: 10, r: 0 },
      });

      selectObjects(store, [id1], 'actor-1');
      selectObjects(store, [id2], 'actor-2');

      const cleared = clearAllSelections(store);

      expect(cleared).toBe(2);

      const obj1 = toTableObject(store.getObjectYMap(id1)!) as
        | TableObject
        | undefined;
      const obj2 = toTableObject(store.getObjectYMap(id2)!) as
        | TableObject
        | undefined;
      expect(obj1?._selectedBy).toBeNull();
      expect(obj2?._selectedBy).toBeNull();
    });

    it('returns 0 when no selections to clear', () => {
      createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      const cleared = clearAllSelections(store);

      expect(cleared).toBe(0);
    });

    it('only clears selected objects, not all objects', () => {
      const id1 = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });
      // Create second object (not selected)
      createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 10, y: 10, r: 0 },
      });

      selectObjects(store, [id1], actorId);

      const cleared = clearAllSelections(store);

      expect(cleared).toBe(1);
      expect(store.objects.size).toBe(2); // Both objects still exist
    });

    it('throws error when excludeDragging option is used', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      selectObjects(store, [id], actorId);

      expect(() => {
        clearAllSelections(store, { excludeDragging: true });
      }).toThrow('excludeDragging option is not implemented yet');
    });
  });
});

describe('YjsActions - exhaustCards (M3.5-T2)', () => {
  let store: YjsStore;

  beforeEach(async () => {
    store = new YjsStore('test-table');
    await store.waitForReady();
  });

  afterEach(() => {
    if (store) {
      store.destroy();
    }
  });

  describe('Basic Exhaust/Ready Toggle', () => {
    it('exhausts a card (rotates to 90°)', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
      });

      const result = exhaustCards(store, [id]);

      expect(result).toEqual([id]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._pos.r).toBe(90);
    });

    it('readies an exhausted card (rotates back to 0°)', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 90 },
      });

      const result = exhaustCards(store, [id]);

      expect(result).toEqual([id]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._pos.r).toBe(0);
    });

    it('toggles multiple times correctly', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
      });

      // Exhaust
      exhaustCards(store, [id]);
      expect(toTableObject(store.getObjectYMap(id)!)?._pos.r).toBe(90);

      // Ready
      exhaustCards(store, [id]);
      expect(toTableObject(store.getObjectYMap(id)!)?._pos.r).toBe(0);

      // Exhaust again
      exhaustCards(store, [id]);
      expect(toTableObject(store.getObjectYMap(id)!)?._pos.r).toBe(90);
    });
  });

  describe('Multiple Objects', () => {
    it('exhausts multiple stacks in one transaction', () => {
      const id1 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
      });
      const id2 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 10, y: 10, r: 0 },
      });

      const result = exhaustCards(store, [id1, id2]);

      expect(result).toEqual([id1, id2]);
      expect(toTableObject(store.getObjectYMap(id1)!)?._pos.r).toBe(90);
      expect(toTableObject(store.getObjectYMap(id2)!)?._pos.r).toBe(90);
    });

    it('handles mix of exhausted and ready stacks', () => {
      const id1 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 }, // Ready
      });
      const id2 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 10, y: 10, r: 90 }, // Exhausted
      });

      const result = exhaustCards(store, [id1, id2]);

      expect(result).toEqual([id1, id2]);
      expect(toTableObject(store.getObjectYMap(id1)!)?._pos.r).toBe(90); // Now exhausted
      expect(toTableObject(store.getObjectYMap(id2)!)?._pos.r).toBe(0); // Now ready
    });
  });

  describe('Object Type Filtering', () => {
    it('only affects stacks, skips tokens', () => {
      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
      });
      const tokenId = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 10, y: 10, r: 0 },
      });

      const result = exhaustCards(store, [stackId, tokenId]);

      expect(result).toEqual([stackId]); // Only stack affected
      expect(toTableObject(store.getObjectYMap(stackId)!)?._pos.r).toBe(90);
      expect(toTableObject(store.getObjectYMap(tokenId)!)?._pos.r).toBe(0); // Unchanged
    });

    it('skips zones', () => {
      const zoneId = createObject(store, {
        kind: ObjectKind.Zone,
        pos: { x: 0, y: 0, r: 0 },
      });

      const result = exhaustCards(store, [zoneId]);

      expect(result).toEqual([]);
      expect(toTableObject(store.getObjectYMap(zoneId)!)?._pos.r).toBe(0); // Unchanged
    });
  });

  describe('Floating Point Tolerance', () => {
    it('treats 90.05° as exhausted (within tolerance)', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 90.05 },
      });

      const result = exhaustCards(store, [id]);

      expect(result).toEqual([id]);
      expect(toTableObject(store.getObjectYMap(id)!)?._pos.r).toBe(0); // Readied
    });

    it('treats 89.95° as exhausted (within tolerance)', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 89.95 },
      });

      const result = exhaustCards(store, [id]);

      expect(result).toEqual([id]);
      expect(toTableObject(store.getObjectYMap(id)!)?._pos.r).toBe(0); // Readied
    });

    it('treats 45° as ready (not exhausted)', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 45 },
      });

      const result = exhaustCards(store, [id]);

      expect(result).toEqual([id]);
      expect(toTableObject(store.getObjectYMap(id)!)?._pos.r).toBe(90); // Exhausted
    });

    it('normalizes rotation to prevent drift', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
      });

      // Exhaust
      exhaustCards(store, [id]);
      const rotation1 = toTableObject(store.getObjectYMap(id)!)?._pos.r;
      expect(rotation1).toBe(90);

      // Ready
      exhaustCards(store, [id]);
      const rotation2 = toTableObject(store.getObjectYMap(id)!)?._pos.r;
      expect(rotation2).toBe(0);

      // Verify exact values (no drift)
      expect(typeof rotation1).toBe('number');
      expect(typeof rotation2).toBe('number');
    });
  });

  describe('Edge Cases', () => {
    it('warns when object not found', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const result = exhaustCards(store, ['non-existent']);

      expect(result).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[exhaustCards] Object non-existent not found',
      );

      consoleWarnSpy.mockRestore();
    });

    it('handles empty array', () => {
      const result = exhaustCards(store, []);

      expect(result).toEqual([]);
    });

    it('handles mix of valid and invalid IDs', () => {
      const validId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
      });

      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const result = exhaustCards(store, [validId, 'invalid']);

      expect(result).toEqual([validId]);
      expect(toTableObject(store.getObjectYMap(validId)!)?._pos.r).toBe(90);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[exhaustCards] Object invalid not found',
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Position Preservation', () => {
    it('preserves x and y position when exhausting', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 123, y: 456, r: 0 },
      });

      exhaustCards(store, [id]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._pos).toEqual({ x: 123, y: 456, r: 90 });
    });

    it('preserves all other object properties', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
        cards: ['card-1', 'card-2'],
        faceUp: false,
        meta: { deckName: 'Player 1' },
        locked: false,
      });

      exhaustCards(store, [id]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._kind).toBe(ObjectKind.Stack);
      expect(obj?._pos.x).toBe(100);
      expect(obj?._pos.y).toBe(200);
      expect(obj?._pos.r).toBe(90);
      expect(obj?._meta).toEqual({ deckName: 'Player 1' });
      expect(obj?._locked).toBe(false);

      if (
        obj &&
        obj._kind === ObjectKind.Stack &&
        '_cards' in obj &&
        '_faceUp' in obj
      ) {
        expect(obj._cards).toEqual(['card-1', 'card-2']);
        expect(obj._faceUp).toBe(false);
      }
    });
  });
});

describe('YjsActions - flipCards (M3.5-T1)', () => {
  let store: YjsStore;

  beforeEach(async () => {
    store = new YjsStore('test-table');
    await store.waitForReady();
  });

  afterEach(() => {
    if (store) {
      store.destroy();
    }
  });

  describe('Basic Flip Toggle', () => {
    it('flips a stack from face up to face down', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
        faceUp: true,
      });

      const result = flipCards(store, [id]);

      expect(result).toEqual([id]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      if (obj && obj._kind === ObjectKind.Stack && '_faceUp' in obj) {
        expect(obj._faceUp).toBe(false);
      }
    });

    it('flips a stack from face down to face up', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
        faceUp: false,
      });

      const result = flipCards(store, [id]);

      expect(result).toEqual([id]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      if (obj && obj._kind === ObjectKind.Stack && '_faceUp' in obj) {
        expect(obj._faceUp).toBe(true);
      }
    });

    it('toggles multiple times correctly', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
        faceUp: true,
      });

      // Flip to face down
      flipCards(store, [id]);
      let obj = toTableObject(store.getObjectYMap(id)!);
      if (obj && obj._kind === ObjectKind.Stack && '_faceUp' in obj) {
        expect(obj._faceUp).toBe(false);
      }

      // Flip to face up
      flipCards(store, [id]);
      obj = toTableObject(store.getObjectYMap(id)!);
      if (obj && obj._kind === ObjectKind.Stack && '_faceUp' in obj) {
        expect(obj._faceUp).toBe(true);
      }
    });
  });

  describe('Multiple Objects', () => {
    it('flips multiple stacks and tokens', () => {
      const stack1 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        faceUp: true,
      });
      const stack2 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 10, y: 10, r: 0 },
        faceUp: false,
      });
      const token = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 20, y: 20, r: 0 },
        faceUp: true,
      });

      const result = flipCards(store, [stack1, stack2, token]);

      expect(result).toEqual([stack1, stack2, token]);

      const obj1 = toTableObject(store.getObjectYMap(stack1)!) as
        | TableObject
        | undefined;
      const obj2 = toTableObject(store.getObjectYMap(stack2)!) as
        | TableObject
        | undefined;
      const obj3 = toTableObject(store.getObjectYMap(token)!) as
        | TableObject
        | undefined;

      if (obj1 && obj1._kind === ObjectKind.Stack && '_faceUp' in obj1) {
        expect(obj1._faceUp).toBe(false);
      }
      if (obj2 && obj2._kind === ObjectKind.Stack && '_faceUp' in obj2) {
        expect(obj2._faceUp).toBe(true);
      }
      if (obj3 && obj3._kind === ObjectKind.Token && '_faceUp' in obj3) {
        expect(obj3._faceUp).toBe(false);
      }
    });
  });

  describe('Object Type Filtering', () => {
    it('affects stacks and tokens, skips zones', () => {
      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        faceUp: true,
      });
      const tokenId = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 10, y: 10, r: 0 },
        faceUp: true,
      });
      const zoneId = createObject(store, {
        kind: ObjectKind.Zone,
        pos: { x: 20, y: 20, r: 0 },
      });

      const result = flipCards(store, [stackId, tokenId, zoneId]);

      expect(result).toEqual([stackId, tokenId]); // Zone skipped
    });
  });

  describe('Edge Cases', () => {
    it('warns when object not found', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const result = flipCards(store, ['non-existent']);

      expect(result).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[flipCards] Object non-existent not found',
      );

      consoleWarnSpy.mockRestore();
    });

    it('handles empty array', () => {
      const result = flipCards(store, []);

      expect(result).toEqual([]);
    });
  });

  describe('Property Preservation', () => {
    it('preserves all other object properties when flipping', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 45 },
        cards: ['card-1', 'card-2'],
        faceUp: true,
        meta: { deckName: 'Player 1' },
      });

      flipCards(store, [id]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      expect(obj?._kind).toBe(ObjectKind.Stack);
      expect(obj?._pos).toEqual({ x: 100, y: 200, r: 45 });
      expect(obj?._meta).toEqual({ deckName: 'Player 1' });

      if (
        obj &&
        obj._kind === ObjectKind.Stack &&
        '_cards' in obj &&
        '_faceUp' in obj
      ) {
        expect(obj._cards).toEqual(['card-2', 'card-1']); // Card order reversed on flip
        expect(obj._faceUp).toBe(false);
      }
    });
  });

  describe('Stack Card Order', () => {
    it('reverses card order when flipping a stack', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
        cards: ['card-1', 'card-2', 'card-3'],
        faceUp: true,
      });

      flipCards(store, [id]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      if (
        obj &&
        obj._kind === ObjectKind.Stack &&
        '_cards' in obj &&
        '_faceUp' in obj
      ) {
        expect(obj._cards).toEqual(['card-3', 'card-2', 'card-1']); // Reversed
        expect(obj._faceUp).toBe(false);
      }
    });

    it('swaps top and bottom cards on flip', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
        cards: ['top-card', 'middle-1', 'middle-2', 'bottom-card'],
        faceUp: true,
      });

      flipCards(store, [id]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      if (obj && obj._kind === ObjectKind.Stack) {
        const stackObj = obj as StackObject;
        expect(stackObj._cards[0]).toBe('bottom-card'); // Was at bottom, now at top
        expect(stackObj._cards[stackObj._cards.length - 1]).toBe('top-card'); // Was at top, now at bottom
      }
    });

    it('reverses card order on each flip', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
        cards: ['card-1', 'card-2', 'card-3'],
        faceUp: true,
      });

      // First flip: face down, cards reversed
      flipCards(store, [id]);
      let obj = toTableObject(store.getObjectYMap(id)!);
      if (obj && obj._kind === ObjectKind.Stack && '_cards' in obj) {
        expect(obj._cards).toEqual(['card-3', 'card-2', 'card-1']);
      }

      // Second flip: face up, cards reversed again (back to original)
      flipCards(store, [id]);
      obj = toTableObject(store.getObjectYMap(id)!);
      if (obj && obj._kind === ObjectKind.Stack && '_cards' in obj) {
        expect(obj._cards).toEqual(['card-1', 'card-2', 'card-3']);
      }
    });

    it('handles single-card stacks', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
        cards: ['only-card'],
        faceUp: true,
      });

      flipCards(store, [id]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      if (obj && obj._kind === ObjectKind.Stack && '_cards' in obj) {
        expect(obj._cards).toEqual(['only-card']); // Single card stays same
      }
    });

    it('handles empty card arrays', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
        cards: [],
        faceUp: true,
      });

      flipCards(store, [id]);

      const obj = toTableObject(store.getObjectYMap(id)!);
      if (obj && obj._kind === ObjectKind.Stack && '_cards' in obj) {
        expect(obj._cards).toEqual([]); // Empty stays empty
      }
    });
  });
});

describe('YjsActions - stackObjects (M3.5-T3)', () => {
  let store: YjsStore;

  beforeEach(async () => {
    store = new YjsStore('test-table');
    await store.waitForReady();
  });

  afterEach(() => {
    if (store) {
      store.destroy();
    }
  });

  describe('Basic Stack Merging', () => {
    it('merges two stacks with target cards at bottom, source cards on top', () => {
      // Create target stack with 2 cards
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['target-1', 'target-2'],
        faceUp: true,
      });

      // Create source stack with 2 cards
      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 200, y: 200, r: 0 },
        cards: ['source-1', 'source-2'],
        faceUp: true,
      });

      const result = stackObjects(store, [sourceId], targetId);

      expect(result).toEqual([sourceId]);

      // Verify target stack has merged cards in correct order
      // Source cards on top (indices 0-1), target cards at bottom (indices 2-3)
      const targetObj = toTableObject(store.getObjectYMap(targetId)!);
      if (
        targetObj &&
        targetObj._kind === ObjectKind.Stack &&
        '_cards' in targetObj
      ) {
        expect(targetObj._cards).toEqual([
          'source-1',
          'source-2',
          'target-1',
          'target-2',
        ]);
      }

      // Verify source stack was deleted
      expect(store.getObjectYMap(sourceId)).toBeUndefined();
    });

    it('merges multiple stacks (3+)', () => {
      // Create target stack
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['target-1'],
        faceUp: true,
      });

      // Create source stacks
      const source1 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 200, y: 200, r: 0 },
        cards: ['source1-1', 'source1-2'],
        faceUp: true,
      });

      const source2 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 300, y: 300, r: 0 },
        cards: ['source2-1'],
        faceUp: true,
      });

      const source3 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 400, y: 400, r: 0 },
        cards: ['source3-1', 'source3-2', 'source3-3'],
        faceUp: true,
      });

      const result = stackObjects(store, [source1, source2, source3], targetId);

      expect(result).toEqual([source1, source2, source3]);

      // Verify target stack has all cards (sources on top, target at bottom)
      const targetObj = toTableObject(store.getObjectYMap(targetId)!);
      if (
        targetObj &&
        targetObj._kind === ObjectKind.Stack &&
        '_cards' in targetObj
      ) {
        expect(targetObj._cards).toEqual([
          'source1-1',
          'source1-2',
          'source2-1',
          'source3-1',
          'source3-2',
          'source3-3',
          'target-1',
        ]);
      }

      // Verify all source stacks were deleted
      expect(store.getObjectYMap(source1)).toBeUndefined();
      expect(store.getObjectYMap(source2)).toBeUndefined();
      expect(store.getObjectYMap(source3)).toBeUndefined();
    });

    it('uses first id as target when targetId not provided', () => {
      const stack1 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['stack1-1', 'stack1-2'],
        faceUp: true,
      });

      const stack2 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 200, y: 200, r: 0 },
        cards: ['stack2-1'],
        faceUp: true,
      });

      const stack3 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 300, y: 300, r: 0 },
        cards: ['stack3-1'],
        faceUp: true,
      });

      // No targetId provided - should use first id (stack1)
      const result = stackObjects(store, [stack1, stack2, stack3]);

      expect(result).toEqual([stack2, stack3]);

      // Verify stack1 is the target and has merged cards (sources on top)
      const stack1Obj = toTableObject(store.getObjectYMap(stack1)!);
      if (
        stack1Obj &&
        stack1Obj._kind === ObjectKind.Stack &&
        '_cards' in stack1Obj
      ) {
        expect(stack1Obj._cards).toEqual([
          'stack2-1',
          'stack3-1',
          'stack1-1',
          'stack1-2',
        ]);
      }

      // Verify stack2 and stack3 were deleted
      expect(store.getObjectYMap(stack2)).toBeUndefined();
      expect(store.getObjectYMap(stack3)).toBeUndefined();
    });
  });

  describe('Target State Wins', () => {
    it('merged stack adopts target _faceUp state', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['target-1'],
        faceUp: false, // Face down
      });

      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 200, y: 200, r: 0 },
        cards: ['source-1'],
        faceUp: true, // Face up (different from target)
      });

      stackObjects(store, [sourceId], targetId);

      const targetObj = toTableObject(store.getObjectYMap(targetId)!);
      if (
        targetObj &&
        targetObj._kind === ObjectKind.Stack &&
        '_faceUp' in targetObj
      ) {
        expect(targetObj._faceUp).toBe(false); // Should still be face down
      }
    });

    it('merged stack preserves target rotation (exhausted state)', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 90 }, // Exhausted
        cards: ['target-1'],
        faceUp: true,
      });

      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 200, y: 200, r: 0 }, // Ready (different from target)
        cards: ['source-1'],
        faceUp: true,
      });

      stackObjects(store, [sourceId], targetId);

      const targetObj = toTableObject(store.getObjectYMap(targetId)!);
      expect(targetObj?._pos.r).toBe(90); // Should still be exhausted
    });

    it('merged stack preserves target position', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 123, y: 456, r: 45 },
        cards: ['target-1'],
        faceUp: true,
      });

      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 789, y: 101, r: 0 },
        cards: ['source-1'],
        faceUp: true,
      });

      stackObjects(store, [sourceId], targetId);

      const targetObj = toTableObject(store.getObjectYMap(targetId)!);
      expect(targetObj?._pos).toEqual({ x: 123, y: 456, r: 45 });
    });
  });

  describe('Error Handling', () => {
    it('throws error when targetId appears in ids array', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['target-1'],
        faceUp: true,
      });

      expect(() => {
        stackObjects(store, [targetId], targetId);
      }).toThrow('targetId cannot appear in ids array');
    });

    it('throws error when ids array is empty and no targetId', () => {
      expect(() => {
        stackObjects(store, []);
      }).toThrow('No target stack specified and ids array is empty');
    });

    it('throws error when target stack not found', () => {
      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['source-1'],
        faceUp: true,
      });

      expect(() => {
        stackObjects(store, [sourceId], 'non-existent-target');
      }).toThrow('Target stack non-existent-target not found');
    });

    it('throws error when target is not a stack', () => {
      const tokenId = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 100, y: 100, r: 0 },
      });

      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 200, y: 200, r: 0 },
        cards: ['source-1'],
        faceUp: true,
      });

      expect(() => {
        stackObjects(store, [sourceId], tokenId);
      }).toThrow(/Target .* is not a stack/);
    });

    it('warns and skips non-existent source stacks', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['target-1'],
        faceUp: true,
      });

      const validSourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 200, y: 200, r: 0 },
        cards: ['source-1'],
        faceUp: true,
      });

      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const result = stackObjects(
        store,
        [validSourceId, 'non-existent'],
        targetId,
      );

      expect(result).toEqual([validSourceId]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[stackObjects] Source stack non-existent not found, skipping',
      );

      consoleWarnSpy.mockRestore();
    });

    it('warns and skips non-stack source objects', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['target-1'],
        faceUp: true,
      });

      const tokenId = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 200, y: 200, r: 0 },
      });

      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const result = stackObjects(store, [tokenId], targetId);

      expect(result).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('is not a stack'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('returns empty array when no valid source stacks', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['target-1'],
        faceUp: true,
      });

      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const result = stackObjects(store, ['non-existent'], targetId);

      expect(result).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[stackObjects] No valid source stacks to merge',
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty source stack (no cards)', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['target-1'],
        faceUp: true,
      });

      const emptySourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 200, y: 200, r: 0 },
        cards: [], // Empty
        faceUp: true,
      });

      const result = stackObjects(store, [emptySourceId], targetId);

      // Empty sources should be skipped (no cards to add)
      expect(result).toEqual([]);

      const targetObj = toTableObject(store.getObjectYMap(targetId)!);
      if (
        targetObj &&
        targetObj._kind === ObjectKind.Stack &&
        '_cards' in targetObj
      ) {
        expect(targetObj._cards).toEqual(['target-1']); // Unchanged
      }
    });

    it('handles target with many cards', () => {
      const manyCards = Array.from({ length: 100 }, (_, i) => `card-${i}`);
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: manyCards,
        faceUp: true,
      });

      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 200, y: 200, r: 0 },
        cards: ['source-1', 'source-2'],
        faceUp: true,
      });

      stackObjects(store, [sourceId], targetId);

      const targetObj = toTableObject(store.getObjectYMap(targetId)!);
      if (
        targetObj &&
        targetObj._kind === ObjectKind.Stack &&
        '_cards' in targetObj
      ) {
        const cards = (targetObj as { _cards: string[] })._cards;
        expect(cards.length).toBe(102);
        // Source cards should be on top (at beginning of array)
        expect(cards.slice(0, 2)).toEqual(['source-1', 'source-2']);
        // Last 2 target cards should be at the end
        expect(cards.slice(-2)).toEqual(['card-98', 'card-99']);
      }
    });
  });

  describe('Transaction Atomicity', () => {
    it('uses single transaction for atomic merge', async () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['target-1'],
        faceUp: true,
      });

      const source1 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 200, y: 200, r: 0 },
        cards: ['source1-1'],
        faceUp: true,
      });

      const source2 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 300, y: 300, r: 0 },
        cards: ['source2-1'],
        faceUp: true,
      });

      // Wait for create events
      await new Promise((resolve) => setTimeout(resolve, 10));

      const callback = vi.fn();
      store.onObjectsChange(callback);

      stackObjects(store, [source1, source2], targetId);

      // Wait for Yjs to trigger observers
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should be called once with all changes (atomic transaction)
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});

describe('YjsActions - unstackCard', () => {
  let store: YjsStore;

  beforeEach(async () => {
    store = new YjsStore('test-table');
    await store.waitForReady();
  });

  afterEach(() => {
    if (store) {
      store.destroy();
    }
  });

  describe('Basic Unstacking', () => {
    it('extracts top card from multi-card stack', () => {
      // Create source stack with 3 cards
      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
        cards: ['card-1', 'card-2', 'card-3'],
        faceUp: true,
      });

      // Unstack top card
      const newStackId = unstackCard(store, sourceId, { x: 150, y: 250, r: 0 });

      expect(newStackId).not.toBeNull();
      expect(typeof newStackId).toBe('string');

      // Verify new stack has only the top card
      const newStack = toTableObject(store.getObjectYMap(newStackId!)!);
      expect(newStack?._kind).toBe(ObjectKind.Stack);
      expect(newStack?._pos.x).toBe(150);
      expect(newStack?._pos.y).toBe(250);
      if (
        newStack &&
        newStack._kind === ObjectKind.Stack &&
        '_cards' in newStack
      ) {
        expect(newStack._cards).toEqual(['card-1']);
      }

      // Verify source stack has remaining cards
      const sourceStack = toTableObject(store.getObjectYMap(sourceId)!);
      expect(sourceStack).not.toBeNull();
      if (
        sourceStack &&
        sourceStack._kind === ObjectKind.Stack &&
        '_cards' in sourceStack
      ) {
        expect(sourceStack._cards).toEqual(['card-2', 'card-3']);
      }
    });

    it('extracts last card and deletes source stack', () => {
      // Create source stack with 1 card
      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
        cards: ['only-card'],
        faceUp: true,
      });

      // Unstack the only card
      const newStackId = unstackCard(store, sourceId, { x: 150, y: 250, r: 0 });

      expect(newStackId).not.toBeNull();

      // Verify new stack exists with the card
      const newStack = toTableObject(store.getObjectYMap(newStackId!)!);
      expect(newStack?._kind).toBe(ObjectKind.Stack);
      if (
        newStack &&
        newStack._kind === ObjectKind.Stack &&
        '_cards' in newStack
      ) {
        expect(newStack._cards).toEqual(['only-card']);
      }

      // Verify source stack was deleted
      const sourceStack = store.getObjectYMap(sourceId);
      expect(sourceStack).toBeUndefined();
    });

    it('inherits face-up state from source stack', () => {
      // Create face-down source stack
      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
        cards: ['card-1', 'card-2'],
        faceUp: false,
      });

      // Unstack top card
      const newStackId = unstackCard(store, sourceId, { x: 150, y: 250, r: 0 });

      // Verify new stack is face-down
      const newStack = toTableObject(store.getObjectYMap(newStackId!)!);
      if (
        newStack &&
        newStack._kind === ObjectKind.Stack &&
        '_faceUp' in newStack
      ) {
        expect(newStack._faceUp).toBe(false);
      }
    });

    it('inherits rotation from source stack', () => {
      // Create exhausted (rotated) source stack
      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 90 },
        cards: ['card-1', 'card-2'],
        faceUp: true,
      });

      // Unstack top card (requested position has r: 0, but should inherit r: 90)
      const newStackId = unstackCard(store, sourceId, { x: 150, y: 250, r: 0 });

      // Verify new stack has inherited rotation
      const newStack = toTableObject(store.getObjectYMap(newStackId!)!);
      expect(newStack?._pos.r).toBe(90);
    });
  });

  describe('Error Handling', () => {
    it('returns null if stack not found', () => {
      const result = unstackCard(store, 'non-existent', {
        x: 150,
        y: 250,
        r: 0,
      });

      expect(result).toBeNull();
    });

    it('returns null if object is not a stack', () => {
      // Create a token (not a stack)
      const tokenId = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 100, y: 200, r: 0 },
        meta: { color: 'red' },
      });

      const result = unstackCard(store, tokenId, { x: 150, y: 250, r: 0 });

      expect(result).toBeNull();
    });
  });

  describe('Transaction Atomicity', () => {
    it('executes unstack in single transaction', async () => {
      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
        cards: ['card-1', 'card-2'],
        faceUp: true,
      });

      // Wait for create event
      await new Promise((resolve) => setTimeout(resolve, 10));

      const callback = vi.fn();
      store.onObjectsChange(callback);

      unstackCard(store, sourceId, { x: 150, y: 250, r: 0 });

      // Wait for Yjs to trigger observers
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should be called once with all changes (atomic transaction)
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Z-Order', () => {
    it('creates new stack on top of existing objects', () => {
      // Create source stack
      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
        cards: ['card-1', 'card-2'],
        faceUp: true,
      });

      // Get source sortKey
      const sourceStack = toTableObject(store.getObjectYMap(sourceId)!);
      const sourceSortKey = sourceStack?._sortKey;

      // Unstack
      const newStackId = unstackCard(store, sourceId, { x: 150, y: 250, r: 0 });

      // New stack should have higher sortKey
      const newStack = toTableObject(store.getObjectYMap(newStackId!)!);
      const newSortKey = newStack?._sortKey;

      expect(newSortKey).toBeDefined();
      expect(sourceSortKey).toBeDefined();
      if (newSortKey && sourceSortKey) {
        expect(newSortKey > sourceSortKey).toBe(true);
      }
    });
  });
});

describe('Concurrent Operations', () => {
  let store: YjsStore;

  beforeEach(async () => {
    store = new YjsStore('test-concurrent-table');
    await store.waitForReady();
  });

  afterEach(() => {
    if (store) {
      store.destroy();
    }
  });

  describe('stackObjects race conditions', () => {
    it('handles concurrent stack operations on same objects', () => {
      // Create three stacks
      const stack1 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['card-1'],
        faceUp: true,
      });
      const stack2 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 200, y: 100, r: 0 },
        cards: ['card-2'],
        faceUp: true,
      });
      const stack3 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 300, y: 100, r: 0 },
        cards: ['card-3'],
        faceUp: true,
      });

      // Simulate two actors trying to stack same objects concurrently
      // Actor 1: stack1 + stack2 -> stack1
      // Actor 2: stack2 + stack3 -> stack2
      // One should succeed, one should fail (stack2 gets deleted by first operation)

      // Use separate transactions to simulate concurrent operations
      let actor1Success = false;
      let actor2Success = false;

      try {
        store.getDoc().transact(() => {
          stackObjects(store, [stack2], stack1);
        });
        actor1Success = true;
      } catch {
        // Expected: might fail if stack2 already deleted
      }

      try {
        store.getDoc().transact(() => {
          stackObjects(store, [stack3], stack2);
        });
        actor2Success = true;
      } catch {
        // Expected: might fail if stack2 already deleted
      }

      // Verify: At least one operation should succeed
      // If both succeed, it means operations didn't conflict
      // If one fails, it's because stack2 was deleted
      expect(actor1Success || actor2Success).toBe(true);

      // Verify stack integrity: deleted stacks should not exist
      if (actor1Success) {
        expect(store.getObjectYMap(stack2)).toBeUndefined();
      }
      if (actor2Success) {
        expect(store.getObjectYMap(stack3)).toBeUndefined();
      }
    });

    it('handles stack operation on object being deleted', async () => {
      // Create two stacks
      const stack1 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['card-1'],
        faceUp: true,
      });
      const stack2 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 200, y: 100, r: 0 },
        cards: ['card-2'],
        faceUp: true,
      });

      // Wait for objects to be created
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate concurrent operations:
      // Actor 1: Delete stack2
      // Actor 2: Stack stack2 onto stack1
      let deleteSuccess = false;

      try {
        store.getDoc().transact(() => {
          store.deleteObject(stack2);
        });
        deleteSuccess = true;
      } catch {
        // Unexpected
      }

      try {
        store.getDoc().transact(() => {
          stackObjects(store, [stack2], stack1);
        });
        // Stack operation may succeed or fail depending on timing
      } catch {
        // Expected: stack2 no longer exists
      }

      // Delete should always succeed
      expect(deleteSuccess).toBe(true);

      // Stack2 should be deleted regardless of stack operation outcome
      // Note: Current implementation doesn't validate existence before transaction
      // so this test documents current behavior
      expect(store.getObjectYMap(stack2)).toBeUndefined();
    });
  });

  describe('unstackCard race conditions', () => {
    it('handles concurrent unstack operations on same stack', async () => {
      // Create stack with 3 cards
      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['card-1', 'card-2', 'card-3'],
        faceUp: true,
      });

      // Wait for object to be created
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate two actors unstacking concurrently
      let newStack1: string | null = null;
      let newStack2: string | null = null;

      // First unstack (should succeed)
      newStack1 = unstackCard(store, stackId, { x: 200, y: 100, r: 0 });

      // Second unstack (should also succeed - different top card now)
      newStack2 = unstackCard(store, stackId, { x: 300, y: 100, r: 0 });

      // Both operations should succeed
      expect(newStack1).not.toBeNull();
      expect(newStack2).not.toBeNull();

      // Verify first new stack has card-1 (was top)
      const stack1Obj = toTableObject(store.getObjectYMap(newStack1!)!);
      if (stack1Obj && stack1Obj._kind === ObjectKind.Stack) {
        expect((stack1Obj as StackObject)._cards).toEqual(['card-1']);
      }

      // Verify second new stack has card-2 (became top after first unstack)
      const stack2Obj = toTableObject(store.getObjectYMap(newStack2!)!);
      if (stack2Obj && stack2Obj._kind === ObjectKind.Stack) {
        expect((stack2Obj as StackObject)._cards).toEqual(['card-2']);
      }

      // Verify source stack still exists with 1 card remaining
      const sourceObj = toTableObject(store.getObjectYMap(stackId)!);
      expect(sourceObj).toBeDefined();
      if (sourceObj && sourceObj._kind === ObjectKind.Stack) {
        expect((sourceObj as StackObject)._cards).toEqual(['card-3']);
      }
    });

    it('handles unstack on stack being deleted', async () => {
      // Create stack with 2 cards
      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['card-1', 'card-2'],
        faceUp: true,
      });

      // Wait for object to be created
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Delete the stack
      store.deleteObject(stackId);

      // Try to unstack (should fail gracefully)
      const result = unstackCard(store, stackId, { x: 200, y: 100, r: 0 });

      // Should return null (stack not found)
      expect(result).toBeNull();
    });
  });
});
