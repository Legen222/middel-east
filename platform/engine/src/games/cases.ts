/**
 * Kisten (case opening) and Kisten-Battle.
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

export type BattleMode = 'normal' | 'crazy' | 'terminal';

export interface BattleOutcome {
  drops: CaseItem[][]; // [round][seat]
  totals: number[];
  winners: number[];
  payouts: number[]; // Frags per seat (ties may produce fractions; the wallet settles in milli-Frags)
}

export function playBattle(src: FloatSource, cases: CaseDef[], seats: number, mode: BattleMode): BattleOutcome {
  if (seats < 2 || seats > 4) throw new RangeError('2 to 4 seats');
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
  const score = mode === 'terminal' ? drops[drops.length - 1].map((i) => i.value) : totals;
  const best = mode === 'crazy' ? Math.min(...score) : Math.max(...score);
  const winners = score.flatMap((v, i) => (v === best ? [i] : []));
  const pool = totals.reduce((a, b) => a + b, 0);
  const payouts = totals.map((_, i) => (winners.includes(i) ? pool / winners.length : 0));
  return { drops, totals, winners, payouts };
}

/** Example SCRAPLINE cases. Item values are placeholders until the price feed is connected. */
export const SAMPLE_CASES: CaseDef[] = [
  {
    id: 'werkzeugkiste',
    name: 'Werkzeugkiste',
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
    id: 'militaerkiste',
    name: 'Militärkiste',
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
    name: 'Elite-Crate',
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
    id: 'tresor',
    name: 'Tresor',
    items: [
      { name: 'Tempered AK', value: 8420, weight: 50000 },
      { name: 'Glory AK', value: 21000, weight: 30000 },
      { name: 'Big Grin Door', value: 1240, weight: 12000 },
      { name: 'Complete Blueprint Set', value: 120000, weight: 8000 },
    ],
  },
];
