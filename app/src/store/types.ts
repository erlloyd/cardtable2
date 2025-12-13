/**
 * Type definitions for Yjs store structures (M3.6-T1)
 *
 * This file contains type aliases and utilities for working with typed Y.Maps
 * instead of converting to plain objects via .toJSON().
 */

import type { TypedMap } from 'yjs-types';
import type { TableObjectProps } from '@cardtable2/shared';

/**
 * Type alias for a typed Y.Map representing a table object.
 *
 * Usage:
 * ```typescript
 * const yMap: TableObjectYMap = store.getObjectYMap(id);
 * const kind = yMap.get('_kind'); // Type-safe property access
 * const pos = yMap.get('_pos');
 * ```
 */
export type TableObjectYMap = TypedMap<TableObjectProps>;

/**
 * Type alias for the objects map in Y.Doc.
 * Maps object ID (string) to typed Y.Map.
 *
 * Usage:
 * ```typescript
 * const objectsMap: ObjectsYMap = ydoc.getMap('objects');
 * objectsMap.forEach((yMap, id) => {
 *   const kind = yMap.get('_kind');
 *   // ... work with Y.Map directly
 * });
 * ```
 */
export type ObjectsYMap = Map<string, TableObjectYMap>;
