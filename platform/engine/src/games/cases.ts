/**
 * Cases (case opening) and Case Battle.
 *
 * A case lists items with integer ticket weights. One float per opening:
 *   ticket = ⌊f · W⌋,  W = Σ weights  → the item whose cumulative range contains the ticket.
 *   EV     = Σ w_i · value_i / W
 *   price  = ⌈EV / (1 − e)⌉  (whole Scrap)  ⇒  RTP = EV / price ≤ 1 − e
 * Values and prices are integer Scrap (1 Scrap = 0.01 $). Rounding the price up costs at most one Scrap,
 * i.e. < 1/price of RTP (0.3 pp on a 3 $ case, 0.001 pp on a 1 000 $ case). Item values must be
 * re-priced from the skin price feed on a schedule, and case prices recomputed with priceCase().
 *
 * Battles: every seat opens the same cases in the same order; floats are drawn round by round,
 * seat by seat, from one PvP stream. Payout splits the total pool:
 *   normal   — highest total wins everything
 *   crazy    — lowest total wins everything
 *   terminal — highest value in the final round wins everything
 *   team     — 2 vs 2 (4 seats; seats 1–2 against 3–4): the team with the higher combined total
 *              wins and its two players split the pool; a tie between the teams splits it four ways
 *   bonus    — 2 to 4 seats, five features on top of the openings (see BONUS):
 *              power rounds  each round draws a points multiplier ×1 / ×2 / ×3 / ×5 before it opens
 *              golden round  the last round's multiplier counts double
 *              jackpot drop  pulling a crate's top item pays that item to its opener, outside the pool
 *              final spin    the rest of the pool goes to one seat drawn on a wheel; each seat's slice is
 *                            its share of the points (all zero → equal slices)
 *              scrap back    10 % of that rest is split evenly between the seats the wheel did not pick
 * Ties split equally. Seats are symmetric, so each seat's expected return equals the cases' RTP.
 *
 * Why the bonus mode keeps the house edge: the house earns only the crate prices minus the drops. Every
 * bonus feature moves value between seats and never adds or removes any: jackpot drops + the rest of the
 * pool = the pool, and the spin hands out exactly that rest. Multipliers and the spin treat every seat
 * the same way and seat order changes nothing (a seat's slice is its share, wherever it sits on the
 * wheel), so the seats are exchangeable: E[payout per seat] = E[pool] / seats = Σ EV(cases), the same RTP
 * as opening the crates. The extra floats are drawn only in bonus mode (one before each round, one for
 * the spin), so the other modes replay exactly as before.
 */

import { EDGE } from '../config';
import type { FloatSource } from '../pf/stream';
import { CASE_LINEUP } from './case-lineup';

export interface CaseItem {
  name: string;
  value: number; // Scrap (integer, 1 Scrap = 0.01 $)
  weight: number; // integer tickets
}

export interface CaseDef {
  id: string;
  name: string;
  items: CaseItem[];
}

export const caseWeight = (c: CaseDef): number => c.items.reduce((s, i) => s + i.weight, 0);
export const caseEv = (c: CaseDef): number => c.items.reduce((s, i) => s + i.weight * i.value, 0) / caseWeight(c);
export const priceCase = (c: CaseDef, edge = EDGE.cases): number => Math.ceil(caseEv(c) / (1 - edge));
export const caseRtp = (c: CaseDef, edge = EDGE.cases): number => caseEv(c) / priceCase(c, edge);

export function openCase(src: FloatSource, c: CaseDef): { ticket: number; item: CaseItem } {
  const W = caseWeight(c);
  const ticket = Math.floor(src.next() * W);
  let acc = 0;
  for (const item of c.items) {
    acc += item.weight;
    if (ticket < acc) return { ticket, item };
  }
  throw new Error('unreachable: ticket beyond weight total');
}

export type BattleMode = 'normal' | 'crazy' | 'terminal' | 'team' | 'bonus';

/** Bonus mode tables. POWER_SLOTS: a round's multiplier is POWER_SLOTS[⌊f · 20⌋] (×1 50 %, ×2 30 %, ×3 15 %, ×5 5 %). */
export const BONUS = {
  POWER_SLOTS: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 5],
  GOLDEN_FACTOR: 2,
  SCRAP_BACK: 0.1,
} as const;

/** The most valuable item(s) of a case: the jackpot drop in bonus mode. */
export const caseTopValue = (c: CaseDef): number => Math.max(...c.items.map((i) => i.value));

export interface BonusDetail {
  powers: number[]; // points multiplier per round, golden factor included
  jackpots: boolean[][]; // [round][seat]: the drop was the crate's top item and went to its opener
  points: number[]; // per seat: Σ power × value
  shares: number[]; // per seat: slice of the wheel
  spin: number; // the float that stopped the wheel
  jackpotPaid: number[]; // per seat: Σ of its jackpot drops
  rest: number; // pool − jackpot drops, handed out by the spin
}

/** Team of a seat in team mode: seats 0–1 are team 0, seats 2–3 team 1. */
export const battleTeam = (seat: number): number => (seat < 2 ? 0 : 1);

export interface BattleOutcome {
  drops: CaseItem[][]; // [round][seat]
  totals: number[];
  winners: number[];
  payouts: number[]; // Scrap per seat (ties may produce fractions; the wallet settles in milli-Scrap)
  bonus?: BonusDetail;
}

export function playBattle(src: FloatSource, cases: CaseDef[], seats: number, mode: BattleMode): BattleOutcome {
  if (seats < 2 || seats > 4) throw new RangeError('2 to 4 seats');
  if (mode === 'team' && seats !== 4) throw new RangeError('team battles need 4 seats');
  if (mode === 'bonus') return playBonusBattle(src, cases, seats);
  const drops: CaseItem[][] = [];
  const totals = new Array(seats).fill(0);
  for (const c of cases) {
    const round: CaseItem[] = [];
    for (let s = 0; s < seats; s++) {
      const { item } = openCase(src, c);
      round.push(item);
      totals[s] += item.value;
    }
    drops.push(round);
  }
  const teamTotals = [0, 0];
  totals.forEach((t, i) => { teamTotals[battleTeam(i)] += t; });
  const score = mode === 'terminal' ? drops[drops.length - 1].map((i) => i.value) : mode === 'team' ? totals.map((_, i) => teamTotals[battleTeam(i)]) : totals;
  const best = mode === 'crazy' ? Math.min(...score) : Math.max(...score);
  const winners = score.flatMap((v, i) => (v === best ? [i] : []));
  const pool = totals.reduce((a, b) => a + b, 0);
  const payouts = totals.map((_, i) => (winners.includes(i) ? pool / winners.length : 0));
  return { drops, totals, winners, payouts };
}

/** The seat a spin float lands on: slices in seat order, each as wide as the seat's share. */
export function spinSeat(spin: number, shares: number[]): number {
  let acc = 0;
  for (let s = 0; s < shares.length; s++) {
    acc += shares[s];
    if (spin < acc) return s;
  }
  return shares.length - 1; // float rounding left a sliver past the last slice
}

/** Float order: per round one power float, then one float per seat; one spin float at the end. */
function playBonusBattle(src: FloatSource, cases: CaseDef[], seats: number): BattleOutcome {
  const drops: CaseItem[][] = [];
  const jackpots: boolean[][] = [];
  const powers: number[] = [];
  const totals = new Array(seats).fill(0);
  const points = new Array(seats).fill(0);
  const jackpotPaid = new Array(seats).fill(0);
  cases.forEach((c, r) => {
    const slot = BONUS.POWER_SLOTS[Math.floor(src.next() * BONUS.POWER_SLOTS.length)];
    const power = r === cases.length - 1 ? slot * BONUS.GOLDEN_FACTOR : slot;
    powers.push(power);
    const top = caseTopValue(c);
    const round: CaseItem[] = [];
    const jp: boolean[] = [];
    for (let s = 0; s < seats; s++) {
      const { item } = openCase(src, c);
      round.push(item);
      totals[s] += item.value;
      points[s] += power * item.value;
      const hit = item.value === top;
      jp.push(hit);
      if (hit) jackpotPaid[s] += item.value;
    }
    drops.push(round);
    jackpots.push(jp);
  });
  const pool = totals.reduce((a, b) => a + b, 0);
  const rest = pool - jackpotPaid.reduce((a, b) => a + b, 0);
  const sum = points.reduce((a, b) => a + b, 0);
  const shares = points.map((p) => (sum > 0 ? p / sum : 1 / seats));
  const spin = src.next();
  const winner = spinSeat(spin, shares);
  const back = (rest * BONUS.SCRAP_BACK) / (seats - 1);
  const payouts = jackpotPaid.map((j, s) => j + (s === winner ? rest - back * (seats - 1) : back));
  return { drops, totals, winners: [winner], payouts, bonus: { powers, jackpots, points, shares, spin, jackpotPaid, rest } };
}

/**
 * The SCRAPLINE crate line-up: twenty crates named after Rust loot containers and monuments, priced
 * 1 $ to 1 500 $ (100 to 150 000 Scrap), each at a 93.00 % RTP. Every item is a real Rust skin with a picture,
 * worth its market price × ITEM_VALUE_BOOST; the weights were solved so every price lands on its step of the
 * ladder (engine tests check price, RTP and every ticket). Generated into case-lineup.ts by
 * `npm run build-crates` in platform/server.
 */
export const SAMPLE_CASES: CaseDef[] = CASE_LINEUP;
