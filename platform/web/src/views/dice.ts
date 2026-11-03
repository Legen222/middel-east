import { type Bet, api } from '../api';
import type { View } from '../main';
import { $, $$, bindStake, fairBox, frags, guard, mult, readNum, reducedMotion, stakeField } from '../ui';

export const diceView: View = {
  title: 'Dice',
  html: () => `
  <section class="game">
    <div class="game-stage">
      <div class="game-head">
        <div><p class="eyebrow">Original</p><h1 class="h-display">Dice</h1></div>
      </div>
      <div class="dice-stage">
        <div class="dice-result"><span class="dice-num num" id="roll">50.00</span><small class="muted" id="dice-goal"></small></div>
        <div class="dice-track" aria-hidden="true">
          <div class="dt-bar"><i class="dt-win" id="winzone"></i></div>
          <span class="dt-marker" id="marker" style="left:50%"><b class="num" id="marker-v">50.00</b></span>
          <div class="dt-ticks">${[0, 25, 50, 75, 100].map((v) => `<span>${v}</span>`).join('')}</div>
        </div>
      </div>
      <p class="status" id="status" role="status">&nbsp;</p>
      <div class="chips" id="hist" aria-label="Recent rolls"></div>
    </div>
    <aside class="game-side">
      ${stakeField('stake', 0.1)}
      <label class="field">Win chance (%)<input id="chance" type="range" min="1" max="9800" value="4950"></label>
      <div class="row" style="justify-content:space-between;font-size:14px"><span>Chance <b class="num" id="c-val">49.50 %</b></span><span>Multiplier <b class="num" id="c-mult">1.9798×</b></span></div>
      <div class="seg" role="group" aria-label="Direction"><button type="button" data-dir="under" aria-pressed="true">Under</button><button type="button" data-dir="over" aria-pressed="false">Over</button></div>
      <button class="btn block" id="roll-btn" type="button">Roll</button>
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
      $('#c-val', root).textContent = `${ch.toLocaleString('en-US', { minimumFractionDigits: 2 })} %`;
      $('#c-mult', root).textContent = mult((0.98 * 100) / ch);
      const z = $('#winzone', root);
      z.style.left = `${dir === 'under' ? 0 : 100 - ch}%`;
      z.style.width = `${ch}%`;
      const edge = (dir === 'under' ? ch : 100 - ch).toFixed(2);
      $('#dice-goal', root).textContent = `Roll ${dir} ${edge} to win ${mult((0.98 * 100) / ch)}`;
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
      const markerV = $('#marker-v', root);
      const out = $('#roll', root);
      out.className = 'dice-num num rolling';
      marker.className = 'dt-marker';
      // the marker slides from where it stood to the roll, the number counts along (550 ms ease-out)
      const from = Number.parseFloat(marker.style.left) || 50;
      const t0 = performance.now(); const dur = reducedMotion() ? 0 : 550;
      await new Promise<void>((done) => {
        const step = (t: number) => {
          const k = dur ? Math.min(1, (t - t0) / dur) : 1; const v = from + (roll - from) * (1 - Math.pow(1 - k, 3));
          const txt = v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          out.textContent = txt; markerV.textContent = txt;
          marker.style.left = `${v}%`;
          k < 1 ? requestAnimationFrame(step) : done();
        };
        requestAnimationFrame(step);
      });
      out.className = `dice-num num ${win ? 'win' : 'lose'}`;
      marker.className = `dt-marker ${win ? 'win' : 'lose'}`;
      const s = $('#status', root);
      s.textContent = win ? `Won: +${frags(bet.payout - bet.stake)} Scrap (${mult(bet.multiplier)})` : `Lost: −${frags(bet.stake)} Scrap`;
      s.className = `status ${win ? 'win' : 'lose'}`;
      hist.unshift({ roll, win }); hist.length = Math.min(hist.length, 12);
      $('#hist', root).innerHTML = hist.map((h) => `<span class="chip ${h.win ? 'win' : 'lose'}">${h.roll.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>`).join('');
      $('#fair', root).innerHTML = fairBox(bet.fairness);
      await c.refresh();
    }));
  },
};
