/**
 * Cases (case opening) and Case Battle.
 *
 * A case lists items with integer ticket weights. One float per opening:
 *   ticket = ⌊f · W⌋,  W = Σ weights  → the item whose cumulative range contains the ticket.
 *   EV     = Σ w_i · value_i / W
 *   price  = ⌈EV / (1 − e)⌉  (whole Frags)  ⇒  RTP = EV / price ≤ 1 − e
 * Values and prices are integer Frags (1 Frag = 0.01 $). Rounding the price up costs at most one Frag,
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
 * Ties split equally. Seats are symmetric, so each seat's expected return equals the cases' RTP.
 */

import { EDGE } from '../config';
import type { FloatSource } from '../pf/stream';

export interface CaseItem {
  name: string;
  value: number; // Frags (integer, 1 Frag = 0.01 $)
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

export type BattleMode = 'normal' | 'crazy' | 'terminal' | 'team';

/** Team of a seat in team mode: seats 0–1 are team 0, seats 2–3 team 1. */
export const battleTeam = (seat: number): number => (seat < 2 ? 0 : 1);

export interface BattleOutcome {
  drops: CaseItem[][]; // [round][seat]
  totals: number[];
  winners: number[];
  payouts: number[]; // Frags per seat (ties may produce fractions; the wallet settles in milli-Frags)
}

export function playBattle(src: FloatSource, cases: CaseDef[], seats: number, mode: BattleMode): BattleOutcome {
  if (seats < 2 || seats > 4) throw new RangeError('2 to 4 seats');
  if (mode === 'team' && seats !== 4) throw new RangeError('team battles need 4 seats');
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

/** Example SCRAPLINE cases. Item values are placeholders until the price feed is connected. */
export const SAMPLE_CASES: CaseDef[] = [
  {
    id: 'toolbox',
    name: 'Toolbox',
    items: [
      { name: 'Tape Hoodie', value: 40, weight: 42000 },
      { name: 'Rusty Hatchet', value: 90, weight: 26000 },
      { name: 'Scrap Pants', value: 150, weight: 16000 },
      { name: 'Workshop Gloves', value: 320, weight: 9000 },
      { name: 'Big Grin Door', value: 1240, weight: 5000 },
      { name: 'Tempered MP5', value: 5000, weight: 1600 },
      { name: 'Glory AK', value: 21000, weight: 400 },
    ],
  },
  {
    id: 'military-crate',
    name: 'Military Crate',
    items: [
      { name: 'Camo Bandana', value: 120, weight: 38000 },
      { name: 'No Mercy Box', value: 310, weight: 27000 },
      { name: 'Hazmat Visor', value: 600, weight: 17000 },
      { name: 'Alien Red', value: 1900, weight: 10000 },
      { name: 'Night Stalker', value: 4200, weight: 5500 },
      { name: 'Tempered AK', value: 8420, weight: 2200 },
      { name: 'Glory AK', value: 21000, weight: 300 },
    ],
  },
  {
    id: 'elite-crate',
    name: 'Elite Crate',
    items: [
      { name: 'Alien Red', value: 1900, weight: 40000 },
      { name: 'Night Stalker', value: 4200, weight: 30000 },
      { name: 'Tempered AK', value: 8420, weight: 18000 },
      { name: 'Neon AK', value: 6610, weight: 8000 },
      { name: 'Glory AK', value: 21000, weight: 3500 },
      { name: 'Tempered MP5', value: 12050, weight: 500 },
    ],
  },
  {
    id: 'vault',
    name: 'Vault',
    items: [
      { name: 'Tempered AK', value: 8420, weight: 50000 },
      { name: 'Glory AK', value: 21000, weight: 30000 },
      { name: 'Big Grin Door', value: 1240, weight: 12000 },
      { name: 'Complete Blueprint Set', value: 120000, weight: 8000 },
    ],
  },
  {
    id: 'scrap-box',
    name: 'Scrap Box',
    items: [
      { name: 'Burlap Shirt', value: 4, weight: 40000 },
      { name: 'Leather Gloves', value: 8, weight: 25000 },
      { name: 'Snow Jacket', value: 15, weight: 15000 },
      { name: 'Road Sign Kilt', value: 35, weight: 10000 },
      { name: 'Metal Facemask', value: 90, weight: 7000 },
      { name: 'Tempered Hatchet', value: 260, weight: 2700 },
      { name: 'Alien Red', value: 1900, weight: 300 },
    ],
  },
  {
    id: 'road-sign',
    name: 'Road Sign',
    items: [
      { name: 'Road Sign Gloves', value: 20, weight: 36000 },
      { name: 'Road Sign Kilt', value: 35, weight: 26000 },
      { name: 'Coffee Can Helmet', value: 60, weight: 17000 },
      { name: 'Road Sign Vest', value: 130, weight: 12000 },
      { name: 'Metal Chest Plate', value: 420, weight: 6500 },
      { name: 'No Mercy Jacket', value: 1200, weight: 2200 },
      { name: 'Big Grin Door', value: 1240, weight: 300 },
    ],
  },
  {
    id: 'tech-trash',
    name: 'Tech Trash',
    items: [
      { name: 'Tech Trash', value: 50, weight: 35000 },
      { name: 'Targeting Computer', value: 140, weight: 26000 },
      { name: 'CCTV Camera', value: 260, weight: 18000 },
      { name: 'Laser Sight', value: 520, weight: 12000 },
      { name: 'Hazmat Visor', value: 600, weight: 6000 },
      { name: 'Alien Red', value: 1900, weight: 2600 },
      { name: 'Tempered MP5', value: 5000, weight: 400 },
    ],
  },
  {
    id: 'locked-crate',
    name: 'Locked Crate',
    items: [
      { name: 'Hazmat Visor', value: 600, weight: 36000 },
      { name: 'Alien Red', value: 1900, weight: 26000 },
      { name: 'Night Stalker', value: 4200, weight: 18000 },
      { name: 'Neon AK', value: 6610, weight: 12000 },
      { name: 'Tempered AK', value: 8420, weight: 6500 },
      { name: 'Glory AK', value: 21000, weight: 1400 },
      { name: 'Complete Blueprint Set', value: 120000, weight: 100 },
    ],
  },
  {
    id: 'bradley-crate',
    name: 'Bradley Crate',
    items: [
      { name: 'Metal Chest Plate', value: 420, weight: 30000 },
      { name: 'No Mercy Jacket', value: 1200, weight: 28000 },
      { name: 'Night Stalker', value: 4200, weight: 20000 },
      { name: 'Tempered MP5', value: 5000, weight: 12000 },
      { name: 'Tempered AK', value: 8420, weight: 8000 },
      { name: 'Glory AK', value: 21000, weight: 2000 },
    ],
  },
  {
    id: 'cargo-ship',
    name: 'Cargo Ship',
    items: [
      { name: 'Neon AK', value: 6610, weight: 30000 },
      { name: 'Tempered AK', value: 8420, weight: 20000 },
      { name: 'Glory AK', value: 21000, weight: 45000 },
      { name: 'Complete Blueprint Set', value: 120000, weight: 5000 },
    ],
  },
];
