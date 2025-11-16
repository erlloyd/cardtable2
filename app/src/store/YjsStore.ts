import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { TableObject, ActorId } from '@cardtable2/shared';
import { ObjectKind } from '@cardtable2/shared';
import { v4 as uuidv4 } from 'uuid';

/**
 * YjsStore manages the Y.Doc for table state with IndexedDB persistence.
 *
 * Responsibilities (M3-T1):
 * - Initialize Y.Doc with schema (objects: Y.Map)
 * - Set up IndexedDB auto-save
 * - Restore state on load
 * - Provide type-safe access to document
 *
 * Future (M3-T2+):
 * - Engine actions (create, move, flip, rotate, stack, unstack)
 * - Selection ownership
 * - Awareness (cursors, drag ghosts)
 */
export class YjsStore {
  private doc: Y.Doc;
  private persistence: IndexeddbPersistence | null = null;
  private actorId: ActorId;
  private isReady = false;
  private readyPromise: Promise<void>;

  // Typed access to Y.Doc maps
  public objects: Y.Map<Y.Map<unknown>>;

  constructor(tableId: string) {
    this.doc = new Y.Doc();
    this.actorId = uuidv4();

    // Get or create objects map
    this.objects = this.doc.getMap('objects');

    // Set up IndexedDB persistence
    // Database name format: cardtable-{tableId}
    this.persistence = new IndexeddbPersistence(
      `cardtable-${tableId}`,
      this.doc,
    );

    // Wait for persistence to load existing state
    this.readyPromise = new Promise<void>((resolve, reject) => {
      if (!this.persistence) {
        reject(new Error('Persistence not initialized'));
        return;
      }

      this.persistence.on('synced', () => {
        console.log('[YjsStore] IndexedDB synced, state restored');
        this.isReady = true;
        resolve();
      });

      // Set a timeout in case syncing takes too long
      setTimeout(() => {
        if (!this.isReady) {
          console.warn('[YjsStore] IndexedDB sync timeout, proceeding anyway');
          this.isReady = true;
          resolve();
        }
      }, 5000); // 5 second timeout
    });
  }

  /**
   * Wait for store to be ready (IndexedDB loaded)
   */
  async waitForReady(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Get actor ID for this client
   */
  getActorId(): ActorId {
    return this.actorId;
  }

  /**
   * Get the underlying Y.Doc
   */
  getDoc(): Y.Doc {
    return this.doc;
  }

  /**
   * Get all objects as plain JavaScript objects
   */
  getAllObjects(): Map<string, TableObject> {
    const result = new Map<string, TableObject>();

    this.objects.forEach((yMap, id) => {
      // Convert Y.Map to plain object
      const obj = yMap.toJSON() as TableObject;
      result.set(id, obj);
    });

    return result;
  }

  /**
   * Get a single object by ID
   */
  getObject(id: string): TableObject | null {
    const yMap = this.objects.get(id);
    if (!yMap) return null;

    return yMap.toJSON() as TableObject;
  }

  /**
   * Create or update an object (M3-T1 basic implementation)
   * Full engine actions will be implemented in M3-T2
   */
  setObject(id: string, obj: TableObject): void {
    this.doc.transact(() => {
      let yMap = this.objects.get(id);
      if (!yMap) {
        yMap = new Y.Map();
        this.objects.set(id, yMap);
      }

      // Update all fields
      yMap.set('_kind', obj._kind);
      yMap.set('_containerId', obj._containerId);
      yMap.set('_pos', obj._pos);
      yMap.set('_sortKey', obj._sortKey);
      yMap.set('_locked', obj._locked);
      yMap.set('_selectedBy', obj._selectedBy);
      yMap.set('_meta', obj._meta);

      // Stack-specific fields (type-narrowed)
      if (
        obj._kind === ObjectKind.Stack &&
        '_cards' in obj &&
        '_faceUp' in obj
      ) {
        yMap.set('_cards', obj._cards);
        yMap.set('_faceUp', obj._faceUp);
      }
    });
  }

  /**
   * Delete an object
   */
  deleteObject(id: string): void {
    this.doc.transact(() => {
      this.objects.delete(id);
    });
  }

  /**
   * Subscribe to object changes (including nested changes)
   */
  onObjectsChange(callback: () => void): () => void {
    const observer = () => {
      callback();
    };

    // Use observeDeep to catch changes to nested Y.Maps (individual objects)
    this.objects.observeDeep(observer);

    // Return unsubscribe function
    return () => {
      this.objects.unobserveDeep(observer);
    };
  }

  /**
   * Clear all objects (useful for testing/debugging)
   */
  clearAllObjects(): void {
    this.doc.transact(() => {
      this.objects.clear();
    });
  }

  /**
   * Export entire state as JSON for debugging
   * Usage in browser console: JSON.stringify(window.__TEST_STORE__.toJSON(), null, 2)
   */
  toJSON(): Record<string, TableObject> {
    const result: Record<string, TableObject> = {};
    this.objects.forEach((yMap, id) => {
      result[id] = yMap.toJSON() as TableObject;
    });
    return result;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.persistence) {
      void this.persistence.destroy();
      this.persistence = null;
    }
    this.doc.destroy();
  }
}
