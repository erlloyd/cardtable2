import RBush from 'rbush';
import type { TableObject } from '@cardtable2/shared';
import { CARD_WIDTH, CARD_HEIGHT } from './constants';

/**
 * Bounding box for RBush spatial indexing
 */
interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string; // Object ID
}

/**
 * SceneManager handles the scene graph and spatial indexing for efficient hit-testing.
 * Uses RBush for O(log n + k) spatial queries.
 */
export class SceneManager {
  private objects: Map<string, TableObject> = new Map();
  private spatialIndex: RBush<BBox> = new RBush();
  private bboxCache: Map<string, BBox> = new Map(); // Cache bboxes for accurate removal

  /**
   * Add an object to the scene
   */
  addObject(id: string, obj: TableObject): void {
    this.objects.set(id, obj);

    // Calculate bounding box and add to spatial index
    const bbox = this.getBoundingBox(id, obj);
    this.spatialIndex.insert(bbox);
    this.bboxCache.set(id, bbox); // Cache for accurate removal later
  }

  /**
   * Remove an object from the scene
   */
  removeObject(id: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;

    // Remove from spatial index using cached bbox (critical for objects that moved!)
    const bbox = this.bboxCache.get(id);
    if (bbox) {
      this.spatialIndex.remove(bbox, (a, b) => a.id === b.id);
      this.bboxCache.delete(id);
    }

    this.objects.delete(id);
  }

  /**
   * Update an object's position/rotation
   */
  updateObject(id: string, obj: TableObject): void {
    // Remove old bounding box
    this.removeObject(id);
    // Add new bounding box
    this.addObject(id, obj);
  }

  /**
   * Get an object by ID
   */
  getObject(id: string): TableObject | undefined {
    return this.objects.get(id);
  }

  /**
   * Get all objects
   */
  getAllObjects(): Map<string, TableObject> {
    return this.objects;
  }

  /**
   * Hit-test: find the topmost object at a world point
   * Returns null if no object is under the point
   */
  hitTest(
    worldX: number,
    worldY: number,
  ): { id: string; object: TableObject } | null {
    // Query spatial index for objects containing the point
    const candidates = this.spatialIndex.search({
      minX: worldX,
      minY: worldY,
      maxX: worldX,
      maxY: worldY,
    });

    if (candidates.length === 0) return null;

    // Sort candidates by _sortKey (higher = on top)
    // _sortKey is a fractional index string, lexicographic sort works correctly
    const sorted = candidates
      .map((bbox) => {
        const obj = this.objects.get(bbox.id)!;
        return { id: bbox.id, object: obj };
      })
      .sort((a, b) => {
        // Higher _sortKey = on top
        if (a.object._sortKey > b.object._sortKey) return -1;
        if (a.object._sortKey < b.object._sortKey) return 1;
        return 0;
      });

    // Return the topmost object
    return sorted[0];
  }

  /**
   * Hit-test: find all objects intersecting a rectangle
   */
  hitTestRect(bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }): Array<{ id: string; object: TableObject }> {
    const candidates = this.spatialIndex.search(bounds);

    return candidates.map((bbox) => ({
      id: bbox.id,
      object: this.objects.get(bbox.id)!,
    }));
  }

  /**
   * Clear all objects from the scene
   */
  clear(): void {
    this.objects.clear();
    this.spatialIndex.clear();
    this.bboxCache.clear();
  }

  /**
   * Calculate bounding box for an object
   * For now, all objects use standard card size
   * TODO: Handle different object types (tokens, zones, etc.) with different sizes
   */
  private getBoundingBox(id: string, obj: TableObject): BBox {
    const { x, y } = obj._pos;
    // const { r } = obj._pos; // TODO: Handle rotation properly with rotated bounding boxes

    // For now, ignore rotation and use axis-aligned bounding box
    const halfWidth = CARD_WIDTH / 2;
    const halfHeight = CARD_HEIGHT / 2;

    return {
      minX: x - halfWidth,
      minY: y - halfHeight,
      maxX: x + halfWidth,
      maxY: y + halfHeight,
      id,
    };
  }
}
