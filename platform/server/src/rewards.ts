/**
 * Retention (concept: docs/platform/02-konzept.md, "Gemeinsames Fundament").
 *
 * Everything is measured in *expected loss* = stake × house edge of the game, not in raw wager.
 * A low-edge game therefore earns proportionally less XP/rakeback, and no strategy can farm rewards
 * for more than they cost on average.
 *
 *   XP        1 XP per Frag of expected loss. Level L needs 100 · (L − 1)^1.6 XP in total.
 *   Rakeback  5 / 10 / 15 / 20 / 25 / 30 % of expected loss by level band; claim any time (≥ 1 Frag).
 *   Scrap Crate   free daily case from level 2, drawn from the player's own seed (verifiable).
 *   Oil Rain  every 30 min a 2-min window; pot = 1 % of the last period's expected loss (min 500 Frags in demo);
 *             players with level ≥ 5 and ≥ 100 Frags wagered in 24 h join; pot split equally at close.
 *   Crew codes  referrer earns 5 / 7.5 / 10 % of referred players' NGR (net of their bonuses), by crew size.
 *
 * Responsible gambling wins: during a cooldown or exclusion there is no Scrap Crate, no Oil Rain and no
 * promo messaging. Rakeback and affiliate earnings (the player's own money) stay claimable.
 */

import { EDGE, FairStream, openCase, type CaseDef } from '../../engine/src/index';
import { systemMessage } from './chat';
import { type Config, MF_PER_FRAG, fmtFrags, frags } from './config';
import { type DB, audit, tx } from './db';
import { fail } from './errors';
import { promoEligible } from './rg';
import { takeNonce } from './seeds';
import { HOUSE, transfer, userAccount } from './wallet';

export const PROMO = 'house:promo';

/** Edge used for expected loss. Plinko/cases use the target edge (their real edge is ≥ this). */
const EDGE_OF: Record<string, number> = {
  dice: EDGE.dice, crash: EDGE.crash, mines: EDGE.mines, plinko: EDGE.plinko, raid: EDGE.raid,
  upgrader: EDGE.upgrader, cases: EDGE.cases, battle: EDGE.cases, coinflip: EDGE.coinflip,
};
const edgeSql = `CASE game ${Object.entries(EDGE_OF).map(([g, e]) => `WHEN '${g}' THEN ${e}`).join(' ')} ELSE 0 END`;

export const xpForLevel = (level: number) => Math.round(100 * Math.pow(Math.max(0, level - 1), 1.6));
export function levelForXp(xp: number): number {
  let l = 1;
  while (xpForLevel(l + 1) <= xp) l++;
  return l;
}
export const RAKEBACK_BANDS: [number, number][] = [[1, 0.05], [10, 0.1], [25, 0.15], [50, 0.2], [75, 0.25], [100, 0.3]];
export const rakebackRate = (level: number) => RAKEBACK_BANDS.filter(([min]) => level >= min).pop()![1];

/** Expected loss in mF over a user's wagers since `since` (exclusive). */
function expectedLoss(db: DB, userId: string, since = -1): number {
  const r = db.prepare(`SELECT COALESCE(SUM(stake * ${edgeSql}), 0) AS el FROM wagers WHERE user_id = ? AND created_at > ?`).get(userId, since) as { el: number };
  return Math.floor(r.el);
}

function lastClaim(db: DB, userId: string, kind: string): { amount: number; created_at: number } | undefined {
  return db.prepare('SELECT amount, created_at FROM reward_claims WHERE user_id = ? AND kind = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(userId, kind) as { amount: number; created_at: number } | undefined;
}
function recordClaim(db: DB, userId: string, kind: string, amount: number, data: unknown, now: number) {
  db.prepare('INSERT INTO reward_claims (user_id, kind, amount, data, created_at) VALUES (?, ?, ?, ?, ?)').run(userId, kind, amount, JSON.stringify(data ?? null), now);
}

/* ---------- level & rakeback ---------- */

export function progress(db: DB, userId: string) {
  const xp = Math.floor(expectedLoss(db, userId) / MF_PER_FRAG);
  const level = levelForXp(xp);
  const lastRb = lastClaim(db, userId, 'rakeback');
  const rbAccrued = Math.floor(expectedLoss(db, userId, lastRb?.created_at ?? -1) * rakebackRate(level));
  return { xp, level, levelXp: xpForLevel(level), nextLevelXp: xpForLevel(level + 1), rakebackRate: rakebackRate(level), rakebackAvailable: rbAccrued };
}

export function claimRakeback(db: DB, userId: string, now: number) {
  return tx(db, () => {
    const p = progress(db, userId);
    if (p.rakebackAvailable < frags(1)) fail('nothing_to_claim', 'Less than 1 Frag of rakeback so far.');
    transfer(db, HOUSE, userAccount(userId), p.rakebackAvailable, 'rakeback', null, now);
    recordClaim(db, userId, 'rakeback', p.rakebackAvailable, { level: p.level, rate: p.rakebackRate }, now);
    return { amount: p.rakebackAvailable };
  });
}

/* ---------- Scrap Crate (daily case) ---------- */

export const DAILY_CASE: CaseDef = {
  id: 'scrap-crate', name: 'Scrap Crate',
  items: [
    { name: 'Rusty Screw', value: 1, weight: 50_000 },
    { name: 'Copper Wire', value: 3, weight: 30_000 },
    { name: 'Tape Hoodie', value: 40, weight: 15_000 },
    { name: 'Rusty Hatchet', value: 90, weight: 4_500 },
    { name: 'Big Grin Door', value: 1240, weight: 450 },
    { name: 'Glory AK', value: 21000, weight: 50 },
  ],
};
export const DAILY_MIN_LEVEL = 2;

export function openDaily(db: DB, userId: string, now: number) {
  return tx(db, () => {
    if (!promoEligible(db, userId, now)) fail('rg_blocked', 'No free crates during a break.', 403);
    const p = progress(db, userId);
    if (p.level < DAILY_MIN_LEVEL) fail('level_required', `The Scrap Crate unlocks at level ${DAILY_MIN_LEVEL}.`, 403, { level: p.level });
    const last = lastClaim(db, userId, 'daily');
    if (last && now - last.created_at < 86_400_000) fail('daily_wait', 'Your next Scrap Crate is available in 24 hours.', 429, { nextAt: last.created_at + 86_400_000 });
    const { seed, nonce } = takeNonce(db, userId);
    const { ticket, item } = openCase(new FairStream(seed.server_seed, seed.client_seed, nonce), DAILY_CASE);
    const amount = item.value * MF_PER_FRAG;
    transfer(db, PROMO, userAccount(userId), amount, 'promo', 'daily', now);
    const fairness = { serverSeedHash: seed.server_hash, clientSeed: seed.client_seed, nonce };
    recordClaim(db, userId, 'daily', amount, { ticket, item, fairness }, now);
    return { item, ticket, fairness };
  });
}

/* ---------- Oil Rain ---------- */

export const RAIN_PERIOD_MS = 30 * 60_000;
export const RAIN_WINDOW_MS = 2 * 60_000;
export const RAIN_MIN_LEVEL = 5;

interface RainRow { id: number; opens_at: number; closes_at: number; pot: number; status: 'open' | 'paid' }

export function rainTick(db: DB, cfg: Config, now: number) {
  return tx(db, () => {
    const cur = db.prepare('SELECT * FROM rain_rounds ORDER BY id DESC LIMIT 1').get() as unknown as RainRow | undefined;
    if (cur && cur.status === 'open' && now >= cur.closes_at) {
      const joiners = db.prepare('SELECT user_id FROM rain_joins WHERE rain_id = ?').all(cur.id) as { user_id: string }[];
      const share = joiners.length ? Math.floor(cur.pot / joiners.length) : 0;
      for (const j of joiners) {
        transfer(db, PROMO, userAccount(j.user_id), share, 'promo', `rain:${cur.id}`, now);
        recordClaim(db, j.user_id, 'rain', share, { rain: cur.id }, now);
      }
      db.prepare("UPDATE rain_rounds SET status = 'paid' WHERE id = ?").run(cur.id);
      audit(db, null, 'rain_paid', { rain: cur.id, joiners: joiners.length, share }, now);
      if (joiners.length) systemMessage(db, 'rain', `Oil Rain paid ${fmtFrags(share)} Frags each to ${joiners.length} player${joiners.length === 1 ? '' : 's'}.`, now);
    }
    const slot = Math.floor(now / RAIN_PERIOD_MS) * RAIN_PERIOD_MS;
    if (!cur || cur.opens_at < slot) {
      const el = (db.prepare(`SELECT COALESCE(SUM(stake * ${edgeSql}), 0) AS el FROM wagers WHERE created_at >= ?`).get(slot - RAIN_PERIOD_MS) as { el: number }).el;
      const pot = Math.max(Math.floor(el * 0.01), cfg.demo ? frags(500) : 0);
      db.prepare("INSERT INTO rain_rounds (opens_at, closes_at, pot, status) VALUES (?, ?, ?, 'open')").run(slot, slot + RAIN_WINDOW_MS, pot);
      if (now < slot + RAIN_WINDOW_MS) systemMessage(db, 'rain', `Oil Rain is open for 2 minutes: ${fmtFrags(pot)} Frags pot, split equally. Level ${RAIN_MIN_LEVEL}+.`, now);
    }
  });
}

export function rainState(db: DB, userId: string | null, now: number) {
  const cur = db.prepare('SELECT * FROM rain_rounds ORDER BY id DESC LIMIT 1').get() as unknown as RainRow | undefined;
  const next = Math.floor(now / RAIN_PERIOD_MS) * RAIN_PERIOD_MS + RAIN_PERIOD_MS;
  if (!cur) return { open: false, nextAt: next, pot: 0, joiners: 0, joined: false };
  const joiners = (db.prepare('SELECT COUNT(*) AS n FROM rain_joins WHERE rain_id = ?').get(cur.id) as { n: number }).n;
  const joined = userId ? Boolean(db.prepare('SELECT 1 FROM rain_joins WHERE rain_id = ? AND user_id = ?').get(cur.id, userId)) : false;
  const open = cur.status === 'open' && now < cur.closes_at && now >= cur.opens_at;
  return { open, closesAt: cur.closes_at, nextAt: open ? cur.opens_at : next, pot: cur.pot / MF_PER_FRAG, joiners, joined };
}

export function joinRain(db: DB, userId: string, now: number) {
  return tx(db, () => {
    const cur = db.prepare('SELECT * FROM rain_rounds ORDER BY id DESC LIMIT 1').get() as unknown as RainRow | undefined;
    if (!cur || cur.status !== 'open' || now >= cur.closes_at || now < cur.opens_at) fail('rain_closed', 'There is no Oil Rain right now.', 409);
    if (!promoEligible(db, userId, now)) fail('rg_blocked', 'No Oil Rain during a break.', 403);
    const p = progress(db, userId);
    if (p.level < RAIN_MIN_LEVEL) fail('level_required', `Oil Rain unlocks at level ${RAIN_MIN_LEVEL}.`, 403);
    const wagered = (db.prepare('SELECT COALESCE(SUM(stake), 0) AS s FROM wagers WHERE user_id = ? AND created_at >= ?').get(userId, now - 86_400_000) as { s: number }).s;
    if (wagered < frags(100)) fail('activity_required', 'Oil Rain needs 100 Frags wagered in the last 24 hours.', 403);
    db.prepare('INSERT OR IGNORE INTO rain_joins (rain_id, user_id, created_at) VALUES (?, ?, ?)').run(cur!.id, userId, now);
    return rainState(db, userId, now);
  });
}

/* ---------- Crew codes (affiliate) ---------- */

export const CREW_BANDS: [number, number][] = [[0, 0.05], [10, 0.075], [50, 0.1]];

export function createCrewCode(db: DB, userId: string, code: string, now: number) {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,16}$/.test(c)) fail('invalid_code', 'Crew code: 3 to 16 letters or digits.');
  if (db.prepare('SELECT 1 FROM crew_codes WHERE owner_id = ?').get(userId)) fail('code_exists', 'You already have a crew code.', 409);
  if (db.prepare('SELECT 1 FROM crew_codes WHERE code = ?').get(c)) fail('code_taken', 'This code is already taken.', 409);
  db.prepare('INSERT INTO crew_codes (code, owner_id, created_at) VALUES (?, ?, ?)').run(c, userId, now);
  return { code: c };
}

export function redeemCrewCode(db: DB, userId: string, code: string, now: number) {
  return tx(db, () => {
    const c = db.prepare('SELECT code, owner_id FROM crew_codes WHERE code = ?').get(code.trim().toUpperCase()) as { code: string; owner_id: string } | undefined;
    if (!c) fail('unknown_code', 'This crew code does not exist.', 404);
    if (c!.owner_id === userId) fail('own_code', 'You cannot use your own code.');
    const u = db.prepare('SELECT created_at, crew_code FROM users WHERE id = ?').get(userId) as { created_at: number; crew_code: string | null };
    if (u.crew_code) fail('already_redeemed', 'You already joined a crew.', 409);
    if (now - u.created_at > 86_400_000) fail('too_late', 'A crew code can only be entered within 24 hours of signing up.', 403);
    db.prepare('UPDATE users SET crew_code = ? WHERE id = ?').run(c!.code, userId);
    audit(db, userId, 'crew_redeem', { code: c!.code }, now);
    return { code: c!.code };
  });
}

export function crewState(db: DB, userId: string) {
  const own = db.prepare('SELECT code FROM crew_codes WHERE owner_id = ?').get(userId) as { code: string } | undefined;
  const joined = (db.prepare('SELECT crew_code FROM users WHERE id = ?').get(userId) as { crew_code: string | null }).crew_code;
  if (!own) return { code: null, joinedCode: joined, members: 0, rate: 0, ngr: 0, available: 0 };
  const members = db.prepare('SELECT id FROM users WHERE crew_code = ?').all(own.code) as { id: string }[];
  const rate = CREW_BANDS.filter(([min]) => members.length >= min).pop()![1];
  const last = lastClaim(db, userId, 'affiliate');
  const since = last?.created_at ?? -1;
  let ngr = 0;
  for (const m of members) {
    const r = db.prepare('SELECT COALESCE(SUM(stake), 0) - COALESCE(SUM(payout), 0) AS ggr FROM wagers WHERE user_id = ? AND settled = 1 AND created_at > ?').get(m.id, since) as { ggr: number };
    const bonus = (db.prepare("SELECT COALESCE(SUM(amount), 0) AS b FROM reward_claims WHERE user_id = ? AND kind IN ('rakeback', 'daily', 'rain') AND created_at > ?").get(m.id, since) as { b: number }).b;
    ngr += r.ggr - bonus;
  }
  return { code: own.code, joinedCode: joined, members: members.length, rate, ngr, available: Math.max(0, Math.floor(ngr * rate)) };
}

export function claimCrew(db: DB, userId: string, now: number) {
  return tx(db, () => {
    const s = crewState(db, userId);
    if (s.available < frags(1)) fail('nothing_to_claim', 'Less than 1 Frag of crew share so far.');
    transfer(db, HOUSE, userAccount(userId), s.available, 'affiliate', 'crew', now);
    recordClaim(db, userId, 'affiliate', s.available, { ngr: s.ngr, rate: s.rate, members: s.members }, now);
    return { amount: s.available };
  });
}

