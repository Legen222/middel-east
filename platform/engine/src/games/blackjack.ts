/**
 * Blackjack.
 * Rules: infinite deck — card = ⌊f · 52⌋, rank = card mod 13 + 1, values A = 1/11, 2–9, 10/J/Q/K = 10.
 *   Blackjack pays 3:2. Dealer stands on all 17s (S17). With an ace or a ten up the dealer peeks: on a
 *   dealer blackjack the player loses only the original stake (a player blackjack pushes).
 *   Double on any first two cards. One split of two equal-value cards, no resplit; split aces get one
 *   card each; no double after split; 21 on a split hand is not a blackjack. No insurance, no surrender.
 * Draw order: player, dealer up, player, dealer hole, then every further card in the order it is needed,
 * one float per card. The hole card is fixed by the seed from the start; the server keeps it hidden.
 *
 * RTP: with an infinite deck every card has a fixed probability, so the expected value of perfect play
 * can be computed exactly by dynamic programming over (hard total, has ace) — see optimalRtp(). The
 * same tables give the optimal action for every hand (optimalAction), which the Monte-Carlo run plays.
 * Blackjack is a skill game: worse play means a lower RTP; the published figure is the ceiling.
 */

import type { FloatSource } from '../pf/stream';

export type BjAction = 'hit' | 'stand' | 'double' | 'split';
export interface BjHand { cards: number[]; doubled: boolean; done: boolean; split: boolean }
export interface BjState {
  hands: BjHand[];
  dealer: number[];
  active: number;
  /** Floats consumed so far (lets a server resume the same stream). */
  drawn: number;
  finished: boolean;
  dealerBlackjack: boolean;
}

export const cardRank = (card: number) => (card % 13) + 1;
export const cardValue = (card: number) => Math.min(10, cardRank(card));

export function handTotal(cards: number[]): { total: number; soft: boolean } {
  let hard = 0, ace = false;
  for (const c of cards) { const v = cardValue(c); hard += v; if (v === 1) ace = true; }
  return ace && hard + 10 <= 21 ? { total: hard + 10, soft: true } : { total: hard, soft: false };
}
export const isBlackjack = (cards: number[]) => cards.length === 2 && handTotal(cards).total === 21;

function draw(src: FloatSource, s: BjState): number { s.drawn++; return Math.floor(src.next() * 52); }

/** Deals the opening cards and resolves naturals. */
export function bjDeal(src: FloatSource): BjState {
  const s: BjState = { hands: [{ cards: [], doubled: false, done: false, split: false }], dealer: [], active: 0, drawn: 0, finished: false, dealerBlackjack: false };
  s.hands[0].cards.push(draw(src, s));
  s.dealer.push(draw(src, s));
  s.hands[0].cards.push(draw(src, s));
  s.dealer.push(draw(src, s));
  s.dealerBlackjack = isBlackjack(s.dealer); // only reachable with an ace or ten up, i.e. the peek
  if (s.dealerBlackjack || isBlackjack(s.hands[0].cards)) { s.hands[0].done = true; s.finished = true; }
  return s;
}

export function bjActions(s: BjState): BjAction[] {
  if (s.finished) return [];
  const h = s.hands[s.active];
  const out: BjAction[] = ['hit', 'stand'];
  if (h.cards.length === 2 && !h.split) out.push('double');
  if (h.cards.length === 2 && s.hands.length === 1 && cardValue(h.cards[0]) === cardValue(h.cards[1])) out.push('split');
  return out;
}

/** Applies one action (returns a new state). Draws for the dealer once every hand is done. */
export function bjAct(src: FloatSource, prev: BjState, action: BjAction): BjState {
  const s: BjState = structuredClone(prev);
  if (!bjActions(s).includes(action)) throw new RangeError(`action not allowed: ${action}`);
  const h = s.hands[s.active];
  if (action === 'hit') {
    h.cards.push(draw(src, s));
    if (handTotal(h.cards).total >= 21) h.done = true;
  } else if (action === 'stand') {
    h.done = true;
  } else if (action === 'double') {
    h.doubled = true;
    h.cards.push(draw(src, s));
    h.done = true;
  } else {
    const second = h.cards.pop()!;
    s.hands = [{ cards: [h.cards[0]], doubled: false, done: false, split: true }, { cards: [second], doubled: false, done: false, split: true }];
    const aces = cardValue(second) === 1;
    for (const sh of s.hands) {
      sh.cards.push(draw(src, s));
      if (aces || handTotal(sh.cards).total === 21) sh.done = true;
    }
  }
  while (s.active < s.hands.length && s.hands[s.active].done) s.active++;
  if (s.active >= s.hands.length) {
    s.active = s.hands.length - 1;
    if (s.hands.some((x) => handTotal(x.cards).total <= 21)) {
      while (handTotal(s.dealer).total < 17) s.dealer.push(draw(src, s));
    }
    s.finished = true;
  }
  return s;
}

export interface BjHandResult { stake: number; payout: number; outcome: 'blackjack' | 'win' | 'push' | 'lose' | 'bust' }

/** Settles a finished round in stake units (original stake = 1 per hand, doubled hands 2). */
export function bjSettle(s: BjState): { hands: BjHandResult[]; stake: number; payout: number } {
  if (!s.finished) throw new RangeError('round not finished');
  const d = handTotal(s.dealer).total;
  const hands = s.hands.map((h): BjHandResult => {
    const stake = h.doubled ? 2 : 1;
    const t = handTotal(h.cards).total;
    const bj = !h.split && isBlackjack(h.cards);
    if (s.dealerBlackjack) return bj ? { stake, payout: stake, outcome: 'push' } : { stake, payout: 0, outcome: 'lose' };
    if (bj) return { stake, payout: 2.5, outcome: 'blackjack' };
    if (t > 21) return { stake, payout: 0, outcome: 'bust' };
    if (d > 21 || t > d) return { stake, payout: 2 * stake, outcome: 'win' };
    if (t === d) return { stake, payout: stake, outcome: 'push' };
    return { stake, payout: 0, outcome: 'lose' };
  });
  return { hands, stake: hands.reduce((a, h) => a + h.stake, 0), payout: hands.reduce((a, h) => a + h.payout, 0) };
}

/* ---------- exact optimal-play EV (infinite deck) ---------- */

const PV = (v: number) => (v === 10 ? 4 / 13 : 1 / 13); // value 1 (ace) … 10
const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const best = (hard: number, ace: boolean) => (ace && hard + 10 <= 21 ? hard + 10 : hard);

/** Dealer final totals (17…21) and bust, given the up card and no dealer blackjack. */
function dealerDist(up: number): number[] {
  const memo = new Map<string, number[]>();
  const from = (hard: number, ace: boolean): number[] => {
    const b = best(hard, ace);
    const out = [0, 0, 0, 0, 0, 0]; // 17,18,19,20,21,bust
    if (hard > 21) { out[5] = 1; return out; }
    if (b >= 17) { out[b - 17] = 1; return out; }
    const key = `${hard}|${ace}`;
    const m = memo.get(key);
    if (m) return m;
    for (const v of VALUES) { const r = from(hard + v, ace || v === 1); for (let i = 0; i < 6; i++) out[i] += PV(v) * r[i]; }
    memo.set(key, out);
    return out;
  };
  const excluded = up === 1 ? 10 : up === 10 ? 1 : 0; // the peek rules these hole cards out
  const norm = 1 - (excluded ? PV(excluded) : 0);
  const out = [0, 0, 0, 0, 0, 0];
  for (const v of VALUES) {
    if (v === excluded) continue;
    const r = from(up + v, up === 1 || v === 1);
    for (let i = 0; i < 6; i++) out[i] += (PV(v) / norm) * r[i];
  }
  return out;
}

interface Tables { stand: (t: number) => number; hitStand: (hard: number, ace: boolean) => number; double: (hard: number, ace: boolean) => number; splitHand: (v: number) => number }

const tableCache = new Map<number, Tables>();
function tables(up: number): Tables {
  const cached = tableCache.get(up);
  if (cached) return cached;
  const d = dealerDist(up);
  const stand = (t: number) => {
    if (t > 21) return -1;
    let ev = d[5];
    for (let i = 0; i < 5; i++) ev += d[i] * (t > 17 + i ? 1 : t === 17 + i ? 0 : -1);
    return ev;
  };
  const memo = new Map<string, number>();
  const hitStand = (hard: number, ace: boolean): number => {
    if (hard > 21) return -1;
    const key = `${hard}|${ace}`;
    const m = memo.get(key);
    if (m !== undefined) return m;
    let hit = 0;
    for (const v of VALUES) hit += PV(v) * hitStand(hard + v, ace || v === 1);
    const r = Math.max(stand(best(hard, ace)), hit);
    memo.set(key, r);
    return r;
  };
  const double = (hard: number, ace: boolean) => {
    let ev = 0;
    for (const v of VALUES) ev += PV(v) * (hard + v > 21 ? -1 : stand(best(hard + v, ace || v === 1)));
    return 2 * ev;
  };
  const splitHand = (v: number) => {
    let ev = 0;
    for (const c of VALUES) ev += PV(c) * (v === 1 ? stand(best(1 + c, true)) : hitStand(v + c, c === 1));
    return ev;
  };
  const t = { stand, hitStand, double, splitHand };
  tableCache.set(up, t);
  return t;
}

/** Best action for a hand against the dealer's up card value (1 = ace). */
export function optimalAction(hand: number[], upValue: number, allowed: BjAction[]): BjAction {
  const t = tables(upValue);
  let hard = 0, ace = false;
  for (const c of hand) { const v = cardValue(c); hard += v; if (v === 1) ace = true; }
  let hit = 0;
  for (const v of VALUES) hit += PV(v) * t.hitStand(hard + v, ace || v === 1);
  const evs: [BjAction, number][] = [['stand', t.stand(best(hard, ace))], ['hit', hit]];
  if (allowed.includes('double')) evs.push(['double', t.double(hard, ace)]);
  if (allowed.includes('split')) evs.push(['split', 2 * t.splitHand(cardValue(hand[0]))]);
  return evs.filter(([a]) => allowed.includes(a)).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

/** Exact RTP (return per original stake) of perfect play under the rules above. */
export function optimalRtp(): number {
  let ev = 0;
  for (const up of VALUES) {
    const t = tables(up);
    const pDealerBj = up === 1 ? PV(10) : up === 10 ? PV(1) : 0;
    for (const a of VALUES) for (const b of VALUES) {
      const p = PV(up) * PV(a) * PV(b);
      const playerBj = (a === 1 && b === 10) || (a === 10 && b === 1);
      if (playerBj) { ev += p * (1 - pDealerBj) * 1.5; continue; }
      const hard = a + b, ace = a === 1 || b === 1;
      let hit = 0;
      for (const v of VALUES) hit += PV(v) * t.hitStand(hard + v, ace || v === 1);
      let e = Math.max(t.stand(best(hard, ace)), hit, t.double(hard, ace));
      if (a === b) e = Math.max(e, 2 * t.splitHand(a));
      ev += p * (pDealerBj * -1 + (1 - pDealerBj) * e);
    }
  }
  return 1 + ev;
}
