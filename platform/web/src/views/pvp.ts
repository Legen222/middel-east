import { api } from '../api';
import { icon } from '../icons';
import type { View } from '../main';
import { $, $$, bindStake, esc, frags, guard, readNum, stakeField } from '../ui';

interface Player { seat: number; name: string; bot: boolean; you: boolean; payout: number }
interface Game {
  id: string; type: 'coinflip' | 'battle'; status: 'open' | 'locked' | 'settled' | 'cancelled'; params: any; seats: number; seatStake: number;
  players: Player[]; mine: boolean; result: any; createdAt: number;
  fairness: { serverSeedHash: string; serverSeed: string | null; beacon: { name: string; trustless: boolean; round: number | null; resolvesAt: number | null; value: string | null } };
}

const STATUS: Record<Game['status'], string> = { open: 'offen', locked: 'wartet auf Beacon', settled: 'entschieden', cancelled: 'abgebrochen' };

function fairness(g: Game) {
  const b = g.fairness.beacon;
  return `<details style="font-size:12px"><summary class="muted" style="cursor:pointer">Fairness</summary><dl class="fairbox" style="margin-top:6px">
    <dt>Seed-Hash</dt><dd>${esc(g.fairness.serverSeedHash)}</dd>
    ${g.fairness.serverSeed ? `<dt>Server-Seed</dt><dd>${esc(g.fairness.serverSeed)}</dd>` : ''}
    <dt>Beacon</dt><dd>${esc(b.name)}${b.trustless ? '' : ' <span class="neg">(Demo, nicht vertrauenslos)</span>'}${b.round ? ` · Runde ${b.round}` : ''}</dd>
    ${b.value ? `<dt>Client-Seed</dt><dd>${esc(b.value)}</dd>` : ''}<dt>Nonce</dt><dd>0</dd></dl></details>`;
}

function actions(g: Game) {
  if (g.status !== 'open') return '';
  const inGame = g.players.some((p) => p.you);
  return `<div class="row">${!inGame ? `<button class="btn small" data-join="${g.id}" type="button">Beitreten · ${frags(g.seatStake)}</button>` : ''}
    ${g.mine ? `<button class="btn ghost small" data-bot="${g.id}" type="button">Demo-Bot holen</button><button class="btn ghost small" data-cancel="${g.id}" type="button">Abbrechen</button>` : ''}</div>`;
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
    <div class="row" style="justify-content:space-between"><b class="h-sect">${frags(g.seatStake)} Frags</b><span class="chip">${STATUS[g.status]}</span>${countdown(g)}</div>
    <div class="row" style="justify-content:space-between;gap:12px">
      ${[0, 1].map((seat) => { const p = g.players.find((x) => x.seat === seat); const s = seat === 0 ? side : other;
        const won = res && res.winnerSeat === seat;
        return `<div style="flex:1;min-width:120px;border:1px solid ${won ? 'var(--patina)' : 'var(--line)'};border-radius:3px;padding:10px;background:var(--surface-2)">
          <p class="eyebrow" style="color:${s === 'rust' ? 'var(--rust)' : 'var(--muted)'}">${label(s)}</p><p>${p ? esc(p.name) + (p.you ? ' (du)' : '') : '<span class="muted">frei</span>'}</p>
          ${res ? `<p class="num ${won ? 'pos' : 'neg'}">${won ? '+' + frags(p!.payout) : '0,00'}</p>` : ''}</div>`; }).join('')}
    </div>
    ${res ? `<p class="status ${res.side === side ? '' : ''}">Münze: <b>${label(res.side)}</b></p>` : ''}
    ${actions(g)}${fairness(g)}
  </article>`;
}

/* ---------- battle ---------- */
function battleCard(g: Game, casesById: Map<string, { name: string; price: number }>) {
  const res = g.result as { drops: { name: string; value: number }[][]; totals: number[]; winners: number[] } | null;
  return `<article class="card" data-game="${g.id}" style="gap:10px">
    <div class="row" style="justify-content:space-between"><b class="h-sect">${g.seats} Plätze · ${esc(g.params.mode)}</b><span class="chip">${STATUS[g.status]}</span>${countdown(g)}</div>
    <p class="muted" style="font-size:13px">${(g.params.caseIds as string[]).map((id) => esc(casesById.get(id)?.name ?? id)).join(' · ')} · ${frags(g.seatStake)} Frags pro Platz</p>
    <div style="display:grid;grid-template-columns:repeat(${g.seats},minmax(0,1fr));gap:6px">
      ${Array.from({ length: g.seats }, (_, seat) => { const p = g.players.find((x) => x.seat === seat); const won = res?.winners.includes(seat);
        return `<div style="border:1px solid ${won ? 'var(--patina)' : 'var(--line)'};border-radius:3px;padding:8px;background:var(--surface-2);min-width:0">
          <p style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p ? esc(p.name) + (p.you ? ' (du)' : '') : '<span class="muted">frei</span>'}</p>
          ${res ? res.drops.map((r) => `<p class="num" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r[seat].name)} · ${frags(r[seat].value, 0)}</p>`).join('') + `<p class="num ${won ? 'pos' : ''}" style="margin-top:4px">Σ ${frags(res.totals[seat], 0)}${won ? ` → ${frags(p!.payout, 0)}` : ''}</p>` : ''}
        </div>`; }).join('')}
    </div>
    ${actions(g)}${fairness(g)}
  </article>`;
}

function pvpView(type: 'coinflip' | 'battle'): View {
  return {
    title: type === 'coinflip' ? 'Münzwurf' : 'Kisten-Battle',
    html: (c) => `
    <section class="card" style="gap:14px">
      <p class="eyebrow">PvP · Beacon-Zufall</p>
      <h1 class="h-display">${type === 'coinflip' ? 'Münzwurf' : 'Kisten-Battle'}</h1>
      <p class="muted" style="max-width:66ch">${type === 'coinflip'
        ? 'Zwei Spieler, gleicher Einsatz, eine Münze. Der Gewinner bekommt den Pot minus 4 %. Das Ergebnis steht erst fest, wenn beide sitzen und die übernächste Beacon-Runde erscheint.'
        : 'Alle öffnen dieselben Kisten. Normal: höchste Summe gewinnt alles. Crazy: niedrigste Summe gewinnt. Terminal: der beste Drop der letzten Kiste entscheidet. Gleichstand wird geteilt.'}</p>
      <div class="row" style="align-items:flex-end">
        ${type === 'coinflip'
          ? `<div style="min-width:220px;flex:1">${stakeField('stake', 50)}</div>
             <div class="seg" role="group" aria-label="Seite" style="min-width:200px"><button type="button" data-side="rust" aria-pressed="true">Rust</button><button type="button" data-side="scrap" aria-pressed="false">Scrap</button></div>`
          : `<fieldset style="border:1px solid var(--line);border-radius:3px;padding:8px 10px;flex:2;min-width:240px"><legend class="muted" style="font-size:13px">Kisten</legend>
               ${c.cfg.cases.filter((k) => k.price <= 1000).map((k) => `<label class="check" style="font-size:13px"><input type="checkbox" data-case="${k.id}" ${k.id === 'werkzeugkiste' ? 'checked' : ''}> ${esc(k.name)} · ${frags(k.price, 0)}</label>`).join('')}</fieldset>
             <label class="field">Plätze<select id="seats"><option>2</option><option>3</option><option>4</option></select></label>
             <label class="field">Modus<select id="mode"><option value="normal">Normal</option><option value="crazy">Crazy</option><option value="terminal">Terminal</option></select></label>`}
        <button class="btn" id="create" type="button">${icon(type === 'coinflip' ? 'coin' : 'battle')} Erstellen</button>
      </div>
    </section>
    <section id="games" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(${type === 'coinflip' ? 300 : 360}px,1fr));gap:12px"></section>`,
    mount: (root, c) => {
      bindStake(root);
      let side: 'rust' | 'scrap' = 'rust';
      const casesById = new Map(c.cfg.cases.map((k) => [k.id, k]));
      $$<HTMLButtonElement>('[data-side]', root).forEach((b) => b.addEventListener('click', () => {
        side = b.dataset.side as 'rust' | 'scrap'; $$('[data-side]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      }));
      let games: Game[] = [];
      const paint = () => {
        const box = $('#games', root);
        box.innerHTML = games.length ? games.map((g) => (type === 'coinflip' ? coinCard(g) : battleCard(g, casesById))).join('') : '<p class="muted">Noch keine Spiele. Erstell eins und hol dir einen Demo-Bot als Gegner.</p>';
        const act = (sel: string, path: (id: string) => string) => $$<HTMLButtonElement>(sel, box).forEach((b) => b.addEventListener('click', () => guard(b, async () => {
          await api('POST', path(b.getAttribute(sel.slice(1, -1))!)); await load(); await c.refresh();
        })));
        act('[data-join]', (id) => `/pvp/${id}/join`);
        act('[data-bot]', (id) => `/pvp/${id}/bot`);
        act('[data-cancel]', (id) => `/pvp/${id}/cancel`);
      };
      const load = async () => {
        const before = new Map(games.map((g) => [g.id, g.status]));
        games = await api<Game[]>('GET', `/pvp/list/${type}`);
        paint();
        if (games.some((g) => g.status === 'settled' && before.get(g.id) === 'locked' && g.players.some((p) => p.you))) await c.refresh();
      };
      $('#create', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
        if (type === 'coinflip') await api('POST', '/pvp/coinflip', { stake: readNum($<HTMLInputElement>('#stake', root).value), side });
        else {
          const caseIds = $$<HTMLInputElement>('[data-case]', root).filter((x) => x.checked).map((x) => x.dataset.case!);
          await api('POST', '/pvp/battle', { caseIds, seats: Number(($('#seats', root) as HTMLSelectElement).value), mode: ($('#mode', root) as HTMLSelectElement).value });
        }
        await load(); await c.refresh();
      }));
      void load();
      const t = setInterval(() => void load(), 1500);
      return () => clearInterval(t);
    },
  };
}

export const coinflipView = pvpView('coinflip');
export const battleView = pvpView('battle');
