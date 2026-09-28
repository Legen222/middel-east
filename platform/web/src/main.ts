import { type Me, type PublicConfig, RequestError, api, token } from './api';
import { chatPanelHtml, chatView, mountChatPanel } from './chatpanel';
import { SPRITE, icon } from './icons';
import { $, errorText, esc, frags, guard, modal, toast } from './ui';
import { adminView } from './views/admin';
import { casesView } from './views/cases';
import { crashView } from './views/crash';
import { battleView, coinflipView } from './views/pvp';
import { diceView } from './views/dice';
import { fairView } from './views/fair';
import { historyView } from './views/history';
import { limitsView } from './views/limits';
import { lobbyView } from './views/lobby';
import { minesView } from './views/mines';
import { plinkoView } from './views/plinko';
import { raidView } from './views/raid';
import { rewardsView } from './views/rewards';
import { upgraderView } from './views/upgrader';

export interface Ctx {
  cfg: PublicConfig;
  me: Me;
  /** Reloads /me and repaints balance + session bar. Call after every bet. */
  refresh: () => Promise<void>;
  /** Rebuilds the shell (navigation depends on the role) and the current view. */
  rerender: () => void;
}
export interface View { title: string; html: (c: Ctx) => string; mount?: (root: HTMLElement, c: Ctx) => void | (() => void) }

const NAV: { path: string; label: string; icon: string; tag?: string; view: View }[] = [
  { path: '', label: 'Workshop', icon: 'home', view: lobbyView },
  { path: 'raid', label: 'Raid', icon: 'raid', tag: 'NEW', view: raidView },
  { path: 'cases', label: 'Cases', icon: 'crate', view: casesView },
  { path: 'battle', label: 'Case Battle', icon: 'battle', view: battleView },
  { path: 'scrap-press', label: 'Scrap Press', icon: 'crash', tag: 'LIVE', view: crashView },
  { path: 'coinflip', label: 'Coinflip', icon: 'coin', view: coinflipView },
  { path: 'minefield', label: 'Minefield', icon: 'mine', view: minesView },
  { path: 'dice', label: 'Dice', icon: 'dice', view: diceView },
  { path: 'scrap-chute', label: 'Scrap Chute', icon: 'plinko', view: plinkoView },
  { path: 'workbench', label: 'Workbench', icon: 'upgrade', view: upgraderView },
];
const ACCOUNT: { path: string; label: string; icon: string; view: View }[] = [
  { path: 'rewards', label: 'Rewards', icon: 'trophy', view: rewardsView },
  { path: 'limits', label: 'Limits & Breaks', icon: 'gauge', view: limitsView },
  { path: 'fair', label: 'Provably Fair', icon: 'shield', view: fairView },
  { path: 'history', label: 'History', icon: 'clock', view: historyView },
];
const COMMUNITY: { path: string; label: string; icon: string; view: View }[] = [
  { path: 'chat', label: 'Chat', icon: 'chat', view: chatView },
  { path: 'admin', label: 'Backoffice', icon: 'wrench', view: adminView },
];
const ALL = [...NAV, ...ACCOUNT, ...COMMUNITY];
const WIDE = matchMedia('(min-width: 1280px)');

const app = $('#app');
document.body.insertAdjacentHTML('afterbegin', SPRITE);
let ctx: Ctx | null = null;
let unmount: (() => void) | void;
let realityTimer = 0;
let unmountAside: (() => void) | null = null;

async function boot() {
  const cfg = await api<PublicConfig>('GET', '/config').catch((e) => { renderFatal(e); throw e; });
  if (!token.get()) return renderGate(cfg);
  try {
    const me = await api<Me>('GET', '/me');
    ctx = { cfg, me, refresh, rerender: () => { renderShell(); route(); } };
    renderShell();
    route();
  } catch (e) {
    if (e instanceof RequestError && e.status === 401) return renderGate(cfg);
    renderFatal(e);
  }
}

function renderFatal(e: unknown) {
  const geo = e instanceof RequestError && e.status === 451;
  app.innerHTML = `<div class="gate"><div class="card"><p class="eyebrow">${geo ? 'Not available' : 'No connection'}</p><h1 class="h-display">SCRAP<span style="color:var(--text)">LINE</span></h1><p>${esc(geo ? errorText(e) : 'The server cannot be reached. Is platform/server running (npm start)?')}</p><button class="btn" id="retry" type="button">Try again</button></div></div>`;
  $('#retry').addEventListener('click', () => boot());
}

/* ---------- gate (sign-up with 18+) ---------- */
function renderGate(cfg: PublicConfig) {
  app.innerHTML = `
  <div class="gate">
    <div class="hazard-strip" aria-hidden="true"></div>
    <div>
      <p class="eyebrow">Play-money demo · 18+</p>
      <h1 class="h-display" style="color:var(--hazard)">SCRAP<span style="color:var(--text)">LINE</span></h1>
      <p class="muted">Honest scrap. Fair math. Every round can be verified.</p>
    </div>
    <form class="card" id="gate" novalidate>
      <label class="field">Display name<input id="name" autocomplete="nickname" maxlength="24" required placeholder="e.g. Rust Rat"></label>
      <label class="check"><input type="checkbox" id="age"> <span>I am at least 18 years old. I understand that gambling can be addictive.</span></label>
      <button class="btn block" type="submit">Start demo · ${frags(100000, 0)} Frags play money</button>
      <p class="muted" style="font-size:13px">Demo balance has no cash value and cannot be withdrawn. ${cfg.demo ? 'Real money only comes with a licence.' : ''}</p>
    </form>
    <p class="muted" style="font-size:13px">Help with gambling problems: <a href="https://www.begambleaware.org" target="_blank" rel="noopener">BeGambleAware</a> · <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener">Gamblers Anonymous</a></p>
  </div>`;
  $('#gate').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $<HTMLButtonElement>('#gate button');
    const res = await guard(btn, () => api<{ token: string }>('POST', '/auth/demo', { displayName: $<HTMLInputElement>('#name').value, ageConfirmed: $<HTMLInputElement>('#age').checked }));
    if (res) { token.set(res.token); boot(); }
  });
}

/* ---------- shell ---------- */
function renderShell() {
  const c = ctx!;
  if (unmountAside) { unmountAside(); unmountAside = null; }
  const link = (n: (typeof ALL)[number] & { tag?: string }) => `<a class="nav" href="#/${n.path}" data-path="${n.path}">${icon(n.icon)}<span>${n.label}</span>${n.tag ? `<em>${n.tag}</em>` : ''}</a>`;
  app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <a class="logo" href="#/">${icon('wrench')}SCRAP<span>LINE</span></a>
      <div class="spacer"></div>
      <div class="sessionbar" title="Play time and result of this session">${icon('clock')}<span class="hide-s">Session</span> <b id="s-time">00:00</b> <span class="hide-s">Net</span> <b id="s-net">±0.00</b></div>
      <a class="pill hide-s" href="#/rewards" title="Level and rewards" style="text-decoration:none;color:inherit">${icon('trophy')}<span class="num" id="level">Lvl ${c.me.level}</span></a>
      <div class="pill"><span class="tag-demo">DEMO</span><span class="num" id="balance">${frags(c.me.balance)}</span><span class="hide-s muted">Frags</span></div>
      <button class="btn ghost small hide-s" id="refill" type="button">Refill</button>
      <button class="btn ghost small" id="logout" type="button" aria-label="Sign out">${icon('user')}</button>
    </header>
    <nav class="side" aria-label="Games">
      <h4>Games</h4>${NAV.map(link).join('')}
      <h4>Account</h4>${ACCOUNT.map(link).join('')}
      <h4>Community</h4>${COMMUNITY.filter((n) => n.path !== 'admin' || c.cfg.demo || c.me.role !== 'player').map(link).join('')}
    </nav>
    <main id="view" tabindex="-1"></main>
    <aside class="chatside" id="chatside"></aside>
    <nav class="bottomnav" aria-label="Navigation">
      ${([[ALL[0], 'Start'], [ALL[1], 'Raid'], [ALL.find((n) => n.path === 'chat')!, 'Chat'], [ALL[NAV.length + 1], 'Limits'], [ALL[NAV.length + 2], 'Fair']] as const).map(([n, l]) => `<a href="#/${n.path}" data-path="${n.path}">${icon(n.icon)}${l}</a>`).join('')}
    </nav>
  </div>`;
  $('#refill').addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => { await api('POST', '/demo/refill'); await refresh(); toast('Demo balance refilled.'); }));
  $('#logout').addEventListener('click', async () => { if (unmountAside) { unmountAside(); unmountAside = null; } ctx = null; await api('POST', '/auth/logout').catch(() => null); token.set(null); location.hash = ''; boot(); });
  paintSession();
  scheduleRealityCheck();
  syncAside();
}

/* Chat aside: mounted only while the screen is wide and the chat is not already the main view. */
function syncAside() {
  const aside = document.getElementById('chatside');
  if (!ctx || !aside) return;
  const want = WIDE.matches && !location.hash.startsWith('#/chat');
  aside.hidden = !want;
  if (want && !unmountAside) { aside.innerHTML = chatPanelHtml('chat-aside'); unmountAside = mountChatPanel($('#chat-aside'), ctx); }
  if (!want && unmountAside) { unmountAside(); unmountAside = null; aside.innerHTML = ''; }
  fitAside();
}
WIDE.addEventListener('change', syncAside);
/* Keeps the sticky chat exactly as tall as the visible space below the top bar (banners above it scroll away). */
function fitAside() {
  const aside = document.getElementById('chatside');
  const bar = document.querySelector<HTMLElement>('.topbar');
  if (!aside || !bar || aside.hidden) return;
  aside.style.setProperty('--topbar-h', `${bar.offsetHeight}px`);
  aside.style.height = `${Math.max(320, innerHeight - Math.max(bar.offsetHeight, aside.getBoundingClientRect().top))}px`;
}
addEventListener('scroll', fitAside, { passive: true });
addEventListener('resize', fitAside);

async function refresh() {
  if (!ctx) return;
  ctx.me = await api<Me>('GET', '/me');
  $('#balance').textContent = frags(ctx.me.balance);
  $('#level').textContent = `Lvl ${ctx.me.level}`;
  paintSession();
  scheduleRealityCheck();
}

let tick = 0;
function paintSession() {
  clearInterval(tick);
  const draw = () => {
    if (!ctx) return;
    const s = ctx.me.session;
    const secs = Math.floor((Date.now() - s.startedAt) / 1000);
    $('#s-time').textContent = `${String(Math.floor(secs / 3600)).padStart(2, '0')}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}`;
    const net = $('#s-net');
    net.textContent = `${s.net > 0 ? '+' : s.net < 0 ? '−' : '±'}${frags(Math.abs(s.net))}`;
    net.className = s.net > 0 ? 'pos' : s.net < 0 ? 'neg' : '';
  };
  draw();
  tick = window.setInterval(draw, 15_000);
}

/* Reality check: pops at the server-computed time with the session summary. */
function scheduleRealityCheck() {
  clearTimeout(realityTimer);
  if (!ctx) return;
  const wait = Math.max(1000, ctx.me.session.nextRealityCheckAt - Date.now());
  realityTimer = window.setTimeout(async () => {
    await refresh().catch(() => null);
    const s = ctx!.me.session;
    const m = modal(`<p class="eyebrow">Reality check</p><h2 class="h-sect">You have been playing for ${Math.round(s.elapsedMs / 60000)} minutes</h2>
      <p>Wagered this session: <b class="num">${frags(s.wagered)}</b> Frags · Result: <b class="num ${s.net < 0 ? 'neg' : 'pos'}">${s.net > 0 ? '+' : ''}${frags(s.net)}</b> Frags · ${s.bets} bets.</p>
      <div class="row"><button class="btn" data-a="go" type="button">Keep playing</button><a class="btn ghost" href="#/limits" data-a="limits">Limits &amp; breaks</a></div>`);
    m.root.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { m.close(); scheduleRealityCheck(); }));
  }, Math.min(wait, 2 ** 31 - 1));
}

/* ---------- router ---------- */
function route() {
  if (!ctx) return;
  const path = location.hash.replace(/^#\/?/, '').split('?')[0];
  const entry = ALL.find((n) => n.path === path) ?? ALL[0];
  document.querySelectorAll<HTMLAnchorElement>('[data-path]').forEach((a) => {
    if (a.dataset.path === entry.path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (typeof unmount === 'function') unmount();
  const root = $('#view');
  root.innerHTML = entry.view.html(ctx);
  document.title = `${entry.view.title} · SCRAPLINE Demo`;
  unmount = entry.view.mount?.(root, ctx);
  syncAside();
  root.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', route);
boot();
