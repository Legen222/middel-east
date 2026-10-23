/**
 * Skin rail (real-money mode only; SKINS=true and a licence, see main.ts).
 *
 * Deposit
 *   1. The player picks items from their Steam inventory. POST /deposits stores a 'requested' row with a
 *      price snapshot and a random security code.
 *   2. The bot process (bot-main.ts) sends a trade offer that only asks for those items and carries the code.
 *   3. The player compares the code in Steam and accepts.
 *   4. The bot sees the offer as accepted and credits the balance. The status guard in the same transaction
 *      makes the credit happen once, however often the offer is polled.
 * Withdrawal (beta: sent by hand)
 *   The player picks items from the bot's stock. The balance is debited and the items reserved; a 'pending'
 *   row waits for an operator, who sends the offer in Steam and marks it sent, or cancels it (refund).
 * Ledger: both directions move Scrap between the player and house:skins, the stock's counterpart.
 */

import { randomBytes, randomInt } from 'node:crypto';

import type { UserRow } from './accounts';
import { flagDeposit, withdrawalCheck } from './compliance';
import { type Config, MF_PER_FRAG } from './config';
import { type DB, audit, tx } from './db';
import { fail } from './errors';
import { checkDeposit } from './rg';
import type { Fetch } from './steam';
import { transfer, userAccount } from './wallet';

export const SKINS = 'house:skins';
export const RUST_APPID = 252490;
/** Prices older than this are not used; the price job runs every 10 minutes. */
export const PRICE_MAX_AGE_MS = 6 * 3_600_000;
const INVENTORY_CACHE_MS = 60_000;
const INVENTORY_REFRESH_MS = 15_000;
const OPEN_DEPOSIT = "('requested', 'sent')";

const f = (mf: number | string) => Number(mf) / MF_PER_FRAG;
const skinsOn = (cfg: Config) => { if (!cfg.skins.enabled || cfg.demo) fail('skins_off', 'Skin deposits and withdrawals are not available.', 403); };

/* ---------- prices ---------- */

export interface PriceRow { name: string; price: number; volume: number }

/** Skinport's /v1/items, or any array of { market_hash_name, suggested_price | price (USD), quantity | volume }. Prices in Scrap. */
export function parsePriceFeed(json: unknown): PriceRow[] {
  if (!Array.isArray(json)) throw new Error('price feed: expected an array');
  const out: PriceRow[] = [];
  for (const r of json as Record<string, unknown>[]) {
    const name = typeof r?.market_hash_name === 'string' ? r.market_hash_name.trim() : '';
    // the lower of the suggested and the median listing price, so a single thin listing cannot inflate it
    const usd = [r.suggested_price, r.median_price, r.price].filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    if (!name || name.length > 200 || !usd.length) continue;
    const vol = Number(r.quantity ?? r.volume ?? 0);
    out.push({ name, price: Math.round(Math.min(...usd) * 100), volume: Number.isFinite(vol) ? Math.max(0, Math.floor(vol)) : 0 });
  }
  return out;
}

export async function syncPrices(db: DB, cfg: Config, fetchFn: Fetch, now: number): Promise<number> {
  const res = await fetchFn(cfg.skins.priceUrl, { method: 'GET', headers: { accept: 'application/json', 'accept-encoding': 'br, gzip' } });
  if (!res.ok) throw new Error(`price feed: HTTP ${res.status ?? '?'}`);
  const rows = parsePriceFeed(JSON.parse(await res.text()));
  const source = new URL(cfg.skins.priceUrl).hostname;
  await tx(db, async (db) => {
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      await db.prepare(`INSERT INTO item_prices (market_hash_name, price, volume, source, updated_at) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?)').join(', ')}
        ON CONFLICT (market_hash_name) DO UPDATE SET price = excluded.price, volume = excluded.volume, source = excluded.source, updated_at = excluded.updated_at`)
        .run(...chunk.flatMap((r) => [r.name, r.price, r.volume, source, now]));
    }
  });
  return rows.length;
}

async function prices(db: DB, names: string[], now: number): Promise<Map<string, { price: number; volume: number }>> {
  const out = new Map<string, { price: number; volume: number }>();
  const uniq = [...new Set(names)];
  for (let i = 0; i < uniq.length; i += 300) {
    const chunk = uniq.slice(i, i + 300);
    const rows = (await db.prepare(`SELECT market_hash_name AS n, price, volume FROM item_prices WHERE updated_at >= ? AND market_hash_name IN (${chunk.map(() => '?').join(', ')})`)
      .all(now - PRICE_MAX_AGE_MS, ...chunk)) as { n: string; price: number; volume: number }[];
    for (const r of rows) out.set(r.n, { price: Number(r.price), volume: Number(r.volume) });
  }
  return out;
}

/* ---------- player inventory ---------- */

export interface SteamItem { assetId: string; name: string; icon: string | null; color: string | null; tradable: boolean }

/** Rust items of a Steam inventory (assets joined with their descriptions). */
export function parseInventory(json: unknown): SteamItem[] {
  const j = json as { success?: number | boolean; assets?: Record<string, string>[]; descriptions?: Record<string, unknown>[] } | null;
  if (!j || !j.success) throw new Error('inventory: unsuccessful');
  const desc = new Map((j.descriptions ?? []).map((d) => [`${d.classid}_${d.instanceid}`, d]));
  const out: SteamItem[] = [];
  for (const a of j.assets ?? []) {
    const d = desc.get(`${a.classid}_${a.instanceid}`);
    if (!d || !/^\d{1,20}$/.test(String(a.assetid)) || String(a.amount ?? '1') !== '1') continue;
    const icon = typeof d.icon_url === 'string' && /^[\w-]+$/.test(d.icon_url) ? d.icon_url : null;
    const color = typeof d.name_color === 'string' && /^[0-9a-f]{6}$/i.test(d.name_color) ? d.name_color : null;
    out.push({ assetId: String(a.assetid), name: String(d.market_hash_name ?? d.name ?? ''), icon, color, tradable: Number(d.tradable) === 1 });
  }
  return out;
}

export interface InventoryItem extends SteamItem { price: number | null; value: number | null; reason: string | null }

export class SkinService {
  private cache = new Map<string, { at: number; items: SteamItem[] }>();
  constructor(private db: DB, private cfg: Config, private fetchFn: Fetch) {}

  private async steamItems(steamId: string, refresh: boolean, now: number): Promise<SteamItem[]> {
    const hit = this.cache.get(steamId);
    if (hit && now - hit.at < (refresh ? INVENTORY_REFRESH_MS : INVENTORY_CACHE_MS)) return hit.items;
    const res = await this.fetchFn(this.cfg.skins.inventoryUrl.replace('{steamid}', steamId), { method: 'GET', headers: { accept: 'application/json' } }).catch(() => null);
    if (res?.status === 403) fail('inventory_private', 'Your Steam inventory is private. Set it to public in your Steam privacy settings and try again.', 409);
    if (res?.status === 429) fail('inventory_busy', 'Steam is limiting inventory requests right now. Please try again in a minute.', 503);
    let items: SteamItem[];
    try {
      if (!res?.ok) throw new Error('http');
      items = parseInventory(JSON.parse(await res.text()));
    } catch {
      return fail('inventory_unavailable', 'Steam did not return your inventory. Please try again shortly.', 503);
    }
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(steamId, { at: now, items });
    return items;
  }

  /** The player's Rust items with price, credit and why an item cannot be deposited. */
  async inventory(user: UserRow, refresh: boolean, now: number): Promise<{ items: InventoryItem[]; botOnline: boolean }> {
    skinsOn(this.cfg);
    if (!user.steam_id) fail('steam_required', 'Sign in with Steam to deposit skins.', 403);
    const items = await this.steamItems(user.steam_id!, refresh, now);
    const p = await prices(this.db, items.map((i) => i.name), now);
    const pending = new Set(((await this.db.prepare(`SELECT i.asset_id FROM skin_deposit_items i JOIN skin_deposits d ON d.id = i.deposit_id
      WHERE d.user_id = ? AND d.status IN ${OPEN_DEPOSIT}`).all(user.id)) as { asset_id: string }[]).map((r) => r.asset_id));
    const s = this.cfg.skins;
    const out = items.map((i): InventoryItem => {
      const pr = p.get(i.name);
      const reason = !i.tradable ? 'Not tradable yet' : pending.has(i.assetId) ? 'In an open deposit' : !pr ? 'No price' : pr.price < s.minItemFrags ? 'Below the minimum'
        : pr.volume < s.minVolume ? 'Too rare to price' : null;
      return { ...i, price: pr ? pr.price : null, value: pr ? Math.floor(pr.price * MF_PER_FRAG * s.depositRate) / MF_PER_FRAG : null, reason };
    }).sort((a, b) => Number(a.reason !== null) - Number(b.reason !== null) || (b.price ?? 0) - (a.price ?? 0));
    return { items: out, botOnline: await botOnline(this.db, now) };
  }

  async createDeposit(user: UserRow, assetIds: unknown, now: number) {
    skinsOn(this.cfg);
    const s = this.cfg.skins;
    if (!user.steam_id) fail('steam_required', 'Sign in with Steam to deposit skins.', 403);
    const tradeUrl = (user as UserRow & { trade_url: string | null }).trade_url;
    if (!tradeUrl) fail('trade_url_required', 'Add your Steam trade URL in your profile first.', 409);
    if (s.kycBeforeDeposit && user.kyc_level < 1) fail('kyc_required', 'Please verify your identity before your first deposit.', 403);
    if (!Array.isArray(assetIds) || !assetIds.length || assetIds.length > s.maxItems || new Set(assetIds).size !== assetIds.length) {
      fail('invalid_items', `Pick 1 to ${s.maxItems} different items.`);
    }
    const open = () => fail('deposit_open', 'You already have an open deposit. Accept or decline that offer in Steam first.', 409);
    if (await this.db.prepare(`SELECT 1 FROM skin_deposits WHERE user_id = ? AND status IN ${OPEN_DEPOSIT}`).get(user.id)) open();
    if (!(await botOnline(this.db, now))) fail('bot_offline', 'The trade bot is offline right now. Please try again in a few minutes.', 503);
    const { items } = await this.inventory(user, false, now);
    const byId = new Map(items.map((i) => [i.assetId, i]));
    const picked = (assetIds as unknown[]).map((id) => {
      const it = byId.get(String(id));
      if (!it) return fail('invalid_items', 'An item is no longer in your inventory. Refresh and try again.', 409);
      if (it.reason) return fail('invalid_items', `${it.name}: ${it.reason.toLowerCase()}.`, 409);
      return { ...it, mf: Math.floor(it.price! * MF_PER_FRAG * s.depositRate) };
    });
    const value = picked.reduce((a, i) => a + i.mf, 0);
    return tx(this.db, async (db) => {
      if (await db.prepare(`SELECT 1 FROM skin_deposits WHERE user_id = ? AND status IN ${OPEN_DEPOSIT}`).get(user.id)) open(); // two tabs at once
      await checkDeposit(db, user.id, value, now);
      const id = randomBytes(8).toString('hex');
      const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');
      await db.prepare('INSERT INTO skin_deposits (id, user_id, status, security_code, trade_url, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, user.id, 'requested', code, tradeUrl, value, now, now);
      for (const i of picked) {
        await db.prepare('INSERT INTO skin_deposit_items (deposit_id, asset_id, market_hash_name, icon_url, value) VALUES (?, ?, ?, ?, ?)').run(id, i.assetId, i.name, i.icon, i.mf);
      }
      await audit(db, user.id, 'skin_deposit_request', { id, items: picked.length, value }, now);
      return (await depositsOf(db, user.id, id))[0];
    });
  }

  deposits(userId: string) { return depositsOf(this.db, userId); }

  /** The bot's tradable stock with current prices. */
  async shop(q: string, now: number) {
    skinsOn(this.cfg);
    const like = `%${q.trim().toLowerCase().replace(/[%_]/g, '')}%`;
    const rows = (await this.db.prepare(`SELECT i.asset_id, i.market_hash_name AS name, i.icon_url, p.price FROM skin_items i JOIN item_prices p ON p.market_hash_name = i.market_hash_name
      WHERE i.status = 'in_stock' AND i.tradable = 1 AND p.updated_at >= ? AND LOWER(i.market_hash_name) LIKE ? ORDER BY p.price DESC, i.asset_id LIMIT 300`)
      .all(now - PRICE_MAX_AGE_MS, like)) as { asset_id: string; name: string; icon_url: string | null; price: number }[];
    return rows.map((r) => ({ assetId: r.asset_id, name: r.name, icon: r.icon_url, price: Math.ceil(Number(r.price) * MF_PER_FRAG * this.cfg.skins.withdrawRate) / MF_PER_FRAG }));
  }

  async createWithdrawal(user: UserRow, assetIds: unknown, now: number) {
    skinsOn(this.cfg);
    const s = this.cfg.skins;
    const tradeUrl = (user as UserRow & { trade_url: string | null }).trade_url;
    if (!user.steam_id || !tradeUrl) fail('trade_url_required', 'Sign in with Steam and add your trade URL first.', 409);
    if (!Array.isArray(assetIds) || !assetIds.length || assetIds.length > s.maxItems || new Set(assetIds).size !== assetIds.length) {
      fail('invalid_items', `Pick 1 to ${s.maxItems} different items.`);
    }
    const ids = (assetIds as unknown[]).map(String);
    return tx(this.db, async (db) => {
      const rows = (await db.prepare(`SELECT i.asset_id, i.market_hash_name AS name, p.price FROM skin_items i JOIN item_prices p ON p.market_hash_name = i.market_hash_name
        WHERE i.status = 'in_stock' AND i.tradable = 1 AND p.updated_at >= ? AND i.asset_id IN (${ids.map(() => '?').join(', ')})`).all(now - PRICE_MAX_AGE_MS, ...ids)) as
        { asset_id: string; name: string; price: number }[];
      if (rows.length !== ids.length) fail('invalid_items', 'An item was just taken or has no current price. Refresh and try again.', 409);
      const value = rows.reduce((a, r) => a + Math.ceil(Number(r.price) * MF_PER_FRAG * s.withdrawRate), 0);
      const check = await withdrawalCheck(db, this.cfg, user, value);
      if (!check.allowed) fail('withdrawal_blocked', check.reasons.map((r) => r.message).join(' '), 403, { reasons: check.reasons });
      const id = randomBytes(8).toString('hex');
      for (const r of rows) {
        const res = await db.prepare("UPDATE skin_items SET status = 'reserved', withdrawal_id = ?, updated_at = ? WHERE asset_id = ? AND status = 'in_stock'").run(id, now, r.asset_id);
        if (res.changes !== 1) fail('invalid_items', 'An item was just taken. Refresh and try again.', 409);
      }
      await transfer(db, userAccount(user.id), SKINS, value, 'withdrawal', id, now);
      await db.prepare('INSERT INTO skin_withdrawals (id, user_id, status, value, trade_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, user.id, 'pending', value, tradeUrl, now, now);
      await audit(db, user.id, 'skin_withdrawal_request', { id, items: rows.length, value }, now);
      return (await withdrawalsOf(db, user.id, id))[0];
    });
  }

  withdrawals(userId: string) { return withdrawalsOf(this.db, userId); }

  /** The player cancels a withdrawal nobody has sent yet; the Scrap come back. */
  cancelWithdrawal(userId: string, id: string, now: number) {
    return closeWithdrawal(this.db, id, { userId }, 'canceled', null, 'Canceled by the player', now);
  }
}

async function depositsOf(db: DB, userId: string, id?: string) {
  const rows = (await db.prepare(`SELECT id, status, offer_id, security_code, value, reason, created_at, updated_at FROM skin_deposits WHERE user_id = ?${id ? ' AND id = ?' : ''}
    ORDER BY created_at DESC LIMIT 20`).all(...(id ? [userId, id] : [userId]))) as { id: string; status: string; offer_id: string | null; security_code: string; value: number; reason: string | null; created_at: number; updated_at: number }[];
  const items = rows.length ? (await db.prepare(`SELECT deposit_id, asset_id, market_hash_name AS name, icon_url, value FROM skin_deposit_items WHERE deposit_id IN (${rows.map(() => '?').join(', ')})`)
    .all(...rows.map((r) => r.id))) as { deposit_id: string; asset_id: string; name: string; icon_url: string | null; value: number }[] : [];
  return rows.map((r) => ({
    id: r.id, status: r.status, offerId: r.offer_id, securityCode: r.security_code, value: f(r.value), reason: r.reason, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
    offerUrl: r.offer_id ? `https://steamcommunity.com/tradeoffer/${r.offer_id}/` : null,
    items: items.filter((i) => i.deposit_id === r.id).map((i) => ({ assetId: i.asset_id, name: i.name, icon: i.icon_url, value: f(i.value) })),
  }));
}

async function withdrawalsOf(db: DB, userId: string | null, id?: string, status?: string) {
  const where = [userId ? 'w.user_id = ?' : '1 = 1', id ? 'w.id = ?' : '', status ? 'w.status = ?' : ''].filter(Boolean).join(' AND ');
  const rows = (await db.prepare(`SELECT w.*, u.display_name AS name, u.steam_id, h.display_name AS handler FROM skin_withdrawals w JOIN users u ON u.id = w.user_id
    LEFT JOIN users h ON h.id = w.handled_by WHERE ${where}
    ORDER BY w.created_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 100`).all(...[userId, id, status].filter((v): v is string => Boolean(v)))) as
    { id: string; user_id: string; status: string; value: number; trade_url: string; offer_id: string | null; handled_by: string | null; note: string | null; created_at: number; updated_at: number; name: string; steam_id: string | null; handler: string | null }[];
  const items = rows.length ? (await db.prepare(`SELECT withdrawal_id, asset_id, market_hash_name AS name, icon_url FROM skin_items WHERE withdrawal_id IN (${rows.map(() => '?').join(', ')})`)
    .all(...rows.map((r) => r.id))) as { withdrawal_id: string; asset_id: string; name: string; icon_url: string | null }[] : [];
  return rows.map((r) => ({
    id: r.id, status: r.status, value: f(r.value), offerId: r.offer_id, note: r.note, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
    ...(userId ? {} : { userId: r.user_id, name: r.name, steamId: r.steam_id, tradeUrl: r.trade_url, handledBy: r.handler ?? r.handled_by }),
    items: items.filter((i) => i.withdrawal_id === r.id).map((i) => ({ assetId: i.asset_id, name: i.name, icon: i.icon_url })),
  }));
}

/** Sent (items gone to the player) or canceled (items back in stock, Scrap refunded). Only from 'pending'. */
function closeWithdrawal(db: DB, id: string, by: { userId?: string; operatorId?: string }, to: 'sent' | 'canceled', offerId: string | null, note: string | null, now: number) {
  return tx(db, async (db) => {
    const w = (await db.prepare('SELECT user_id, status, value FROM skin_withdrawals WHERE id = ?').get(id)) as { user_id: string; status: string; value: number } | undefined;
    if (!w || (by.userId && w.user_id !== by.userId)) fail('not_found', 'Withdrawal not found.', 404);
    if (w!.status !== 'pending') fail('not_pending', 'This withdrawal was already handled.', 409);
    const res = await db.prepare("UPDATE skin_withdrawals SET status = ?, offer_id = ?, handled_by = ?, note = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
      .run(to, offerId, by.operatorId ?? null, note, now, id);
    if (res.changes !== 1) fail('not_pending', 'This withdrawal was already handled.', 409);
    if (to === 'sent') {
      await db.prepare("UPDATE skin_items SET status = 'withdrawn', updated_at = ? WHERE withdrawal_id = ?").run(now, id);
    } else {
      await db.prepare("UPDATE skin_items SET status = 'in_stock', withdrawal_id = NULL, updated_at = ? WHERE withdrawal_id = ? AND status = 'reserved'").run(now, id);
      await transfer(db, SKINS, userAccount(w!.user_id), Number(w!.value), 'withdrawal', id, now);
    }
    await audit(db, by.operatorId ?? w!.user_id, `skin_withdrawal_${to}`, { id, user: w!.user_id, value: Number(w!.value), offerId, note }, now);
    return (await withdrawalsOf(db, null, id))[0];
  });
}

/* ---------- operators ---------- */

export async function skinsAdmin(db: DB, now: number) {
  const bot = (await db.prepare("SELECT * FROM bot_status WHERE id = 'main'").get()) as { steam_id: string | null; online: number; items: number; message: string | null; heartbeat_at: number } | undefined;
  const stock = (await db.prepare(`SELECT i.status, COUNT(*) AS n, COALESCE(SUM(p.price), 0) AS v FROM skin_items i LEFT JOIN item_prices p ON p.market_hash_name = i.market_hash_name
    GROUP BY i.status`).all()) as { status: string; n: number; v: number }[];
  const pr = (await db.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS t FROM item_prices').get()) as { n: number; t: number | null };
  const deposits = (await db.prepare(`SELECT d.id, d.user_id, u.display_name AS name, d.status, d.offer_id, d.value, d.reason, d.created_at, d.updated_at,
    (SELECT COUNT(*) FROM skin_deposit_items i WHERE i.deposit_id = d.id) AS items FROM skin_deposits d JOIN users u ON u.id = d.user_id ORDER BY d.created_at DESC LIMIT 50`).all()) as
    { id: string; user_id: string; name: string; status: string; offer_id: string | null; value: number; reason: string | null; created_at: number; updated_at: number; items: number }[];
  return {
    bot: bot ? { steamId: bot.steam_id, online: Number(bot.online) === 1 && now - Number(bot.heartbeat_at) < BOT_STALE_MS, items: Number(bot.items), message: bot.message, heartbeatAt: Number(bot.heartbeat_at) } : null,
    stock: Object.fromEntries(stock.map((r) => [r.status, { items: Number(r.n), value: Number(r.v) }])),
    prices: { items: Number(pr.n), updatedAt: pr.t === null ? null : Number(pr.t) },
    pending: await withdrawalsOf(db, null, undefined, 'pending'),
    withdrawals: await withdrawalsOf(db, null),
    deposits: deposits.map((d) => ({ id: d.id, userId: d.user_id, name: d.name, status: d.status, offerId: d.offer_id, value: f(d.value), reason: d.reason, items: Number(d.items), createdAt: Number(d.created_at), updatedAt: Number(d.updated_at) })),
  };
}

export function operatorWithdrawal(db: DB, operatorId: string, id: string, action: unknown, offerId: unknown, note: unknown, now: number) {
  const n = note == null ? null : String(note).trim().slice(0, 300) || null;
  if (action === 'sent') {
    const o = offerId == null || offerId === '' ? null : String(offerId).trim();
    if (o !== null && !/^\d{1,20}$/.test(o)) fail('invalid_offer', 'Offer id: the number from the Steam trade offer link.');
    return closeWithdrawal(db, id, { operatorId }, 'sent', o, n, now);
  }
  if (action === 'cancel') {
    if (!n) fail('reason_required', 'Give the player a reason for the cancellation.');
    return closeWithdrawal(db, id, { operatorId }, 'canceled', null, n, now);
  }
  return fail('invalid_action', 'Action: sent or cancel.');
}

/* ---------- trade bot ---------- */

export const BOT_STALE_MS = 90_000;
export async function botOnline(db: DB, now: number): Promise<boolean> {
  const b = (await db.prepare("SELECT online, heartbeat_at FROM bot_status WHERE id = 'main'").get()) as { online: number; heartbeat_at: number } | undefined;
  return Boolean(b && Number(b.online) === 1 && now - Number(b.heartbeat_at) < BOT_STALE_MS);
}

export type OfferState = 'active' | 'accepted' | 'declined' | 'canceled' | 'expired' | 'invalid' | 'countered' | 'escrow' | 'needs_confirmation';
export interface BotItem { assetId: string; name: string; icon: string | null; tradable: boolean }

/** What the deposit worker needs from a Steam trade bot (steambot.ts; tests use a fake). */
export interface TradeBot {
  steamId(): string | null;
  online(): boolean;
  /** Trade-hold days the partner's account would add (0 = none). Throws when Steam rejects the trade URL. */
  partnerEscrowDays(tradeUrl: string): Promise<number>;
  /** Sends an offer that only asks for these items; returns the offer id. */
  requestItems(tradeUrl: string, assetIds: string[], message: string): Promise<string>;
  /** An offer this bot sent since `since` whose message contains `tag` (recovers from a crash after sending). */
  findOffer(tag: string, since: number): Promise<string | null>;
  offer(offerId: string): Promise<{ state: OfferState; received: BotItem[] | null }>;
  cancel(offerId: string): Promise<void>;
  inventory(): Promise<BotItem[]>;
}

const FINAL: Partial<Record<OfferState, { status: string; reason: string }>> = {
  declined: { status: 'declined', reason: 'You declined the offer.' },
  canceled: { status: 'canceled', reason: 'The offer was canceled.' },
  expired: { status: 'expired', reason: 'The offer expired.' },
  invalid: { status: 'failed', reason: 'The items are no longer available.' },
  countered: { status: 'declined', reason: 'Counter offers are not accepted.' },
};

const errText = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 200);

/**
 * One pass of the deposit worker (bot-main.ts, single instance): heartbeat, send requested offers,
 * settle sent ones, cancel stale ones and, when asked, sync the bot's stock.
 */
export async function botTick(db: DB, cfg: Config, bot: TradeBot, now: number, opts: { syncInventory?: boolean; brand?: string; log?: (l: Record<string, unknown>) => void } = {}): Promise<void> {
  const log = opts.log ?? (() => undefined);
  const beat = (msg: string | null) => db.prepare(`INSERT INTO bot_status (id, steam_id, online, items, message, heartbeat_at) VALUES ('main', ?, ?, COALESCE((SELECT items FROM bot_status WHERE id = 'main'), 0), ?, ?)
    ON CONFLICT (id) DO UPDATE SET steam_id = excluded.steam_id, online = excluded.online, message = excluded.message, heartbeat_at = excluded.heartbeat_at`).run(bot.steamId(), bot.online() ? 1 : 0, msg, now);
  if (!bot.online()) { await beat('Not logged in to Steam'); return; }
  await beat(null);
  const setStatus = (id: string, from: string, status: string, reason: string | null, offerId?: string) =>
    db.prepare(`UPDATE skin_deposits SET status = ?, reason = ?, updated_at = ?${offerId ? ', offer_id = ?' : ''} WHERE id = ? AND status = ?`)
      .run(...([status, reason, now, ...(offerId ? [offerId] : []), id, from] as (string | number | null)[]));

  // 1. requested → sent
  const requested = (await db.prepare("SELECT id, trade_url, security_code, created_at FROM skin_deposits WHERE status = 'requested' ORDER BY created_at LIMIT 5").all()) as
    { id: string; trade_url: string; security_code: string; created_at: number }[];
  for (const d of requested) {
    const tag = `#${d.id}`;
    try {
      if (now - Number(d.created_at) > cfg.skins.offerTtlMs) { await setStatus(d.id, 'requested', 'expired', 'The bot could not send the offer in time.'); continue; }
      const existing = await bot.findOffer(tag, Number(d.created_at));
      if (existing) { await setStatus(d.id, 'requested', 'sent', null, existing); continue; }
      const hold = await bot.partnerEscrowDays(d.trade_url);
      if (hold > 0) {
        await setStatus(d.id, 'requested', 'failed', `Your Steam account has a ${hold}-day trade hold. Use the Steam Guard Mobile Authenticator for 7 days, then try again.`);
        continue;
      }
      const assets = ((await db.prepare('SELECT asset_id FROM skin_deposit_items WHERE deposit_id = ?').all(d.id)) as { asset_id: string }[]).map((r) => r.asset_id);
      const offerId = await bot.requestItems(d.trade_url, assets, `${opts.brand ?? 'SCRAPLINE'} deposit ${tag}. Security code: ${d.security_code}. Accept only if this code matches the one on the site.`);
      await setStatus(d.id, 'requested', 'sent', null, offerId);
      log({ msg: 'deposit offer sent', deposit: d.id, offerId });
    } catch (e) {
      await setStatus(d.id, 'requested', 'failed', `Steam refused the offer: ${errText(e)}`);
      log({ level: 'warn', msg: 'deposit offer failed', deposit: d.id, error: errText(e) });
    }
  }

  // 2. sent → accepted / declined / expired
  const sent = (await db.prepare("SELECT id, user_id, offer_id, value, updated_at FROM skin_deposits WHERE status = 'sent' ORDER BY updated_at LIMIT 20").all()) as
    { id: string; user_id: string; offer_id: string; value: number; updated_at: number }[];
  for (const d of sent) {
    try {
      const st = await bot.offer(d.offer_id);
      if (st.state === 'accepted') {
        const credited = await tx(db, async (db) => {
          const r = await db.prepare("UPDATE skin_deposits SET status = 'accepted', reason = NULL, updated_at = ? WHERE id = ? AND status = 'sent'").run(now, d.id);
          if (r.changes !== 1) return false;
          await transfer(db, SKINS, userAccount(d.user_id), Number(d.value), 'deposit', d.id, now);
          for (const i of st.received ?? []) {
            await db.prepare(`INSERT INTO skin_items (asset_id, market_hash_name, icon_url, tradable, status, deposit_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'in_stock', ?, ?, ?)
              ON CONFLICT (asset_id) DO NOTHING`).run(i.assetId, i.name, i.icon, i.tradable ? 1 : 0, d.id, now, now);
          }
          await audit(db, d.user_id, 'skin_deposit', { id: d.id, offerId: d.offer_id, value: Number(d.value) }, now);
          await flagDeposit(db, cfg, d.user_id, Number(d.value), now);
          return true;
        });
        if (credited) log({ msg: 'deposit credited', deposit: d.id, value: Number(d.value) });
      } else if (FINAL[st.state]) {
        await setStatus(d.id, 'sent', FINAL[st.state]!.status, FINAL[st.state]!.reason);
      } else if (st.state === 'escrow') {
        await db.prepare("UPDATE skin_deposits SET reason = 'Steam is holding this trade.' WHERE id = ? AND status = 'sent'").run(d.id);
      } else if (now - Number(d.updated_at) > cfg.skins.offerTtlMs) {
        await bot.cancel(d.offer_id);
        await setStatus(d.id, 'sent', 'expired', 'The offer was not accepted in time and was canceled.');
      }
    } catch (e) {
      log({ level: 'warn', msg: 'offer poll failed', deposit: d.id, error: errText(e) });
    }
  }

  // 3. stock: new assets in, items that left without a withdrawal out
  if (opts.syncInventory) {
    const inv = await bot.inventory();
    const seen = new Set<string>();
    for (const i of inv) {
      seen.add(i.assetId);
      await db.prepare(`INSERT INTO skin_items (asset_id, market_hash_name, icon_url, tradable, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'in_stock', ?, ?)
        ON CONFLICT (asset_id) DO UPDATE SET tradable = excluded.tradable, icon_url = COALESCE(excluded.icon_url, skin_items.icon_url),
          status = CASE WHEN skin_items.status = 'gone' THEN 'in_stock' ELSE skin_items.status END, updated_at = excluded.updated_at`)
        .run(i.assetId, i.name, i.icon, i.tradable ? 1 : 0, now, now);
    }
    const stock = (await db.prepare("SELECT asset_id FROM skin_items WHERE status = 'in_stock'").all()) as { asset_id: string }[];
    for (const r of stock) if (!seen.has(r.asset_id)) await db.prepare("UPDATE skin_items SET status = 'gone', updated_at = ? WHERE asset_id = ? AND status = 'in_stock'").run(now, r.asset_id);
    await db.prepare("UPDATE bot_status SET items = ? WHERE id = 'main'").run(inv.length);
  }
}
