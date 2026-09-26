/**
 * Schrottrutsche (plinko). n rows, n+1 buckets; each row one float: f < 0.5 → left, else right.
 * Bucket = number of rights  ⇒  P(bucket k) = C(n, k) / 2ⁿ.
 * RTP(table) = Σ C(n,k)·mult_k / 2ⁿ  — computed exactly below; every table is in [96.5 %, 97.0 %].
 * Tables are SCRAPLINE-original: shaped from centre/edge anchors, then rounded to readable values.
 */

import type { FloatSource } from '../pf/stream';
import { binom } from './mines';

export type PlinkoRows = 8 | 12 | 16;
export type PlinkoRisk = 'low' | 'medium' | 'high';

export const PLINKO_TABLES: Record<PlinkoRows, Record<PlinkoRisk, number[]>> = {
  8: {
    low: [6, 3.1, 1.41, 0.65, 0.49, 0.65, 1.41, 3.1, 6],
    medium: [15, 4.7, 1.17, 0.44, 0.4, 0.44, 1.17, 4.7, 15],
    high: [30, 6.4, 0.87, 0.21, 0.19, 0.21, 0.87, 6.4, 30],
  },
  12: {
    low: [10, 6.4, 3.8, 2, 1.03, 0.59, 0.5, 0.59, 1.03, 2, 3.8, 6.4, 10],
    medium: [35, 17, 7.1, 2.4, 0.71, 0.33, 0.29, 0.33, 0.71, 2.4, 7.1, 17, 35],
    high: [150, 43, 9.3, 1.45, 0.28, 0.2, 0.19, 0.2, 0.28, 1.45, 9.3, 43, 150],
  },
  16: {
    low: [16, 11, 7.5, 4.7, 2.8, 1.54, 0.84, 0.55, 0.5, 0.55, 0.84, 1.54, 2.8, 4.7, 7.5, 11, 16],
    medium: [100, 53, 26, 11, 4, 1.24, 0.44, 0.3, 0.29, 0.3, 0.44, 1.24, 4, 11, 26, 53, 100],
    high: [800, 255, 67, 14, 2.2, 0.37, 0.21, 0.2, 0.2, 0.2, 0.21, 0.37, 2.2, 14, 67, 255, 800],
  },
};

export interface PlinkoOutcome {
  path: ('L' | 'R')[];
  bucket: number;
  multiplier: number;
}

export function playPlinko(src: FloatSource, rows: PlinkoRows, risk: PlinkoRisk): PlinkoOutcome {
  const table = PLINKO_TABLES[rows]?.[risk];
  if (!table) throw new RangeError('unknown plinko table');
  const path: ('L' | 'R')[] = [];
  let bucket = 0;
  for (let i = 0; i < rows; i++) {
    const right = src.next() >= 0.5;
    path.push(right ? 'R' : 'L');
    if (right) bucket++;
  }
  return { path, bucket, multiplier: table[bucket] };
}

export function plinkoTheoreticalRtp(rows: PlinkoRows, risk: PlinkoRisk): number {
  const t = PLINKO_TABLES[rows][risk];
  let s = 0;
  for (let k = 0; k <= rows; k++) s += binom(rows, k) * t[k];
  return s / 2 ** rows;
}
