import { ObjectKind, type TableObject } from '@cardtable2/shared';

/** Counter-specific metadata interface */
export interface CounterMeta extends Record<string, unknown> {
  color?: number;
  size?: number;
}

/** Type guard for Counter objects */
export function isCounterObject(obj: TableObject): obj is CounterObject {
  return obj._kind === ObjectKind.Counter;
}

/** Full Counter object type with required fields */
export interface CounterObject extends TableObject {
  _kind: ObjectKind.Counter;
}
