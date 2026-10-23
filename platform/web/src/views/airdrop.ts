import { type Bet, api } from '../api';
import type { View } from '../main';
import { $, SCRAP_SYM, bindStake, fairBox, frags, guard, mult, pctShort, readNum, reducedMotion, stakeField } from '../ui';

const E = 0.02;
const MAX_TARGET = 10_000;

export const airdropView: View = {
  title: 'Airdrop',
  html: () => `
  <section class="game">
    <div class="game-stage">
      <div class="game-head">
        <div><p class="eyebrow">Original · Instant</p><h1 class="h-display">Airdrop</h1>
          <p>Pick where the crate has to land. It lands at x or higher with chance 0.98 ÷ x; if it reaches your target you get stake × target. 98 % RTP for every target.</p></div>
        <div class="big-mult" id="land">–</div>
      </div>
      <div class="kpis">
        <div class="kpi"><span class="eyebrow">Win chance</span><b class="num" id="chance"></b></div>
        <div class="kpi"><span class="eyebrow">Payout on win</span><b class="num">${SCRAP_SYM}<span id="win"></span></b></div>
      </div>
      <div class="chips" id="hist" aria-label="Recent drops"></div>
      <p class="status" id="status" role="status">Set a target between 1.01× and 10,000×.</p>
    </div>
    <aside class="game-side">
      ${stakeField('stake', 10)}
      <label class="field">Target (×)<input id="target" inputmode="decimal" value="2.00"></label>
      <div class="row">${[1.5, 2, 5, 10, 100].map((t) => `<button type="button" class="btn ghost small" data-t="${t}">${t}×</button>`).join('')}</div>
      <button class="btn block" id="drop" type="button">Call the drop</button>
      <div id="fair"></div>
      <p class="muted" style="font-size:12px">Landing = ⌊100 · 0.98 · 2⁵² / (2⁵² − h)⌋ / 100, with h built from two floats of your seed stream: the Scrap Press formula.</p>
    </aside>
  </section>`,
  mount: (root, c) => {
    bindStake(root);
    const target = $<HTMLInputElement>('#target', root);
    const stake = $<HTMLInputElement>('#stake', root);
    const hist: number[] = [];
    const status = (t: string, cls = '') => { const s = $('#status', root); s.textContent = t; s.className = `status ${cls}`; };
    const preview = () => {
      const t = readNum(target.value);
      const ok = t >= 1.01 && t <= MAX_TARGET;
      $('#chance', root).textContent = ok ? pctShort((1 - E) / t) : '–';
      $('#win', root).textContent = ok ? frags(readNum(stake.value) * t) : '–';
    };
    target.addEventListener('input', preview);
    stake.addEventListener('input', preview);
    root.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => b.addEventListener('click', () => { target.value = Number(b.dataset.t).toFixed(2); preview(); }));
    preview();
    $('#fair', root).innerHTML = fairBox({ ...c.me.seed, nonce: c.me.seed.nextNonce });

    const count = (to: number, cls: string) => new Promise<void>((done) => {
      const el = $('#land', root);
      if (reducedMotion()) { el.textContent = mult(to); el.className = `big-mult ${cls}`; return done(); }
      const t0 = performance.now();
      const dur = Math.min(1100, 300 + Math.log(to) * 180);
      el.className = 'big-mult';
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / dur);
        el.textContent = mult(Math.exp(Math.log(to) * (1 - (1 - k) ** 3)));
        if (k < 1) requestAnimationFrame(step); else { el.className = `big-mult ${cls}`; done(); }
      };
      requestAnimationFrame(step);
    });

    $('#drop', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      const t = Math.round(readNum(target.value) * 100) / 100;
      const bet = await api<Bet<{ landing: number; win: boolean }>>('POST', '/bets/airdrop', { stake: readNum(stake.value), params: { target: t } });
      const r = bet.result!;
      await count(r.landing, r.win ? 'win' : 'lose');
      status(r.win ? `Landed at ${mult(r.landing)}: +${frags(bet.payout)} Scrap.` : `Landed at ${mult(r.landing)}, short of ${mult(t)}.`, r.win ? 'win' : 'lose');
      hist.unshift(r.landing);
      $('#hist', root).innerHTML = hist.slice(0, 20).map((h) => `<span class="chip ${h >= t ? 'win' : 'lose'}">${mult(h)}</span>`).join('');
      $('#fair', root).innerHTML = fairBox(bet.fairness);
      await c.refresh();
    }));
  },
};
