import { type Me, type PublicConfig, RequestError, api, token } from './api';
import { SPRITE, icon } from './icons';
import { $, errorText, esc, frags, guard, modal, toast } from './ui';
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
import { upgraderView } from './views/upgrader';

export interface Ctx {
  cfg: PublicConfig;
  me: Me;
  /** Reloads /me and repaints balance + session bar. Call after every bet. */
  refresh: () => Promise<void>;
}
export interface View { title: string; html: (c: Ctx) => string; mount?: (root: HTMLElement, c: Ctx) => void | (() => void) }

const NAV: { path: string; label: string; icon: string; tag?: string; view: View }[] = [
  { path: '', label: 'Werkstatt', icon: 'home', view: lobbyView },
  { path: 'raid', label: 'Raid', icon: 'raid', tag: 'NEU', view: raidView },
  { path: 'kisten', label: 'Kisten', icon: 'crate', view: casesView },
  { path: 'battle', label: 'Kisten-Battle', icon: 'battle', view: battleView },
  { path: 'schrottpresse', label: 'Schrottpresse', icon: 'crash', tag: 'LIVE', view: crashView },
  { path: 'muenzwurf', label: 'Münzwurf', icon: 'coin', view: coinflipView },
  { path: 'minenfeld', label: 'Minenfeld', icon: 'mine', view: minesView },
  { path: 'wuerfel', label: 'Würfel', icon: 'dice', view: diceView },
  { path: 'schrottrutsche', label: 'Schrottrutsche', icon: 'plinko', view: plinkoView },
  { path: 'werkbank', label: 'Werkbank', icon: 'upgrade', view: upgraderView },
];
const ACCOUNT: { path: string; label: string; icon: string; view: View }[] = [
  { path: 'limits', label: 'Limits & Pausen', icon: 'gauge', view: limitsView },
  { path: 'fair', label: 'Provably Fair', icon: 'shield', view: fairView },
  { path: 'verlauf', label: 'Verlauf', icon: 'clock', view: historyView },
];
const ALL = [...NAV, ...ACCOUNT];

const app = $('#app');
document.body.insertAdjacentHTML('afterbegin', SPRITE);
let ctx: Ctx | null = null;
let unmount: (() => void) | void;
let realityTimer = 0;

async function boot() {
  const cfg = await api<PublicConfig>('GET', '/config').catch((e) => { renderFatal(e); throw e; });
  if (!token.get()) return renderGate(cfg);
  try {
    const me = await api<Me>('GET', '/me');
    ctx = { cfg, me, refresh };
    renderShell();
    route();
  } catch (e) {
    if (e instanceof RequestError && e.status === 401) return renderGate(cfg);
    renderFatal(e);
  }
}

function renderFatal(e: unknown) {
  const geo = e instanceof RequestError && e.status === 451;
  app.innerHTML = `<div class="gate"><div class="card"><p class="eyebrow">${geo ? 'Nicht verfügbar' : 'Keine Verbindung'}</p><h1 class="h-display">SCRAP<span style="color:var(--text)">LINE</span></h1><p>${esc(geo ? errorText(e) : 'Der Server ist nicht erreichbar. Läuft platform/server (npm start)?')}</p><button class="btn" id="retry" type="button">Erneut versuchen</button></div></div>`;
  $('#retry').addEventListener('click', () => boot());
}

/* ---------- gate (sign-up with 18+) ---------- */
function renderGate(cfg: PublicConfig) {
  app.innerHTML = `
  <div class="gate">
    <div class="hazard-strip" aria-hidden="true"></div>
    <div>
      <p class="eyebrow">Spielgeld-Demo · ab 18</p>
      <h1 class="h-display" style="color:var(--hazard)">SCRAP<span style="color:var(--text)">LINE</span></h1>
      <p class="muted">Ehrlicher Schrott. Faire Rechnung. Jede Runde lässt sich nachrechnen.</p>
    </div>
    <form class="card" id="gate" novalidate>
      <label class="field">Anzeigename<input id="name" autocomplete="nickname" maxlength="24" required placeholder="z. B. Rust Ratte"></label>
      <label class="check"><input type="checkbox" id="age"> <span>Ich bin mindestens 18 Jahre alt. Mir ist klar, dass Glücksspiel süchtig machen kann.</span></label>
      <button class="btn block" type="submit">Demo starten · ${frags(100000, 0)} Frags Spielgeld</button>
      <p class="muted" style="font-size:13px">Demo-Guthaben hat keinen Geldwert und kann nicht ausgezahlt werden. ${cfg.demo ? 'Echtgeld gibt es erst mit Lizenz.' : ''}</p>
    </form>
    <p class="muted" style="font-size:13px">Hilfe bei Glücksspielproblemen: <a href="https://www.begambleaware.org" target="_blank" rel="noopener">BeGambleAware</a> · <a href="https://www.check-dein-spiel.de" target="_blank" rel="noopener">check-dein-spiel.de</a></p>
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
  const link = (n: (typeof ALL)[number] & { tag?: string }) => `<a class="nav" href="#/${n.path}" data-path="${n.path}">${icon(n.icon)}<span>${n.label}</span>${n.tag ? `<em>${n.tag}</em>` : ''}</a>`;
  app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <a class="logo" href="#/">${icon('wrench')}SCRAP<span>LINE</span></a>
      <div class="spacer"></div>
      <div class="sessionbar" title="Spielzeit und Ergebnis dieser Sitzung">${icon('clock')}<span class="hide-s">Sitzung</span> <b id="s-time">00:00</b> <span class="hide-s">Netto</span> <b id="s-net">±0,00</b></div>
      <div class="pill"><span class="tag-demo">DEMO</span><span class="num" id="balance">${frags(c.me.balance)}</span><span class="hide-s muted">Frags</span></div>
      <button class="btn ghost small hide-s" id="refill" type="button">Nachschub</button>
      <button class="btn ghost small" id="logout" type="button" aria-label="Abmelden">${icon('user')}</button>
    </header>
    <nav class="side" aria-label="Spiele">
      <h4>Spiele</h4>${NAV.map(link).join('')}
      <h4>Konto</h4>${ACCOUNT.map(link).join('')}
    </nav>
    <main id="view" tabindex="-1"></main>
    <nav class="bottomnav" aria-label="Navigation">
      ${([[ALL[0], 'Start'], [ALL[1], 'Raid'], [ALL[4], 'Presse'], [ALL[NAV.length], 'Limits'], [ALL[NAV.length + 1], 'Fair']] as const).map(([n, l]) => `<a href="#/${n.path}" data-path="${n.path}">${icon(n.icon)}${l}</a>`).join('')}
    </nav>
  </div>`;
  $('#refill').addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => { await api('POST', '/demo/refill'); await refresh(); toast('Demo-Guthaben aufgefüllt.'); }));
  $('#logout').addEventListener('click', async () => { await api('POST', '/auth/logout').catch(() => null); token.set(null); location.hash = ''; boot(); });
  paintSession();
  scheduleRealityCheck();
}

async function refresh() {
  if (!ctx) return;
  ctx.me = await api<Me>('GET', '/me');
  $('#balance').textContent = frags(ctx.me.balance);
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
    const m = modal(`<p class="eyebrow">Reality-Check</p><h2 class="h-sect">Du spielst seit ${Math.round(s.elapsedMs / 60000)} Minuten</h2>
      <p>Einsatz in dieser Sitzung: <b class="num">${frags(s.wagered)}</b> Frags · Ergebnis: <b class="num ${s.net < 0 ? 'neg' : 'pos'}">${s.net > 0 ? '+' : ''}${frags(s.net)}</b> Frags · ${s.bets} Wetten.</p>
      <div class="row"><button class="btn" data-a="go" type="button">Weiterspielen</button><a class="btn ghost" href="#/limits" data-a="limits">Limits &amp; Pause</a></div>`);
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
  root.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', route);
boot();
