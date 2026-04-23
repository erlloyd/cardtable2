/**
 * URL-param scene seeding for reproducible dev scenarios.
 *
 * Usage
 * -----
 *   /table/some-id?seed=stack-of-5
 *
 * The loader reads `?seed=<name>` on the table route, and if the name
 * matches a registered seed AND the table is empty, it atomically
 * applies the seed's objects.  Seeds are dev-only: both the registry
 * and the apply logic are behind `import.meta.env.DEV` / `VITE_E2E`
 * gates, and seed data itself is imported from this directory so tree-
 * shaking keeps it out of production bundles.
 *
 * Adding a seed
 * -------------
 *   1.  Pick a stable kebab-case name.
 *   2.  Add an entry to `SEED_REGISTRY` below returning an array of
 *       `CreateObjectOptions`.
 *   3.  Each object needs `kind`, `pos`, and (for stacks) `cards` /
 *       `faceUp`.  See `resetToTestScene` in YjsActions.ts for a larger
 *       example.
 *
 * Guarantees
 * ----------
 *   - Only applies to a table with zero objects (otherwise a returning
 *     user reloading `/table/foo?seed=...` would clobber their state).
 *   - Wrapped in a single Y.Doc transaction so sync partners see the
 *     seed as one atomic change.
 *   - Logged to the console under `[seed]` for traceability.
 */

import type { YjsStore } from '../../store/YjsStore';
import { createObject, type CreateObjectOptions } from '../../store/YjsActions';
import { ObjectKind } from '@cardtable2/shared';

export type SeedBuilder = () => CreateObjectOptions[];

/**
 * Registry of named seeds.  Keys are the values of the `?seed=` URL
 * param.  Keep seed names kebab-case so they're URL-safe.
 */
export const SEED_REGISTRY: Record<string, SeedBuilder> = {
  /** No objects — useful for "just give me a fresh table" verification. */
  'empty-table': () => [],

  /** A single face-up card at origin.  Simplest non-trivial seed. */
  'single-card': () => [
    {
      kind: ObjectKind.Stack,
      pos: { x: 0, y: 0, r: 0 },
      cards: ['seed-card-1'],
      faceUp: true,
    },
  ],

  /** A single 5-card face-up stack at origin. */
  'stack-of-5': () => [
    {
      kind: ObjectKind.Stack,
      pos: { x: 0, y: 0, r: 0 },
      cards: [
        'seed-card-1',
        'seed-card-2',
        'seed-card-3',
        'seed-card-4',
        'seed-card-5',
      ],
      faceUp: true,
    },
  ],

  /** Two face-up stacks spaced apart horizontally.  Good for drag/merge. */
  'two-stacks': () => [
    {
      kind: ObjectKind.Stack,
      pos: { x: -150, y: 0, r: 0 },
      cards: ['seed-a-1', 'seed-a-2'],
      faceUp: true,
    },
    {
      kind: ObjectKind.Stack,
      pos: { x: 150, y: 0, r: 0 },
      cards: ['seed-b-1', 'seed-b-2', 'seed-b-3'],
      faceUp: true,
    },
  ],

  /**
   * Two single-card stacks side by side — intended starting point for
   * exercising card-on-card attachment (the test code then drags one
   * onto the other with Alt held).  We don't pre-attach them because
   * the attach flow itself is usually the subject under test.
   */
  'attachment-pair': () => [
    {
      kind: ObjectKind.Stack,
      pos: { x: -100, y: 0, r: 0 },
      cards: ['seed-parent-1'],
      faceUp: true,
    },
    {
      kind: ObjectKind.Stack,
      pos: { x: 100, y: 0, r: 0 },
      cards: ['seed-child-1'],
      faceUp: true,
    },
  ],
};

export interface ApplySeedResult {
  applied: boolean;
  /** Why the seed did not apply (when `applied` is false). */
  reason?: string;
  /** IDs of objects created (empty when not applied). */
  createdIds: string[];
}

/**
 * Apply a named seed to the store if, and only if, the table is empty.
 *
 * Returns a small report describing what happened — `applied: true`
 * plus the created IDs on success, or `applied: false` with a reason
 * otherwise (unknown seed, non-empty table, no-op empty seed, etc.).
 *
 * Callers must gate this on `import.meta.env.DEV || VITE_E2E` — the
 * function itself does not check the env so tests can exercise it.
 */
export function applySeed(store: YjsStore, seedName: string): ApplySeedResult {
  const builder = SEED_REGISTRY[seedName];
  if (!builder) {
    return {
      applied: false,
      reason: `unknown seed '${seedName}' (known: ${Object.keys(SEED_REGISTRY).join(', ')})`,
      createdIds: [],
    };
  }

  if (store.objects.size > 0) {
    return {
      applied: false,
      reason: `table already has ${store.objects.size} object(s); refusing to clobber`,
      createdIds: [],
    };
  }

  const objects = builder();
  if (objects.length === 0) {
    // Empty seed is still considered "applied" — it's the contract for
    // the `empty-table` seed.
    return { applied: true, createdIds: [] };
  }

  const createdIds: string[] = [];
  store.getDoc().transact(() => {
    for (const options of objects) {
      const id = createObject(store, options);
      createdIds.push(id);
    }
  });
  return { applied: true, createdIds };
}

/** List available seed names (for debug UI and error messages). */
export function listSeeds(): string[] {
  return Object.keys(SEED_REGISTRY).sort();
}
