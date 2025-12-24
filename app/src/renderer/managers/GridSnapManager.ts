import { Container } from 'pixi.js';
import { getBehaviors } from '../objects';
import type { SceneManager } from '../SceneManager';
import type { VisualManager } from './VisualManager';

/**
 * GridSnapManager - Manages local grid snap preview ghosts during drag.
 *
 * Handles:
 * - Rendering semi-transparent "ghost" previews at snapped grid positions
 * - Multi-object snap preview support
 * - Local-only rendering (not synced to multiplayer)
 * - Performance optimization via ghost caching and reuse
 *
 * Implementation details:
 * - Maintains a Map<objectId, Container> to cache ghost graphics between frames
 * - Ghosts are created once per drag session and positioned/rotated on each move
 * - Graphics destroyed and recreated only if object set changes
 * - Uses 40% opacity to distinguish from actual objects without obscuring the view
 *
 * Visual indicators:
 * - Semi-transparent (40% opacity) ghosts showing where objects will land
 * - Separate from the drag feedback visual (which follows cursor position)
 */
export class GridSnapManager {
  private ghostContainer: Container | null = null;
  private ghostGraphics: Map<string, Container> = new Map();

  /**
   * Initialize the ghost container.
   */
  initialize(parentContainer: Container): void {
    this.ghostContainer = new Container();
    parentContainer.addChild(this.ghostContainer);
    console.log('[GridSnapManager] ✓ Ghost container initialized');
  }

  /**
   * Render snap preview ghosts for dragged objects.
   *
   * This method is idempotent and optimized for repeated calls during drag.
   * Ghost graphics are cached and reused across frames for performance.
   *
   * @param draggedObjects - Array of {id, snappedPos} for objects being dragged
   *   - snappedPos.r is rotation in degrees (converted to radians internally)
   *   - Objects with invalid IDs are logged as warnings and skipped
   * @param sceneManager - Scene manager to get object data and render behaviors
   * @param cameraScale - Current camera zoom scale (1.0 = 100%, 2.0 = 200%)
   * @param worldContainer - World container for transforming world coords to stage coords
   * @param visual - Visual manager for creating text with zoom-aware resolution
   */
  renderSnapGhosts(
    draggedObjects: Array<{
      id: string;
      snappedPos: { x: number; y: number; r: number };
    }>,
    sceneManager: SceneManager,
    cameraScale: number,
    worldContainer: Container,
    visual: VisualManager,
  ): void {
    if (!this.ghostContainer) {
      console.warn(
        '[GridSnapManager] Cannot render ghosts: Ghost container not initialized. ' +
          'Ensure initialize() is called before renderSnapGhosts().',
      );
      return;
    }

    // Track which object IDs we're rendering this frame
    const currentIds = new Set<string>();

    for (const { id, snappedPos } of draggedObjects) {
      currentIds.add(id);

      // Create or reuse ghost graphic
      if (!this.ghostGraphics.has(id)) {
        const obj = sceneManager.getObject(id);
        if (!obj) {
          console.warn(
            `[GridSnapManager] Cannot render ghost for object ${id}: Object not found in scene. ` +
              'This may indicate a race condition or stale drag state.',
          );
          continue;
        }

        // Create ghost container
        const ghostContainer = new Container();

        // Render the object using its behaviors
        const behaviors = getBehaviors(obj._kind);
        if (!behaviors) {
          console.error(
            `[GridSnapManager] Cannot render ghost for object ${id}: ` +
              `No behaviors registered for kind "${obj._kind}".`,
          );
          continue;
        }

        try {
          const ghostGraphic = behaviors.render(obj, {
            isSelected: false,
            isHovered: false,
            isDragging: false,
            cameraScale,
            createText: visual.createText.bind(visual),
          });

          // Make it semi-transparent
          ghostGraphic.alpha = 0.4;

          ghostContainer.addChild(ghostGraphic);
          this.ghostContainer.addChild(ghostContainer);
          this.ghostGraphics.set(id, ghostContainer);
        } catch (error) {
          console.error(
            `[GridSnapManager] Failed to render ghost for object ${id}:`,
            error,
          );
          continue;
        }
      }

      // Update ghost position and rotation
      const ghost = this.ghostGraphics.get(id);
      if (ghost) {
        // Transform world coordinates to stage-local coordinates for ghost rendering
        // World position -> scale by camera zoom -> offset by world container position
        const screenX = worldContainer.position.x + snappedPos.x * cameraScale;
        const screenY = worldContainer.position.y + snappedPos.y * cameraScale;

        ghost.x = screenX;
        ghost.y = screenY;
        ghost.scale.set(cameraScale);
        ghost.rotation = (snappedPos.r * Math.PI) / 180;
      }
    }

    // Remove ghosts for objects no longer being dragged
    for (const [id, ghost] of this.ghostGraphics.entries()) {
      if (!currentIds.has(id)) {
        this.ghostContainer.removeChild(ghost);
        ghost.destroy({ children: true });
        this.ghostGraphics.delete(id);
      }
    }
  }

  /**
   * Clear all snap preview ghosts.
   *
   * Removes all ghost containers from the render tree and destroys
   * their PixiJS graphics (including children) to free GPU/CPU resources.
   * Safe to call multiple times (no-op if already cleared).
   */
  clearGhosts(): void {
    if (!this.ghostContainer) return;

    for (const [, ghost] of this.ghostGraphics.entries()) {
      this.ghostContainer.removeChild(ghost);
      ghost.destroy({ children: true });
    }

    this.ghostGraphics.clear();
  }

  /**
   * Clear all state.
   */
  clear(): void {
    this.clearGhosts();
  }
}
