import { type Me, type PublicConfig, RequestError, api, token } from './api';
import { LOGO_MARK, heroSheet } from './art';
import { chatPanelHtml, chatView, mountChatPanel } from './chatpanel';
import { CATEGORIES, GAMES, gameByPath } from './games';
import { SPRITE, icon } from './icons';
import { $, $$, animateNumber, errorText, esc, frags, guard, modal, toast } from './ui';
import { adminView } from './views/admin';
import { airdropView } from './views/airdrop';
import { blackjackView } from './views/blackjack';
import { casesView } from './views/cases';
import { crashView } from './views/crash';
import { diceView } from './views/dice';
import { fairView } from './views/fair';
import { hiloView } from './views/hilo';
import { historyView } from './views/history';
import { jackpotView } from './views/jackpot';
import { limitsView } from './views/limits';
import { lobbyView } from './views/lobby';
import { minesView } from './views/mines';
import { plinkoView } from './views/plinko';
import { battleView } from './views/battle';
import { coinflipView } from './views/pvp';
import { raidView } from './views/raid';
import { rewardsView } from './views/rewards';
import { towersView } from './views/towers';
import { upgraderView } from './views/upgrader';
import { wheelView } from './views/wheel';
import { HELP_LINES, helpView, notFoundView, privacyView, termsView } from './views/info';
import { profileView } from './views/profile';
import { verifyView } from './views/verify';
import { walletView } from './views/wallet';

export interface Ctx {
  cfg: PublicConfig;
  me: Me;
  /** Reloads /me and repaints balance + session bar. Call after every bet. */
  refresh: () => Promise<void>;
  /** Rebuilds the shell (navigation depends on the role) and the current view. */
  rerender: () => void;
  /** Ends the local session and returns to the sign-up page, with a message. */
  signOut: (message?: string) => void;
}
export interface View { title: string; html: (c: Ctx) => string; mount?: (root: HTMLElement, c: Ctx) => void | (() => void) }

const VIEWS: Record<string, View> = {
  '': lobbyView,
  'monument-run': towersView, raid: raidView, minefield: minesView, dice: diceView, airdrop: airdropView, 'scrap-chute': plinkoView, workbench: upgraderView,
  blackjack: blackjackView, 'hi-lo': hiloView,
  'scrap-press': crashView, 'bandit-wheel': wheelView, jackpot: jackpotView,
  cases: casesView, battle: battleView, coinflip: coinflipView,
  rewards: rewardsView, limits: limitsView, fair: fairView, history: historyView, chat: chatView, admin: adminView,
  wallet: walletView, profile: profileView, verify: verifyView, terms: termsView, privacy: privacyView, help: helpView,
};
const MAIN_NAV: [string, string][] = [['', 'Lobby'], ['rewards', 'Rewards'], ['fair', 'Provably fair'], ['limits', 'Responsible play']];
const BOTTOM_NAV: [string, string, string][] = [['', 'Lobby', 'home'], ['rewards', 'Rewards', 'trophy'], ['chat', 'Chat', 'chat'], ['limits', 'Limits', 'gauge'], ['fair', 'Fair', 'shield']];
const FOOT_NAV: [string, string][] = [['fair', 'Provably fair'], ['verify', 'Verifier'], ['limits', 'Responsible play'], ['help', 'Help'], ['terms', 'Terms'], ['privacy', 'Privacy']];
const WIDE = matchMedia('(min-width: 1280px)');
const CHAT_KEY = 'scrapline.chat';

const app = $('#app');
document.body.insertAdjacentHTML('afterbegin', SPRITE);
let ctx: Ctx | null = null;
let unmount: (() => void) | void;
let realityTimer = 0;
let unmountAside: (() => void) | null = null;

/* ---------- site banner (announcement, maintenance) ---------- */
interface Site { announcement: { text: string; tone: 'info' | 'warn' } | null; maintenance: boolean; registrationOpen: boolean }
let site: Site = { announcement: null, maintenance: false, registrationOpen: true };
const bannerHtml = () => site.maintenance
  ? `<div class="banner maint" role="status">${icon('wrench')}<span><b>Maintenance.</b> New rounds are paused for a moment. Open rounds can still be cashed out.${site.announcement ? ` ${esc(site.announcement.text)}` : ''}</span></div>`
  : site.announcement ? `<div class="banner ${site.announcement.tone === 'warn' ? 'warn' : ''}" role="status">${icon(site.announcement.tone === 'warn' ? 'gauge' : 'chat')}<span>${esc(site.announcement.text)}</span></div>` : '';
async function loadSite() {
  site = await api<Site>('GET', '/site').catch(() => site);
  const slot = document.getElementById('banner-slot');
  if (slot) slot.innerHTML = bannerHtml();
  fitAside();
}
let siteEvents: EventSource | null = null;
function watchSite() {
  if (siteEvents) return;
  siteEvents = new EventSource('/api/events');
  siteEvents.addEventListener('site', () => void loadSite());
}

/* Steam sends the player back to /auth/steam/return?…; the API checks the assertion and opens a session. */
async function finishSteamLogin() {
  if (!location.pathname.endsWith('/auth/steam/return')) return;
  const search = location.search;
  history.replaceState(null, '', location.pathname.replace(/\/auth\/steam\/return$/, '/') + '#/');
  const r = await api<{ token: string }>('GET', `/auth/steam/return${search}`).catch((e) => { toast(errorText(e), 'err'); return null; });
  if (r) token.set(r.token);
}

/** Ends the local session (server session already gone or ended) and shows the sign-up page. */
function signOut(message?: string) {
  if (unmountAside) { unmountAside(); unmountAside = null; }
  if (typeof unmount === 'function') unmount();
  unmount = undefined;
  ctx = null;
  token.set(null);
  if (location.hash && location.hash !== '#/') location.hash = '';
  void boot().then(() => { if (message) toast(message); });
}
/* any 401 while signed in: the session expired or was ended elsewhere */
addEventListener('scrapline:unauthorized', () => { if (ctx) signOut('Your session has ended. Please sign in again.'); });

async function boot() {
  const cfg = await api<PublicConfig>('GET', '/config').catch((e) => { renderFatal(e); throw e; });
  await loadSite();
  watchSite();
  await finishSteamLogin();
  if (!token.get()) return renderGate(cfg);
  try {
    const me = await api<Me>('GET', '/me');
    ctx = { cfg, me, refresh, rerender: () => { renderShell(); route(); }, signOut };
    renderShell();
    route();
  } catch (e) {
    if (e instanceof RequestError && e.status === 401) return renderGate(cfg);
    renderFatal(e);
  }
}

function renderFatal(e: unknown) {
  const geo = e instanceof RequestError && e.status === 451;
  app.innerHTML = `<div style="max-width:520px;margin:12vh auto;padding:0 16px"><div class="card">
    <p class="eyebrow">${geo ? 'Not available' : 'No connection'}</p><h1 class="h-display">SCRAPLINE</h1>
    <p class="muted">${esc(geo ? errorText(e) : 'The server cannot be reached. Is platform/server running (npm start)?')}</p>
    <div><button class="btn" id="retry" type="button">Try again</button></div></div></div>`;
  $('#retry').addEventListener('click', () => boot());
}

/* ---------- sign-up gate (18+) ---------- */
function renderGate(cfg: PublicConfig) {
  app.innerHTML = `
  <div class="gate">
    <section class="brand">
      <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
      <a class="logo" href="#/">${LOGO_MARK}<span>SCRAPLINE</span></a>
      <div style="display:flex;flex-direction:column;gap:12px">
        <p class="eyebrow">Play-money demo · 18+</p>
        <h1>Every round with an <em>open blueprint.</em></h1>
        <p class="muted" style="max-width:48ch">Rust originals with published maths. Every outcome can be recomputed from its seeds, and the limits are yours to set.</p>
      </div>
      <div class="drawing">${heroSheet()}</div>
      <ul class="facts"><li><b>${GAMES.length}</b>games with a proof</li><li><b>100 %</b>of rounds verifiable</li><li><b>${cfg.responsibleGambling.limitIncreaseDelayHours} h</b>before a higher limit applies</li></ul>
    </section>
    <form class="card" id="gate" novalidate>
      <div><p class="eyebrow">Demo account</p><h2 class="h-sect" style="font-size:22px">Start playing</h2></div>
      ${site.registrationOpen ? '' : '<p class="status lose">New sign-ups are paused right now. Please try again later.</p>'}
      ${bannerHtml()}
      <label class="field">Display name<input id="name" autocomplete="nickname" maxlength="24" required placeholder="e.g. Rust Rat"></label>
      <label class="check"><input type="checkbox" id="age"> <span>I am at least 18 years old. I understand that gambling can be addictive.</span></label>
      <button class="btn block" type="submit">Create account · ${frags(cfg.demoStartBalance ?? 0, 0)} Frags play money</button>
      ${cfg.demo ? '' : `<button class="btn ghost block" type="button" id="steam">Sign in with Steam</button>`}
      <p class="muted" style="font-size:13px">Play money has no cash value and cannot be withdrawn.${cfg.demo ? ' Real money only comes with a licence.' : ''}</p>
    </form>
    <p class="help">Help with gambling problems: ${HELP_LINES}</p>
  </div>`;
  document.getElementById('steam')?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
    if (!$<HTMLInputElement>('#age').checked) { toast('Please confirm that you are at least 18 years old.', 'err'); return; }
    location.href = (await api<{ url: string }>('GET', '/auth/steam')).url;
  }));
  $('#gate').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $<HTMLButtonElement>('#gate button');
    const res = await guard(btn, () => api<{ token: string }>('POST', '/auth/demo', { displayName: $<HTMLInputElement>('#name').value, ageConfirmed: $<HTMLInputElement>('#age').checked }));
    if (res) { token.set(res.token); boot(); }
  });
}

/* ---------- shell ---------- */
const chatPref = () => { try { const v = localStorage.getItem(CHAT_KEY); return v === null ? innerWidth >= 1440 : v === '1'; } catch { return innerWidth >= 1440; } };
const setChatPref = (on: boolean) => { try { localStorage.setItem(CHAT_KEY, on ? '1' : '0'); } catch { /* storage blocked */ } };

function renderShell() {
  const c = ctx!;
  if (unmountAside) { unmountAside(); unmountAside = null; }
  const showAdmin = c.cfg.demo || c.me.role !== 'player';
  app.innerHTML = `
  <div id="banner-slot">${bannerHtml()}</div>
  <div class="shell">
    <header class="topbar">
      <a class="logo" href="#/">${LOGO_MARK}<span>SCRAPLINE</span></a>
      <nav class="mainnav" aria-label="Main">${MAIN_NAV.map(([p, l]) => `<a href="#/${p}" data-path="${p}">${l}</a>`).join('')}</nav>
      <div class="spacer"></div>
      <div class="sessionbar" title="Play time and result of this session">${icon('clock')}<span class="lbl">Session</span><b id="s-time">00:00</b><span class="lbl">Net</span><b id="s-net">±0.00</b></div>
      <div class="wallet"><span class="bal"><span class="tag-demo">DEMO</span><span id="balance">${frags(c.me.balance)}</span><small>Frags</small></span>${c.cfg.demo ? '<button type="button" class="hide-s" data-refill>Refill</button>' : ''}</div>
      <button class="iconbtn hide-s" id="chat-toggle" type="button" aria-pressed="false" aria-label="Show chat">${icon('chat')}</button>
      <div class="menuwrap">
        <button class="iconbtn" id="acct" type="button" aria-expanded="false" aria-haspopup="menu" aria-label="Account">${icon('user')}</button>
        <div class="menu" id="acct-menu" role="menu" hidden>
          <div class="who"><b>${esc(c.me.displayName)}</b><span id="level">Level ${c.me.level}</span><span> · ${esc(c.me.role)}</span></div>
          <a role="menuitem" href="#/profile">${icon('user')}Profile</a>
          <a role="menuitem" href="#/wallet">${icon('pot')}Wallet</a>
          <a role="menuitem" href="#/history">${icon('clock')}History</a>
          <a role="menuitem" href="#/rewards">${icon('trophy')}Rewards</a>
          <a role="menuitem" href="#/limits">${icon('gauge')}Limits &amp; breaks</a>
          <a role="menuitem" href="#/fair">${icon('shield')}Provably fair</a>
          <a role="menuitem" href="#/verify">${icon('target')}Verifier</a>
          <a role="menuitem" href="#/chat">${icon('chat')}Chat</a>
          ${showAdmin ? `<a role="menuitem" href="#/admin">${icon('wrench')}Backoffice</a>` : ''}
          <hr>
          ${c.cfg.demo ? `<button role="menuitem" type="button" data-refill>${icon('upgrade')}Refill demo balance</button>` : ''}
          <button role="menuitem" type="button" id="logout">${icon('user')}Sign out</button>
        </div>
      </div>
    </header>
    <nav class="gamebar" aria-label="Games">${CATEGORIES.map(([cat, label], i) => `${i ? '<span class="sep" aria-hidden="true"></span>' : ''}<span class="cat">${label}</span>${GAMES.filter((g) => g.cat === cat)
      .map((g) => `<a class="gchip" href="#/${g.path}" data-path="${g.path}" data-game="${g.id}">${icon(g.icon)}${g.name}${g.tag === 'LIVE' ? '<em>LIVE</em>' : ''}</a>`).join('')}`).join('')}</nav>
    <div class="layout" id="layout">
      <main id="view" tabindex="-1"></main>
      <aside class="chatside" id="chatside" hidden></aside>
    </div>
    <footer class="sitefoot">
      <div class="sf-top"><a class="logo" href="#/">${LOGO_MARK}<span>SCRAPLINE</span></a>
        <nav aria-label="Footer">${FOOT_NAV.map(([p, l]) => `<a href="#/${p}">${l}</a>`).join('')}</nav></div>
      <p><span class="age">18+</span> ${c.cfg.demo ? 'Play-money demo: Frags have no cash value and cannot be withdrawn.' : 'Licensed real-money play.'} Gambling can be addictive. Help: ${HELP_LINES}</p>
    </footer>
    <nav class="bottomnav" aria-label="Navigation">${BOTTOM_NAV.map(([p, l, ic]) => `<a href="#/${p}" data-path="${p}">${icon(ic)}${l}</a>`).join('')}</nav>
  </div>`;

  $$<HTMLButtonElement>('[data-refill]').forEach((b) => b.addEventListener('click', () => guard(b, async () => { closeMenu(); await api('POST', '/demo/refill'); await refresh(); toast('Demo balance refilled.'); })));
  $('#logout').addEventListener('click', async () => {
    await api('POST', '/auth/logout').catch(() => null);
    signOut();
  });
  const acct = $<HTMLButtonElement>('#acct');
  acct.addEventListener('click', (e) => { e.stopPropagation(); $('#acct-menu').hidden ? openMenu() : closeMenu(); });
  $('#chat-toggle').addEventListener('click', () => {
    if (!WIDE.matches) { location.hash = '#/chat'; return; } // no room for a side panel: open the chat page
    setChatPref(!chatPref()); syncAside();
  });
  api<{ game: string; enabled: boolean }[]>('GET', '/games/status').then((list) => {
    for (const g of list) document.querySelector(`.gchip[data-game="${g.game}"]`)?.classList.toggle('paused', !g.enabled);
  }).catch(() => null);
  paintSession();
  scheduleRealityCheck();
  syncAside();
}

function openMenu() {
  $('#acct-menu').hidden = false;
  $('#acct').setAttribute('aria-expanded', 'true');
  ($('#acct-menu a, #acct-menu button') as HTMLElement | null)?.focus();
}
function closeMenu() {
  const m = document.getElementById('acct-menu');
  if (!m || m.hidden) return;
  m.hidden = true;
  $('#acct').setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest?.('#acct-menu')) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

/* Chat aside: shown on wide screens when the player has it switched on and the chat is not already the main view. */
function syncAside() {
  const aside = document.getElementById('chatside');
  const layout = document.getElementById('layout');
  if (!ctx || !aside || !layout) return;
  const on = chatPref();
  const want = WIDE.matches && on && !location.hash.startsWith('#/chat');
  aside.hidden = !want;
  layout.classList.toggle('with-chat', want);
  const toggle = document.getElementById('chat-toggle');
  toggle?.setAttribute('aria-pressed', String(on && WIDE.matches));
  toggle?.setAttribute('aria-label', on ? 'Hide chat' : 'Show chat');
  if (want && !unmountAside) { aside.innerHTML = chatPanelHtml('chat-aside'); unmountAside = mountChatPanel($('#chat-aside'), ctx); }
  if (!want && unmountAside) { unmountAside(); unmountAside = null; aside.innerHTML = ''; }
  fitAside();
}
WIDE.addEventListener('change', syncAside);
/* Keeps the sticky chat exactly as tall as the visible space below the top bar and the game bar. */
function fitAside() {
  const aside = document.getElementById('chatside');
  const bar = document.querySelector<HTMLElement>('.topbar');
  const games = document.querySelector<HTMLElement>('.gamebar');
  if (!aside || !bar || aside.hidden) return;
  const stick = bar.offsetHeight + (games?.offsetHeight ?? 0);
  aside.style.setProperty('--stick', `${stick}px`);
  aside.style.height = `${Math.max(320, innerHeight - Math.max(stick, aside.getBoundingClientRect().top))}px`;
}
addEventListener('scroll', fitAside, { passive: true });
addEventListener('resize', fitAside);

async function refresh() {
  if (!ctx) return;
  const before = ctx.me.balance;
  ctx.me = await api<Me>('GET', '/me');
  paintBalance(before, ctx.me.balance);
  $('#level').textContent = `Level ${ctx.me.level}`;
  paintSession();
  scheduleRealityCheck();
}

/* Balance: counts to the new value; the wallet glows green on a gain. */
let walletFx = 0;
function paintBalance(from: number, to: number) {
  const el = document.getElementById('balance');
  const wallet = el?.closest('.wallet');
  if (!el || !wallet) return;
  animateNumber(el, from, to, (n) => frags(n));
  if (to === from) return;
  wallet.classList.remove('up', 'down');
  void (wallet as HTMLElement).offsetWidth;
  wallet.classList.add(to > from ? 'up' : 'down');
  clearTimeout(walletFx);
  walletFx = window.setTimeout(() => wallet.classList.remove('up', 'down'), 1100);
}

/* Spotlight: cards light up where the pointer is (CSS reads --mx / --my). */
const SPOT = '.tile, .case, .bcase, .bcard, .live-card';
let spotFrame = 0;
document.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || spotFrame) return;
  spotFrame = requestAnimationFrame(() => {
    spotFrame = 0;
    const el = (e.target as Element | null)?.closest?.<HTMLElement>(SPOT);
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
}, { passive: true });

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
    const m = modal(`<p class="eyebrow">Reality check</p><h2 class="h-sect" style="font-size:20px">You have been playing for ${Math.round(s.elapsedMs / 60000)} minutes</h2>
      <p>Wagered this session: <b class="num">${frags(s.wagered)}</b> Frags · Result: <b class="num ${s.net < 0 ? 'neg' : 'pos'}">${s.net > 0 ? '+' : ''}${frags(s.net)}</b> Frags · ${s.bets} bets.</p>
      <div class="row"><button class="btn" data-a="go" type="button">Keep playing</button><a class="btn ghost" href="#/limits" data-a="limits">Limits &amp; breaks</a></div>`);
    m.root.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { m.close(); scheduleRealityCheck(); }));
  }, Math.min(wait, 2 ** 31 - 1));
}

/* Breadcrumb and published figures on every game page, from the shared game list. */
function decorateGame(root: HTMLElement, path: string) {
  const g = gameByPath(path);
  const h1 = root.querySelector('h1.h-display');
  if (!g || !h1) return;
  const box = h1.parentElement!;
  const cat = CATEGORIES.find(([k]) => k === g.cat)![1];
  box.insertAdjacentHTML('afterbegin', `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Lobby</a><span aria-hidden="true">/</span><span>${cat}</span></nav>`);
  const desc = [...box.children].find((el) => el.tagName === 'P' && !el.classList.contains('eyebrow') && (h1.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
  (desc ?? h1).insertAdjacentHTML('afterend', `<div class="specs"><span class="spec rtp">RTP <b>${g.rtp}</b></span><span class="spec">House edge <b>${g.edge}</b></span><a class="spec" href="#/fair">${icon('shield')}Proof on every round</a></div>`);
}

/* ---------- router ---------- */
function route() {
  if (!ctx) return;
  closeMenu();
  const raw = location.hash.replace(/^#\/?/, '').split('?')[0];
  const path = raw in VIEWS ? raw : '';
  const view = raw in VIEWS ? VIEWS[raw] : notFoundView;
  $$<HTMLAnchorElement>('[data-path]').forEach((a) => {
    if (a.dataset.path === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.querySelector('.gchip[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (typeof unmount === 'function') unmount();
  const root = $('#view');
  root.innerHTML = view.html(ctx);
  decorateGame(root, path);
  // entrance: the view's sections rise in one after another
  [...root.children].forEach((el, i) => (el as HTMLElement).style.setProperty('--i', String(Math.min(i, 8))));
  root.classList.remove('enter');
  void root.offsetWidth;
  root.classList.add('enter');
  document.title = `${view.title} · SCRAPLINE`;
  unmount = view.mount?.(root, ctx);
  syncAside();
  root.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', route);
boot();
