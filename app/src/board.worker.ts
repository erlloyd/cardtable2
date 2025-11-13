import { Application, Graphics, DOMAdapter, WebWorkerAdapter } from 'pixi.js';
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from '@cardtable2/shared';

// Configure PixiJS for web worker environment
// This MUST be done before creating any PixiJS objects
DOMAdapter.set(WebWorkerAdapter);

// Board rendering worker
// M2-T1: Basic message handling
// M2-T2: OffscreenCanvas + PixiJS rendering

let app: Application | null = null;

// Handle messages from main thread
async function handleMessage(
  event: MessageEvent<MainToWorkerMessage>,
): Promise<void> {
  const message = event.data;

  try {
    switch (message.type) {
      case 'init': {
        // Initialize PixiJS with offscreen canvas
        const { canvas, width, height, dpr } = message;

        app = new Application();
        await app.init({
          canvas,
          width,
          height,
          resolution: dpr,
          autoDensity: true,
          backgroundColor: 0x1a1a2e,
          preference: 'webgl',
        });

        // Render a simple test scene
        renderTestScene();

        const response: WorkerToMainMessage = { type: 'initialized' };
        self.postMessage(response);
        break;
      }

      case 'resize': {
        // Handle canvas resize
        if (app) {
          const { width, height, dpr } = message;
          app.renderer.resize(width, height);
          app.renderer.resolution = dpr;
        }
        break;
      }

      case 'ping': {
        // Respond to ping with pong
        const response: WorkerToMainMessage = {
          type: 'pong',
          data: `Pong! Received: ${message.data}`,
        };
        self.postMessage(response);
        break;
      }

      case 'echo': {
        // Echo back the data
        const response: WorkerToMainMessage = {
          type: 'echo-response',
          data: message.data,
        };
        self.postMessage(response);
        break;
      }

      default: {
        // Unknown message type
        const response: WorkerToMainMessage = {
          type: 'error',
          error: `Unknown message type: ${(message as { type: string }).type}`,
        };
        self.postMessage(response);
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const response: WorkerToMainMessage = {
      type: 'error',
      error: `Worker error: ${errorMsg}`,
    };
    self.postMessage(response);
  }
}

self.addEventListener('message', (event: MessageEvent<MainToWorkerMessage>) => {
  handleMessage(event).catch((error) => {
    // Catch any unhandled errors from the promise itself
    const errorMsg = error instanceof Error ? error.message : String(error);
    const response: WorkerToMainMessage = {
      type: 'error',
      error: `Unhandled worker error: ${errorMsg}`,
    };
    self.postMessage(response);
  });
});

// Render a simple test scene
function renderTestScene() {
  if (!app) return;

  const stage = app.stage;

  // Clear any existing children
  stage.removeChildren();

  // Create a simple colored rectangle to verify rendering
  const rect = new Graphics();
  rect.rect(50, 50, 200, 150);
  rect.fill(0x6c5ce7);
  stage.addChild(rect);

  // Create another rectangle
  const rect2 = new Graphics();
  rect2.rect(300, 100, 150, 200);
  rect2.fill(0x00b894);
  stage.addChild(rect2);

  // Create a circle
  const circle = new Graphics();
  circle.circle(500, 250, 75);
  circle.fill(0xfdcb6e);
  stage.addChild(circle);
}

// Send ready message when worker initializes
const readyMessage: WorkerToMainMessage = { type: 'ready' };
self.postMessage(readyMessage);
