/**
 * node:http transport for the API routes in router.ts.
 *   /events        Server-Sent Events: crash rounds and chat updates from the event bus
 *   /crash/stream  crash-only stream (kept for older clients)
 * Adds a 16 KB body limit, request ids, one JSON log line per request, security headers and a
 * graceful close that ends open streams. Everything else (rate limit, geo, auth, errors) lives in the router.
 */

import { randomBytes } from 'node:crypto';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';

import { AppError } from './errors';
import { type BusEvent, bus } from './events';
import { type AppDeps, createRouter } from './router';

export type { AppDeps } from './router';

const MAX_BODY = 16 * 1024;
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-resource-policy': 'same-origin',
};

export interface AppOptions { trustProxy?: boolean; log?: (line: Record<string, unknown>) => void }

export function createApp(deps: AppDeps, opts: AppOptions = {}) {
  const router = createRouter(deps);
  const log = opts.log ?? (() => undefined);
  const streams = new Set<ServerResponse>();
  const headersOf = (req: IncomingMessage) => Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const clientIp = (req: IncomingMessage) => {
    const fwd = opts.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
    return fwd || req.socket.remoteAddress || 'unknown';
  };

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const started = Date.now();
    const id = String(req.headers['x-request-id'] ?? '').slice(0, 64) || randomBytes(8).toString('hex');
    const path = req.url?.split('?')[0] ?? '/';
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-request-id': id, ...SECURITY_HEADERS });
      res.end(JSON.stringify(payload));
      log({ t: new Date().toISOString(), id, method: req.method, path, status, ms: Date.now() - started, ip: clientIp(req) });
    };
    const headers = headersOf(req);
    if (req.method === 'GET' && (path === '/events' || path === '/crash/stream')) {
      if (!router.streamAllowed(headers)) return send(451, { error: 'geo_blocked', message: 'SCRAPLINE is not available in your country.' });
      return stream(res, path === '/crash/stream' ? 'crash' : null);
    }
    let body: unknown;
    try { body = await readBody(req); } catch (e) {
      const err = e instanceof AppError ? e : new AppError('invalid_json', 'Invalid JSON.');
      return send(err.status, { error: err.code, message: err.message });
    }
    const out = await router.dispatch({ method: req.method ?? 'GET', url: req.url ?? '/', headers, body, ip: clientIp(req) });
    send(out.status, out.payload);
  }

  /** Server-sent events (no WebSocket needed; the browser reconnects on its own). */
  function stream(res: ServerResponse, only: BusEvent['topic'] | null) {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no', ...SECURITY_HEADERS });
    res.write('retry: 2000\n\n');
    streams.add(res);
    const off = bus.subscribe((e) => {
      if (only && e.topic !== only) return;
      // crash events keep their own names (betting, running, …); chat events arrive as "chat"
      const name = e.topic === 'crash' ? e.event.type : 'chat';
      res.write(`event: ${name}\ndata: ${JSON.stringify(e.event)}\n\n`);
    });
    const ping = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), 15_000);
    res.on('close', () => { off(); clearInterval(ping); streams.delete(res); });
  }

  const server = createServer((req, res) => { void handle(req, res); });
  /** Stops accepting connections, ends event streams and resolves once in-flight requests are done. */
  const shutdown = () => new Promise<void>((resolve) => {
    for (const s of streams) s.end();
    server.close(() => resolve());
    server.closeIdleConnections();
  });
  return Object.assign(server, { shutdown });
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve(null);
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new AppError('payload_too_large', 'Request too large.', 413)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new AppError('invalid_json', 'Invalid JSON.')); }
    });
    req.on('error', reject);
  });
}
