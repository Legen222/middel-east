/**
 * API process. Configuration comes from the environment (see docs/platform/07-produktion.md):
 *   PORT=8787  PUBLIC_URL  LOG=json|off
 *   DATABASE_URL=postgres://…   Postgres (production); otherwise DB_PATH=data/scrapline-demo.sqlite (single node)
 *   PG_POOL_MAX=10
 *   DEMO=true                  play money; DEMO=false additionally needs LICENCE_ID (real money stays off otherwise)
 *   REQUIRE_OPERATOR_MFA       default: on outside the demo, off in the demo
 *   OPERATOR_IP_ALLOWLIST      comma-separated IPs/CIDRs for /admin and /mod
 *   TRUST_PROXY=true           take the client IP from X-Forwarded-For (only behind a proxy that sets it)
 *   BEACON=drand               public drand beacon instead of the local demo beacon
 *   CRASH_CHAIN=100000
 * With Postgres every instance serves the API; exactly one (the advisory-lock leader) runs the tickers.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import pg from 'pg';

import { rgScan } from './admin';
import { DrandBeacon, LocalBeacon } from './beacon';
import { type Config, DEFAULT_CONFIG, systemClock } from './config';
import { CrashService } from './crash';
import { type DB, openDb } from './db';
import { PgBus, setBus } from './events';
import { createApp } from './http';
import { PgLeader, openPg } from './pg';
import { settleDue } from './pvp';
import { rainTick } from './rewards';

const env = process.env;
const flag = (v: string | undefined, dflt: boolean) => (v === undefined || v === '' ? dflt : /^(1|true|yes|on)$/i.test(v));
const log = env.LOG === 'off' ? () => undefined : (line: Record<string, unknown>) => console.log(JSON.stringify(line));

const demo = flag(env.DEMO, true);
if (!demo && !env.LICENCE_ID) {
  console.error('DEMO=false needs LICENCE_ID: real money stays off until a licence, KYC provider and payment rails exist (docs/platform/05-go-live.md).');
  process.exit(1);
}
const cfg: Config = {
  ...DEFAULT_CONFIG,
  demo,
  requireOperatorMfa: flag(env.REQUIRE_OPERATOR_MFA, !demo),
  operatorIpAllowlist: (env.OPERATOR_IP_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: flag(env.TRUST_PROXY, false),
};
const port = Number(env.PORT ?? 8787);

let db: DB;
let leader: PgLeader | null = null;
if (env.DATABASE_URL) {
  const pgDb = await openPg({ url: env.DATABASE_URL, max: Number(env.PG_POOL_MAX ?? 10) });
  db = pgDb;
  const pgBus = new PgBus(pgDb.pool, () => new pg.Client({ connectionString: env.DATABASE_URL, application_name: 'scrapline-events' }));
  await pgBus.start();
  setBus(pgBus);
  leader = new PgLeader(env.DATABASE_URL);
} else {
  const dbPath = env.DB_PATH ?? 'data/scrapline-demo.sqlite';
  mkdirSync(dirname(dbPath), { recursive: true });
  db = openDb(dbPath);
}

const httpFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => fetch(url, init);
const beacon = env.BEACON === 'drand' ? new DrandBeacon(httpFetch) : new LocalBeacon(Date.now() - 60_000);
const crash = new CrashService(db, cfg, beacon, Number(env.CRASH_CHAIN ?? 100_000));

let isLeader = !leader;
const app = createApp({
  db, cfg, clock: systemClock, fetch: httpFetch, publicUrl: env.PUBLIC_URL ?? `http://localhost:${port}`, beacon, crash,
  ready: async () => ({ leader: isLeader, beacon: beacon.name, demo: cfg.demo }),
}, { trustProxy: cfg.trustProxy, log });
app.listen(port, () => log({ t: new Date().toISOString(), msg: 'listening', port, db: db.dialect, beacon: beacon.name, demo: cfg.demo, operatorMfa: cfg.requireOperatorMfa }));

/* ---------- tickers (leader only) ---------- */
let busy = false;
let lastScan = 0;
let lastLeaderTry = 0;
const ticker = setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    if (leader && Date.now() - lastLeaderTry > 5000) { lastLeaderTry = Date.now(); isLeader = await leader.tryAcquire().catch(() => false); }
    if (!isLeader) return;
    const now = Date.now();
    await crash.tick(now);
    await settleDue(db, beacon, now);
    await rainTick(db, cfg, now);
    if (now - lastScan > 60_000) { lastScan = now; await rgScan(db, cfg, now); }
  } catch (e) {
    log({ t: new Date().toISOString(), level: 'error', msg: 'ticker', error: String((e as Error)?.stack ?? e) });
  } finally {
    busy = false;
  }
}, 200);

/* ---------- graceful shutdown ---------- */
let stopping = false;
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  log({ t: new Date().toISOString(), msg: 'shutdown', signal });
  clearInterval(ticker);
  const hard = setTimeout(() => process.exit(1), 15_000);
  await app.shutdown();
  await leader?.release();
  await db.close().catch(() => undefined);
  clearTimeout(hard);
  process.exit(0);
}
process.on('SIGTERM', () => void stop('SIGTERM'));
process.on('SIGINT', () => void stop('SIGINT'));
