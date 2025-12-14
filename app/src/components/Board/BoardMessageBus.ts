import { MessageHandlerRegistry } from '../../messaging/MessageHandlerRegistry';
import type { RendererToMainMessage } from '@cardtable2/shared';
import type { IRendererAdapter } from '../../renderer/IRendererAdapter';
import type { YjsStore } from '../../store/YjsStore';
import type { ThrottledFunction } from '../../utils/throttle';
import {
  moveObjects,
  selectObjects,
  unselectObjects,
} from '../../store/YjsActions';
import { getSelectedObjectIds } from '../../store/YjsSelectors';

export interface BoardHandlerContext {
  // Core dependencies
  renderer: IRendererAdapter;
  store: YjsStore;

  // State setters
  setIsReady: (ready: boolean) => void;
  setIsCanvasInitialized: (initialized: boolean) => void;
  setIsSynced: (synced: boolean) => void;
  setDebugCoords: (
    coords: Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }> | null,
  ) => void;
  setIsCameraActive: (active: boolean) => void;
  setIsWaitingForCoords: (waiting: boolean) => void;
  setAwarenessHz: (hz: number) => void;
  addMessage: (msg: string) => void;

  // Refs
  flushCallbacks: React.MutableRefObject<Array<() => void>>;
  selectionSettledCallbacks: React.MutableRefObject<Array<() => void>>;
  throttledCursorUpdate: React.MutableRefObject<
    ThrottledFunction<(x: number, y: number) => void>
  >;
  throttledDragStateUpdate: React.MutableRefObject<
    ThrottledFunction<
      (
        gid: string,
        primaryId: string,
        pos: { x: number; y: number; r: number },
        secondaryOffsets?: Record<
          string,
          { dx: number; dy: number; dr: number }
        >,
      ) => void
    >
  >;
}

/**
 * Message bus for handling renderer-to-main messages
 *
 * Replaces the 228-line switch statement in Board component.
 * Routes messages to appropriate handlers using MessageHandlerRegistry.
 */
export class BoardMessageBus {
  private registry = new MessageHandlerRegistry<
    RendererToMainMessage,
    BoardHandlerContext
  >();

  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Lifecycle
    this.registry.register('ready', (_msg, ctx) => {
      ctx.setIsReady(true);
      ctx.addMessage('Worker is ready');
    });

    this.registry.register('initialized', (_msg, ctx) => {
      ctx.setIsCanvasInitialized(true);
      ctx.addMessage('Canvas initialized');

      // Send initial sync of all objects from store (M3.6-T5)
      // Convert Y.Maps to plain objects for renderer (worker needs serializable data)
      const objectsArray: Array<{ id: string; obj: unknown }> = [];
      ctx.store.forEachObject((yMap, id) => {
        objectsArray.push({
          id,
          obj: yMap.toJSON(), // Convert Y.Map to plain object
        });
      });

      console.log(
        `[BoardMessageBus] Syncing ${objectsArray.length} objects to renderer`,
      );
      ctx.renderer.sendMessage({
        type: 'sync-objects',
        objects: objectsArray,
      });
      ctx.setIsSynced(true);
    });

    // Object state
    this.registry.register('objects-moved', (msg, ctx) => {
      console.log(`[BoardMessageBus] ${msg.updates.length} object(s) moved`);
      moveObjects(ctx.store, msg.updates);
    });

    this.registry.register('objects-selected', (msg, ctx) => {
      console.log(`[BoardMessageBus] ${msg.ids.length} object(s) selected`);

      // Store screen coordinates
      ctx.setDebugCoords(msg.screenCoords.length > 0 ? msg.screenCoords : null);

      // Update store with selection ownership
      const result = selectObjects(ctx.store, msg.ids, ctx.store.getActorId());
      if (result.failed.length > 0) {
        console.warn(
          `[BoardMessageBus] Failed to select ${result.failed.length} object(s):`,
          result.failed,
        );
      }

      // Trigger selection settled callbacks
      if (ctx.selectionSettledCallbacks.current.length > 0) {
        const callbacks = ctx.selectionSettledCallbacks.current;
        ctx.selectionSettledCallbacks.current = [];
        callbacks.forEach((cb) => cb());
      }
    });

    this.registry.register('objects-unselected', (msg, ctx) => {
      console.log(`[BoardMessageBus] ${msg.ids.length} object(s) unselected`);

      // Clear debug overlay coordinates
      ctx.setDebugCoords(null);

      // Release selection ownership
      unselectObjects(ctx.store, msg.ids, ctx.store.getActorId());

      // Trigger selection settled callbacks
      if (ctx.selectionSettledCallbacks.current.length > 0) {
        const callbacks = ctx.selectionSettledCallbacks.current;
        ctx.selectionSettledCallbacks.current = [];
        callbacks.forEach((cb) => cb());
      }
    });

    // Camera operations
    this.registry.register('pan-started', (_msg, ctx) => {
      ctx.setIsCameraActive(true);
    });

    this.registry.register('pan-ended', (_msg, ctx) => {
      ctx.setIsCameraActive(false);
      const selectedIds = getSelectedObjectIds(ctx.store);
      if (selectedIds.length > 0) {
        ctx.setIsWaitingForCoords(true);
        ctx.renderer.sendMessage({
          type: 'request-screen-coords',
          ids: selectedIds,
        });
      }
    });

    this.registry.register('zoom-started', (_msg, ctx) => {
      ctx.setIsCameraActive(true);
    });

    this.registry.register('zoom-ended', (_msg, ctx) => {
      ctx.setIsCameraActive(false);
      const selectedIds = getSelectedObjectIds(ctx.store);
      if (selectedIds.length > 0) {
        ctx.setIsWaitingForCoords(true);
        ctx.renderer.sendMessage({
          type: 'request-screen-coords',
          ids: selectedIds,
        });
      }
    });

    this.registry.register('object-drag-started', (_msg, ctx) => {
      ctx.setIsCameraActive(true);
    });

    this.registry.register('object-drag-ended', (_msg, ctx) => {
      ctx.setIsCameraActive(false);
      const selectedIds = getSelectedObjectIds(ctx.store);
      if (selectedIds.length > 0) {
        ctx.setIsWaitingForCoords(true);
        ctx.renderer.sendMessage({
          type: 'request-screen-coords',
          ids: selectedIds,
        });
      }
    });

    this.registry.register('screen-coords', (msg, ctx) => {
      ctx.setDebugCoords(msg.screenCoords.length > 0 ? msg.screenCoords : null);
      ctx.setIsWaitingForCoords(false);
    });

    // Awareness
    this.registry.register('cursor-position', (msg, ctx) => {
      ctx.throttledCursorUpdate.current(msg.x, msg.y);
    });

    this.registry.register('drag-state-update', (msg, ctx) => {
      ctx.throttledDragStateUpdate.current(
        msg.gid,
        msg.primaryId,
        msg.pos,
        msg.secondaryOffsets,
      );
    });

    this.registry.register('drag-state-clear', (_msg, ctx) => {
      ctx.throttledDragStateUpdate.current.cancel();
      ctx.store.clearDragState();
    });

    this.registry.register('awareness-update-rate', (msg, ctx) => {
      ctx.setAwarenessHz(msg.hz);
    });

    // Testing/Debug
    this.registry.register('flushed', (_msg, ctx) => {
      console.log('[BoardMessageBus] Received "flushed" message');
      const callbacks = ctx.flushCallbacks.current;
      ctx.flushCallbacks.current = [];
      callbacks.forEach((cb) => cb());
    });

    this.registry.register('pong', (msg, ctx) => {
      ctx.addMessage(`Worker: ${msg.data}`);
    });

    this.registry.register('echo-response', (msg, ctx) => {
      ctx.addMessage(`Echo: ${msg.data}`);
    });

    this.registry.register('error', (msg, ctx) => {
      ctx.addMessage(`Error: ${msg.error}`);
    });

    this.registry.register('animation-complete', (_msg, ctx) => {
      ctx.addMessage('Animation completed!');
    });
  }

  async handleMessage(
    message: RendererToMainMessage,
    context: BoardHandlerContext,
  ): Promise<void> {
    await this.registry.handle(message, context);
  }
}
