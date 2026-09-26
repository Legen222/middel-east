/**
 * Würfel (dice).
 *   roll       = ⌊f · 10000⌋ / 100              uniform over 0.00 … 99.99 (10 000 values)
 *   win chance c ∈ [0.01, 98.00] % in 0.01 steps
 *   under:  win ⇔ roll <  c                      (c·100 values)
 *   over:   win ⇔ roll ≥ 100 − c                 (c·100 values)
 *   multiplier = (1 − e) · 100 / c              ⇒ RTP = c/100 · (1 − e)·100/c = 1 − e exactly
 */

import { EDGE } from '../config';
import type { FloatSource } from '../pf/stream';

export interface DiceBet {
  chance: number; // percent, 0.01 … 98
  direction: 'under' | 'over';
}

export interface DiceOutcome {
  roll: number;
  win: boolean;
  multiplier: number; // payout multiplier on stake (0 on loss)
}

export const DICE_MIN_CHANCE = 0.01;
export const DICE_MAX_CHANCE = 98;

export function validateDice(bet: DiceBet): void {
  const cents = Math.round(bet.chance * 100);
  if (Math.abs(cents - bet.chance * 100) > 1e-9) throw new RangeError('chance must use 0.01 steps');
  if (bet.chance < DICE_MIN_CHANCE || bet.chance > DICE_MAX_CHANCE) throw new RangeError('chance out of range');
}

export const diceMultiplier = (chance: number, edge = EDGE.dice): number => ((1 - edge) * 100) / chance;

export function playDice(src: FloatSource, bet: DiceBet, edge = EDGE.dice): DiceOutcome {
  validateDice(bet);
  const ticket = Math.floor(src.next() * 10000); // 0 … 9999
  const threshold = Math.round(bet.chance * 100);
  const win = bet.direction === 'under' ? ticket < threshold : ticket >= 10000 - threshold;
  return { roll: ticket / 100, win, multiplier: win ? diceMultiplier(bet.chance, edge) : 0 };
}

export const diceTheoreticalRtp = (_bet: DiceBet, edge = EDGE.dice): number => 1 - edge;
