/**
 * Hi-Lo. Cards come from an infinite deck: card = ⌊f · 52⌋ → rank = card mod 13 + 1 (A = 1 … K = 13),
 * suit = ⌊card / 13⌋, so every rank has probability 1/13. Starting from the first card the player
 * repeatedly guesses on the next card:
 *   hi  next rank ≥ current   p = (14 − r) / 13
 *   lo  next rank ≤ current   p = r / 13
 *   skip  draw a new card, multiplier unchanged (at most 52 skips per round)
 * A guess with p = 1 (hi on an ace, lo on a king) is refused: it could only lose value.
 * After j correct guesses the cash-out value is  mult_j = (1 − e) · Π 1/p_i.
 * Martingale argument as in Raid: E[next | now] = p · V / p = V for every guess and skips do not change V,
 * so RTP = 1 − e for every strategy (at least one guess before cashing out).
 */

import { EDGE } from '../config';
import type { FloatSource } from '../pf/stream';

export interface Card { rank: number; suit: number }
export type HiloGuess = 'hi' | 'lo';

export const HILO_MAX_SKIPS = 52;
export const RANK_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export function drawCard(src: FloatSource): Card {
  const c = Math.floor(src.next() * 52);
  return { rank: (c % 13) + 1, suit: Math.floor(c / 13) };
}

export function hiloChance(rank: number, guess: HiloGuess): number {
  if (!Number.isInteger(rank) || rank < 1 || rank > 13) throw new RangeError('rank 1…13');
  return guess === 'hi' ? (14 - rank) / 13 : rank / 13;
}

export function hiloWins(current: number, next: number, guess: HiloGuess): boolean {
  return guess === 'hi' ? next >= current : next <= current;
}

/** Multiplier after the given successful guess chances (empty = no guess yet). */
export const hiloMultiplier = (chances: number[], edge = EDGE.hilo): number =>
  chances.length === 0 ? 1 : (1 - edge) / chances.reduce((a, p) => a * p, 1);

export const hiloTheoreticalRtp = (edge = EDGE.hilo): number => 1 - edge;
