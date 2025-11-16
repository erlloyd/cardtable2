import type { TableObject } from '@cardtable2/shared';
import { MAT_DEFAULT_COLOR, MAT_DEFAULT_SIZE } from './constants';

/** Get the color for a mat, with fallback to default */
export function getMatColor(obj: TableObject): number {
  return (obj._meta?.color as number) ?? MAT_DEFAULT_COLOR;
}

/** Get the size (radius) for a mat, with fallback to default */
export function getMatSize(obj: TableObject): number {
  return (obj._meta?.size as number) ?? MAT_DEFAULT_SIZE;
}
