import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import { Awareness } from 'y-protocols/awareness';
import type { TableObject, ActorId, AwarenessState } from '@cardtable2/shared';
import { ObjectKind } from '@cardtable2/shared';
import { v4 as uuidv4 } from 'uuid';

/**
 * Change information from Yjs observer
 */
export interface ObjectChanges {
  added: Array<{ id: string; obj: TableObject }>;
  updated: Array<{ id: string; obj: TableObject }>;
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

  // Typed access to Y.Doc maps
  public objects: Y.Map<Y.Map<unknown>>;

  // Awareness for ephemeral state (M3-T4)
  public awareness: Awareness;

  constructor(tableId: string, wsUrl?: string) {
    this.doc = new Y.Doc();
    this.actorId = uuidv4();

    // Get or create objects map
    this.objects = this.doc.getMap('objects');

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

      this.wsProvider.on('connection-error', (event: Error) => {
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
   * Subscribe to object changes with detailed change information
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
                  obj: yMap.toJSON() as TableObject,
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
                obj: yMap.toJSON() as TableObject,
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
   * Clear stale selections from previous sessions (M3-T3).
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
      this.objects.forEach((yMap, _id) => {
        const obj = yMap.toJSON() as TableObject;
        if (obj._selectedBy !== null) {
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
   * Updates at 30Hz (throttling handled by caller)
   *
   * @param gid - Gesture ID (unique per drag operation)
   * @param ids - Object IDs being dragged
   * @param pos - Absolute world position of primary object
   */
  setDragState(
    gid: string,
    primaryId: string,
    pos: { x: number; y: number; r: number },
    secondaryOffsets?: Record<string, { dx: number; dy: number; dr: number }>,
  ): void {
    this.awareness.setLocalStateField('drag', {
      gid,
      primaryId,
      pos,
      secondaryOffsets,
      ts: Date.now(),
    });
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

  /**
   * Clean up resources
   */
  destroy(): void {
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
