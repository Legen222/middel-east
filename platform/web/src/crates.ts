/**
 * Crate odds shared by Crate opening, Case Battle and the #/crates page: rarity tiers, the contents table
 * (item, value, chance, "1 in N") and a dialog with one crate's full odds.
 */
import type { CaseInfo } from './api';
import { crateArt, itemArt } from './loot-art';
import { SCRAP_SYM, esc, frags, modal, pct, scrap } from './ui';

/** Rarity from an item's value relative to the crate price (same tiers as the reels). */
export const TIERS: { name: string; color: string; min: number }[] = [
  { name: 'Legendary', color: '#C9A45C', min: 20 },
  { name: 'Epic', color: '#E5534B', min: 5 },
  { name: 'Rare', color: '#4C8DF6', min: 2 },
  { name: 'Uncommon', color: '#3FB950', min: 1 },
  { name: 'Common', color: '#6B747D', min: 0 },
];
export const tierOf = (value: number, price: number) => TIERS.find((t) => value >= price * t.min)!;
export const rarity = (value: number, price: number) => tierOf(value, price).color;

/** Expected value of one opening (the price is EV ÷ 0.93, rounded up). */
export const evOf = (k: CaseInfo) => k.items.reduce((s, i) => s + i.value * i.chance, 0);
/** Chance as text: small ones with more digits, never "0 %". */
export const chanceTxt = (p: number) => `${(p * 100).toLocaleString('en-US', { minimumFractionDigits: p < 0.01 ? 3 : 2, maximumFractionDigits: p < 0.01 ? 3 : 2 })} %`;
export const oneIn = (p: number) => (p > 0 ? `1 in ${(1 / p).toLocaleString('en-US', { maximumFractionDigits: p > 0.1 ? 1 : 0 })}` : '–');

/** Every item of a crate, most valuable first. */
export function oddsTable(k: CaseInfo): string {
  const items = [...k.items].sort((a, b) => b.value - a.value);
  return `<div class="tablewrap"><table class="odds-table"><thead><tr><th>Item</th><th>Rarity</th><th class="r">Value ${SCRAP_SYM}</th><th class="r">× price</th><th class="r">Chance</th><th class="r hide-xs">Odds</th></tr></thead><tbody>
    ${items.map((i) => {
      const t = tierOf(i.value, k.price);
      return `<tr style="--rc:${t.color}"><td><span class="odds-item"><span class="oi-art">${itemArt(i.name)}</span>${esc(i.name)}</span></td><td><span class="tier">${t.name}</span></td>
        <td class="r num">${frags(i.value, 0)}</td><td class="r num muted">${(i.value / k.price).toFixed(2)}×</td>
        <td class="r num"><span class="chance-bar"><i style="width:${Math.max(2, Math.sqrt(i.chance) * 100)}%"></i></span>${chanceTxt(i.chance)}</td><td class="r num muted hide-xs">${oneIn(i.chance)}</td></tr>`;
    }).join('')}
  </tbody></table></div>`;
}

/** Price, RTP, expected value and the item count, as a row of figures. */
export const crateFigures = (k: CaseInfo) => `<div class="odds-figs">
  <div><span>Price</span><b>${scrap(k.price, 0)}</b></div><div><span>RTP</span><b class="num">${pct(k.rtp)}</b></div>
  <div><span>Expected value</span><b>${scrap(evOf(k))}</b></div><div><span>Items</span><b class="num">${k.items.length}</b></div></div>`;

/** A dialog with one crate's full contents. */
export function showCrateOdds(k: CaseInfo): void {
  const m = modal(`<div class="odds-modal">
    <div class="om-head"><span class="om-art">${crateArt(k.id, k.price)}</span><div><p class="eyebrow">Crate contents · version ${k.version}</p><h2 class="h-sect" style="font-size:22px">${esc(k.name)}</h2>${crateFigures(k)}</div></div>
    ${oddsTable(k)}
    <p class="muted" style="font-size:12px">Chances are exact: each item's weight ÷ the sum of all weights. The price is the expected value ÷ 0.93, rounded up, so every crate pays back at most 93 %. Old versions stay verifiable.</p>
    <div class="row"><a class="btn ghost" href="#/crates">All crates</a><button class="btn" type="button" data-close>Close</button></div></div>`);
  m.root.querySelector('.modal')?.classList.add('wide');
  m.root.querySelector('[data-close]')?.addEventListener('click', m.close);
  m.root.querySelector('a[href="#/crates"]')?.addEventListener('click', m.close);
}
