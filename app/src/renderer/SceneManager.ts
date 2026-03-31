import RBush from 'rbush';
import type { TableObject } from '@cardtable2/shared';
import { getBehaviors } from './objects';

/**
 * Bounding box for RBush spatial indexing
 */
export interface BBox {
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
   * Add an object to the scene.
   * Use skipSpatial during drag to prevent stale bboxes from blocking hit-tests.
   */
  addObject(
    id: string,
    obj: TableObject,
    options?: { skipSpatial?: boolean },
  ): void {
    this.objects.set(id, obj);

    if (!options?.skipSpatial) {
      // Calculate bounding box and add to spatial index
      const bbox = this.getBoundingBox(id, obj);
      this.spatialIndex.insert(bbox);
      this.bboxCache.set(id, bbox); // Cache for accurate removal later
    }
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
   * Remove objects from the spatial index without removing them from the scene.
   * Used during drag to prevent stale bboxes from blocking hit-tests on objects underneath.
   * Objects remain accessible via getObject() — only spatial queries are affected.
   * Call updateObject() to re-add them when drag ends.
   */
  removeSpatialEntries(ids: Iterable<string>): void {
    for (const id of ids) {
      const bbox = this.bboxCache.get(id);
      if (bbox) {
        this.spatialIndex.remove(bbox, (a, b) => a.id === b.id);
        this.bboxCache.delete(id);
      }
    }
  }

  /**
   * Update an object's data and optionally its spatial index entry.
   * Use skipSpatial during drag to prevent stale bboxes from blocking hit-tests.
   */
  updateObject(
    id: string,
    obj: TableObject,
    options?: { skipSpatial?: boolean },
  ): void {
    // Remove old entry
    this.removeObject(id);
    // Re-add (passes skipSpatial through to addObject)
    this.addObject(id, obj, options);
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

    // Build candidate list with object data
    const candidateList = candidates.map((bbox) => {
      const obj = this.objects.get(bbox.id)!;
      return { id: bbox.id, object: obj };
    });

    // Sort candidates by _sortKey (higher = on top)
    // SortKeys encode full z-ordering including parent/child relationships
    candidateList.sort((a, b) => {
      if (a.object._sortKey > b.object._sortKey) return -1;
      if (a.object._sortKey < b.object._sortKey) return 1;
      return 0;
    });

    // Return the topmost object
    return candidateList[0] ?? null;
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
   * Calculate bounding box for an object based on its type and metadata
   */
  private getBoundingBox(id: string, obj: TableObject): BBox {
    const behaviors = getBehaviors(obj._kind);
    const bounds = behaviors.getBounds(obj);
    return { ...bounds, id };
  }
}
