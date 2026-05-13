/**
 * Scenario-declared counter auto-spawn materialization (ct-x41).
 *
 * Given a scenario's `counters?: ScenarioCounterSpawn[]` declarations, this
 * module resolves each `typeId` against the active plugin's counter loadable
 * registry and materialises a `CounterObject` per entry. The host wires this
 * into `loadScenarioContent` so spawned counters land on the table together
 * with the rest of the scenario's objects.
 *
 * Error handling:
 * - An unknown `typeId` logs a clear error (naming the scenario + missing id)
 *   and skips just that entry — the rest of the scenario still loads.
 * - A malformed counter type definition propagates as an error from
 *   `getCounterTypeDef`; we catch it, log, and skip that entry too (same
 *   treatment as unknown id from the scenario author's perspective).
 *
 * Default placement policy (when `position` is omitted): a small horizontal
 * cascade around the origin so multiple defaulted counters don't stack on
 * the same pixel. Scenario authors who care about layout should set
 * `position` explicitly; the default is a "did something" affordance, not a
 * curated layout.
 */

import {
  ObjectKind,
  formatSortKey,
  type CounterTypeDef,
  type LoadableEntry,
  type Position,
  type ScenarioCounterSpawn,
  type TableObject,
} from '@cardtable2/shared';
import { v4 as uuidv4 } from 'uuid';
import { getCounterTypeDef } from './counterRegistry';
import { createCounterMeta } from '../renderer/objects/counter/utils';
import type { CounterMeta } from '../renderer/objects/counter/types';
import { COUNTER_PILL_WIDTH } from '../renderer/objects/counter/constants';

/**
 * Default horizontal spacing for cascaded counters when scenario authors
 * don't specify `position`. Counter pill width + a small gap so adjacent
 * defaults don't overlap.
 */
const DEFAULT_COUNTER_GAP = 16;

/**
 * Materialise a single `ScenarioCounterSpawn` into a `CounterObject`.
 *
 * Returns `null` (after logging) when the spawn references an unknown
 * `typeId` or its type definition fails validation. The caller is expected
 * to filter `null`s out so the rest of the scenario still loads.
 *
 * `scenarioContext` is a free-form string included in log output so the
 * operator can tell which scenario emitted the warning (commonly the
 * scenario's `id` or `name`).
 *
 * @param spawn       Scenario-declared spawn entry.
 * @param index       Zero-based index within the scenario's `counters` array.
 *                    Drives the default placement cascade and the spawned
 *                    object's sortKey when many spawns are added at once.
 * @param scenarioContext Identifier of the calling scenario (for log lines).
 * @param entries     Optional explicit loadable entries; when omitted, the
 *                    resolver reads from the global loadables registry. The
 *                    auto-spawn flow passes the plugin's manifest entries
 *                    directly so it doesn't depend on registry-write order.
 */
export function instantiateCounterSpawn(
  spawn: ScenarioCounterSpawn,
  index: number,
  scenarioContext: string,
  entries?: LoadableEntry[],
): TableObject | null {
  let resolved;
  try {
    resolved = getCounterTypeDef(spawn.typeId, entries);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[counterSpawn] Scenario "${scenarioContext}" declares counter typeId "${spawn.typeId}" whose type definition is malformed; skipping this counter.`,
      { typeId: spawn.typeId, error: message },
    );
    return null;
  }

  if (!resolved) {
    console.error(
      `[counterSpawn] Scenario "${scenarioContext}" declares counter typeId "${spawn.typeId}", but no such counter type is registered by the active plugin; skipping this counter.`,
      { typeId: spawn.typeId },
    );
    return null;
  }

  const meta = buildSpawnedMeta(resolved.typeId, resolved.def, spawn);
  const pos = resolvePosition(spawn, index);
  const sortKey = formatSortKey((index + 1) * 1000);

  const obj: TableObject = {
    _kind: ObjectKind.Counter,
    _containerId: null,
    _pos: pos,
    _sortKey: sortKey,
    _locked: false,
    _selectedBy: null,
    _meta: meta,
  };
  return obj;
}

/**
 * Materialise every spawn in a scenario's `counters` array into a Map keyed
 * by freshly generated instance ids — same shape as
 * `instantiateScenario`/`instantiateComponentSet` produce, so the caller can
 * `Map.set` straight into the scenario's objects map before sending it to
 * the store.
 *
 * Entries that fail to resolve are logged and skipped (see
 * {@link instantiateCounterSpawn}); the returned map contains only the
 * successful spawns.
 */
export function instantiateCounterSpawns(
  spawns: ScenarioCounterSpawn[] | undefined,
  scenarioContext: string,
  entries?: LoadableEntry[],
): Map<string, TableObject> {
  const out = new Map<string, TableObject>();
  if (!spawns || spawns.length === 0) return out;

  for (let i = 0; i < spawns.length; i++) {
    const obj = instantiateCounterSpawn(spawns[i], i, scenarioContext, entries);
    if (obj) {
      out.set(generateSpawnInstanceId(), obj);
    }
  }
  return out;
}

// ============================================================================
// Internal helpers
// ============================================================================

function buildSpawnedMeta(
  typeId: string,
  def: CounterTypeDef,
  spawn: ScenarioCounterSpawn,
): CounterMeta {
  // Route through createCounterMeta so derived defaults (e.g. currentValue
  // tracking startingValue) stay consistent with the createObject path.
  const overrides: Partial<CounterMeta> = {
    type: typeId,
    typeId,
    color: def.color,
    min: def.min,
    max: def.max,
    startingValue: def.startingValue,
  };
  if (def.text !== undefined) overrides.text = def.text;
  if (def.img !== undefined) overrides.img = def.img;

  // initialValue, when supplied, overrides BOTH startingValue's role as the
  // currentValue seed and is preserved as currentValue verbatim. We do NOT
  // overwrite startingValue itself — the template's startingValue is the
  // record of "what the type def says"; the instance's currentValue is the
  // record of "what we spawned at". Distinct concepts; mirrors how
  // ct-c7c models the instance/template split.
  if (spawn.initialValue !== undefined) {
    overrides.currentValue = spawn.initialValue;
  }

  return createCounterMeta(overrides);
}

function resolvePosition(spawn: ScenarioCounterSpawn, index: number): Position {
  if (spawn.position) {
    return { x: spawn.position.x, y: spawn.position.y, r: 0 };
  }
  // Default cascade: horizontal row at origin, one pill-width + gap apart.
  // Centres the run on x=0 so a single defaulted counter sits at the origin
  // while a sequence fans symmetrically on either side. The default exists
  // to avoid stacked-on-the-same-pixel surprise; authored layouts override
  // it.
  const step = COUNTER_PILL_WIDTH + DEFAULT_COUNTER_GAP;
  return { x: index * step, y: 0, r: 0 };
}

function generateSpawnInstanceId(): string {
  // Use UUIDs so spawn ids never collide with componentSet's local counter
  // ids (those use `cs-${timestamp}-${counter}-${rand}`); both maps may be
  // merged into one before the store update, so disjoint key spaces matter.
  return `counter-spawn-${uuidv4()}`;
}
