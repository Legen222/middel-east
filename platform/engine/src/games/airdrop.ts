/**
 * Airdrop (limbo). The supply drop lands at a multiplier; the bet wins when it lands at or above the
 * player's target. The landing point uses the Scrap Press formula on a uniform 52-bit integer built
 * from two floats:
 *   h = ⌊f₁ · 2³²⌋ · 2²⁰ + ⌊f₂ · 2²⁰⌋        uniform on {0, …, 2⁵² − 1}
 *   landing = max(1, ⌊100 · (1 − e) · 2⁵² / (2⁵² − h)⌋ / 100)
 *   P(landing ≥ x) = (1 − e)/x for every target x ≥ 1.01 in 0.01 steps (proof in crash.ts)
 *   ⇒ RTP = x · (1 − e)/x = 1 − e for every target.
 */

import { EDGE } from '../config';
import type { FloatSource } from '../pf/stream';
import { crashFromH, validateTarget } from './crash';

export const AIRDROP_MAX_TARGET = 10000;

export function airdropH(src: FloatSource): number {
  const hi = Math.floor(src.next() * 2 ** 32);
  const lo = Math.floor(src.next() * 2 ** 20);
  return hi * 2 ** 20 + lo;
}

export function playAirdrop(src: FloatSource, target: number, edge = EDGE.airdrop): { landing: number; win: boolean; multiplier: number } {
  validateTarget(target);
  const landing = crashFromH(airdropH(src), edge);
  const win = landing >= target;
  return { landing, win, multiplier: win ? target : 0 };
}

export const airdropChance = (target: number, edge = EDGE.airdrop): number => (1 - edge) / target;
export const airdropTheoreticalRtp = (_target: number, edge = EDGE.airdrop): number => 1 - edge;
