/**
 * Workbench (upgrader). Risk an item (or balance) worth `input` for a target item worth `target`.
 *   chance = (input / target) · (1 − e)
 * The roll f ∈ [0, 1) is a point on a ring. The player places the win zone anywhere on the ring:
 * it starts at s = zone / 10 000 (zone an integer 0 … 9 999) and is `chance` long, wrapping past 1.
 *   win ⇔ (f − s) mod 1 < chance
 * f is uniform on the ring, so every placement covers the same share of it: P(win) = chance for every s,
 * and RTP = chance · target / input = 1 − e exactly. Moving the zone changes where you win, never how often.
 * (zone = 0 is the classic "roll under chance".)
 * The platform refuses targets whose chance would exceed MAX_CHANCE or fall below MIN_CHANCE,
 * so the formula is never clamped and RTP stays exact.
 */

import { EDGE } from '../config';
import type { FloatSource } from '../pf/stream';

export const UPGRADER_MIN_CHANCE = 0.01;
export const UPGRADER_MAX_CHANCE = 0.8;
export const UPGRADER_ZONE_STEPS = 10_000;

export function upgraderChance(input: number, target: number, edge = EDGE.upgrader): number {
  if (!(input > 0) || !(target > input)) throw new RangeError('target must be worth more than input');
  const c = (input / target) * (1 - edge);
  if (c > UPGRADER_MAX_CHANCE || c < UPGRADER_MIN_CHANCE) throw new RangeError('chance outside allowed band');
  return c;
}

export function validateZone(zone: number): void {
  if (!Number.isInteger(zone) || zone < 0 || zone >= UPGRADER_ZONE_STEPS) throw new RangeError('zone must be an integer 0 … 9999');
}

/** Where the roll sits relative to the zone start, as a share of the ring: [0, 1). */
export const upgraderOffset = (roll: number, zone: number): number => { const d = roll - zone / UPGRADER_ZONE_STEPS; return d < 0 ? d + 1 : d; };

export function playUpgrader(src: FloatSource, input: number, target: number, edge = EDGE.upgrader, zone = 0): { roll: number; chance: number; zone: number; win: boolean; value: number } {
  const chance = upgraderChance(input, target, edge);
  validateZone(zone);
  const roll = src.next();
  const win = upgraderOffset(roll, zone) < chance;
  return { roll, chance, zone, win, value: win ? target : 0 };
}

export const upgraderTheoreticalRtp = (edge = EDGE.upgrader): number => 1 - edge;
