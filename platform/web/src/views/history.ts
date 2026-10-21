import { api } from '../api';
import { GAMES, gameName } from '../games';
import { icon } from '../icons';
import type { View } from '../main';
import { $, errorText, esc, frags, guard, modal, mult, toast } from '../ui';
import { type BetDetail, prefillFor, verifyHref } from './verify';

interface Row { game: string; gameName: string; ref: string; stake: number; payout: number; multiplier: number; settled: boolean; createdAt: number; settledAt: number | null }
interface Page { bets: Row[]; next: string | null }
interface Check { name: string; ok: boolean; detail?: string }
type Detail = BetDetail & { gameName: string; payout: number; multiplier: number; createdAt: number; verification: { status: 'verified' | 'mismatch' | 'pending'; reason?: string; checks: Check[] } };

/* the server's game ids, in the order of the game bar */
const FILTERS = [...new Map(GAMES.map((g) => [g.id, g.name])).entries()];
const when = (t: number) => new Date(t).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' });

const row = (b: Row) => `<tr class="click" tabindex="0" data-game="${esc(b.game)}" data-ref="${esc(b.ref)}">
  <td class="num" style="font-size:12px;white-space:nowrap">${when(b.createdAt)}</td>
  <td>${esc(gameName(b.game))}${b.settled ? '' : ' <span class="chip">open</span>'}</td>
  <td class="r num">${frags(b.stake)}</td>
  <td class="r num">${b.settled ? mult(b.multiplier) : '–'}</td>
  <td class="r num ${b.settled ? (b.payout > b.stake ? 'pos' : 'neg') : ''}">${frags(b.payout)}</td>
  <td class="r"><span class="muted" aria-hidden="true">›</span></td>
</tr>`;

function fairnessHtml(d: Detail) {
  const f = d.fairness ?? {};
  const rows: [string, string][] = [];
  if (f.serverSeedHash) rows.push(['Server seed hash', f.serverSeedHash]);
  if ('serverSeed' in f) rows.push(['Server seed', f.serverSeed ?? '— shown after you rotate your seed (Provably fair page)']);
  if (f.seed) rows.push(['Round seed', f.seed]);
  if (f.clientSeed) rows.push(['Client seed', f.clientSeed]);
  if (f.nonce !== undefined) rows.push(['Nonce', String(f.nonce)]);
  if (f.beaconRound) rows.push(['Beacon round', String(f.beaconRound)]);
  if (f.beaconValue) rows.push(['Beacon value', f.beaconValue]);
  if (f.chainIndex !== undefined) rows.push(['Chain index', String(f.chainIndex)]);
  return `<dl class="fairbox">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

async function openDetail(game: string, ref: string) {
  const d = await api<Detail>('GET', `/history/${encodeURIComponent(game)}/${encodeURIComponent(ref)}`);
  const v = d.verification;
  const badge = v.status === 'verified' ? '<span class="chip win">✓ verified by replay</span>' : v.status === 'pending' ? `<span class="chip">${esc(v.reason ?? 'pending')}</span>` : '<span class="chip lose">✗ mismatch</span>';
  const m = modal(`<div class="detail">
    <div class="sect-head"><div><p class="eyebrow">${esc(d.gameName)} · ${when(d.createdAt)}</p><h2 class="h-sect" style="font-size:20px">Round ${esc(String(d.ref).slice(0, 12))}</h2></div>${badge}</div>
    <div class="detail-figs"><div><span>Stake</span><b class="num">${frags(d.stake)}</b></div><div><span>Multiplier</span><b class="num">${mult(d.multiplier)}</b></div><div><span>Payout</span><b class="num ${d.payout > d.stake ? 'pos' : ''}">${frags(d.payout)}</b></div></div>
    ${v.checks.length ? `<ul class="vchecks">${v.checks.map((c) => `<li class="${c.ok ? 'ok' : 'bad'}"><b>${c.ok ? '✓' : '✗'} ${esc(c.name)}</b><span>${esc(c.detail ?? '')}</span></li>`).join('')}</ul>` : ''}
    ${fairnessHtml(d)}
    <div class="row"><button class="btn" type="button" data-verify>${icon('shield')} Verify in browser</button><button class="btn ghost" type="button" data-close>Close</button></div>
    <p class="muted" style="font-size:12px">“Verified by replay” is the server's own recomputation. “Verify in browser” runs the engine here, on your device, from the seeds above.</p>
  </div>`);
  m.root.querySelector('[data-close]')?.addEventListener('click', m.close);
  const vb = m.root.querySelector<HTMLButtonElement>('[data-verify]')!;
  vb.addEventListener('click', () => guard(vb, async () => {
    const p = await prefillFor(d);
    if (!p) { vb.textContent = 'Nothing to replay yet'; vb.disabled = true; return; }
    m.close();
    location.hash = verifyHref(p);
  }));
}

export const historyView: View = {
  title: 'History',
  html: () => `
  <section class="card">
    <div class="sect-head"><div><p class="eyebrow">Account</p><h1 class="h-display">History</h1>
      <p class="muted">Every round you played, in every game. Open one for its seeds, the server's replay and a one-click check in your browser.</p></div>
      <label class="field" style="min-width:200px">Game<select id="h-game"><option value="">All games</option>${FILTERS.map(([id, name]) => `<option value="${id}">${esc(name)}</option>`).join('')}</select></label></div>
    <div class="tablewrap"><table class="rows"><thead><tr><th>Time</th><th>Game</th><th class="r">Stake</th><th class="r">Multi</th><th class="r">Payout</th><th></th></tr></thead><tbody id="rows"><tr><td colspan="6" class="muted">Loading …</td></tr></tbody></table></div>
    <div class="row"><button class="btn ghost" type="button" id="more" hidden>Load more</button><span class="muted" id="h-count" style="font-size:13px"></span></div>
  </section>`,
  mount: (root) => {
    let next: string | null = null;
    let shown = 0;
    const body = $('#rows', root);
    const load = async (reset: boolean) => {
      const game = ($('#h-game', root) as HTMLSelectElement).value;
      const q = new URLSearchParams({ limit: '50' });
      if (game) q.set('game', game);
      if (!reset && next) q.set('cursor', next);
      const page = await api<Page>('GET', `/history?${q}`);
      if (reset) { body.innerHTML = ''; shown = 0; }
      body.insertAdjacentHTML('beforeend', page.bets.map(row).join(''));
      shown += page.bets.length;
      if (!shown) body.innerHTML = '<tr><td colspan="6" class="muted">No rounds yet.</td></tr>';
      next = page.next;
      $('#more', root).hidden = !next;
      $('#h-count', root).textContent = shown ? `${shown} round${shown === 1 ? '' : 's'} shown` : '';
    };
    void load(true).catch((e) => toast(errorText(e), 'err'));
    $('#h-game', root).addEventListener('change', () => void load(true).catch(() => null));
    $('#more', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, () => load(false)));
    const open = (tr: HTMLElement | null) => { if (tr?.dataset.ref) void openDetail(tr.dataset.game!, tr.dataset.ref).catch((e) => toast(errorText(e), 'err')); };
    body.addEventListener('click', (e) => open((e.target as HTMLElement).closest('tr')));
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open((e.target as HTMLElement).closest('tr')); } });
  },
};
