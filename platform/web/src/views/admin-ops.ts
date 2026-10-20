/**
 * Backoffice tabs for running the site: settings and seed chains, per-game limits, the case manager,
 * promo codes, the bet explorer with server-side verification, and daily reports.
 */
import { api } from '../api';
import { $, $$, esc, frags, guard, modal, pct, readNum, toast } from '../ui';
import { kpi, signed, when } from './admin-shared';

const num = (v: string) => (v.trim() === '' ? null : readNum(v));

/* ---------- settings + seed chains ---------- */

export async function settingsTab(panel: HTMLElement) {
  const [s, chains] = await Promise.all([api<any>('GET', '/admin/settings'), api<any>('GET', '/admin/chains')]);
  const chainCard = (game: 'crash' | 'wheel', name: string) => {
    const list = chains[game] as any[];
    const active = list.find((x) => x.active);
    return `<div class="card" style="background:var(--bg)">
      <div class="row" style="justify-content:space-between"><h3 class="h-sect" style="font-size:15px">${name}</h3><button class="btn ghost small" type="button" data-rotate="${game}">Publish new chain</button></div>
      ${active ? `<dl class="fairbox"><dt>Active terminal hash</dt><dd>${esc(active.terminalHash)}</dd><dt>Used</dt><dd>${frags(active.played, 0)} of ${frags(active.length, 0)} rounds</dd>
        <dt>Beacon</dt><dd>${esc(active.beacon.name)} round ${active.beacon.round}${active.beacon.value ? '' : ' (pending)'}</dd></dl>` : '<p class="muted">No chain yet. The first round creates one.</p>'}
      ${list.filter((x) => !x.active).length ? `<details><summary class="muted" style="font-size:13px">Retired chains (${list.filter((x) => !x.active).length})</summary>
        <div class="tablewrap"><table><tbody>${list.filter((x) => !x.active).map((x) => `<tr><td class="num" style="font-size:11px">${when(x.createdAt)}</td><td class="num">${x.played} rounds</td><td class="num" style="font-size:11px;word-break:break-all">${x.tip ? `tip ${esc(x.tip)}` : 'tip published when its last round ends'}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
    </div>`;
  };
  panel.innerHTML = `
  <div class="admin-grid">
    <section class="card">
      <h2 class="h-sect">Site settings</h2>
      <form id="site" style="display:flex;flex-direction:column;gap:12px">
        <label class="field">Announcement banner (empty = none)<input name="text" maxlength="280" value="${esc(s.announcement?.text ?? '')}" placeholder="e.g. Wipe day! Double Oil Rain until midnight UTC"></label>
        <label class="field">Tone<select name="tone"><option value="info" ${s.announcement?.tone !== 'warn' ? 'selected' : ''}>Info</option><option value="warn" ${s.announcement?.tone === 'warn' ? 'selected' : ''}>Warning</option></select></label>
        <label class="check"><input type="checkbox" name="maintenance" ${s.maintenance ? 'checked' : ''}> <span><b>Maintenance</b>: pause every game at once. Open rounds can still be cashed out.</span></label>
        <label class="check"><input type="checkbox" name="registrationOpen" ${s.registrationOpen ? 'checked' : ''}> <span>New sign-ups allowed</span></label>
        <label class="check"><input type="checkbox" name="rainEnabled" ${s.rainEnabled ? 'checked' : ''}> <span>Oil Rain opens new rounds</span></label>
        <label class="field">Chat slow mode (seconds between messages)<input name="slow" type="number" min="1" max="60" value="${s.chatSlowModeSeconds}"></label>
        <button class="btn" type="submit">Save settings</button>
      </form>
      <p class="muted" style="font-size:12px">Changes reach every open browser within a second and are audited.</p>
    </section>
    <section class="card">
      <h2 class="h-sect">Seed chains</h2>
      <p class="muted" style="font-size:13px">Live games draw from a published hash chain. Publishing a new chain lets the running round finish on the old one; the next round starts on the new chain. A used-up chain is replaced automatically. A retired chain's tip is published once its last round is over, so anyone can rebuild it.</p>
      ${chainCard('crash', 'Scrap Press')}
      ${chainCard('wheel', 'Bandit Wheel')}
    </section>
  </div>`;
  const form = $<HTMLFormElement>('#site', panel);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const text = String(f.get('text') ?? '').trim();
    const maintenance = f.get('maintenance') === 'on';
    const go = () => guard($<HTMLButtonElement>('button[type="submit"]', form), async () => {
      await api('PUT', '/admin/settings', {
        announcement: text ? { text, tone: f.get('tone') === 'warn' ? 'warn' : 'info' } : null,
        maintenance, registrationOpen: f.get('registrationOpen') === 'on', rainEnabled: f.get('rainEnabled') === 'on', chatSlowModeSeconds: Number(f.get('slow')),
      });
      toast('Settings saved.');
      await settingsTab(panel);
    });
    if (maintenance && !s.maintenance) {
      const m = modal(`<h2 class="h-sect">Pause every game?</h2><p>Players cannot start new rounds until maintenance ends. Running rounds can still be cashed out.</p>
        <div class="row"><button class="btn" data-ok type="button">Start maintenance</button><button class="btn ghost" data-no type="button">Cancel</button></div>`);
      m.root.querySelector('[data-no]')!.addEventListener('click', m.close);
      m.root.querySelector('[data-ok]')!.addEventListener('click', () => { m.close(); void go(); });
    } else void go();
  });
  $$<HTMLButtonElement>('[data-rotate]', panel).forEach((b) => b.addEventListener('click', () => {
    const m = modal(`<h2 class="h-sect">Publish a new ${b.dataset.rotate === 'crash' ? 'Scrap Press' : 'Bandit Wheel'} chain?</h2><p>The new terminal hash is public right away; its client seed is the beacon round two rounds from now.</p>
      <div class="row"><button class="btn" data-ok type="button">Publish</button><button class="btn ghost" data-no type="button">Cancel</button></div>`);
    m.root.querySelector('[data-no]')!.addEventListener('click', m.close);
    m.root.querySelector('[data-ok]')!.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      await api('POST', `/admin/chains/${b.dataset.rotate}/rotate`, {});
      m.close(); toast('New chain published.'); await settingsTab(panel);
    }));
  }));
}

/* ---------- per-game limits (inside the Games tab) ---------- */

export function limitsSection(list: any[], global: { minStake: number; maxStake: number; maxWin: number }) {
  return `
  <section class="card">
    <h2 class="h-sect">Stake and win limits per game</h2>
    <p class="muted" style="font-size:13px;max-width:80ch">Empty means the global limit (${frags(global.minStake)} to ${frags(global.maxStake, 0)} Frags stake, ${frags(global.maxWin, 0)} Frags max win). A game's limits can only be tighter than the global ones.</p>
    <div class="tablewrap"><table><thead><tr><th>Game</th><th>Min stake</th><th>Max stake</th><th>Max win</th><th></th></tr></thead><tbody>
      ${list.map((g) => `<tr><td><b>${esc(g.name)}</b></td>
        ${(['minStake', 'maxStake', 'maxWin'] as const).map((k) => `<td><input class="input num" style="max-width:130px" data-lim="${g.game}" data-k="${k}" inputmode="decimal" value="${g.limits[k] ?? ''}" placeholder="${frags(global[k], 0)}" aria-label="${esc(g.name)} ${k}"></td>`).join('')}
        <td><button class="btn ghost small" type="button" data-savelim="${g.game}">Save</button></td></tr>`).join('')}
    </tbody></table></div>
  </section>`;
}
export function bindLimits(panel: HTMLElement, reload: () => Promise<void>) {
  $$<HTMLButtonElement>('[data-savelim]', panel).forEach((b) => b.addEventListener('click', () => guard(b, async () => {
    const v = (k: string) => num($<HTMLInputElement>(`[data-lim="${b.dataset.savelim}"][data-k="${k}"]`, panel).value);
    await api('PUT', `/admin/games/${b.dataset.savelim}/limits`, { minStake: v('minStake'), maxStake: v('maxStake'), maxWin: v('maxWin') });
    toast('Limits saved.');
    await reload();
  })));
}

/* ---------- case manager ---------- */

interface Item { name: string; value: number; weight: number }

export async function casesTab(panel: HTMLElement) {
  const list = await api<any[]>('GET', '/admin/cases');
  panel.innerHTML = `
  <section class="card">
    <div class="row" style="justify-content:space-between"><h2 class="h-sect">Cases</h2><button class="btn small" type="button" data-new>New case</button></div>
    <p class="muted" style="font-size:13px;max-width:80ch">Every edit publishes a new version; openings and battles keep the version they used, so old rounds stay verifiable. The price is always ⌈EV ÷ (1 − 7 %)⌉, never typed in. New cases start disabled.</p>
    <div class="tablewrap"><table><thead><tr><th>Case</th><th class="r">Version</th><th class="r">Price</th><th class="r">RTP</th><th class="r">Items</th><th class="r">Opened</th><th>Live</th><th class="r">Order</th><th></th></tr></thead><tbody>
      ${list.map((k) => `<tr><td><b>${esc(k.name)}</b><br><span class="muted num" style="font-size:11px">${esc(k.id)}</span></td><td class="r num">v${k.version}</td><td class="r num">${frags(k.price, 0)}</td><td class="r num">${pct(k.rtp)}</td>
        <td class="r num">${k.items.length}</td><td class="r num">${frags(k.opened, 0)}</td>
        <td><label class="check"><input type="checkbox" data-live="${esc(k.id)}" ${k.enabled ? 'checked' : ''} aria-label="${esc(k.name)} live"></label></td>
        <td class="r"><input class="input num" style="max-width:70px" data-sort="${esc(k.id)}" value="${k.sort}" inputmode="numeric" aria-label="${esc(k.name)} order"></td>
        <td><button class="btn ghost small" type="button" data-edit="${esc(k.id)}">Edit</button></td></tr>`).join('')}
    </tbody></table></div>
  </section>
  <div id="editor"></div>`;
  $$<HTMLInputElement>('[data-live]', panel).forEach((x) => x.addEventListener('change', () => guard(null, async () => {
    await api('PUT', `/admin/cases/${x.dataset.live}/state`, { enabled: x.checked });
    toast(x.checked ? 'Case is live.' : 'Case hidden.');
  })));
  $$<HTMLInputElement>('[data-sort]', panel).forEach((x) => x.addEventListener('change', () => guard(null, async () => {
    await api('PUT', `/admin/cases/${x.dataset.sort}/state`, { sort: Number(x.value) });
    await casesTab(panel);
  })));
  $('[data-new]', panel).addEventListener('click', () => editor(panel, null));
  $$<HTMLButtonElement>('[data-edit]', panel).forEach((b) => b.addEventListener('click', () => editor(panel, list.find((k) => k.id === b.dataset.edit))));
}

function editor(panel: HTMLElement, k: any | null) {
  const box = $('#editor', panel);
  let items: Item[] = k ? k.items.map((i: any, n: number) => ({ name: i.name, value: i.value, weight: k.weights[n] })) : [{ name: 'Scrap', value: 5, weight: 900 }, { name: 'Rare skin', value: 200, weight: 100 }];
  box.innerHTML = `
  <section class="card" style="border-color:var(--bp)">
    <div class="row" style="justify-content:space-between"><h2 class="h-sect">${k ? `Edit ${esc(k.name)} · next version v${k.version + 1}` : 'New case'}</h2><button class="btn ghost small" type="button" data-close>Close</button></div>
    <div class="row">
      <label class="field" style="flex:1;min-width:160px">Id<input data-id value="${esc(k?.id ?? '')}" ${k ? 'readonly' : ''} placeholder="e.g. rad-town" maxlength="32"></label>
      <label class="field" style="flex:2;min-width:200px">Name<input data-name value="${esc(k?.name ?? '')}" maxlength="40" placeholder="Rad Town Crate"></label>
    </div>
    <div class="tablewrap"><table><thead><tr><th>Item</th><th class="r">Value (Frags)</th><th class="r">Weight (tickets)</th><th class="r">Chance</th><th></th></tr></thead><tbody data-items></tbody></table></div>
    <div class="row"><button class="btn ghost small" type="button" data-add>Add item</button></div>
    <div class="kpis" data-preview></div>
    <div class="row"><button class="btn" type="button" data-publish>${k ? 'Publish new version' : 'Create case'}</button><span class="status" data-msg></span></div>
    ${k ? `<details><summary class="muted" style="font-size:13px">Version history (${k.versions.length})</summary><div class="tablewrap"><table><tbody>${k.versions.map((v: any) => `<tr><td class="num">v${v.version}</td><td class="num">${frags(v.price, 0)} Frags</td><td class="num">${pct(v.rtp)}</td><td class="num" style="font-size:12px">${when(v.created_at || null)}</td><td><a href="/api/cases/${esc(k.id)}/v/${v.version}" target="_blank" rel="noopener">items (JSON)</a></td></tr>`).join('')}</tbody></table></div></details>` : ''}
  </section>`;
  box.scrollIntoView({ block: 'start' });
  const rows = $('[data-items]', box);
  let timer = 0;
  const preview = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void guard(null, async () => {
      const msg = $('[data-msg]', box);
      try {
        const p = await api<any>('POST', '/admin/cases/preview', { name: $<HTMLInputElement>('[data-name]', box).value || 'Preview', items });
        $('[data-preview]', box).innerHTML = kpi('Price', `${frags(p.price, 0)} Frags`) + kpi('RTP', pct(p.rtp)) + kpi('Top item', `${frags(Math.max(...items.map((i) => i.value)), 0)}`, `${(p.price ? Math.max(...items.map((i) => i.value)) / p.price : 0).toFixed(1)}× the price`);
        p.items.forEach((it: any, n: number) => { const cell = rows.querySelector(`[data-chance="${n}"]`); if (cell) cell.textContent = pct(it.chance, 3); });
        msg.textContent = ''; msg.className = 'status';
      } catch (e: any) { msg.textContent = e?.body?.message ?? 'Check the items.'; msg.className = 'status lose'; }
    }), 250);
  };
  const paint = () => {
    rows.innerHTML = items.map((i, n) => `<tr><td><input class="input" data-f="name" data-n="${n}" value="${esc(i.name)}" maxlength="60" aria-label="Item ${n + 1} name"></td>
      <td class="r"><input class="input num" style="max-width:120px" data-f="value" data-n="${n}" value="${i.value}" inputmode="numeric" aria-label="Item ${n + 1} value"></td>
      <td class="r"><input class="input num" style="max-width:140px" data-f="weight" data-n="${n}" value="${i.weight}" inputmode="numeric" aria-label="Item ${n + 1} weight"></td>
      <td class="r num" data-chance="${n}">–</td><td><button class="btn ghost small" type="button" data-del="${n}" aria-label="Remove item ${n + 1}">✕</button></td></tr>`).join('');
    $$<HTMLInputElement>('[data-f]', rows).forEach((x) => x.addEventListener('input', () => {
      const it = items[Number(x.dataset.n)];
      if (x.dataset.f === 'name') it.name = x.value; else it[x.dataset.f as 'value' | 'weight'] = Number(x.value);
      preview();
    }));
    $$<HTMLButtonElement>('[data-del]', rows).forEach((b) => b.addEventListener('click', () => { items.splice(Number(b.dataset.del), 1); paint(); }));
    preview();
  };
  paint();
  $('[data-name]', box).addEventListener('input', preview);
  $('[data-add]', box).addEventListener('click', () => { items.push({ name: 'Item', value: 1, weight: 1 }); paint(); });
  $('[data-close]', box).addEventListener('click', () => { box.innerHTML = ''; });
  $('[data-publish]', box).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
    const id = $<HTMLInputElement>('[data-id]', box).value.trim().toLowerCase();
    const v = await api<any>('PUT', `/admin/cases/${encodeURIComponent(id)}`, { name: $<HTMLInputElement>('[data-name]', box).value, items });
    toast(`${v.name} v${v.version} published at ${frags(v.price, 0)} Frags (${pct(v.rtp)} RTP).`);
    await casesTab(panel);
  }));
}

/* ---------- promo codes ---------- */

export async function promosTab(panel: HTMLElement) {
  const list = await api<any[]>('GET', '/admin/promos');
  panel.innerHTML = `
  <section class="card">
    <h2 class="h-sect">New promo code</h2>
    <form class="row" id="promo-new" style="align-items:flex-end">
      <label class="field" style="flex:1;min-width:130px">Code<input name="code" maxlength="20" placeholder="WIPEDAY" required></label>
      <label class="field" style="width:120px">Frags each<input name="amount" inputmode="decimal" value="25"></label>
      <label class="field" style="width:110px">Max uses<input name="maxUses" inputmode="numeric" value="100"></label>
      <label class="field" style="width:100px">Min level<input name="minLevel" inputmode="numeric" value="1"></label>
      <label class="field" style="width:200px">Expires (optional)<input name="expires" type="datetime-local"></label>
      <label class="field" style="flex:1;min-width:160px">Note<input name="note" maxlength="200" placeholder="Stream giveaway"></label>
      <button class="btn" type="submit">Create</button>
    </form>
    <p class="muted" style="font-size:12px">One use per player; blocked during a break or self-exclusion; budget (amount × uses) at most 1,000,000 Frags. Ten wrong codes in an hour lock a player out of redeeming for an hour.</p>
  </section>
  <section class="card">
    <h2 class="h-sect">Codes</h2>
    <div class="tablewrap"><table><thead><tr><th>Code</th><th class="r">Each</th><th class="r">Used</th><th class="r">Spent / budget</th><th class="r">Min level</th><th>Expires</th><th>Note</th><th>Active</th></tr></thead><tbody>
      ${list.map((p) => `<tr><td class="num"><b>${esc(p.code)}</b></td><td class="r num">${frags(p.amount)}</td><td class="r num">${p.uses} / ${p.maxUses}</td><td class="r num">${frags(p.spent, 0)} / ${frags(p.budget, 0)}</td>
        <td class="r num">${p.minLevel}</td><td class="num" style="font-size:12px">${p.expiresAt ? when(p.expiresAt) : 'never'}</td><td style="font-size:13px">${esc(p.note ?? '')}</td>
        <td><label class="check"><input type="checkbox" data-active="${esc(p.code)}" ${p.active ? 'checked' : ''} aria-label="${esc(p.code)} active"></label></td></tr>`).join('') || '<tr><td colspan="8" class="muted">No codes yet.</td></tr>'}
    </tbody></table></div>
  </section>`;
  const form = $<HTMLFormElement>('#promo-new', panel);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const exp = String(f.get('expires') ?? '');
    void guard($<HTMLButtonElement>('button', form), async () => {
      await api('POST', '/admin/promos', {
        code: f.get('code'), amount: readNum(String(f.get('amount'))), maxUses: Number(f.get('maxUses')), minLevel: Number(f.get('minLevel')),
        expiresAt: exp ? new Date(exp).getTime() : null, note: String(f.get('note') ?? '') || null,
      });
      toast('Code created.');
      await promosTab(panel);
    });
  });
  $$<HTMLInputElement>('[data-active]', panel).forEach((x) => x.addEventListener('change', () => guard(null, async () => {
    await api('PUT', `/admin/promos/${encodeURIComponent(x.dataset.active!)}`, { active: x.checked });
    toast(x.checked ? 'Code active.' : 'Code paused.');
  })));
}

/* ---------- bet explorer ---------- */

const GAMES: [string, string][] = [['', 'All games'], ['dice', 'Dice'], ['plinko', 'Scrap Chute'], ['upgrader', 'Workbench'], ['cases', 'Cases'], ['airdrop', 'Airdrop'], ['mines', 'Minefield'], ['raid', 'Raid'],
  ['towers', 'Monument Run'], ['hilo', 'Hi-Lo'], ['blackjack', 'Blackjack'], ['crash', 'Scrap Press'], ['wheel', 'Bandit Wheel'], ['coinflip', 'Coinflip'], ['battle', 'Case Battle'], ['jackpot', 'Jackpot']];
const filter = { game: '', user: '', minPayout: '', minMultiplier: '' };

export async function betsTab(panel: HTMLElement) {
  const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v !== '') as [string, string][]);
  const r = await api<any>('GET', `/admin/bets?${q}`);
  panel.innerHTML = `
  <section class="card">
    <h2 class="h-sect">Bet explorer</h2>
    <form class="row" id="bf" style="align-items:flex-end">
      <label class="field">Game<select name="game">${GAMES.map(([g, l]) => `<option value="${g}" ${g === filter.game ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field" style="flex:1;min-width:140px">Player (name or id)<input name="user" value="${esc(filter.user)}"></label>
      <label class="field" style="width:130px">Min payout<input name="minPayout" inputmode="decimal" value="${esc(filter.minPayout)}"></label>
      <label class="field" style="width:130px">Min multiplier<input name="minMultiplier" inputmode="decimal" value="${esc(filter.minMultiplier)}"></label>
      <button class="btn ghost" type="submit">Filter</button>
    </form>
    <div class="kpis">${kpi('Bets', frags(r.total.bets, 0))}${kpi('Wagered', frags(r.total.wagered))}${kpi('Paid', frags(r.total.paid))}${kpi('GGR', signed(r.total.ggr))}</div>
    <div class="tablewrap"><table><thead><tr><th>Time</th><th>Game</th><th>Player</th><th class="r">Stake</th><th class="r">Payout</th><th class="r">×</th></tr></thead><tbody>
      ${r.bets.map((b: any) => `<tr class="clickable" tabindex="0" data-bet="${esc(b.game)}/${esc(b.ref)}"><td class="num" style="font-size:12px">${when(b.createdAt)}</td><td>${esc(b.gameName)}</td><td>${esc(b.name ?? b.userId)}</td>
        <td class="r num">${frags(b.stake)}</td><td class="r num ${b.payout > b.stake ? 'pos' : ''}">${b.settled ? frags(b.payout) : 'open'}</td><td class="r num">${b.settled ? b.multiplier.toFixed(2) : '–'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No bets match.</td></tr>'}
    </tbody></table></div>
    <p class="muted" style="font-size:12px">Newest 100 shown. Click a bet to replay it from its seeds on the server.</p>
  </section>
  <div id="betdetail"></div>`;
  const form = $<HTMLFormElement>('#bf', panel);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    for (const k of Object.keys(filter) as (keyof typeof filter)[]) filter[k] = String(f.get(k) ?? '').trim();
    void betsTab(panel);
  });
  $$<HTMLElement>('[data-bet]', panel).forEach((row) => {
    const open = () => void guard(null, () => betDetail(panel, row.dataset.bet!));
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  });
}

async function betDetail(panel: HTMLElement, path: string) {
  const d = await api<any>('GET', `/admin/bets/${path}`);
  const v = d.verification;
  const box = $('#betdetail', panel);
  const fair = Object.entries(d.fairness ?? {}).filter(([, x]) => x !== null && x !== undefined);
  box.innerHTML = `
  <section class="card" style="border-color:${v.status === 'verified' ? 'var(--ok)' : v.status === 'mismatch' ? 'var(--lose)' : 'var(--line)'}">
    <div class="row" style="justify-content:space-between"><div><p class="eyebrow">${esc(d.gameName)} · ${esc(d.ref)}</p>
      <h2 class="h-sect">${esc(d.name ?? '')} · stake ${frags(d.stake)} · paid ${frags(d.payout)}</h2></div>
      <span class="chip ${v.status === 'verified' ? 'win' : v.status === 'mismatch' ? 'lose' : ''}">${v.status === 'verified' ? '✓ verified' : v.status === 'mismatch' ? '✗ mismatch' : 'pending'}</span></div>
    ${v.reason ? `<p class="muted">${esc(v.reason)}</p>` : ''}
    ${v.checks.length ? `<ul class="checks">${v.checks.map((x: any) => `<li class="${x.ok ? 'ok' : 'bad'}"><b>${esc(x.name)}</b> ${esc(x.detail ?? '')}</li>`).join('')}</ul>` : ''}
    <dl class="fairbox">${fair.map(([k, x]) => `<dt>${esc(k)}</dt><dd>${esc(typeof x === 'object' ? JSON.stringify(x) : x)}</dd>`).join('')}</dl>
    ${d.seats ? `<p style="font-size:13px">${d.seats.map((s: any) => `Seat ${s.seat + 1}: ${esc(s.name)} · ${frags(s.payout)}`).join(' · ')}</p>` : ''}
    ${d.entries ? `<p style="font-size:13px">${d.entries.map((e: any) => `${esc(e.name)} ${frags(e.amount)} (${pct(e.chance, 1)})`).join(' · ')}</p>` : ''}
    <details><summary class="muted" style="font-size:13px">Params and result</summary><pre class="num" style="white-space:pre-wrap;font-size:11px;margin:0">${esc(JSON.stringify({ params: d.params, result: d.result }, null, 2))}</pre></details>
    ${d.fairness?.seedRevealed === false ? '<p class="muted" style="font-size:12px">The player\'s server seed is still active: it was used for this check on the server but is not shown until the player rotates it.</p>' : ''}
  </section>`;
  box.scrollIntoView({ block: 'start' });
}

/* ---------- daily report ---------- */

/**
 * Offers a generated file. Inside the claude.ai artifact viewer (the demo) a page cannot start downloads
 * itself, so the save goes through the viewer's `downloads` capability; everywhere else a normal link does.
 */
async function saveFile(filename: string, data: string) {
  const host = (window as unknown as { claude?: { use(name: string): Promise<any> } }).claude;
  if (host) {
    const downloads = await host.use('downloads');
    if (!downloads) { toast('Downloads are not available in this view.', 'err'); return; }
    try { await downloads.save({ filename, data }); } catch (err: any) { if (err?.code !== 'declined') toast('The file could not be saved here.', 'err'); }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}


let reportDays = 14;
export async function reportsTab(panel: HTMLElement) {
  const r = await api<any>('GET', `/admin/reports/daily?days=${reportDays}`);
  const t = r.totals;
  panel.innerHTML = `
  <section class="card">
    <div class="row" style="justify-content:space-between"><h2 class="h-sect">Daily report (UTC)</h2>
      <div class="row"><div class="seg" role="group" aria-label="Days">${[7, 14, 30, 90].map((d) => `<button type="button" data-rd="${d}" aria-pressed="${d === reportDays}">${d} d</button>`).join('')}</div>
      <button class="btn ghost small" type="button" data-csv>CSV</button></div></div>
    <div class="kpis">${kpi('Wagered', frags(t.wagered))}${kpi('GGR', signed(t.ggr))}${kpi('Bonus cost', frags(t.bonusCost))}${kpi('Adjustments', signed(-t.adjustments), 'credited to players')}${kpi('NGR', signed(t.ngr))}${kpi('Sign-ups', frags(t.signups, 0))}</div>
    <div class="tablewrap"><table><thead><tr><th>Day</th><th class="r">Bets</th><th class="r">Players</th><th class="r">New</th><th class="r">Wagered</th><th class="r">GGR</th><th class="r">Margin</th><th class="r">Bonus</th><th class="r">NGR</th></tr></thead><tbody>
      ${r.rows.map((d: any, i: number) => `<tr class="clickable" tabindex="0" data-day="${i}"><td class="num">${d.date}</td><td class="r num">${frags(d.bets, 0)}</td><td class="r num">${d.activePlayers}</td><td class="r num">${d.signups}</td>
        <td class="r num">${frags(d.wagered)}</td><td class="r num ${d.ggr < 0 ? 'neg' : ''}">${signed(d.ggr)}</td><td class="r num">${d.margin === null ? '–' : pct(d.margin)}</td><td class="r num">${frags(d.bonusCost + d.adjustments)}</td><td class="r num ${d.ngr < 0 ? 'neg' : ''}">${signed(d.ngr)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted" style="font-size:12px">Settled bets count on the day they were placed. Bonus = rakeback, crates, rain, crew shares, promo codes and balance adjustments. Click a day for the per-game split.</p>
  </section>
  <div id="day"></div>`;
  $$<HTMLButtonElement>('[data-rd]', panel).forEach((b) => b.addEventListener('click', () => { reportDays = Number(b.dataset.rd); void reportsTab(panel); }));
  $$<HTMLElement>('[data-day]', panel).forEach((row) => {
    const open = () => {
      const d = r.rows[Number(row.dataset.day)];
      $('#day', panel).innerHTML = `<section class="card"><h2 class="h-sect">${d.date} by game</h2><div class="tablewrap"><table><thead><tr><th>Game</th><th class="r">Bets</th><th class="r">Players</th><th class="r">Wagered</th><th class="r">Paid</th><th class="r">GGR</th><th class="r">RTP</th></tr></thead><tbody>
        ${d.games.map((g: any) => `<tr><td>${esc(g.name)}</td><td class="r num">${g.bets}</td><td class="r num">${g.players}</td><td class="r num">${frags(g.wagered)}</td><td class="r num">${frags(g.paid)}</td><td class="r num ${g.ggr < 0 ? 'neg' : ''}">${signed(g.ggr)}</td><td class="r num">${g.rtp === null ? '–' : pct(g.rtp)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No settled bets.</td></tr>'}
        </tbody></table></div>${Object.keys(d.bonusByKind).length ? `<p class="muted" style="font-size:13px">Bonuses: ${Object.entries(d.bonusByKind).map(([k, v]) => `${esc(k)} ${frags(v as number)}`).join(' · ')}</p>` : ''}</section>`;
    };
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  });
  $('[data-csv]', panel).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
    const head = ['date', 'bets', 'active_players', 'signups', 'wagered', 'paid', 'ggr', 'bonus_cost', 'adjustments', 'ngr'];
    const lines = [head.join(','), ...r.rows.map((d: any) => [d.date, d.bets, d.activePlayers, d.signups, d.wagered, d.paid, d.ggr, d.bonusCost, d.adjustments, d.ngr].join(','))];
    await saveFile(`scrapline-daily-${r.rows.at(-1)?.date}-${r.rows[0]?.date}.csv`, lines.join('\n') + '\n');
  }));
}
