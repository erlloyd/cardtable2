import { Container, Graphics, Text } from 'pixi.js';
import type { AwarenessState } from '@cardtable2/shared';
import { getBehaviors } from '../objects';
import { createScaleStrokeWidth } from '../handlers/objects';
import type { SceneManager } from '../SceneManager';
import type { VisualManager } from './VisualManager';

/**
 * Awareness data for a remote actor.
 */
interface RemoteAwarenessData {
  state: AwarenessState;
  cursor?: Container;
  dragGhost?: Container;
  draggedObjectIds?: string[]; // Track which objects are being dragged for change detection
  lastUpdate: number;
  lerpFrom?: { x: number; y: number }; // Previous position for interpolation
}

/**
 * AwarenessManager - Manages remote awareness rendering.
 *
 * Handles:
 * - Remote cursor rendering (position + actor label)
 * - Remote drag ghost rendering (semi-transparent object copies)
 * - Awareness update rate tracking (30Hz monitoring)
 * - Cleanup of stale awareness states
 *
 * Visual indicators:
 * - Blue triangle cursor with actor name label
 * - Semi-transparent drag ghosts showing remote drag operations
 *
 * Extracted from RendererCore (Phase 1 - Hybrid Architecture Refactor).
 */
export class AwarenessManager {
  private remoteAwareness: Map<number, RemoteAwarenessData> = new Map();
  private awarenessContainer: Container | null = null;

  // Awareness update rate monitoring (M5-T1)
  private awarenessUpdateTimestamps: number[] = [];
  private lastReportedAwarenessHz: number = 0;
  private lastAwarenessHzReportTime: number = 0;

  /**
   * Initialize awareness container.
   */
  initialize(parentContainer: Container): void {
    this.awarenessContainer = new Container();
    parentContainer.addChild(this.awarenessContainer);
    console.log('[AwarenessManager] ✓ Awareness container initialized');
  }

  /**
   * Update remote awareness states and render cursors/drag ghosts.
   * @returns Current awareness update rate (Hz) if changed significantly
   */
  updateRemoteAwareness(
    states: Array<{ clientId: number; state: AwarenessState }>,
    actorId: string,
    sceneManager: SceneManager,
    worldContainer: Container,
    cameraScale: number,
    visual: VisualManager,
  ): { hz: number } | null {
    if (!this.awarenessContainer) return null;

    const now = Date.now();
    const activeClientIds = new Set<number>();

    // Track awareness update rate (M5-T1)
    let hzChanged: { hz: number } | null = null;
    if (states.length > 0) {
      this.awarenessUpdateTimestamps.push(now);
      // Remove timestamps older than 1 second (rolling window)
      this.awarenessUpdateTimestamps = this.awarenessUpdateTimestamps.filter(
        (ts) => now - ts < 1000,
      );
      // Calculate Hz (updates in the last second)
      const currentHz = this.awarenessUpdateTimestamps.length;
      // Report Hz if changed significantly (±2 Hz) and enough time has passed
      if (
        now - this.lastAwarenessHzReportTime > 250 &&
        Math.abs(currentHz - this.lastReportedAwarenessHz) >= 2
      ) {
        hzChanged = { hz: currentHz };
        this.lastReportedAwarenessHz = currentHz;
        this.lastAwarenessHzReportTime = now;
      }
    }

    // Update or create visuals for each remote actor
    for (const { clientId, state } of states) {
      // Skip our own awareness state
      if (state.actorId === actorId) {
        continue;
      }

      activeClientIds.add(clientId);

      let awarenessData = this.remoteAwareness.get(clientId);
      if (!awarenessData) {
        // New remote actor
        awarenessData = {
          state,
          lastUpdate: now,
        };
        this.remoteAwareness.set(clientId, awarenessData);
      } else {
        // Store previous position for lerp
        if (state.cursor) {
          awarenessData.lerpFrom = awarenessData.state.cursor || state.cursor;
        }
        awarenessData.state = state;
        awarenessData.lastUpdate = now;
      }

      // Render cursor if present
      if (state.cursor) {
        this.renderRemoteCursor(
          clientId,
          state,
          awarenessData,
          worldContainer,
          cameraScale,
        );
      } else if (awarenessData.cursor) {
        // Remove cursor visual if cursor data is gone
        this.awarenessContainer.removeChild(awarenessData.cursor);
        awarenessData.cursor.destroy();
        awarenessData.cursor = undefined;
      }

      // Render drag ghost if present
      if (state.drag) {
        this.renderDragGhost(
          clientId,
          state,
          awarenessData,
          sceneManager,
          worldContainer,
          cameraScale,
          visual,
        );

        // Hide underlying objects (ghost is the source of truth during drag)
        if (state.drag.primaryId) {
          visual.hideObject(state.drag.primaryId);
        }
        if (state.drag.secondaryOffsets) {
          for (const secondaryId of Object.keys(state.drag.secondaryOffsets)) {
            visual.hideObject(secondaryId);
          }
        }
      } else if (awarenessData.dragGhost) {
        // Drag ended - show the underlying objects again
        if (awarenessData.draggedObjectIds) {
          for (const objectId of awarenessData.draggedObjectIds) {
            visual.showObject(objectId);
          }
        }

        // Remove drag ghost visual
        this.awarenessContainer.removeChild(awarenessData.dragGhost);
        awarenessData.dragGhost.destroy();
        awarenessData.dragGhost = undefined;
        awarenessData.draggedObjectIds = undefined;
      }
    }

    // Clean up actors that are no longer present
    for (const [clientId, data] of this.remoteAwareness.entries()) {
      if (!activeClientIds.has(clientId)) {
        // Show any hidden objects (in case actor disconnected mid-drag)
        if (data.draggedObjectIds) {
          for (const objectId of data.draggedObjectIds) {
            visual.showObject(objectId);
          }
        }

        // Remove visuals
        if (data.cursor) {
          this.awarenessContainer.removeChild(data.cursor);
          data.cursor.destroy();
        }
        if (data.dragGhost) {
          this.awarenessContainer.removeChild(data.dragGhost);
          data.dragGhost.destroy();
        }
        this.remoteAwareness.delete(clientId);
      }
    }

    return hzChanged;
  }

  /**
   * Render a remote cursor indicator.
   */
  private renderRemoteCursor(
    clientId: number,
    state: AwarenessState,
    awarenessData: RemoteAwarenessData,
    worldContainer: Container,
    cameraScale: number,
  ): void {
    if (!this.awarenessContainer || !state.cursor) return;

    // Create cursor visual if it doesn't exist
    if (!awarenessData.cursor) {
      const cursorContainer = new Container();

      // Cursor pointer (triangle)
      const pointer = new Graphics();
      pointer.moveTo(0, 0);
      pointer.lineTo(12, 4);
      pointer.lineTo(4, 12);
      pointer.closePath();
      pointer.fill(0x3b82f6); // Blue color
      pointer.stroke({ width: 1, color: 0xffffff });

      // Actor name label
      const actorName = state.actorId || `Actor ${clientId}`;
      const label = new Text({
        text: actorName,
        style: {
          fontSize: 12,
          fill: 0xffffff,
          fontFamily: 'Arial',
        },
      });
      label.x = 16;
      label.y = 0;

      // Label background
      const labelBg = new Graphics();
      labelBg.roundRect(14, -2, label.width + 8, label.height + 4, 4);
      labelBg.fill(0x3b82f6);

      cursorContainer.addChild(labelBg);
      cursorContainer.addChild(pointer);
      cursorContainer.addChild(label);

      this.awarenessContainer.addChild(cursorContainer);
      awarenessData.cursor = cursorContainer;
    }

    // Convert world coordinates to screen coordinates
    const screenX = worldContainer.position.x + state.cursor.x * cameraScale;
    const screenY = worldContainer.position.y + state.cursor.y * cameraScale;

    // Simple lerp for smooth 30Hz → 60fps
    // TODO: Implement proper time-based lerp in next iteration
    awarenessData.cursor.x = screenX;
    awarenessData.cursor.y = screenY;
  }

  /**
   * Render a remote drag ghost.
   */
  private renderDragGhost(
    _clientId: number,
    state: AwarenessState,
    awarenessData: RemoteAwarenessData,
    sceneManager: SceneManager,
    worldContainer: Container,
    cameraScale: number,
    visual: VisualManager,
  ): void {
    if (!this.awarenessContainer) return;

    // Validate that drag state has all required fields
    // Skip rendering if state is incomplete (can happen during cancel race conditions)
    if (
      !state.drag ||
      !state.drag.pos ||
      !state.drag.primaryId ||
      !state.drag.gid
    ) {
      return;
    }

    // Build set of current IDs (primary + secondaries)
    const currentIds = new Set<string>([state.drag.primaryId]);
    if (state.drag.secondaryOffsets) {
      for (const id of Object.keys(state.drag.secondaryOffsets)) {
        currentIds.add(id);
      }
    }

    // Check if dragged object IDs have changed
    const previousIds = awarenessData.draggedObjectIds || [];
    const hasIdsChanged =
      previousIds.length !== currentIds.size ||
      !previousIds.every((id) => currentIds.has(id));

    // Destroy and recreate ghost if object IDs changed
    if (hasIdsChanged && awarenessData.dragGhost) {
      awarenessData.dragGhost.destroy({ children: true });
      awarenessData.dragGhost = undefined;
    }

    // Create drag ghost visual if it doesn't exist
    if (!awarenessData.dragGhost) {
      const ghostContainer = new Container();

      // Render the primary object
      const primaryObj = sceneManager.getObject(state.drag.primaryId);

      if (primaryObj) {
        // Create a semi-transparent copy of the primary object
        const behaviors = getBehaviors(primaryObj._kind);
        const ghostGraphic = behaviors.render(primaryObj, {
          isSelected: false,
          isHovered: false,
          isDragging: false,
          isStackTarget: false,
          cameraScale,
          createText: visual.createText.bind(visual),
          createKindLabel: visual.createKindLabel.bind(visual),
          scaleStrokeWidth: createScaleStrokeWidth(
            cameraScale,
            'AwarenessManager',
          ),
          minimal: true, // Render in minimal mode (skip decorative elements)
          gameAssets: null, // Ghosts don't need game assets (minimal mode)
        });
        ghostGraphic.alpha = 0.5; // Semi-transparent

        ghostContainer.addChild(ghostGraphic);

        // Render secondary objects if we have offsets
        if (state.drag.secondaryOffsets) {
          for (const [secondaryObjId, offset] of Object.entries(
            state.drag.secondaryOffsets,
          )) {
            const secondaryObj = sceneManager.getObject(secondaryObjId);

            if (secondaryObj) {
              const secondaryBehaviors = getBehaviors(secondaryObj._kind);
              const secondaryGraphic = secondaryBehaviors.render(secondaryObj, {
                isSelected: false,
                isHovered: false,
                isDragging: false,
                isStackTarget: false,
                cameraScale,
                createText: visual.createText.bind(visual),
                createKindLabel: visual.createKindLabel.bind(visual),
                scaleStrokeWidth: createScaleStrokeWidth(
                  cameraScale,
                  'AwarenessManager',
                ),
                minimal: true, // Render in minimal mode (skip decorative elements)
                gameAssets: null, // Ghosts don't need game assets (minimal mode)
              });
              secondaryGraphic.alpha = 0.5; // Semi-transparent

              // Position relative to primary object
              secondaryGraphic.x = offset.dx;
              secondaryGraphic.y = offset.dy;
              secondaryGraphic.rotation = (offset.dr * Math.PI) / 180;

              ghostContainer.addChild(secondaryGraphic);
            }
          }
        }
      } else {
        // Fallback: render a generic rectangle if object not found
        const fallback = new Graphics();
        fallback.rect(-50, -70, 100, 140); // Stack size
        fallback.fill(0x3b82f6);
        fallback.alpha = 0.5;
        ghostContainer.addChild(fallback);
      }

      this.awarenessContainer.addChild(ghostContainer);
      awarenessData.dragGhost = ghostContainer;
      awarenessData.draggedObjectIds = Array.from(currentIds); // Track current IDs
    }

    // Convert world coordinates to screen coordinates
    const screenX = worldContainer.position.x + state.drag.pos.x * cameraScale;
    const screenY = worldContainer.position.y + state.drag.pos.y * cameraScale;

    // Apply position and scale
    awarenessData.dragGhost.x = screenX;
    awarenessData.dragGhost.y = screenY;
    awarenessData.dragGhost.scale.set(cameraScale);
    awarenessData.dragGhost.rotation = (state.drag.pos.r * Math.PI) / 180;
  }

  /**
   * Clear all awareness state.
   */
  clear(visual?: VisualManager): void {
    if (!this.awarenessContainer) return;

    // Clean up all visuals
    for (const [, data] of this.remoteAwareness.entries()) {
      // Show any hidden objects
      if (visual && data.draggedObjectIds) {
        for (const objectId of data.draggedObjectIds) {
          visual.showObject(objectId);
        }
      }

      if (data.cursor) {
        this.awarenessContainer.removeChild(data.cursor);
        data.cursor.destroy();
      }
      if (data.dragGhost) {
        this.awarenessContainer.removeChild(data.dragGhost);
        data.dragGhost.destroy();
      }
    }

    this.remoteAwareness.clear();
    this.awarenessUpdateTimestamps = [];
  }

  /**
   * Check if an object is being dragged by any remote user.
   * Used to immediately hide objects when they're added while a remote drag is active.
   */
  isObjectRemotelyDragged(objectId: string): boolean {
    for (const data of this.remoteAwareness.values()) {
      if (data.state.drag?.primaryId === objectId) {
        return true;
      }
      if (
        data.state.drag?.secondaryOffsets &&
        objectId in data.state.drag.secondaryOffsets
      ) {
        return true;
      }
    }
    return false;
  }
}
