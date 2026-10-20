import { type Bet, api } from '../api';
import { icon } from '../icons';
import type { View } from '../main';
import { $, $$, bindStake, esc, fairBox, frags, guard, mult, pct, readNum, reducedMotion, stakeField } from '../ui';

const E = 0.05;
const MIN_CHANCE = 0.01;
const MAX_CHANCE = 0.8;
const STEPS = 10_000; // zone start resolution: 1/10 000 of the ring
const CX = 170;
const R = 124; // ring radius (svg units)
const SPIN_MS = 4200;

interface UpgradeResult { roll: number; chance: number; zone: number; win: boolean }
interface Skin { name: string; value: number }

/** Point on the ring for a share t of a full turn, 0 at the top, clockwise. */
const at = (t: number, r: number) => [CX + r * Math.sin(2 * Math.PI * t), CX - r * Math.cos(2 * Math.PI * t)] as const;
const arc = (t0: number, len: number, r: number) => {
  const [x1, y1] = at(t0, r);
  const [x2, y2] = at(t0 + Math.min(len, 0.9999), r);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${len > 0.5 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};

const ring = () => {
  let ticks = '';
  for (let i = 0; i < 100; i++) {
    const long = i % 10 === 0;
    const [x1, y1] = at(i / 100, long ? 141 : 144);
    const [x2, y2] = at(i / 100, long ? 153 : 149);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${long ? 'tk long' : 'tk'}"/>`;
    if (long) { const [lx, ly] = at(i / 100, 164); ticks += `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle" class="tl">${i}</text>`; }
  }
  return `<svg viewBox="0 0 340 340" class="upg-svg" id="ring" role="slider" tabindex="0" aria-label="Win zone position" aria-valuemin="0" aria-valuemax="99.99" aria-valuenow="0">
    <circle cx="${CX}" cy="${CX}" r="${R}" class="track"/>
    ${ticks}
    <path id="zone" class="zone" d=""/>
    <path id="zone-hit" class="zone-hit" d=""/>
    <g id="needle" class="needle"><line x1="${CX}" y1="${CX - 66}" x2="${CX}" y2="${CX - R + 16}"/><path d="M${CX} ${CX - R - 12}l-8 16h16z"/><circle cx="${CX}" cy="${CX - 66}" r="3.5"/></g>
    <text x="${CX}" y="${CX - 8}" text-anchor="middle" class="c-big" id="c-big">47.50 %</text>
    <text x="${CX}" y="${CX + 14}" text-anchor="middle" class="c-small" id="c-small">WIN CHANCE</text>
  </svg>`;
};

export const upgraderView: View = {
  title: 'Workbench',
  html: () => `
  <section class="game">
    <div class="game-stage">
      <div class="game-head">
        <div><p class="eyebrow">Original · Upgrader</p><h1 class="h-display">Workbench</h1>
          <p>Put in Frags, pick a target, then drag the green zone anywhere on the ring. The needle spins to your roll: inside the zone, you get the target. The zone is always exactly as large as your chance (stake ÷ target · 0.95), so where you put it never changes the odds.</p></div>
        <div class="big-mult" id="res"></div>
      </div>
      <div class="upg-bar">
        <div><span class="eyebrow">You put in</span><b class="num" id="in-val">10.00</b><span class="muted">Frags</span></div>
        <span class="arrow">${icon('upgrade')}</span>
        <div><span class="eyebrow">You get</span><b id="out-name">2.00× stake</b><span class="muted num" id="out-val">20.00 Frags</span></div>
      </div>
      <div class="upg-stage">${ring()}</div>
      <div class="upg-controls">
        <div class="seg" role="group" aria-label="Zone presets">
          <button type="button" data-preset="low">Low</button><button type="button" data-preset="mid">Middle</button><button type="button" data-preset="high">High</button><button type="button" data-preset="rand">Random</button>
        </div>
        <span class="spec">Zone <b id="zone-txt">0.00 % → 47.50 %</b></span>
      </div>
      <p class="status" id="status" role="status">Drag the green zone, or tap the ring where you want it.</p>
      <div class="chips" id="hist" aria-label="Recent upgrades"></div>
    </div>
    <aside class="game-side">
      ${stakeField('stake', 10)}
      <div class="seg" role="group" aria-label="Target"><button type="button" data-mode="mult" aria-pressed="true">Multiplier</button><button type="button" data-mode="skin" aria-pressed="false">Skin</button></div>
      <div id="mode-mult">
        <label class="field">Target multiplier<input id="target" inputmode="decimal" value="2.00"></label>
        <div class="row" style="margin-top:8px">${[1.5, 2, 3, 5, 10, 20].map((m) => `<button type="button" class="btn ghost small" data-mult="${m}">${m}×</button>`).join('')}</div>
      </div>
      <div id="mode-skin" hidden>
        <input class="input" id="skin-q" placeholder="Search skins" aria-label="Search skins">
        <ul class="skins" id="skins" role="listbox" aria-label="Target skin"></ul>
      </div>
      <button class="btn block" id="go" type="button">Upgrade</button>
      <div id="fair"></div>
      <p class="muted" style="font-size:12px">The roll f comes from your seed stream. Win if (f − zone start) mod 1 &lt; chance. Chance must be between 1 and 80 %.</p>
    </aside>
  </section>`,
  mount: (root, c) => {
    bindStake(root);
    let zone = 0; // start of the win zone, 0 … 9999
    let mode: 'mult' | 'skin' = 'mult';
    let skin: Skin | null = null;
    let spinning = false;
    let angle = 0; // needle rotation in degrees, keeps growing so every spin turns forward
    let shown: UpgradeResult | null = null; // last result, shown in the centre until the setup changes
    const hist: { win: boolean; m: number }[] = [];
    const skins: Skin[] = [...new Map(c.cfg.cases.flatMap((k) => k.items).map((i) => [`${i.name}|${i.value}`, { name: i.name, value: i.value }])).values()].sort((a, b) => a.value - b.value);
    const svg = $<SVGSVGElement>('#ring', root);
    const needle = $<SVGGElement>('#needle', root);
    const stakeIn = $<HTMLInputElement>('#stake', root);
    const targetIn = $<HTMLInputElement>('#target', root);
    const status = (t: string, cls = '') => { const s = $('#status', root); s.textContent = t; s.className = `status ${cls}`; };

    const stake = () => readNum(stakeIn.value);
    const multiplier = () => (mode === 'skin' ? (skin ? skin.value / stake() : NaN) : readNum(targetIn.value));
    const chanceOf = (m: number) => (m > 1 ? (1 - E) / m : NaN);
    const valid = (ch: number) => Number.isFinite(ch) && ch >= MIN_CHANCE && ch <= MAX_CHANCE;

    /** The player changed the setup: the last result no longer describes the ring. */
    const reset = () => { if (!shown) return; shown = null; svg.classList.remove('won', 'lost'); };
    const paint = () => {
      const m = multiplier();
      const ch = chanceOf(m);
      const ok = valid(ch) && stake() > 0;
      const len = ok ? ch : 0;
      const start = zone / STEPS;
      $('#zone', root).setAttribute('d', len ? arc(start, len, R) : '');
      $('#zone-hit', root).setAttribute('d', len ? arc(start, len, R) : '');
      if (shown && !spinning) {
        $('#c-big', root).textContent = shown.roll.toFixed(4);
        $('#c-small', root).textContent = shown.win ? 'IN THE ZONE' : 'OUTSIDE';
      } else if (!spinning) {
        $('#c-big', root).textContent = ok ? pct(ch) : '–';
        $('#c-small', root).textContent = ok ? 'WIN CHANCE' : 'CHANCE 1–80 %';
      }
      $('#zone-txt', root).textContent = ok ? `${pct(start)} → ${pct((start + ch) % 1)}` : '–';
      svg.setAttribute('aria-valuenow', (start * 100).toFixed(2));
      svg.setAttribute('aria-valuetext', ok ? `Zone from ${pct(start)} to ${pct((start + ch) % 1)}` : 'No valid target');
      $('#in-val', root).textContent = frags(stake() || 0);
      $('#out-name', root).textContent = mode === 'skin' ? (skin ? skin.name : 'Pick a skin') : Number.isFinite(m) ? `${mult(m)} stake` : '–';
      $('#out-val', root).textContent = Number.isFinite(m) && stake() > 0 ? `${frags(stake() * m)} Frags` : '–';
      const go = $<HTMLButtonElement>('#go', root);
      go.disabled = !ok || spinning;
      go.textContent = ok ? `Upgrade · ${pct(ch)}` : mode === 'skin' && !skin ? 'Pick a target skin' : 'Chance must be 1–80 %';
      paintSkins();
    };

    const paintSkins = () => {
      if (mode !== 'skin') return;
      const q = $<HTMLInputElement>('#skin-q', root).value.trim().toLowerCase();
      const s = stake();
      $('#skins', root).innerHTML = skins.filter((k) => !q || k.name.toLowerCase().includes(q)).map((k) => {
        const ch = s > 0 ? (s / k.value) * (1 - E) : NaN;
        const ok = valid(ch);
        const sel = skin && skin.name === k.name && skin.value === k.value;
        return `<li><button type="button" role="option" aria-selected="${Boolean(sel)}" data-skin="${esc(k.name)}|${k.value}" ${ok ? '' : 'disabled'}>
          <span>${esc(k.name)}</span><span class="num">${frags(k.value, 0)}</span><span class="num ${ok ? '' : 'muted'}">${ok ? pct(ch) : ch > MAX_CHANCE ? '&gt; 80 %' : '&lt; 1 %'}</span></button></li>`;
      }).join('') || '<li class="muted" style="padding:8px">No skin matches.</li>';
      $$<HTMLButtonElement>('[data-skin]', root).forEach((b) => b.addEventListener('click', () => {
        const [name, value] = b.dataset.skin!.split('|');
        skin = { name, value: Number(value) };
        reset();
        paint();
      }));
    };

    /* ---------- moving the zone ---------- */
    const setZone = (start: number) => { zone = ((Math.round(start * STEPS) % STEPS) + STEPS) % STEPS; reset(); paint(); };
    const pointerTurn = (e: PointerEvent) => {
      const box = svg.getBoundingClientRect();
      const x = ((e.clientX - box.left) / box.width) * 340 - CX;
      const y = ((e.clientY - box.top) / box.height) * 340 - CX;
      return { t: (Math.atan2(x, -y) / (2 * Math.PI) + 1) % 1, r: Math.hypot(x, y) };
    };
    let grab: number | null = null; // offset between the pointer and the zone start while dragging
    svg.addEventListener('pointerdown', (e) => {
      if (spinning) return;
      const ch = chanceOf(multiplier());
      if (!valid(ch)) return;
      const p = pointerTurn(e);
      if (p.r < 60) return; // the centre is not part of the ring
      const start = zone / STEPS;
      const inside = (p.t - start + 1) % 1 < ch;
      if (!inside) setZone(p.t - ch / 2); // jump: centre the zone where the ring was touched
      grab = (p.t - zone / STEPS + 1) % 1;
      svg.setPointerCapture(e.pointerId);
      svg.classList.add('dragging');
      e.preventDefault();
    });
    svg.addEventListener('pointermove', (e) => { if (grab !== null) setZone(pointerTurn(e).t - grab); });
    const drop = () => { grab = null; svg.classList.remove('dragging'); };
    svg.addEventListener('pointerup', drop);
    svg.addEventListener('pointercancel', drop);
    svg.addEventListener('keydown', (e) => {
      if (spinning) return;
      const step = e.shiftKey ? 0.1 : 0.01;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setZone(zone / STEPS + step); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setZone(zone / STEPS - step); e.preventDefault(); }
    });
    $$<HTMLButtonElement>('[data-preset]', root).forEach((b) => b.addEventListener('click', () => {
      if (spinning) return;
      const ch = chanceOf(multiplier());
      const len = valid(ch) ? ch : 0;
      const p = b.dataset.preset;
      setZone(p === 'low' ? 0 : p === 'high' ? 1 - len : p === 'mid' ? 0.5 - len / 2 : Math.random());
    }));

    /* ---------- target ---------- */
    $$<HTMLButtonElement>('[data-mode]', root).forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode as 'mult' | 'skin';
      $$('[data-mode]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('#mode-mult', root).hidden = mode !== 'mult';
      $('#mode-skin', root).hidden = mode !== 'skin';
      paint();
    }));
    $$<HTMLButtonElement>('[data-mult]', root).forEach((b) => b.addEventListener('click', () => { targetIn.value = Number(b.dataset.mult).toFixed(2); reset(); paint(); }));
    targetIn.addEventListener('input', () => { reset(); paint(); });
    stakeIn.addEventListener('input', () => { reset(); paint(); });
    $('#skin-q', root).addEventListener('input', paintSkins);
    paint();
    $('#fair', root).innerHTML = fairBox({ ...c.me.seed, nonce: c.me.seed.nextNonce });

    /* ---------- spin ---------- */
    $('#go', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      const m = multiplier();
      if (!valid(chanceOf(m))) return;
      reset();
      spinning = true;
      svg.classList.remove('won', 'lost');
      $('#res', root).textContent = '';
      paint();
      try {
        const bet = await api<Bet<UpgradeResult>>('POST', '/bets/upgrader', { stake: stake(), params: { multiplier: m, zone } });
        const { roll, win } = bet.result!;
        const target = roll * 360;
        angle = angle - (((angle % 360) + 360) % 360) + 360 * 5 + target; // five full turns, then onto the roll
        const dur = reducedMotion() ? 0 : SPIN_MS;
        needle.style.transition = `transform ${dur}ms cubic-bezier(.12,.72,.14,1)`;
        needle.style.transform = `rotate(${angle}deg)`;
        $('#c-big', root).textContent = '…';
        $('#c-small', root).textContent = 'SPINNING';
        await new Promise((r) => setTimeout(r, dur + 80));
        svg.classList.add(win ? 'won' : 'lost');
        shown = bet.result!;
        const res = $('#res', root);
        res.textContent = win ? `+${frags(bet.payout - bet.stake)}` : `−${frags(bet.stake)}`;
        res.className = `big-mult ${win ? 'win' : 'lose'}`;
        const what = mode === 'skin' && skin ? skin.name : `${mult(m)} stake`;
        status(win ? `Upgraded to ${what}: ${frags(bet.payout)} Frags.` : `The needle stopped at ${(roll * 100).toFixed(2)} %, outside your zone.`, win ? 'win' : 'lose');
        hist.unshift({ win, m });
        $('#hist', root).innerHTML = hist.slice(0, 16).map((h) => `<span class="chip ${h.win ? 'win' : 'lose'}">${h.win ? '✓' : '✗'} ${mult(h.m)}</span>`).join('');
        $('#fair', root).innerHTML = fairBox(bet.fairness);
        await c.refresh();
      } finally {
        spinning = false;
        paint();
      }
    }));
  },
};
