/**
 * Counter-type registry: resolver + validator over plugin-declared `counters`
 * loadable entries.
 *
 * Plugins declare counter type definitions through the generic loadables[]
 * system using `type: 'counter'` entries with static sources. Each
 * LoadableStaticItem carries:
 *   - `typeId`    — the counter type id (used by the resolver and copied as
 *                   `typeId` provenance on materialized instances)
 *   - `label`     — picker display label
 *   - `data`      — a `CounterTypeDef` payload: `{color, text?, img?, min,
 *                   max, startingValue}` (template-only — instance fields
 *                   like `typeId` and `currentValue` are assigned at spawn
 *                   time, NOT in plugin declarations)
 *
 * This module is the thin per-type layer on top of `loadablesRegistry`:
 *   - `parseCounterTypeDef`     — validate a raw payload at the
 *                                 plugin-manifest boundary; throws a
 *                                 descriptive Error on malformed input.
 *   - `getAllCounterTypeDefs`   — list every plugin-declared counter type as
 *                                 resolved `(typeId, label, data)` tuples.
 *   - `getCounterTypeDef`       — point lookup by typeId; `undefined` when
 *                                 the type isn't declared.
 *
 * Validation lives at the boundary (plugin manifest → host) because the
 * loadable `data` payload is typed as `unknown` at the shared-schema layer
 * (see content-types.ts). `typeof` checks are acceptable here per CLAUDE.md
 * — this is a system boundary, not internal type validation.
 */

import {
  COUNTER_LOADABLE_TYPE,
  type CounterTypeDef,
  type LoadableEntry,
  type LoadableStaticItem,
} from '@cardtable2/shared';
import { getLoadableEntries, getStaticItems } from './loadablesRegistry';

/**
 * Resolved counter type definition: the parsed `CounterTypeDef` payload
 * paired with the loadable's id and label. Returned by `getCounterTypeDef`
 * and `getAllCounterTypeDefs` so callers get the type id + display label
 * alongside the template fields in a single object.
 */
export interface ResolvedCounterTypeDef {
  /** Counter type id (matches `LoadableStaticItem.typeId`). */
  typeId: string;
  /** Display label (matches `LoadableStaticItem.label`). */
  label: string;
  /** Template fields (color, optional text/img, min, max, startingValue). */
  def: CounterTypeDef;
}

/**
 * Validate a raw `LoadableStaticItem.data` value as a `CounterTypeDef`.
 *
 * Required fields: `color`, `min`, `max`, `startingValue` (all numbers).
 * Optional fields: `text` (string), `img` (string). Numeric fields must be
 * finite. `startingValue` is NOT clamped to `[min, max]` here — that's an
 * instance-time concern; type defs may legitimately ship a startingValue
 * outside the [min, max] band (e.g. a template re-used in multiple modes).
 *
 * The `context` string is prepended to error messages so the loader can
 * report which plugin manifest entry failed validation.
 *
 * @throws Error with a descriptive message when validation fails.
 */
export function parseCounterTypeDef(
  data: unknown,
  context: string,
): CounterTypeDef {
  if (typeof data !== 'object' || data === null) {
    throw new Error(
      `${context}: counter type def must be an object, got ${data === null ? 'null' : typeof data}`,
    );
  }

  const obj = data as Record<string, unknown>;

  const color = obj.color;
  if (typeof color !== 'number' || !Number.isFinite(color)) {
    throw new Error(
      `${context}: counter type def 'color' must be a finite number (RGB int), got ${describe(color)}`,
    );
  }

  const min = obj.min;
  if (typeof min !== 'number' || !Number.isFinite(min)) {
    throw new Error(
      `${context}: counter type def 'min' must be a finite number, got ${describe(min)}`,
    );
  }

  const max = obj.max;
  if (typeof max !== 'number' || !Number.isFinite(max)) {
    throw new Error(
      `${context}: counter type def 'max' must be a finite number, got ${describe(max)}`,
    );
  }

  if (min > max) {
    throw new Error(
      `${context}: counter type def 'min' (${min}) must be <= 'max' (${max})`,
    );
  }

  const startingValue = obj.startingValue;
  if (typeof startingValue !== 'number' || !Number.isFinite(startingValue)) {
    throw new Error(
      `${context}: counter type def 'startingValue' must be a finite number, got ${describe(startingValue)}`,
    );
  }

  const text = obj.text;
  if (text !== undefined && typeof text !== 'string') {
    throw new Error(
      `${context}: counter type def 'text' must be a string when present, got ${describe(text)}`,
    );
  }

  const img = obj.img;
  if (img !== undefined && typeof img !== 'string') {
    throw new Error(
      `${context}: counter type def 'img' must be a string when present, got ${describe(img)}`,
    );
  }

  const result: CounterTypeDef = {
    color,
    min,
    max,
    startingValue,
  };
  if (text !== undefined) result.text = text;
  if (img !== undefined) result.img = img;
  return result;
}

/**
 * Return every plugin-declared counter type as a resolved
 * `(id, label, def)` tuple.
 *
 * Reads from the host loadables registry — callers must have already
 * loaded a plugin (`setLoadableEntries`) for this to return anything.
 *
 * Malformed counter entries are dropped with a `console.warn` rather than
 * aborting the whole list — one bad declaration shouldn't hide every other
 * counter type from the picker / spawn flow.
 *
 * Within a single plugin, the first declaration of a given id wins; later
 * declarations of the same id log a warning and are skipped. Cross-plugin
 * collisions surface here too if/when multi-plugin sessions exist (the
 * loadables registry currently holds one plugin's entries at a time).
 */
export function getAllCounterTypeDefs(
  entries?: LoadableEntry[],
): ResolvedCounterTypeDef[] {
  const source = entries ?? getLoadableEntries();
  const items = getStaticItems<unknown>(source, COUNTER_LOADABLE_TYPE);
  return resolveItems(items);
}

/**
 * Point lookup for a single counter type def by id.
 *
 * Returns `undefined` when no entry with the requested id is declared.
 * A malformed entry with the matching id throws (callers should treat
 * malformed declarations as a hard error at spawn time, distinct from
 * "type not declared").
 */
export function getCounterTypeDef(
  typeId: string,
  entries?: LoadableEntry[],
): ResolvedCounterTypeDef | undefined {
  const source = entries ?? getLoadableEntries();
  const items = getStaticItems<unknown>(source, COUNTER_LOADABLE_TYPE);

  for (const item of items) {
    if (item.typeId !== typeId) continue;
    const def = parseCounterTypeDef(
      item.data,
      `[counterRegistry] counter type '${item.typeId}'`,
    );
    return { typeId: item.typeId, label: item.label, def };
  }
  return undefined;
}

// ============================================================================
// Internal helpers
// ============================================================================

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return Number.isNaN(value) ? 'NaN' : `${value}`;
  }
  return typeof value;
}

function resolveItems(
  items: LoadableStaticItem<unknown>[],
): ResolvedCounterTypeDef[] {
  const resolved: ResolvedCounterTypeDef[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.typeId)) {
      console.warn(
        `[counterRegistry] duplicate counter type id '${item.typeId}' — keeping first declaration`,
      );
      continue;
    }
    try {
      const def = parseCounterTypeDef(
        item.data,
        `[counterRegistry] counter type '${item.typeId}'`,
      );
      resolved.push({ typeId: item.typeId, label: item.label, def });
      seen.add(item.typeId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[counterRegistry] dropping malformed counter type '${item.typeId}': ${message}`,
      );
    }
  }
  return resolved;
}
