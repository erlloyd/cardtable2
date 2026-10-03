import type { IncomingMessage } from 'node:http';
import { Hocuspocus } from '@hocuspocus/server';
import type { RawData, WebSocket } from 'ws';

export function createHocuspocus(): Hocuspocus {
  return new Hocuspocus({ quiet: true });
}

export function toFetchRequest(request: IncomingMessage): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      value.forEach((v) => headers.append(name, v));
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  const host = request.headers.host ?? 'localhost';
  return new Request(new URL(request.url ?? '/', `http://${host}`), {
    headers,
  });
}

function toUint8Array(data: RawData): Uint8Array {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data;
}

export function connectSocket(
  hocuspocus: Hocuspocus,
  ws: WebSocket,
  request: IncomingMessage,
): void {
  const connection = hocuspocus.handleConnection(ws, toFetchRequest(request));
  ws.on('message', (data) => connection.handleMessage(toUint8Array(data)));
  ws.on('close', (code, reason) =>
    connection.handleClose(
      new CloseEvent('close', { code, reason: reason.toString() }),
    ),
  );
}
