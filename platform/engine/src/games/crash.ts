/**
 * Schrottpresse (crash).
 *   h     = first 52 bits of HMAC-SHA256(gameSeed, clientSeed)   uniform on {0, …, 2⁵² − 1}
 *   E     = 2⁵²
 *   crash = max(1, ⌊100 · (1 − e) · E / (E − h)⌋ / 100)
 *
 * For any cash-out target x with 100x ∈ ℕ and x ≥ 1.01:
 *   crash ≥ x ⇔ ⌊100(1−e)E/(E−h)⌋ ≥ 100x ⇔ (1−e)E/(E−h) ≥ x ⇔ h ≥ E·(1 − (1−e)/x)
 *   ⇒ P(crash ≥ x) = (1 − e)/x  (up to 2⁻⁵² granularity)  ⇒  RTP(x) = x · (1−e)/x = 1 − e.
 * Targets below 1.01 are refused: the max(1, …) clamp would make 1.00 a 100 % no-win bet.
 */

import { EDGE } from '../config';
import { hmacHex, toHex } from '../pf/sha256';
import type { HmacFn } from '../pf/stream';

export const CRASH_MIN_TARGET = 1.01;
export const CRASH_MAX_TARGET = 10000; // liability cap per bet; enforced on the target, not the RNG
const E = 2 ** 52;

/** Crash point from a uniform 52-bit integer h (exposed for Monte-Carlo and for the proof tests). */
export function crashFromH(h: number, edge = EDGE.crash): number {
  const raw = Math.floor((100 * (1 - edge) * E) / (E - h)) / 100;
  return Math.max(1, raw);
}

export function crashPoint(gameSeed: string, clientSeed: string, edge = EDGE.crash, hmac: HmacFn = hmacHex): { crash: number; h: number; hex: string } {
  const bytes = hmac(gameSeed, clientSeed);
  const hex = toHex(bytes);
  const h = parseInt(hex.slice(0, 13), 16); // 13 hex chars = 52 bits
  return { crash: crashFromH(h, edge), h, hex };
}

export function validateTarget(x: number): void {
  if (Math.abs(Math.round(x * 100) - x * 100) > 1e-9) throw new RangeError('target must use 0.01 steps');
  if (x < CRASH_MIN_TARGET || x > CRASH_MAX_TARGET) throw new RangeError('target out of range');
}

/** Settles an auto-cash-out bet. */
export function settleCrash(crash: number, target: number): { win: boolean; multiplier: number } {
  validateTarget(target);
  const win = crash >= target;
  return { win, multiplier: win ? target : 0 };
}

export const crashSurvival = (x: number, edge = EDGE.crash): number => Math.min(1, (1 - edge) / x);
export const crashTheoreticalRtp = (_target: number, edge = EDGE.crash): number => 1 - edge;
