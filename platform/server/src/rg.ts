/**
 * Responsible gambling.
 *   Limits  deposit / loss / wager per rolling day (24 h), week (7 d) or month (30 d).
 *           Setting a first limit or lowering one applies immediately. Raising or removing one only
 *           applies after the configured delay (24 h), so a limit cannot be lifted in the heat of a session.
 *   Blocks  cooldown 24 h … 6 weeks, self-exclusion 6 / 12 / 60 months or permanent. Neither can be
 *           shortened. While blocked: no bets, no deposits, no rain, no rakeback pushes, no promo mail.
 *   Reality check  interval 15/30/60/120 min (0 = off is not offered); the client shows the session summary.
 * Loss is counted conservatively: open bets count as fully lost until they settle.
 */

import type { Config } from './config';
import { type DB, audit, tx } from './db';
import { fail } from './errors';

export type LimitKind = 'deposit' | 'loss' | 'wager';
export type LimitPeriod = 'day' | 'week' | 'month';
export const PERIOD_MS: Record<LimitPeriod, number> = { day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000 };
const KINDS: LimitKind[] = ['deposit', 'loss', 'wager'];
const PERIODS: LimitPeriod[] = ['day', 'week', 'month'];
const HOUR = 3_600_000;

interface LimitRow { kind: LimitKind; period: LimitPeriod; amount: number | null; pending_amount: number | null; pending_at: number | null }

function applyDue(db: DB, userId: string, now: number): void {
  const due = db.prepare('SELECT * FROM rg_limits WHERE user_id = ? AND pending_at IS NOT NULL AND pending_at <= ?').all(userId, now) as unknown as LimitRow[];
  for (const r of due) {
    const amount = r.pending_amount === -1 ? null : r.pending_amount;
    db.prepare('UPDATE rg_limits SET amount = ?, pending_amount = NULL, pending_at = NULL WHERE user_id = ? AND kind = ? AND period = ?').run(amount, userId, r.kind, r.period);
    audit(db, userId, 'rg_limit_applied', { kind: r.kind, period: r.period, amount }, now);
  }
}

export function getLimits(db: DB, userId: string, now: number) {
  applyDue(db, userId, now);
  const rows = db.prepare('SELECT kind, period, amount, pending_amount, pending_at FROM rg_limits WHERE user_id = ?').all(userId) as unknown as LimitRow[];
  return rows.map((r) => ({
    kind: r.kind, period: r.period, amount: r.amount,
    pending: r.pending_at ? { amount: r.pending_amount === -1 ? null : r.pending_amount, effectiveAt: r.pending_at } : null,
    used: usage(db, userId, r.kind, r.period, now),
  }));
}

export function setLimit(db: DB, cfg: Config, userId: string, kind: LimitKind, period: LimitPeriod, amount: number | null, now: number) {
  if (!KINDS.includes(kind) || !PERIODS.includes(period)) fail('invalid_limit', 'Unknown limit type or period.');
  if (amount !== null && (!Number.isSafeInteger(amount) || amount <= 0)) fail('invalid_limit', 'A limit must be a positive number.');
  return tx(db, () => {
    applyDue(db, userId, now);
    const cur = db.prepare('SELECT amount FROM rg_limits WHERE user_id = ? AND kind = ? AND period = ?').get(userId, kind, period) as { amount: number | null } | undefined;
    const active = cur?.amount ?? null;
    const tighter = amount !== null && (active === null || amount <= active);
    if (tighter) {
      db.prepare(`INSERT INTO rg_limits (user_id, kind, period, amount) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, kind, period) DO UPDATE SET amount = excluded.amount, pending_amount = NULL, pending_at = NULL`).run(userId, kind, period, amount);
      audit(db, userId, 'rg_limit_set', { kind, period, amount }, now);
      return { applied: 'now' as const, effectiveAt: now };
    }
    const at = now + cfg.limitIncreaseDelayHours * HOUR;
    db.prepare(`INSERT INTO rg_limits (user_id, kind, period, amount, pending_amount, pending_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, kind, period) DO UPDATE SET pending_amount = excluded.pending_amount, pending_at = excluded.pending_at`)
      .run(userId, kind, period, active, amount ?? -1, at);
    audit(db, userId, 'rg_limit_pending', { kind, period, amount, at }, now);
    return { applied: 'delayed' as const, effectiveAt: at };
  });
}

function usage(db: DB, userId: string, kind: LimitKind, period: LimitPeriod, now: number): number {
  const since = now - PERIOD_MS[period];
  if (kind === 'deposit') {
    return (db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE account = ? AND kind = 'deposit' AND amount > 0 AND created_at >= ?").get(`user:${userId}`, since) as { s: number }).s;
  }
  const r = db.prepare('SELECT COALESCE(SUM(stake), 0) AS staked, COALESCE(SUM(payout), 0) AS paid FROM wagers WHERE user_id = ? AND created_at >= ?').get(userId, since) as { staked: number; paid: number };
  return kind === 'wager' ? r.staked : Math.max(0, r.staked - r.paid);
}

export type BlockKind = 'cooldown' | 'exclusion' | 'operator';

/** Longest running block. Self-exclusion wins over an operator hold, which wins over a cooldown, at equal length. */
export function activeBlock(db: DB, userId: string, now: number): { kind: BlockKind; until: number | null } | null {
  const row = db.prepare(`SELECT kind, until_at FROM rg_blocks WHERE user_id = ? AND (until_at IS NULL OR until_at > ?)
    ORDER BY until_at IS NULL DESC, until_at DESC, CASE kind WHEN 'exclusion' THEN 0 WHEN 'operator' THEN 1 ELSE 2 END LIMIT 1`).get(userId, now) as { kind: BlockKind; until_at: number | null } | undefined;
  return row ? { kind: row.kind, until: row.until_at } : null;
}

export function assertNotBlocked(db: DB, userId: string, now: number): void {
  const b = activeBlock(db, userId, now);
  if (b) {
    const when = b.until ? `until ${new Date(b.until).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'permanently';
    if (b.kind === 'operator') fail('account_hold', `Your account is on hold (${when}). Please contact support.`, 403, { until: b.until });
    fail(b.kind === 'cooldown' ? 'rg_cooldown' : 'rg_excluded', b.kind === 'cooldown' ? `You are on a break (${when}).` : `Your account is closed (self-exclusion, ${when}).`, 403, { until: b.until });
  }
}

/** Checks every limit a bet of `stake` could break. Runs inside the bet transaction. */
export function checkBet(db: DB, userId: string, stake: number, now: number): void {
  assertNotBlocked(db, userId, now);
  applyDue(db, userId, now);
  const rows = db.prepare("SELECT kind, period, amount FROM rg_limits WHERE user_id = ? AND kind IN ('loss', 'wager') AND amount IS NOT NULL").all(userId) as unknown as LimitRow[];
  for (const r of rows) {
    const used = usage(db, userId, r.kind, r.period, now);
    if (used + stake > r.amount!) {
      const label = r.kind === 'loss' ? 'Loss limit' : 'Wager limit';
      fail('rg_limit', `${label} (${periodLabel(r.period)}) reached: ${Math.max(0, r.amount! - used) / 1000} Frags left.`, 403, { kind: r.kind, period: r.period, limit: r.amount, used });
    }
  }
}

export function checkDeposit(db: DB, userId: string, amount: number, now: number): void {
  assertNotBlocked(db, userId, now);
  applyDue(db, userId, now);
  const rows = db.prepare("SELECT kind, period, amount FROM rg_limits WHERE user_id = ? AND kind = 'deposit' AND amount IS NOT NULL").all(userId) as unknown as LimitRow[];
  for (const r of rows) {
    const used = usage(db, userId, 'deposit', r.period, now);
    if (used + amount > r.amount!) fail('rg_limit', `Deposit limit (${periodLabel(r.period)}) reached.`, 403, { kind: 'deposit', period: r.period, limit: r.amount, used });
  }
}

const periodLabel = (p: LimitPeriod) => ({ day: 'day', week: 'week', month: 'month' })[p];

export function startCooldown(db: DB, userId: string, hours: number, now: number) {
  if (!Number.isInteger(hours) || hours < 24 || hours > 24 * 42) fail('invalid_cooldown', 'Break: 24 hours to 6 weeks.');
  return tx(db, () => {
    const until = now + hours * HOUR;
    db.prepare("INSERT INTO rg_blocks (user_id, kind, until_at, created_at) VALUES (?, 'cooldown', ?, ?)").run(userId, until, now);
    audit(db, userId, 'rg_cooldown', { hours, until }, now);
    return { kind: 'cooldown', until };
  });
}

export function selfExclude(db: DB, userId: string, months: 6 | 12 | 60 | null, now: number) {
  if (months !== null && ![6, 12, 60].includes(months)) fail('invalid_exclusion', 'Self-exclusion: 6, 12 or 60 months, or permanent.');
  return tx(db, () => {
    const until = months === null ? null : now + months * 30 * 86_400_000;
    db.prepare("INSERT INTO rg_blocks (user_id, kind, until_at, created_at) VALUES (?, 'exclusion', ?, ?)").run(userId, until, now);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    audit(db, userId, 'rg_self_exclusion', { months, until }, now);
    return { kind: 'exclusion', until };
  });
}

export const REALITY_CHECK_OPTIONS = [15, 30, 60, 120];

export function setRealityCheck(db: DB, userId: string, minutes: number, now: number): void {
  if (!REALITY_CHECK_OPTIONS.includes(minutes)) fail('invalid_reality_check', 'Reality check: 15, 30, 60 or 120 minutes.');
  db.prepare('INSERT INTO rg_settings (user_id, reality_check_minutes) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET reality_check_minutes = excluded.reality_check_minutes').run(userId, minutes);
  audit(db, userId, 'rg_reality_check', { minutes }, now);
}

export function sessionSummary(db: DB, userId: string, sessionStart: number, now: number) {
  const r = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(stake), 0) AS staked, COALESCE(SUM(payout), 0) AS paid FROM wagers WHERE user_id = ? AND created_at >= ?').get(userId, sessionStart) as { n: number; staked: number; paid: number };
  const s = db.prepare('SELECT reality_check_minutes AS m FROM rg_settings WHERE user_id = ?').get(userId) as { m: number } | undefined;
  const interval = (s?.m ?? 60) * 60_000;
  const elapsed = now - sessionStart;
  return { startedAt: sessionStart, elapsedMs: elapsed, bets: r.n, wagered: r.staked, net: r.paid - r.staked, realityCheckMinutes: interval / 60_000, nextRealityCheckAt: sessionStart + (Math.floor(elapsed / interval) + 1) * interval };
}

/** Rain, rakeback pushes and promo mail are off while a cooldown or exclusion runs. */
export const promoEligible = (db: DB, userId: string, now: number): boolean => activeBlock(db, userId, now) === null;
