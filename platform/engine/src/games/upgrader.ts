/**
 * Werkbank (upgrader). Risk an item (or balance) worth `input` for a target item worth `target`.
 *   chance = (input / target) · (1 − e)          win ⇔ f < chance
 *   RTP    = chance · target / input = 1 − e     exactly
 * The platform refuses targets whose chance would exceed MAX_CHANCE or fall below MIN_CHANCE,
 * so the formula is never clamped and RTP stays exact.
 */

import { EDGE } from '../config';
import type { FloatSource } from '../pf/stream';

export const UPGRADER_MIN_CHANCE = 0.01;
export const UPGRADER_MAX_CHANCE = 0.8;

export function upgraderChance(input: number, target: number, edge = EDGE.upgrader): number {
  if (!(input > 0) || !(target > input)) throw new RangeError('target must be worth more than input');
  const c = (input / target) * (1 - edge);
  if (c > UPGRADER_MAX_CHANCE || c < UPGRADER_MIN_CHANCE) throw new RangeError('chance outside allowed band');
  return c;
}

export function playUpgrader(src: FloatSource, input: number, target: number, edge = EDGE.upgrader): { roll: number; chance: number; win: boolean; value: number } {
  const chance = upgraderChance(input, target, edge);
  const roll = src.next();
  const win = roll < chance;
  return { roll, chance, win, value: win ? target : 0 };
}

export const upgraderTheoreticalRtp = (edge = EDGE.upgrader): number => 1 - edge;
