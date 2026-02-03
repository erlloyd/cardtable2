import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import { Awareness } from 'y-protocols/awareness';
import type {
  TableObject,
  TableObjectProps,
  ActorId,
  AwarenessState,
  ObjectKind,
} from '@cardtable2/shared';
import { v4 as uuidv4 } from 'uuid';
import { throttle, AWARENESS_UPDATE_INTERVAL_MS } from '../utils/throttle';
import { runMigrations } from './migrations';
import type { TableObjectYMap } from './types';
import { toTableObject } from './types';
import type { GameAssets } from '../content';
import { STORE_GAMEASSETS_LISTENER_FAILED } from '../constants/errorIds';

// Re-export types and utilities for convenience
export type { TableObjectYMap };
export { toTableObject };

/**
 * Change information from Yjs observer (M3.6-T2)
 * Now provides Y.Map references instead of plain objects for zero-allocation performance
 */
export interface ObjectChanges {
  added: Array<{ id: string; yMap: TableObjectYMap }>;
  updated: Array<{ id: string; yMap: TableObjectYMap }>;
  removed: Array<string>;
}

/**
 * YjsStore manages the Y.Doc for table state with IndexedDB persistence.
 *
 * Responsibilities:
 * - Initialize Y.Doc with schema (objects: Y.Map) (M3-T1)
 * - Set up IndexedDB auto-save (M3-T1)
 * - Restore state on load (M3-T1)
 * - Provide type-safe access to document (M3-T1)
 * - Engine actions (create, move, flip, rotate, stack, unstack) (M3-T2)
 * - Selection ownership (M3-T3)
 * - Awareness (cursors, drag ghosts) (M3-T4)
 */
export class YjsStore {
  private doc: Y.Doc;
  private persistence: IndexeddbPersistence | null = null;
  private wsProvider: WebsocketProvider | null = null; // M5-T1
  private actorId: ActorId;
  private isReady = false;
  private readyPromise: Promise<void>;
  private connectionStatus:
    | 'offline'
    | 'connecting'
    | 'connected'
    | 'disconnected' = 'offline'; // M5-T1
  private connectionStatusCallbacks: Set<(status: string) => void> = new Set();

  // Game assets management (session-scoped)
  private gameAssets: GameAssets | null = null;
  private gameAssetsListeners: Set<(assets: GameAssets | null) => void> =
    new Set();

  // Typed access to Y.Doc maps (M3.6-T2: now uses TypedMap for type-safe property access)
  public objects: Y.Map<TableObjectYMap>;

  // Metadata map for table-level state (game ID, settings, etc.)
  public metadata: Y.Map<unknown>;

  // Awareness for ephemeral state (M3-T4)
  public awareness: Awareness;

  // Throttled drag state update (30Hz)
  private throttledDragStateUpdate = throttle(
    (
      gid: string,
      primaryId: string,
      pos: { x: number; y: number; r: number },
      secondaryOffsets?: Record<string, { dx: number; dy: number; dr: number }>,
    ) => {
      const dragState = {
        gid,
        primaryId,
        pos,
        secondaryOffsets,
        ts: Date.now(),
      };
      this.awareness.setLocalStateField('drag', dragState);
    },
    AWARENESS_UPDATE_INTERVAL_MS,
  );

  constructor(tableId: string, wsUrl?: string) {
    this.doc = new Y.Doc();
    this.actorId = uuidv4();

    // Get or create objects map
    this.objects = this.doc.getMap('objects');

    // Get or create metadata map
    this.metadata = this.doc.getMap('metadata');

    // Initialize awareness (M3-T4)
    this.awareness = new Awareness(this.doc);
    this.awareness.setLocalStateField('actorId', this.actorId);

    // Set up IndexedDB persistence
    // Database name format: cardtable-{tableId}
    this.persistence = new IndexeddbPersistence(
      `cardtable-${tableId}`,
      this.doc,
    );

    // Set up WebSocket provider for multiplayer (M5-T1)
    // Optional - only connects if wsUrl is provided
    if (wsUrl) {
      console.log(`[YjsStore] Connecting to multiplayer server: ${wsUrl}`);
      this.wsProvider = new WebsocketProvider(wsUrl, tableId, this.doc, {
        awareness: this.awareness,
      });

      this.wsProvider.on('status', (event: { status: string }) => {
        console.log(`[YjsStore] WebSocket status: ${event.status}`);
        // Map y-websocket status to our status type
        if (event.status === 'connected') {
          this.setConnectionStatus('connected');
        } else if (event.status === 'disconnected') {
          this.setConnectionStatus('disconnected');
        } else {
          this.setConnectionStatus('connecting');
        }
      });

      this.wsProvider.on('connection-error', (event: Event) => {
        console.error('[YjsStore] WebSocket connection error:', event);
        this.setConnectionStatus('disconnected');
      });

      // Set initial connecting status
      this.setConnectionStatus('connecting');

      // Debug: Log when Y.Doc updates are sent/received
      this.doc.on('update', (update: Uint8Array, origin: unknown) => {
        const isRemote = origin === this.wsProvider;
        console.log(
          `[YjsStore] Y.Doc update: ${update.byteLength} bytes, ${isRemote ? 'FROM REMOTE' : 'LOCAL'}`,
        );
      });
    } else {
      console.log('[YjsStore] Running in offline mode (no server connection)');
    }

    // Wait for persistence to load existing state
    this.readyPromise = new Promise<void>((resolve, reject) => {
      if (!this.persistence) {
        reject(new Error('Persistence not initialized'));
        return;
      }

      this.persistence.on('synced', () => {
        console.log('[YjsStore] IndexedDB synced, state restored');

        // Run migrations to ensure all objects have required properties
        // This runs before the store is marked as ready, ensuring objects
        // are in the correct state before any UI interaction
        runMigrations(this.doc);

        // Clear stale selections from previous sessions (M3-T3)
        // Each page load creates a new actor ID, so old selections are orphaned.
        // For solo mode: always start with clean slate.
        // For future multiplayer (M3-T4): render other actors' selections with different colors.
        this.clearStaleSelections();

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

  // ============================================================================
  // Y.Map Access Methods (M3.6-T2) - Zero-allocation, direct Y.Map access
  // ============================================================================

  /**
   * Get a Y.Map reference for an object by ID (M3.6-T2)
   *
   * Returns the Y.Map directly without conversion - zero allocations.
   * Use this when you need to work with Y.Map methods or read multiple properties.
   *
   * @example
   * ```typescript
   * const yMap = store.getObjectYMap(id);
   * if (yMap) {
   *   const kind = yMap.get('_kind');
   *   const pos = yMap.get('_pos');
   * }
   * ```
   */
  getObjectYMap(id: string): TableObjectYMap | undefined {
    return this.objects.get(id);
  }

  /**
   * Get a single property from an object (M3.6-T2)
   *
   * Type-safe property access without converting the entire object.
   * Most efficient for reading a single property.
   *
   * @example
   * ```typescript
   * const kind = store.getObjectProperty(id, '_kind');
   * const pos = store.getObjectProperty(id, '_pos');
   * ```
   */
  getObjectProperty<K extends keyof TableObjectProps>(
    id: string,
    key: K,
  ): TableObjectProps[K] | undefined {
    const yMap = this.objects.get(id);
    if (!yMap) return undefined;
    return yMap.get(key);
  }

  /**
   * Get all objects selected by a specific actor (M3.6-T2)
   *
   * Returns Y.Map references with their IDs for selected objects.
   * This avoids expensive O(n*m) lookups when IDs are needed downstream.
   *
   * @example
   * ```typescript
   * const selected = store.getObjectsSelectedBy(store.getActorId());
   * selected.forEach(({ id, yMap }) => {
   *   const kind = yMap.get('_kind');
   *   console.log(`Object ${id} has kind ${kind}`);
   * });
   * ```
   */
  getObjectsSelectedBy(
    actorId: ActorId,
  ): Array<{ id: string; yMap: TableObjectYMap }> {
    const result: Array<{ id: string; yMap: TableObjectYMap }> = [];
    this.objects.forEach((yMap, id) => {
      const selectedBy = yMap.get('_selectedBy');
      if (selectedBy === actorId) {
        result.push({ id, yMap });
      }
    });
    return result;
  }

  /**
   * Get all objects of a specific kind (M3.6-T2)
   *
   * Returns Y.Map references for objects of the given kind - zero allocations.
   *
   * @example
   * ```typescript
   * const stacks = store.getObjectsByKind(ObjectKind.Stack);
   * stacks.forEach(yMap => {
   *   const cards = yMap.get('_cards');
   *   // ... work with stack
   * });
   * ```
   */
  getObjectsByKind(kind: ObjectKind): TableObjectYMap[] {
    const result: TableObjectYMap[] = [];
    this.objects.forEach((yMap) => {
      const objKind = yMap.get('_kind');
      if (objKind === kind) {
        result.push(yMap);
      }
    });
    return result;
  }

  /**
   * Iterate over all objects with a callback (M3.6-T2)
   *
   * Helper utility for common iteration patterns.
   * Works directly with Y.Maps - zero allocations.
   *
   * @example
   * ```typescript
   * store.forEachObject((yMap, id) => {
   *   const kind = yMap.get('_kind');
   *   console.log(`Object ${id} is ${kind}`);
   * });
   * ```
   */
  forEachObject(fn: (yMap: TableObjectYMap, id: string) => void): void {
    this.objects.forEach(fn);
  }

  /**
   * Filter objects by a predicate (M3.6-T2)
   *
   * Returns array of object IDs that match the predicate.
   * Works directly with Y.Maps - zero allocations during iteration.
   *
   * @example
   * ```typescript
   * const lockedIds = store.filterObjects((yMap) => yMap.get('_locked') === true);
   * ```
   */
  filterObjects(
    predicate: (yMap: TableObjectYMap, id: string) => boolean,
  ): string[] {
    const result: string[] = [];
    this.objects.forEach((yMap, id) => {
      if (predicate(yMap, id)) {
        result.push(id);
      }
    });
    return result;
  }

  /**
   * Map objects to a new array (M3.6-T2)
   *
   * Transform objects using a mapping function.
   * Works directly with Y.Maps - minimal allocations (only for result array).
   *
   * @example
   * ```typescript
   * const positions = store.mapObjects((yMap) => yMap.get('_pos'));
   * ```
   */
  mapObjects<T>(fn: (yMap: TableObjectYMap, id: string) => T): T[] {
    const result: T[] = [];
    this.objects.forEach((yMap, id) => {
      result.push(fn(yMap, id));
    });
    return result;
  }

  /**
   * Create or update an object (M3-T1 basic implementation, M3.6-T2 typed)
   * Full engine actions will be implemented in M3-T2
   */
  setObject(id: string, obj: TableObject): void {
    this.doc.transact(() => {
      let yMap = this.objects.get(id);
      if (!yMap) {
        yMap = new Y.Map() as TableObjectYMap;
        this.objects.set(id, yMap);
      }

      // Update all fields dynamically - iterate over all properties
      // This ensures we never miss a field when adding new object types or properties
      for (const [key, value] of Object.entries(obj)) {
        yMap.set(
          key as keyof TableObjectProps,
          value as TableObjectProps[keyof TableObjectProps],
        );
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
   * Subscribe to object changes with detailed change information (M3.6-T2)
   *
   * Now provides Y.Map references instead of plain objects - zero allocations.
   */
  onObjectsChange(callback: (changes: ObjectChanges) => void): () => void {
    const observer = (events: Y.YEvent<Y.Map<unknown>>[]) => {
      const changes: ObjectChanges = {
        added: [],
        updated: [],
        removed: [],
      };

      // Parse Yjs events to determine what changed
      for (const event of events) {
        if (event.target === this.objects) {
          // Changes to the top-level objects map
          event.changes.keys.forEach((change, key) => {
            if (change.action === 'add') {
              const yMap = this.objects.get(key);
              if (yMap) {
                changes.added.push({
                  id: key,
                  yMap,
                });
              }
            } else if (change.action === 'delete') {
              changes.removed.push(key);
            }
          });
        } else if (
          'parent' in event.target &&
          event.target.parent === this.objects
        ) {
          // Changes to nested Y.Maps (individual object properties)
          // Find which object was modified
          this.objects.forEach((yMap, id) => {
            if (yMap === event.target) {
              changes.updated.push({
                id,
                yMap,
              });
            }
          });
        }
      }

      // Only call callback if there were actual changes
      if (
        changes.added.length > 0 ||
        changes.updated.length > 0 ||
        changes.removed.length > 0
      ) {
        callback(changes);
      }
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
   * Clear stale selections from previous sessions (M3-T3, M3.6-T2).
   *
   * Called on initialization after IndexedDB loads. Each page load creates a new
   * actor ID, so selections from previous sessions are orphaned and should be cleared.
   *
   * NOTE: In future multiplayer mode (M3-T4), this logic will change:
   * - Don't clear selections on load
   * - Render other actors' selections with different colored borders
   * - Use awareness to distinguish active vs stale selections
   */
  private clearStaleSelections(): void {
    let clearedCount = 0;

    this.doc.transact(() => {
      this.objects.forEach((yMap) => {
        const selectedBy = yMap.get('_selectedBy');
        if (selectedBy !== null) {
          // Clear stale selection
          yMap.set('_selectedBy', null);
          clearedCount++;
        }
      });
    });

    if (clearedCount > 0) {
      console.log(
        `[YjsStore] Cleared ${clearedCount} stale selection(s) from previous session`,
      );
    }
  }

  /**
   * Export entire state as JSON for debugging (M3.6-T2)
   *
   * NOTE: This is the ONLY method that still uses .toJSON() - it's explicitly
   * for debugging/export purposes and is not used in the hot path.
   *
   * Usage in browser console: JSON.stringify(window.__TEST_STORE__.toJSON(), null, 2)
   */
  toJSON(): Record<string, TableObject> {
    const result: Record<string, TableObject> = {};
    this.objects.forEach((yMap, id) => {
      result[id] = toTableObject(yMap);
    });
    return result;
  }

  // ============================================================================
  // Awareness Methods (M3-T4)
  // ============================================================================

  /**
   * Set cursor position in world coordinates (ephemeral)
   * Updates at 30Hz (throttling handled by caller)
   *
   * @param x - X coordinate in world space
   * @param y - Y coordinate in world space
   */
  setCursor(x: number, y: number): void {
    this.awareness.setLocalStateField('cursor', { x, y });
  }

  /**
   * Clear cursor position (when pointer leaves canvas)
   */
  clearCursor(): void {
    this.awareness.setLocalStateField('cursor', null);
  }

  /**
   * Set drag state (ephemeral, active drag)
   * Throttled to 30Hz to reduce network overhead
   *
   * @param gid - Gesture ID (unique per drag operation)
   * @param primaryId - Primary object ID being dragged
   * @param pos - Absolute world position of primary object
   * @param secondaryOffsets - Relative offsets for secondary dragged objects
   */
  setDragState(
    gid: string,
    primaryId: string,
    pos: { x: number; y: number; r: number },
    secondaryOffsets?: Record<string, { dx: number; dy: number; dr: number }>,
  ): void {
    this.throttledDragStateUpdate(gid, primaryId, pos, secondaryOffsets);
  }

  /**
   * Clear drag state (when drag ends)
   */
  clearDragState(): void {
    this.awareness.setLocalStateField('drag', null);
  }

  /**
   * Subscribe to awareness changes from other actors
   *
   * @param callback - Called when remote awareness state changes
   * @returns Unsubscribe function
   */
  onAwarenessChange(
    callback: (states: Map<number, AwarenessState>) => void,
  ): () => void {
    const handler = () => {
      // Get all awareness states (Map<clientID, AwarenessState>)
      const states = this.awareness.getStates() as Map<number, AwarenessState>;
      callback(states);
    };

    this.awareness.on('change', handler);

    return () => {
      this.awareness.off('change', handler);
    };
  }

  /**
   * Get current local awareness state (for debugging)
   */
  getLocalAwarenessState(): AwarenessState | null {
    return this.awareness.getLocalState() as AwarenessState | null;
  }

  /**
   * Get all remote awareness states (for debugging)
   */
  getRemoteAwarenessStates(): Map<number, AwarenessState> {
    const localClientId = this.doc.clientID;
    const allStates = this.awareness.getStates() as Map<number, AwarenessState>;
    const remoteStates = new Map<number, AwarenessState>();

    allStates.forEach((state, clientId) => {
      if (clientId !== localClientId) {
        remoteStates.set(clientId, state);
      }
    });

    return remoteStates;
  }

  /**
   * Get current WebSocket connection status (M5-T1)
   */
  getConnectionStatus():
    | 'offline'
    | 'connecting'
    | 'connected'
    | 'disconnected' {
    return this.connectionStatus;
  }

  /**
   * Subscribe to connection status changes (M5-T1)
   * @returns Unsubscribe function
   */
  onConnectionStatusChange(callback: (status: string) => void): () => void {
    this.connectionStatusCallbacks.add(callback);
    // Immediately call with current status
    callback(this.connectionStatus);
    // Return unsubscribe function
    return () => {
      this.connectionStatusCallbacks.delete(callback);
    };
  }

  /**
   * Set connection status and notify subscribers (M5-T1)
   */
  private setConnectionStatus(
    status: 'offline' | 'connecting' | 'connected' | 'disconnected',
  ): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      // Notify all subscribers
      for (const callback of this.connectionStatusCallbacks) {
        callback(status);
      }
    }
  }

  // ============================================================================
  // Game Assets Management
  // ============================================================================

  /**
   * Set game assets and notify all subscribers
   *
   * This replaces the React state-based approach with store-managed assets.
   * Components subscribe via onGameAssetsChange() to receive updates.
   *
   * @param assets - Game assets to set (cards, tokens, etc.)
   */
  setGameAssets(assets: GameAssets): void {
    this.gameAssets = assets;
    // Notify all subscribers with error isolation
    for (const listener of this.gameAssetsListeners) {
      try {
        listener(assets);
      } catch (error) {
        console.error('[YjsStore] GameAssets listener failed', {
          errorId: STORE_GAMEASSETS_LISTENER_FAILED,
          error,
          listenerCount: this.gameAssetsListeners.size,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        // Continue to next listener - don't let one failure stop others
      }
    }
  }

  /**
   * Get current game assets
   *
   * @returns Current game assets or null if not set
   */
  getGameAssets(): GameAssets | null {
    return this.gameAssets;
  }

  /**
   * Subscribe to game assets changes
   *
   * The callback will be invoked immediately with the current assets,
   * then again whenever assets change.
   *
   * @param fn - Callback to invoke when assets change
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = store.onGameAssetsChange((assets) => {
   *   console.log('Assets updated:', assets);
   * });
   * // Later: unsubscribe()
   * ```
   */
  onGameAssetsChange(fn: (assets: GameAssets | null) => void): () => void {
    this.gameAssetsListeners.add(fn);
    // Immediately call with current assets
    fn(this.gameAssets);
    // Return unsubscribe function
    return () => {
      this.gameAssetsListeners.delete(fn);
    };
  }

  // ============================================================================
  // Test-only helper methods (M3.6-T5)
  // ============================================================================

  /**
   * Get all objects as a Map of plain objects (test-only helper)
   * This method is only for E2E tests to maintain compatibility with old API.
   * Production code should use `objects` getter or `toJSON()` instead.
   *
   * @returns Map of object IDs to plain TableObject instances
   */
  getAllObjects(): Map<string, TableObject> {
    const result = new Map<string, TableObject>();
    this.objects.forEach((yMap, id) => {
      result.set(id, toTableObject(yMap));
    });
    return result;
  }

  /**
   * Get a single object as a plain object (test-only helper)
   * This method is only for E2E tests to maintain compatibility with old API.
   * Production code should use `getObjectYMap()` instead.
   *
   * @param id - Object ID
   * @returns Plain TableObject or undefined
   */
  getObject(id: string): TableObject | undefined {
    const yMap = this.getObjectYMap(id);
    return yMap ? toTableObject(yMap) : undefined;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Cancel any pending throttled awareness updates
    this.throttledDragStateUpdate.cancel();

    // Clean up awareness
    this.awareness.destroy();

    // Clean up WebSocket provider (M5-T1)
    if (this.wsProvider) {
      this.wsProvider.destroy();
      this.wsProvider = null;
    }

    if (this.persistence) {
      void this.persistence.destroy();
      this.persistence = null;
    }
    this.doc.destroy();
  }
}
