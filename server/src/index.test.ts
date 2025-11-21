import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import { WebSocketServer } from 'ws';
import { setupWSConnection } from '@y/websocket-server/utils';

// Server instance for testing
let app: express.Application;
let server: HttpServer;
let wss: WebSocketServer;
let serverUrl: string;

beforeAll(async () => {
  // Create test server instance
  app = express();
  server = createServer(app);
  wss = new WebSocketServer({ noServer: true });

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // WebSocket upgrade handling
  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  // y-websocket connection handling
  wss.on('connection', (ws, request) => {
    setupWSConnection(ws, request);
  });

  // Start server on random available port
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        serverUrl = `http://127.0.0.1:${address.port}`;
        console.log(`[Test] Server started on ${serverUrl}`);
      }
      resolve();
    });
  });
});

afterAll(async () => {
  // Close all WebSocket connections
  wss.clients.forEach((ws) => {
    ws.close();
  });

  // Close WebSocket server
  await new Promise<void>((resolve) => {
    wss.close(() => {
      console.log('[Test] WebSocket server closed');
      resolve();
    });
  });

  // Close HTTP server
  await new Promise<void>((resolve) => {
    server.close(() => {
      console.log('[Test] HTTP server closed');
      resolve();
    });
  });
});

describe('Server Health Check', () => {
  it('should respond with ok: true', async () => {
    const response = await fetch(`${serverUrl}/health`);
    const data = (await response.json()) as { ok: boolean; timestamp: string };

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.timestamp).toBeDefined();
  });

  it('should return valid timestamp format', async () => {
    const response = await fetch(`${serverUrl}/health`);
    const data = (await response.json()) as { ok: boolean; timestamp: string };

    const timestamp = new Date(data.timestamp);
    expect(timestamp.toString()).not.toBe('Invalid Date');
  });
});

describe('WebSocket Connection', () => {
  it('should accept WebSocket upgrade', async () => {
    const wsUrl = serverUrl.replace('http:', 'ws:');
    const ws = new WebSocket(`${wsUrl}?room=test-room`);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        resolve();
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    ws.close();
  });

  it('should handle multiple connections', async () => {
    const wsUrl = serverUrl.replace('http:', 'ws:');
    const ws1 = new WebSocket(`${wsUrl}?room=test-room-multi`);
    const ws2 = new WebSocket(`${wsUrl}?room=test-room-multi`);

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        ws1.on('open', () => resolve());
        ws1.on('error', reject);
        setTimeout(() => reject(new Error('WS1 timeout')), 5000);
      }),
      new Promise<void>((resolve, reject) => {
        ws2.on('open', () => resolve());
        ws2.on('error', reject);
        setTimeout(() => reject(new Error('WS2 timeout')), 5000);
      }),
    ]);

    ws1.close();
    ws2.close();
  });
});

describe('Y.js Synchronization', () => {
  it('should sync updates between two clients in the same room', async () => {
    const roomName = `test-room-sync-${Date.now()}`;
    const wsUrl = serverUrl.replace('http:', 'ws:');

    // Create two Y.Doc instances
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    // Create WebSocket providers for both clients
    const provider1 = new WebsocketProvider(wsUrl, roomName, doc1);
    const provider2 = new WebsocketProvider(wsUrl, roomName, doc2);

    // Wait for both providers to connect and sync
    await Promise.all([
      new Promise<void>((resolve) => {
        provider1.on('sync', () => resolve());
      }),
      new Promise<void>((resolve) => {
        provider2.on('sync', () => resolve());
      }),
    ]);

    // Create a shared map in doc1
    const map1 = doc1.getMap('test');
    map1.set('key1', 'value1');

    // Wait for doc2 to receive the update
    await new Promise<void>((resolve) => {
      const map2 = doc2.getMap('test');
      const observer = () => {
        if (map2.get('key1') === 'value1') {
          map2.unobserve(observer);
          resolve();
        }
      };
      map2.observe(observer);
      // Trigger observer check in case update already arrived
      setTimeout(() => {
        if (map2.get('key1') === 'value1') {
          map2.unobserve(observer);
          resolve();
        }
      }, 100);
    });

    // Verify the data synced
    const map2 = doc2.getMap('test');
    expect(map2.get('key1')).toBe('value1');

    // Test reverse direction: update from doc2
    map2.set('key2', 'value2');

    // Wait for doc1 to receive the update
    await new Promise<void>((resolve) => {
      const observer = () => {
        if (map1.get('key2') === 'value2') {
          map1.unobserve(observer);
          resolve();
        }
      };
      map1.observe(observer);
      setTimeout(() => {
        if (map1.get('key2') === 'value2') {
          map1.unobserve(observer);
          resolve();
        }
      }, 100);
    });

    expect(map1.get('key2')).toBe('value2');

    // Cleanup
    provider1.destroy();
    provider2.destroy();
  }, 10000);

  it('should sync complex nested data structures', async () => {
    const roomName = `test-room-complex-${Date.now()}`;
    const wsUrl = serverUrl.replace('http:', 'ws:');

    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const provider1 = new WebsocketProvider(wsUrl, roomName, doc1);
    const provider2 = new WebsocketProvider(wsUrl, roomName, doc2);

    await Promise.all([
      new Promise<void>((resolve) => provider1.on('sync', () => resolve())),
      new Promise<void>((resolve) => provider2.on('sync', () => resolve())),
    ]);

    // Create nested structure in doc1
    const objects = doc1.getMap('objects');
    const card = new Y.Map();
    card.set('_id', 'card-1');
    card.set('_x', 100);
    card.set('_y', 200);
    objects.set('card-1', card);

    // Wait for doc2 to receive the update
    await new Promise<void>((resolve) => {
      const objects2 = doc2.getMap('objects');
      const observer = () => {
        if (objects2.has('card-1')) {
          objects2.unobserve(observer);
          resolve();
        }
      };
      objects2.observe(observer);
      setTimeout(() => {
        if (objects2.has('card-1')) {
          objects2.unobserve(observer);
          resolve();
        }
      }, 100);
    });

    // Verify the nested structure synced
    const objects2 = doc2.getMap('objects');
    const card2 = objects2.get('card-1') as Y.Map<unknown>;
    expect(card2).toBeDefined();
    expect(card2.get('_id')).toBe('card-1');
    expect(card2.get('_x')).toBe(100);
    expect(card2.get('_y')).toBe(200);

    provider1.destroy();
    provider2.destroy();
  }, 10000);
});

describe('Room Isolation', () => {
  it('should not sync updates between different rooms', async () => {
    const room1 = `test-room-isolated-1-${Date.now()}`;
    const room2 = `test-room-isolated-2-${Date.now()}`;
    const wsUrl = serverUrl.replace('http:', 'ws:');

    // Create two Y.Doc instances for different rooms
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const provider1 = new WebsocketProvider(wsUrl, room1, doc1);
    const provider2 = new WebsocketProvider(wsUrl, room2, doc2);

    // Wait for both providers to sync
    await Promise.all([
      new Promise<void>((resolve) => provider1.on('sync', () => resolve())),
      new Promise<void>((resolve) => provider2.on('sync', () => resolve())),
    ]);

    // Update doc1 in room1
    const map1 = doc1.getMap('test');
    map1.set('room1-key', 'room1-value');

    // Wait a bit to ensure any potential (incorrect) sync would happen
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify doc2 (in room2) did NOT receive the update
    const map2 = doc2.getMap('test');
    expect(map2.get('room1-key')).toBeUndefined();

    // Update doc2 in room2
    map2.set('room2-key', 'room2-value');

    // Wait again
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify doc1 (in room1) did NOT receive the update
    expect(map1.get('room2-key')).toBeUndefined();

    // Verify each room has only its own data
    expect(map1.get('room1-key')).toBe('room1-value');
    expect(map1.get('room2-key')).toBeUndefined();
    expect(map2.get('room2-key')).toBe('room2-value');
    expect(map2.get('room1-key')).toBeUndefined();

    provider1.destroy();
    provider2.destroy();
  }, 10000);

  it('should allow new clients to join existing room and receive state', async () => {
    const roomName = `test-room-join-${Date.now()}`;
    const wsUrl = serverUrl.replace('http:', 'ws:');

    // Client 1 creates initial state
    const doc1 = new Y.Doc();
    const provider1 = new WebsocketProvider(wsUrl, roomName, doc1);

    await new Promise<void>((resolve) => {
      provider1.on('sync', () => resolve());
    });

    const map1 = doc1.getMap('test');
    map1.set('initial-key', 'initial-value');

    // Wait for update to be sent to server
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Client 2 joins the same room
    const doc2 = new Y.Doc();
    const provider2 = new WebsocketProvider(wsUrl, roomName, doc2);

    await new Promise<void>((resolve) => {
      provider2.on('sync', () => resolve());
    });

    // Client 2 should receive the existing state
    const map2 = doc2.getMap('test');
    expect(map2.get('initial-key')).toBe('initial-value');

    provider1.destroy();
    provider2.destroy();
  }, 10000);
});
