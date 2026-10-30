import { type Me, type PublicConfig, RequestError, api, token } from './api';
import { LOGO_MARK } from './art';
import { chatPanelHtml, chatView, mountChatPanel } from './chatpanel';
import { CATEGORIES, GAMES, gameByPath } from './games';
import { SPRITE, icon } from './icons';
import { setItemIcons } from './loot-art';
import { $, $$, SCRAP_SYM, animateNumber, errorText, esc, frags, guard, modal, scrap, toast } from './ui';
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
import { sceneArt } from './scene';
import { profileView } from './views/profile';
import { verifyView } from './views/verify';
import { walletView } from './views/wallet';
import { depositView, withdrawView } from './views/skins';
import { cratesView } from './views/crates';

export interface Ctx {
  cfg: PublicConfig;
  me: Me;
  /** Reloads /me and repaints balance + session bar. Call after every bet. */
  refresh: () => Promise<void>;
  /** Rebuilds the shell (navigation depends on the role) and the current view. */
  rerender: () => void;
  /** Ends the local session and returns to the guest lobby, with a message. */
  signOut: (message?: string) => void;
  /** Visitor without an account: the lobby and public pages work, everything else asks to sign up. */
  guest: boolean;
  /** Opens the sign-up sheet (18+ confirmation, display name). */
  openSignup: () => void;
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
  deposit: depositView, withdraw: withdrawView, crates: cratesView,
};
const MAIN_NAV: [string, string, string][] = [['rewards', 'Rewards', 'trophy'], ['fair', 'Provably fair', 'shield'], ['help', 'Help', 'chat']];
/** What a visitor without an account can open; every other route asks to sign up first. */
const GUEST_ROUTES = new Set(['', 'help', 'terms', 'privacy', 'verify', 'chat', 'crates']);
const FOOT_NAV: [string, string][] = [['fair', 'Provably fair'], ['verify', 'Verifier'], ['crates', 'Crate odds'], ['limits', 'Responsible play'], ['help', 'Help'], ['terms', 'Terms'], ['privacy', 'Privacy']];
/** Wide enough for the chat column on the left. */
const WIDE = matchMedia('(min-width: 1100px)');
const CHAT_KEY = 'scrapline.chat';

const app = $('#app');
document.body.insertAdjacentHTML('afterbegin', SPRITE);
let ctx: Ctx | null = null;
let unmount: (() => void) | void;
let realityTimer = 0;
let unmountAside: (() => void) | null = null;
let shownPath: string | null = null;

/** Context values for a visitor: nothing personal, nothing that could be spent. */
const GUEST_ME: Me = {
  id: '', displayName: 'Guest', steamLinked: false, kycLevel: 0, balance: 0, level: 0,
  seed: { serverSeedHash: '', clientSeed: '', nextNonce: 0 },
  session: { startedAt: Date.now(), elapsedMs: 0, bets: 0, wagered: 0, net: 0, realityCheckMinutes: 0, nextRealityCheckAt: Number.MAX_SAFE_INTEGER },
  block: null, promoEligible: false, role: 'player', mfa: { enrolled: false, fresh: false, required: false },
};

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

/** Ends the local session (server session already gone or ended) and shows the guest lobby. */
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
  setItemIcons(cfg.itemIcons);
  await loadSite();
  watchSite();
  await finishSteamLogin();
  if (!token.get()) return startGuest(cfg);
  try {
    const me = await api<Me>('GET', '/me');
    ctx = { cfg, me, refresh, rerender: () => { renderShell(); route(); }, signOut, guest: false, openSignup };
    renderShell();
    route();
  } catch (e) {
    if (e instanceof RequestError && e.status === 401) return startGuest(cfg);
    renderFatal(e);
  }
}

function startGuest(cfg: PublicConfig) {
  ctx = { cfg, me: { ...GUEST_ME, session: { ...GUEST_ME.session, startedAt: Date.now() } }, refresh: async () => undefined, rerender: () => { renderShell(); route(); }, signOut, guest: true, openSignup };
  renderShell();
  route();
}

function renderFatal(e: unknown) {
  const geo = e instanceof RequestError && e.status === 451;
  app.innerHTML = `<div style="max-width:520px;margin:12vh auto;padding:0 16px"><div class="card">
    <p class="eyebrow">${geo ? 'Not available' : 'No connection'}</p><h1 class="h-display">SCRAPLINE</h1>
    <p class="muted">${esc(geo ? errorText(e) : 'The server cannot be reached. Is platform/server running (npm start)?')}</p>
    <div><button class="btn" id="retry" type="button">Try again</button></div></div></div>`;
  $('#retry').addEventListener('click', () => boot());
}

/* ---------- sign-up sheet (18+) ---------- */
function openSignup() {
  const cfg = ctx?.cfg;
  if (!cfg || document.getElementById('gate')) return;
  const m = modal(`<form class="signup" id="gate" novalidate>
      <div class="su-head"><a class="logo" href="#/">${LOGO_MARK}<span>SCRAPLINE</span></a><button class="iconbtn" type="button" data-close aria-label="Close">✕</button></div>
      <div><p class="eyebrow">${cfg.demo ? 'Play-money demo' : 'Account'} · 18+</p><h2 class="su-title">Every round with an <em>open blueprint.</em></h2></div>
      <ul class="su-facts"><li><b>${GAMES.length}</b>games with a proof</li>${cfg.demo ? `<li><b>${scrap(cfg.demoStartBalance ?? 0, 0)}</b>Scrap to start</li>` : '<li><b>Steam</b>sign-in, skins in and out</li>'}<li><b>100 %</b>rounds verifiable</li></ul>
      ${site.registrationOpen ? '' : '<p class="status lose">New sign-ups are paused right now. Please try again later.</p>'}
      <label class="check"><input type="checkbox" id="age"> <span>I am at least 18 years old. I understand that gambling can be addictive.</span></label>
      ${cfg.steamLogin ? `<button class="btn block steam-btn" type="button" id="steam">${icon('user')} Sign in with Steam</button>
        <p class="muted" style="font-size:12px;margin-top:-6px">Your Steam name and avatar become your profile. We never see your Steam password.</p>` : ''}
      ${cfg.demo ? `${cfg.steamLogin ? '<p class="su-or"><span>or play with a name</span></p>' : ''}
      <label class="field">Display name<input id="name" autocomplete="nickname" maxlength="24" required placeholder="e.g. Rust Rat"></label>
      <button class="btn ${cfg.steamLogin ? 'ghost ' : ''}block" type="submit" data-create>Create account · ${scrap(cfg.demoStartBalance ?? 0, 0)} play money</button>`
      : cfg.steamLogin ? '' : '<p class="muted">Sign-up opens soon.</p>'}
      <p class="muted" style="font-size:12px">${cfg.demo ? 'Play money has no cash value and cannot be withdrawn. ' : ''}Help with gambling problems: ${HELP_LINES}</p>
    </form>`);
  m.root.classList.add('sheet');
  m.root.querySelector('[data-close]')?.addEventListener('click', m.close);
  (m.root.querySelector<HTMLInputElement>('#name') ?? m.root.querySelector<HTMLInputElement>('#age'))?.focus();
  document.getElementById('steam')?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
    if (!$<HTMLInputElement>('#age').checked) { toast('Please confirm that you are at least 18 years old.', 'err'); return; }
    location.href = (await api<{ url: string }>('GET', '/auth/steam')).url;
  }));
  $('#gate').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.querySelector<HTMLButtonElement>('#gate [data-create]');
    if (!btn) return; // real-money site: Steam sign-in only
    const res = await guard(btn, () => api<{ token: string }>('POST', '/auth/demo', { displayName: $<HTMLInputElement>('#name').value, ageConfirmed: $<HTMLInputElement>('#age').checked }));
    if (!res) return;
    m.close();
    token.set(res.token);
    if (typeof unmount === 'function') unmount();
    unmount = undefined;
    if (unmountAside) { unmountAside(); unmountAside = null; }
    await boot();
    toast(`Welcome, ${$<HTMLElement>('#acct-menu .who b')?.textContent ?? 'player'}.${cfg.demo ? ' Your play money is ready.' : ''}`);
  });
}

/* ---------- shell ---------- */
const chatPref = () => { try { return localStorage.getItem(CHAT_KEY) !== '0'; } catch { return true; } };
const setChatPref = (on: boolean) => { try { localStorage.setItem(CHAT_KEY, on ? '1' : '0'); } catch { /* storage blocked */ } };

function renderShell() {
  const c = ctx!;
  if (unmountAside) { unmountAside(); unmountAside = null; }
  shownPath = null;
  const showAdmin = !c.guest && (c.cfg.demo || c.me.role !== 'player');
  const account = c.guest
    ? `<button class="btn cta" type="button" data-signup>${icon('user')}<span>${c.cfg.demo ? 'Sign up<span class="hide-xs"> · play free</span>' : 'Sign in<span class="hide-xs"> with Steam</span>'}</span></button>
      <button class="iconbtn hide-s" id="chat-toggle" type="button" aria-pressed="false" aria-label="Show chat">${icon('chat')}</button>`
    : `<div class="wallet"><span class="bal">${c.cfg.demo ? '<span class="tag-demo">DEMO</span>' : ''}${SCRAP_SYM}<span id="balance">${frags(c.me.balance)}</span></span>${c.cfg.demo ? '<button type="button" class="hide-s" data-refill>Refill</button>' : ''}<a class="wallet-plus" href="#/wallet" aria-label="Wallet">+</a></div>
      <button class="iconbtn hide-s" id="chat-toggle" type="button" aria-pressed="false" aria-label="Show chat">${icon('chat')}</button>
      <div class="menuwrap hide-s">
        <button class="iconbtn ${avatar(c) ? 'has-avatar' : ''}" id="acct" type="button" aria-expanded="false" aria-haspopup="menu" aria-label="Account">${avatar(c) || icon('user')}</button>
        <div class="menu" id="acct-menu" role="menu" hidden>
          <div class="who"><b>${esc(c.me.displayName)}</b><span id="level">Level ${c.me.level}</span><span> · ${esc(c.me.role)}</span></div>
          <a role="menuitem" href="#/profile">${icon('user')}Profile</a>
          <a role="menuitem" href="#/wallet">${icon('pot')}Wallet</a>
          ${c.cfg.skins?.enabled ? `<a role="menuitem" href="#/deposit">${icon('crate')}Deposit skins</a><a role="menuitem" href="#/withdraw">${icon('upgrade')}Withdraw skins</a>` : ''}
          <a role="menuitem" href="#/history">${icon('clock')}History</a>
          <a role="menuitem" href="#/rewards">${icon('trophy')}Rewards</a>
          <a role="menuitem" href="#/limits">${icon('gauge')}Limits &amp; breaks</a>
          <a role="menuitem" href="#/fair">${icon('shield')}Provably fair</a>
          <a role="menuitem" href="#/verify">${icon('target')}Verifier</a>
          <a role="menuitem" href="#/chat">${icon('chat')}Chat</a>
          ${showAdmin ? `<a role="menuitem" href="#/admin">${icon('wrench')}Backoffice</a>` : ''}
          <hr>
          ${c.cfg.demo ? `<button role="menuitem" type="button" data-refill>${icon('upgrade')}Refill demo balance</button>` : ''}
          <button role="menuitem" type="button" data-logout>${icon('user')}Sign out</button>
        </div>
      </div>`;
  const bottom: [string, string, string, string][] = [
    ['games', 'Games', 'dice', ''], ['chat', 'Chat', 'chat', '#/chat'],
    ['free', 'Free Scrap', 'trophy', '#/rewards'], ['me', c.guest ? 'Sign up' : 'Account', 'user', '#/profile'],
  ];
  app.innerHTML = `
  <div class="scene" aria-hidden="true">${sceneArt()}</div>
  <div id="banner-slot">${bannerHtml()}</div>
  <div class="shell ${c.guest ? 'guest' : ''}">
    <header class="topbar">
      <a class="logo" href="#/">${LOGO_MARK}<span>SCRAPLINE</span></a>
      <button class="iconbtn burger" type="button" id="burger" aria-expanded="false" aria-controls="drawer" aria-label="Menu"><span></span><span></span><span></span></button>
      <nav class="mainnav" aria-label="Main">
        <div class="menuwrap"><button class="navbtn" id="games-btn" type="button" aria-expanded="false" aria-haspopup="true" aria-controls="games-menu">${icon('dice')}Games<span class="caret" aria-hidden="true">▾</span></button>
          <div class="menu games-menu" id="games-menu" hidden>${CATEGORIES.map(([cat, label]) => `<div class="gm-col"><p class="gm-cat">${label}</p>${GAMES.filter((g) => g.cat === cat)
            .map((g) => `<a class="gm-game" href="#/${g.path}" data-path="${g.path}" data-game="${g.id}">${icon(g.icon)}<span>${g.name}</span>${g.tag === 'LIVE' ? '<em class="live-dot" title="Live"></em>' : g.tag === 'NEW' ? '<em class="gm-new">NEW</em>' : ''}</a>`).join('')}</div>`).join('')}</div></div>
        ${MAIN_NAV.map(([p, l, ic]) => `<a href="#/${p}" data-path="${p}">${icon(ic)}${l}</a>`).join('')}
      </nav>
      <div class="spacer"></div>
      ${c.guest ? '' : `<div class="sessionbar" title="Play time and result of this session">${icon('clock')}<span class="lbl">Session</span><b id="s-time">00:00</b><span class="lbl">Net</span><b id="s-net">±0.00</b></div>`}
      ${account}
    </header>
    <div class="layout" id="layout">
      <aside class="chatside" id="chatside" hidden></aside>
      <main id="view" tabindex="-1"></main>
    </div>
    <footer class="sitefoot">
      <div class="sf-top"><a class="logo" href="#/">${LOGO_MARK}<span>SCRAPLINE</span></a>
        <nav aria-label="Footer">${FOOT_NAV.map(([p, l]) => `<a href="#/${p}">${l}</a>`).join('')}</nav></div>
      <p><span class="age">18+</span> ${c.cfg.demo ? 'Play-money demo: Scrap has no cash value and cannot be withdrawn.' : 'Licensed real-money play.'} Gambling can be addictive. Help: ${HELP_LINES}</p>
      <p class="sf-legal">SCRAPLINE is not affiliated with, endorsed by or in any way associated with Rust, Facepunch Studios, Steam or Valve. Rust item and skin names identify the items only; all brands belong to their owners. The drawings on this site are our own.</p>
    </footer>
    <nav class="bottomnav" aria-label="Navigation">${bottom.map(([k, l, ic, href]) => k === 'games'
      ? `<button type="button" data-drawer="games">${icon(ic)}${l}</button>`
      : `<a href="${href}" data-bottom="${k}" ${k === 'chat' ? 'data-path="chat"' : k === 'free' ? 'data-path="rewards"' : 'data-path="profile"'}>${icon(ic)}${l}</a>`).join('')}</nav>
  </div>
  <div class="drawer-back" id="drawer-back" hidden></div>
  <aside class="drawer" id="drawer" aria-label="Menu" hidden>${drawerHtml(c, showAdmin)}</aside>`;

  $$<HTMLButtonElement>('[data-refill]').forEach((b) => b.addEventListener('click', () => guard(b, async () => { closeMenu(); closeDrawer(); await api('POST', '/demo/refill'); await refresh(); toast('Demo balance refilled.'); })));
  $$<HTMLButtonElement>('[data-logout]').forEach((b) => b.addEventListener('click', async () => {
    closeDrawer();
    await api('POST', '/auth/logout').catch(() => null);
    signOut('Signed out.');
  }));
  $$<HTMLElement>('[data-signup]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); closeDrawer(); openSignup(); }));
  document.getElementById('acct')?.addEventListener('click', (e) => { e.stopPropagation(); $('#acct-menu').hidden ? openMenu() : closeMenu(); });
  document.getElementById('games-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const m = $('#games-menu');
    closeMenu();
    m.hidden = !m.hidden;
    $('#games-btn').setAttribute('aria-expanded', String(!m.hidden));
  });
  document.getElementById('chat-toggle')?.addEventListener('click', () => {
    if (!WIDE.matches) { location.hash = '#/chat'; return; } // no room for a side panel: open the chat page
    setChatPref(!chatPref()); syncAside();
  });
  $('#burger').addEventListener('click', () => ($('#drawer').hidden ? openDrawer() : closeDrawer()));
  $$<HTMLButtonElement>('[data-drawer]').forEach((b) => b.addEventListener('click', () => openDrawer(b.dataset.drawer)));
  $('#drawer-back').addEventListener('click', closeDrawer);
  $$<HTMLAnchorElement>('#drawer a').forEach((a) => a.addEventListener('click', closeDrawer));
  $('#drawer [data-close]')?.addEventListener('click', closeDrawer);
  if (c.guest) $$<HTMLAnchorElement>('[data-bottom="me"], [data-bottom="free"]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openSignup(); }));
  api<{ game: string; enabled: boolean }[]>('GET', '/games/status').then((list) => {
    for (const g of list) document.querySelectorAll(`.gm-game[data-game="${g.game}"], .dgame[data-game="${g.game}"]`).forEach((el) => el.classList.toggle('paused', !g.enabled));
  }).catch(() => null);
  paintSession();
  scheduleRealityCheck();
  syncAside();
}

/** The Steam avatar (only Steam's image CDN is accepted by the API and the CSP). */
const avatar = (c: Ctx) => (c.me.steam?.avatarUrl ? `<img class="avatar" src="${esc(c.me.steam.avatarUrl)}" alt="" referrerpolicy="no-referrer">` : '');

/* ---------- drawer (phone menu): every game, the account and the fair-play pages ---------- */
function drawerHtml(c: Ctx, showAdmin: boolean) {
  const link = (href: string, ic: string, label: string, extra = '') => `<a href="${href}">${icon(ic)}<span>${label}</span>${extra}</a>`;
  return `
    <div class="dr-head"><a class="logo" href="#/">${LOGO_MARK}<span>SCRAPLINE</span></a><button class="iconbtn" type="button" data-close aria-label="Close menu">✕</button></div>
    ${c.guest
      ? `<div class="dr-card"><p class="muted">${c.cfg.demo ? `Sign up in ten seconds: ${frags(c.cfg.demoStartBalance ?? 0, 0)} Scrap of play money, every round verifiable.` : 'Sign in with Steam: deposit Rust skins, every round verifiable.'}</p><button class="btn block" type="button" data-signup>${c.cfg.demo ? 'Sign up · play free' : 'Sign in with Steam'}</button></div>`
      : `<div class="dr-card"><div class="dr-me"><span class="${avatar(c) ? 'has-avatar' : ''}">${avatar(c) || icon('user')}</span><div><b>${esc(c.me.displayName)}</b><small class="muted">Level ${c.me.level}</small></div></div>
          <div class="dr-bal"><span class="muted">Balance</span><b class="num">${SCRAP_SYM}<span id="dr-balance">${frags(c.me.balance)}</span></b>${c.cfg.demo ? '<button class="btn small" type="button" data-refill>Refill</button>' : ''}</div></div>`}
    <nav class="dr-sect" id="dr-games" aria-label="Games">${CATEGORIES.map(([cat, label]) => `<p class="dr-cat">${label}</p>${GAMES.filter((g) => g.cat === cat)
      .map((g) => `<a class="dgame" href="#/${g.path}" data-game="${g.id}">${icon(g.icon)}<span>${g.name}</span>${g.tag ? `<em class="${g.tag}">${g.tag === 'SIGNATURE' ? 'TOP' : g.tag}</em>` : ''}</a>`).join('')}`).join('')}</nav>
    ${c.guest ? '' : `<nav class="dr-sect" aria-label="Account"><p class="dr-cat">Account</p>
      ${link('#/profile', 'user', 'Profile')}${link('#/wallet', 'pot', 'Wallet')}${c.cfg.skins?.enabled ? link('#/deposit', 'crate', 'Deposit skins') + link('#/withdraw', 'upgrade', 'Withdraw skins') : ''}${link('#/history', 'clock', 'History')}${link('#/rewards', 'trophy', 'Rewards')}
      ${showAdmin ? link('#/admin', 'wrench', 'Backoffice') : ''}</nav>`}
    <nav class="dr-sect" aria-label="Fair play"><p class="dr-cat">Fair play</p>
      ${c.guest ? '' : link('#/fair', 'shield', 'Provably fair')}${link('#/verify', 'target', 'Verifier')}${link('#/crates', 'crate', 'Crate odds')}${c.guest ? '' : link('#/limits', 'gauge', 'Limits &amp; breaks')}
      ${link('#/help', 'chat', 'Help')}${link('#/terms', 'keycard', 'Terms')}${link('#/privacy', 'shield', 'Privacy')}</nav>
    ${c.guest ? '' : `<div class="dr-sect"><button class="btn ghost block" type="button" data-logout>Sign out</button></div>`}`;
}
function openDrawer(focus?: string) {
  const d = document.getElementById('drawer');
  if (!d) return;
  d.hidden = false;
  $('#drawer-back').hidden = false;
  document.body.classList.add('drawer-open');
  $('#burger').setAttribute('aria-expanded', 'true');
  if (focus === 'games') document.getElementById('dr-games')?.scrollIntoView({ block: 'start' });
  (d.querySelector('[data-close]') as HTMLElement | null)?.focus();
}
function closeDrawer() {
  const d = document.getElementById('drawer');
  if (!d || d.hidden) return;
  d.hidden = true;
  $('#drawer-back').hidden = true;
  document.body.classList.remove('drawer-open');
  $('#burger').setAttribute('aria-expanded', 'false');
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

function openMenu() {
  if (!document.getElementById('acct-menu')) return;
  $('#acct-menu').hidden = false;
  $('#acct').setAttribute('aria-expanded', 'true');
  ($('#acct-menu a, #acct-menu button') as HTMLElement | null)?.focus();
}
function closeMenu() {
  const g = document.getElementById('games-menu');
  if (g && !g.hidden) { g.hidden = true; document.getElementById('games-btn')?.setAttribute('aria-expanded', 'false'); }
  const m = document.getElementById('acct-menu');
  if (!m || m.hidden) return;
  m.hidden = true;
  document.getElementById('acct')?.setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest?.('#acct-menu, #games-menu')) closeMenu(); });
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
  document.querySelector('.shell')?.classList.toggle('chat-on', want);
  const toggle = document.getElementById('chat-toggle');
  toggle?.setAttribute('aria-pressed', String(on && WIDE.matches));
  toggle?.setAttribute('aria-label', on ? 'Hide chat' : 'Show chat');
  if (want && !unmountAside) { aside.innerHTML = chatPanelHtml('chat-aside'); unmountAside = mountChatPanel($('#chat-aside'), ctx); }
  if (!want && unmountAside) { unmountAside(); unmountAside = null; aside.innerHTML = ''; }
  fitAside();
}
WIDE.addEventListener('change', syncAside);
/* Keeps the sticky chat column exactly as tall as the visible space below the top bar. */
function fitAside() {
  const aside = document.getElementById('chatside');
  const bar = document.querySelector<HTMLElement>('.topbar');
  if (!aside || !bar || aside.hidden) return;
  const stick = bar.offsetHeight;
  aside.style.setProperty('--stick', `${stick}px`);
  aside.style.height = `${Math.max(320, innerHeight - Math.max(stick, aside.getBoundingClientRect().top))}px`;
}
addEventListener('scroll', fitAside, { passive: true });
addEventListener('resize', fitAside);

async function refresh() {
  if (!ctx || ctx.guest) return;
  const before = ctx.me.balance;
  ctx.me = await api<Me>('GET', '/me');
  paintBalance(before, ctx.me.balance);
  const lv = document.getElementById('level');
  if (lv) lv.textContent = `Level ${ctx.me.level}`;
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
  const dr = document.getElementById('dr-balance');
  if (dr) dr.textContent = frags(to);
  if (to === from) return;
  wallet.classList.remove('up', 'down');
  void (wallet as HTMLElement).offsetWidth;
  wallet.classList.add(to > from ? 'up' : 'down');
  clearTimeout(walletFx);
  walletFx = window.setTimeout(() => wallet.classList.remove('up', 'down'), 1100);
}

/* Spotlight: cards light up where the pointer is (CSS reads --mx / --my). */
const SPOT = '.tile, .case, .bcase, .bcard, .live-card, .free-card, .win-card';
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
  if (!ctx || ctx.guest) return;
  const draw = () => {
    if (!ctx || !document.getElementById('s-time')) return;
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
  if (!ctx || ctx.guest) return;
  const wait = Math.max(1000, ctx.me.session.nextRealityCheckAt - Date.now());
  realityTimer = window.setTimeout(async () => {
    await refresh().catch(() => null);
    const s = ctx!.me.session;
    const m = modal(`<p class="eyebrow">Reality check</p><h2 class="h-sect" style="font-size:20px">You have been playing for ${Math.round(s.elapsedMs / 60000)} minutes</h2>
      <p>Wagered this session: <b class="num">${frags(s.wagered)}</b> Scrap · Result: <b class="num ${s.net < 0 ? 'neg' : 'pos'}">${s.net > 0 ? '+' : ''}${frags(s.net)}</b> Scrap · ${s.bets} bets.</p>
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
  closeDrawer();
  const raw = location.hash.replace(/^#\/?/, '').split('?')[0];
  // a visitor opening a game or an account page: ask to sign up, stay where they are
  if (ctx.guest && raw in VIEWS && !GUEST_ROUTES.has(raw)) {
    openSignup();
    history.replaceState(null, '', `#/${shownPath ?? ''}`);
    if (shownPath !== null) return;
    return renderView('');
  }
  renderView(raw);
}

function renderView(raw: string) {
  if (!ctx) return;
  shownPath = raw in VIEWS ? raw : null;
  const path = raw in VIEWS ? raw : '';
  const view = raw in VIEWS ? VIEWS[raw] : notFoundView;
  $$<HTMLAnchorElement>('[data-path]').forEach((a) => {
    if (a.dataset.path === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
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
  try {
    unmount = view.mount?.(root, ctx);
  } catch (e) {
    console.error(e); // a broken view must not take the shell down
    unmount = undefined;
  }
  syncAside();
  root.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', route);
boot();
