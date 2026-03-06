import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YjsStore, toTableObject } from './YjsStore';
import {
  createObject,
  moveObjects,
  attachCards,
  detachCard,
  detachAllCards,
} from './YjsActions';
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

describe('Card-on-Card Attachment Actions', () => {
  let store: YjsStore;

  beforeEach(async () => {
    store = new YjsStore('test-attach');
    await store.waitForReady();
  });

  afterEach(() => {
    if (store) {
      store.destroy();
    }
  });

  function getStackObj(id: string): StackObject {
    return toTableObject(store.getObjectYMap(id)!) as StackObject;
  }

  describe('attachCards', () => {
    it('attaches a single-card stack to a target', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['hero-card'],
        faceUp: true,
      });

      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['upgrade-card'],
        faceUp: true,
      });

      const attached = attachCards(store, [sourceId], targetId);

      expect(attached).toEqual([sourceId]);

      // Target should have attachment list
      const target = getStackObj(targetId);
      expect(target._attachedCardIds).toEqual([sourceId]);

      // Source should reference parent
      const source = getStackObj(sourceId);
      expect(source._attachedToId).toBe(targetId);

      // Source position should be updated to fan position
      expect(source._pos.y).toBeGreaterThan(target._pos.y);
    });

    it('splits a multi-card stack into individual attachments', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['hero-card'],
        faceUp: true,
      });

      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['upgrade-1', 'upgrade-2', 'upgrade-3'],
        faceUp: true,
      });

      const attached = attachCards(store, [sourceId], targetId);

      // Should have created 3 individual stacks
      expect(attached).toHaveLength(3);

      // Original multi-card stack should be deleted
      expect(store.getObjectYMap(sourceId)).toBeUndefined();

      // Target should reference all 3 attachments
      const target = getStackObj(targetId);
      expect(target._attachedCardIds).toHaveLength(3);

      // Each attachment should be a single-card stack referencing the parent
      for (const id of attached) {
        const obj = getStackObj(id);
        expect(obj._cards).toHaveLength(1);
        expect(obj._attachedToId).toBe(targetId);
      }
    });

    it('attaches multiple sources at once', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['hero-card'],
        faceUp: true,
      });

      const src1 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 50, y: 50, r: 0 },
        cards: ['up-1'],
        faceUp: true,
      });

      const src2 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['up-2'],
        faceUp: true,
      });

      const attached = attachCards(store, [src1, src2], targetId);

      expect(attached).toHaveLength(2);

      const target = getStackObj(targetId);
      expect(target._attachedCardIds).toHaveLength(2);
    });

    it('prevents attaching a card to itself', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['card'],
        faceUp: true,
      });

      const attached = attachCards(store, [id], id);
      expect(attached).toHaveLength(0);
    });

    it('appends to existing attachments', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['hero'],
        faceUp: true,
      });

      const src1 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 50, y: 50, r: 0 },
        cards: ['up-1'],
        faceUp: true,
      });

      const src2 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['up-2'],
        faceUp: true,
      });

      attachCards(store, [src1], targetId);
      attachCards(store, [src2], targetId);

      const target = getStackObj(targetId);
      expect(target._attachedCardIds).toHaveLength(2);
      expect(target._attachedCardIds).toContain(src1);
      expect(target._attachedCardIds).toContain(src2);
    });

    it('returns empty array for non-existent target', () => {
      const result = attachCards(store, ['nonexistent'], 'also-nonexistent');
      expect(result).toHaveLength(0);
    });
  });

  describe('detachCard', () => {
    it('detaches a card from its parent', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['hero'],
        faceUp: true,
      });

      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['upgrade'],
        faceUp: true,
      });

      attachCards(store, [sourceId], targetId);

      const result = detachCard(store, sourceId);
      expect(result).toBe(true);

      // Child should no longer reference parent
      const source = getStackObj(sourceId);
      expect(source._attachedToId).toBeUndefined();

      // Parent should have empty/undefined attachment list
      const target = getStackObj(targetId);
      expect(
        target._attachedCardIds === undefined ||
          target._attachedCardIds.length === 0,
      ).toBe(true);
    });

    it('recomputes positions of remaining attachments', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['hero'],
        faceUp: true,
      });

      const src1 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 50, y: 50, r: 0 },
        cards: ['up-1'],
        faceUp: true,
      });

      const src2 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['up-2'],
        faceUp: true,
      });

      const src3 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 150, y: 150, r: 0 },
        cards: ['up-3'],
        faceUp: true,
      });

      attachCards(store, [src1, src2, src3], targetId);

      // Record positions before detach
      const posBeforeDetach = getStackObj(src3)._pos.y;

      // Detach the middle card
      detachCard(store, src2);

      // src3 should have moved closer (was at index 2, now at index 1)
      const posAfterDetach = getStackObj(src3)._pos.y;
      expect(posAfterDetach).toBeLessThan(posBeforeDetach);

      const target = getStackObj(targetId);
      expect(target._attachedCardIds).toHaveLength(2);
      expect(target._attachedCardIds).toContain(src1);
      expect(target._attachedCardIds).toContain(src3);
    });

    it('returns false for non-attached card', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['card'],
        faceUp: true,
      });

      const result = detachCard(store, id);
      expect(result).toBe(false);
    });

    it('returns false for non-existent card', () => {
      const result = detachCard(store, 'nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('detachAllCards', () => {
    it('detaches all cards from a parent', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['hero'],
        faceUp: true,
      });

      const src1 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 50, y: 50, r: 0 },
        cards: ['up-1'],
        faceUp: true,
      });

      const src2 = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['up-2'],
        faceUp: true,
      });

      attachCards(store, [src1, src2], targetId);

      const detached = detachAllCards(store, targetId);
      expect(detached).toHaveLength(2);
      expect(detached).toContain(src1);
      expect(detached).toContain(src2);

      // Parent should have no attachments
      const target = getStackObj(targetId);
      expect(target._attachedCardIds).toBeUndefined();

      // Children should not reference parent
      expect(getStackObj(src1)._attachedToId).toBeUndefined();
      expect(getStackObj(src2)._attachedToId).toBeUndefined();
    });

    it('returns empty array for parent with no attachments', () => {
      const id = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['card'],
        faceUp: true,
      });

      const result = detachAllCards(store, id);
      expect(result).toHaveLength(0);
    });
  });

  describe('moveObjects with attachments', () => {
    it('moves attached cards when parent moves', () => {
      const targetId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 0, y: 0, r: 0 },
        cards: ['hero'],
        faceUp: true,
      });

      const sourceId = createObject(store, {
        kind: ObjectKind.Stack,
        pos: { x: 100, y: 100, r: 0 },
        cards: ['upgrade'],
        faceUp: true,
      });

      attachCards(store, [sourceId], targetId);

      // Move parent
      moveObjects(store, [{ id: targetId, pos: { x: 200, y: 200, r: 0 } }]);

      // Child should have moved relative to new parent position
      const childPosAfter = getStackObj(sourceId)._pos;
      expect(childPosAfter.x).toBe(200); // Same x as parent (below direction)
      expect(childPosAfter.y).toBeGreaterThan(200); // Below parent

      // Verify parent moved
      const parentPos = getStackObj(targetId)._pos;
      expect(parentPos.x).toBe(200);
      expect(parentPos.y).toBe(200);
    });
  });
});
