import type { TableObject } from '@cardtable2/shared';
import {
  COUNTER_DEFAULT_COLOR,
  COUNTER_DEFAULT_MAX,
  COUNTER_DEFAULT_MIN,
  COUNTER_DEFAULT_STARTING_VALUE,
  COUNTER_PILL_HEIGHT,
  COUNTER_PILL_WIDTH,
  COUNTER_TYPE_GENERIC,
} from './constants';
import type { CounterMeta } from './types';

/**
 * Read CounterMeta from a TableObject's `_meta` bag.
 *
 * The host represents counter fields inside the freeform `_meta` record so
 * that `TableObject` itself stays kind-agnostic; this helper provides a
 * single typed cast for renderer/store code.
 */
function readCounterMeta(obj: TableObject): Partial<CounterMeta> {
  return (obj._meta ?? {}) as Partial<CounterMeta>;
}

/**
 * Build a fully-populated CounterMeta from optional overrides.
 *
 * Use at spawn time to materialise a counter instance. Required template
 * fields fall back to constants; optional fields (`text`, `img`) are only
 * set when explicitly provided. `currentValue` defaults to `startingValue`
 * so a fresh instance starts at the template's starting value.
 *
 * @param overrides Partial CounterMeta — typically the resolved type def
 *                  for plugin-typed counters, or `{}` for a default generic
 *                  counter.
 */
export function createCounterMeta(
  overrides: Partial<CounterMeta> = {},
): CounterMeta {
  const type = overrides.type ?? COUNTER_TYPE_GENERIC;
  const typeId = overrides.typeId ?? type;
  const color = overrides.color ?? COUNTER_DEFAULT_COLOR;
  const min = overrides.min ?? COUNTER_DEFAULT_MIN;
  const max = overrides.max ?? COUNTER_DEFAULT_MAX;
  const startingValue =
    overrides.startingValue ?? COUNTER_DEFAULT_STARTING_VALUE;
  const currentValue = overrides.currentValue ?? startingValue;

  const meta: CounterMeta = {
    type,
    typeId,
    color,
    min,
    max,
    startingValue,
    currentValue,
  };

  if (overrides.text !== undefined) {
    meta.text = overrides.text;
  }
  if (overrides.img !== undefined) {
    meta.img = overrides.img;
  }

  return meta;
}

/** Get the type for a counter (template), falling back to `'generic'`. */
export function getCounterType(obj: TableObject): string {
  return readCounterMeta(obj).type ?? COUNTER_TYPE_GENERIC;
}

/** Get the typeId for a counter (instance provenance). */
export function getCounterTypeId(obj: TableObject): string {
  return readCounterMeta(obj).typeId ?? getCounterType(obj);
}

/** Get the color for a counter, with fallback to default */
export function getCounterColor(obj: TableObject): number {
  return readCounterMeta(obj).color ?? COUNTER_DEFAULT_COLOR;
}

/** Get the optional display text for a counter. */
export function getCounterText(obj: TableObject): string | undefined {
  return readCounterMeta(obj).text;
}

/** Get the optional image URL for a counter. */
export function getCounterImg(obj: TableObject): string | undefined {
  return readCounterMeta(obj).img;
}

/** Get the minimum value for a counter, with fallback to default */
export function getCounterMin(obj: TableObject): number {
  return readCounterMeta(obj).min ?? COUNTER_DEFAULT_MIN;
}

/** Get the maximum value for a counter, with fallback to default */
export function getCounterMax(obj: TableObject): number {
  return readCounterMeta(obj).max ?? COUNTER_DEFAULT_MAX;
}

/** Get the starting value for a counter, with fallback to default */
export function getCounterStartingValue(obj: TableObject): number {
  return readCounterMeta(obj).startingValue ?? COUNTER_DEFAULT_STARTING_VALUE;
}

/**
 * Get the current value for a counter (instance), with fallback to the
 * starting value (and ultimately the default starting value).
 */
export function getCounterCurrentValue(obj: TableObject): number {
  const meta = readCounterMeta(obj);
  return (
    meta.currentValue ?? meta.startingValue ?? COUNTER_DEFAULT_STARTING_VALUE
  );
}

/**
 * Get the pill dimensions (width, height) for a counter in world units.
 *
 * Counters render as a horizontal rounded-rectangle pill (ct-yxh). The
 * dimensions are fixed by `COUNTER_PILL_WIDTH` / `COUNTER_PILL_HEIGHT`;
 * the parameter is retained for symmetry with the other object kinds and
 * to leave room for per-instance sizing if a future bead introduces it.
 */
export function getCounterDimensions(_obj: TableObject): {
  width: number;
  height: number;
} {
  return { width: COUNTER_PILL_WIDTH, height: COUNTER_PILL_HEIGHT };
}
