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
  payouts: number[]; // Frags per seat (ties may produce fractions; the wallet settles in milli-Frags)
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
 * 1 € to 1 500 € (100 to 150 000 Frags), each at a 93.00 % RTP. Item names are Rust items and skins; the
 * values are placeholders until the skin price feed is connected, and the weights were solved so every
 * price lands on its step of the ladder (engine tests check price, RTP and every ticket).
 */
export const SAMPLE_CASES: CaseDef[] = [
  {
    id: 'barrel',
    name: 'Barrel',
    items: [
      { name: 'Bandage', value: 5, weight: 25468 },
      { name: 'Burlap Shirt', value: 6, weight: 22852 },
      { name: 'Hide Boots', value: 8, weight: 16712 },
      { name: 'Rope', value: 15, weight: 12559 },
      { name: 'Revolver', value: 70, weight: 11230 },
      { name: 'Python Revolver', value: 220, weight: 6984 },
      { name: 'Assault Rifle', value: 900, weight: 3426 },
      { name: 'Alien Red', value: 4300, weight: 769 },
    ],
  },
  {
    id: 'oil-barrel',
    name: 'Oil Barrel',
    items: [
      { name: 'Low Grade Fuel', value: 9, weight: 21465 },
      { name: 'Metal Fragments', value: 15, weight: 20022 },
      { name: 'Metal Pipe', value: 35, weight: 18792 },
      { name: 'Metal Spring', value: 50, weight: 13811 },
      { name: 'Double Barrel Shotgun', value: 90, weight: 10812 },
      { name: 'Thompson', value: 260, weight: 9030 },
      { name: 'Rocket Launcher', value: 1800, weight: 4597 },
      { name: 'AK-47 From Hell', value: 3509, weight: 1471 },
    ],
  },
  {
    id: 'wooden-crate',
    name: 'Wooden Crate',
    items: [
      { name: 'Leather Gloves', value: 10, weight: 12721 },
      { name: 'Sewing Kit', value: 25, weight: 14776 },
      { name: 'Road Sign Kilt', value: 40, weight: 14795 },
      { name: 'Semi-Automatic Pistol', value: 120, weight: 17104 },
      { name: 'Custom SMG', value: 240, weight: 15933 },
      { name: 'Semi-Automatic Rifle', value: 320, weight: 12014 },
      { name: 'Bolt Action Rifle', value: 850, weight: 9128 },
      { name: 'No Mercy Jacket', value: 3962, weight: 3529 },
    ],
  },
  {
    id: 'ration-box',
    name: 'Ration Box',
    items: [
      { name: 'Bandage', value: 5, weight: 5426 },
      { name: 'Medical Syringe', value: 40, weight: 14207 },
      { name: 'Large Medkit', value: 90, weight: 18076 },
      { name: 'Road Sign Jacket', value: 60, weight: 11277 },
      { name: 'Hazmat Suit', value: 300, weight: 19329 },
      { name: 'Metal Facemask', value: 480, weight: 14976 },
      { name: 'Timed Explosive Charge', value: 950, weight: 10855 },
      { name: 'Press Vest', value: 3468, weight: 5854 },
    ],
  },
  {
    id: 'food-box',
    name: 'Food Box',
    items: [
      { name: 'Burlap Trousers', value: 6, weight: 10456 },
      { name: 'Coffee Can Helmet', value: 45, weight: 14507 },
      { name: 'Python Revolver', value: 220, weight: 21150 },
      { name: 'Semi-Automatic Rifle', value: 320, weight: 18408 },
      { name: 'Metal Chest Plate', value: 420, weight: 14266 },
      { name: 'Assault Rifle', value: 900, weight: 12552 },
      { name: 'Blackout Pants', value: 3037, weight: 6458 },
      { name: 'Tempered AK47', value: 9800, weight: 2203 },
    ],
  },
  {
    id: 'toolbox',
    name: 'Tool Box',
    items: [
      { name: 'Gears', value: 30, weight: 15997 },
      { name: 'Metal Spring', value: 50, weight: 15382 },
      { name: 'Tech Trash', value: 45, weight: 13359 },
      { name: 'Satchel Charge', value: 120, weight: 13866 },
      { name: 'Auto Turret', value: 520, weight: 16641 },
      { name: 'LR-300 Assault Rifle', value: 1100, weight: 13149 },
      { name: 'Desert Raiders Hoodie', value: 3081, weight: 8853 },
      { name: 'Frostbite Facemask', value: 14200, weight: 2753 },
    ],
  },
  {
    id: 'medical-crate',
    name: 'Medical Crate',
    items: [
      { name: 'Large Medkit', value: 90, weight: 13772 },
      { name: 'Hazmat Suit', value: 300, weight: 17749 },
      { name: 'Holosight', value: 180, weight: 11485 },
      { name: 'Armored Door', value: 600, weight: 16683 },
      { name: 'Timed Explosive Charge', value: 950, weight: 15937 },
      { name: 'M39 Rifle', value: 1200, weight: 11201 },
      { name: 'AK-47 From Hell', value: 3509, weight: 10101 },
      { name: 'Whiteout Facemask', value: 18500, weight: 3072 },
    ],
  },
  {
    id: 'military-crate',
    name: 'Military Crate',
    items: [
      { name: 'Weapon Lasersight', value: 210, weight: 14410 },
      { name: 'Rocket', value: 380, weight: 15507 },
      { name: 'Auto Turret', value: 520, weight: 15131 },
      { name: 'Assault Rifle', value: 900, weight: 16955 },
      { name: 'L96 Rifle', value: 1500, weight: 15533 },
      { name: 'Rocket Launcher', value: 1800, weight: 10702 },
      { name: 'Neon Boom Storage', value: 3785, weight: 8454 },
      { name: 'Glory AK47', value: 24000, weight: 3308 },
    ],
  },
  {
    id: 'supply-drop',
    name: 'Supply Drop',
    items: [
      { name: 'Supply Signal', value: 250, weight: 12637 },
      { name: 'Timed Explosive Charge', value: 950, weight: 18849 },
      { name: 'Assault Rifle', value: 900, weight: 15705 },
      { name: 'L96 Rifle', value: 1500, weight: 15630 },
      { name: 'Multiple Grenade Launcher', value: 2200, weight: 14155 },
      { name: 'Forest Raiders Pants', value: 3914, weight: 11154 },
      { name: 'Desert Raiders Chest Plate', value: 6999, weight: 8895 },
      { name: 'Big Grin', value: 28000, weight: 2975 },
    ],
  },
  {
    id: 'elite-crate',
    name: 'Elite Crate',
    items: [
      { name: 'Assault Rifle', value: 900, weight: 16302 },
      { name: 'M39 Rifle', value: 1200, weight: 15494 },
      { name: 'Rocket Launcher', value: 1800, weight: 15832 },
      { name: 'M249', value: 2600, weight: 15413 },
      { name: 'Whiteout Helmet', value: 3924, weight: 14604 },
      { name: 'Double Door from Hell', value: 4099, weight: 10834 },
      { name: 'Forest Raiders Helmet', value: 6693, weight: 7617 },
      { name: 'Punishment Mask', value: 42000, weight: 3904 },
    ],
  },
  {
    id: 'locked-crate',
    name: 'Locked Crate',
    items: [
      { name: 'L96 Rifle', value: 1500, weight: 17216 },
      { name: 'M249', value: 2600, weight: 18296 },
      { name: 'Alien Red', value: 4300, weight: 19019 },
      { name: 'Forest Raiders Roadsign Gloves', value: 4607, weight: 16165 },
      { name: 'Forest Raiders Roadsign Vest', value: 6383, weight: 13011 },
      { name: 'Desert Raiders Facemask', value: 9124, weight: 9169 },
      { name: 'Glory AK47', value: 24000, weight: 5180 },
      { name: 'Desert Raiders Set', value: 19200, weight: 1944 },
    ],
  },
  {
    id: 'bradley-crate',
    name: 'Bradley Crate',
    items: [
      { name: 'M249', value: 2600, weight: 23135 },
      { name: 'Alien Red', value: 4300, weight: 20804 },
      { name: 'Forest Raiders Roadsign Vest', value: 6383, weight: 18570 },
      { name: 'Tempered AK47', value: 9800, weight: 15336 },
      { name: 'Desert Raiders Facemask', value: 9124, weight: 11263 },
      { name: 'Frostbite Facemask', value: 14200, weight: 7101 },
      { name: 'Big Grin', value: 28000, weight: 3000 },
      { name: 'Whiteout Set', value: 48000, weight: 791 },
    ],
  },
  {
    id: 'heli-crate',
    name: 'Heli Crate',
    items: [
      { name: 'Double Door from Hell', value: 4099, weight: 34840 },
      { name: 'Forest Raiders Helmet', value: 6693, weight: 24059 },
      { name: 'Tempered AK47', value: 9800, weight: 17511 },
      { name: 'Frostbite Facemask', value: 14200, weight: 11072 },
      { name: 'Whiteout Facemask', value: 18500, weight: 6822 },
      { name: 'Glory AK47', value: 24000, weight: 4130 },
      { name: 'Punishment Mask', value: 42000, weight: 1295 },
      { name: 'Tempered Set', value: 65000, weight: 271 },
    ],
  },
  {
    id: 'oil-rig',
    name: 'Large Oil Rig',
    items: [
      { name: 'Desert Raiders Chest Plate', value: 6999, weight: 30261 },
      { name: 'Tempered AK47', value: 9800, weight: 23392 },
      { name: 'Frostbite Facemask', value: 14200, weight: 17595 },
      { name: 'Whiteout Facemask', value: 18500, weight: 12903 },
      { name: 'Glory AK47', value: 24000, weight: 8344 },
      { name: 'Big Grin', value: 28000, weight: 5633 },
      { name: 'Whiteout Set', value: 48000, weight: 1628 },
      { name: 'Glory Set', value: 120000, weight: 244 },
    ],
  },
  {
    id: 'cargo-ship',
    name: 'Cargo Ship',
    items: [
      { name: 'Desert Raiders Facemask', value: 9124, weight: 30864 },
      { name: 'Frostbite Facemask', value: 14200, weight: 22653 },
      { name: 'Desert Raiders Set', value: 19200, weight: 17617 },
      { name: 'Glory AK47', value: 24000, weight: 13177 },
      { name: 'Big Grin', value: 28000, weight: 8969 },
      { name: 'Punishment Mask', value: 42000, weight: 4690 },
      { name: 'Tempered Set', value: 65000, weight: 1627 },
      { name: 'Glory Set', value: 120000, weight: 403 },
    ],
  },
  {
    id: 'underwater-lab',
    name: 'Underwater Lab',
    items: [
      { name: 'Whiteout Facemask', value: 18500, weight: 33495 },
      { name: 'Forest Raiders Set', value: 21600, weight: 26399 },
      { name: 'Big Grin', value: 28000, weight: 18723 },
      { name: 'Punishment Mask', value: 42000, weight: 10750 },
      { name: 'Whiteout Set', value: 48000, weight: 6973 },
      { name: 'Tempered Set', value: 65000, weight: 2879 },
      { name: 'Glory Set', value: 120000, weight: 683 },
      { name: 'Punishment Set', value: 210000, weight: 98 },
    ],
  },
  {
    id: 'launch-site',
    name: 'Launch Site',
    items: [
      { name: 'Glory AK47', value: 24000, weight: 27715 },
      { name: 'Big Grin', value: 28000, weight: 23872 },
      { name: 'Punishment Mask', value: 42000, weight: 18770 },
      { name: 'Whiteout Set', value: 48000, weight: 14956 },
      { name: 'Tempered Set', value: 65000, weight: 9905 },
      { name: 'Glory Set', value: 120000, weight: 3664 },
      { name: 'Punishment Set', value: 210000, weight: 911 },
      { name: 'Raiders Collection', value: 340000, weight: 207 },
    ],
  },
  {
    id: 'large-present',
    name: 'Large Present',
    items: [
      { name: 'Big Grin', value: 28000, weight: 26156 },
      { name: 'Punishment Mask', value: 42000, weight: 22946 },
      { name: 'Whiteout Set', value: 48000, weight: 20429 },
      { name: 'Tempered Set', value: 65000, weight: 16589 },
      { name: 'Glory Set', value: 120000, weight: 9446 },
      { name: 'Punishment Set', value: 210000, weight: 3002 },
      { name: 'Raiders Collection', value: 340000, weight: 1152 },
      { name: 'Gold Collection', value: 480000, weight: 280 },
    ],
  },
  {
    id: 'missile-silo',
    name: 'Missile Silo',
    items: [
      { name: 'Punishment Mask', value: 42000, weight: 23147 },
      { name: 'Whiteout Set', value: 48000, weight: 23472 },
      { name: 'Tempered Set', value: 65000, weight: 21885 },
      { name: 'Glory Set', value: 120000, weight: 18258 },
      { name: 'Punishment Set', value: 210000, weight: 8342 },
      { name: 'Raiders Collection', value: 340000, weight: 3673 },
      { name: 'Gold Collection', value: 480000, weight: 1223 },
    ],
  },
  {
    id: 'gold-egg',
    name: 'Gold Egg',
    items: [
      { name: 'Whiteout Set', value: 48000, weight: 20888 },
      { name: 'Tempered Set', value: 65000, weight: 23289 },
      { name: 'Glory Set', value: 120000, weight: 26104 },
      { name: 'Punishment Set', value: 210000, weight: 17721 },
      { name: 'Raiders Collection', value: 340000, weight: 8424 },
      { name: 'Gold Collection', value: 480000, weight: 3574 },
    ],
  },
];
