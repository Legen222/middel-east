/**
 * Bandit Wheel — a live, shared wheel modelled on the Big Wheel at Rust's Bandit Camp.
 * 25 fields: 12 × "1", 6 × "3", 4 × "5", 2 × "10", 1 × "20". A bet on a field type wins when the
 * wheel stops on any field of that type.
 *
 *   field = ⌊f · 25⌋                       one float per round, uniform up to 25 · 2⁻³²
 *   payout (total, stake included) = (1 − e) · 25 / count
 *   RTP of every field type = count/25 · (1 − e) · 25/count = 1 − e
 *
 * With e = 4 % the payouts are whole numbers: 2× / 4× / 6× / 12× / 24×. The in-game wheel pays
 * 2× / 4× / 6× / 11× / 21× on the same layout, i.e. 96 / 96 / 96 / 88 / 84 % RTP; here every field is 96 %.
 * Seeds: one seed per round from a published hash chain, client seed = a beacon value fixed after the
 * chain was published (same scheme as the Scrap Press).
 */

import { EDGE } from '../config';
import type { FloatSource } from '../pf/stream';

export const WHEEL_FIELDS = ['1', '3', '5', '10', '20'] as const;
export type WheelField = (typeof WHEEL_FIELDS)[number];
export const WHEEL_COUNTS: Record<WheelField, number> = { '1': 12, '3': 6, '5': 4, '10': 2, '20': 1 };

/** Layout clockwise from the pointer at index 0; spreads the rare fields around the rim like the original. */
export const WHEEL_LAYOUT: readonly WheelField[] = [
  '20', '1', '3', '1', '5', '1', '3', '1', '10', '1', '3', '5', '1',
  '3', '1', '5', '1', '10', '1', '3', '1', '5', '1', '3', '1',
];

export const wheelPayout = (field: WheelField, edge = EDGE.wheel): number => ((1 - edge) * WHEEL_LAYOUT.length) / WHEEL_COUNTS[field];

export function spinWheel(src: FloatSource): { roll: number; index: number; field: WheelField } {
  const roll = src.next();
  const index = Math.floor(roll * WHEEL_LAYOUT.length);
  return { roll, index, field: WHEEL_LAYOUT[index] };
}

export const wheelTheoreticalRtp = (_field: WheelField, edge = EDGE.wheel): number => 1 - edge;
