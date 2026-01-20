import { MessageHandlerRegistry } from '../../messaging/MessageHandlerRegistry';
import type { RendererToMainMessage, TableObject } from '@cardtable2/shared';
import { isValidPosition } from '@cardtable2/shared';
import type { IRendererAdapter } from '../../renderer/IRendererAdapter';
import type { YjsStore } from '../../store/YjsStore';
import { toTableObject } from '../../store/YjsStore';
import type { ThrottledFunction } from '../../utils/throttle';
import {
  moveObjects,
  selectObjects,
  unselectObjects,
  stackObjects,
  unstackCard,
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
  setCursorStyle: (style: 'default' | 'pointer' | 'grab' | 'grabbing') => void;
  addMessage: (msg: string) => void;

  // Refs
  flushCallbacks: React.MutableRefObject<Array<() => void>>;
  selectionSettledCallbacks: React.MutableRefObject<Array<() => void>>;
  animationStateCallbacks: React.MutableRefObject<
    Array<(isAnimating: boolean) => void>
  >;
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
      const objectsArray: Array<{ id: string; obj: TableObject }> = [];
      ctx.store.forEachObject((yMap, id) => {
        objectsArray.push({
          id,
          obj: toTableObject(yMap), // Convert Y.Map to plain object
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

    this.registry.register('stack-objects', (msg, ctx) => {
      console.log(
        `[BoardMessageBus] Stacking ${msg.ids.length} object(s) onto ${msg.targetId}`,
      );
      try {
        // Perform the stack operation (deletes source stacks)
        // Don't manually unselect - the renderer will clean up when objects are removed
        const deletedIds = stackObjects(ctx.store, msg.ids, msg.targetId);
        console.log(
          `[BoardMessageBus] Successfully stacked. Deleted ${deletedIds.length} source stack(s)`,
        );
      } catch (error) {
        console.error(
          '[BoardMessageBus] Stack operation failed - User attempted to merge stacks but operation failed.',
          {
            sourceIds: msg.ids,
            targetId: msg.targetId,
            error:
              error instanceof Error
                ? { message: error.message, stack: error.stack }
                : error,
          },
        );
        // User feedback: Notify about failure
        ctx.addMessage(
          '❌ Failed to merge stacks. Target may have been modified.',
        );
      }
    });

    this.registry.register('unstack-card', (msg, ctx) => {
      console.log(
        `[BoardMessageBus] Unstacking top card from ${msg.stackId} to (${msg.pos.x}, ${msg.pos.y})`,
      );

      // Validate position data before attempting operation
      if (!isValidPosition(msg.pos)) {
        console.error(
          '[BoardMessageBus] Invalid position in unstack-card message',
          {
            stackId: msg.stackId,
            pos: msg.pos,
          },
        );
        ctx.addMessage('❌ Cannot unstack: Invalid position data');
        return;
      }

      try {
        // Perform the unstack operation
        const newStackId = unstackCard(ctx.store, msg.stackId, msg.pos);
        if (newStackId) {
          console.log(
            `[BoardMessageBus] Successfully unstacked. Created new stack ${newStackId}`,
          );
        } else {
          console.warn(
            '[BoardMessageBus] Unstack operation failed - Stack may not exist or operation returned null.',
            {
              stackId: msg.stackId,
              targetPosition: msg.pos,
            },
          );
          // User feedback: Explain why operation failed
          ctx.addMessage('⚠️ Cannot unstack: Stack not found or has no cards');
        }
      } catch (error) {
        console.error(
          '[BoardMessageBus] Unstack operation failed - User attempted to extract card from stack but operation failed.',
          {
            stackId: msg.stackId,
            targetPosition: msg.pos,
            error:
              error instanceof Error
                ? { message: error.message, stack: error.stack }
                : error,
          },
        );
        // User feedback: Generic error message for exceptions
        ctx.addMessage('❌ Failed to unstack card. Please try again.');
      }
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

    this.registry.register('animation-state', (msg, ctx) => {
      console.log('[BoardMessageBus] Received "animation-state" message:', {
        isAnimating: msg.isAnimating,
        visualId: msg.visualId,
        animationType: msg.animationType,
      });
      const callbacks = ctx.animationStateCallbacks.current;
      ctx.animationStateCallbacks.current = [];
      callbacks.forEach((cb) => cb(msg.isAnimating));
    });

    this.registry.register('pong', (msg, ctx) => {
      ctx.addMessage(`Worker: ${msg.data}`);
    });

    this.registry.register('echo-response', (msg, ctx) => {
      ctx.addMessage(`Echo: ${msg.data}`);
    });

    this.registry.register('cursor-style', (msg, ctx) => {
      ctx.setCursorStyle(msg.style);
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
