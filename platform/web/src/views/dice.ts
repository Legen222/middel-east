import { type Bet, api } from '../api';
import type { View } from '../main';
import { $, $$, bindStake, fairBox, frags, guard, mult, readNum, reducedMotion, stakeField } from '../ui';

export const diceView: View = {
  title: 'Würfel',
  html: () => `
  <section class="game">
    <div class="game-stage">
      <div class="game-head">
        <div><p class="eyebrow">Original</p><h1 class="h-display">Würfel</h1>
          <p>Wurf von 0,00 bis 99,99. Du wählst die Gewinnchance, der Multiplikator ist immer 0,98 · 100 / Chance.</p></div>
        <div class="big-mult num" id="roll">––,––</div>
      </div>
      <div class="card" style="gap:10px">
        <svg viewBox="0 0 1000 60" style="width:100%;height:auto" aria-hidden="true">
          <rect x="0" y="24" width="1000" height="12" fill="var(--surface-2)"/>
          <rect id="winzone" x="0" y="24" width="495" height="12" fill="var(--patina)"/>
          <line id="marker" x1="-10" x2="-10" y1="8" y2="52" stroke="var(--hazard)" stroke-width="4"/>
          ${[0, 25, 50, 75, 100].map((v) => `<text x="${v * 10}" y="58" font-size="12" fill="var(--muted)" text-anchor="${v === 0 ? 'start' : v === 100 ? 'end' : 'middle'}" font-family="JetBrains Mono, monospace">${v}</text>`).join('')}
        </svg>
      </div>
      <p class="status" id="status" role="status">&nbsp;</p>
      <div class="chips" id="hist" aria-label="Letzte Würfe"></div>
    </div>
    <aside class="game-side">
      ${stakeField('stake', 10)}
      <label class="field">Gewinnchance (%)<input id="chance" type="range" min="1" max="9800" value="4950"></label>
      <div class="row" style="justify-content:space-between;font-size:14px"><span>Chance <b class="num" id="c-val">49,50 %</b></span><span>Multiplikator <b class="num" id="c-mult">1,9798×</b></span></div>
      <div class="seg" role="group" aria-label="Richtung"><button type="button" data-dir="under" aria-pressed="true">Unter</button><button type="button" data-dir="over" aria-pressed="false">Über</button></div>
      <button class="btn block" id="roll-btn" type="button">Würfeln</button>
      <div id="fair"></div>
    </aside>
  </section>`,
  mount: (root, c) => {
    bindStake(root);
    let dir: 'under' | 'over' = 'under';
    const chanceIn = $<HTMLInputElement>('#chance', root);
    const chance = () => Number(chanceIn.value) / 100;
    const hist: { roll: number; win: boolean }[] = [];
    const paint = () => {
      const ch = chance();
      $('#c-val', root).textContent = `${ch.toLocaleString('de-DE', { minimumFractionDigits: 2 })} %`;
      $('#c-mult', root).textContent = mult((0.98 * 100) / ch);
      const z = $('#winzone', root);
      z.setAttribute('x', String(dir === 'under' ? 0 : 1000 - ch * 10));
      z.setAttribute('width', String(ch * 10));
    };
    chanceIn.addEventListener('input', paint);
    $$<HTMLButtonElement>('[data-dir]', root).forEach((b) => b.addEventListener('click', () => {
      dir = b.dataset.dir as 'under' | 'over';
      $$('[data-dir]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      paint();
    }));
    paint();
    $('#fair', root).innerHTML = fairBox({ ...c.me.seed, nonce: c.me.seed.nextNonce });

    $('#roll-btn', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      const bet = await api<Bet<{ roll: number; win: boolean }>>('POST', '/bets/dice', { stake: readNum($<HTMLInputElement>('#stake', root).value), params: { chance: chance(), direction: dir } });
      const { roll, win } = bet.result!;
      const marker = $('#marker', root);
      const out = $('#roll', root);
      // count-up animation, 450 ms ease-out
      const t0 = performance.now(); const dur = reducedMotion() ? 0 : 450;
      await new Promise<void>((done) => {
        const step = (t: number) => {
          const k = dur ? Math.min(1, (t - t0) / dur) : 1; const v = roll * (1 - Math.pow(1 - k, 3));
          out.textContent = v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          marker.setAttribute('x1', String(v * 10)); marker.setAttribute('x2', String(v * 10));
          k < 1 ? requestAnimationFrame(step) : done();
        };
        requestAnimationFrame(step);
      });
      out.className = `big-mult num ${win ? 'win' : 'lose'}`;
      const s = $('#status', root);
      s.textContent = win ? `Gewonnen: +${frags(bet.payout - bet.stake)} Frags (${mult(bet.multiplier)})` : `Verloren: −${frags(bet.stake)} Frags`;
      s.className = `status ${win ? 'win' : 'lose'}`;
      hist.unshift({ roll, win }); hist.length = Math.min(hist.length, 12);
      $('#hist', root).innerHTML = hist.map((h) => `<span class="chip ${h.win ? 'win' : 'lose'}">${h.roll.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>`).join('');
      $('#fair', root).innerHTML = fairBox(bet.fairness);
      await c.refresh();
    }));
  },
};
