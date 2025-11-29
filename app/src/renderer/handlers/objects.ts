/**
 * Object management handlers
 *
 * Handles object synchronization, addition, updates, and removal.
 * Creates and manages PixiJS visuals for TableObjects.
 */

import { Container, Graphics, Text } from 'pixi.js';
import type { MainToRendererMessage, TableObject } from '@cardtable2/shared';
import type { RendererContext } from '../RendererContext';
import { getBehaviors } from '../objects';

/**
 * Handle sync-objects message
 *
 * Clears all existing objects and adds new ones from the store.
 * Used for initial sync and full resync operations.
 */
export function handleSyncObjects(
  message: Extract<MainToRendererMessage, { type: 'sync-objects' }>,
  context: RendererContext,
): void {
  console.log(
    `[RendererCore] Syncing ${message.objects.length} objects from store`,
  );

  clearObjects(context);

  for (const { id, obj } of message.objects) {
    addObjectVisual(context, id, obj);
  }

  context.app.renderer.render(context.app.stage);
}

/**
 * Handle objects-added message
 *
 * Adds new objects to the scene.
 */
export function handleObjectsAdded(
  message: Extract<MainToRendererMessage, { type: 'objects-added' }>,
  context: RendererContext,
): void {
  console.log(`[RendererCore] Adding ${message.objects.length} object(s)`);

  for (const { id, obj } of message.objects) {
    addObjectVisual(context, id, obj);
  }

  context.app.renderer.render(context.app.stage);
}

/**
 * Handle objects-updated message
 *
 * Updates existing objects in the scene.
 */
export function handleObjectsUpdated(
  message: Extract<MainToRendererMessage, { type: 'objects-updated' }>,
  context: RendererContext,
): void {
  console.log(`[RendererCore] Updating ${message.objects.length} object(s)`);

  for (const { id, obj } of message.objects) {
    updateObjectVisual(context, id, obj);
  }

  context.app.renderer.render(context.app.stage);
}

/**
 * Handle objects-removed message
 *
 * Removes objects from the scene.
 */
export function handleObjectsRemoved(
  message: Extract<MainToRendererMessage, { type: 'objects-removed' }>,
  context: RendererContext,
): void {
  console.log(`[RendererCore] Removing ${message.ids.length} object(s)`);

  for (const id of message.ids) {
    removeObjectVisual(context, id);
  }

  // Render after removing
  context.app.renderer.render(context.app.stage);
}

/**
 * Handle clear-objects message
 *
 * Clears all objects from the scene.
 */
export function handleClearObjects(
  _message: Extract<MainToRendererMessage, { type: 'clear-objects' }>,
  context: RendererContext,
): void {
  console.log('[RendererCore] Clearing all objects');

  clearObjects(context);

  // Render after clearing
  context.app.renderer.render(context.app.stage);
}

/**
 * Helper: Clear all object visuals
 *
 * Removes all visuals from world container and clears all data structures.
 */
function clearObjects(context: RendererContext): void {
  // Remove all visuals from world container and destroy them
  for (const [, visual] of context.visual.getAllVisuals()) {
    context.worldContainer.removeChild(visual);
    visual.destroy();
  }

  // Clear data structures
  context.visual.clear(context.worldContainer);
  context.sceneManager.clear();
  context.selection.clearAll();
  context.hover.clearAll();
  context.drag.clear();
}

/**
 * Helper: Add a visual representation for a TableObject
 *
 * Creates PixiJS Container with Graphics and adds to scene.
 */
function addObjectVisual(
  context: RendererContext,
  id: string,
  obj: TableObject,
): void {
  // Skip if visual already exists
  if (context.visual.getVisual(id) !== undefined) {
    console.warn(`[RendererCore] Visual for object ${id} already exists`);
    return;
  }

  // Add to scene manager for hit-testing
  context.sceneManager.addObject(id, obj);

  // Create visual representation
  const visual = createObjectGraphics(context, id, obj);

  // Position the visual
  visual.x = obj._pos.x;
  visual.y = obj._pos.y;
  visual.rotation = (obj._pos.r * Math.PI) / 180; // Convert degrees to radians

  // Store visual reference
  context.visual.addVisual(id, visual);

  // Add to world container
  context.worldContainer.addChild(visual);
}

/**
 * Helper: Update an existing object visual
 *
 * Updates position, rotation, and potentially re-renders if kind/meta changed.
 */
function updateObjectVisual(
  context: RendererContext,
  id: string,
  obj: TableObject,
): void {
  const visual = context.visual.getVisual(id);
  if (!visual) {
    console.warn(`[RendererCore] Visual for object ${id} not found`);
    return;
  }

  // Update scene manager
  context.sceneManager.updateObject(id, obj);

  // Update visual position and rotation
  visual.x = obj._pos.x;
  visual.y = obj._pos.y;
  visual.rotation = (obj._pos.r * Math.PI) / 180;

  // TODO: If kind or meta changed, we may need to recreate the visual
}

/**
 * Helper: Remove an object visual
 *
 * Removes visual from world container and cleans up references.
 */
function removeObjectVisual(context: RendererContext, id: string): void {
  const visual = context.visual.getVisual(id);
  if (visual) {
    context.worldContainer.removeChild(visual);
    visual.destroy();
  }

  context.visual.removeVisual(id);
  context.sceneManager.removeObject(id);

  // Clear selection if this object was selected (handled by SelectionManager)
  if (context.selection.isSelected(id)) {
    // Selection will be synced from store
  }

  // Clear hover if this object was hovered
  if (context.hover.getHoveredObjectId() === id) {
    context.hover.clearAll();
  }

  // Clear drag if this object was being dragged
  if (context.drag.getDraggedObjectId() === id) {
    context.drag.cancelObjectDrag();
  }
}

/**
 * Helper: Create PixiJS Graphics for a TableObject
 *
 * Handles different object types (Stack, Token, Zone, etc.).
 */
function createObjectGraphics(
  context: RendererContext,
  objectId: string,
  obj: TableObject,
): Container {
  const container = new Container();

  // Create base shape using shared method (no duplication!)
  const shapeGraphic = createBaseShapeGraphic(context, objectId, obj, false);
  container.addChild(shapeGraphic);

  // Add text label showing object type
  container.addChild(createKindLabel(obj._kind));

  return container;
}

/**
 * Helper: Create base shape graphic for an object based on its kind
 *
 * Does NOT include text label or shadow.
 */
function createBaseShapeGraphic(
  context: RendererContext,
  objectId: string,
  obj: TableObject,
  isSelected: boolean,
): Graphics {
  const behaviors = getBehaviors(obj._kind);
  return behaviors.render(obj, {
    isSelected,
    isHovered: context.hover.getHoveredObjectId() === objectId,
    isDragging: context.drag.getDraggedObjectId() === objectId,
    cameraScale: context.coordConverter.getCameraScale(),
  });
}

/**
 * Helper: Create a text label showing the object's kind
 *
 * Returns a centered Text object ready to be added to a container.
 */
function createKindLabel(kind: string): Text {
  const kindText = new Text({
    text: kind,
    style: {
      fontFamily: 'Arial',
      fontSize: 24,
      fill: 0xffffff, // White text
      stroke: { color: 0x000000, width: 2 }, // Black outline for readability
      align: 'center',
    },
  });
  kindText.anchor.set(0.5); // Center the text
  kindText.y = 0; // Center vertically in the object

  return kindText;
}
