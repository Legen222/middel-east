/**
 * Daily operator report (UTC days): wagered, paid, GGR, bonus cost, NGR and player counts, overall and
 * per game. Bets count on the day they were placed and are included once settled. Bonus cost is every
 * reward claim (rakeback, daily case, rain, crew, promo codes) plus operator adjustments.
 */

import { MF_PER_FRAG } from './config';
import type { DB } from './db';
import { GAME_NAME, type GameId } from './flags';
import { ADJUSTMENTS } from './wallet';

const DAY = 86_400_000;
const f = (mf: number) => Number(mf) / MF_PER_FRAG;

export async function dailyReport(db: DB, days: number, now: number) {
  const n = Math.min(90, Math.max(1, Math.floor(days)));
  const from = Math.floor(now / DAY) * DAY - (n - 1) * DAY;
  const day = (col: string) => `(${col} / ${DAY})`; // integer division on BIGINT and SQLite INTEGER alike
  const games = (await db.prepare(`SELECT ${day('created_at')} AS d, game, COUNT(*) AS bets, COUNT(DISTINCT user_id) AS players,
      COALESCE(SUM(stake), 0) AS staked, COALESCE(SUM(payout), 0) AS paid
    FROM wagers WHERE settled = 1 AND created_at >= ? GROUP BY ${day('created_at')}, game`).all(from)) as { d: number; game: GameId; bets: number; players: number; staked: number; paid: number }[];
  const active = (await db.prepare(`SELECT ${day('created_at')} AS d, COUNT(DISTINCT user_id) AS n FROM wagers WHERE created_at >= ? GROUP BY ${day('created_at')}`).all(from)) as { d: number; n: number }[];
  const signups = (await db.prepare(`SELECT ${day('created_at')} AS d, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY ${day('created_at')}`).all(from)) as { d: number; n: number }[];
  const bonus = (await db.prepare(`SELECT ${day('created_at')} AS d, kind, COALESCE(SUM(amount), 0) AS s FROM reward_claims WHERE created_at >= ? GROUP BY ${day('created_at')}, kind`).all(from)) as { d: number; kind: string; s: number }[];
  // adjustments: what left the adjustments account (credits) minus what came back (debits)
  const adj = (await db.prepare(`SELECT ${day('created_at')} AS d, COALESCE(SUM(amount), 0) AS s FROM ledger WHERE account = ? AND created_at >= ? GROUP BY ${day('created_at')}`).all(ADJUSTMENTS, from)) as { d: number; s: number }[];

  const rows = Array.from({ length: n }, (_, k) => {
    const d = Math.floor(from / DAY) + n - 1 - k; // newest first
    const g = games.filter((x) => Number(x.d) === d);
    const staked = g.reduce((s, x) => s + Number(x.staked), 0);
    const paid = g.reduce((s, x) => s + Number(x.paid), 0);
    const bonuses = bonus.filter((x) => Number(x.d) === d);
    const bonusCost = bonuses.reduce((s, x) => s + Number(x.s), 0);
    const adjustments = -Number(adj.find((x) => Number(x.d) === d)?.s ?? 0);
    return {
      date: new Date(d * DAY).toISOString().slice(0, 10),
      bets: g.reduce((s, x) => s + Number(x.bets), 0),
      activePlayers: Number(active.find((x) => Number(x.d) === d)?.n ?? 0),
      signups: Number(signups.find((x) => Number(x.d) === d)?.n ?? 0),
      wagered: f(staked), paid: f(paid), ggr: f(staked - paid),
      bonusCost: f(bonusCost), adjustments: f(adjustments), ngr: f(staked - paid - bonusCost - adjustments),
      margin: staked ? (staked - paid) / staked : null,
      bonusByKind: Object.fromEntries(bonuses.map((x) => [x.kind, f(x.s)])),
      games: g.sort((a, b) => Number(b.staked) - Number(a.staked)).map((x) => ({
        game: x.game, name: GAME_NAME[x.game] ?? x.game, bets: Number(x.bets), players: Number(x.players), wagered: f(x.staked), paid: f(x.paid), ggr: f(x.staked - x.paid),
        rtp: Number(x.staked) ? Number(x.paid) / Number(x.staked) : null,
      })),
    };
  });
  const sum = (k: 'bets' | 'signups' | 'wagered' | 'paid' | 'ggr' | 'bonusCost' | 'adjustments' | 'ngr') => rows.reduce((s, r) => s + r[k], 0);
  return {
    days: n, from, now,
    totals: { bets: sum('bets'), signups: sum('signups'), wagered: sum('wagered'), paid: sum('paid'), ggr: sum('ggr'), bonusCost: sum('bonusCost'), adjustments: sum('adjustments'), ngr: sum('ngr') },
    rows,
  };
}
