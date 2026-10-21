/**
 * Player-facing account data: the full bet history across every game (the `wagers` view), a round's
 * detail with its verification, revealed seed pairs, wallet transactions, lifetime stats, the profile
 * (display name, hidden in public lists) and the public live-bets feed.
 *
 * Paging uses keyset cursors, never OFFSET: history pages on (created_at, ref), transactions on the
 * ledger id. Several bets can share one millisecond (multi-open), so the ref breaks the tie.
 */

import type { Beacon } from './beacon';
import { MF_PER_FRAG } from './config';
import { type DB, PUBLIC_NAME, audit } from './db';
import { fail } from './errors';
import { betDetail } from './explorer';
import { GAME_IDS, GAME_NAME, type GameId } from './flags';
import { userAccount } from './wallet';

const f = (mf: number) => Number(mf) / MF_PER_FRAG;
const gameOf = (g: string) => ((GAME_IDS as readonly string[]).includes(g) ? (g as GameId) : null);

interface WagerRow { ref: string; game: GameId; stake: number; payout: number; settled: number; created_at: number; settled_at: number | null }
const wager = (r: WagerRow) => ({
  game: r.game, gameName: GAME_NAME[r.game] ?? r.game, ref: String(r.ref), stake: f(r.stake), payout: f(r.payout),
  multiplier: Number(r.stake) ? Number(r.payout) / Number(r.stake) : 0, settled: Number(r.settled) === 1, createdAt: Number(r.created_at), settledAt: r.settled_at === null ? null : Number(r.settled_at),
});

/** One page of the player's own bets, newest first. `cursor` is the `next` value of the previous page. */
export async function playerHistory(db: DB, userId: string, q: { game?: string | null; cursor?: string | null; limit?: number }) {
  const limit = Math.min(100, Math.max(1, Math.floor(q.limit ?? 50)));
  const where = ['w.user_id = ?'];
  const args: (string | number)[] = [userId];
  if (q.game) {
    const g = gameOf(q.game) ?? fail('invalid_params', 'Unknown game.');
    where.push('w.game = ?'); args.push(g);
  }
  if (q.cursor) {
    const [at, ref] = String(q.cursor).split('|');
    if (!/^\d+$/.test(at ?? '') || !ref) fail('invalid_params', 'Bad cursor.');
    where.push('(w.created_at < ? OR (w.created_at = ? AND w.ref < ?))'); args.push(Number(at), Number(at), ref);
  }
  const rows = (await db.prepare(`SELECT w.ref, w.game, w.stake, w.payout, w.settled, w.created_at, w.settled_at FROM wagers w
    WHERE ${where.join(' AND ')} ORDER BY w.created_at DESC, w.ref DESC LIMIT ${limit + 1}`).all(...args)) as WagerRow[];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { bets: page.map(wager), next: rows.length > limit && last ? `${Number(last.created_at)}|${last.ref}` : null };
}

/** A round from the player's own history with seeds, result and the server's replay of it. */
export async function playerBetDetail(db: DB, beacon: Beacon, userId: string, game: string, ref: string, now: number) {
  const g = gameOf(game) ?? fail('not_found', 'Bet not found.', 404);
  const mine = await db.prepare('SELECT 1 AS ok FROM wagers WHERE user_id = ? AND game = ? AND ref = ?').get(userId, g, String(ref));
  if (!mine) fail('not_found', 'Bet not found.', 404);
  const d = (await betDetail(db, beacon, g, String(ref), now)) as Record<string, unknown>;
  const { userId: _u, ...rest } = d;
  return rest;
}

/** Seed pairs the player has rotated away from (server seed revealed), newest first, plus the active one. */
export async function revealedSeeds(db: DB, userId: string, limit = 50) {
  const rows = (await db.prepare(`SELECT server_seed, server_hash, client_seed, nonce, created_at, revealed_at FROM seeds
    WHERE user_id = ? AND revealed_at IS NOT NULL ORDER BY revealed_at DESC LIMIT ${Math.min(200, Math.max(1, Math.floor(limit)))}`).all(userId)) as
    { server_seed: string; server_hash: string; client_seed: string; nonce: number; created_at: number; revealed_at: number }[];
  return rows.map((r) => ({ serverSeed: r.server_seed, serverSeedHash: r.server_hash, clientSeed: r.client_seed, bets: Number(r.nonce), createdAt: Number(r.created_at), revealedAt: Number(r.revealed_at) }));
}

const TX_KINDS = ['stake', 'payout', 'refund', 'demo_grant', 'deposit', 'withdrawal', 'rakeback', 'promo', 'affiliate', 'adjustment'] as const;

/** The player's wallet ledger (every balance change), newest first, with the game a stake or payout belonged to. */
export async function transactions(db: DB, userId: string, q: { kind?: string | null; before?: number | null; limit?: number }) {
  const limit = Math.min(100, Math.max(1, Math.floor(q.limit ?? 50)));
  const where = ['account = ?'];
  const args: (string | number)[] = [userAccount(userId)];
  if (q.kind) {
    if (!(TX_KINDS as readonly string[]).includes(q.kind)) fail('invalid_params', 'Unknown transaction kind.');
    where.push('kind = ?'); args.push(q.kind);
  }
  if (q.before) { where.push('id < ?'); args.push(Math.floor(Number(q.before))); }
  const rows = (await db.prepare(`SELECT id, kind, amount, ref, created_at FROM ledger WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${limit + 1}`).all(...args)) as
    { id: number; kind: string; amount: number; ref: string | null; created_at: number }[];
  const page = rows.slice(0, limit);
  const refs = [...new Set(page.map((r) => r.ref).filter((x): x is string => Boolean(x)))];
  const games = new Map<string, GameId>();
  if (refs.length) {
    const found = (await db.prepare(`SELECT ref, game FROM wagers WHERE user_id = ? AND ref IN (${refs.map(() => '?').join(', ')})`).all(userId, ...refs)) as { ref: string; game: GameId }[];
    for (const r of found) games.set(String(r.ref), r.game);
  }
  return {
    transactions: page.map((r) => {
      const g = r.ref ? games.get(String(r.ref)) ?? null : null;
      return { id: Number(r.id), kind: r.kind, amount: f(r.amount), ref: r.ref, game: g, gameName: g ? GAME_NAME[g] : null, createdAt: Number(r.created_at) };
    }),
    next: rows.length > limit ? Number(page[page.length - 1].id) : null,
  };
}

/** Lifetime figures for the profile page (settled rounds only). */
export async function playerStats(db: DB, userId: string, now: number) {
  const user = (await db.prepare('SELECT created_at FROM users WHERE id = ?').get(userId)) as { created_at: number } | undefined;
  const per = (await db.prepare(`SELECT game, COUNT(*) AS n, COALESCE(SUM(stake), 0) AS s, COALESCE(SUM(payout), 0) AS p FROM wagers
    WHERE user_id = ? AND settled = 1 GROUP BY game ORDER BY n DESC`).all(userId)) as { game: GameId; n: number; s: number; p: number }[];
  const best = (await db.prepare(`SELECT ref, game, stake, payout FROM wagers WHERE user_id = ? AND settled = 1 AND stake > 0
    ORDER BY payout * 1.0 / stake DESC, payout DESC LIMIT 1`).get(userId)) as { ref: string; game: GameId; stake: number; payout: number } | undefined;
  const top = (await db.prepare('SELECT ref, game, stake, payout FROM wagers WHERE user_id = ? AND settled = 1 ORDER BY payout DESC LIMIT 1').get(userId)) as
    { ref: string; game: GameId; stake: number; payout: number } | undefined;
  const sessions = (await db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?').get(userId, now)) as { n: number };
  const t = (await db.prepare('SELECT * FROM player_stats WHERE user_id = ?').get(userId)) as Record<string, number | null> | undefined;
  const bal = (await db.prepare('SELECT amount FROM balances WHERE account = ?').get(`user:${userId}`)) as { amount: number } | undefined;
  const sum = (k: 'n' | 's' | 'p') => per.reduce((a, g) => a + Number(g[k]), 0);
  const pick = (r?: { ref: string; game: GameId; stake: number; payout: number }) => (r ? { ref: String(r.ref), game: r.game, gameName: GAME_NAME[r.game], stake: f(r.stake), payout: f(r.payout), multiplier: Number(r.stake) ? Number(r.payout) / Number(r.stake) : 0 } : null);
  return {
    memberSince: user ? Number(user.created_at) : null,
    bets: sum('n'), wagered: f(sum('s')), paid: f(sum('p')), net: f(sum('p') - sum('s')),
    bestMultiplier: pick(best), biggestWin: pick(top), activeSessions: Number(sessions.n),
    games: per.map((g) => ({ game: g.game, gameName: GAME_NAME[g.game] ?? g.game, bets: Number(g.n), wagered: f(g.s), paid: f(g.p) })),
    // money totals kept live by the database (player_stats, one trigger on the ledger)
    totals: {
      balance: f(bal?.amount ?? 0), wagered: f(t?.wagered ?? 0), paid: f(t?.paid ?? 0), stakes: Number(t?.stakes ?? 0), deposited: f(t?.deposited ?? 0), withdrawn: f(t?.withdrawn ?? 0),
      bonuses: f(t?.bonuses ?? 0), playMoney: f(t?.grants ?? 0), adjustments: f(t?.adjustments ?? 0), lastActivity: t?.last_activity == null ? null : Number(t.last_activity),
    },
  };
}

export const NAME_CHANGE_COOLDOWN_MS = 24 * 3_600_000;

/** Display name (once per 24 h) and whether the name shows in public lists. */
export async function updateProfile(db: DB, userId: string, input: { displayName?: unknown; hidePublic?: unknown }, now: number) {
  const u = (await db.prepare('SELECT display_name, name_changed_at, hide_public, steam_name FROM users WHERE id = ?').get(userId)) as
    { display_name: string; name_changed_at: number | null; hide_public: number; steam_name: string | null } | undefined;
  if (!u) fail('not_found', 'Account not found.', 404);
  const changes: Record<string, unknown> = {};
  if (input.displayName !== undefined && u!.steam_name !== null && String(input.displayName).trim() !== u!.display_name) {
    fail('steam_name', 'Your name comes from Steam. Change it on Steam and sign in again.', 409);
  }
  if (input.displayName !== undefined) {
    const n = String(input.displayName ?? '').trim();
    if (n.length < 2 || n.length > 24 || /[<>]/.test(n)) fail('invalid_name', 'Name: 2 to 24 characters.');
    if (n !== u!.display_name) {
      const last = u!.name_changed_at === null ? null : Number(u!.name_changed_at);
      if (last !== null && now - last < NAME_CHANGE_COOLDOWN_MS) fail('name_cooldown', 'You can change your name once every 24 hours.', 429, { retryAt: last + NAME_CHANGE_COOLDOWN_MS });
      await db.prepare('UPDATE users SET display_name = ?, name_changed_at = ? WHERE id = ?').run(n, now, userId);
      changes.displayName = { from: u!.display_name, to: n };
    }
  }
  if (input.hidePublic !== undefined) {
    if (typeof input.hidePublic !== 'boolean') fail('invalid_params', 'hidePublic must be true or false.');
    const v = input.hidePublic ? 1 : 0;
    if (v !== Number(u!.hide_public)) { await db.prepare('UPDATE users SET hide_public = ? WHERE id = ?').run(v, userId); changes.hidePublic = input.hidePublic; }
  }
  if (Object.keys(changes).length) await audit(db, userId, 'profile_update', changes, now);
  return profile(db, userId);
}

export async function profile(db: DB, userId: string) {
  const u = (await db.prepare('SELECT display_name, name_changed_at, hide_public, steam_name FROM users WHERE id = ?').get(userId)) as
    { display_name: string; name_changed_at: number | null; hide_public: number; steam_name: string | null };
  const last = u.name_changed_at === null ? null : Number(u.name_changed_at);
  return { displayName: u.display_name, hidePublic: Number(u.hide_public) === 1, nameChangeAt: last === null ? null : last + NAME_CHANGE_COOLDOWN_MS, nameFromSteam: u.steam_name !== null };
}

/** Signs the player out on every device, this one included. */
export async function logoutAll(db: DB, userId: string, now: number): Promise<number> {
  const n = (await db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(userId)) as { n: number };
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  await audit(db, userId, 'logout_all', { sessions: Number(n.n) }, now);
  return Number(n.n);
}

/* ---------- live figures for the lobby ---------- */

export const ONLINE_WINDOW_MS = 5 * 60_000;

/** Players seen in the last 5 minutes, rounds and the best win of the last 24 h. Public. */
export async function liveStats(db: DB, now: number) {
  const online = (await db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE last_seen >= ? AND expires_at > ?').get(now - ONLINE_WINDOW_MS, now)) as { n: number };
  const day = (await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(payout), 0) AS p FROM wagers WHERE settled = 1 AND created_at >= ?').get(now - FEED_WINDOW_MS)) as { n: number; p: number };
  const top = (await db.prepare(`SELECT w.game, w.stake, w.payout, ${PUBLIC_NAME} AS name FROM wagers w JOIN users u ON u.id = w.user_id
    WHERE w.settled = 1 AND w.created_at >= ? ORDER BY w.payout DESC LIMIT 1`).get(now - FEED_WINDOW_MS)) as { game: GameId; stake: number; payout: number; name: string } | undefined;
  return {
    online: Number(online.n), roundsToday: Number(day.n), paidToday: f(day.p),
    topWin: top && Number(top.payout) > 0 ? { game: top.game, gameName: GAME_NAME[top.game] ?? top.game, name: top.name, payout: f(top.payout), multiplier: Number(top.stake) ? Number(top.payout) / Number(top.stake) : 0 } : null,
  };
}

/* ---------- public live-bets feed ---------- */

export type FeedKind = 'all' | 'high';
export const FEED_WINDOW_MS = 24 * 3_600_000;
export const FEED_HIGH_MULTIPLIER = 5;
const feedCache = new WeakMap<DB, Map<FeedKind, { at: number; data: unknown }>>();

/** The last settled rounds of everyone (names hidden on request), for the lobby. Cached for 2 s. */
export async function publicFeed(db: DB, kind: FeedKind, now: number) {
  if (kind !== 'all' && kind !== 'high') fail('invalid_params', 'kind: all or high.');
  let cache = feedCache.get(db);
  if (!cache) { cache = new Map(); feedCache.set(db, cache); }
  const hit = cache.get(kind);
  if (hit && now - hit.at < 2000 && now >= hit.at) return hit.data;
  const high = kind === 'high' ? `AND w.payout >= w.stake * ${FEED_HIGH_MULTIPLIER} AND w.stake > 0` : '';
  const rows = (await db.prepare(`SELECT w.game, w.stake, w.payout, w.settled_at, w.created_at, ${PUBLIC_NAME} AS name FROM wagers w JOIN users u ON u.id = w.user_id
    WHERE w.settled = 1 AND w.created_at >= ? ${high} ORDER BY COALESCE(w.settled_at, w.created_at) DESC LIMIT 20`).all(now - FEED_WINDOW_MS)) as
    { game: GameId; stake: number; payout: number; settled_at: number | null; created_at: number; name: string }[];
  const data = rows.map((r) => ({
    game: r.game, gameName: GAME_NAME[r.game] ?? r.game, name: r.name, stake: f(r.stake), payout: f(r.payout),
    multiplier: Number(r.stake) ? Number(r.payout) / Number(r.stake) : 0, at: Number(r.settled_at ?? r.created_at),
  }));
  cache.set(kind, { at: now, data });
  return data;
}
