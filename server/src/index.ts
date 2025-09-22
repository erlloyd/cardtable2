import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 3001;

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// WebSocket upgrade handling
server.on('upgrade', (request, socket, head) => {
  // In the future, this will handle y-websocket connections
  // For now, just a placeholder
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (message) => {
    console.log('Received:', message.toString());
  });

  ws.on('close', () => {
    console.log('Connection closed');
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
