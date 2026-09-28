import { type Bet, api } from '../api';
import type { View } from '../main';
import { $, $$, bindStake, fairBox, frags, guard, mult, pct, readNum, reducedMotion, stakeField } from '../ui';

const W = 560;
const H = 420;

export const plinkoView: View = {
  title: 'Schrottrutsche',
  html: () => `
  <section class="game">
    <div class="game-stage">
      <div class="game-head">
        <div><p class="eyebrow">Original</p><h1 class="h-display">Schrottrutsche</h1>
          <p>Jede Reihe ein Wurf: unter 0,5 links, sonst rechts. Das Fach ist die Zahl der Rechts-Sprünge.</p></div>
        <div class="big-mult" id="mult">–</div>
      </div>
      <div class="plinko"><svg id="board" viewBox="0 0 ${W} ${H}" role="img" aria-label="Plinko-Brett"></svg><div class="buckets" id="buckets"></div></div>
      <p class="status" id="status" role="status">&nbsp;</p>
    </div>
    <aside class="game-side">
      ${stakeField('stake', 10)}
      <div class="seg" role="group" aria-label="Reihen">${[8, 12, 16].map((r) => `<button type="button" data-rows="${r}" aria-pressed="${r === 12}">${r} Reihen</button>`).join('')}</div>
      <div class="seg" role="group" aria-label="Risiko">${[['low', 'Niedrig'], ['medium', 'Mittel'], ['high', 'Hoch']].map(([k, l]) => `<button type="button" data-risk="${k}" aria-pressed="${k === 'medium'}">${l}</button>`).join('')}</div>
      <p class="muted" style="font-size:13px">RTP dieser Tabelle: <b class="num" id="rtp"></b></p>
      <button class="btn block" id="drop" type="button">Fallen lassen</button>
      <div id="fair"></div>
    </aside>
  </section>`,
  mount: (root, c) => {
    bindStake(root);
    let rows = 12; let risk = 'medium';
    const board = $('#board', root);
    const pegPos = (r: number, i: number) => {
      const gapX = W / (rows + 2); const gapY = (H - 40) / (rows + 1);
      return { x: W / 2 + (i - r / 2) * gapX, y: 30 + r * gapY };
    };
    const drawBoard = () => {
      const t = c.cfg.plinko[String(rows)][risk];
      let pegs = '';
      for (let r = 0; r < rows; r++) for (let i = 0; i <= r + 2; i++) { const p = pegPos(r + 1, i - 1); pegs += `<circle cx="${p.x}" cy="${p.y}" r="3.2" fill="var(--muted)"/>`; }
      board.innerHTML = pegs + '<circle id="ball" cx="-20" cy="-20" r="7" fill="var(--hazard)"/>';
      const bk = $('#buckets', root);
      bk.style.gridTemplateColumns = `repeat(${rows + 1}, minmax(0,1fr))`;
      bk.innerHTML = t.multipliers.map((m, i) => `<span class="bucket" data-b="${i}">${m}</span>`).join('');
      $('#rtp', root).textContent = pct(t.rtp, 3);
    };
    const pick = (attr: string, set: (v: string) => void) => $$<HTMLButtonElement>(`[data-${attr}]`, root).forEach((b) => b.addEventListener('click', () => {
      set(b.dataset[attr]!); $$(`[data-${attr}]`, root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawBoard();
    }));
    pick('rows', (v) => { rows = Number(v); });
    pick('risk', (v) => { risk = v; });
    drawBoard();
    $('#fair', root).innerHTML = fairBox({ ...c.me.seed, nonce: c.me.seed.nextNonce });

    $('#drop', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      const bet = await api<Bet<{ path: ('L' | 'R')[]; bucket: number }>>('POST', '/bets/plinko', { stake: readNum($<HTMLInputElement>('#stake', root).value), params: { rows, risk } });
      const ball = $('#ball', root);
      let pos = 0;
      const points = [{ x: W / 2, y: 10 }];
      bet.result!.path.forEach((d, r) => { if (d === 'R') pos++; const p = pegPos(r + 1, pos); points.push({ x: p.x, y: p.y - 8 }); });
      points.push({ x: W / 2 + (bet.result!.bucket - rows / 2) * (W / (rows + 2)), y: H - 8 });
      const step = reducedMotion() ? 0 : 90;
      for (const p of points) { ball.setAttribute('cx', String(p.x)); ball.setAttribute('cy', String(p.y)); if (step) await new Promise((r) => setTimeout(r, step)); }
      $$('.bucket', root).forEach((b) => b.classList.toggle('hit', Number(b.dataset.b) === bet.result!.bucket));
      const m = $('#mult', root); m.textContent = mult(bet.multiplier); m.className = `big-mult ${bet.multiplier >= 1 ? 'win' : 'lose'}`;
      const s = $('#status', root);
      s.textContent = `Fach ${bet.result!.bucket} · ${bet.payout >= bet.stake ? '+' : '−'}${frags(Math.abs(bet.payout - bet.stake))} Frags`;
      s.className = `status ${bet.payout >= bet.stake ? 'win' : 'lose'}`;
      $('#fair', root).innerHTML = fairBox(bet.fairness);
      await c.refresh();
    }));
  },
};
