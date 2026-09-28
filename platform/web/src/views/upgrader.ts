import { type Bet, api } from '../api';
import type { View } from '../main';
import { $, bindStake, fairBox, frags, guard, mult, pct, readNum, reducedMotion, stakeField } from '../ui';

const R = 110;
const C = 2 * Math.PI * R;

export const upgraderView: View = {
  title: 'Workbench',
  html: () => `
  <section class="game">
    <div class="game-stage">
      <div class="game-head">
        <div><p class="eyebrow">Original</p><h1 class="h-display">Workbench</h1>
          <p>Upgrade your stake. Chance = 0.95 ÷ target multiplier, allowed range 1 to 80 %.</p></div>
        <div class="big-mult" id="res">–</div>
      </div>
      <div class="gauge"><svg viewBox="0 0 280 280" role="img" aria-label="Win chance">
        <circle cx="140" cy="140" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="22"/>
        <circle id="arc" cx="140" cy="140" r="${R}" fill="none" stroke="var(--patina)" stroke-width="22" stroke-dasharray="0 ${C}" transform="rotate(-90 140 140)"/>
        <g id="needle" transform="rotate(0 140 140)"><line x1="140" y1="16" x2="140" y2="46" stroke="var(--hazard)" stroke-width="5"/></g>
        <text x="140" y="136" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="30" fill="var(--text)" id="g-chance">47.50 %</text>
        <text x="140" y="164" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-size="15" fill="var(--muted)" letter-spacing="2">WIN CHANCE</text>
      </svg></div>
      <p class="status" id="status" role="status">&nbsp;</p>
    </div>
    <aside class="game-side">
      ${stakeField('stake', 10)}
      <label class="field">Target multiplier<input id="target" inputmode="decimal" value="2"></label>
      <div class="row" style="justify-content:space-between;font-size:14px"><span>Target <b class="num" id="t-val"></b></span><span>Chance <b class="num" id="t-chance"></b></span></div>
      <button class="btn block" id="go" type="button">Upgrade</button>
      <div id="fair"></div>
    </aside>
  </section>`,
  mount: (root, c) => {
    bindStake(root);
    let angle = 0;
    const target = () => readNum($<HTMLInputElement>('#target', root).value);
    const paint = () => {
      const t = target(); const ch = 0.95 / t; const ok = ch >= 0.01 && ch <= 0.8 && Number.isFinite(ch);
      $('#t-val', root).textContent = `${frags(readNum($<HTMLInputElement>('#stake', root).value) * t)} Frags`;
      $('#t-chance', root).textContent = ok ? pct(ch) : 'outside 1–80 %';
      $('#g-chance', root).textContent = ok ? pct(ch) : '–';
      $('#arc', root).setAttribute('stroke-dasharray', `${ok ? ch * C : 0} ${C}`);
      ($('#go', root) as HTMLButtonElement).disabled = !ok;
    };
    $('#target', root).addEventListener('input', paint);
    $('#stake', root).addEventListener('input', paint);
    paint();
    $('#fair', root).innerHTML = fairBox({ ...c.me.seed, nonce: c.me.seed.nextNonce });

    $('#go', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      const bet = await api<Bet<{ roll: number; chance: number; win: boolean }>>('POST', '/bets/upgrader', { stake: readNum($<HTMLInputElement>('#stake', root).value), params: { multiplier: target() } });
      const { roll, win } = bet.result!;
      const needle = $('#needle', root);
      angle = angle - (angle % 360) + 360 * 3 + roll * 360;
      const dur = reducedMotion() ? 0 : 2600;
      needle.style.transition = `transform ${dur}ms cubic-bezier(.12,.8,.38,1)`;
      needle.style.transformOrigin = '140px 140px';
      needle.style.transform = `rotate(${angle}deg)`;
      await new Promise((r) => setTimeout(r, dur + 60));
      const res = $('#res', root); res.textContent = win ? mult(bet.multiplier) : '0×'; res.className = `big-mult ${win ? 'win' : 'lose'}`;
      const s = $('#status', root);
      s.textContent = win ? `Upgrade succeeded: +${frags(bet.payout - bet.stake)} Frags` : `Upgrade failed (roll ${roll.toFixed(4)}).`;
      s.className = `status ${win ? 'win' : 'lose'}`;
      $('#fair', root).innerHTML = fairBox(bet.fairness);
      await c.refresh();
    }));
  },
};
