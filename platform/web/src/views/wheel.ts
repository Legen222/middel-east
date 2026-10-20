import { api } from '../api';
import type { View } from '../main';
import { $, $$, bindStake, esc, frags, guard, mult, readNum, reducedMotion, stakeField } from '../ui';

type Field = '1' | '3' | '5' | '10' | '20';
interface WheelState {
  now: number; layout: Field[]; payouts: Record<Field, number>; counts: Record<Field, number>;
  chain: { terminalHash: string; length: number; clientSeed: string | null; beaconRound: number; beacon: { name: string; trustless: boolean; verifyUrl: string } } | null;
  round: { id: number; index: number; status: 'betting' | 'spinning' | 'settled'; bettingEndsAt: number; spinEndsAt: number; fieldIndex: number | null; field: Field | null; seed: string | null; previousSeed: string | null } | null;
  bets: { name: string; you: boolean; field: Field; stake: number; payout: number | null }[];
  totals: Record<Field, number>;
  history: { round: number; index: number; field: Field; seed: string }[];
}

const FIELDS: Field[] = ['1', '3', '5', '10', '20'];
const COLOR: Record<Field, string> = { '1': '#8B949E', '3': '#3FB950', '5': '#4C8DF6', '10': '#E5534B', '20': '#C9A45C' };
const SEG = 68; // segment width + gap (px)
const LAPS = 6;
const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

export const wheelView: View = {
  title: 'Bandit Wheel',
  html: () => `
  <section class="game">
    <div class="game-stage">
      <div class="game-head">
        <div><p class="eyebrow">Live · Wheel</p><h1 class="h-display">Bandit Wheel</h1>
          <p>The big wheel from Bandit Camp: 25 segments, one spin every 25 seconds. Bet on 1, 3, 5, 10 or 20; a field with n segments pays 0.96 · 25 ÷ n, so every field returns 96 %.</p></div>
        <div style="text-align:right"><div class="big-mult" id="clock">–</div><div class="eyebrow" id="phase"></div></div>
      </div>
      <div class="wheel-reel" aria-hidden="true"><div class="wheel-track" id="track"></div></div>
      <div class="wfields" id="fields">${FIELDS.map((f) => `<button type="button" class="wfield" data-field="${f}" style="--wc:${COLOR[f]}"><b>${f}</b><span class="pay"></span><span class="tot"></span></button>`).join('')}</div>
      <div class="chips" id="hist" aria-label="Recent spins"></div>
      <div class="tablewrap"><table><thead><tr><th>Player</th><th>Field</th><th class="r">Stake</th><th class="r">Payout</th></tr></thead><tbody id="bets"></tbody></table></div>
    </div>
    <aside class="game-side">
      ${stakeField('stake', 10)}
      <p class="muted" style="font-size:13px">Tap a field to bet on it. One bet per field per spin; you can cover several fields.</p>
      <p class="status" id="status" role="status">&nbsp;</p>
      <dl class="fairbox" id="fair"></dl>
      <p class="muted" style="font-size:12px">Segment = ⌊f · 25⌋, f = first float of HMAC(round seed, chain client seed). Round seeds come from a published hash chain; the client seed is a public beacon value fixed after the chain was published.</p>
    </aside>
  </section>`,
  mount: (root, c) => {
    bindStake(root);
    let st: WheelState | null = null;
    let offset = 0;
    let spunRound = -1;
    let raf = 0;
    const track = $('#track', root);
    const reel = track.parentElement!;
    const serverNow = () => Date.now() + offset;
    const status = (t: string, cls = '') => { const s = $('#status', root); s.textContent = t; s.className = `status ${cls}`; };
    const center = () => reel.clientWidth / 2 - 32;
    const restAt = (index: number) => { track.style.transition = 'none'; track.style.transform = `translateX(${center() - ((LAPS - 1) * 25 + index) * SEG}px)`; };

    const build = (layout: Field[]) => {
      track.innerHTML = Array.from({ length: LAPS * 25 }, (_, i) => { const f = layout[i % 25]; return `<span class="wseg" style="--wc:${COLOR[f]}">${f}</span>`; }).join('');
    };

    const spin = (index: number, endsAt: number) => {
      const left = Math.max(0, endsAt - serverNow() - 300);
      // start one lap earlier and roll forward to the target segment
      track.style.transition = 'none';
      track.style.transform = `translateX(${center() - index * SEG}px)`;
      void track.offsetWidth;
      track.style.transition = reducedMotion() || left < 200 ? 'none' : `transform ${left}ms cubic-bezier(.12,.72,.18,1)`;
      track.style.transform = `translateX(${center() - ((LAPS - 1) * 25 + index) * SEG}px)`;
    };

    const load = async () => {
      const t0 = Date.now();
      const next = await api<WheelState>('GET', '/wheel/state');
      offset = next.now - (t0 + Date.now()) / 2;
      const first = !st;
      const prev = st?.round;
      st = next;
      if (first) { build(st.layout); restAt(st.history[0]?.index ?? 0); }
      const r = st.round;
      if (r && r.fieldIndex !== null && spunRound !== r.id) {
        spunRound = r.id;
        if (r.status === 'spinning') spin(r.fieldIndex, r.spinEndsAt); else restAt(r.fieldIndex);
      }
      if (prev && prev.status !== 'settled' && r?.id === prev.id && r.status === 'settled') {
        const mine = st.bets.filter((b) => b.you);
        if (mine.length) {
          const won = mine.reduce((a, b) => a + (b.payout ?? 0), 0);
          status(won > 0 ? `${r.field}: +${frags(won)} Frags.` : `${r.field}. No win this spin.`, won > 0 ? 'win' : 'lose');
          await c.refresh();
        }
      }
      paint();
    };

    const paint = async () => {
      if (!st) return;
      const r = st.round;
      const betting = r?.status === 'betting' && serverNow() < r.bettingEndsAt;
      $$<HTMLButtonElement>('[data-field]', root).forEach((b) => {
        const f = b.dataset.field as Field;
        const mine = st!.bets.filter((x) => x.you && x.field === f).reduce((a, x) => a + x.stake, 0);
        b.disabled = !betting || mine > 0;
        b.classList.toggle('hit', r?.status === 'settled' && r.field === f);
        $('.pay', b).textContent = `${mult(st!.payouts[f])} · ${st!.counts[f]}/25`;
        $('.tot', b).textContent = mine ? `you ${frags(mine)}` : `${frags(st!.totals[f] ?? 0)} in`;
      });
      $('#hist', root).innerHTML = st.history.slice(0, 24).map((h) => `<span class="chip" style="border-color:${COLOR[h.field]};color:${COLOR[h.field]}">${h.field}</span>`).join('');
      $('#bets', root).innerHTML = st.bets.length ? st.bets.map((b) => `<tr${b.you ? ' style="color:var(--bp)"' : ''}><td>${esc(b.name)}${b.you ? ' (you)' : ''}</td><td><span class="chip" style="color:${COLOR[b.field]};border-color:${COLOR[b.field]}">${b.field}</span></td><td class="r num">${frags(b.stake)}</td><td class="r num ${b.payout ? 'pos' : b.payout === 0 ? 'neg' : ''}">${b.payout === null ? '–' : frags(b.payout)}</td></tr>`).join('')
        : '<tr><td colspan="4" class="muted">No bets this spin yet.</td></tr>';
      let link = '';
      if (r?.seed && r.previousSeed) link = (await sha256(r.seed)) === r.previousSeed ? '✓ matches previous round' : '✗ does NOT match';
      $('#fair', root).innerHTML = st.chain ? `
        <dt>Chain terminal hash</dt><dd>${esc(st.chain.terminalHash)}</dd>
        <dt>Client seed</dt><dd>${st.chain.clientSeed ? esc(st.chain.clientSeed) : `waiting for beacon round ${st.chain.beaconRound}`}</dd>
        <dt>Beacon</dt><dd>${esc(st.chain.beacon.name)}${st.chain.beacon.trustless ? '' : ' <span class="neg">(Demo)</span>'}</dd>
        <dt>Round</dt><dd>#${r ? r.index : '–'}</dd>
        ${r?.seed ? `<dt>Seed</dt><dd>${esc(r.seed)}</dd><dt>Chain</dt><dd>${link}</dd>` : ''}` : '';
    };

    const clock = () => {
      raf = requestAnimationFrame(clock);
      const r = st?.round;
      if (!r) return;
      const now = serverNow();
      const el = $('#clock', root), ph = $('#phase', root);
      if (r.status === 'betting' && now < r.bettingEndsAt) { el.textContent = `${((r.bettingEndsAt - now) / 1000).toFixed(1)} s`; ph.textContent = 'Bets open'; }
      else if (r.status !== 'settled' && now < r.spinEndsAt) { el.textContent = '…'; ph.textContent = 'Spinning'; }
      else { el.textContent = r.field ?? '–'; ph.textContent = 'Result'; }
    };
    clock();

    $$<HTMLButtonElement>('[data-field]', root).forEach((b) => b.addEventListener('click', () => guard(b, async () => {
      await api('POST', '/wheel/bet', { field: b.dataset.field, stake: readNum($<HTMLInputElement>('#stake', root).value) });
      status(`Bet on ${b.dataset.field} placed.`);
      await load();
      await c.refresh();
    })));

    const es = new EventSource('/api/events');
    es.addEventListener('wheel', () => void load());
    const poll = setInterval(() => void load(), 2000);
    void load();
    addEventListener('resize', onResize);
    function onResize() { const r = st?.round; if (r?.fieldIndex != null && r.status !== 'spinning') restAt(r.fieldIndex); }
    return () => { cancelAnimationFrame(raf); es.close(); clearInterval(poll); removeEventListener('resize', onResize); };
  },
};
