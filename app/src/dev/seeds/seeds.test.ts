/**
 * Unit tests for the URL-param seed system.
 *
 * Covers:
 *   - Registry completeness (all documented seeds exist).
 *   - applySeed behavior: unknown name, empty registry entry, non-empty
 *     table refusal, successful application with correct object counts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YjsStore } from '../../store/YjsStore';
import { applySeed, listSeeds, SEED_REGISTRY } from './index';
import { ObjectKind } from '@cardtable2/shared';

// Mock y-indexeddb to avoid IndexedDB in tests (mirrors YjsStore.test.ts).
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

describe('seeds', () => {
  let store: YjsStore;

  beforeEach(async () => {
    store = new YjsStore(`test-table-seed-${Math.random()}`);
    await store.waitForReady();
  });

  afterEach(() => {
    store.destroy();
  });

  describe('SEED_REGISTRY', () => {
    it('exposes the documented initial seeds', () => {
      expect(listSeeds()).toEqual(
        [
          'attachment-pair',
          'empty-table',
          'single-card',
          'stack-of-5',
          'two-stacks',
        ].sort(),
      );
    });

    it('every registered seed builder returns a valid options array', () => {
      for (const [name, builder] of Object.entries(SEED_REGISTRY)) {
        const objects = builder();
        expect(Array.isArray(objects)).toBe(true);
        for (const opts of objects) {
          expect(opts).toHaveProperty('kind');
          expect(opts).toHaveProperty('pos');
          expect(opts.pos).toHaveProperty('x');
          expect(opts.pos).toHaveProperty('y');
          expect(opts.pos).toHaveProperty('r');
          if (opts.kind === ObjectKind.Stack) {
            expect(Array.isArray(opts.cards)).toBe(true);
          }
        }
        expect(name).toMatch(/^[a-z][a-z0-9-]*$/); // kebab-case
      }
    });
  });

  describe('applySeed', () => {
    it('rejects unknown seed names with a helpful reason', () => {
      const result = applySeed(store, 'no-such-seed');
      expect(result.applied).toBe(false);
      expect(result.reason).toMatch(/unknown seed/);
      expect(result.reason).toMatch(/known:/);
      expect(result.createdIds).toEqual([]);
    });

    it('applies empty-table seed as a no-op success', () => {
      const result = applySeed(store, 'empty-table');
      expect(result.applied).toBe(true);
      expect(result.createdIds).toEqual([]);
      expect(store.objects.size).toBe(0);
    });

    it('applies single-card seed creating one stack', () => {
      const result = applySeed(store, 'single-card');
      expect(result.applied).toBe(true);
      expect(result.createdIds).toHaveLength(1);
      expect(store.objects.size).toBe(1);

      const [id] = result.createdIds;
      const obj = store.objects.get(id);
      expect(obj?.get('_kind')).toBe(ObjectKind.Stack);
      expect(obj?.get('_cards')).toEqual(['seed-card-1']);
    });

    it('applies stack-of-5 seed creating a 5-card stack', () => {
      const result = applySeed(store, 'stack-of-5');
      expect(result.applied).toBe(true);
      expect(result.createdIds).toHaveLength(1);

      const obj = store.objects.get(result.createdIds[0]);
      expect((obj?.get('_cards') as string[]).length).toBe(5);
    });

    it('applies two-stacks seed creating two distinct stacks', () => {
      const result = applySeed(store, 'two-stacks');
      expect(result.applied).toBe(true);
      expect(result.createdIds).toHaveLength(2);
      expect(store.objects.size).toBe(2);

      const positions = result.createdIds.map((id) => {
        const pos = store.objects.get(id)?.get('_pos') as {
          x: number;
          y: number;
        };
        return pos.x;
      });
      expect(positions).toContain(-150);
      expect(positions).toContain(150);
    });

    it('refuses to apply when the table already has objects', () => {
      // Pre-populate the store.
      applySeed(store, 'single-card');
      expect(store.objects.size).toBe(1);

      const result = applySeed(store, 'stack-of-5');
      expect(result.applied).toBe(false);
      expect(result.reason).toMatch(/already has 1 object/);
      expect(store.objects.size).toBe(1);
    });

    it('applies seed objects atomically in a single transaction', () => {
      // Listen for transact events and count them.
      let transactCount = 0;
      store.getDoc().on('afterTransaction', () => {
        transactCount++;
      });

      applySeed(store, 'two-stacks');

      // `applySeed` itself should produce exactly one transaction
      // (individual createObject calls would produce two).
      expect(transactCount).toBe(1);
    });
  });
});
