/**
 * Minenfeld (mines), 5×5 = 25 tiles, m ∈ [1, 24] mines.
 *   Mine layout: partial Fisher–Yates over tiles 0…24; for i < m pick j = i + ⌊f·(25 − i)⌋, swap.
 *   After k safe reveals:  mult(k) = (1 − e) · C(25, k) / C(25 − m, k)
 *   P(survive k)          = C(25 − m, k) / C(25, k)
 *   ⇒ RTP for "cash out after k" = 1 − e for every k and m.
 *   Because the expectation is the same for every k, it is the same for any stopping rule,
 *   including tile choices that depend on what was revealed.
 */

import { EDGE } from '../config';
import type { FloatSource } from '../pf/stream';

export const TILES = 25;

export function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

export function minesMultiplier(mines: number, revealed: number, edge = EDGE.mines): number {
  if (revealed === 0) return 1;
  return ((1 - edge) * binom(TILES, revealed)) / binom(TILES - mines, revealed);
}

export function layMines(src: FloatSource, mines: number): number[] {
  if (!Number.isInteger(mines) || mines < 1 || mines > TILES - 1) throw new RangeError('mines must be 1…24');
  const tiles = Array.from({ length: TILES }, (_, i) => i);
  for (let i = 0; i < mines; i++) {
    const j = i + Math.floor(src.next() * (TILES - i));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles.slice(0, mines).sort((a, b) => a - b);
}

export interface MinesOutcome {
  mines: number[];
  hitMine: boolean;
  safeRevealed: number;
  multiplier: number;
}

/** Plays a fixed sequence of picks and cashes out after the last one (or busts on a mine). */
export function playMines(src: FloatSource, mineCount: number, picks: number[], edge = EDGE.mines): MinesOutcome {
  if (new Set(picks).size !== picks.length || picks.some((p) => p < 0 || p >= TILES)) throw new RangeError('invalid picks');
  if (picks.length > TILES - mineCount) throw new RangeError('more picks than safe tiles');
  const mines = layMines(src, mineCount);
  const mineSet = new Set(mines);
  let safe = 0;
  for (const p of picks) {
    if (mineSet.has(p)) return { mines, hitMine: true, safeRevealed: safe, multiplier: 0 };
    safe++;
  }
  return { mines, hitMine: false, safeRevealed: safe, multiplier: minesMultiplier(mineCount, safe, edge) };
}

export const minesTheoreticalRtp = (_m: number, k: number, edge = EDGE.mines): number => (k === 0 ? 1 : 1 - edge);
