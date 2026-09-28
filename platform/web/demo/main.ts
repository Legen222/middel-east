/**
 * Self-contained browser demo: the real SCRAPLINE server (platform/server) runs inside the page.
 *   - node:sqlite → sql.js (SQLite compiled to asm.js, no WebAssembly needed), node:crypto → small shim
 *   - window.fetch('/api/…') is answered by the server's router.dispatch — same routes, same engine
 *   - EventSource('/api/crash/stream') is fed from CrashService events
 *   - the database is saved to localStorage every few seconds, so a reload keeps the demo state
 * Everything is play money. The beacon is the local demo beacon (not trustless) and says so.
 */

// asm.js build of SQLite: no WebAssembly, so it also runs where a page's CSP forbids wasm compilation.
// @ts-expect-error — the asm.js build ships without its own type declaration
import initSqlJs from 'sql.js/dist/sql-asm.js';

import { LocalBeacon } from '../../server/src/beacon';
import { DEFAULT_CONFIG } from '../../server/src/config';
import { CrashService } from '../../server/src/crash';
import { openDb } from '../../server/src/db';
import { settleDue } from '../../server/src/pvp';
import { rgScan } from '../../server/src/admin';
import { rainTick } from '../../server/src/rewards';
import { createRouter } from '../../server/src/router';
import { toHex } from '../../engine/src/pf/sha256';
import { configureSqlJs, exportDatabase } from './shims/node-sqlite';

const DB_KEY = 'scrapline.demo.db.v2';
const BEACON_KEY = 'scrapline.demo.beacon.v2';

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const toB64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

async function start() {
  const SQL = await initSqlJs();
  const saved = store.get(DB_KEY);
  configureSqlJs(SQL, saved ? fromB64(saved) : null);

  let beaconCfg = (() => { try { return JSON.parse(store.get(BEACON_KEY) ?? 'null') as { genesis: number; tip: string } | null; } catch { return null; } })();
  if (!beaconCfg || !saved) {
    const tip = toHex(crypto.getRandomValues(new Uint8Array(32)));
    beaconCfg = { genesis: Date.now() - 60_000, tip };
    store.set(BEACON_KEY, JSON.stringify(beaconCfg));
  }
  const db = openDb();
  const cfg = { ...DEFAULT_CONFIG, demo: true };
  const beacon = new LocalBeacon(beaconCfg.genesis, 50_000, 3000, beaconCfg.tip);
  const crash = new CrashService(db, cfg, beacon, 20_000);
  const router = createRouter({ db, cfg, clock: () => Date.now(), fetch: async () => ({ ok: false, text: async () => '' }), publicUrl: location.origin, beacon, crash });

  /* fetch('/api/…') → router */
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.startsWith('/api/') ? url.slice(4) : null;
    if (path === null) return realFetch(input, init);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    const body = typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : null;
    const out = await router.dispatch({ method: (init?.method ?? 'GET').toUpperCase(), url: path, headers, body, ip: 'browser' });
    return new Response(JSON.stringify(out.payload), { status: out.status, headers: { 'content-type': 'application/json' } });
  };

  /* EventSource('/api/crash/stream') → CrashService events */
  const RealES = window.EventSource;
  class DemoEventSource {
    private listeners = new Map<string, ((e: MessageEvent) => void)[]>();
    private off: () => void;
    readyState = 1;
    constructor(readonly url: string) {
      this.off = crash.on((e) => (this.listeners.get(e.type) ?? []).forEach((fn) => fn(new MessageEvent(e.type, { data: JSON.stringify(e) }))));
    }
    addEventListener(type: string, fn: (e: MessageEvent) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
    removeEventListener(type: string, fn: (e: MessageEvent) => void) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((x) => x !== fn)); }
    close() { this.readyState = 2; this.off(); }
  }
  (window as unknown as { EventSource: unknown }).EventSource = function (url: string, init?: EventSourceInit) {
    return url.includes('/api/crash/stream') ? new DemoEventSource(url) : new RealES(url, init);
  };

  /* background jobs the real server runs every 200 ms */
  let busy = false;
  let lastScan = 0;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await crash.tick(Date.now()); await settleDue(db, beacon, Date.now()); rainTick(db, cfg, Date.now()); if (Date.now() - lastScan > 60_000) { lastScan = Date.now(); rgScan(db, cfg, lastScan); } } catch (e) { console.error(e); } finally { busy = false; }
  }, 200);
  const save = () => { const bytes = exportDatabase(); if (bytes && !store.set(DB_KEY, toB64(bytes))) console.warn('Could not save demo state (storage full or blocked).'); };
  setInterval(save, 5000);
  addEventListener('pagehide', save);

  /* reset button in the demo banner */
  document.getElementById('demo-reset')?.addEventListener('click', () => {
    store.del(DB_KEY); store.del(BEACON_KEY);
    try { localStorage.removeItem('scrapline.token'); localStorage.removeItem('scrapline.revealed'); } catch { /* ignore */ }
    location.hash = ''; location.reload();
  });

  await crash.tick(Date.now());
  await import('../src/main');
}

start().catch((e) => {
  console.error(e);
  const app = document.getElementById('app');
  if (app) app.innerHTML = '<p style="padding:24px;color:#EAE2D3">The demo failed to start. Please reload the page.</p>';
});
