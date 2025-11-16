import { ObjectKind, type TableObject } from '@cardtable2/shared';

/** Mat-specific metadata interface */
export interface MatMeta extends Record<string, unknown> {
  color?: number;
  size?: number;
}

/** Type guard for Mat objects */
export function isMatObject(obj: TableObject): obj is MatObject {
  return obj._kind === ObjectKind.Mat;
}

/** Full Mat object type with required fields */
export interface MatObject extends TableObject {
  _kind: ObjectKind.Mat;
}
