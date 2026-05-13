import { ObjectKind, type TableObject } from '@cardtable2/shared';

/**
 * Counter metadata: template + instance fields.
 *
 * Template fields (`type`, `color`, `text`, `img`, `min`, `max`,
 * `startingValue`) describe the counter's intrinsic properties. For
 * plugin-typed counters these are copied from the type definition at spawn
 * time; for generic counters they are authored at spawn time. The edit menu
 * mutates the instance only — these values may diverge from the type def
 * over the counter's lifetime.
 *
 * Instance fields (`typeId`, `currentValue`) carry provenance and live
 * state. `typeId` is captured at spawn time and retained even when other
 * values diverge from the type definition. `currentValue` is initialised to
 * `startingValue` and changes via increment/decrement.
 *
 * Extends `Record<string, unknown>` to satisfy `TableObject._meta`'s
 * freeform-metadata contract.
 */
export interface CounterMeta extends Record<string, unknown> {
  /** Template: counter type — `'generic'` or a plugin-defined string. */
  type: string;
  /**
   * Instance: provenance — the type id this counter was spawned from.
   * Equals `'generic'` for generic counters; equals the registered type id
   * for plugin-typed counters. Retained for life of the instance even when
   * other meta values diverge from the type definition.
   */
  typeId: string;
  /** Template: counter color (RGB number, e.g. `0xf39c12`). */
  color: number;
  /** Template: optional display text (label/abbreviation). */
  text?: string;
  /** Template: optional image URL for icon-backed counters. */
  img?: string;
  /** Template: minimum value (clamps `currentValue`). */
  min: number;
  /** Template: maximum value (clamps `currentValue`). */
  max: number;
  /** Template: starting value used when a new instance is materialised. */
  startingValue: number;
  /** Instance: current value; initialised to `startingValue` at spawn. */
  currentValue: number;
}

/** Type guard for Counter objects */
export function isCounterObject(obj: TableObject): obj is CounterObject {
  return obj._kind === ObjectKind.Counter;
}

/** Full Counter object type with required fields */
export interface CounterObject extends TableObject {
  _kind: ObjectKind.Counter;
}
