import { chanceTxt, crateFigures, evOf, oddsTable, oneIn, rarity } from '../crates';
import { icon } from '../icons';
import { crateArt } from '../loot-art';
import type { View } from '../main';
import { $, $$, SCRAP_SYM, esc, frags, pct } from '../ui';

/* Every crate with its price and the full odds: an overview table, then one section per crate. */
export const cratesView: View = {
  title: 'Crate odds',
  html: (c) => {
    const cases = [...c.cfg.cases].sort((a, b) => a.price - b.price);
    const usd = (f: number) => `$${(f / c.cfg.fragsPerDollar).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    return `
  <section class="card" style="gap:14px">
    <div class="sect-head"><div><p class="eyebrow">Transparency · ${cases.length} crates · ${cases.reduce((s, k) => s + k.items.length, 0)} items</p><h1 class="h-display">Crate odds</h1>
      <p class="muted" style="max-width:72ch">Every crate with its price, what it pays back and the exact chance of every item. The same crates are used in Crate opening and Case Battle. Chances are each item's weight ÷ all weights; the price is the expected value ÷ 0.93, rounded up to whole Scrap.</p></div>
      <div class="row"><a class="btn" href="#/cases">${icon('crate')} Open a crate</a><a class="btn ghost" href="#/battle">${icon('battle')} Case Battle</a></div></div>
    <div class="tablewrap"><table class="odds-overview"><thead><tr><th>Crate</th><th class="r">Price ${SCRAP_SYM}</th><th class="r hide-xs">≈ $</th><th class="r">RTP</th><th class="r hide-xs">Expected value</th><th class="r hide-xs">Items</th><th>Best item</th><th class="r">Its chance</th></tr></thead><tbody>
      ${cases.map((k) => {
        const top = [...k.items].sort((a, b) => b.value - a.value)[0];
        return `<tr data-jump="${k.id}"><td><a class="ov-crate" href="#/crates" data-to="${k.id}"><span class="ov-art">${crateArt(k.id, k.price)}</span>${esc(k.name)}</a></td>
          <td class="r num">${frags(k.price, 0)}</td><td class="r num muted hide-xs">${usd(k.price)}</td><td class="r num">${pct(k.rtp)}</td><td class="r num hide-xs">${frags(evOf(k))}</td><td class="r num hide-xs">${k.items.length}</td>
          <td><span class="ov-top" style="--rc:${rarity(top.value, k.price)}">${esc(top.name)} <small class="num">${frags(top.value, 0)}</small></span></td><td class="r num">${chanceTxt(top.chance)}<br><small class="muted">${oneIn(top.chance)}</small></td></tr>`;
      }).join('')}
    </tbody></table></div>
  </section>
  <section class="card odds-tools">
    <input class="input" id="odds-q" type="search" placeholder="Find a crate or item, e.g. Python or Alien Red" aria-label="Find a crate or item">
    <div class="tier-legend">${[['Legendary', '≥ 20× price'], ['Epic', '≥ 5×'], ['Rare', '≥ 2×'], ['Uncommon', '≥ 1×'], ['Common', '< price']].map(([n, d], i) => `<span style="--rc:${['#C9A45C', '#E5534B', '#4C8DF6', '#3FB950', '#6B747D'][i]}"><i></i>${n} <small>${d}</small></span>`).join('')}</div>
  </section>
  <div class="odds-list" id="odds-list">${cases.map((k) => `
    <section class="card odds-crate" id="crate-${k.id}" data-search="${esc([k.name, ...k.items.map((i) => i.name)].join(' ').toLowerCase())}">
      <div class="oc-head"><span class="oc-art">${crateArt(k.id, k.price)}</span>
        <div class="oc-title"><h2 class="h-sect">${esc(k.name)}</h2><p class="muted" style="font-size:13px">≈ ${usd(k.price)} · version ${k.version} · ${k.items.length} items</p></div>
        ${crateFigures(k)}</div>
      ${oddsTable(k)}
    </section>`).join('')}</div>
  <p class="muted" id="odds-none" hidden>Nothing matches.</p>`;
  },
  mount: (root) => {
    const q = $<HTMLInputElement>('#odds-q', root);
    q.addEventListener('input', () => {
      const t = q.value.trim().toLowerCase();
      let shown = 0;
      $$<HTMLElement>('.odds-crate', root).forEach((s) => { const on = !t || s.dataset.search!.includes(t); s.hidden = !on; shown += Number(on); });
      $('#odds-none', root).hidden = shown > 0;
    });
    $$<HTMLAnchorElement>('[data-to]', root).forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      root.querySelector(`#crate-${a.dataset.to}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  },
};
