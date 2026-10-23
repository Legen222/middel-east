import { api } from '../api';
import { icon } from '../icons';
import type { View } from '../main';
import { $, $$, bindStake, esc, frags, guard, readNum, scrap, stakeField } from '../ui';

interface Player { seat: number; name: string; bot: boolean; you: boolean; payout: number }
interface Game {
  id: string; type: 'coinflip'; status: 'open' | 'locked' | 'settled' | 'cancelled'; params: any; seats: number; seatStake: number;
  players: Player[]; mine: boolean; result: any; createdAt: number;
  fairness: { serverSeedHash: string; serverSeed: string | null; beacon: { name: string; trustless: boolean; round: number | null; resolvesAt: number | null; value: string | null } };
}

const STATUS: Record<Game['status'], string> = { open: 'open', locked: 'waiting for beacon', settled: 'settled', cancelled: 'cancelled' };

function fairness(g: Game) {
  const b = g.fairness.beacon;
  return `<details style="font-size:12px"><summary class="muted" style="cursor:pointer">Fairness</summary><dl class="fairbox" style="margin-top:6px">
    <dt>Seed hash</dt><dd>${esc(g.fairness.serverSeedHash)}</dd>
    ${g.fairness.serverSeed ? `<dt>Server seed</dt><dd>${esc(g.fairness.serverSeed)}</dd>` : ''}
    <dt>Beacon</dt><dd>${esc(b.name)}${b.trustless ? '' : ' <span class="neg">(demo, not trustless)</span>'}${b.round ? ` · round ${b.round}` : ''}</dd>
    ${b.value ? `<dt>Client seed</dt><dd>${esc(b.value)}</dd>` : ''}<dt>Nonce</dt><dd>0</dd></dl></details>`;
}

function actions(g: Game) {
  if (g.status !== 'open') return '';
  const inGame = g.players.some((p) => p.you);
  return `<div class="row">${!inGame ? `<button class="btn small" data-join="${g.id}" type="button">Join · ${scrap(g.seatStake)}</button>` : ''}
    ${g.mine ? `<button class="btn ghost small" data-bot="${g.id}" type="button">Call demo bot</button><button class="btn ghost small" data-cancel="${g.id}" type="button">Cancel</button>` : ''}</div>`;
}

function countdown(g: Game) {
  if (g.status !== 'locked' || !g.fairness.beacon.resolvesAt) return '';
  const s = Math.max(0, Math.ceil((g.fairness.beacon.resolvesAt - Date.now()) / 1000));
  return `<span class="chip">Beacon in ${s} s</span>`;
}

/* ---------- coinflip ---------- */
function coinCard(g: Game) {
  const side = g.params.side as 'rust' | 'scrap';
  const other = side === 'rust' ? 'scrap' : 'rust';
  const label = (s: string) => (s === 'rust' ? 'Rust' : 'Scrap');
  const res = g.result as { side: string; winnerSeat: number } | null;
  return `<article class="card" data-game="${g.id}" style="gap:10px">
    <div class="row" style="justify-content:space-between"><b class="h-sect">${scrap(g.seatStake)}</b><span class="chip">${STATUS[g.status]}</span>${countdown(g)}</div>
    <div class="row" style="justify-content:space-between;gap:12px">
      ${[0, 1].map((seat) => { const p = g.players.find((x) => x.seat === seat); const s = seat === 0 ? side : other;
        const won = res && res.winnerSeat === seat;
        return `<div style="flex:1;min-width:120px;border:1px solid ${won ? 'var(--patina)' : 'var(--line)'};border-radius:3px;padding:10px;background:var(--surface-2)">
          <p class="eyebrow" style="color:${s === 'rust' ? 'var(--rust)' : 'var(--muted)'}">${label(s)}</p><p>${p ? esc(p.name) + (p.you ? ' (you)' : '') : '<span class="muted">open seat</span>'}</p>
          ${res ? `<p class="num ${won ? 'pos' : 'neg'}">${won ? '+' + frags(p!.payout) : '0.00'}</p>` : ''}</div>`; }).join('')}
    </div>
    ${res ? `<p class="status ${res.side === side ? '' : ''}">Coin: <b>${label(res.side)}</b></p>` : ''}
    ${actions(g)}${fairness(g)}
  </article>`;
}

export const coinflipView: View = {
    title: 'Coinflip',
    html: () => `
    <section class="card" style="gap:14px">
      <p class="eyebrow">PvP · Beacon randomness</p>
      <h1 class="h-display">Coinflip</h1>
      <p class="muted" style="max-width:66ch">Two players, equal stakes, one coin. The winner takes the pot minus 4 %. The result is only fixed once both are seated and the beacon round after next is published.</p>
      <div class="row" style="align-items:flex-end">
        <div style="min-width:220px;flex:1">${stakeField('stake', 50)}</div>
        <div class="seg" role="group" aria-label="Side" style="min-width:200px"><button type="button" data-side="rust" aria-pressed="true">Rust</button><button type="button" data-side="scrap" aria-pressed="false">Scrap</button></div>
        <button class="btn" id="create" type="button">${icon('coin')} Create</button>
      </div>
    </section>
    <section id="games" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:12px"></section>`,
    mount: (root, c) => {
      bindStake(root);
      let side: 'rust' | 'scrap' = 'rust';
      $$<HTMLButtonElement>('[data-side]', root).forEach((b) => b.addEventListener('click', () => {
        side = b.dataset.side as 'rust' | 'scrap'; $$('[data-side]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      }));
      let games: Game[] = [];
      const paint = () => {
        const box = $('#games', root);
        box.innerHTML = games.length ? games.map(coinCard).join('') : '<p class="muted">No games yet. Create one and call a demo bot as your opponent.</p>';
        const act = (sel: string, path: (id: string) => string) => $$<HTMLButtonElement>(sel, box).forEach((b) => b.addEventListener('click', () => guard(b, async () => {
          await api('POST', path(b.getAttribute(sel.slice(1, -1))!)); await load(); await c.refresh();
        })));
        act('[data-join]', (id) => `/pvp/${id}/join`);
        act('[data-bot]', (id) => `/pvp/${id}/bot`);
        act('[data-cancel]', (id) => `/pvp/${id}/cancel`);
      };
      const load = async () => {
        const before = new Map(games.map((g) => [g.id, g.status]));
        games = await api<Game[]>('GET', '/pvp/list/coinflip');
        paint();
        if (games.some((g) => g.status === 'settled' && before.get(g.id) === 'locked' && g.players.some((p) => p.you))) await c.refresh();
      };
      $('#create', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
        await api('POST', '/pvp/coinflip', { stake: readNum($<HTMLInputElement>('#stake', root).value), side });
        await load(); await c.refresh();
      }));
      void load();
      const t = setInterval(() => void load(), 1500);
      return () => clearInterval(t);
    },
};
