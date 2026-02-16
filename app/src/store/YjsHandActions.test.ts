import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YjsStore, toTableObject } from './YjsStore';
import { createObject } from './YjsActions';
import { moveCardToHand, moveCardToBoard } from './YjsHandActions';
import { ObjectKind, type StackObject } from '@cardtable2/shared';

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

describe('YjsHandActions', () => {
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

  describe('moveCardToHand', () => {
    it('moves top card from stack to hand', () => {
      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['card-1', 'card-2', 'card-3'],
        faceUp: true,
      });

      const handId = store.createHand('Test Hand');
      const result = moveCardToHand(store, stackId, 0, handId);

      expect(result).toBe('card-1');
      expect(store.getHandCards(handId)).toEqual(['card-1']);

      // Stack should still exist with remaining cards
      const yMap = store.getObjectYMap(stackId);
      expect(yMap).toBeDefined();
      expect(yMap!.get('_cards')).toEqual(['card-2', 'card-3']);
    });

    it('deletes stack when last card is moved to hand', () => {
      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['card-1'],
        faceUp: true,
      });

      const handId = store.createHand('Test Hand');
      const result = moveCardToHand(store, stackId, 0, handId);

      expect(result).toBe('card-1');
      expect(store.getHandCards(handId)).toEqual(['card-1']);

      // Stack should be deleted
      expect(store.getObjectYMap(stackId)).toBeUndefined();
    });

    it('moves card at specific index from stack', () => {
      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['card-1', 'card-2', 'card-3'],
        faceUp: true,
      });

      const handId = store.createHand('Test Hand');
      const result = moveCardToHand(store, stackId, 1, handId);

      expect(result).toBe('card-2');
      expect(store.getHandCards(handId)).toEqual(['card-2']);
      expect(store.getObjectYMap(stackId)!.get('_cards')).toEqual([
        'card-1',
        'card-3',
      ]);
    });

    it('inserts card at specific hand index', () => {
      const handId = store.createHand('Test Hand');
      store.addCardToHand(handId, 'existing-card');

      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['new-card'],
        faceUp: true,
      });

      moveCardToHand(store, stackId, 0, handId, 0);

      expect(store.getHandCards(handId)).toEqual(['new-card', 'existing-card']);
    });

    it('returns null for non-existent stack', () => {
      const handId = store.createHand('Test Hand');
      const result = moveCardToHand(store, 'non-existent', 0, handId);
      expect(result).toBeNull();
    });

    it('returns null for non-existent hand', () => {
      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['card-1'],
        faceUp: true,
      });

      const result = moveCardToHand(store, stackId, 0, 'non-existent');
      expect(result).toBeNull();
    });

    it('returns null for out-of-range card index', () => {
      const stackId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['card-1'],
        faceUp: true,
      });

      const handId = store.createHand('Test Hand');
      const result = moveCardToHand(store, stackId, 5, handId);
      expect(result).toBeNull();
    });
  });

  describe('moveCardToBoard', () => {
    it('creates a new stack from hand card', () => {
      const handId = store.createHand('Test Hand');
      store.addCardToHand(handId, 'card-1');
      store.addCardToHand(handId, 'card-2');

      const stackId = moveCardToBoard(
        store,
        handId,
        0,
        {
          x: 100,
          y: 200,
          r: 0,
        },
        true,
      );

      expect(stackId).toBeDefined();
      expect(stackId).not.toBeNull();

      // Card should be removed from hand
      expect(store.getHandCards(handId)).toEqual(['card-2']);

      // New stack should exist on board
      const obj = toTableObject(store.getObjectYMap(stackId!)!) as StackObject;
      expect(obj._kind).toBe(ObjectKind.Stack);
      expect(obj._pos).toEqual({ x: 100, y: 200, r: 0 });
      expect(obj._cards).toEqual(['card-1']);
      expect(obj._faceUp).toBe(true);
    });

    it('creates face-down stack when specified', () => {
      const handId = store.createHand('Test Hand');
      store.addCardToHand(handId, 'card-1');

      const stackId = moveCardToBoard(
        store,
        handId,
        0,
        {
          x: 0,
          y: 0,
          r: 0,
        },
        false,
      );

      const obj = toTableObject(store.getObjectYMap(stackId!)!) as StackObject;
      expect(obj._faceUp).toBe(false);
    });

    it('returns null for non-existent hand', () => {
      const result = moveCardToBoard(
        store,
        'non-existent',
        0,
        {
          x: 0,
          y: 0,
          r: 0,
        },
        true,
      );
      expect(result).toBeNull();
    });

    it('returns null for out-of-range card index', () => {
      const handId = store.createHand('Test Hand');
      store.addCardToHand(handId, 'card-1');

      const result = moveCardToBoard(
        store,
        handId,
        5,
        {
          x: 0,
          y: 0,
          r: 0,
        },
        true,
      );
      expect(result).toBeNull();
    });
  });
});

describe('YjsStore hand methods', () => {
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

  it('creates and retrieves a hand', () => {
    const handId = store.createHand('Hero 1');

    expect(handId).toBeDefined();
    expect(store.getHandName(handId)).toBe('Hero 1');
    expect(store.getHandCards(handId)).toEqual([]);
    expect(store.getHandIds()).toContain(handId);
  });

  it('deletes a hand', () => {
    const handId = store.createHand('Hero 1');
    store.deleteHand(handId);

    expect(store.getHandIds()).not.toContain(handId);
    expect(store.getHandName(handId)).toBe('');
  });

  it('renames a hand', () => {
    const handId = store.createHand('Hero 1');
    store.renameHand(handId, 'Hero 2');

    expect(store.getHandName(handId)).toBe('Hero 2');
  });

  it('adds cards to a hand', () => {
    const handId = store.createHand('Test');
    store.addCardToHand(handId, 'card-a');
    store.addCardToHand(handId, 'card-b');

    expect(store.getHandCards(handId)).toEqual(['card-a', 'card-b']);
  });

  it('inserts card at specific index', () => {
    const handId = store.createHand('Test');
    store.addCardToHand(handId, 'card-a');
    store.addCardToHand(handId, 'card-b');
    store.addCardToHand(handId, 'card-c', 1);

    expect(store.getHandCards(handId)).toEqual(['card-a', 'card-c', 'card-b']);
  });

  it('removes card from hand by index', () => {
    const handId = store.createHand('Test');
    store.addCardToHand(handId, 'card-a');
    store.addCardToHand(handId, 'card-b');
    store.addCardToHand(handId, 'card-c');

    const removed = store.removeCardFromHand(handId, 1);

    expect(removed).toBe('card-b');
    expect(store.getHandCards(handId)).toEqual(['card-a', 'card-c']);
  });

  it('returns null when removing from invalid index', () => {
    const handId = store.createHand('Test');
    store.addCardToHand(handId, 'card-a');

    expect(store.removeCardFromHand(handId, 5)).toBeNull();
    expect(store.removeCardFromHand(handId, -1)).toBeNull();
  });

  it('fires onHandsChange when hands are modified', () => {
    const callback = vi.fn();
    const unsubscribe = store.onHandsChange(callback);

    const handId = store.createHand('Test');
    expect(callback).toHaveBeenCalled();

    callback.mockClear();
    store.addCardToHand(handId, 'card-1');
    expect(callback).toHaveBeenCalled();

    callback.mockClear();
    store.deleteHand(handId);
    expect(callback).toHaveBeenCalled();

    unsubscribe();
  });
});
