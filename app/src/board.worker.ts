import { DOMAdapter, WebWorkerAdapter } from 'pixi.js';
import type {
  MainToRendererMessage,
  RendererToMainMessage,
} from '@cardtable2/shared';
import { RendererOrchestrator } from './renderer/RendererOrchestrator';
import { RenderMode } from './renderer/IRendererAdapter';

{
  const origLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    const first = args[0];
    if (String(first).startsWith('[DEBUG-PREVIEW]')) {
      origLog(
        `[DEBUG-PREVIEW] T=${(performance.timeOrigin + performance.now()).toFixed(1)} ${String(first).slice(16)}`,
      );
    } else {
      origLog(...args);
    }
  };
}
console.log('[Worker] Starting worker initialization...');
console.log('[Worker] User Agent:', self.navigator.userAgent);
console.log('[Worker] OffscreenCanvas available:', typeof OffscreenCanvas);

// Configure PixiJS for web worker environment
// This MUST be done before creating any PixiJS objects
try {
  console.log('[Worker] Setting DOMAdapter to WebWorkerAdapter...');
  DOMAdapter.set(WebWorkerAdapter);
  console.log('[Worker] ✓ DOMAdapter set successfully');
} catch (error) {
  console.error('[Worker] ✗ Failed to set DOMAdapter:', error);
  self.postMessage({
    type: 'error',
    error: `DOMAdapter setup failed: ${error instanceof Error ? error.message : String(error)}`,
    context: 'worker-init',
  });
}

/**
 * Worker-based renderer implementation.
 * Extends RendererOrchestrator and implements postResponse using self.postMessage.
 */
class WorkerRendererOrchestrator extends RendererOrchestrator {
  constructor() {
    super(RenderMode.Worker);
  }

  protected postResponse(message: RendererToMainMessage): void {
    self.postMessage(message);
  }
}

// Create renderer instance
const renderer = new WorkerRendererOrchestrator();

// Listen for messages from main thread
self.addEventListener(
  'message',
  (event: MessageEvent<MainToRendererMessage>) => {
    if (event.data.type !== 'init')
      console.log(`[DEBUG-PREVIEW] R recv<-main ${event.data.type}`);
    renderer.handleMessage(event.data).catch((error) => {
      // Catch any unhandled errors from the promise
      console.error('[Worker] handleMessage error:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      self.postMessage({
        type: 'error',
        error: `Unhandled worker error: ${errorMsg}`,
        context: 'worker',
      });
    });
  },
);

// Send ready message when worker initializes
self.postMessage({ type: 'ready' });
