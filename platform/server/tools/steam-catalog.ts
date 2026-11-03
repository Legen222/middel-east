/**
 * Writes data/rust-market.json: every Rust item listed on the Steam Community Market with its icon hash, lowest
 * price (US cents) and number of listings. `npm run item-icons` takes its pictures from here first, and the
 * list is the base for crates made of real, tradeable skins.
 *
 *   npm run steam-catalog
 *
 * Needs access to steamcommunity.com. 100 listings per request, one request every 4 s (the market search is
 * rate-limited; on 429 the tool waits a minute and asks again, five times at most).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type MarketRow, parseMarketPage } from '../src/item-icons';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'rust-market.json');
const PAGE = 100;
const URL_ = (start: number) => `https://steamcommunity.com/market/search/render/?appid=252490&norender=1&search_descriptions=0&sort_column=name&sort_dir=asc&count=${PAGE}&start=${start}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const all = new Map<string, MarketRow>();
let total = Infinity;
let busy = 0;
for (let start = 0; start < total;) {
  if (start) await sleep(4000);
  const res = await fetch(URL_(start), { headers: { accept: 'application/json' } }).catch((e: Error) => { console.error(`page ${start}: ${e.message}`); process.exit(1); });
  if (res.status === 429) {
    if (++busy > 5) { console.error('rate limited five times in a row, stopping'); break; }
    console.log('rate limited, waiting a minute'); await sleep(60_000); continue;
  }
  if (!res.ok) { console.error(`page ${start}: HTTP ${res.status}`); process.exit(1); }
  busy = 0;
  const page = parseMarketPage(await res.json());
  total = page.total;
  for (const r of page.rows) all.set(r.name, r);
  console.log(`${Math.min(start + PAGE, total)} / ${total}`);
  if (!page.rows.length) break;
  start += PAGE;
}

const items = [...all.values()].sort((a, b) => a.name.localeCompare(b.name));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ source: 'Steam Community Market, app 252490', fetchedAt: new Date().toISOString(), count: items.length, items }, null, 1)}\n`);
console.log(`${items.length} items written to data/rust-market.json`);
