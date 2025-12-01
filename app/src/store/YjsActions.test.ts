import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YjsStore, type ObjectChanges } from './YjsStore';
import {
  createObject,
  moveObjects,
  selectObjects,
  unselectObjects,
  clearAllSelections,
  exhaustCards,
  flipCards,
} from './YjsActions';
import { ObjectKind } from '@cardtable2/shared';

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

      const obj = store.getObject(id);
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

      const obj = store.getObject(id);
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

      const obj = store.getObject(id);
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

      const obj = store.getObject(id);
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

      const obj = store.getObject(id);
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

      const obj = store.getObject(id);
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

      const obj = store.getObject(id);
      expect(obj?._locked).toBe(true);
    });

    it('allows setting containerId', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
        containerId: 'zone-1',
      });

      const obj = store.getObject(id);
      expect(obj?._containerId).toBe('zone-1');
    });

    it('allows setting custom metadata', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
        meta: { health: 10, defense: 5, name: 'Guard' },
      });

      const obj = store.getObject(id);
      expect(obj?._meta).toEqual({ health: 10, defense: 5, name: 'Guard' });
    });

    it('allows setting faceUp=false for stacks', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        faceUp: false,
      });

      const obj = store.getObject(id);
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

      const obj = store.getObject(id);
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

      const obj1 = store.getObject(id1);
      const obj2 = store.getObject(id2);
      const obj3 = store.getObject(id3);

      // Higher sortKey = on top (lexicographic comparison for strings)
      expect(obj2!._sortKey > obj1!._sortKey).toBe(true);
      expect(obj3!._sortKey > obj2!._sortKey).toBe(true);
    });

    it('generates sortKeys in fractional indexing format', () => {
      const id = createObject(store, {
        kind: ObjectKind.Token,
        pos: { x: 0, y: 0, r: 0 },
      });

      const obj = store.getObject(id);
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

      expect(store.getAllObjects().size).toBe(3);

      const stack = store.getObject(stackId);
      const token = store.getObject(tokenId);
      const zone = store.getObject(zoneId);

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
      const allObjects = store.getAllObjects();
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

      const obj = store.getObject(id);
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

      const obj = store.getObject(id);
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

      const obj = store.getObject(id);
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

      const obj1 = store.getObject(id1);
      const obj2 = store.getObject(id2);
      const obj3 = store.getObject(id3);

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

      const obj1 = store.getObject(id1);
      const obj2 = store.getObject(id2);

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

      const obj = store.getObject(id);
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

      const obj = store.getObject(id);
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
      const obj = store.getObject(validId);
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
        expect(changes.updated[0]?.obj._pos).toEqual({ x: 100, y: 100, r: 0 });
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

      const obj = store.getObject(id);
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

      const obj1 = store.getObject(id1);
      const obj2 = store.getObject(id2);
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
      const obj = store.getObject(id);
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

      const obj = store.getObject(id);
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

      const obj = store.getObject(id);
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

      const obj1 = store.getObject(id1);
      const obj2 = store.getObject(id2);
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

      const obj = store.getObject(id);
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

      const obj1 = store.getObject(id1);
      const obj2 = store.getObject(id2);
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

      const obj = store.getObject(id);
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

      const obj1 = store.getObject(id1);
      const obj2 = store.getObject(id2);
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

      const obj1 = store.getObject(id1);
      const obj2 = store.getObject(id2);
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
      expect(store.getAllObjects().size).toBe(2); // Both objects still exist
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

      const obj = store.getObject(id);
      expect(obj?._pos.r).toBe(90);
    });

    it('readies an exhausted card (rotates back to 0°)', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 90 },
      });

      const result = exhaustCards(store, [id]);

      expect(result).toEqual([id]);

      const obj = store.getObject(id);
      expect(obj?._pos.r).toBe(0);
    });

    it('toggles multiple times correctly', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 200, r: 0 },
      });

      // Exhaust
      exhaustCards(store, [id]);
      expect(store.getObject(id)?._pos.r).toBe(90);

      // Ready
      exhaustCards(store, [id]);
      expect(store.getObject(id)?._pos.r).toBe(0);

      // Exhaust again
      exhaustCards(store, [id]);
      expect(store.getObject(id)?._pos.r).toBe(90);
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
      expect(store.getObject(id1)?._pos.r).toBe(90);
      expect(store.getObject(id2)?._pos.r).toBe(90);
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
      expect(store.getObject(id1)?._pos.r).toBe(90); // Now exhausted
      expect(store.getObject(id2)?._pos.r).toBe(0); // Now ready
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
      expect(store.getObject(stackId)?._pos.r).toBe(90);
      expect(store.getObject(tokenId)?._pos.r).toBe(0); // Unchanged
    });

    it('skips zones', () => {
      const zoneId = createObject(store, {
        kind: ObjectKind.Zone,
        pos: { x: 0, y: 0, r: 0 },
      });

      const result = exhaustCards(store, [zoneId]);

      expect(result).toEqual([]);
      expect(store.getObject(zoneId)?._pos.r).toBe(0); // Unchanged
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
      expect(store.getObject(id)?._pos.r).toBe(0); // Readied
    });

    it('treats 89.95° as exhausted (within tolerance)', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 89.95 },
      });

      const result = exhaustCards(store, [id]);

      expect(result).toEqual([id]);
      expect(store.getObject(id)?._pos.r).toBe(0); // Readied
    });

    it('treats 45° as ready (not exhausted)', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 45 },
      });

      const result = exhaustCards(store, [id]);

      expect(result).toEqual([id]);
      expect(store.getObject(id)?._pos.r).toBe(90); // Exhausted
    });

    it('normalizes rotation to prevent drift', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
      });

      // Exhaust
      exhaustCards(store, [id]);
      const rotation1 = store.getObject(id)?._pos.r;
      expect(rotation1).toBe(90);

      // Ready
      exhaustCards(store, [id]);
      const rotation2 = store.getObject(id)?._pos.r;
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
      expect(store.getObject(validId)?._pos.r).toBe(90);
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

      const obj = store.getObject(id);
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

      const obj = store.getObject(id);
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

      const obj = store.getObject(id);
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

      const obj = store.getObject(id);
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
      let obj = store.getObject(id);
      if (obj && obj._kind === ObjectKind.Stack && '_faceUp' in obj) {
        expect(obj._faceUp).toBe(false);
      }

      // Flip to face up
      flipCards(store, [id]);
      obj = store.getObject(id);
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

      const obj1 = store.getObject(stack1);
      const obj2 = store.getObject(stack2);
      const obj3 = store.getObject(token);

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

      const obj = store.getObject(id);
      expect(obj?._kind).toBe(ObjectKind.Stack);
      expect(obj?._pos).toEqual({ x: 100, y: 200, r: 45 });
      expect(obj?._meta).toEqual({ deckName: 'Player 1' });

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
