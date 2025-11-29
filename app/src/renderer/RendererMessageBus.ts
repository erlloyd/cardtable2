/**
 * Renderer Message Bus
 *
 * Registers all message handlers and middleware for the renderer.
 * Replaces the switch statement pattern with handler registry.
 */

import { MessageHandlerRegistry } from '../messaging/MessageHandlerRegistry';
import type { MainToRendererMessage } from '@cardtable2/shared';
import type { RendererContext } from './RendererContext';
import {
  loggingMiddleware,
  performanceMiddleware,
  errorHandlingMiddleware,
} from '../messaging/middleware';

// Import all handlers
import * as lifecycle from './handlers/lifecycle';
import * as pointer from './handlers/pointer';
import * as camera from './handlers/camera';
import * as objects from './handlers/objects';
import * as awareness from './handlers/awareness';
import * as testing from './handlers/testing';
import * as coordinates from './handlers/coordinates';

/**
 * Message bus for renderer
 *
 * Handles all incoming messages by routing to appropriate handlers.
 * Provides middleware for logging, performance tracking, and error handling.
 */
export class RendererMessageBus {
  private registry = new MessageHandlerRegistry<
    MainToRendererMessage,
    RendererContext
  >();

  constructor() {
    this.registerMiddleware();
    this.registerHandlers();
  }

  /**
   * Register middleware in execution order
   *
   * Order matters:
   * 1. Error handling (outermost - catches all errors)
   * 2. Performance tracking
   * 3. Logging
   */
  private registerMiddleware(): void {
    this.registry.use(errorHandlingMiddleware);
    this.registry.use(performanceMiddleware);
    this.registry.use(loggingMiddleware);
  }

  /**
   * Register all message handlers
   *
   * Organized by domain for clarity.
   */
  private registerHandlers(): void {
    // Lifecycle
    this.registry.register('resize', lifecycle.handleResize);
    this.registry.register('ping', lifecycle.handlePing);
    this.registry.register('echo', lifecycle.handleEcho);

    // Pointer events
    this.registry.register('pointer-down', pointer.handlePointerDown);
    this.registry.register('pointer-move', pointer.handlePointerMove);
    this.registry.register('pointer-up', pointer.handlePointerUp);
    this.registry.register('pointer-cancel', pointer.handlePointerCancel);
    this.registry.register('pointer-leave', pointer.handlePointerLeave);

    // Camera
    this.registry.register('wheel', camera.handleWheel);
    // Note: 'set-interaction-mode' is handled directly in RendererOrchestrator

    // Objects
    this.registry.register('sync-objects', objects.handleSyncObjects);
    this.registry.register('objects-added', objects.handleObjectsAdded);
    this.registry.register('objects-updated', objects.handleObjectsUpdated);
    this.registry.register('objects-removed', objects.handleObjectsRemoved);
    this.registry.register('clear-objects', objects.handleClearObjects);

    // Awareness
    this.registry.register('awareness-update', awareness.handleAwarenessUpdate);

    // Testing
    this.registry.register('flush', testing.handleFlush);
    this.registry.register('test-animation', testing.handleTestAnimation);

    // Coordinates
    this.registry.register(
      'request-screen-coords',
      coordinates.handleRequestScreenCoords,
    );
  }

  /**
   * Handle a message by routing to the appropriate handler
   *
   * @param message - The message to handle
   * @param context - The renderer context
   */
  async handleMessage(
    message: MainToRendererMessage,
    context: RendererContext,
  ): Promise<void> {
    await this.registry.handle(message, context);
  }
}
