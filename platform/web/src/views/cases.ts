import { type Bet, type CaseInfo, api } from '../api';
import { crateArt, itemArt } from '../loot-art';
import type { View } from '../main';
import { $, $$, esc, fairBox, frags, guard, pct, pctShort, reducedMotion } from '../ui';

/** Rarity colour from value relative to the case price. */
const rarity = (value: number, price: number) =>
  value >= price * 20 ? '#C9A45C' : value >= price * 5 ? '#E5534B' : value >= price * 2 ? '#4C8DF6' : value >= price ? '#3FB950' : '#6B747D';

/** Frags → "$1,500" (play money; 100 Frags = 1 $). */
const usd = (f: number, perDollar: number) => `$${(f / perDollar).toLocaleString('en-US', { minimumFractionDigits: f % perDollar ? 2 : 0, maximumFractionDigits: 2 })}`;

const REEL_LEN = 60;
const STOP = 50;
const ITEM_W = 126; // 120 + 6 gap
const MAX_OPEN = 5;
type Drop = { name: string; value: number };

export const casesView: View = {
  title: 'Crate opening',
  html: (c) => {
    const cases = [...c.cfg.cases].sort((a, b) => a.price - b.price);
    return `
  <section class="card" style="gap:16px">
    <div class="game-head"><div><p class="eyebrow">Original · Crates</p><h1 class="h-display">Crate opening</h1>
      <p>Twenty crates from ${usd(cases[0]?.price ?? 0, c.cfg.fragsPerDollar)} to ${usd(cases[cases.length - 1]?.price ?? 0, c.cfg.fragsPerDollar)}, named after Rust's loot containers and monuments. Open up to five at once. Every crate lists all items with their drop chance; the price is the expected value ÷ 0.93, rounded up to whole Frags. Each crate is its own round with its own nonce.</p></div></div>
    <div class="cases" id="cases">${cases.map((k, i) => `
      <button type="button" class="case" data-id="${k.id}" aria-pressed="${i === 0}">
        <span class="art">${crateArt(k.id, k.price)}</span>
        <b>${esc(k.name)}</b>
        <span class="price"><span class="num">${frags(k.price, 0)} Frags</span><span class="muted num" style="font-size:12px">≈ ${usd(k.price, c.cfg.fragsPerDollar)} · RTP ${pct(k.rtp)} · ${k.items.length} items</span></span>
      </button>`).join('')}</div>
  </section>
  <section class="card" style="gap:14px">
    <div class="open-bar">
      <div><p class="eyebrow" id="cur-name">–</p><b class="num" id="cur-cost"></b></div>
      <div class="seg" role="group" aria-label="How many">${Array.from({ length: MAX_OPEN }, (_, i) => `<button type="button" data-n="${i + 1}" aria-pressed="${i === 0}">×${i + 1}</button>`).join('')}</div>
      <label class="check"><input type="checkbox" id="fast"> <span>Fast open</span></label>
      <button class="btn" id="open" type="button">Open</button>
    </div>
    <div class="reels" id="reels"></div>
    <div class="drops" id="drops" hidden></div>
    <p class="status" id="status" role="status">Pick a crate and open it.</p>
    <div id="fair"></div>
  </section>
  <div class="admin-grid">
    <section class="card">
      <h2 class="h-sect" id="odds-title">Contents</h2>
      <div class="tablewrap"><table><thead><tr><th>Item</th><th class="r">Value (Frags)</th><th class="r">Chance</th></tr></thead><tbody id="odds"></tbody></table></div>
    </section>
    <section class="card">
      <h2 class="h-sect">Your drops this session</h2>
      <div class="chips" id="session"><span class="muted" style="font-size:13px">Nothing opened yet.</span></div>
      <p class="muted" style="font-size:12px" id="session-sum"></p>
    </section>
  </div>`;
  },
  mount: (root, c) => {
    const cases = [...c.cfg.cases].sort((a, b) => a.price - b.price);
    let current: CaseInfo = cases[0];
    let count = 1;
    let busy = false;
    const session: (Drop & { price: number })[] = [];
    const status = (t: string, cls = '') => { const s = $('#status', root); s.textContent = t; s.className = `status ${cls}`; };
    const pickCosmetic = (k: CaseInfo) => { let r = Math.random(); for (const it of k.items) { r -= it.chance; if (r < 0) return it; } return k.items[0]; };
    const reelHtml = (k: CaseInfo, final?: Drop) => Array.from({ length: REEL_LEN }, (_, i) => (i === STOP && final ? final : pickCosmetic(k)))
      .map((it) => `<div class="reel-item" style="--rc:${rarity(it.value, k.price)}">${itemArt(it.name)}<b>${esc(it.name)}</b><span class="num muted">${frags(it.value, 0)}</span></div>`).join('');

    const layout = () => {
      $('#reels', root).innerHTML = Array.from({ length: count }, (_, i) => `<div class="reel ${count > 2 ? 'compact' : ''}" aria-hidden="true"><div class="reel-track" data-track="${i}">${reelHtml(current)}</div></div>`).join('');
      $('#cur-name', root).textContent = current.name;
      $('#cur-cost', root).textContent = `${count} × ${frags(current.price, 0)} = ${frags(current.price * count, 0)} Frags`;
      $('#open', root).textContent = `Open ${count} · ${frags(current.price * count, 0)} Frags`;
    };
    const showCase = (k: CaseInfo) => {
      if (busy) return;
      current = k;
      $$('.case', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === k.id)));
      $('#odds-title', root).textContent = `Contents: ${k.name}`;
      $('#odds', root).innerHTML = [...k.items].sort((a, b) => b.value - a.value).map((it) => `<tr><td class="item-cell" style="--rc:${rarity(it.value, k.price)}">${itemArt(it.name)}<span>${esc(it.name)}</span></td><td class="r num">${frags(it.value, 0)}</td><td class="r num">${pctShort(it.chance)}</td></tr>`).join('');
      $('#drops', root).hidden = true;
      layout();
    };
    $$<HTMLButtonElement>('.case', root).forEach((b) => b.addEventListener('click', () => showCase(cases.find((k) => k.id === b.dataset.id)!)));
    $$<HTMLButtonElement>('[data-n]', root).forEach((b) => b.addEventListener('click', () => {
      if (busy) return;
      count = Number(b.dataset.n);
      $$('[data-n]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('#drops', root).hidden = true;
      layout();
    }));
    showCase(current);
    $('#fair', root).innerHTML = fairBox({ ...c.me.seed, nonce: c.me.seed.nextNonce });

    const paintSession = () => {
      if (!session.length) return;
      $('#session', root).innerHTML = session.slice(0, 40).map((d) => `<span class="chip" style="border-color:${rarity(d.value, d.price)};color:${rarity(d.value, d.price)}">${esc(d.name)} · ${frags(d.value, 0)}</span>`).join('');
      const spent = session.reduce((s, d) => s + d.price, 0);
      const got = session.reduce((s, d) => s + d.value, 0);
      $('#session-sum', root).textContent = `${session.length} crates · spent ${frags(spent, 0)} · dropped ${frags(got, 0)} Frags (${got >= spent ? '+' : '−'}${frags(Math.abs(got - spent), 0)})`;
    };

    $('#open', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      if (busy) return;
      busy = true;
      $('#drops', root).hidden = true;
      try {
        const k = current;
        const bets = await api<Bet<{ item: Drop }>[]>('POST', '/bets/cases/multi', { params: { caseId: k.id }, count });
        const drops = bets.map((b) => b.result!.item);
        // one reel per crate, the drop placed at the stop position; all spin together, slightly staggered
        const fast = $<HTMLInputElement>('#fast', root).checked;
        const dur = reducedMotion() ? 0 : fast ? 1300 : 4600;
        const reels = $$<HTMLElement>('[data-track]', root);
        reels.forEach((track, i) => {
          track.innerHTML = reelHtml(k, drops[i]);
          track.style.transition = 'none';
          track.style.transform = 'translateX(0)';
        });
        void root.offsetWidth;
        reels.forEach((track, i) => {
          const reelW = track.parentElement!.clientWidth;
          const jitter = (Math.random() - 0.5) * 80; // cosmetic: where inside the winning card the line stops
          track.style.transition = `transform ${dur + i * 140}ms cubic-bezier(.12,.8,.22,1)`;
          track.style.transform = `translateX(${-(STOP * ITEM_W + 10 + 60 - reelW / 2 + jitter)}px)`;
        });
        await new Promise((r) => setTimeout(r, dur + (reels.length - 1) * 140 + 100));
        const total = drops.reduce((s, d) => s + d.value, 0);
        const cost = k.price * drops.length;
        const box = $('#drops', root);
        box.innerHTML = drops.map((d) => `<div class="drop" style="--rc:${rarity(d.value, k.price)}">${itemArt(d.name)}<b>${esc(d.name)}</b><span class="num">${frags(d.value, 0)}</span></div>`).join('')
          + `<div class="drop sum ${total >= cost ? 'win' : 'lose'}"><span class="eyebrow">Total</span><b class="num">${frags(total, 0)}</b><span class="num">${total >= cost ? '+' : '−'}${frags(Math.abs(total - cost), 0)}</span></div>`;
        box.hidden = false;
        status(drops.length === 1 ? `${drops[0].name} · ${frags(drops[0].value, 0)} Frags` : `${drops.length} crates: ${frags(total, 0)} Frags for ${frags(cost, 0)}.`, total >= cost ? 'win' : 'lose');
        session.unshift(...drops.map((d) => ({ ...d, price: k.price })));
        paintSession();
        $('#fair', root).innerHTML = fairBox(bets[bets.length - 1].fairness) + (bets.length > 1 ? `<p class="muted" style="font-size:12px;margin-top:6px">Nonces ${bets.map((b) => b.fairness.nonce).join(', ')}: one round per crate.</p>` : '');
        await c.refresh();
      } finally {
        busy = false;
      }
    }));
  },
};
