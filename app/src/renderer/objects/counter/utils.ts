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
 * dimensions are FIXED — `COUNTER_PILL_WIDTH` x `COUNTER_PILL_HEIGHT`
 * (90x44) — regardless of whether the counter carries a `text` label
 * (ct-bmk). Bare and labeled counters share one silhouette; only the
 * text layout inside varies. The entire pill is interactive for +/-
 * hit-testing in both states.
 */
export function getCounterDimensions(_obj: TableObject): {
  width: number;
  height: number;
} {
  return {
    width: COUNTER_PILL_WIDTH,
    height: COUNTER_PILL_HEIGHT,
  };
}

/**
 * Whether the counter has a non-empty `text` label. Drives the two-line
 * stacked text layout inside the pill (ct-bmk). The pill dimensions
 * themselves do NOT change — only the text reflow.
 */
export function hasCounterLabel(obj: TableObject): boolean {
  const text = getCounterText(obj);
  return text !== undefined && text.length > 0;
}

/**
 * Sub-region of the Counter pill (ct-d2p). The pill is conceptually three
 * horizontal thirds: minus / value / plus.
 */
export type CounterZoneHit = 'minus' | 'value' | 'plus';

/**
 * Hit-test a world-space point against a Counter's +/- zones (ct-d2p).
 *
 * Returns the zone the point falls into, or `null` if the point is
 * outside the pill bounds entirely. The pill renders centered on
 * `obj._pos` (see CounterBehaviors.render); zones are split at one-third
 * and two-thirds of the pill width along the x-axis.
 *
 * Coordinates are transformed into the pill's local space first so that
 * any future rotation (the counter's `_pos.r`) is respected; today the
 * Counter is non-rotatable (canRotate: false in capabilities), but the
 * local-coords transform is essentially free and avoids subtle bugs if
 * that capability ever flips.
 */
export function counterZoneAtPoint(
  worldX: number,
  worldY: number,
  obj: TableObject,
): CounterZoneHit | null {
  const { width, height } = getCounterDimensions(obj);

  // Transform world point into the counter's local space.
  const dx = worldX - obj._pos.x;
  const dy = worldY - obj._pos.y;
  const angleRad = (obj._pos.r * Math.PI) / 180;
  const cos = Math.cos(-angleRad);
  const sin = Math.sin(-angleRad);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  // Point must be inside the pill's bounding rect to count as a zone hit.
  const halfW = width / 2;
  const halfH = height / 2;
  if (localX < -halfW || localX > halfW || localY < -halfH || localY > halfH) {
    return null;
  }

  // With the two-line stacked layout (ct-bmk) the entire pill is
  // interactive for +/- — there's no reserved label strip to exclude.
  const third = width / 3;
  if (localX <= -halfW + third) return 'minus';
  if (localX >= halfW - third) return 'plus';
  return 'value';
}

/**
 * Whether the counter's current value sits at the relevant boundary for the
 * given side zone (ct-d2p). Used by the renderer to dim the zone glyph and
 * by the pointer pipeline to suppress adjustments.
 */
export function isCounterZoneAtBoundary(
  obj: TableObject,
  zone: 'minus' | 'plus',
): boolean {
  const current = getCounterCurrentValue(obj);
  if (zone === 'minus') return current <= getCounterMin(obj);
  return current >= getCounterMax(obj);
}
