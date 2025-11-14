import { DOMAdapter, WebWorkerAdapter } from 'pixi.js';
import type {
  MainToRendererMessage,
  RendererToMainMessage,
} from '@cardtable2/shared';
import { RendererCore } from './renderer/RendererCore';

// Configure PixiJS for web worker environment
// This MUST be done before creating any PixiJS objects
DOMAdapter.set(WebWorkerAdapter);

/**
 * Worker-based renderer implementation.
 * Extends RendererCore and implements postResponse using self.postMessage.
 */
class WorkerRendererCore extends RendererCore {
  protected postResponse(message: RendererToMainMessage): void {
    self.postMessage(message);
  }
}

// Create renderer instance
const renderer = new WorkerRendererCore();

// Listen for messages from main thread
self.addEventListener(
  'message',
  (event: MessageEvent<MainToRendererMessage>) => {
    renderer.handleMessage(event.data).catch((error) => {
      // Catch any unhandled errors from the promise
      const errorMsg = error instanceof Error ? error.message : String(error);
      self.postMessage({
        type: 'error',
        error: `Unhandled worker error: ${errorMsg}`,
        context: 'worker',
      } as RendererToMainMessage);
    });
  },
);

// Send ready message when worker initializes
self.postMessage({ type: 'ready' } as RendererToMainMessage);
