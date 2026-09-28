import { type MinesBet, api } from '../api';
import { icon } from '../icons';
import type { View } from '../main';
import { $, $$, bindStake, fairBox, frags, guard, mult, readNum, stakeField } from '../ui';

const binom = (n: number, k: number) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
const ladder = (m: number, k: number) => (k === 0 ? 1 : (0.97 * binom(25, k)) / binom(25 - m, k));

export const minesView: View = {
  title: 'Minenfeld',
  html: () => `
  <section class="game">
    <div class="game-stage">
      <div class="game-head">
        <div><p class="eyebrow">Original</p><h1 class="h-display">Minenfeld</h1>
          <p>Decke sichere Felder auf und steig aus, bevor du auf eine Mine trittst. Multiplikator = 0,97 · C(25, k) / C(25 − m, k).</p></div>
        <div class="big-mult" id="mult">1,00×</div>
      </div>
      <div class="minefield" id="field">${Array.from({ length: 25 }, (_, i) => `<button type="button" class="cell" data-t="${i}" aria-label="Feld ${i + 1}" disabled></button>`).join('')}</div>
      <p class="status" id="status" role="status">Minenzahl und Einsatz wählen.</p>
    </div>
    <aside class="game-side">
      ${stakeField('stake', 10)}
      <label class="field">Minen <input id="mines" type="range" min="1" max="24" value="3"></label>
      <div class="row" style="justify-content:space-between;font-size:13px"><span class="muted">Minen: <b class="num" id="m-count">3</b></span><span class="muted">1. Feld: <b class="num" id="m-first"></b> · 5. Feld: <b class="num" id="m-fifth"></b></span></div>
      <button class="btn block" id="start" type="button">Runde starten</button>
      <button class="btn win block" id="cash" type="button" hidden>Auszahlen</button>
      <div id="fair"></div>
    </aside>
  </section>`,
  mount: (root, c) => {
    bindStake(root);
    let bet: MinesBet | null = null;
    const cells = $$<HTMLButtonElement>('.cell', root);
    const minesInput = $<HTMLInputElement>('#mines', root);
    const status = (t: string, cls = '') => { const s = $('#status', root); s.textContent = t; s.className = `status ${cls}`; };

    const preview = () => {
      const m = Number(minesInput.value);
      $('#m-count', root).textContent = String(m);
      $('#m-first', root).textContent = mult(ladder(m, 1));
      $('#m-fifth', root).textContent = 25 - m >= 5 ? mult(ladder(m, 5)) : '–';
    };
    minesInput.addEventListener('input', preview);
    preview();

    const draw = () => {
      const open = bet?.status === 'open';
      const revealed = new Set(open ? bet!.revealed ?? [] : bet?.result?.revealed ?? []);
      const mines = new Set<number>(bet?.status === 'settled' ? bet.result?.mines ?? [] : []);
      const hit = bet?.result?.hit as number | undefined;
      cells.forEach((cell, i) => {
        cell.disabled = !open || revealed.has(i);
        cell.className = 'cell';
        cell.innerHTML = '';
        if (revealed.has(i)) { cell.classList.add('safe'); cell.innerHTML = icon('shield'); }
        else if (i === hit) { cell.classList.add('mine'); cell.innerHTML = icon('mine'); }
        else if (mines.has(i)) { cell.classList.add('ghost-mine'); cell.innerHTML = icon('mine'); }
      });
      minesInput.disabled = open;
      $('#start', root).hidden = open;
      const cash = $<HTMLButtonElement>('#cash', root);
      cash.hidden = !open;
      cash.disabled = !open || revealed.size === 0;
      if (open) cash.textContent = `Auszahlen · ${frags(bet!.stake * (bet!.currentMultiplier ?? 1))}`;
      const m = $('#mult', root);
      m.textContent = mult(open ? bet!.currentMultiplier ?? 1 : bet?.multiplier ?? 1);
      m.className = `big-mult ${bet?.status === 'settled' ? (bet.payout > 0 ? 'win' : 'lose') : ''}`;
      $('#fair', root).innerHTML = bet ? fairBox(bet.fairness) : fairBox({ ...c.me.seed, nonce: c.me.seed.nextNonce });
    };

    api<MinesBet[]>('GET', '/games/open').then((g) => {
      const r = g.find((x) => x.game === 'mines');
      if (r) { bet = r; minesInput.value = String(r.mines); preview(); status('Offene Runde gefunden. Weiter aufdecken oder auszahlen.'); draw(); }
    }).catch(() => null);

    $('#start', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      bet = await api<MinesBet>('POST', '/mines/start', { stake: readNum($<HTMLInputElement>('#stake', root).value), mines: Number(minesInput.value) });
      status(`Nächstes Feld: ${mult(bet.nextMultiplier ?? 1)}`);
      draw();
      await c.refresh();
    }));
    cells.forEach((cell) => cell.addEventListener('click', () => guard(cell, async () => {
      if (!bet || bet.status !== 'open') return;
      bet = await api<MinesBet>('POST', `/mines/${bet.id}/reveal`, { tile: Number(cell.dataset.t) });
      if (bet.status === 'settled') {
        status(bet.payout > 0 ? `Alle sicheren Felder gefunden: +${frags(bet.payout)} Frags.` : 'Mine! Runde verloren.', bet.payout > 0 ? 'win' : 'lose');
        await c.refresh();
      } else status(`Sicher. Nächstes Feld: ${mult(bet.nextMultiplier ?? 1)}`);
      draw();
    })));
    $('#cash', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      if (!bet) return;
      bet = await api<MinesBet>('POST', `/mines/${bet.id}/cashout`, {});
      status(`Ausgezahlt: ${frags(bet.payout)} Frags.`, 'win');
      draw();
      await c.refresh();
    }));
    draw();
  },
};
