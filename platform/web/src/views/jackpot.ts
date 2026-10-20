import { api } from '../api';
import type { View } from '../main';
import { $, $$, esc, frags, guard, pct, readNum } from '../ui';

type Room = 'high' | 'low';
interface Pot {
  id: string; status: 'open' | 'counting' | 'locked' | 'settled' | 'refunded'; total: number; countdownEndsAt: number | null; settledAt: number | null;
  entries: { name: string; bot: boolean; you: boolean; amount: number; chance: number; ticketFrom: number; ticketTo: number }[];
  winner: { name: string; you: boolean; chance: number; payout: number; ticket: number } | null;
  fairness: { serverSeedHash: string; serverSeed: string | null; beacon: { name: string; trustless: boolean; round: number | null; resolvesAt: number | null; value: string | null; verifyUrl: string | null } };
}
interface JackpotState {
  now: number; room: Room; label: string; fee: number; min: number; max: number; countdownMs: number; maxEntries: number;
  current: Pot | null; last: Pot | null;
  history: { id: string; total: number; payout: number; chance: number; name: string; settledAt: number }[];
}

const PALETTE = ['#5AA9E6', '#C9A45C', '#6CCB8E', '#E5534B', '#4C8DF6', '#B88AE0', '#3FB950', '#DDBB75', '#8B949E', '#86C2F0'];

export const jackpotView: View = {
  title: 'Jackpot',
  html: () => `
  <section class="game">
    <div class="game-stage">
      <div class="game-head">
        <div><p class="eyebrow">Live · PvP</p><h1 class="h-display">Jackpot</h1>
          <p>Everyone throws Frags into one pot; your chance to take it all is your share of the pot. The house keeps 4 % of the pot, nothing else. The draw uses a beacon round fixed when the pot closes.</p></div>
        <div style="text-align:right"><div class="big-mult num" id="total">0.00</div><div class="eyebrow" id="phase">Frags in the pot</div></div>
      </div>
      <div class="seg" role="group" aria-label="Room" id="rooms"><button type="button" data-room="high" aria-pressed="true">High Rollers</button><button type="button" data-room="low" aria-pressed="false">Low Ballers</button></div>
      <div class="potbar" id="bar" aria-hidden="true"></div>
      <ul class="entries" id="entries"></ul>
      <div class="card" id="last" hidden></div>
      <div class="tablewrap"><table><thead><tr><th>Winner</th><th class="r">Pot</th><th class="r">Chance</th><th class="r">Paid</th></tr></thead><tbody id="hist"></tbody></table></div>
    </div>
    <aside class="game-side">
      <label class="field">Amount (Frags)<input id="amount" inputmode="decimal" value="10"></label>
      <p class="muted" style="font-size:13px" id="range"></p>
      <button class="btn block" id="enter" type="button">Join the pot</button>
      <button class="btn ghost block" id="bot" type="button" hidden>Add a demo bot</button>
      <p class="status" id="status" role="status">&nbsp;</p>
      <dl class="fairbox" id="fair"></dl>
      <p class="muted" style="font-size:12px">Tickets: one per milli-Frag, in order of entry. Winning ticket = ⌊f · total⌋ with f from HMAC(pot seed, beacon value). The pot seed's hash is shown from the start; the seed is revealed after the draw.</p>
    </aside>
  </section>`,
  mount: (root, c) => {
    let room: Room = 'high';
    let st: JackpotState | null = null;
    let offset = 0;
    let raf = 0;
    let lastSeen: string | undefined; // id of the last drawn pot; undefined until the first load
    const serverNow = () => Date.now() + offset;
    const status = (t: string, cls = '') => { const s = $('#status', root); s.textContent = t; s.className = `status ${cls}`; };
    $<HTMLButtonElement>('#bot', root).hidden = !c.cfg.demo;

    const load = async () => {
      const t0 = Date.now();
      const next = await api<JackpotState>('GET', `/jackpot/${room}`);
      if (next.room !== room) return;
      offset = next.now - (t0 + Date.now()) / 2;
      st = next;
      const lastId = st.last?.id ?? '';
      if (lastSeen !== undefined && lastId !== lastSeen && st.last?.winner && st.last.entries.some((e) => e.you)) {
        const w = st.last.winner;
        status(w.you ? `You won the pot: +${frags(w.payout)} Frags (${pct(w.chance, 1)} chance).` : `${w.name} won with ${pct(w.chance, 1)}.`, w.you ? 'win' : 'lose');
        await c.refresh();
      }
      lastSeen = lastId;
      paint();
    };

    const paint = () => {
      if (!st) return;
      const pot = st.current;
      const entries = pot?.entries ?? [];
      $('#total', root).textContent = frags(pot?.total ?? 0);
      $('#range', root).textContent = `${st.label}: ${frags(st.min)} to ${Number.isFinite(st.max) ? frags(st.max) : 'max stake'} Frags per entry, up to 5 entries each, ${st.maxEntries} per pot.`;
      $('#bar', root).innerHTML = entries.map((e, i) => `<i style="width:${e.chance * 100}%;background:${PALETTE[i % PALETTE.length]}" title="${esc(e.name)} ${pct(e.chance, 1)}"></i>`).join('');
      $('#entries', root).innerHTML = entries.length
        ? entries.map((e, i) => `<li class="${e.you ? 'you' : ''}"><span class="sw" style="background:${PALETTE[i % PALETTE.length]}"></span><span>${esc(e.name)}${e.you ? ' (you)' : ''}</span><span class="num">${frags(e.amount)}</span><span class="num muted">${pct(e.chance, 1)}</span></li>`).join('')
        : '<li><span></span><span class="muted">Empty pot. The first entry opens it; the countdown starts with the second player.</span><span></span><span></span></li>';
      const last = st.last;
      const lastBox = $('#last', root);
      lastBox.hidden = !last;
      if (last?.winner) lastBox.innerHTML = `<p class="eyebrow">Last pot</p><p><b>${esc(last.winner.name)}</b> took <b class="num">${frags(last.winner.payout)}</b> Frags with a ${pct(last.winner.chance, 1)} chance · ticket <span class="num">${last.winner.ticket}</span> of <span class="num">${Math.round(last.total * 1000)}</span>.</p>`;
      $('#hist', root).innerHTML = st.history.length ? st.history.map((h) => `<tr><td>${esc(h.name)}</td><td class="r num">${frags(h.total)}</td><td class="r num">${pct(h.chance, 1)}</td><td class="r num pos">${frags(h.payout)}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">No pots drawn yet.</td></tr>';
      const f = pot?.fairness ?? last?.fairness;
      $('#fair', root).innerHTML = f ? `
        <dt>${pot ? 'Pot' : 'Last pot'} seed hash</dt><dd>${esc(f.serverSeedHash)}</dd>
        ${f.serverSeed ? `<dt>Pot seed</dt><dd>${esc(f.serverSeed)}</dd>` : ''}
        <dt>Beacon</dt><dd>${esc(f.beacon.name)}${f.beacon.trustless ? '' : ' <span class="neg">(Demo)</span>'}${f.beacon.round ? ` · round ${f.beacon.round}` : ' · picked when the pot closes'}</dd>
        ${f.beacon.value ? `<dt>Beacon value</dt><dd>${esc(f.beacon.value)}</dd>` : ''}` : '';
      const canEnter = !pot || pot.status === 'open' || (pot.status === 'counting' && serverNow() < (pot.countdownEndsAt ?? 0));
      $<HTMLButtonElement>('#enter', root).disabled = !canEnter;
      $<HTMLButtonElement>('#bot', root).disabled = !canEnter || !entries.some((e) => e.you);
    };

    const clock = () => {
      raf = requestAnimationFrame(clock);
      const pot = st?.current;
      const ph = $('#phase', root);
      if (!pot) { ph.textContent = 'Frags in the pot'; return; }
      if (pot.status === 'open') ph.textContent = 'Waiting for a second player';
      else if (pot.status === 'counting') ph.textContent = `Closes in ${Math.max(0, ((pot.countdownEndsAt ?? 0) - serverNow()) / 1000).toFixed(1)} s`;
      else ph.textContent = 'Drawing …';
    };
    clock();

    $$<HTMLButtonElement>('[data-room]', root).forEach((b) => b.addEventListener('click', () => {
      room = b.dataset.room as Room;
      $$('[data-room]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      st = null; lastSeen = undefined;
      $<HTMLInputElement>('#amount', root).value = room === 'low' ? '5' : '10';
      void load();
    }));
    $('#enter', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      await api('POST', `/jackpot/${room}/enter`, { amount: readNum($<HTMLInputElement>('#amount', root).value) });
      status('You are in.');
      await load();
      await c.refresh();
    }));
    $('#bot', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => { await api('POST', `/jackpot/${room}/bot`, {}); await load(); }));

    const es = new EventSource('/api/events');
    es.addEventListener('jackpot', () => void load());
    const poll = setInterval(() => void load(), 2000);
    void load();
    return () => { cancelAnimationFrame(raf); es.close(); clearInterval(poll); };
  },
};
