/**
 * Münzwurf (PvP coinflip). Two players stake B each; the pot is 2B.
 *   side = f < 0.5 ? 'rust' : 'scrap'
 *   winner receives 2B · (1 − r), r = rake on the pot
 *   RTP per player = ½ · 2(1 − r) = 1 − r
 * Seeds: clientSeed = hash of a public block selected when the second player joins; nonce = game id.
 */

import { EDGE } from '../config';
import type { FloatSource } from '../pf/stream';

export type CoinSide = 'rust' | 'scrap';

export function playCoinflip(src: FloatSource, creatorSide: CoinSide, rake = EDGE.coinflip): { roll: number; side: CoinSide; creatorWins: boolean; winnerMultiplier: number } {
  const roll = src.next();
  const side: CoinSide = roll < 0.5 ? 'rust' : 'scrap';
  return { roll, side, creatorWins: side === creatorSide, winnerMultiplier: 2 * (1 - rake) };
}

export const coinflipTheoreticalRtp = (rake = EDGE.coinflip): number => 1 - rake;
