/**
 * Operator backoffice. Read models for the dashboard plus the few write actions an operator needs.
 * Every write is audited with the operator's user id. Operators can put an account on hold and lift
 * their own holds; they can never shorten or lift a player's cooldown or self-exclusion.
 *
 *   RTP monitor  per game over a window: n, Σstake, Σpayout and a z-score of the per-bet return
 *                x = payout / stake against the theoretical RTP θ of that exact bet (plinko table, case,
 *                battle case set). z = Σ(x − θ) / √(Σ(x − θ)² − (Σ(x − θ))² / n). Alarm at |z| > 4 with n ≥ 1000,
 *                watch at |z| > 3. A real bug (wrong table, wrong edge) drives |z| up without bound as n grows.
 *   RG cases     net loss in 24 h above a threshold, ≥ 3 limit raises/removals in 30 days, a session
 *                longer than 3 h with a bet in the last 15 min. One open case per player and reason.
 */

import { EDGE, PLINKO_TABLES, SAMPLE_CASES, caseRtp, plinkoTheoreticalRtp, priceCase, type PlinkoRisk, type PlinkoRows } from '../../engine/src/index';
import type { Role } from './accounts';
import { activeMute } from './chat';
import { type Config, MF_PER_FRAG } from './config';
import { type DB, audit, tx } from './db';
import { fail } from './errors';
import { GAME_IDS, GAME_NAME, gameFlags, type GameId } from './flags';
import { activeBlock, getLimits } from './rg';
import { ledgerIntegrity, userAccount } from './wallet';

const DAY = 86_400_000;
const f = (mf: number) => mf / MF_PER_FRAG;

/* ---------- roles ---------- */

export const ROLES: Role[] = ['player', 'moderator', 'admin'];
export function requireRole(user: { role: Role }, ...allowed: Role[]): void {
  if (!allowed.includes(user.role)) fail('forbidden', 'You do not have access to this area.', 403);
}
export function setRole(db: DB, actorId: string, userId: string, role: Role, now: number) {
  if (!ROLES.includes(role)) fail('invalid_params', 'Role: player, moderator or admin.');
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) fail('not_found', 'Player not found.', 404);
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  audit(db, actorId, 'admin_role', { user: userId, role }, now);
  return { userId, role };
}

/* ---------- RTP monitor ---------- */

const battleTheory = (caseIds: string[]) => {
  let ev = 0, cost = 0;
  for (const id of caseIds) { const c = SAMPLE_CASES.find((x) => x.id === id); if (!c) continue; const p = priceCase(c); ev += caseRtp(c) * p; cost += p; }
  return cost ? ev / cost : null;
};

function betTheory(game: string, params: string): number | null {
  const p = JSON.parse(params || '{}');
  switch (game) {
    case 'dice': return 1 - EDGE.dice;
    case 'upgrader': return 1 - EDGE.upgrader;
    case 'mines': return 1 - EDGE.mines;
    case 'raid': return 1 - EDGE.raid;
    case 'plinko': return PLINKO_TABLES[p.rows as PlinkoRows]?.[p.risk as PlinkoRisk] ? plinkoTheoreticalRtp(p.rows, p.risk) : null;
    case 'cases': { const c = SAMPLE_CASES.find((x) => x.id === p.caseId); return c ? caseRtp(c) : null; }
    default: return null;
  }
}

export interface RtpRow { game: GameId; name: string; n: number; wagered: number; paid: number; rtp: number | null; theory: number | null; z: number | null; status: 'ok' | 'watch' | 'alarm' | 'low_sample' }

export function rtpMonitor(db: DB, since: number): RtpRow[] {
  const acc = new Map<string, { n: number; stake: number; paid: number; sx: number; st: number; sd2: number }>();
  const add = (game: string, stake: number, payout: number, theory: number | null) => {
    if (theory === null || stake <= 0) return;
    const a = acc.get(game) ?? { n: 0, stake: 0, paid: 0, sx: 0, st: 0, sd2: 0 };
    const x = payout / stake;
    a.n++; a.stake += stake; a.paid += payout; a.sx += x; a.st += theory; a.sd2 += (x - theory) ** 2;
    acc.set(game, a);
  };
  for (const r of db.prepare("SELECT game, stake, payout, params FROM bets WHERE status = 'settled' AND settled_at >= ?").all(since) as unknown as Array<{ game: string; stake: number; payout: number; params: string }>) {
    add(r.game, r.stake, r.payout, betTheory(r.game, r.params));
  }
  for (const r of db.prepare("SELECT stake, payout FROM crash_bets b JOIN crash_rounds r ON r.id = b.round_id WHERE b.status = 'settled' AND r.crash_at >= ?").all(since) as unknown as Array<{ stake: number; payout: number }>) {
    add('crash', r.stake, r.payout, 1 - EDGE.crash);
  }
  for (const r of db.prepare(`SELECT g.type, g.params, s.stake, s.payout FROM pvp_seats s JOIN pvp_games g ON g.id = s.game_id
      WHERE s.user_id IS NOT NULL AND g.status = 'settled' AND g.settled_at >= ?`).all(since) as unknown as Array<{ type: string; params: string; stake: number; payout: number }>) {
    add(r.type, r.stake, r.payout, r.type === 'coinflip' ? 1 - EDGE.coinflip : battleTheory(JSON.parse(r.params).caseIds ?? []));
  }
  return GAME_IDS.map((g) => {
    const a = acc.get(g);
    if (!a) return { game: g, name: GAME_NAME[g], n: 0, wagered: 0, paid: 0, rtp: null, theory: null, z: null, status: 'low_sample' as const };
    const dev = a.sx - a.st;
    const varSum = a.sd2 - (dev * dev) / a.n;
    const z = a.n >= 2 && varSum > 1e-12 ? dev / Math.sqrt(varSum) : null;
    const status = a.n < 1000 ? 'low_sample' : z !== null && Math.abs(z) > 4 ? 'alarm' : z !== null && Math.abs(z) > 3 ? 'watch' : 'ok';
    return { game: g, name: GAME_NAME[g], n: a.n, wagered: f(a.stake), paid: f(a.paid), rtp: a.paid / a.stake, theory: a.st / a.n, z, status };
  });
}

/* ---------- overview ---------- */

export function overview(db: DB, cfg: Config, now: number) {
  const since = now - DAY;
  const one = <T>(sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as T;
  const players = one<{ n: number }>('SELECT COUNT(*) AS n FROM users').n;
  const newPlayers = one<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', since).n;
  const w = one<{ active: number; bets: number; staked: number; paid: number }>(
    'SELECT COUNT(DISTINCT user_id) AS active, COUNT(*) AS bets, COALESCE(SUM(stake), 0) AS staked, COALESCE(SUM(CASE WHEN settled THEN payout ELSE 0 END), 0) AS paid FROM wagers WHERE created_at >= ?', since);
  const settled = one<{ staked: number; paid: number }>('SELECT COALESCE(SUM(stake), 0) AS staked, COALESCE(SUM(payout), 0) AS paid FROM wagers WHERE settled = 1 AND created_at >= ?', since);
  const promo = one<{ s: number }>('SELECT COALESCE(SUM(amount), 0) AS s FROM reward_claims WHERE created_at >= ?', since).s;
  const house = db.prepare("SELECT account, amount FROM balances WHERE account LIKE 'house:%' ORDER BY account").all() as { account: string; amount: number }[];
  const playerFloat = one<{ s: number }>("SELECT COALESCE(SUM(amount), 0) AS s FROM balances WHERE account LIKE 'user:%'").s;
  const integrity = ledgerIntegrity(db);
  const rtp = rtpMonitor(db, now - 30 * DAY);
  rgScan(db, cfg, now);
  return {
    now, demo: cfg.demo,
    players: { total: players, new24h: newPlayers, active24h: w.active },
    last24h: { bets: w.bets, wagered: f(w.staked), ggr: f(settled.staked - settled.paid), promoCost: f(promo), ngr: f(settled.staked - settled.paid - promo) },
    house: house.map((h) => ({ account: h.account, balance: f(h.amount) })),
    playerFloat: f(playerFloat),
    ledger: { sum: integrity.sum, mismatched: integrity.mismatched, ok: integrity.sum === 0 && integrity.mismatched.length === 0 },
    alarms: rtp.filter((r) => r.status === 'alarm').map((r) => r.game),
    watch: rtp.filter((r) => r.status === 'watch').map((r) => r.game),
    disabledGames: gameFlags(db).filter((g) => !g.enabled).map((g) => g.game),
    openRgCases: one<{ n: number }>("SELECT COUNT(*) AS n FROM rg_cases WHERE status != 'closed'").n,
    chat: { messages24h: one<{ n: number }>("SELECT COUNT(*) AS n FROM chat_messages WHERE kind = 'user' AND created_at >= ?", since).n, activeMutes: one<{ n: number }>('SELECT COUNT(*) AS n FROM chat_mutes WHERE until_at IS NULL OR until_at > ?', now).n },
  };
}

/* ---------- players ---------- */

interface UserLite { id: string; display_name: string; role: Role; country: string | null; kyc_level: number; steam_id: string | null; created_at: number }

function stats(db: DB, userId: string, since: number) {
  const r = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(stake), 0) AS staked, COALESCE(SUM(payout), 0) AS paid, MAX(created_at) AS last FROM wagers WHERE user_id = ? AND created_at >= ?').get(userId, since) as { n: number; staked: number; paid: number; last: number | null };
  return { bets: r.n, wagered: f(r.staked), net: f(r.paid - r.staked), lastBetAt: r.last };
}

export function listPlayers(db: DB, q: string, now: number) {
  const term = q.trim();
  const rows = (term
    ? db.prepare('SELECT * FROM users WHERE display_name LIKE ? OR id LIKE ? ORDER BY created_at DESC LIMIT 200').all(`%${term}%`, `${term}%`)
    : db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 200').all()) as unknown as UserLite[];
  return rows.map((u) => {
    const all = stats(db, u.id, 0);
    return {
      id: u.id, name: u.display_name, role: u.role, country: u.country, kycLevel: u.kyc_level, steam: Boolean(u.steam_id), createdAt: u.created_at,
      balance: f((db.prepare('SELECT amount FROM balances WHERE account = ?').get(userAccount(u.id)) as { amount: number } | undefined)?.amount ?? 0),
      ...all, block: activeBlock(db, u.id, now), muted: Boolean(activeMute(db, u.id, now)),
      openCases: (db.prepare("SELECT COUNT(*) AS n FROM rg_cases WHERE user_id = ? AND status != 'closed'").get(u.id) as { n: number }).n,
    };
  }).sort((a, b) => (b.lastBetAt ?? b.createdAt) - (a.lastBetAt ?? a.createdAt)).slice(0, 50);
}

export function playerDetail(db: DB, userId: string, now: number) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserLite | undefined;
  if (!u) fail('not_found', 'Player not found.', 404);
  const wagers = db.prepare('SELECT game, stake, payout, settled, created_at FROM wagers WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').all(userId) as { game: string; stake: number; payout: number; settled: number; created_at: number }[];
  const ledger = db.prepare('SELECT tx_id, amount, kind, ref, created_at FROM ledger WHERE account = ? ORDER BY id DESC LIMIT 30').all(userAccount(userId)) as { tx_id: string; amount: number; kind: string; ref: string | null; created_at: number }[];
  const rewards = db.prepare('SELECT kind, COUNT(*) AS n, SUM(amount) AS total FROM reward_claims WHERE user_id = ? GROUP BY kind').all(userId) as { kind: string; n: number; total: number }[];
  const blocks = db.prepare('SELECT kind, until_at, created_at FROM rg_blocks WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(userId) as { kind: string; until_at: number | null; created_at: number }[];
  return {
    id: u!.id, name: u!.display_name, role: u!.role, country: u!.country, kycLevel: u!.kyc_level, steam: Boolean(u!.steam_id), createdAt: u!.created_at,
    balance: f((db.prepare('SELECT amount FROM balances WHERE account = ?').get(userAccount(userId)) as { amount: number } | undefined)?.amount ?? 0),
    stats: { h24: stats(db, userId, now - DAY), d30: stats(db, userId, now - 30 * DAY), all: stats(db, userId, 0) },
    block: activeBlock(db, userId, now), mute: activeMute(db, userId, now),
    limits: getLimits(db, userId, now).map((l) => ({ ...l, amount: l.amount === null ? null : f(l.amount), used: f(l.used) })),
    blocks: blocks.map((b) => ({ kind: b.kind, until: b.until_at, createdAt: b.created_at })),
    wagers: wagers.map((w) => ({ game: w.game, stake: f(w.stake), payout: f(w.payout), settled: Boolean(w.settled), createdAt: w.created_at })),
    ledger: ledger.map((l) => ({ tx: l.tx_id, amount: f(l.amount), kind: l.kind, ref: l.ref, createdAt: l.created_at })),
    rewards: rewards.map((r) => ({ kind: r.kind, count: r.n, total: f(r.total) })),
    cases: rgCases(db, 'all', userId),
    audit: auditLog(db, { userId, limit: 30 }),
  };
}

/** Operator hold: blocks betting (not reading, not cash-outs of open rounds). */
export function holdPlayer(db: DB, actorId: string, userId: string, hours: number | null, reason: string, now: number) {
  if (hours !== null && (!Number.isInteger(hours) || hours < 1 || hours > 24 * 365)) fail('invalid_params', 'Hold: 1 hour to 1 year, or until lifted.');
  if (!reason.trim()) fail('invalid_params', 'Give a reason for the hold.');
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) fail('not_found', 'Player not found.', 404);
  return tx(db, () => {
    const until = hours === null ? null : now + hours * 3_600_000;
    db.prepare("INSERT INTO rg_blocks (user_id, kind, until_at, created_at) VALUES (?, 'operator', ?, ?)").run(userId, until, now);
    audit(db, actorId, 'admin_hold', { user: userId, hours, until, reason: reason.trim() }, now);
    return { userId, until };
  });
}

/** Ends operator holds only. Cooldowns and self-exclusions stay untouched by design. */
export function releaseHold(db: DB, actorId: string, userId: string, now: number) {
  const r = db.prepare("UPDATE rg_blocks SET until_at = ? WHERE user_id = ? AND kind = 'operator' AND (until_at IS NULL OR until_at > ?)").run(now, userId, now);
  if (!r.changes) fail('not_found', 'This player has no active hold.', 404);
  audit(db, actorId, 'admin_hold_released', { user: userId }, now);
  return { userId, block: activeBlock(db, userId, now) };
}

/* ---------- RG cases ---------- */

export function rgScan(db: DB, cfg: Config, now: number): number {
  const a = cfg.rgAlert;
  const found: { user: string; reason: string; data: unknown }[] = [];
  for (const r of db.prepare('SELECT user_id, SUM(stake) - SUM(CASE WHEN settled THEN payout ELSE 0 END) AS loss FROM wagers WHERE created_at >= ? GROUP BY user_id HAVING loss > ?').all(now - DAY, a.netLoss24h) as { user_id: string; loss: number }[]) {
    found.push({ user: r.user_id, reason: 'net_loss_24h', data: { loss: f(r.loss), threshold: f(a.netLoss24h) } });
  }
  for (const r of db.prepare("SELECT user_id, COUNT(*) AS n FROM audit WHERE event = 'rg_limit_pending' AND created_at >= ? AND user_id IS NOT NULL GROUP BY user_id HAVING n >= ?").all(now - 30 * DAY, a.limitRaises30d) as { user_id: string; n: number }[]) {
    found.push({ user: r.user_id, reason: 'limit_raises_30d', data: { raises: r.n } });
  }
  for (const r of db.prepare(`SELECT s.user_id, MIN(s.started_at) AS started FROM sessions s WHERE s.expires_at > ? AND s.started_at <= ?
      AND EXISTS (SELECT 1 FROM wagers w WHERE w.user_id = s.user_id AND w.created_at >= ?) GROUP BY s.user_id`).all(now, now - a.sessionHours * 3_600_000, now - 15 * 60_000) as { user_id: string; started: number }[]) {
    found.push({ user: r.user_id, reason: 'long_session', data: { hours: +((now - r.started) / 3_600_000).toFixed(1) } });
  }
  let created = 0;
  const ins = db.prepare("INSERT OR IGNORE INTO rg_cases (user_id, reason, data, status, created_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?)");
  for (const c of found) created += Number(ins.run(c.user, c.reason, JSON.stringify(c.data), now, now).changes);
  return created;
}

export function rgCases(db: DB, status: 'open' | 'all', userId?: string) {
  const where = [status === 'open' ? "c.status != 'closed'" : '1', userId ? 'c.user_id = ?' : '1'].join(' AND ');
  const rows = db.prepare(`SELECT c.*, u.display_name AS name FROM rg_cases c JOIN users u ON u.id = c.user_id WHERE ${where} ORDER BY c.status = 'closed', c.updated_at DESC LIMIT 100`)
    .all(...(userId ? [userId] : [])) as { id: number; user_id: string; name: string; reason: string; data: string; status: string; note: string | null; handled_by: string | null; created_at: number; updated_at: number }[];
  return rows.map((r) => ({ id: r.id, userId: r.user_id, name: r.name, reason: r.reason, data: JSON.parse(r.data ?? 'null'), status: r.status, note: r.note, handledBy: r.handled_by, createdAt: r.created_at, updatedAt: r.updated_at }));
}

export function updateCase(db: DB, actorId: string, id: number, status: string, note: string, now: number) {
  if (!['open', 'contacted', 'closed'].includes(status)) fail('invalid_params', 'Status: open, contacted or closed.');
  if (status === 'closed' && !note.trim()) fail('invalid_params', 'Add a note when closing a case.');
  const r = db.prepare('UPDATE rg_cases SET status = ?, note = ?, handled_by = ?, updated_at = ? WHERE id = ?').run(status, note.trim().slice(0, 500) || null, actorId, now, id);
  if (!r.changes) fail('not_found', 'Case not found.', 404);
  audit(db, actorId, 'admin_rg_case', { case: id, status, note }, now);
  return rgCases(db, 'all').find((c) => c.id === id);
}

/* ---------- audit log ---------- */

export function auditLog(db: DB, opts: { userId?: string; event?: string; before?: number; limit?: number }) {
  const where: string[] = []; const args: (string | number)[] = [];
  if (opts.userId) { where.push('(a.user_id = ? OR a.data LIKE ?)'); args.push(opts.userId, `%"user":"${opts.userId}"%`); }
  if (opts.event) { where.push('a.event LIKE ?'); args.push(`${opts.event}%`); }
  if (opts.before) { where.push('a.id < ?'); args.push(opts.before); }
  const rows = db.prepare(`SELECT a.*, u.display_name AS name FROM audit a LEFT JOIN users u ON u.id = a.user_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT ?`)
    .all(...args, Math.min(200, opts.limit ?? 100)) as { id: number; user_id: string | null; name: string | null; event: string; data: string; created_at: number }[];
  return rows.map((r) => ({ id: r.id, userId: r.user_id, name: r.name, event: r.event, data: JSON.parse(r.data ?? 'null'), createdAt: r.created_at }));
}
