import type {
  MainToRendererMessage,
  RendererToMainMessage,
} from '@cardtable2/shared';

/**
 * Rendering mode enum.
 * Defines whether rendering happens in a Web Worker or on the main thread.
 */
export const RenderMode = {
  Worker: 'worker',
  MainThread: 'main-thread',
} as const;
export type RenderMode = (typeof RenderMode)[keyof typeof RenderMode];

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
   * The rendering mode for this adapter.
   * This property survives minification (unlike constructor.name).
   */
  readonly mode: RenderMode;

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
   * Acquire the renderer's resources. Construction allocates nothing.
   * Worker mode: spawns the worker
   * Main-thread mode: creates the orchestrator and schedules 'ready'
   *
   * May be called again after disconnect() (StrictMode connect → disconnect →
   * connect on the same instance).
   */
  connect(): void;

  /**
   * Release the resources acquired by connect().
   * Worker mode: terminates the worker
   * Main-thread mode: cancels the pending 'ready' and destroys the orchestrator
   */
  disconnect(): void;
}
