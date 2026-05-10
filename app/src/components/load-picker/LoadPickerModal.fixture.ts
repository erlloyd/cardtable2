/**
 * Fixture data for `LoadPickerModal` development and tests.
 *
 * Covers all three `LoadableItemSource` discriminator branches so the
 * component can be exercised without depending on ct-8gf.2's runtime
 * registry landing first:
 *
 *   - `static`              — items declared inline in the manifest
 *   - `provider`            — parser/JS-driven (e.g. apiImport)
 *   - `asset-pack-derived`  — host computes items from merged asset packs
 *
 * Used by:
 *   - `LoadPickerModal.test.tsx` (the picker's unit tests)
 *   - the temporary dev wiring (removed before commit) used during
 *     Playwright MCP browser verification
 */

import type { LoadableEntry } from '@cardtable2/shared';

/**
 * Items used by the asset-pack-derived branch in the fixture.  In the
 * real runtime, these would be materialized by the host from the merged
 * `GameAssets` (cards, card-sets) — here we just inline a representative
 * set so the search behavior is exercisable without a plugin loaded.
 */
const FIXTURE_DERIVED_CARDS = [
  { id: 'spider-man', label: 'Spider-Man', data: { code: 'spider-man' } },
  { id: 'iron-man', label: 'Iron Man', data: { code: 'iron-man' } },
  { id: 'captain-america', label: 'Captain America', data: { code: 'cap' } },
  { id: 'black-widow', label: 'Black Widow', data: { code: 'black-widow' } },
  { id: 'thor', label: 'Thor', data: { code: 'thor' } },
  { id: 'hulk', label: 'Hulk', data: { code: 'hulk' } },
  { id: 'doctor-strange', label: 'Doctor Strange', data: { code: 'strange' } },
  { id: 'wasp', label: 'Wasp', data: { code: 'wasp' } },
];

export const FIXTURE_LOADABLES: LoadableEntry[] = [
  {
    type: 'scenario',
    label: 'Scenario',
    mode: 'replace',
    source: {
      kind: 'static',
      items: [
        {
          id: 'rhino',
          label: 'Rhino',
          data: { file: 'scenarios/rhino.json' },
        },
        {
          id: 'klaw',
          label: 'Klaw',
          data: { file: 'scenarios/klaw.json' },
        },
        {
          id: 'ultron',
          label: 'Ultron',
          data: { file: 'scenarios/ultron.json' },
        },
      ],
    },
  },
  {
    type: 'deck',
    label: 'Deck (from MarvelCDB)',
    mode: 'additive',
    source: {
      kind: 'provider',
      module: 'parsers/marvelcdb-deck.js',
      config: {
        labels: {
          siteName: 'MarvelCDB',
          inputPlaceholder: 'Deck ID (e.g. 12345)',
        },
      },
    },
  },
  {
    type: 'card',
    label: 'Single Card',
    mode: 'additive',
    source: {
      kind: 'asset-pack-derived',
      derivation: 'all-cards',
    },
  },
];

/**
 * Companion to `FIXTURE_LOADABLES`: returns the items the host would
 * compute for the `asset-pack-derived` entry.  The picker accepts a
 * generic `resolveDerivedItems` callback so the data path stays under
 * the host's control; the fixture supplies a representative
 * implementation for tests and the dev harness.
 */
export function fixtureResolveDerivedItems(): Array<{
  id: string;
  label: string;
  data: { code: string };
}> {
  return FIXTURE_DERIVED_CARDS;
}
