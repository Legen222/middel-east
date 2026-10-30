/**
 * Item pictures: the Steam Community Market icon of the item with the same name, shown straight from Steam's
 * image CDN (only the icon hash is kept, no image is stored or bundled). Base items that are not sold on the
 * market (Rope, Bandage, Assault Rifle, …) have none and keep their drawing in the web client.
 *
 * Where a hash comes from, first match wins:
 *   item_icons rows    looked up at run time by the leader, for names the seed lacks (crates an operator adds,
 *                      skins listed later). A miss is stored as NULL and asked again after a week.
 *   ITEM_ICON_SEED     the built-in crates, written by `npm run item-icons` (tools/item-icons.ts).
 * Sets and collections show their lead item (ALIASES).
 */

import { listCases } from './cases';
import type { Config } from './config';
import type { DB } from './db';
import { ITEM_ICON_SEED } from './item-icon-seed';
import { DAILY_CASE } from './rewards';
import type { Fetch } from './steam';

/** Steam economy icon hashes are long URL-safe strings. */
export const ICON_HASH = /^[\w-]{16,1000}$/;
export const MISS_RETRY_MS = 7 * 86_400_000;

/** Bundles shown with the picture of their lead item. */
export const ALIASES: Record<string, string> = {
  'Glory Set': 'Glory AK47',
  'Glory AK': 'Glory AK47',
  'Tempered Set': 'Tempered AK47',
  'Punishment Set': 'Punishment Mask',
  'Whiteout Set': 'Whiteout Facemask',
  'Desert Raiders Set': 'Desert Raiders Chest Plate',
  'Forest Raiders Set': 'Forest Raiders Roadsign Vest',
};

/** "AK-47 From Hell" and "AK47 from Hell" are the same listing. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Market search answer → the icon of the listing whose name is the item name (case, spaces and dashes aside). */
export function pickMarketIcon(json: unknown, name: string): string | null {
  const j = json as { success?: unknown; results?: unknown } | null;
  if (!j || j.success === false || !Array.isArray(j.results)) throw new Error('market search: unexpected answer');
  const want = norm(name);
  for (const r of j.results as { name?: unknown; hash_name?: unknown; asset_description?: { icon_url?: unknown } }[]) {
    const icon = r?.asset_description?.icon_url;
    const same = [r?.hash_name, r?.name].some((n) => typeof n === 'string' && norm(n) === want);
    if (same && typeof icon === 'string' && ICON_HASH.test(icon)) return icon;
  }
  return null;
}

export class MarketBusy extends Error {}

export async function lookupMarketIcon(name: string, searchUrl: string, fetchFn: Fetch): Promise<string | null> {
  const res = await fetchFn(searchUrl.replace('{query}', encodeURIComponent(name)), { method: 'GET', headers: { accept: 'application/json' } });
  if (res.status === 429) throw new MarketBusy('market search: rate limited');
  if (!res.ok) throw new Error(`market search: HTTP ${res.status ?? '?'}`);
  return pickMarketIcon(JSON.parse(await res.text()), name);
}

/** Every item name a player can see in a crate right now: enabled crates and the daily Scrap Crate. */
async function catalogNames(db: DB): Promise<string[]> {
  const cases = await listCases(db);
  return [...new Set([...cases.flatMap((c) => c.items.map((i) => i.name)), ...DAILY_CASE.items.map((i) => i.name)])];
}

async function stored(db: DB, names: string[]): Promise<Map<string, { icon: string | null; at: number }>> {
  const out = new Map<string, { icon: string | null; at: number }>();
  for (let i = 0; i < names.length; i += 300) {
    const chunk = names.slice(i, i + 300);
    const rows = (await db.prepare(`SELECT name, icon, updated_at FROM item_icons WHERE name IN (${chunk.map(() => '?').join(', ')})`).all(...chunk)) as { name: string; icon: string | null; updated_at: number }[];
    for (const r of rows) out.set(r.name, { icon: r.icon, at: Number(r.updated_at) });
  }
  return out;
}

/** Item name → icon hash for every crate item that has one (sent with /config). */
export async function itemIcons(db: DB): Promise<Record<string, string>> {
  const names = await catalogNames(db);
  const rows = await stored(db, [...new Set(names.map((n) => ALIASES[n] ?? n))]);
  const out: Record<string, string> = {};
  for (const n of names) {
    const key = ALIASES[n] ?? n;
    const icon = rows.get(key)?.icon ?? ITEM_ICON_SEED[key];
    if (icon) out[n] = icon;
  }
  return out;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Looks up names that have no icon yet: at most `max` market searches with a pause between them (the search is
 * rate-limited). Each answer is stored right away; the first error ends the pass and is thrown.
 */
export async function resolveItemIcons(db: DB, cfg: Config, fetchFn: Fetch, now: number, max = 6, pauseMs = 4000): Promise<{ asked: number; found: number }> {
  const names = [...new Set((await catalogNames(db)).map((n) => ALIASES[n] ?? n))].filter((n) => !ITEM_ICON_SEED[n]);
  const rows = await stored(db, names);
  const todo = names.filter((n) => { const r = rows.get(n); return !r || (r.icon === null && now - r.at >= MISS_RETRY_MS); }).slice(0, max);
  let asked = 0, found = 0;
  for (const name of todo) {
    if (asked) await pause(pauseMs);
    asked++;
    const icon = await lookupMarketIcon(name, cfg.itemIcons.searchUrl, fetchFn);
    if (icon) found++;
    await db.prepare(`INSERT INTO item_icons (name, icon, source, updated_at) VALUES (?, ?, 'market', ?)
      ON CONFLICT (name) DO UPDATE SET icon = excluded.icon, source = excluded.source, updated_at = excluded.updated_at`).run(name, icon, now);
  }
  return { asked, found };
}
