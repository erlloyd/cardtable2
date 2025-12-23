import type { SceneManager } from '../SceneManager';

/**
 * SelectionManager - Manages object selection state.
 *
 * This is a DERIVED CACHE from the store's _selectedBy field, not independent state.
 * The store is the single source of truth. This cache exists only for O(1) lookup
 * performance during rendering and drag operations.
 *
 * Selection flow (M3-T3 Derived State Pattern):
 * 1. Renderer detects selection action (click, rectangle select)
 * 2. Renderer sends message to Board
 * 3. Board updates store (_selectedBy field)
 * 4. Store sends objects-updated message back
 * 5. SelectionManager syncs cache from store state
 *
 * Extracted from RendererCore (Phase 1 - Hybrid Architecture Refactor).
 */
export class SelectionManager {
  private actorId: string = '';
  private selectedObjectIds: Set<string> = new Set();

  // E2E Test API: Track pending operations for full round-trip completion
  private pendingOperations: number = 0;

  /**
   * Set the actor ID (used to derive which objects belong to this actor).
   */
  setActorId(actorId: string): void {
    this.actorId = actorId;
  }

  /**
   * Get the actor ID.
   */
  getActorId(): string {
    return this.actorId;
  }

  /**
   * Check if an object is selected.
   */
  isSelected(objectId: string): boolean {
    return this.selectedObjectIds.has(objectId);
  }

  /**
   * Get all selected object IDs.
   */
  getSelectedIds(): string[] {
    return Array.from(this.selectedObjectIds);
  }

  /**
   * Get count of selected objects.
   */
  getSelectedCount(): number {
    return this.selectedObjectIds.size;
  }

  /**
   * Sync selection cache from store state (M3-T3 - Derived State Pattern).
   *
   * Rebuilds the selectedObjectIds cache based on the _selectedBy field
   * for ALL objects currently in the scene. The store is the single source of truth;
   * this cache exists only for O(1) lookup performance.
   *
   * @param sceneManager - The scene manager containing all objects
   * @returns Arrays of added and removed IDs (for visual updates)
   */
  syncFromStore(sceneManager: SceneManager): {
    added: string[];
    removed: string[];
  } {
    const previouslySelected = new Set(this.selectedObjectIds);
    this.selectedObjectIds.clear();

    // Rebuild cache from ALL objects in scene
    const allObjects = sceneManager.getAllObjects();
    allObjects.forEach((obj, id) => {
      if (obj._selectedBy === this.actorId) {
        this.selectedObjectIds.add(id);
      }
    });

    // Determine which objects changed selection state
    const added = Array.from(this.selectedObjectIds).filter(
      (id) => !previouslySelected.has(id),
    );
    const removed = Array.from(previouslySelected).filter(
      (id) => !this.selectedObjectIds.has(id),
    );

    // E2E Test API: Decrement pending operations counter
    // Decrement regardless of whether there was a change, because every pointer-down
    // increments the counter and every store sync completes that round-trip.
    // The operation "completes" even if the result is "no change" (e.g., clicking
    // an already-selected object).
    const hadPendingOps = this.pendingOperations > 0;
    if (hadPendingOps) {
      this.pendingOperations = Math.max(0, this.pendingOperations - 1);
      console.log(
        `[SelectionManager] pendingOperations-- → ${this.pendingOperations} (after syncFromStore, changed: ${added.length + removed.length > 0})`,
      );
    } else {
      console.log(
        `[SelectionManager] syncFromStore called with no pending operations (added: ${added.length}, removed: ${removed.length})`,
      );
    }

    return { added, removed };
  }

  /**
   * Clear selection for a specific object (when it's removed).
   */
  clearSelection(objectId: string): void {
    this.selectedObjectIds.delete(objectId);
  }

  /**
   * Clear all selections.
   */
  clearAll(): void {
    this.selectedObjectIds.clear();
  }

  /**
   * E2E Test API: Increment pending operations counter.
   */
  incrementPendingOperations(): void {
    this.pendingOperations++;
    console.log(
      `[SelectionManager] pendingOperations++ → ${this.pendingOperations}`,
    );
  }

  /**
   * E2E Test API: Get pending operations count.
   */
  getPendingOperations(): number {
    return this.pendingOperations;
  }
}
