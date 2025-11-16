import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YjsStore } from './YjsStore';
import type { TableObject, StackObject } from '@cardtable2/shared';
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

describe('YjsStore', () => {
  let store: YjsStore;
  const testTableId = 'test-table-123';

  beforeEach(async () => {
    store = new YjsStore(testTableId);
    await store.waitForReady();
  });

  afterEach(() => {
    if (store) {
      store.destroy();
    }
  });

  describe('Initialization', () => {
    it('creates a store with a unique actor ID', () => {
      const actorId = store.getActorId();
      expect(actorId).toBeDefined();
      expect(typeof actorId).toBe('string');
      expect(actorId.length).toBeGreaterThan(0);
    });

    it('generates different actor IDs for different stores', () => {
      const store2 = new YjsStore('another-table');
      const actorId1 = store.getActorId();
      const actorId2 = store2.getActorId();
      expect(actorId1).not.toBe(actorId2);
      store2.destroy();
    });

    it('waits for ready before resolving', async () => {
      const newStore = new YjsStore('wait-test-table');
      const readyPromise = newStore.waitForReady();
      expect(readyPromise).toBeInstanceOf(Promise);
      await readyPromise; // Should not hang
      newStore.destroy();
    });

    it('provides access to Y.Doc', () => {
      const doc = store.getDoc();
      expect(doc).toBeDefined();
      expect(doc.constructor.name).toBe('Doc');
    });
  });

  describe('Object Operations', () => {
    const testStack: StackObject = {
      _kind: ObjectKind.Stack,
      _containerId: 'table',
      _pos: { x: 100, y: 200, r: 0 },
      _sortKey: '1.0',
      _locked: false,
      _selectedBy: null,
      _meta: {},
      _cards: ['card-1', 'card-2'],
      _faceUp: true,
    };

    const testToken: TableObject = {
      _kind: ObjectKind.Token,
      _containerId: 'table',
      _pos: { x: 50, y: 75, r: 0 },
      _sortKey: '2.0',
      _locked: false,
      _selectedBy: null,
      _meta: { color: 'red' },
    };

    it('starts with no objects', () => {
      const objects = store.getAllObjects();
      expect(objects.size).toBe(0);
    });

    it('can add and retrieve a stack object', () => {
      store.setObject('stack-1', testStack);
      const retrieved = store.getObject('stack-1');
      expect(retrieved).toEqual(testStack);
    });

    it('can add and retrieve a token object', () => {
      store.setObject('token-1', testToken);
      const retrieved = store.getObject('token-1');
      expect(retrieved).toEqual(testToken);
    });

    it('returns null for non-existent objects', () => {
      const retrieved = store.getObject('does-not-exist');
      expect(retrieved).toBeNull();
    });

    it('can update an existing object', () => {
      store.setObject('stack-1', testStack);

      const updated: StackObject = {
        ...testStack,
        _pos: { x: 300, y: 400, r: 0 },
        _faceUp: false,
      };

      store.setObject('stack-1', updated);
      const retrieved = store.getObject('stack-1');
      expect(retrieved?._pos).toEqual({ x: 300, y: 400, r: 0 });
      if (retrieved && retrieved._kind === ObjectKind.Stack) {
        expect((retrieved as StackObject)._faceUp).toBe(false);
      }
    });

    it('can delete an object', () => {
      store.setObject('stack-1', testStack);
      expect(store.getObject('stack-1')).toEqual(testStack);

      store.deleteObject('stack-1');
      expect(store.getObject('stack-1')).toBeNull();
    });

    it('getAllObjects returns all stored objects', () => {
      store.setObject('stack-1', testStack);
      store.setObject('token-1', testToken);

      const allObjects = store.getAllObjects();
      expect(allObjects.size).toBe(2);
      expect(allObjects.get('stack-1')).toEqual(testStack);
      expect(allObjects.get('token-1')).toEqual(testToken);
    });

    it('can clear all objects', () => {
      store.setObject('stack-1', testStack);
      store.setObject('token-1', testToken);
      expect(store.getAllObjects().size).toBe(2);

      store.clearAllObjects();
      expect(store.getAllObjects().size).toBe(0);
    });
  });

  describe('Change Observers', () => {
    const testStack: StackObject = {
      _kind: ObjectKind.Stack,
      _containerId: 'table',
      _pos: { x: 100, y: 200, r: 0 },
      _sortKey: '1.0',
      _locked: false,
      _selectedBy: null,
      _meta: {},
      _cards: ['card-1'],
      _faceUp: true,
    };

    it('notifies observers when objects are added', async () => {
      const callback = vi.fn();
      store.onObjectsChange(callback);

      store.setObject('stack-1', testStack);

      // Wait for Yjs to trigger observers
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalled();
    });

    it('notifies observers when objects are updated', async () => {
      store.setObject('stack-1', testStack);

      const callback = vi.fn();
      store.onObjectsChange(callback);

      const updated = { ...testStack, _pos: { x: 300, y: 400, r: 0 } };
      store.setObject('stack-1', updated);

      // Wait for Yjs to trigger observers
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalled();
    });

    it('notifies observers when objects are deleted', async () => {
      store.setObject('stack-1', testStack);

      const callback = vi.fn();
      store.onObjectsChange(callback);

      store.deleteObject('stack-1');

      // Wait for Yjs to trigger observers
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalled();
    });

    it('notifies observers when all objects are cleared', async () => {
      store.setObject('stack-1', testStack);

      const callback = vi.fn();
      store.onObjectsChange(callback);

      store.clearAllObjects();

      // Wait for Yjs to trigger observers
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalled();
    });

    it('can unsubscribe from change notifications', async () => {
      const callback = vi.fn();
      const unsubscribe = store.onObjectsChange(callback);

      store.setObject('stack-1', testStack);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const firstCallCount = callback.mock.calls.length;

      unsubscribe();

      store.setObject('stack-2', testStack);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const secondCallCount = callback.mock.calls.length;

      // Should not have been called again after unsubscribe
      expect(secondCallCount).toBe(firstCallCount);
    });

    it('supports multiple observers', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      store.onObjectsChange(callback1);
      store.onObjectsChange(callback2);

      store.setObject('stack-1', testStack);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('can be safely destroyed', () => {
      const localStore = new YjsStore('destroy-test');
      expect(() => localStore.destroy()).not.toThrow();
    });

    it('can be destroyed multiple times without error', () => {
      const localStore = new YjsStore('destroy-multi-test');
      expect(() => {
        localStore.destroy();
        localStore.destroy();
      }).not.toThrow();
    });
  });
});
