import { Container } from 'pixi.js';
import { getBehaviors } from '../objects';
import type { SceneManager } from '../SceneManager';

/**
 * GridSnapManager - Manages local grid snap preview ghosts during drag.
 *
 * Handles:
 * - Rendering semi-transparent "ghost" previews at snapped grid positions
 * - Multi-object snap preview support
 * - Local-only rendering (not synced to multiplayer)
 *
 * Visual indicators:
 * - Semi-transparent (40% opacity) ghosts showing where objects will land
 * - Separate from the blue drag glow (which follows cursor)
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
   * @param draggedObjects - Array of {id, snappedPos} for objects being dragged
   * @param sceneManager - Scene manager to get object data
   * @param cameraScale - Current camera scale for rendering
   * @param worldContainer - World container for coordinate transformation
   */
  renderSnapGhosts(
    draggedObjects: Array<{
      id: string;
      snappedPos: { x: number; y: number; r: number };
    }>,
    sceneManager: SceneManager,
    cameraScale: number,
    worldContainer: Container,
  ): void {
    if (!this.ghostContainer) return;

    // Track which object IDs we're rendering this frame
    const currentIds = new Set<string>();

    for (const { id, snappedPos } of draggedObjects) {
      currentIds.add(id);

      // Create or reuse ghost graphic
      if (!this.ghostGraphics.has(id)) {
        const obj = sceneManager.getObject(id);
        if (!obj) continue;

        // Create ghost container
        const ghostContainer = new Container();

        // Render the object using its behaviors
        const behaviors = getBehaviors(obj._kind);
        const ghostGraphic = behaviors.render(obj, {
          isSelected: false,
          isHovered: false,
          isDragging: false,
          cameraScale,
        });

        // Make it semi-transparent
        ghostGraphic.alpha = 0.4;

        ghostContainer.addChild(ghostGraphic);
        this.ghostContainer.addChild(ghostContainer);
        this.ghostGraphics.set(id, ghostContainer);
      }

      // Update ghost position and rotation
      const ghost = this.ghostGraphics.get(id);
      if (ghost) {
        // Convert world coordinates to screen coordinates
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
