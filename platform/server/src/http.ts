/**
 * node:http transport for the API routes in router.ts, plus the crash SSE stream.
 * Adds a 16 KB body limit; everything else (rate limit, geo, auth, errors) lives in the router.
 */

import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';

import { AppError } from './errors';
import { type AppDeps, createRouter } from './router';

export type { AppDeps } from './router';

const MAX_BODY = 16 * 1024;

export function createApp(deps: AppDeps) {
  const router = createRouter(deps);
  const headersOf = (req: IncomingMessage) => Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(payload));
    };
    const headers = headersOf(req);
    if (req.url?.split('?')[0] === '/crash/stream' && req.method === 'GET') {
      if (!router.streamAllowed(headers)) return send(451, { error: 'geo_blocked', message: 'Aus deinem Land ist SCRAPLINE nicht verfügbar.' });
      return stream(res);
    }
    let body: unknown;
    try { body = await readBody(req); } catch (e) {
      const err = e instanceof AppError ? e : new AppError('invalid_json', 'Ungültiges JSON.');
      return send(err.status, { error: err.code, message: err.message });
    }
    const out = await router.dispatch({ method: req.method ?? 'GET', url: req.url ?? '/', headers, body, ip: req.socket.remoteAddress ?? 'unknown' });
    send(out.status, out.payload);
  }

  /** Server-sent events for the crash round (no WebSocket needed; the browser reconnects on its own). */
  function stream(res: ServerResponse) {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write(`retry: 2000\n\n`);
    const off = router.crash.on((e) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
    const ping = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), 15_000);
    res.on('close', () => { off(); clearInterval(ping); });
  }

  return createServer((req, res) => { void handle(req, res); });
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve(null);
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new AppError('payload_too_large', 'Anfrage zu groß.', 413)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new AppError('invalid_json', 'Ungültiges JSON.')); }
    });
    req.on('error', reject);
  });
}
