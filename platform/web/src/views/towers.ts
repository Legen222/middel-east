import { type Bet, api } from '../api';
import { icon } from '../icons';
import type { View } from '../main';
import { $, $$, bindStake, fairBox, frags, guard, mult, pctShort, readNum, stakeField } from '../ui';

const E = 0.03;
const ROOMS = 8;
const LEVELS = {
  green: { doors: 4, traps: 1, label: 'Green', color: '#5E8C7A' },
  blue: { doors: 3, traps: 1, label: 'Blue', color: '#4f7fa8' },
  red: { doors: 2, traps: 1, label: 'Red', color: '#B7471D' },
  black: { doors: 3, traps: 2, label: 'Black', color: '#2b2622' },
} as const;
type Level = keyof typeof LEVELS;
const safe = (l: Level) => (LEVELS[l].doors - LEVELS[l].traps) / LEVELS[l].doors;
const ladder = (l: Level, k: number) => (k === 0 ? 1 : (1 - E) / safe(l) ** k);
const x2 = (m: number) => `${m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;

interface TowersBet extends Bet<{ traps: number[][]; picks: number[]; trapAt?: number }> {
  level: Level; doors: number; rooms: number; picks?: number[]; currentMultiplier?: number; nextMultiplier?: number;
}

export const towersView: View = {
  title: 'Monument Run',
  html: () => `
  <section class="game">
    <div class="game-stage">
      <div class="game-head">
        <div><p class="eyebrow">Original</p><h1 class="h-display">Monument Run</h1>
          <p>Eight rooms, one door per room. Your keycard sets how many doors are trapped. Cash out after any room: stake × 0.97 ÷ p<sup>k</sup>, so 97 % RTP however far you go.</p></div>
        <div class="big-mult" id="mult">1.00×</div>
      </div>
      <div class="tower" id="tower"></div>
      <p class="status" id="status" role="status">Pick a keycard and your stake.</p>
    </div>
    <aside class="game-side">
      ${stakeField('stake', 10)}
      <div class="seg" role="group" aria-label="Keycard" id="levels">${(Object.keys(LEVELS) as Level[]).map((l) => `<button type="button" data-level="${l}" aria-pressed="${l === 'green'}">${LEVELS[l].label}</button>`).join('')}</div>
      <p class="muted" style="font-size:13px" id="lvl-info"></p>
      <button class="btn block" id="start" type="button">Enter the monument</button>
      <button class="btn win block" id="cash" type="button" hidden>Cash out</button>
      <div id="fair"></div>
      <p class="muted" style="font-size:12px">All traps are placed when the run starts (seed + nonce, a shuffle per room). They stay on the server until the run ends.</p>
    </aside>
  </section>`,
  mount: (root, c) => {
    bindStake(root);
    let level: Level = 'green';
    let bet: TowersBet | null = null;
    const status = (t: string, cls = '') => { const s = $('#status', root); s.textContent = t; s.className = `status ${cls}`; };

    const draw = () => {
      const open = bet?.status === 'open';
      const lv = bet?.level ?? level;
      const doors = LEVELS[lv].doors;
      const picks = open ? bet!.picks ?? [] : bet?.result?.picks ?? [];
      const traps = bet?.status === 'settled' ? bet.result?.traps ?? [] : [];
      const trapAt = bet?.result?.trapAt;
      $('#tower', root).innerHTML = Array.from({ length: ROOMS }, (_, room) => {
        const cur = open && room === picks.length;
        const cells = Array.from({ length: doors }, (_, d) => {
          const picked = picks[room] === d;
          const isTrap = traps[room]?.includes(d);
          const cls = picked ? (trapAt === room ? 'trap' : 'safe') : isTrap ? 'ghost' : '';
          const ico = picked ? icon(trapAt === room ? 'mine' : 'shield') : isTrap ? icon('mine') : '';
          return `<button type="button" class="door ${cls}" data-room="${room}" data-door="${d}" ${cur ? '' : 'disabled'} aria-label="Room ${room + 1}, door ${d + 1}">${ico}</button>`;
        }).join('');
        return `<div class="floor ${cur ? 'cur' : ''}"><span class="x">${x2(ladder(lv, room + 1))}</span><div class="doors" style="grid-template-columns:repeat(${doors},minmax(0,1fr))">${cells}</div></div>`;
      }).join('');
      $$<HTMLButtonElement>('.door', root).forEach((b) => b.addEventListener('click', () => void pick(b)));
      $$<HTMLButtonElement>('[data-level]', root).forEach((b) => { b.disabled = open; b.setAttribute('aria-pressed', String(b.dataset.level === lv)); });
      $('#lvl-info', root).textContent = `${LEVELS[lv].traps} of ${doors} doors trapped · ${pctShort(safe(lv))} per room · all 8 rooms: ${x2(ladder(lv, ROOMS))}`;
      $('#start', root).hidden = open;
      const cash = $<HTMLButtonElement>('#cash', root);
      cash.hidden = !open;
      cash.disabled = !open || picks.length === 0;
      if (open) cash.textContent = `Cash out · ${frags(bet!.stake * (bet!.currentMultiplier ?? 1))}`;
      const m = $('#mult', root);
      m.textContent = mult(open ? bet!.currentMultiplier ?? 1 : bet?.multiplier ?? 1);
      m.className = `big-mult ${bet?.status === 'settled' ? (bet.payout > 0 ? 'win' : 'lose') : ''}`;
      $('#fair', root).innerHTML = bet ? fairBox(bet.fairness) : fairBox({ ...c.me.seed, nonce: c.me.seed.nextNonce });
    };

    const pick = (b: HTMLButtonElement) => guard(b, async () => {
      if (!bet || bet.status !== 'open') return;
      bet = await api<TowersBet>('POST', `/towers/${bet.id}/pick`, { door: Number(b.dataset.door) });
      if (bet.status === 'settled') {
        status(bet.payout > 0 ? `Top of the monument: +${frags(bet.payout)} Frags.` : `Trap in room ${(bet.result!.trapAt ?? 0) + 1}. Run lost.`, bet.payout > 0 ? 'win' : 'lose');
        await c.refresh();
      } else status(`Room ${bet.picks!.length} cleared. Next room: ${mult(bet.nextMultiplier ?? 1)}`);
      draw();
    });

    $$<HTMLButtonElement>('[data-level]', root).forEach((b) => b.addEventListener('click', () => { level = b.dataset.level as Level; if (bet?.status !== 'open') { bet = null; draw(); } }));
    $('#start', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      bet = await api<TowersBet>('POST', '/towers/start', { stake: readNum($<HTMLInputElement>('#stake', root).value), level });
      status(`Room 1: ${mult(bet.nextMultiplier ?? 1)} if you pick a safe door.`);
      draw();
      await c.refresh();
    }));
    $('#cash', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      if (!bet) return;
      bet = await api<TowersBet>('POST', `/towers/${bet.id}/cashout`, {});
      status(`Cashed out: ${frags(bet.payout)} Frags.`, 'win');
      draw();
      await c.refresh();
    }));
    api<TowersBet[]>('GET', '/games/open').then((g) => {
      const r = g.find((x) => x.game === 'towers');
      if (r) { bet = r; level = r.level; status('Open run found. Pick a door or cash out.'); draw(); }
    }).catch(() => null);
    draw();
  },
};
