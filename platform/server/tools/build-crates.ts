/**
 * Writes engine/src/games/case-lineup.ts: the twenty crates and the daily Scrap Crate, filled only with real Rust
 * skins that have a picture (Steam's item list, needs STEAM_API_KEY) and a market price (the skin price feed,
 * cfg.skins.priceUrl, Skinport by default). Each item is worth its price × ITEM_VALUE_BOOST in Scrap
 * (100 Scrap = 1 $). The crates keep their ids, names and prices; the weights are solved so every crate pays
 * back 93.00 % of its price (engine tests check price, RTP and every ticket).
 *
 *   npm run build-crates      then `npm run item-icons -- --all --no-market` for the pictures
 *
 * Re-run it when prices have moved: crates whose items change become a new version on the next start
 * (db.ts CASE_SYNC); versions an operator published are left alone.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type CaseDef, type CaseItem, DAILY_LINEUP, EDGE, ITEM_VALUE_BOOST, SAMPLE_CASES, caseEv, priceCase } from '../../engine/src/index';
import { DEFAULT_CONFIG } from '../src/config';
import { fetchItemDefs, iconFromItemDefs } from '../src/item-icons';
import { parsePriceFeed } from '../src/skins';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'engine', 'src', 'games', 'case-lineup.ts');
const apiKey = process.env.STEAM_API_KEY?.trim();
if (!apiKey) {
  console.error("STEAM_API_KEY is not set: the pictures come from Steam's item list");
  process.exit(1);
}

/* ---------- the pool: skins with a picture, a price and enough listings ---------- */

const defs = await fetchItemDefs(apiKey, (url, init) => fetch(url, init));
const res = await fetch(DEFAULT_CONFIG.skins.priceUrl, { headers: { accept: 'application/json', 'accept-encoding': 'br, gzip' } });
if (!res.ok) {
  console.error(`price feed: HTTP ${res.status}`);
  process.exit(1);
}
const feed = parsePriceFeed(await res.json());
interface Skin { name: string; cents: number; value: number }
const seen = new Set<string>();
const pool: Skin[] = [];
for (const r of feed) {
  if (r.volume < DEFAULT_CONFIG.skins.minVolume || r.price < 1) continue;
  const key = r.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (seen.has(key) || !iconFromItemDefs(defs, r.name)) continue;
  seen.add(key);
  pool.push({ name: r.name, cents: r.price, value: Math.round(r.price * ITEM_VALUE_BOOST) });
}
pool.sort((a, b) => a.value - b.value);
console.log(`${defs.length} item definitions, ${feed.length} prices → ${pool.length} skins with picture, price and ≥ ${DEFAULT_CONFIG.skins.minVolume} listings`);
const minValue = pool[0].value;
const maxValue = pool[pool.length - 1].value;

/* ---------- picking items: one near each target value, spread across the crates ---------- */

const used = new Map<string, number>();
function pick(targets: number[]): Skin[] {
  const out: Skin[] = [];
  for (const t of targets) {
    let best = pool[0];
    let bestScore = Infinity;
    for (const s of pool) {
      if (out.includes(s)) continue;
      const score = Math.abs(Math.log(s.value / t)) + 0.35 * (used.get(s.name) ?? 0);
      if (score < bestScore) { best = s; bestScore = score; }
    }
    out.push(best);
    used.set(best.name, (used.get(best.name) ?? 0) + 1);
  }
  return out.sort((a, b) => a.value - b.value);
}

/**
 * Integer weights (about W in total) with Σ w·v / Σ w in (lo, hi]: chances shaped like v^-a, a found by bisection,
 * then single tickets added to the cheapest item (lowers the EV) or the cheapest item above hi (raises it).
 */
function solve(values: number[], lo: number, hi: number, W = 100_000): number[] {
  const target = (lo + hi) / 2;
  const evAt = (a: number) => {
    const p = values.map((v) => v ** -a);
    const s = p.reduce((x, y) => x + y, 0);
    return p.reduce((x, pi, i) => x + pi * values[i], 0) / s;
  };
  let a0 = -3;
  let a1 = 6;
  for (let k = 0; k < 200; k++) { const m = (a0 + a1) / 2; if (evAt(m) > target) a0 = m; else a1 = m; }
  const p = values.map((v) => v ** -a0);
  const s = p.reduce((x, y) => x + y, 0);
  const w = p.map((pi) => Math.max(1, Math.round((pi / s) * W)));
  const up = values.findIndex((v) => v > hi);
  if (up < 0 || values[0] > lo) throw new Error(`no solution for ${values.join(', ')} in (${lo}, ${hi}]`);
  for (let k = 0; k < 5_000_000; k++) {
    const sw = w.reduce((x, y) => x + y, 0);
    const e = w.reduce((x, wi, i) => x + wi * values[i], 0) / sw;
    if (e > lo && e <= hi) return w;
    w[e > hi ? 0 : up]++;
  }
  throw new Error('weights did not converge');
}

/* ---------- the twenty crates ---------- */

// target values as multiples of the crate price, common to rare; clamped to what the market has
const SHAPE = [0.15, 0.3, 0.5, 0.75, 1.4, 3, 8, 25];
const crates: { def: CaseDef; cents: number[] }[] = [];
for (const c of SAMPLE_CASES) {
  const price = priceCase(c);
  let items = pick(SHAPE.map((r) => Math.min(maxValue, Math.max(minValue, r * price))));
  // a crate needs something worth more than its price to pay back 93 %
  if (items[items.length - 1].value <= price) {
    const top = pool.find((s) => s.value > price * 1.2 && !items.includes(s)) ?? pool[pool.length - 1];
    items = [...items.slice(0, -1), top].sort((a, b) => a.value - b.value);
  }
  // EV in ((price − 1)·0.93, price·0.93] and RTP > 92.99 %: the price rounds up to exactly `price`
  const lo = Math.max((price - 1) * (1 - EDGE.cases), price * 0.9299);
  const hi = price * (1 - EDGE.cases);
  const w = solve(items.map((i) => i.value), lo, hi);
  const def: CaseDef = { id: c.id, name: c.name, items: items.map((s, i): CaseItem => ({ name: s.name, value: s.value, weight: w[i] })) };
  if (priceCase(def) !== price) throw new Error(`${c.name}: price ${priceCase(def)} ≠ ${price}`);
  crates.push({ def, cents: items.map((s) => s.cents) });
  console.log(`${c.name.padEnd(16)} ${String(price).padStart(6)} Scrap  RTP ${((caseEv(def) / price) * 100).toFixed(3)} %  ${items.map((s) => s.name).join(' · ')}`);
}

/* ---------- the daily Scrap Crate: the same expected value as before, real skins ---------- */

const dailyEv = DAILY_LINEUP.reduce((s, i) => s + i.value * i.weight, 0) / DAILY_LINEUP.reduce((s, i) => s + i.weight, 0);
const dailyItems = pick([minValue, minValue * 1.5, minValue * 3, minValue * 10, minValue * 80, Math.min(maxValue, minValue * 1500)]);
const dailyW = solve(dailyItems.map((s) => s.value), dailyEv * 0.995, dailyEv);
console.log(`Scrap Crate      EV ${dailyEv.toFixed(2)} Scrap  ${dailyItems.map((s) => s.name).join(' · ')}`);

/* ---------- write ---------- */

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const row = (i: CaseItem, cents: number, indent: string) => `${indent}{ name: ${JSON.stringify(i.name)}, value: ${i.value}, weight: ${i.weight} }, // ${usd(cents)}`;
writeFileSync(OUT, `/**
 * The crate line-up, written by \`npm run build-crates\` (platform/server/tools/build-crates.ts) on ${new Date().toISOString().slice(0, 10)}.
 * Only real Rust skins with a picture. value = market price × ITEM_VALUE_BOOST (${ITEM_VALUE_BOOST}) in Scrap
 * (100 Scrap = 1 $); the comment is the market price it was taken from. Do not edit by hand: re-run the tool.
 */
import type { CaseDef, CaseItem } from './cases';

export const CASE_LINEUP: CaseDef[] = [
${crates.map(({ def, cents }) => `  {
    id: ${JSON.stringify(def.id)},
    name: ${JSON.stringify(def.name)},
    items: [
${def.items.map((i, k) => row(i, cents[k], '      ')).join('\n')}
    ],
  },`).join('\n')}
];

/** The daily Scrap Crate (server rewards.ts). */
export const DAILY_LINEUP: CaseItem[] = [
${dailyItems.map((s, k) => row({ name: s.name, value: s.value, weight: dailyW[k] }, s.cents, '  ')).join('\n')}
];
`);
console.log('engine/src/games/case-lineup.ts written');
