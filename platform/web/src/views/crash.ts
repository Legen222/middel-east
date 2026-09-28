import { api } from '../api';
import type { View } from '../main';
import { $, bindStake, esc, frags, guard, mult, readNum, stakeField, toast } from '../ui';

interface CrashState {
  now: number; rate: number;
  chain: { terminalHash: string; length: number; clientSeed: string | null; beaconRound: number; beacon: { name: string; trustless: boolean; verifyUrl: string } } | null;
  round: { id: number; index: number; status: 'betting' | 'running' | 'crashed'; bettingEndsAt: number; crash: number | null; seed: string | null; previousSeed: string | null } | null;
  bets: { name: string; you: boolean; stake: number; target: number; cashedAt: number | null; payout: number | null }[];
  history: { round: number; index: number; crash: number; seed: string }[];
}

const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

export const crashView: View = {
  title: 'Schrottpresse',
  html: () => `
  <section class="game">
    <div class="game-stage">
      <div class="game-head">
        <div><p class="eyebrow">Live · Crash</p><h1 class="h-display">Schrottpresse</h1>
          <p>Die Presse fährt hoch, der Multiplikator steigt. Raus, bevor sie zuschlägt. P(Crash ≥ x) = 0,98 ÷ x, also 98 % RTP bei jedem Ziel ab 1,01×.</p></div>
      </div>
      <div style="position:relative;border:1px solid var(--line);border-radius:3px;background:var(--bg);aspect-ratio:16/8;max-width:100%">
        <canvas id="cv" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
        <div id="big" class="big-mult" style="position:absolute;left:18px;top:14px">–</div>
        <div id="phase" class="eyebrow" style="position:absolute;right:16px;top:18px"></div>
      </div>
      <div class="chips" id="hist" aria-label="Letzte Runden"></div>
      <div class="tablewrap"><table><thead><tr><th>Spieler</th><th class="r">Einsatz</th><th class="r">Auto</th><th class="r">Raus bei</th><th class="r">Gewinn</th></tr></thead><tbody id="bets"></tbody></table></div>
    </div>
    <aside class="game-side">
      ${stakeField('stake', 10)}
      <label class="field">Auto-Auszahlung (×)<input id="target" inputmode="decimal" value="2.00"></label>
      <button class="btn block" id="bet" type="button">Setzen</button>
      <button class="btn win block" id="out" type="button" hidden>Auszahlen</button>
      <p class="status" id="status" role="status">&nbsp;</p>
      <dl class="fairbox" id="fair"></dl>
    </aside>
  </section>`,
  mount: (root, c) => {
    bindStake(root);
    let st: CrashState | null = null;
    let offset = 0; // server clock − local clock
    let raf = 0;
    const cv = $<HTMLCanvasElement>('#cv', root);
    const ctx = cv.getContext('2d')!;
    const serverNow = () => Date.now() + offset;
    const status = (t: string, cls = '') => { const s = $('#status', root); s.textContent = t; s.className = `status ${cls}`; };

    const load = async () => {
      const t0 = Date.now();
      const next = await api<CrashState>('GET', '/crash/state');
      offset = next.now - (t0 + Date.now()) / 2;
      const prevStatus = st?.round?.status;
      st = next;
      paintSide();
      if (prevStatus === 'running' && st.round?.status === 'crashed') await c.refresh();
    };

    const paintSide = async () => {
      if (!st) return;
      const r = st.round;
      $('#hist', root).innerHTML = st.history.map((h) => `<span class="chip ${h.crash >= 2 ? 'win' : h.crash < 1.2 ? 'lose' : ''}">${mult(h.crash)}</span>`).join('');
      $('#bets', root).innerHTML = st.bets.length ? st.bets.map((b) => `<tr${b.you ? ' style="color:var(--hazard)"' : ''}><td>${esc(b.name)}${b.you ? ' (du)' : ''}</td><td class="r num">${frags(b.stake)}</td><td class="r num">${mult(b.target)}</td><td class="r num">${b.cashedAt ? mult(b.cashedAt) : r?.status === 'crashed' && b.payout ? mult(b.target) : '–'}</td><td class="r num ${b.payout ? 'pos' : b.payout === 0 ? 'neg' : ''}">${b.payout === null ? '–' : frags(b.payout)}</td></tr>`).join('')
        : '<tr><td colspan="5" class="muted">Noch keine Einsätze in dieser Runde.</td></tr>';
      const mine = st.bets.find((b) => b.you);
      ($('#bet', root) as HTMLButtonElement).disabled = !(r?.status === 'betting') || Boolean(mine);
      const out = $<HTMLButtonElement>('#out', root);
      out.hidden = !(mine && mine.payout === null && r?.status === 'running');
      let link = '';
      if (r?.seed && r.previousSeed) link = (await sha256(r.seed)) === r.previousSeed ? '✓ passt zur Vorrunde' : '✗ passt NICHT';
      $('#fair', root).innerHTML = st.chain ? `
        <dt>Ketten-Endhash</dt><dd>${esc(st.chain.terminalHash)}</dd>
        <dt>Client-Seed</dt><dd>${st.chain.clientSeed ? esc(st.chain.clientSeed) : 'wartet auf Beacon-Runde ' + st.chain.beaconRound}</dd>
        <dt>Beacon</dt><dd>${esc(st.chain.beacon.name)}${st.chain.beacon.trustless ? '' : ' <span class="neg">(Demo)</span>'}</dd>
        <dt>Runde</dt><dd>#${r ? r.index : '–'}</dd>
        ${r?.seed ? `<dt>Seed</dt><dd>${esc(r.seed)}</dd><dt>Kette</dt><dd>${link}</dd>` : ''}` : '';
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!st?.round) return;
      const dpr = devicePixelRatio || 1;
      const W = (cv.width = cv.clientWidth * dpr), H = (cv.height = cv.clientHeight * dpr);
      ctx.clearRect(0, 0, W, H);
      const r = st.round;
      const big = $('#big', root), phase = $('#phase', root);
      const now = serverNow();
      if (r.status === 'betting' || now < r.bettingEndsAt) {
        const left = Math.max(0, (r.bettingEndsAt - now) / 1000);
        big.textContent = `${left.toFixed(1).replace('.', ',')} s`; big.className = 'big-mult'; phase.textContent = 'Einsätze offen';
        return;
      }
      const elapsed = now - r.bettingEndsAt;
      let m = Math.exp(st.rate * elapsed);
      const crashed = r.status === 'crashed' && r.crash !== null;
      if (crashed) m = r.crash!;
      // axis: time 0..max(elapsed,10s); multiplier 1..max(m,2)
      const tMax = Math.max(10_000, crashed ? Math.log(r.crash!) / st.rate : elapsed) * 1.1;
      const mMax = Math.max(2, m * 1.15);
      const X = (t: number) => 40 * dpr + (t / tMax) * (W - 60 * dpr);
      const Y = (v: number) => H - 26 * dpr - ((v - 1) / (mMax - 1)) * (H - 50 * dpr);
      ctx.strokeStyle = '#4A3F33'; ctx.lineWidth = dpr; ctx.font = `${11 * dpr}px JetBrains Mono, monospace`; ctx.fillStyle = '#A89B87';
      for (const g of [1, 1.5, 2, 5, 10, 50, 100, 500, 1000]) if (g <= mMax) { ctx.beginPath(); ctx.moveTo(X(0), Y(g)); ctx.lineTo(W, Y(g)); ctx.stroke(); ctx.fillText(`${g}×`, 4 * dpr, Y(g) + 4 * dpr); }
      const tEnd = crashed ? Math.log(r.crash!) / st.rate : elapsed;
      ctx.strokeStyle = crashed ? '#D0563B' : '#E8B21A'; ctx.lineWidth = 3 * dpr; ctx.beginPath();
      for (let i = 0; i <= 120; i++) { const t = (tEnd * i) / 120; const v = Math.exp(st.rate * t); i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v)); }
      ctx.stroke();
      big.textContent = mult(Math.floor(m * 100) / 100); big.className = `big-mult ${crashed ? 'lose' : ''}`;
      phase.textContent = crashed ? 'Gepresst' : 'Läuft';
    };
    draw(); // the curve is information, not decoration, so it also runs with reduced motion

    const es = new EventSource('/api/crash/stream');
    for (const ev of ['betting', 'running', 'crashed', 'bet', 'cashout']) es.addEventListener(ev, () => void load());
    const poll = setInterval(() => void load(), 2000);
    void load();

    $('#bet', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      await api('POST', '/crash/bet', { stake: readNum($<HTMLInputElement>('#stake', root).value), target: readNum($<HTMLInputElement>('#target', root).value) });
      status('Einsatz steht. Auto-Auszahlung aktiv.'); await load(); await c.refresh();
    }));
    $('#out', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      const r = await api<{ multiplier: number; payout: number }>('POST', '/crash/cashout', {});
      status(`Raus bei ${mult(r.multiplier)}: +${frags(r.payout)} Frags`, 'win'); toast(`Ausgezahlt bei ${mult(r.multiplier)}`);
      await load(); await c.refresh();
    }));

    return () => { cancelAnimationFrame(raf); es.close(); clearInterval(poll); };
  },
};
