import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { setupWSConnection } from '@y/websocket-server/utils';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// WebSocket upgrade handling with y-websocket integration (M5-T1)
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// y-websocket connection handling (M5-T1)
// Uses the official y-websocket server utilities for proper Yjs sync
wss.on('connection', (ws, request) => {
  const url = request.url || '';
  console.log(`[Server] New WebSocket connection: ${url}`);

  // Debug: Log messages received from client
  ws.on('message', (data: Buffer) => {
    console.log(`[Server] Received message: ${data.byteLength} bytes`);
  });

  // setupWSConnection handles all Yjs synchronization automatically
  // It manages:
  // - Initial sync (sending current document state)
  // - Applying updates from clients
  // - Broadcasting updates to other clients
  // - Awareness state propagation
  setupWSConnection(ws, request);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/health`);
  console.log(`[Server] Network: Accessible on local network at port ${PORT}`);
});
