/**
 * Item pictures: the Steam Community Market icon of the item with the same name, shown straight from Steam's
 * image CDN, or the same picture from Facepunch's file host (`fp:<itemdefid>`, see FP_ICON). Only the hash or
 * id is kept, no image is stored or bundled. Base items that are not sold on the market (Rope, Bandage,
 * Assault Rifle, …) have none and keep their drawing in the web client.
 *
 * Where a hash comes from, first match wins:
 *   item_icons rows    looked up at run time by the leader, for names the seed lacks (crates an operator adds,
 *                      skins listed later). A miss is stored as NULL and asked again after a week.
 *   ITEM_ICON_SEED     the built-in crates, written by `npm run item-icons` (tools/item-icons.ts) from Steam's
 *                      item list (needs STEAM_API_KEY) or the market.
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
/**
 * The other kind of icon: `fp:<itemdefid>`, the item's picture on Facepunch's file host
 * (files.facepunch.com/rust/icons/inventory/rust/<id>_large.png), taken from Steam's official item list for Rust
 * (IGameInventory/GetItemDefArchive). Those are the same pictures the market shows.
 */
export const FP_ICON = /^fp:\d{1,10}$/;
export const isItemIcon = (v: unknown): v is string => typeof v === 'string' && (ICON_HASH.test(v) || FP_ICON.test(v));
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
  'Frostbite Facemask': 'Frostbite', // the Metal Facemask skin is called just "Frostbite"
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

export interface MarketRow { name: string; icon: string; price: number | null; listings: number }

/** One page of the market search (norender=1) → its listings: name, icon, lowest price (US cents), listings. */
export function parseMarketPage(json: unknown): { total: number; size: number; rows: MarketRow[] } {
  const j = json as { success?: unknown; total_count?: unknown; results?: unknown } | null;
  if (!j || j.success === false || !Array.isArray(j.results)) throw new Error('market search: unexpected answer');
  const rows: MarketRow[] = [];
  for (const r of j.results as { name?: unknown; hash_name?: unknown; sell_price?: unknown; sell_listings?: unknown; asset_description?: { icon_url?: unknown } }[]) {
    const name = typeof r?.hash_name === 'string' ? r.hash_name : typeof r?.name === 'string' ? r.name : '';
    const icon = r?.asset_description?.icon_url;
    if (!name || name.length > 200 || typeof icon !== 'string' || !ICON_HASH.test(icon)) continue;
    const price = Number(r.sell_price);
    rows.push({ name, icon, price: Number.isFinite(price) && price > 0 ? Math.round(price) : null, listings: Math.max(0, Math.floor(Number(r.sell_listings) || 0)) });
  }
  return { total: Math.max(0, Math.floor(Number(j.total_count) || 0)), size: j.results.length, rows };
}

/** The icon of the catalogue entry with the item's name (case, spaces and dashes aside). */
export function iconFromCatalog(rows: MarketRow[], name: string): string | null {
  const want = norm(name);
  return rows.find((r) => norm(r.name) === want)?.icon ?? null;
}

/** One item definition of Steam's item list for Rust (GetItemDefArchive); only the fields read here. */
export interface ItemDef { itemdefid?: unknown; name?: unknown; market_hash_name?: unknown; market_name?: unknown; marketable?: unknown; icon_url?: unknown; icon_url_large?: unknown }

const FP_PICTURE = /^https:\/\/files\.facepunch\.com\/rust\/icons\/inventory\/rust\/(\d{1,10})_(?:small|large)\.png(?:\?\d*)?$/;

/**
 * Steam's item list → `fp:<itemdefid>` of the definition with the item's name (case, spaces and dashes aside), when
 * its picture lies on Facepunch's file host. Marketable definitions win over others of the same name (old
 * duplicates), then the lowest id.
 */
export function iconFromItemDefs(defs: ItemDef[], name: string): string | null {
  const want = norm(name);
  let best: { id: number; market: boolean } | null = null;
  for (const d of defs) {
    if (![d?.name, d?.market_hash_name, d?.market_name].some((n) => typeof n === 'string' && norm(n) === want)) continue;
    const pic = typeof d.icon_url_large === 'string' ? d.icon_url_large : d.icon_url;
    const m = typeof pic === 'string' ? FP_PICTURE.exec(pic) : null;
    if (!m || String(d.itemdefid) !== m[1]) continue;
    const cand = { id: Number(m[1]), market: String(d.marketable).toLowerCase() === 'true' };
    if (!best || (cand.market && !best.market) || (cand.market === best.market && cand.id < best.id)) best = cand;
  }
  return best ? `fp:${best.id}` : null;
}

export const ITEM_DEF_META_URL = 'https://api.steampowered.com/IInventoryService/GetItemDefMeta/v1/?key={key}&appid=252490';
export const ITEM_DEF_ARCHIVE_URL = 'https://api.steampowered.com/IGameInventory/GetItemDefArchive/v1/?appid=252490&digest={digest}';

/** Steam's official item list for Rust: two requests with a Steam Web API key, no market pages. */
export async function fetchItemDefs(apiKey: string, fetchFn: Fetch): Promise<ItemDef[]> {
  const meta = await fetchFn(ITEM_DEF_META_URL.replace('{key}', encodeURIComponent(apiKey)), { method: 'GET', headers: { accept: 'application/json' } });
  if (!meta.ok) throw new Error(`item list digest: HTTP ${meta.status ?? '?'}${meta.status === 403 ? ' (check STEAM_API_KEY)' : ''}`);
  const digest = (JSON.parse(await meta.text()) as { response?: { digest?: unknown } })?.response?.digest;
  if (typeof digest !== 'string' || !/^[0-9A-Fa-f]{16,128}$/.test(digest)) throw new Error('item list digest: unexpected answer');
  const res = await fetchFn(ITEM_DEF_ARCHIVE_URL.replace('{digest}', digest), { method: 'GET', headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`item list: HTTP ${res.status ?? '?'}`);
  const defs = JSON.parse((await res.text()).replace(/\0+$/, '')) as unknown; // the archive ends in a NUL byte
  if (!Array.isArray(defs)) throw new Error('item list: unexpected answer');
  return defs as ItemDef[];
}

/**
 * An item's market page (steamcommunity.com/market/listings/252490/<name>) → the icon in its og:image tag, when the
 * page is about that item. Pages for names the market does not know have neither the title nor the picture.
 */
export function pickListingIcon(html: string, name: string): string | null {
  const title = /<title>([^<]*?) - Steam Community Market<\/title>/.exec(html)?.[1] ?? '';
  const icon = /<meta property="og:image" content="https:\/\/[\w.-]*steamstatic\.com\/economy\/image\/([\w-]+)/.exec(html)?.[1] ?? null;
  return norm(title.replace(/&amp;/g, '&').replace(/&#39;/g, "'")) === norm(name) && icon && ICON_HASH.test(icon) ? icon : null;
}

export const LISTING_URL = 'https://steamcommunity.com/market/listings/252490/{name}';

export class MarketBusy extends Error {}

export async function lookupListingIcon(name: string, fetchFn: Fetch): Promise<string | null> {
  const res = await fetchFn(LISTING_URL.replace('{name}', encodeURIComponent(name)), { method: 'GET', headers: { accept: 'text/html' } });
  if (res.status === 429) throw new MarketBusy('market page: rate limited');
  if (!res.ok) throw new Error(`market page: HTTP ${res.status ?? '?'}`);
  return pickListingIcon(await res.text(), name);
}

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
