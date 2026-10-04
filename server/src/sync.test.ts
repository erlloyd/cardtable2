import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { connect } from 'node:net';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { MAX_PAYLOAD_BYTES, connectSocket, createHocuspocus } from './sync.ts';

let server: HttpServer;
let wss: WebSocketServer;
let port: number;

beforeAll(async () => {
  server = createServer();
  wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  const hocuspocus = createHocuspocus();
  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      connectSocket(hocuspocus, ws, request);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  wss.clients.forEach((ws) => ws.terminate());
  await new Promise<void>((resolve) => wss.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function openClient(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/doc`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

async function expectServerAlive(): Promise<void> {
  const ws = await openClient();
  ws.close();
}

describe('connectSocket resilience', () => {
  it('survives a malformed frame (RSV bits set) from a client', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/doc`);
    const rawSocket = new Promise<Duplex>((resolve) =>
      ws.on('upgrade', (response) => resolve(response.socket)),
    );
    const closed = new Promise<void>((resolve) => ws.on('close', resolve));
    // RSV1 set with no negotiated extension: ws emits 'error' on the server socket
    (await rawSocket).write(Buffer.from([0xf3, 0x80, 1, 2, 3, 4]));
    await closed;

    await expectServerAlive();
  });

  it('closes with 1008 and survives a connection with an unparsable Host header', async () => {
    const closeCode = await new Promise<number>((resolve, reject) => {
      const socket = connect(port, '127.0.0.1', () => {
        socket.write(
          [
            'GET /doc HTTP/1.1',
            'Host: bad host',
            'Upgrade: websocket',
            'Connection: Upgrade',
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version: 13',
            '',
            '',
          ].join('\r\n'),
        );
      });
      socket.on('error', reject);
      const chunks: Buffer[] = [];
      socket.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        // Server close frame follows the 101 headers: 0x88, len, 2-byte code
        const buf = Buffer.concat(chunks);
        const frameStart = buf.indexOf('\r\n\r\n') + 4;
        if (frameStart > 3 && buf.length >= frameStart + 4) {
          socket.destroy();
          resolve(buf.readUInt16BE(frameStart + 2));
        }
      });
    });
    expect(closeCode).toBe(1008);

    await expectServerAlive();
  });
});
