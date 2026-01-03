import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { setupWSConnection } from '@y/websocket-server/utils';
import { createHash } from 'crypto';
import cors from 'cors';

// Server entry point for Railway deployment
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Configure CORS based on environment
const allowedOrigins =
  NODE_ENV === 'development'
    ? [
        'http://localhost:3000',
        'http://localhost:5173', // Vite default
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
      ]
    : [
        'https://beta.card-table.app',
        'https://card-table.app',
        /^https:\/\/cardtable2-app-pr-\d+-prs\.up\.railway\.app$/, // PR previews
      ];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      // Check if origin matches any allowed pattern
      const isAllowed = allowedOrigins.some((allowed) =>
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
app.get('/api/card-image/*splat', async (req, res) => {
  // Get the full path (req.path preserves slashes, req.params.splat converts to commas)
  const imagePath = req.path.replace('/api/card-image/', '');
  const azureUrl = `https://cerebrodatastorage.blob.core.windows.net/${imagePath}`;

  try {
    console.log(`[Proxy] Fetching image: ${imagePath}`);

    // Fetch from Azure
    const response = await fetch(azureUrl);

    if (!response.ok) {
      console.error(`[Proxy] Failed to fetch ${imagePath}: ${response.status}`);
      return res.status(response.status).send('Image not found');
    }

    // Get image data
    const imageBuffer = Buffer.from(await response.arrayBuffer());

    // Generate ETag from content hash
    const etag = `"${createHash('md5').update(imageBuffer).digest('hex')}"`;

    // Check if client already has this version
    if (req.headers['if-none-match'] === etag) {
      console.log(`[Proxy] Cache hit for ${imagePath} (304 Not Modified)`);
      return res.status(304).end();
    }

    // Set aggressive caching headers
    // Images are immutable - once a card ID is assigned, the image never changes
    res.set({
      'Content-Type': response.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
      ETag: etag,
    });

    console.log(`[Proxy] Serving ${imagePath} (${imageBuffer.length} bytes)`);
    return res.send(imageBuffer);
  } catch (error) {
    console.error(`[Proxy] Error fetching ${imagePath}:`, error);
    return res.status(500).send('Proxy error');
  }
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

  // setupWSConnection handles all Yjs synchronization automatically
  // It manages:
  // - Initial sync (sending current document state)
  // - Applying updates from clients
  // - Broadcasting updates to other clients
  // - Awareness state propagation (30Hz, no need to log every message)
  setupWSConnection(ws, request);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] Environment: ${NODE_ENV}`);
  console.log(
    `[Server] CORS allowed origins:`,
    allowedOrigins.map((o) => (typeof o === 'string' ? o : o.source)),
  );
  console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/health`);
  console.log(`[Server] Network: Accessible on local network at port ${PORT}`);
});
