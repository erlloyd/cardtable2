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
  { typeId: 'spider-man', label: 'Spider-Man', data: { code: 'spider-man' } },
  { typeId: 'iron-man', label: 'Iron Man', data: { code: 'iron-man' } },
  {
    typeId: 'captain-america',
    label: 'Captain America',
    data: { code: 'cap' },
  },
  {
    typeId: 'black-widow',
    label: 'Black Widow',
    data: { code: 'black-widow' },
  },
  { typeId: 'thor', label: 'Thor', data: { code: 'thor' } },
  { typeId: 'hulk', label: 'Hulk', data: { code: 'hulk' } },
  {
    typeId: 'doctor-strange',
    label: 'Doctor Strange',
    data: { code: 'strange' },
  },
  { typeId: 'wasp', label: 'Wasp', data: { code: 'wasp' } },
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
          typeId: 'rhino',
          label: 'Rhino',
          data: { file: 'scenarios/rhino.json' },
        },
        {
          typeId: 'klaw',
          label: 'Klaw',
          data: { file: 'scenarios/klaw.json' },
        },
        {
          typeId: 'ultron',
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
  typeId: string;
  label: string;
  data: { code: string };
}> {
  return FIXTURE_DERIVED_CARDS;
}
