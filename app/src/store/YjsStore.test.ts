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
      const objects = store.objects;
      expect(objects.size).toBe(0);
    });

    it('can add and retrieve a stack object', () => {
      store.setObject('stack-1', testStack);
      const retrieved = store.getObjectYMap('stack-1')?.toJSON();
      expect(retrieved).toEqual(testStack);
    });

    it('can add and retrieve a token object', () => {
      store.setObject('token-1', testToken);
      const retrieved = store.getObjectYMap('token-1')?.toJSON();
      expect(retrieved).toEqual(testToken);
    });

    it('returns null for non-existent objects', () => {
      const retrieved = store.getObjectYMap('does-not-exist')?.toJSON();
      expect(retrieved).toBeUndefined();
    });

    it('can update an existing object', () => {
      store.setObject('stack-1', testStack);

      const updated: StackObject = {
        ...testStack,
        _pos: { x: 300, y: 400, r: 0 },
        _faceUp: false,
      };

      store.setObject('stack-1', updated);
      const retrieved = store.getObjectYMap('stack-1')?.toJSON();
      expect(retrieved?._pos).toEqual({ x: 300, y: 400, r: 0 });
      if (retrieved && retrieved._kind === ObjectKind.Stack) {
        expect((retrieved as StackObject)._faceUp).toBe(false);
      }
    });

    it('can delete an object', () => {
      store.setObject('stack-1', testStack);
      expect(store.getObjectYMap('stack-1')?.toJSON()).toEqual(testStack);

      store.deleteObject('stack-1');
      expect(store.getObjectYMap('stack-1')?.toJSON()).toBeUndefined();
    });

    it('objects property returns all stored objects', () => {
      store.setObject('stack-1', testStack);
      store.setObject('token-1', testToken);

      const allObjects = store.objects;
      expect(allObjects.size).toBe(2);
      expect(allObjects.get('stack-1')?.toJSON()).toEqual(testStack);
      expect(allObjects.get('token-1')?.toJSON()).toEqual(testToken);
    });

    it('can clear all objects', () => {
      store.setObject('stack-1', testStack);
      store.setObject('token-1', testToken);
      expect(store.objects.size).toBe(2);

      store.clearAllObjects();
      expect(store.objects.size).toBe(0);
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

  // NOTE: Stale selection clearing is tested in E2E tests (selection.spec.ts)
  // where real IndexedDB persistence works. Unit tests use mocked persistence
  // which doesn't actually persist data between store instances.

  describe('Awareness (M3-T4)', () => {
    it('sets cursor position in awareness', () => {
      store.setCursor(100, 200);

      const localState = store.getLocalAwarenessState();
      expect(localState).toBeDefined();
      expect(localState?.cursor).toEqual({ x: 100, y: 200 });
      expect(localState?.actorId).toBe(store.getActorId());
    });

    it('clears cursor position', () => {
      store.setCursor(100, 200);
      expect(store.getLocalAwarenessState()?.cursor).toBeDefined();

      store.clearCursor();
      const localState = store.getLocalAwarenessState();
      expect(localState?.cursor).toBeNull();
    });

    it('sets drag state in awareness', () => {
      const dragState = {
        gid: 'gesture-123',
        primaryId: 'obj-1',
        pos: { x: 150, y: 250, r: 45 },
        secondaryOffsets: {
          'obj-2': { dx: 10, dy: 20, dr: 5 },
        },
      };

      store.setDragState(
        dragState.gid,
        dragState.primaryId,
        dragState.pos,
        dragState.secondaryOffsets,
      );

      const localState = store.getLocalAwarenessState();
      expect(localState?.drag).toBeDefined();
      expect(localState?.drag?.gid).toBe(dragState.gid);
      expect(localState?.drag?.primaryId).toBe(dragState.primaryId);
      expect(localState?.drag?.pos).toEqual(dragState.pos);
      expect(localState?.drag?.secondaryOffsets).toEqual(
        dragState.secondaryOffsets,
      );
      expect(localState?.drag?.ts).toBeDefined();
    });

    it('clears drag state', () => {
      store.setDragState('gesture-123', 'obj-1', { x: 100, y: 100, r: 0 });
      expect(store.getLocalAwarenessState()?.drag).toBeDefined();

      store.clearDragState();
      const localState = store.getLocalAwarenessState();
      expect(localState?.drag).toBeNull();
    });

    it('triggers awareness change callback when cursor is set', async () => {
      const callback = vi.fn();

      const unsubscribe = store.onAwarenessChange(callback);
      store.setCursor(50, 75);

      // Wait for callback to be invoked
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalled();
      const states = callback.mock.calls[0][0] as Map<
        number,
        { cursor?: { x: number; y: number } }
      >;

      // Should receive our own awareness state
      expect(states.size).toBeGreaterThan(0);

      // Find our state
      const localClientId = store.getDoc().clientID;
      const ourState = states.get(localClientId);
      expect(ourState).toBeDefined();
      expect(ourState?.cursor).toEqual({ x: 50, y: 75 });

      unsubscribe();
    });

    it('triggers awareness change callback when drag is set', async () => {
      const callback = vi.fn();

      const unsubscribe = store.onAwarenessChange(callback);
      store.setDragState('g1', 'obj-123', { x: 0, y: 0, r: 0 });

      // Wait for callback to be invoked
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalled();
      const states = callback.mock.calls[0][0] as Map<
        number,
        { drag?: { primaryId: string } }
      >;

      const localClientId = store.getDoc().clientID;
      const ourState = states.get(localClientId);

      expect(ourState?.drag).toBeDefined();
      expect(ourState?.drag?.primaryId).toEqual('obj-123');

      unsubscribe();
    });

    it('unsubscribes from awareness changes', async () => {
      const callback = vi.fn();
      const unsubscribe = store.onAwarenessChange(callback);

      store.setCursor(10, 20);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const firstCallCount = callback.mock.calls.length;

      unsubscribe();
      store.setCursor(30, 40);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const secondCallCount = callback.mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount);
    });

    it('gets remote awareness states (excluding local)', () => {
      // Manually inject a fake remote state
      const fakeClientId = 999999;
      store.awareness.states.set(fakeClientId, {
        actorId: 'fake-actor',
        cursor: { x: 100, y: 200 },
      });

      const remoteStates = store.getRemoteAwarenessStates();

      // Should have the fake remote state
      expect(remoteStates.has(fakeClientId)).toBe(true);

      // Should NOT have our local state
      const localClientId = store.getDoc().clientID;
      expect(remoteStates.has(localClientId)).toBe(false);

      // Clean up
      store.awareness.states.delete(fakeClientId);
    });

    it('combines cursor and drag in awareness state', () => {
      store.setCursor(100, 200);
      store.setDragState('g1', 'obj-1', { x: 50, y: 50, r: 0 });

      const localState = store.getLocalAwarenessState();
      expect(localState?.cursor).toEqual({ x: 100, y: 200 });
      expect(localState?.drag).toBeDefined();
      expect(localState?.drag?.primaryId).toEqual('obj-1');
    });
  });

  describe('GameAssets Management', () => {
    const mockGameAssets = {
      packs: [],
      cardTypes: {
        hero: {
          size: 'standard' as const,
          back: '/assets/hero-back.jpg',
        },
      },
      cards: {
        HERO001: {
          type: 'hero',
          face: '/assets/hero001.jpg',
        },
        VILLAIN001: {
          type: 'villain',
          face: '/assets/villain001.jpg',
        },
      },
      cardSets: {},
      tokens: {},
      counters: {},
      mats: {},
      tokenTypes: {},
      statusTypes: {},
      modifierStats: {},
      iconTypes: {},
    };

    it('starts with no gameAssets', () => {
      const assets = store.getGameAssets();
      expect(assets).toBeNull();
    });

    it('can set and retrieve gameAssets', () => {
      store.setGameAssets(mockGameAssets);
      const retrieved = store.getGameAssets();
      expect(retrieved).toEqual(mockGameAssets);
    });

    it('can update gameAssets', () => {
      store.setGameAssets(mockGameAssets);

      const updatedAssets = {
        ...mockGameAssets,
        cards: {
          ...mockGameAssets.cards,
          HERO002: {
            type: 'hero',
            face: '/assets/hero002.jpg',
          },
        },
      };

      store.setGameAssets(updatedAssets);
      const retrieved = store.getGameAssets();
      expect(retrieved?.cards).toEqual(updatedAssets.cards);
      expect(Object.keys(retrieved?.cards || {})).toHaveLength(3);
    });

    it('notifies listeners when gameAssets are set', () => {
      const listener = vi.fn();
      store.onGameAssetsChange(listener);

      // Listener should be called immediately with null
      expect(listener).toHaveBeenCalledWith(null);

      listener.mockClear();

      // Set gameAssets
      store.setGameAssets(mockGameAssets);

      // Listener should be called with new assets
      expect(listener).toHaveBeenCalledWith(mockGameAssets);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('calls listener immediately with current gameAssets on subscribe', () => {
      // Set assets before subscribing
      store.setGameAssets(mockGameAssets);

      const listener = vi.fn();
      store.onGameAssetsChange(listener);

      // Should be called immediately with current assets
      expect(listener).toHaveBeenCalledWith(mockGameAssets);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      store.onGameAssetsChange(listener1);
      store.onGameAssetsChange(listener2);

      listener1.mockClear();
      listener2.mockClear();

      store.setGameAssets(mockGameAssets);

      expect(listener1).toHaveBeenCalledWith(mockGameAssets);
      expect(listener2).toHaveBeenCalledWith(mockGameAssets);
    });

    it('can unsubscribe from gameAssets changes', () => {
      const listener = vi.fn();
      const unsubscribe = store.onGameAssetsChange(listener);

      listener.mockClear();

      // Set assets
      store.setGameAssets(mockGameAssets);
      expect(listener).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();
      listener.mockClear();

      // Update assets
      const updatedAssets = {
        ...mockGameAssets,
        cards: {},
      };
      store.setGameAssets(updatedAssets);

      // Listener should not be called
      expect(listener).not.toHaveBeenCalled();
    });

    it('isolates listener errors (one failing listener does not affect others)', () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      let callCount = 0;
      const failingListener = vi.fn().mockImplementation(() => {
        // Only throw on second call (during setGameAssets, not initial subscription)
        callCount++;
        if (callCount > 1) {
          throw new Error('Listener error');
        }
      });
      const workingListener = vi.fn();

      store.onGameAssetsChange(failingListener);
      store.onGameAssetsChange(workingListener);

      failingListener.mockClear();
      workingListener.mockClear();

      // Set assets
      store.setGameAssets(mockGameAssets);

      // Failing listener should have been called
      expect(failingListener).toHaveBeenCalledWith(mockGameAssets);

      // Working listener should still be called despite first one failing
      expect(workingListener).toHaveBeenCalledWith(mockGameAssets);

      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[YjsStore] GameAssets listener failed',
        expect.objectContaining({
          errorId: 'STORE_GAMEASSETS_LISTENER_FAILED',
          error: expect.any(Error) as Error,
          listenerCount: 2,
          errorMessage: 'Listener error',
        }),
      );

      consoleErrorSpy.mockRestore();
    });

    it('logs non-Error exceptions from listeners', () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      let callCount = 0;
      const failingListener = vi.fn().mockImplementation(() => {
        // Only throw on second call (during setGameAssets, not initial subscription)
        callCount++;
        if (callCount > 1) {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'String error';
        }
      });

      store.onGameAssetsChange(failingListener);
      failingListener.mockClear();

      store.setGameAssets(mockGameAssets);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[YjsStore] GameAssets listener failed',
        expect.objectContaining({
          errorId: 'STORE_GAMEASSETS_LISTENER_FAILED',
          errorMessage: 'String error',
        }),
      );

      consoleErrorSpy.mockRestore();
    });

    it('handles multiple updates correctly', () => {
      const listener = vi.fn();
      store.onGameAssetsChange(listener);

      listener.mockClear();

      // First update
      store.setGameAssets(mockGameAssets);
      expect(listener).toHaveBeenCalledWith(mockGameAssets);

      listener.mockClear();

      // Second update
      const updatedAssets = {
        ...mockGameAssets,
        cards: {
          HERO003: {
            type: 'hero',
            face: '/assets/hero003.jpg',
          },
        },
      };
      store.setGameAssets(updatedAssets);
      expect(listener).toHaveBeenCalledWith(updatedAssets);

      listener.mockClear();

      // Third update
      const finalAssets = {
        ...mockGameAssets,
        cards: {},
      };
      store.setGameAssets(finalAssets);
      expect(listener).toHaveBeenCalledWith(finalAssets);
    });

    it('getGameAssets returns reference to actual assets (not a copy)', () => {
      store.setGameAssets(mockGameAssets);
      const retrieved1 = store.getGameAssets();
      const retrieved2 = store.getGameAssets();

      // Should return the same reference
      expect(retrieved1).toBe(retrieved2);
      expect(retrieved1).toBe(mockGameAssets);
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
