import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Awareness } from 'y-protocols/awareness';
import type {
  TableObject,
  TableObjectProps,
  ActorId,
  AwarenessState,
  ObjectKind,
  DiscardZoneEntry,
  CardEntry,
} from '@cardtable2/shared';
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

const NO_HAND_CARDS: CardEntry[] = [];

const INDEXEDDB_SYNC_TIMEOUT_MS = 5000;

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
 *
 * Lifecycle: the constructor only builds the Y.Doc and its maps, so a store
 * can be created during render and discarded without leaking anything. The
 * external resources (IndexedDB persistence, awareness, WebSocket provider)
 * belong to a connection opened by `connect()` and released by `disconnect()`.
 * A disconnected store is still fully usable for Y.Doc operations.
 */
export class YjsStore {
  private doc: Y.Doc;
  private tableId: string;
  private wsUrl: string | undefined;
  private persistence: IndexeddbPersistence | null = null;
  private wsProvider: HocuspocusProvider | null = null; // M5-T1
  private awareness: Awareness | null = null;
  // Peers drop awareness updates whose clock is not above the last one they
  // saw for our clientID, so a reconnected awareness resumes from here.
  private awarenessClock: number | undefined;
  private syncTimeout: ReturnType<typeof setTimeout> | undefined;
  // Bumped on every connect()/disconnect() so callbacks from a released
  // connection can tell they are stale.
  private connectionGeneration = 0;
  private actorId: ActorId;
  private ready = false;
  private readyCallbacks: Set<() => void> = new Set();
  private awarenessCallbacks: Set<
    (states: Map<number, AwarenessState>) => void
  > = new Set();
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

  // Player hands map (hand ID -> Y.Map with name, cards, visibility)
  public hands: Y.Map<Y.Map<unknown>>;

  // Discard zones map (zoneId -> DiscardZoneEntry plain object)
  // getMap auto-creates an empty map for new docs; no migration needed.
  public discardZones: Y.Map<DiscardZoneEntry>;

  // Throttled cursor update (30Hz)
  private throttledCursorUpdate = throttle((x: number, y: number) => {
    this.awareness?.setLocalStateField('cursor', { x, y });
  }, AWARENESS_UPDATE_INTERVAL_MS);

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
      this.awareness?.setLocalStateField('drag', dragState);
    },
    AWARENESS_UPDATE_INTERVAL_MS,
  );

  private handleAwarenessChange = () => {
    if (!this.awareness) return;
    // Get all awareness states (Map<clientID, AwarenessState>)
    const states = this.awareness.getStates() as Map<number, AwarenessState>;
    for (const callback of this.awarenessCallbacks) {
      callback(states);
    }
  };

  constructor(tableId: string, wsUrl?: string) {
    this.doc = new Y.Doc();
    this.actorId = crypto.randomUUID();

    // Get or create objects map
    this.objects = this.doc.getMap('objects');

    // Get or create metadata map
    this.metadata = this.doc.getMap('metadata');

    // Get or create hands map
    this.hands = this.doc.getMap('hands');

    // Get or create discard zones map
    this.discardZones = this.doc.getMap('discardZones');

    this.tableId = tableId;
    this.wsUrl = wsUrl;
  }

  /**
   * Open the external resources: IndexedDB persistence, awareness and (when a
   * wsUrl was given) the WebSocket provider. Repeatable after `disconnect()`.
   * Ready fires once IndexedDB has synced (or the sync timeout elapses).
   * The socket opens alongside IndexedDB, so StrictMode's dev double-connect
   * produces one benign "closed before the connection is established" warning.
   */
  connect(): void {
    if (this.awareness) {
      throw new Error('YjsStore.connect() called while already connected');
    }
    const generation = ++this.connectionGeneration;

    // Initialize awareness (M3-T4)
    const awareness = new Awareness(this.doc);
    if (this.awarenessClock !== undefined) {
      awareness.meta.set(this.doc.clientID, {
        clock: this.awarenessClock,
        lastUpdated: Date.now(),
      });
    }
    awareness.setLocalStateField('actorId', this.actorId);
    awareness.on('change', this.handleAwarenessChange);
    this.awareness = awareness;

    // Set up IndexedDB persistence
    // Database name format: cardtable-{tableId}
    const persistence = new IndexeddbPersistence(
      `cardtable-${this.tableId}`,
      this.doc,
    );
    this.persistence = persistence;

    persistence.on('synced', () => {
      if (generation !== this.connectionGeneration) return;
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

      this.setReady(true);
    });

    // Set a timeout in case syncing takes too long
    this.syncTimeout = setTimeout(() => {
      this.syncTimeout = undefined;
      if (!this.ready) {
        console.warn('[YjsStore] IndexedDB sync timeout, proceeding anyway');
        this.setReady(true);
      }
    }, INDEXEDDB_SYNC_TIMEOUT_MS);

    this.openProvider(awareness, generation);
  }

  /**
   * Set up the WebSocket provider for multiplayer (M5-T1).
   * Optional - only connects if wsUrl was provided.
   */
  private openProvider(awareness: Awareness, generation: number): void {
    if (!this.wsUrl) {
      console.log('[YjsStore] Running in offline mode (no server connection)');
      return;
    }
    console.log(`[YjsStore] Connecting to multiplayer server: ${this.wsUrl}`);
    this.wsProvider = new HocuspocusProvider({
      url: this.wsUrl,
      name: this.tableId,
      document: this.doc,
      awareness,
      onStatus: ({ status }) => {
        if (generation !== this.connectionGeneration) return;
        console.log(`[YjsStore] WebSocket status: ${status}`);
        this.setConnectionStatus(status);
      },
      onClose: ({ event }) => {
        if (generation !== this.connectionGeneration) return;
        console.warn('[YjsStore] WebSocket closed:', event);
      },
    });

    // Set initial connecting status
    this.setConnectionStatus('connecting');
  }

  /**
   * Release everything `connect()` opened: timers, socket, IndexedDB handle
   * and awareness. The Y.Doc is kept, so the store stays usable for doc
   * operations and may be connected again.
   */
  disconnect(): void {
    this.connectionGeneration++;

    this.throttledCursorUpdate.cancel();
    this.throttledDragStateUpdate.cancel();
    clearTimeout(this.syncTimeout);
    this.syncTimeout = undefined;

    // HocuspocusProvider.destroy() also destroys the awareness it was given
    if (this.wsProvider) {
      this.wsProvider.destroy();
      this.wsProvider = null;
    }

    if (this.awareness) {
      this.awareness.off('change', this.handleAwarenessChange);
      this.awareness.destroy();
      this.awarenessClock = this.awareness.meta.get(this.doc.clientID)?.clock;
      this.awareness = null;
    }

    if (this.persistence) {
      this.persistence.destroy().catch((error: unknown) => {
        console.error('[YjsStore] IndexedDB persistence destroy failed', error);
      });
      this.persistence = null;
    }

    this.setReady(false);
    this.setConnectionStatus('offline');
  }

  /**
   * Whether IndexedDB has loaded for the current connection
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Subscribe to readiness changes (suitable for useSyncExternalStore)
   * @returns Unsubscribe function
   */
  onReadyChange(callback: () => void): () => void {
    this.readyCallbacks.add(callback);
    return () => {
      this.readyCallbacks.delete(callback);
    };
  }

  private setReady(ready: boolean): void {
    if (this.ready === ready) return;
    this.ready = ready;
    for (const callback of this.readyCallbacks) {
      callback();
    }
  }

  /**
   * Wait for store to be ready (IndexedDB loaded). Resolves immediately if
   * already ready, otherwise on the next ready transition.
   */
  waitForReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const unsubscribe = this.onReadyChange(() => {
        if (this.ready) {
          unsubscribe();
          resolve();
        }
      });
    });
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
   * Throttled to 30Hz to reduce network overhead
   *
   * @param x - X coordinate in world space
   * @param y - Y coordinate in world space
   */
  setCursor(x: number, y: number): void {
    if (!this.awareness) return;
    this.throttledCursorUpdate(x, y);
  }

  /**
   * Clear cursor position (when pointer leaves canvas)
   * Cancels any pending trailing cursor update so it cannot resurrect it.
   */
  clearCursor(): void {
    this.throttledCursorUpdate.cancel();
    this.awareness?.setLocalStateField('cursor', null);
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
    if (!this.awareness) return;
    this.throttledDragStateUpdate(gid, primaryId, pos, secondaryOffsets);
  }

  /**
   * Clear drag state (when drag ends)
   * Cancels any pending trailing drag update so it cannot resurrect it.
   */
  clearDragState(): void {
    this.throttledDragStateUpdate.cancel();
    this.awareness?.setLocalStateField('drag', null);
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
    this.awarenessCallbacks.add(callback);
    return () => {
      this.awarenessCallbacks.delete(callback);
    };
  }

  /**
   * Get current local awareness state (for debugging)
   */
  getLocalAwarenessState(): AwarenessState | null {
    return (this.awareness?.getLocalState() as AwarenessState | null) ?? null;
  }

  /**
   * Get all remote awareness states (for debugging)
   */
  getRemoteAwarenessStates(): Map<number, AwarenessState> {
    const remoteStates = new Map<number, AwarenessState>();
    if (!this.awareness) return remoteStates;
    const localClientId = this.doc.clientID;
    const allStates = this.awareness.getStates() as Map<number, AwarenessState>;

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
   * @param assets - Game assets to set (cards, tokens, etc.), or null to clear
   */
  setGameAssets(assets: GameAssets | null): void {
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
  // Player Hands Methods
  // ============================================================================

  /**
   * Create a new hand with the given name.
   * @returns The hand ID
   */
  createHand(name: string): string {
    const handId = crypto.randomUUID();
    this.doc.transact(() => {
      const handMap = new Y.Map<unknown>();
      handMap.set('name', name);
      handMap.set('cards', []);
      handMap.set('visibility', 'public');
      this.hands.set(handId, handMap);
    });
    return handId;
  }

  /**
   * Delete a hand by ID.
   */
  deleteHand(handId: string): void {
    this.doc.transact(() => {
      this.hands.delete(handId);
    });
  }

  /**
   * Rename a hand.
   */
  renameHand(handId: string, name: string): void {
    const handMap = this.hands.get(handId);
    if (!handMap) return;
    this.doc.transact(() => {
      handMap.set('name', name);
    });
  }

  /**
   * Get the cards array for a hand.
   * The returned array is referentially stable until the hand's cards change
   * (writes replace the array), so it can be a useSyncExternalStore snapshot.
   * Callers must not mutate it.
   * @returns Array of card entries, or empty array if hand not found
   */
  getHandCards(handId: string): CardEntry[] {
    const handMap = this.hands.get(handId);
    if (!handMap) return NO_HAND_CARDS;
    return (handMap.get('cards') as CardEntry[]) ?? NO_HAND_CARDS;
  }

  /**
   * Get the name of a hand.
   */
  getHandName(handId: string): string {
    const handMap = this.hands.get(handId);
    if (!handMap) return '';
    return (handMap.get('name') as string) ?? '';
  }

  /**
   * Add a card to a hand at the given index (or append).
   */
  addCardToHand(handId: string, entry: CardEntry, index?: number): void {
    const handMap = this.hands.get(handId);
    if (!handMap) return;
    this.doc.transact(() => {
      const cards = [...((handMap.get('cards') as CardEntry[]) ?? [])];
      if (index !== undefined && index >= 0 && index <= cards.length) {
        cards.splice(index, 0, entry);
      } else {
        cards.push(entry);
      }
      handMap.set('cards', cards);
    });
  }

  /**
   * Remove a card from a hand at the given index.
   * @returns The removed card entry, or null if not found
   */
  removeCardFromHand(handId: string, cardIndex: number): CardEntry | null {
    const handMap = this.hands.get(handId);
    if (!handMap) return null;
    const cards = [...((handMap.get('cards') as CardEntry[]) ?? [])];
    if (cardIndex < 0 || cardIndex >= cards.length) return null;
    let removed: CardEntry | null = null;
    this.doc.transact(() => {
      removed = cards.splice(cardIndex, 1)[0];
      handMap.set('cards', cards);
    });
    return removed;
  }

  /**
   * Get all hand IDs.
   */
  getHandIds(): string[] {
    const ids: string[] = [];
    this.hands.forEach((_handMap, id) => {
      ids.push(id);
    });
    return ids;
  }

  /**
   * Subscribe to changes in the hands map (deep observer).
   * @returns Unsubscribe function
   */
  onHandsChange(callback: () => void): () => void {
    const observer = () => {
      callback();
    };
    this.hands.observeDeep(observer);
    return () => {
      this.hands.unobserveDeep(observer);
    };
  }

  // ============================================================================
  // Discard Zones Methods
  // ============================================================================

  setDiscardZone(zoneId: string, entry: DiscardZoneEntry): void {
    this.doc.transact(() => {
      this.discardZones.set(zoneId, entry);
    });
  }

  getDiscardZone(zoneId: string): DiscardZoneEntry | undefined {
    return this.discardZones.get(zoneId);
  }

  deleteDiscardZone(zoneId: string): void {
    this.doc.transact(() => {
      this.discardZones.delete(zoneId);
    });
  }

  getAllDiscardZones(): Map<string, DiscardZoneEntry> {
    const result = new Map<string, DiscardZoneEntry>();
    this.discardZones.forEach((entry, id) => {
      result.set(id, entry);
    });
    return result;
  }

  findDiscardZoneForCard(cardId: string): string | null {
    let found: string | null = null;
    this.discardZones.forEach((entry, zoneId) => {
      if (found === null && entry.memberCardIds.includes(cardId)) {
        found = zoneId;
      }
    });
    return found;
  }

  onDiscardZonesChange(callback: () => void): () => void {
    const observer = () => {
      callback();
    };
    this.discardZones.observeDeep(observer);
    return () => {
      this.discardZones.unobserveDeep(observer);
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
}
