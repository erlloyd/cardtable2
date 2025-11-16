import { ObjectKind, type TableObject } from '@cardtable2/shared';

/** Stack-specific metadata interface */
export interface StackMeta extends Record<string, unknown> {
  color?: number;
}

/** Type guard for Stack objects */
export function isStackObject(obj: TableObject): obj is StackObject {
  return obj._kind === ObjectKind.Stack && '_cards' in obj && '_faceUp' in obj;
}

/** Full Stack object type with required fields */
export interface StackObject extends TableObject {
  _kind: ObjectKind.Stack;
  _cards: string[];
  _faceUp: boolean;
}
