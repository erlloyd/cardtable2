import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { createProxyHandler } from './proxyHandler.ts';
import { MAX_PAYLOAD_BYTES, connectSocket, createHocuspocus } from './sync.ts';

// Server entry point for Railway deployment
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: MAX_PAYLOAD_BYTES,
});
const hocuspocus = createHocuspocus();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Configure CORS based on environment
const productionOrigins: (string | RegExp)[] = [
  'https://beta.card-table.app',
  'https://card-table.app',
  /^https:\/\/cardtable2-app-pr-\d+-prs\.up\.railway\.app$/, // PR previews
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      // In development, allow all origins so LAN devices can connect
      if (NODE_ENV === 'development') {
        return callback(null, origin);
      }

      // Production: check against allowed origins
      const isAllowed = productionOrigins.some((allowed) =>
        typeof allowed === 'string' ? allowed === origin : allowed.test(origin),
      );

      if (isAllowed) {
        callback(null, origin);
      } else {
        console.warn(`[CORS] Blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }),
);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Card image proxy with aggressive caching to minimize Railway bandwidth
// Images are proxied from Azure Blob Storage which doesn't provide CORS headers
// ETags + immutable caching means clients only download each image once
// Express 5 wildcard syntax: /*path (wildcard must have a name in path-to-regexp v8)
app.get<{ path: string[] | string }>(
  '/api/card-image/*path',
  createProxyHandler({
    enableETag: true,
    enableLogging: true,
  }),
);

// WebSocket upgrade handling (M5-T1)
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Hocuspocus handles Yjs sync (initial state, updates, awareness) per socket
wss.on('connection', (ws, request) => {
  connectSocket(hocuspocus, ws, request);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] Environment: ${NODE_ENV}`);
  console.log(
    `[Server] CORS origins:`,
    NODE_ENV === 'development'
      ? 'all (development mode)'
      : productionOrigins.map((o) => (typeof o === 'string' ? o : o.source)),
  );
  console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/health`);
  console.log(`[Server] Network: Accessible on local network at port ${PORT}`);
});
