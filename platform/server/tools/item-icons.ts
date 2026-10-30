/**
 * Writes src/item-icon-seed.ts: the Steam market icon hash of every item in the built-in crates and the daily
 * Scrap Crate, so the site shows pictures from the first start without asking Steam.
 *
 *   npm run item-icons             look up the names the seed lacks
 *   npm run item-icons -- --all    look every name up again
 *
 * Needs access to steamcommunity.com. One search every 3 s; the market search is rate-limited and answers
 * 429 when asked too often (the tool then waits a minute and goes on). Names without an exact listing (base
 * items such as Rope or Assault Rifle, which Steam does not sell) are reported and keep their drawing.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SAMPLE_CASES } from '../../engine/src/index';
import { DEFAULT_CONFIG } from '../src/config';
import { ITEM_ICON_SEED } from '../src/item-icon-seed';
import { ALIASES, MarketBusy, lookupMarketIcon } from '../src/item-icons';
import { DAILY_CASE } from '../src/rewards';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'item-icon-seed.ts');
const all = process.argv.includes('--all');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fetchFn = (url: string, init: { method: string; headers: Record<string, string> }) => fetch(url, init);

const names = [...new Set([...SAMPLE_CASES, DAILY_CASE].flatMap((c) => c.items.map((i) => ALIASES[i.name] ?? i.name)))].sort();
const seed: Record<string, string> = all ? {} : { ...ITEM_ICON_SEED };
const todo = names.filter((n) => !seed[n]);
const misses: string[] = [];
console.log(`${names.length} items, ${todo.length} to look up`);

for (let k = 0; k < todo.length; k++) {
  const name = todo[k];
  if (k) await sleep(3000);
  try {
    const icon = await lookupMarketIcon(name, DEFAULT_CONFIG.itemIcons.searchUrl, fetchFn);
    if (icon) seed[name] = icon; else misses.push(name);
    console.log(`${icon ? '✓' : '·'} ${name}`);
  } catch (e) {
    if (e instanceof MarketBusy) { console.log('rate limited, waiting a minute'); await sleep(60_000); k--; continue; }
    console.error(`${name}: ${(e as Error).message}`);
    break;
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
