/** Starts the demo API. Env: PORT (8787), DB_PATH (data/scrapline-demo.sqlite), PUBLIC_URL. */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { DrandBeacon, LocalBeacon } from './beacon';
import { DEFAULT_CONFIG, systemClock } from './config';
import { CrashService } from './crash';
import { openDb } from './db';
import { createApp } from './http';
import { settleDue } from './pvp';
import { rainTick } from './rewards';

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DB_PATH ?? 'data/scrapline-demo.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });

const db = openDb(dbPath);
const cfg = { ...DEFAULT_CONFIG, demo: true }; // real money stays off until licence, KYC provider and payment rails exist
const httpFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => fetch(url, init);
// BEACON=drand uses the public drand network (needs outbound access to api.drand.sh); default is the local demo beacon.
const beacon = process.env.BEACON === 'drand' ? new DrandBeacon(httpFetch) : new LocalBeacon(Date.now() - 60_000);
const crash = new CrashService(db, cfg, beacon, Number(process.env.CRASH_CHAIN ?? 100_000));

const app = createApp({ db, cfg, clock: systemClock, fetch: httpFetch, publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${port}`, beacon, crash });
app.listen(port, () => console.log(`SCRAPLINE demo API on http://localhost:${port} (db: ${dbPath}, beacon: ${beacon.name})`));

let busy = false;
setInterval(async () => {
  if (busy) return;
  busy = true;
  try { await crash.tick(Date.now()); await settleDue(db, beacon, Date.now()); rainTick(db, cfg, Date.now()); } catch (e) { console.error('ticker', e); } finally { busy = false; }
}, 200);
