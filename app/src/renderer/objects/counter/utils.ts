import type { TableObject } from '@cardtable2/shared';
import { COUNTER_DEFAULT_COLOR, COUNTER_DEFAULT_SIZE } from './constants';

/** Get the color for a counter, with fallback to default */
export function getCounterColor(obj: TableObject): number {
  return (obj._meta?.color as number) ?? COUNTER_DEFAULT_COLOR;
}

/** Get the size (radius) for a counter, with fallback to default */
export function getCounterSize(obj: TableObject): number {
  return (obj._meta?.size as number) ?? COUNTER_DEFAULT_SIZE;
}
