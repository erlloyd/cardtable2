import { ObjectKind, type TableObject } from '@cardtable2/shared';

/** Zone-specific metadata interface */
export interface ZoneMeta {
  color?: number;
  width?: number;
  height?: number;
  gridSize?: number;
  snapToGrid?: boolean;
}

/** Type guard for Zone objects */
export function isZoneObject(obj: TableObject): obj is ZoneObject {
  return obj._kind === ObjectKind.Zone;
}

/** Full Zone object type with required fields */
export interface ZoneObject extends TableObject {
  _kind: 'zone';
  _meta?: ZoneMeta;
}
