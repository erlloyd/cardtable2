import { ObjectKind, type TableObject } from '@cardtable2/shared';

/** Token-specific metadata interface */
export interface TokenMeta {
  color?: number;
  size?: number;
}

/** Type guard for Token objects */
export function isTokenObject(obj: TableObject): obj is TokenObject {
  return obj._kind === ObjectKind.Token;
}

/** Full Token object type with required fields */
export interface TokenObject extends TableObject {
  _kind: 'token';
  _meta?: TokenMeta;
}
