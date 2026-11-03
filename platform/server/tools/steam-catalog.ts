/**
 * Writes data/rust-market.json: every Rust item listed on the Steam Community Market with its icon hash, lowest
 * price (US cents) and number of listings. `npm run item-icons` takes its pictures from here first, and the
 * list is the base for crates made of real, tradeable skins.
 *
 *   npm run steam-catalog
 *
 * Needs access to steamcommunity.com. Without a Steam login the search answers 10 listings per request, so the
 * whole list (some 5 500 items) takes several hundred requests: one every 4 s, and on 429 the tool waits two
 * minutes and asks again (ten times in a row at most). The list is written after every 50 pages, so a stopped
 * run keeps what it has; `-- --resume` goes on from there.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type MarketRow, parseMarketPage } from '../src/item-icons';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'rust-market.json');
const PAGE = 100;
const URL_ = (start: number) => `https://steamcommunity.com/market/search/render/?appid=252490&norender=1&search_descriptions=0&sort_column=name&sort_dir=asc&count=${PAGE}&start=${start}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const resume = process.argv.includes('--resume') && existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as { next?: number; items: MarketRow[] }) : null;
const all = new Map<string, MarketRow>((resume?.items ?? []).map((r) => [r.name, r]));
let total = Infinity;
let busy = 0;
let pages = 0;
const save = (next: number | null) => {
  const items = [...all.values()].sort((a, b) => a.name.localeCompare(b.name));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({ source: 'Steam Community Market, app 252490', fetchedAt: new Date().toISOString(), count: items.length, ...(next === null ? {} : { next }), items }, null, 1)}\n`);
  return items.length;
};
for (let start = resume?.next ?? 0; start < total;) {
  if (pages) await sleep(4000);
  const res = await fetch(URL_(start), { headers: { accept: 'application/json' } }).catch((e: Error) => { console.error(`page ${start}: ${e.message}`); process.exit(1); });
  if (res.status === 429) {
    if (++busy > 10) { save(start); console.error(`rate limited ten times in a row, stopped at ${start}; go on with -- --resume`); process.exit(1); }
    console.log('rate limited, waiting two minutes'); await sleep(120_000); continue;
  }
  if (!res.ok) { save(start); console.error(`page ${start}: HTTP ${res.status}; go on with -- --resume`); process.exit(1); }
  busy = 0;
  const page = parseMarketPage(await res.json());
  total = page.total;
  for (const r of page.rows) all.set(r.name, r);
  if (!page.size) break;
  start += page.size;
  if (++pages % 50 === 0) { save(start); console.log(`${Math.min(start, total)} / ${total}`); }
}
console.log(`${save(null)} items written to data/rust-market.json`);
