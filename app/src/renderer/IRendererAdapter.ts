import type {
  MainToRendererMessage,
  RendererToMainMessage,
} from '@cardtable2/shared';

/**
 * Unified interface for renderer communication.
 *
 * This interface abstracts the transport layer (worker postMessage vs
 * direct callback) so the Board component can use either rendering mode
 * without knowing the implementation details.
 *
 * The ONLY difference between worker and main-thread modes is the
 * implementation of this interface.
 */
export interface IRendererAdapter {
  /**
   * Send a message to the renderer.
   * Worker mode: posts to worker
   * Main-thread mode: calls handleMessage directly
   */
  sendMessage(message: MainToRendererMessage): void;

  /**
   * Register a handler for messages from the renderer.
   * Worker mode: listens to worker.onmessage
   * Main-thread mode: stores callback for direct invocation
   */
  onMessage(handler: (message: RendererToMainMessage) => void): void;

  /**
   * Clean up resources.
   * Worker mode: terminates worker
   * Main-thread mode: destroys renderer instance
   */
  destroy(): void;
}
