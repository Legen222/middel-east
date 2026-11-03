/**
 * Writes src/item-icon-seed.ts: the Steam market icon hash of every item in the built-in crates and the daily
 * Scrap Crate, so the site shows pictures from the first start without asking Steam.
 *
 *   npm run item-icons             look up the names the seed lacks
 *   npm run item-icons -- --all    look every name up again
 *
 * Takes the pictures from data/rust-market.json when `npm run steam-catalog` has written it. Otherwise it opens each
 * item's market page, and searches the market for names not found that way; one request every 3 s (Steam answers
 * 429 when asked too often; the tool then waits a minute, five times in a row at most). Needs access to steamcommunity.com. Names without an exact
 * listing (base items such as Rope or Assault Rifle, which Steam does not sell) are reported and keep their drawing.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SAMPLE_CASES } from '../../engine/src/index';
import { DEFAULT_CONFIG } from '../src/config';
import { ITEM_ICON_SEED } from '../src/item-icon-seed';
import { ALIASES, MarketBusy, type MarketRow, iconFromCatalog, lookupListingIcon, lookupMarketIcon } from '../src/item-icons';
import { DAILY_CASE } from '../src/rewards';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'item-icon-seed.ts');
const CATALOG = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'rust-market.json');
const all = process.argv.includes('--all');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fetchFn = (url: string, init: { method: string; headers: Record<string, string> }) => fetch(url, init);

const names = [...new Set([...SAMPLE_CASES, DAILY_CASE].flatMap((c) => c.items.map((i) => ALIASES[i.name] ?? i.name)))].sort();
const seed: Record<string, string> = all ? {} : { ...ITEM_ICON_SEED };
const todo = names.filter((n) => !seed[n]);
const misses: string[] = [];
console.log(`${names.length} items, ${todo.length} to look up`);

// the full market list (npm run steam-catalog) answers without asking Steam once per name
const catalog = existsSync(CATALOG) ? (JSON.parse(readFileSync(CATALOG, 'utf8')) as { items: MarketRow[] }).items : null;
if (catalog) {
  for (const name of todo.splice(0)) {
    const icon = iconFromCatalog(catalog, name);
    if (icon) seed[name] = icon; else misses.push(name);
  }
  console.log(`from data/rust-market.json (${catalog.length} listings)`);
}

// first the item's own market page, then the search for names spelled differently there (AK-47 / AK47)
const unknown: string[] = [];
for (const [round, list] of [['page', todo], ['search', unknown]] as const) {
  let busy = 0;
  for (let k = 0; k < list.length; k++) {
    const name = list[k];
    if (k) await sleep(3000);
    try {
      const icon = round === 'page' ? await lookupListingIcon(name, fetchFn) : await lookupMarketIcon(name, DEFAULT_CONFIG.itemIcons.searchUrl, fetchFn);
      busy = 0;
      if (icon) seed[name] = icon; else if (round === 'page') unknown.push(name); else misses.push(name);
      console.log(`${icon ? '✓' : '·'} ${name} (${round})`);
    } catch (e) {
      if (e instanceof MarketBusy && ++busy <= 5) { console.log('rate limited, waiting a minute'); await sleep(60_000); k--; continue; }
      console.error(`${name}: ${(e as Error).message}; ${list.length - k} names left for the next run`);
      if (round === 'page') unknown.length = 0;
      break;
    }
  }
}

const body = Object.keys(seed).filter((n) => names.includes(n)).sort().map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(seed[n])},`).join('\n');
writeFileSync(OUT, `/**
 * Steam market icon hashes of the built-in crate items, written by \`npm run item-icons\` (tools/item-icons.ts).
 * Items missing here have no market listing (base items) or were not looked up yet; the server fills gaps at run time.
 */
export const ITEM_ICON_SEED: Record<string, string> = {
${body}${body ? '\n' : ''}};
`);
console.log(`${Object.keys(seed).length} icons written to src/item-icon-seed.ts; no listing: ${misses.join(', ') || 'none'}`);
