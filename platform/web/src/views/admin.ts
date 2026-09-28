import { api } from '../api';
import type { View } from '../main';
import { $, $$, esc, frags, guard, modal, pct, toast } from '../ui';

type Tab = 'overview' | 'rtp' | 'players' | 'games' | 'rg' | 'audit';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['rtp', 'RTP monitor'], ['players', 'Players'], ['games', 'Games'], ['rg', 'RG cases'], ['audit', 'Audit log']];
const TAB_KEY = 'scrapline.admin.tab';

const when = (t: number | null) => (t ? new Date(t).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short', hour12: false }) : '–');
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${frags(Math.abs(n))}`;
const REASONS: Record<string, string> = { net_loss_24h: 'Net loss 24 h', limit_raises_30d: 'Repeated limit raises', long_session: 'Long session' };
const STATUS_CHIP: Record<string, string> = { ok: 'win', watch: '', alarm: 'lose', low_sample: '' };
const blockLabel = (b: { kind: string; until: number | null } | null) => (b ? `${b.kind === 'operator' ? 'Hold' : b.kind === 'cooldown' ? 'Break' : 'Self-excluded'} ${b.until ? `until ${when(b.until)}` : '(open-ended)'}` : '');
const kpi = (label: string, value: string, sub = '') => `<div class="kpi"><span class="eyebrow">${label}</span><b class="num">${value}</b>${sub ? `<span class="muted">${sub}</span>` : ''}</div>`;
const loadTab = (): Tab => { try { return (localStorage.getItem(TAB_KEY) as Tab) || 'overview'; } catch { return 'overview'; } };

export const adminView: View = {
  title: 'Backoffice',
  html: (c) => c.me.role !== 'admin' ? `
  <section class="card" style="max-width:720px">
    <p class="eyebrow">Operations</p>
    <h1 class="h-display">Backoffice</h1>
    <p class="muted">The backoffice is for operators: KPIs, a live RTP monitor, player accounts, a kill switch per game, the responsible-gambling case queue and the audit log. ${c.me.role === 'moderator' ? 'As a moderator you can delete messages and mute players directly in the chat.' : ''}</p>
    ${c.cfg.demo ? `<p>In this demo you can give your own account an operator role to look around. In production, only an admin can grant roles, and every action is audited.</p>
    <div class="row"><button class="btn" type="button" data-role="admin">Become admin (demo)</button>${c.me.role === 'player' ? '<button class="btn ghost" type="button" data-role="moderator">Become moderator (demo)</button>' : ''}</div>` : '<p class="status lose">You do not have access to this area.</p>'}
  </section>` : `
  <section class="card" style="gap:14px">
    <div class="row" style="justify-content:space-between"><div><p class="eyebrow">Operations · admin</p><h1 class="h-display">Backoffice</h1></div>
      ${c.cfg.demo ? '<button class="btn ghost small" type="button" data-role="player">Back to player (demo)</button>' : ''}</div>
    <div class="tabs" role="tablist" aria-label="Backoffice sections">${TABS.map(([t, l]) => `<button type="button" role="tab" data-tab="${t}" aria-selected="false">${l}</button>`).join('')}</div>
  </section>
  <div id="panel" style="display:flex;flex-direction:column;gap:16px"></div>`,
  mount: (root, c) => {
    $$<HTMLButtonElement>('[data-role]', root).forEach((b) => b.addEventListener('click', () => guard(b, async () => {
      await api('POST', '/demo/role', { role: b.dataset.role });
      await c.refresh();
      c.rerender();
    })));
    if (c.me.role !== 'admin') return;

    let tab: Tab = loadTab();
    let timer = 0;
    const panel = $('#panel', root);
    const select = (t: Tab) => {
      tab = t;
      try { localStorage.setItem(TAB_KEY, t); } catch { /* ignore */ }
      $$('[data-tab]', root).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
      clearInterval(timer);
      panel.innerHTML = '<p class="muted">Loading …</p>';
      void RENDER[t]().catch((e) => { panel.innerHTML = `<p class="status lose">${esc(e?.body?.message ?? 'Could not load this section.')}</p>`; });
      if (t === 'overview' || t === 'rtp') timer = window.setInterval(() => void RENDER[t]().catch(() => null), 10_000);
    };
    $$<HTMLButtonElement>('[data-tab]', root).forEach((b) => b.addEventListener('click', () => select(b.dataset.tab as Tab)));

    /* ---------- overview ---------- */
    const overview = async () => {
      const o = await api<any>('GET', '/admin/overview');
      panel.innerHTML = `
      <section class="card">
        <div class="row" style="justify-content:space-between"><h2 class="h-sect">Last 24 hours</h2><span class="muted" style="font-size:13px">updated ${when(o.now)}</span></div>
        <div class="kpis">
          ${kpi('Players', frags(o.players.total, 0), `${o.players.new24h} new · ${o.players.active24h} active`)}
          ${kpi('Bets', frags(o.last24h.bets, 0))}
          ${kpi('Wagered', frags(o.last24h.wagered), 'Frags')}
          ${kpi('GGR', signed(o.last24h.ggr), 'stakes − payouts, settled')}
          ${kpi('Bonus cost', frags(o.last24h.promoCost), 'rakeback, crates, rain')}
          ${kpi('NGR', signed(o.last24h.ngr), 'GGR − bonus cost')}
        </div>
      </section>
      <div class="admin-grid">
        <section class="card">
          <h2 class="h-sect">Health</h2>
          <ul class="checks">
            <li class="${o.ledger.ok ? 'ok' : 'bad'}"><b>Ledger</b> ${o.ledger.ok ? 'Σ = 0, every cached balance matches the ledger' : `Σ = ${o.ledger.sum}, mismatched: ${esc(o.ledger.mismatched.join(', ') || '–')}`}</li>
            <li class="${o.alarms.length ? 'bad' : o.watch.length ? 'warn' : 'ok'}"><b>RTP monitor</b> ${o.alarms.length ? `alarm: ${esc(o.alarms.join(', '))}` : o.watch.length ? `watch: ${esc(o.watch.join(', '))}` : 'no game outside |z| ≤ 3 (30 days)'}</li>
            <li class="${o.disabledGames.length ? 'warn' : 'ok'}"><b>Games</b> ${o.disabledGames.length ? `paused: ${esc(o.disabledGames.join(', '))}` : 'all live'}</li>
            <li class="${o.openRgCases ? 'warn' : 'ok'}"><b>RG cases</b> ${o.openRgCases} open</li>
            <li class="ok"><b>Chat</b> ${o.chat.messages24h} messages in 24 h · ${o.chat.activeMutes} active mutes</li>
          </ul>
        </section>
        <section class="card">
          <h2 class="h-sect">House accounts</h2>
          <div class="tablewrap"><table><thead><tr><th>Account</th><th class="r">Balance (Frags)</th></tr></thead><tbody>
            ${o.house.map((h: any) => `<tr><td class="num">${esc(h.account)}</td><td class="r num ${h.balance < 0 ? 'neg' : ''}">${frags(h.balance)}</td></tr>`).join('')}
            <tr><td>Player balances (float)</td><td class="r num">${frags(o.playerFloat)}</td></tr>
          </tbody></table></div>
          <p class="muted" style="font-size:12px">${o.demo ? 'Demo: the faucet funds play money, so it runs negative by design.' : ''} Bankroll + escrow + promo + faucet + player float = 0.</p>
        </section>
      </div>`;
    };

    /* ---------- RTP monitor ---------- */
    let days = 30;
    const rtp = async () => {
      const r = await api<any>('GET', `/admin/rtp?days=${days}`);
      panel.innerHTML = `
      <section class="card">
        <div class="row" style="justify-content:space-between"><h2 class="h-sect">RTP monitor</h2>
          <div class="seg" role="group" aria-label="Window">${[1, 7, 30, 90].map((d) => `<button type="button" data-days="${d}" aria-pressed="${d === days}">${d} d</button>`).join('')}</div></div>
        <p class="muted" style="font-size:13px;max-width:80ch">z compares each bet's return with the theoretical RTP of that exact bet (Scrap Chute table, case, battle case set). Alarm at |z| &gt; 4 with at least 1,000 bets, watch at |z| &gt; 3. Honest variance keeps z near 0; a wrong paytable pushes it further out the more bets come in.</p>
        <div class="tablewrap"><table><thead><tr><th>Game</th><th class="r">Bets</th><th class="r">Wagered</th><th class="r">Paid</th><th class="r">RTP</th><th class="r">Theory</th><th class="r">z</th><th>Status</th></tr></thead><tbody>
          ${r.games.map((g: any) => `<tr><td>${esc(g.name)}</td><td class="r num">${frags(g.n, 0)}</td><td class="r num">${frags(g.wagered)}</td><td class="r num">${frags(g.paid)}</td>
            <td class="r num">${g.rtp === null ? '–' : pct(g.rtp)}</td><td class="r num">${g.theory === null ? '–' : pct(g.theory)}</td><td class="r num">${g.z === null ? '–' : g.z.toFixed(2)}</td>
            <td><span class="chip ${STATUS_CHIP[g.status]}">${g.status === 'low_sample' ? 'low sample' : g.status}</span></td></tr>`).join('')}
        </tbody></table></div>
      </section>`;
      $$<HTMLButtonElement>('[data-days]', panel).forEach((b) => b.addEventListener('click', () => { days = Number(b.dataset.days); void rtp(); }));
    };

    /* ---------- players ---------- */
    let q = '';
    const players = async () => {
      const list = await api<any[]>('GET', `/admin/players?q=${encodeURIComponent(q)}`);
      panel.innerHTML = `
      <section class="card">
        <div class="row" style="justify-content:space-between"><h2 class="h-sect">Players</h2>
          <form class="row" data-search><input class="input" data-q value="${esc(q)}" placeholder="Name or id" aria-label="Search players"><button class="btn ghost small" type="submit">Search</button></form></div>
        <div class="tablewrap"><table><thead><tr><th>Player</th><th>Role</th><th class="r">Balance</th><th class="r">Bets</th><th class="r">Wagered</th><th class="r">Net</th><th>Last bet</th><th>Flags</th></tr></thead><tbody>
          ${list.map((p) => `<tr class="clickable" data-player="${p.id}" tabindex="0"><td><b>${esc(p.name)}</b><br><span class="muted num" style="font-size:11px">${p.id}</span></td><td>${p.role}</td>
            <td class="r num">${frags(p.balance)}</td><td class="r num">${frags(p.bets, 0)}</td><td class="r num">${frags(p.wagered)}</td><td class="r num ${p.net < 0 ? 'neg' : p.net > 0 ? 'pos' : ''}">${signed(p.net)}</td>
            <td class="num" style="font-size:12px">${when(p.lastBetAt)}</td>
            <td>${[p.block ? `<span class="chip lose">${esc(blockLabel(p.block).split(' ')[0])}</span>` : '', p.muted ? '<span class="chip">muted</span>' : '', p.openCases ? `<span class="chip lose">${p.openCases} RG</span>` : ''].join(' ')}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">No players found.</td></tr>'}
        </tbody></table></div>
      </section>
      <div id="detail"></div>`;
      $('[data-search]', panel).addEventListener('submit', (e) => { e.preventDefault(); q = $<HTMLInputElement>('[data-q]', panel).value; void players(); });
      $$<HTMLElement>('[data-player]', panel).forEach((r) => {
        const open = () => void showPlayer(r.dataset.player!);
        r.addEventListener('click', open);
        r.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      });
    };

    const showPlayer = async (id: string) => {
      const p = await api<any>('GET', `/admin/players/${id}`);
      const box = $('#detail', panel);
      const stat = (label: string, s: any) => kpi(label, signed(s.net), `${frags(s.bets, 0)} bets · ${frags(s.wagered)} wagered`);
      box.innerHTML = `
      <section class="card" style="border-color:var(--hazard)">
        <div class="row" style="justify-content:space-between"><div><p class="eyebrow">Player</p><h2 class="h-sect">${esc(p.name)} <span class="muted num" style="font-size:12px">${p.id}</span></h2>
          <p class="muted" style="font-size:13px">Joined ${when(p.createdAt)} · ${esc(p.country ?? 'country unknown')} · KYC level ${p.kycLevel} · ${p.steam ? 'Steam linked' : 'no Steam'} · balance <b class="num">${frags(p.balance)}</b> Frags</p></div>
          <button class="btn ghost small" type="button" data-close>Close</button></div>
        <div class="kpis">${stat('Net 24 h', p.stats.h24)}${stat('Net 30 d', p.stats.d30)}${stat('Net all time', p.stats.all)}</div>
        <div class="row">
          ${p.block ? `<span class="chip lose">${esc(blockLabel(p.block))}</span>` : '<span class="chip win">No block</span>'}
          ${p.mute ? `<span class="chip">muted ${p.mute.until ? `until ${when(p.mute.until)}` : ''}</span>` : ''}
        </div>
        <div class="row">
          <button class="btn small" type="button" data-hold>Put on hold</button>
          ${p.block?.kind === 'operator' ? '<button class="btn ghost small" type="button" data-release>Lift hold</button>' : ''}
          ${p.mute ? '<button class="btn ghost small" type="button" data-unmute>Unmute</button>' : ''}
          <label class="field" style="flex-direction:row;align-items:center;gap:8px">Role <select data-rolesel>${['player', 'moderator', 'admin'].map((r) => `<option ${r === p.role ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
        </div>
        <p class="muted" style="font-size:12px">A hold stops betting until lifted; open rounds can still be cashed out. Operators cannot shorten a break or a self-exclusion.</p>
        <div class="admin-grid">
          <div><h3 class="h-sect" style="font-size:15px">Recent bets</h3><div class="tablewrap"><table><tbody>${p.wagers.map((w: any) => `<tr><td class="num" style="font-size:12px">${when(w.createdAt)}</td><td>${esc(w.game)}</td><td class="r num">${frags(w.stake)}</td><td class="r num ${w.payout > w.stake ? 'pos' : ''}">${w.settled ? frags(w.payout) : 'open'}</td></tr>`).join('') || '<tr><td class="muted">None.</td></tr>'}</tbody></table></div></div>
          <div><h3 class="h-sect" style="font-size:15px">Ledger</h3><div class="tablewrap"><table><tbody>${p.ledger.map((l: any) => `<tr><td class="num" style="font-size:12px">${when(l.createdAt)}</td><td>${esc(l.kind)}</td><td class="r num ${l.amount < 0 ? 'neg' : 'pos'}">${signed(l.amount)}</td></tr>`).join('')}</tbody></table></div></div>
          <div><h3 class="h-sect" style="font-size:15px">Limits &amp; rewards</h3>
            <p style="font-size:13px">${p.limits.length ? p.limits.map((l: any) => `${esc(l.kind)}/${esc(l.period)}: <span class="num">${l.amount === null ? 'none' : frags(l.amount, 0)}</span> (used ${frags(l.used, 0)})${l.pending ? ' · change pending' : ''}`).join('<br>') : '<span class="muted">No limits set.</span>'}</p>
            <p style="font-size:13px">${p.rewards.map((r: any) => `${esc(r.kind)}: ${r.count}× · <span class="num">${frags(r.total)}</span>`).join('<br>') || '<span class="muted">No rewards claimed.</span>'}</p>
            <p style="font-size:13px">${p.cases.map((k: any) => `${esc(REASONS[k.reason] ?? k.reason)} · ${esc(k.status)}`).join('<br>') || '<span class="muted">No RG cases.</span>'}</p></div>
          <div><h3 class="h-sect" style="font-size:15px">Audit</h3><div class="tablewrap"><table><tbody>${p.audit.map((a: any) => `<tr><td class="num" style="font-size:12px">${when(a.createdAt)}</td><td>${esc(a.event)}</td><td class="num" style="font-size:11px;word-break:break-all">${esc(JSON.stringify(a.data))}</td></tr>`).join('')}</tbody></table></div></div>
        </div>
      </section>`;
      box.scrollIntoView({ block: 'start' });
      $('[data-close]', box).addEventListener('click', () => { box.innerHTML = ''; });
      $('[data-hold]', box).addEventListener('click', () => {
        const m = modal(`<h2 class="h-sect">Put ${esc(p.name)} on hold</h2>
          <label class="field">Duration<select data-h><option value="24">24 hours</option><option value="168">7 days</option><option value="null">Until lifted</option></select></label>
          <label class="field">Reason (audited)<input data-r maxlength="200" placeholder="e.g. chargeback review, KYC check"></label>
          <div class="row"><button class="btn" data-ok type="button">Put on hold</button><button class="btn ghost" data-no type="button">Cancel</button></div>`);
        m.root.querySelector('[data-no]')!.addEventListener('click', m.close);
        m.root.querySelector('[data-ok]')!.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
          const h = (m.root.querySelector('[data-h]') as HTMLSelectElement).value;
          await api('POST', `/admin/players/${p.id}/hold`, { hours: h === 'null' ? null : Number(h), reason: (m.root.querySelector('[data-r]') as HTMLInputElement).value });
          m.close(); toast('Hold set.'); await showPlayer(p.id);
        }));
      });
      $('[data-release]', box)?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => { await api('DELETE', `/admin/players/${p.id}/hold`); toast('Hold lifted.'); await showPlayer(p.id); }));
      $('[data-unmute]', box)?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => { await api('DELETE', `/mod/mute/${p.id}`); toast('Unmuted.'); await showPlayer(p.id); }));
      $('[data-rolesel]', box).addEventListener('change', (e) => guard(null, async () => {
        await api('PUT', `/admin/players/${p.id}/role`, { role: (e.target as HTMLSelectElement).value });
        toast('Role updated.');
        if (p.id === c.me.id) { await c.refresh(); c.rerender(); } else await showPlayer(p.id);
      }));
    };

    /* ---------- games ---------- */
    const games = async () => {
      const list = await api<any[]>('GET', '/admin/games');
      panel.innerHTML = `
      <section class="card">
        <h2 class="h-sect">Kill switch</h2>
        <p class="muted" style="font-size:13px;max-width:80ch">A paused game refuses new rounds and further steps. Rounds already in play can still be cashed out and settle normally, so no balance is ever locked. Pausing needs a reason; every change lands in the audit log.</p>
        <div class="tablewrap"><table><thead><tr><th>Game</th><th>Status</th><th>Reason</th><th>Changed</th><th></th></tr></thead><tbody>
          ${list.map((g) => `<tr><td><b>${esc(g.name)}</b></td><td><span class="chip ${g.enabled ? 'win' : 'lose'}">${g.enabled ? 'live' : 'paused'}</span></td>
            <td>${g.enabled ? `<input class="input" data-reason="${g.game}" maxlength="200" placeholder="Reason to pause" aria-label="Reason to pause ${esc(g.name)}">` : esc(g.reason ?? '')}</td>
            <td class="num" style="font-size:12px">${when(g.updatedAt)}</td>
            <td><button class="btn small ${g.enabled ? '' : 'win'}" type="button" data-toggle="${g.game}" data-enabled="${g.enabled}">${g.enabled ? 'Pause' : 'Resume'}</button></td></tr>`).join('')}
        </tbody></table></div>
      </section>`;
      $$<HTMLButtonElement>('[data-toggle]', panel).forEach((b) => b.addEventListener('click', () => guard(b, async () => {
        const enable = b.dataset.enabled !== 'true';
        await api('PUT', `/admin/games/${b.dataset.toggle}`, { enabled: enable, reason: enable ? null : $<HTMLInputElement>(`[data-reason="${b.dataset.toggle}"]`, panel).value });
        toast(enable ? 'Game resumed.' : 'Game paused.');
        await games();
      })));
    };

    /* ---------- RG cases ---------- */
    let showAll = false;
    const rg = async () => {
      const list = await api<any[]>('GET', `/admin/rg-cases?status=${showAll ? 'all' : 'open'}`);
      panel.innerHTML = `
      <section class="card">
        <div class="row" style="justify-content:space-between"><h2 class="h-sect">Responsible-gambling cases</h2>
          <div class="seg" role="group" aria-label="Filter"><button type="button" data-all="0" aria-pressed="${!showAll}">Open</button><button type="button" data-all="1" aria-pressed="${showAll}">All</button></div></div>
        <p class="muted" style="font-size:13px;max-width:80ch">Opened automatically: net loss in 24 h above the threshold, three or more limit raises or removals in 30 days, or a session over 3 hours with recent bets. Contact the player with RG information and tools; close with a note.</p>
        <div class="tablewrap"><table><thead><tr><th>Player</th><th>Trigger</th><th>Details</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>
          ${list.map((k) => `<tr><td><b>${esc(k.name)}</b><br><span class="muted" style="font-size:12px">${when(k.createdAt)}</span></td><td>${esc(REASONS[k.reason] ?? k.reason)}</td>
            <td class="num" style="font-size:12px">${esc(Object.entries(k.data ?? {}).map(([a, v]) => `${a}: ${v}`).join(' · '))}</td>
            <td><span class="chip ${k.status === 'closed' ? 'win' : k.status === 'open' ? 'lose' : ''}">${k.status}</span></td><td style="font-size:13px">${esc(k.note ?? '')}</td>
            <td>${k.status === 'closed' ? '' : `<div class="row">${k.status === 'open' ? `<button class="btn ghost small" type="button" data-case="${k.id}" data-status="contacted">Contacted</button>` : ''}<button class="btn small" type="button" data-case="${k.id}" data-status="closed">Close</button></div>`}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No cases. Good.</td></tr>'}
        </tbody></table></div>
      </section>`;
      $$<HTMLButtonElement>('[data-all]', panel).forEach((b) => b.addEventListener('click', () => { showAll = b.dataset.all === '1'; void rg(); }));
      $$<HTMLButtonElement>('[data-case]', panel).forEach((b) => b.addEventListener('click', () => {
        const m = modal(`<h2 class="h-sect">${b.dataset.status === 'closed' ? 'Close case' : 'Mark as contacted'}</h2>
          <label class="field">Note (audited)<input data-n maxlength="500" placeholder="${b.dataset.status === 'closed' ? 'Outcome, e.g. player set a lower loss limit' : 'e.g. sent RG message with limit tools'}"></label>
          <div class="row"><button class="btn" data-ok type="button">Save</button><button class="btn ghost" data-no type="button">Cancel</button></div>`);
        m.root.querySelector('[data-no]')!.addEventListener('click', m.close);
        m.root.querySelector('[data-ok]')!.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
          await api('PUT', `/admin/rg-cases/${b.dataset.case}`, { status: b.dataset.status, note: (m.root.querySelector('[data-n]') as HTMLInputElement).value });
          m.close(); await rg();
        }));
      }));
    };

    /* ---------- audit ---------- */
    let ev = '';
    const auditLog = async () => {
      const rows = await api<any[]>('GET', `/admin/audit${ev ? `?event=${encodeURIComponent(ev)}` : ''}`);
      panel.innerHTML = `
      <section class="card">
        <div class="row" style="justify-content:space-between"><h2 class="h-sect">Audit log</h2>
          <div class="seg" role="group" aria-label="Event filter">${[['', 'All'], ['admin_', 'Admin'], ['mod_', 'Moderation'], ['rg_', 'RG'], ['signup', 'Sign-ups']].map(([k, l]) => `<button type="button" data-ev="${k}" aria-pressed="${k === ev}">${l}</button>`).join('')}</div></div>
        <div class="tablewrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Event</th><th>Data</th></tr></thead><tbody>
          ${rows.map((a) => `<tr><td class="num" style="font-size:12px;white-space:nowrap">${when(a.createdAt)}</td><td>${esc(a.name ?? a.userId ?? 'system')}</td><td class="num">${esc(a.event)}</td><td class="num" style="font-size:11px;word-break:break-all;max-width:420px">${esc(JSON.stringify(a.data))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nothing yet.</td></tr>'}
        </tbody></table></div>
      </section>`;
      $$<HTMLButtonElement>('[data-ev]', panel).forEach((b) => b.addEventListener('click', () => { ev = b.dataset.ev!; void auditLog(); }));
    };

    const RENDER: Record<Tab, () => Promise<void>> = { overview, rtp, players, games, rg, audit: auditLog };
    select(TABS.some(([t]) => t === tab) ? tab : 'overview');
    return () => clearInterval(timer);
  },
};
