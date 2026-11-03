/**
 * Crate data leaves the server in Scrap. The engine, the case tables and the stored results count in whole
 * cents (so a replay matches the stored outcome exactly); these turn them into Scrap for the API.
 */
import type { CaseItem } from '../../engine/src/index';
import { centsToScrap } from './config';

const item = <T extends { value: number }>(i: T): T => ({ ...i, value: centsToScrap(i.value) });

/** A case version or preview: item values and price. */
export const caseOut = <T extends { price: number; items: { value: number }[] }>(c: T): T => ({ ...c, price: centsToScrap(c.price), items: c.items.map(item) });

/** A stored bet result: crate openings carry the item and the crate's EV; other games pass through. */
export function betResultOut<T>(game: string, r: T): T {
  if (game !== 'cases' || !r || typeof r !== 'object') return r;
  const o = r as { item?: CaseItem; ev?: number };
  return { ...o, ...(o.item ? { item: item(o.item) } : {}), ...(typeof o.ev === "number" ? { ev: centsToScrap(o.ev) } : {}) } as T;
}

/** A stored battle result: drops, totals and the bonus-mode amounts. Coinflips pass through. */
export function battleResultOut<T>(r: T): T {
  if (!r || typeof r !== 'object' || !('drops' in r)) return r;
  const o = r as unknown as { drops: { value: number }[][]; totals: number[]; bonus?: { points: number[]; jackpotPaid: number[]; rest: number } };
  return {
    ...o,
    drops: o.drops.map((row) => row.map(item)),
    totals: o.totals.map(centsToScrap),
    ...(o.bonus ? { bonus: { ...o.bonus, points: o.bonus.points.map(centsToScrap), jackpotPaid: o.bonus.jackpotPaid.map(centsToScrap), rest: centsToScrap(o.bonus.rest) } } : {}),
  } as unknown as T;
}
