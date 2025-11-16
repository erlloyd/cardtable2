import type { TableObject } from '@cardtable2/shared';
import { TOKEN_DEFAULT_COLOR, TOKEN_DEFAULT_SIZE } from './constants';

/** Get the color for a token, with fallback to default */
export function getTokenColor(obj: TableObject): number {
  return (obj._meta?.color as number) ?? TOKEN_DEFAULT_COLOR;
}

/** Get the size (radius) for a token, with fallback to default */
export function getTokenSize(obj: TableObject): number {
  return (obj._meta?.size as number) ?? TOKEN_DEFAULT_SIZE;
}
