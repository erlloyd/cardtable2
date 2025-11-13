import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from '@cardtable2/shared';

// Board rendering worker
// M2-T1: Basic message handling only (no canvas/rendering yet)

// Handle messages from main thread
self.addEventListener('message', (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
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
});

// Send ready message when worker initializes
const readyMessage: WorkerToMainMessage = { type: 'ready' };
self.postMessage(readyMessage);
