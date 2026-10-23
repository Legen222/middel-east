/**
 * Jackpot (PvP pot). Every Scrap in the pot is a ticket; the winner takes the pot minus a fee.
 *   tickets: entry i owns [from_i, to_i) with to_i − from_i = amount_i (in milli-Scrap), in entry order
 *   winning ticket t = ⌊f · total⌋                      one float
 *   winner payout = total · (1 − fee)
 *   EV of entry i = amount_i/total · total · (1 − fee) = amount_i · (1 − fee)   ⇒ RTP = 1 − fee for everyone
 * The fee is taken from the pot, so a player's expected cost is exactly fee × their own stake
 * (not "fee on winnings", which competitors mix up in their communication).
 * Seeds: one server seed per round (hash shown from the start); client seed = value of the beacon round
 * chosen when the round locks, which nobody knows while entries are still accepted.
 */

import { EDGE } from '../config';
import type { FloatSource } from '../pf/stream';

export interface JackpotEntry { amount: number }

export function jackpotTicketRanges(entries: JackpotEntry[]): { from: number; to: number }[] {
  let at = 0;
  return entries.map((e) => {
    if (!Number.isSafeInteger(e.amount) || e.amount <= 0) throw new RangeError('entry amounts must be positive integers');
    const r = { from: at, to: at + e.amount };
    at += e.amount;
    return r;
  });
}

export function drawJackpot(src: FloatSource, entries: JackpotEntry[], fee = EDGE.jackpot): { roll: number; ticket: number; winner: number; total: number; payout: number } {
  if (entries.length < 2) throw new RangeError('a jackpot needs at least two entries');
  const ranges = jackpotTicketRanges(entries);
  const total = ranges[ranges.length - 1].to;
  const roll = src.next();
  const ticket = Math.floor(roll * total);
  const winner = ranges.findIndex((r) => ticket >= r.from && ticket < r.to);
  return { roll, ticket, winner, total, payout: Math.floor(total * (1 - fee)) };
}

export const jackpotTheoreticalRtp = (fee = EDGE.jackpot): number => 1 - fee;
