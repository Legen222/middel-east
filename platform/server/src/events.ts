/**
 * Live events for SSE clients (crash rounds, chat). Services publish through `db.afterCommit`, so an event
 * never announces something that was rolled back.
 *   LocalBus  one process (tests, single-node demo, browser demo).
 *   PgBus     several API instances: publish = pg_notify, every instance LISTENs and fans out to its own
 *             SSE clients. Payloads stay far below Postgres' 8 000-byte NOTIFY limit.
 */

import type pg from 'pg';

import type { CrashEvent } from './crash';

export type ChatEvent = { type: 'message'; id: number } | { type: 'deleted'; id: number } | { type: 'rain' };
export type BusEvent = { topic: 'crash'; event: CrashEvent } | { topic: 'chat'; event: ChatEvent };

export interface Bus {
  publish(e: BusEvent): void;
  subscribe(fn: (e: BusEvent) => void): () => void;
  close(): Promise<void>;
}

export class LocalBus implements Bus {
  private subs = new Set<(e: BusEvent) => void>();
  publish(e: BusEvent): void {
    for (const s of this.subs) { try { s(e); } catch { /* a broken client must not stop the others */ } }
  }
  subscribe(fn: (e: BusEvent) => void): () => void { this.subs.add(fn); return () => this.subs.delete(fn); }
  async close(): Promise<void> { this.subs.clear(); }
}

const CHANNEL = 'scrapline_events';

export class PgBus implements Bus {
  private local = new LocalBus();
  private listener: pg.Client | null = null;
  constructor(private pool: pg.Pool, private connect: () => pg.Client) {}

  async start(): Promise<void> {
    const c = this.connect();
    c.on('notification', (n) => { if (n.channel === CHANNEL && n.payload) { try { this.local.publish(JSON.parse(n.payload)); } catch { /* ignore malformed */ } } });
    c.on('error', () => { this.listener = null; setTimeout(() => void this.start().catch(() => undefined), 1000); });
    await c.connect();
    await c.query(`LISTEN ${CHANNEL}`);
    this.listener = c;
  }
  publish(e: BusEvent): void {
    void this.pool.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify(e)]).catch(() => undefined);
  }
  subscribe(fn: (e: BusEvent) => void): () => void { return this.local.subscribe(fn); }
  async close(): Promise<void> { await this.listener?.end().catch(() => undefined); await this.local.close(); }
}

/** Process-wide bus. main.ts swaps in a PgBus when DATABASE_URL is set. */
export let bus: Bus = new LocalBus();
export function setBus(b: Bus): void { bus = b; }
