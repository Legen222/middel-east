import { type Bet, type CaseInfo, api } from '../api';
import { icon } from '../icons';
import type { View } from '../main';
import { $, $$, esc, fairBox, frags, guard, pct, pctShort, reducedMotion } from '../ui';

/** Rarity colour from value relative to the case price. */
const rarity = (value: number, price: number) =>
  value >= price * 20 ? '#E8B21A' : value >= price * 5 ? '#e0529c' : value >= price * 2 ? '#9b6bff' : value >= price ? '#4C8DF6' : '#8b8680';

const REEL_LEN = 60;
const STOP = 50;
const ITEM_W = 126; // 120 + 6 gap

export const casesView: View = {
  title: 'Cases',
  html: (c) => `
  <section class="card" style="gap:14px">
    <div class="game-head"><div><p class="eyebrow">Original</p><h1 class="h-display">Cases</h1>
      <p>Every case lists all items with their drop chance. Price = expected value ÷ 0.93, rounded up to whole Frags.</p></div></div>
    <div class="cases" id="cases">${c.cfg.cases.map((k, i) => `
      <button type="button" class="case" data-id="${k.id}" aria-pressed="${i === 0}">
        <span class="art">${icon('crate')}</span>
        <b>${esc(k.name)}</b>
        <span class="price"><span class="num" style="color:var(--hazard)">${frags(k.price, 0)} Frags</span><span class="muted num" style="font-size:12px">RTP ${pct(k.rtp)}</span></span>
      </button>`).join('')}</div>
  </section>
  <section class="card" style="gap:14px">
    <div class="reel" id="reel" aria-hidden="true"><div class="reel-track" id="track"></div></div>
    <div class="row" style="justify-content:space-between">
      <p class="status" id="status" role="status">Pick a case and open it.</p>
      <button class="btn" id="open" type="button">Open</button>
    </div>
    <div id="fair"></div>
  </section>
  <section class="card">
    <h2 class="h-sect" id="odds-title">Contents</h2>
    <div class="tablewrap"><table><thead><tr><th>Item</th><th class="r">Value (Frags)</th><th class="r">Chance</th></tr></thead><tbody id="odds"></tbody></table></div>
  </section>`,
  mount: (root, c) => {
    let current: CaseInfo = c.cfg.cases[0];
    const pickCosmetic = (k: CaseInfo) => { let r = Math.random(); for (const it of k.items) { r -= it.chance; if (r < 0) return it; } return k.items[0]; };
    const fillReel = (k: CaseInfo, final?: { name: string; value: number }) => {
      const items = Array.from({ length: REEL_LEN }, (_, i) => (i === STOP && final ? final : pickCosmetic(k)));
      $('#track', root).innerHTML = items.map((it) => `<div class="reel-item" style="--rc:${rarity(it.value, k.price)}"><b>${esc(it.name)}</b><span class="num muted">${frags(it.value, 0)}</span></div>`).join('');
    };
    const showCase = (k: CaseInfo) => {
      current = k;
      $$('.case', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === k.id)));
      $('#odds-title', root).textContent = `Contents: ${k.name}`;
      $('#odds', root).innerHTML = k.items.map((it) => `<tr><td><span style="display:inline-block;width:10px;height:10px;background:${rarity(it.value, k.price)};margin-right:8px"></span>${esc(it.name)}</td><td class="r num">${frags(it.value, 0)}</td><td class="r num">${pctShort(it.chance)}</td></tr>`).join('');
      $('#open', root).textContent = `Open · ${frags(k.price, 0)} Frags`;
      const track = $('#track', root);
      track.style.transition = 'none'; track.style.transform = 'translateX(0)';
      fillReel(k);
    };
    $$<HTMLButtonElement>('.case', root).forEach((b) => b.addEventListener('click', () => showCase(c.cfg.cases.find((k) => k.id === b.dataset.id)!)));
    showCase(current);
    $('#fair', root).innerHTML = fairBox({ ...c.me.seed, nonce: c.me.seed.nextNonce });

    $('#open', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      const k = current;
      const bet = await api<Bet<{ item: { name: string; value: number } }>>('POST', '/bets/cases', { params: { caseId: k.id } });
      const item = bet.result!.item;
      fillReel(k, item);
      const track = $('#track', root);
      const reelW = $('#reel', root).clientWidth;
      const jitter = (Math.random() - 0.5) * 80; // cosmetic: where inside the winning card the needle stops
      const x = -(STOP * ITEM_W + 10 + 60 - reelW / 2 + jitter);
      track.style.transition = 'none'; track.style.transform = 'translateX(0)';
      void track.offsetWidth;
      const dur = reducedMotion() ? 0 : 4200;
      track.style.transition = `transform ${dur}ms cubic-bezier(.12,.8,.22,1)`;
      track.style.transform = `translateX(${x}px)`;
      await new Promise((r) => setTimeout(r, dur + 80));
      const won = item.value >= k.price;
      const s = $('#status', root);
      s.textContent = `${item.name} · ${frags(item.value, 0)} Frags ${won ? '(profit)' : ''}`;
      s.className = `status ${won ? 'win' : 'lose'}`;
      $('#fair', root).innerHTML = fairBox(bet.fairness);
      await c.refresh();
    }));
  },
};
