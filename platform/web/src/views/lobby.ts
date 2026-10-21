import { api } from '../api';
import { gameArt, heroSheet } from '../art';
import { crateArt } from '../loot-art';
import { CATEGORIES, GAMES, type GameMeta, gameName } from '../games';
import { icon } from '../icons';
import type { View } from '../main';
import { $, animateNumber, esc, frags, pct, reducedMotion } from '../ui';

/* Ribbon text on the tall phone tiles (the desktop shows the short tag). */
const RIBBON: Record<string, string> = { NEW: 'New update!', LIVE: 'Live now', SIGNATURE: 'Top pick' };

const tile = (g: GameMeta, i: number) => `
  <a class="tile ${g.tag === 'SIGNATURE' ? 'sig' : ''}" href="#/${g.path}" data-game="${g.id}" data-cat="${g.cat}" style="--t:${i}">
    <div class="art-box">${gameArt(g.id)}</div>
    ${g.tag ? `<span class="flag ${g.tag}"><span class="d-only">${g.tag}</span><span class="m-only">${RIBBON[g.tag]}</span></span>` : ''}
    <span class="paused-tag" hidden>PAUSED</span>
    <div class="body"><b>${g.name}</b><span class="line">${g.line}</span><span class="meta"><span>RTP</span><em>${g.rtp}</em></span></div>
  </a>`;

const corners = '<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>';

/* Phone carousel: our own highlights, each a real page. */
const SLIDES: { href: string; kicker: string; title: string; text: string; cta: string; art: () => string; tone: string }[] = [
  { href: '#/cases', kicker: 'Crate opening', title: 'Twenty crates', text: '$1 to $1,500 · 93 % RTP each', cta: 'Open a crate', art: () => crateArt('gold-egg', 150_000), tone: 'brass' },
  { href: '#/battle', kicker: 'Case Battle', title: 'Bonus battles', text: 'Power rounds, jackpot drops, a final spin', cta: 'Start a battle', art: () => gameArt('battle'), tone: 'bp' },
  { href: '#/verify', kicker: 'Provably fair', title: 'Check every round', text: 'Replay any bet in your own browser', cta: 'Open the verifier', art: () => gameArt('dice'), tone: 'ok' },
  { href: '#/chat', kicker: 'Oil Rain', title: 'Rain in the chat', text: 'Free Frags every 30 minutes from level 5', cta: 'Go to the chat', art: () => gameArt('jackpot'), tone: 'violet' },
];

/* Free Frags: every way to get play money without staking it. */
const FREE: { href: string; icon: string; title: string; text: string; demoOnly?: boolean }[] = [
  { href: '#/rewards', icon: 'trophy', title: 'Redeem your level rewards', text: 'Rakeback grows with every level' },
  { href: '#/rewards', icon: 'crate', title: 'Open your free Scrap Crate', text: 'Once a day from level 2' },
  { href: '#/chat', icon: 'rain', title: 'Catch the Oil Rain', text: 'In the chat every 30 minutes' },
  { href: '#/rewards', icon: 'keycard', title: 'Redeem a promo code', text: 'Codes from streams and wipe days' },
  { href: '#/rewards', icon: 'user', title: 'Bonuses with a crew code', text: 'Bring friends, share the rewards' },
  { href: '#/wallet', icon: 'upgrade', title: 'Refill your balance', text: 'Once a day in the demo', demoOnly: true },
];

export const lobbyView: View = {
  title: 'Lobby',
  html: (c) => `
    <section class="mhero m-only" aria-label="Welcome">
      <p class="mh-pre">Welcome to</p>
      <h1 class="mh-brand">SCRAPLINE</h1>
      <p class="mh-tag">Rust originals with an open blueprint</p>
      <p class="mh-online"><span class="live-dot"></span><b class="num" id="mh-online">–</b> online<span class="sep">·</span><b class="num" id="mh-rounds">–</b> rounds today</p>
      ${c.guest ? `<button class="btn cta block" type="button" data-signup-inline>${c.cfg.demo ? `Sign up · ${frags(c.cfg.demoStartBalance ?? 0, 0)} Frags play money` : 'Sign in with Steam'}</button>` : ''}
    </section>

    <section class="wins m-only" aria-label="Live wins">
      <div class="wins-head"><p class="eyebrow"><span class="live-dot"></span> Live wins</p></div>
      <div class="wins-track" id="wins"><p class="muted" style="font-size:13px">Loading …</p></div>
    </section>

    <section class="promo m-only" aria-label="Highlights" aria-roledescription="carousel">
      <div class="promo-track" id="promo">${SLIDES.map((sl, i) => `<a class="slide tone-${sl.tone}" href="${sl.href}" aria-label="${i + 1} of ${SLIDES.length}: ${sl.title}">
        <span class="sl-copy"><span class="sl-kicker">${sl.kicker}</span><b>${sl.title}</b><span>${sl.text}</span><span class="sl-cta">${sl.cta} →</span></span>
        <span class="sl-art">${sl.art()}</span></a>`).join('')}</div>
      <button class="promo-nav prev" type="button" aria-label="Previous">‹</button><button class="promo-nav next" type="button" aria-label="Next">›</button>
      <div class="promo-dots">${SLIDES.map((_, i) => `<button type="button" data-dot="${i}" aria-label="Slide ${i + 1}" ${i ? '' : 'aria-current="true"'}></button>`).join('')}</div>
    </section>

    <section class="mgames m-only" aria-label="Games">
      <h2 class="h-sect" style="font-size:20px">Our games</h2>
      <div class="chips mg-filter" role="group" aria-label="Filter games"><button type="button" class="fchip" data-mcat="" aria-pressed="true">All ${GAMES.length}</button>${CATEGORIES.map(([cat, label]) => `<button type="button" class="fchip" data-mcat="${cat}" aria-pressed="false">${label}</button>`).join('')}</div>
      <div class="tiles" id="mtiles">${GAMES.map((g, i) => tile(g, i)).join('')}</div>
    </section>

    <section class="hero d-only">
      ${corners}
      <div class="copy">
        <p class="eyebrow">Open blueprint · ${c.cfg.demo ? 'play money' : 'Rust skins'} · 18+</p>
        <h1>Every round with an <em>open blueprint.</em></h1>
        <p>Fifteen games with published maths, a proof on every round and limits you set yourself. Start with Monument Run: eight rooms, one door each, 97 % RTP however far you climb.</p>
        <div class="row"><a class="btn" href="#/monument-run">${icon('tower')} Play Monument Run</a><a class="btn ghost" href="#/fair">${icon('shield')} How verification works</a></div>
      </div>
      <div class="drawing">${heroSheet()}</div>
    </section>

    <section class="live" aria-label="Live now">
      <a class="live-card" href="#/scrap-press"><span class="lc-head">${icon('crash')}Scrap Press<span class="live-dot"></span></span><b class="lc-val num" id="lv-crash">–</b><span class="lc-sub" id="lv-crash-sub">Connecting …</span><span class="hist" id="lv-crash-hist"></span></a>
      <a class="live-card" href="#/bandit-wheel"><span class="lc-head">${icon('wheel')}Bandit Wheel<span class="live-dot"></span></span><b class="lc-val num" id="lv-wheel">–</b><span class="lc-sub" id="lv-wheel-sub">Connecting …</span><span class="hist" id="lv-wheel-hist"></span></a>
      <a class="live-card" href="#/jackpot"><span class="lc-head">${icon('pot')}Jackpot<span class="live-dot"></span></span><b class="lc-val num" id="lv-pot">–</b><span class="lc-sub" id="lv-pot-sub">Connecting …</span><span class="hist" id="lv-pot-hist"></span></a>
      <a class="live-card" href="#/battle"><span class="lc-head">${icon('battle')}Case Battle<span class="live-dot"></span></span><b class="lc-val num" id="lv-battle">–</b><span class="lc-sub" id="lv-battle-sub">Connecting …</span><span class="hist" id="lv-battle-hist"></span></a>
    </section>

    <section class="stats d-only" aria-label="Key figures">
      <div><b>${GAMES.length}</b><span>games, each with a published proof</span></div>
      <div><b>93–99.31 %</b><span>RTP range across all games</span></div>
      <div><b id="st-bets">–</b><span>bets settled in the last 30 days</span></div>
      <div><b id="st-rtp">–</b><span>actual RTP paid out, last 30 days</span></div>
    </section>

    ${c.me.block ? `<section class="card" style="border-color:var(--lose)"><p>${c.me.block.kind === 'operator' ? 'Your account is on hold. Please contact support.' : 'Your account is on a break. You cannot play until the break ends.'}</p></section>` : ''}

    ${CATEGORIES.map(([cat, label, desc]) => `
    <section class="cat-sect d-only" style="display:flex;flex-direction:column;gap:14px">
      <div class="sect-head"><div><p class="eyebrow">${GAMES.filter((g) => g.cat === cat).length} games</p><h2 class="h-sect" style="font-size:22px">${label}</h2></div><p>${desc}</p></div>
      <div class="tiles">${GAMES.filter((g) => g.cat === cat).map((g, i) => tile(g, i)).join('')}</div>
    </section>`).join('')}

    <section class="free-sect" style="display:flex;flex-direction:column;gap:14px">
      <div class="sect-head"><div><p class="eyebrow">Free Frags</p><h2 class="h-sect" style="font-size:22px">Get free Frags</h2></div><p>${c.cfg.demo ? 'Play money' : 'Frags'} from levels, the daily crate, the rain and codes. No stake needed.</p></div>
      <div class="free">${FREE.filter((f) => !f.demoOnly || c.cfg.demo).map((f) => `<a class="free-card" href="${f.href}"><span class="fc-ico">${icon(f.icon)}</span><b>${f.title}</b><span>${f.text}</span></a>`).join('')}</div>
    </section>

    <section class="card feed-card">
      <div class="sect-head"><div><p class="eyebrow"><span class="live-dot"></span> Live</p><h2 class="h-sect">Latest bets</h2></div>
        <div class="seg" role="group" aria-label="Which bets" style="min-width:min(330px,100%)"><button type="button" data-feed="all" aria-pressed="true">All bets</button><button type="button" data-feed="high" aria-pressed="false">High wins</button>${c.guest ? '' : '<button type="button" data-feed="mine" aria-pressed="false">My bets</button>'}</div></div>
      <div class="tablewrap"><table class="feed"><thead><tr><th>Game</th><th>Player</th><th class="hide-xs">Time</th><th class="r hide-xs">Stake</th><th class="r">Multi</th><th class="r">Payout</th></tr></thead><tbody id="feed"><tr><td colspan="6" class="muted">Loading …</td></tr></tbody></table></div>
    </section>

    <section class="card ledger-card">
      <div class="sect-head"><div><p class="eyebrow">Fair-Ledger</p><h2 class="h-sect">Published vs. actual RTP · last 30 days</h2></div><a href="#/fair" style="font-size:13px">Verify any round →</a></div>
      <div class="tablewrap"><table><thead><tr><th>Game</th><th class="r">Bets</th><th class="r">Wagered</th><th class="r">Paid out</th><th class="r">Actual</th><th class="r">Published</th></tr></thead><tbody id="rtp"><tr><td colspan="6" class="muted">Loading …</td></tr></tbody></table></div>
      <p class="muted" style="font-size:13px">A few bets swing a lot; the actual figure settles towards the published one after a few thousand rounds.</p>
    </section>
  `,
  mount: (root, c) => {
    drawIn(root);
    const stopLive = mountLive(root);
    const stopFeed = mountFeed(root, c.me.displayName);
    const stopWins = mountWins(root);
    const stopPromo = mountPromo(root);
    root.querySelector('[data-signup-inline]')?.addEventListener('click', () => c.openSignup());
    // phone: one grid of every game, filtered by category
    root.querySelectorAll<HTMLButtonElement>('[data-mcat]').forEach((b) => b.addEventListener('click', () => {
      const cat = b.dataset.mcat;
      root.querySelectorAll('[data-mcat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      root.querySelectorAll<HTMLElement>('#mtiles .tile').forEach((t) => { t.hidden = Boolean(cat) && t.dataset.cat !== cat; });
    }));
    api<{ game: string; enabled: boolean; reason: string | null }[]>('GET', '/games/status').then((list) => {
      for (const g of list) {
        root.querySelectorAll<HTMLElement>(`.tile[data-game="${g.game}"]`).forEach((t) => {
          t.classList.toggle('paused', !g.enabled);
          (t.querySelector('.paused-tag') as HTMLElement).hidden = g.enabled;
          if (!g.enabled) t.title = `Paused${g.reason ? `: ${g.reason}` : ''}`;
        });
      }
    }).catch(() => null);
    api<{ games: { game: string; bets: number; wagered: number; paid: number; rtp: number | null }[] }>('GET', '/stats/rtp?days=30').then((s) => {
      const body = $('#rtp', root);
      if (!body) return;
      const bets = s.games.reduce((a, g) => a + g.bets, 0);
      const wagered = s.games.reduce((a, g) => a + g.wagered, 0);
      const paid = s.games.reduce((a, g) => a + g.paid, 0);
      animateNumber($('#st-bets', root), 0, bets, (n) => Math.round(n).toLocaleString('en-US'), 900);
      if (wagered) animateNumber($('#st-rtp', root), 0, paid / wagered, (n) => pct(n), 900);
      body.innerHTML = s.games.length
        ? s.games.map((g) => `<tr><td>${esc(gameName(g.game))}</td><td class="r num">${g.bets.toLocaleString('en-US')}</td><td class="r num">${(g.wagered / 1000).toLocaleString('en-US')}</td><td class="r num">${(g.paid / 1000).toLocaleString('en-US')}</td>
            <td class="r num">${g.rtp === null ? '–' : pct(g.rtp)}</td><td class="r num muted">${esc(GAMES.find((x) => x.id === g.game)?.rtp ?? '–')}</td></tr>`).join('')
        : '<tr><td colspan="6" class="muted">No rounds yet.</td></tr>';
    }).catch(() => null);
    return () => { stopLive(); stopFeed(); stopWins(); stopPromo(); };
  },
};

/* ---------- latest bets: everyone's settled rounds, high wins, or the player's own ---------- */
interface FeedRow { game: string; gameName: string; name: string; stake: number; payout: number; multiplier: number; at: number }
function mountFeed(root: HTMLElement, me: string): () => void {
  let kind: 'all' | 'high' | 'mine' = 'all';
  let sig = '';
  const ago = (t: number) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`; };
  const load = async () => {
    const rows: FeedRow[] = kind === 'mine'
      ? (await api<{ bets: { game: string; gameName: string; stake: number; payout: number; multiplier: number; settled: boolean; createdAt: number; settledAt: number | null }[] }>('GET', '/history?limit=12')).bets
        .filter((b) => b.settled).map((b) => ({ game: b.game, gameName: b.gameName, name: me, stake: b.stake, payout: b.payout, multiplier: b.multiplier, at: b.settledAt ?? b.createdAt }))
      : await api<FeedRow[]>('GET', `/feed?kind=${kind}`);
    const body = root.querySelector('#feed');
    if (!body) return;
    const html = rows.length ? rows.slice(0, 12).map((r) => `<tr><td>${esc(r.gameName)}</td><td class="${r.name === 'Hidden player' ? 'muted' : ''}">${esc(r.name)}</td><td class="num muted hide-xs" style="font-size:12px">${ago(r.at)}</td>
        <td class="r num hide-xs">${frags(r.stake)}</td><td class="r num ${r.multiplier >= 5 ? 'pos' : ''}">${r.multiplier.toFixed(2)}×</td><td class="r num ${r.payout > r.stake ? 'pos' : 'muted'}">${frags(r.payout)}</td></tr>`).join('')
      : `<tr><td colspan="6" class="muted">${kind === 'high' ? 'No win of 5× or more in the last 24 hours yet.' : 'No rounds yet. Play one and it shows up here.'}</td></tr>`;
    if (html !== sig) { sig = html; body.innerHTML = html; }
  };
  root.querySelectorAll<HTMLButtonElement>('[data-feed]').forEach((b) => b.addEventListener('click', () => {
    kind = b.dataset.feed as typeof kind;
    root.querySelectorAll('[data-feed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    void load().catch(() => null);
  }));
  void load().catch(() => null);
  const t = setInterval(() => void load().catch(() => null), 3000);
  return () => clearInterval(t);
}

/** The hero drawing draws itself: every line runs from its start to its end, labels fade in after. */
function drawIn(root: HTMLElement) {
  if (reducedMotion()) return;
  const svg = root.querySelector<SVGSVGElement>('.hero .drawing svg');
  if (!svg || !svg.getClientRects().length) return; // hidden (phone layout): nothing to draw
  svg.querySelectorAll<SVGGeometryElement>('path, rect, circle, ellipse').forEach((el, i) => {
    let len = 0;
    try { len = el.getTotalLength?.() ?? 0; } catch { return; }
    if (!len) return;
    el.style.strokeDasharray = `${len}`;
    el.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 1300, delay: 150 + i * 16, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' })
      .finished.then(() => { el.style.strokeDasharray = ''; }).catch(() => null);
  });
  svg.querySelectorAll('text').forEach((el, i) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 900 + i * 30, fill: 'backwards' }));
}

/* ---------- live strip: the shared games right now ---------- */
interface CrashLive { now: number; rate: number; round: { status: string; bettingEndsAt: number; crash: number | null } | null; history: { crash: number }[] }
interface WheelLive { now: number; payouts: Record<string, number>; round: { status: string; bettingEndsAt: number; spinEndsAt: number; field: number | null } | null; history: { field: number }[]; totals: Record<string, number> }
interface PotLive { now: number; label: string; current: { total: number; entries: unknown[]; countdownEndsAt: number | null } | null; history: { payout: number; chance: number }[] }
interface BattleLive { status: string; seats: number; seatStake: number; params: { mode: string }; result: { totals: number[] } | null }

function mountLive(root: HTMLElement): () => void {
  let crash: CrashLive | null = null, wheel: WheelLive | null = null;
  let crashSkew = 0, wheelSkew = 0;
  const set = (id: string, text: string, cls?: string) => {
    const el = root.querySelector<HTMLElement>(`#${id}`);
    if (!el || el.textContent === text) return;
    el.textContent = text;
    if (cls !== undefined) el.className = `lc-val num ${cls}`;
  };
  const hist = (id: string, items: [string, string][]) => {
    const el = root.querySelector<HTMLElement>(`#${id}`);
    if (!el) return;
    const html = items.map(([t, c]) => `<span class="${c}">${esc(t)}</span>`).join('');
    if (el.dataset.sig !== html) { el.dataset.sig = html; el.innerHTML = html; }
  };
  const mult = (m: number) => `${m.toFixed(2)}×`;
  const crashCls = (m: number) => (m >= 10 ? 'top' : m >= 2 ? 'hi' : m < 1.2 ? 'bad' : '');

  /** Fast tick: the running multiplier and the countdowns move between polls. */
  const fast = () => {
    if (crash && !crash.round) set('lv-crash-sub', 'First round starts in a moment');
    if (crash?.round) {
      const r = crash.round, now = Date.now() + crashSkew;
      if (r.status === 'crashed' && r.crash !== null) { set('lv-crash', `${mult(r.crash)}`, 'bad'); set('lv-crash-sub', 'Crashed · next round soon'); }
      else if (now < r.bettingEndsAt) { set('lv-crash', `${((r.bettingEndsAt - now) / 1000).toFixed(1)} s`, ''); set('lv-crash-sub', 'Bets open'); }
      else { set('lv-crash', mult(Math.exp(crash.rate * (now - r.bettingEndsAt))), 'ok'); set('lv-crash-sub', 'In flight · cash out any time'); }
    }
    if (wheel && !wheel.round) set('lv-wheel-sub', 'First spin starts in a moment');
    if (wheel?.round) {
      const r = wheel.round, now = Date.now() + wheelSkew;
      if (now < r.bettingEndsAt) { set('lv-wheel', `${Math.ceil((r.bettingEndsAt - now) / 1000)} s`, ''); set('lv-wheel-sub', `Next spin · ${frags(Object.values(wheel.totals).reduce((a, b) => a + b, 0), 0)} Frags on the board`); }
      else if (r.field === null || now < r.spinEndsAt) { set('lv-wheel', 'Spinning', ''); set('lv-wheel-sub', 'Bets closed'); }
      else { set('lv-wheel', `${r.field} → ${wheel.payouts[r.field]}×`, r.field >= 10 ? 'ok' : ''); set('lv-wheel-sub', 'Landed · next round soon'); }
    }
  };
  const poll = async () => {
    const [c, w, high, low, battles] = await Promise.all([
      api<CrashLive>('GET', '/crash/state').catch(() => null), api<WheelLive>('GET', '/wheel/state').catch(() => null),
      api<PotLive>('GET', '/jackpot/high').catch(() => null), api<PotLive>('GET', '/jackpot/low').catch(() => null),
      api<BattleLive[]>('GET', '/pvp/list/battle').catch(() => null),
    ]);
    if (c) { crash = c; crashSkew = c.now - Date.now(); hist('lv-crash-hist', c.history.slice(0, 8).map((h) => [mult(h.crash), crashCls(h.crash)])); }
    if (w) { wheel = w; wheelSkew = w.now - Date.now(); hist('lv-wheel-hist', w.history.slice(0, 8).map((h) => [`${w.payouts[h.field]}×`, h.field === 20 ? 'top' : h.field >= 5 ? 'hi' : ''])); }
    if (high || low) {
      const pot = high?.current?.total ?? 0;
      set('lv-pot', `${frags(pot, 0)}`, pot > 0 ? 'ok' : '');
      set('lv-pot-sub', `${high?.label ?? 'High Rollers'} · ${high?.current?.entries.length ?? 0} in · ${low?.label ?? 'Low Ballers'} ${frags(low?.current?.total ?? 0, 0)}`);
      hist('lv-pot-hist', [...(high?.history ?? []), ...(low?.history ?? [])].slice(0, 6).map((h) => [frags(h.payout, 0), h.chance < 0.25 ? 'top' : 'hi']));
    }
    if (battles) {
      const open = battles.filter((b) => b.status === 'open').length;
      const drawing = battles.filter((b) => b.status === 'locked').length;
      set('lv-battle', `${open} open`, open ? 'ok' : '');
      set('lv-battle-sub', drawing ? `${drawing} drawing right now` : open ? 'Take a seat or watch' : 'Start one, bots fill the seats');
      hist('lv-battle-hist', battles.filter((b) => b.status === 'settled' && b.result).slice(0, 6).map((b) => {
        const pool = b.result!.totals.reduce((a, x) => a + x, 0);
        return [`${b.params.mode === 'bonus' ? '★ ' : ''}${frags(pool, 0)}`, pool > b.seatStake * b.seats ? 'hi' : ''];
      }));
    }
    fast();
  };
  void poll();
  const slow = setInterval(() => void poll(), 2500);
  const quick = setInterval(fast, 100);
  return () => { clearInterval(slow); clearInterval(quick); };
}

/* ---------- phone: live wins (cards that scroll sideways) and players online ---------- */
interface Live { online: number; roundsToday: number }
function mountWins(root: HTMLElement): () => void {
  let sig = '';
  const iconOf = (game: string) => GAMES.find((g) => g.id === game)?.icon ?? 'dice';
  const load = async () => {
    const [rows, live] = await Promise.all([api<FeedRow[]>('GET', '/feed?kind=all').catch(() => [] as FeedRow[]), api<Live>('GET', '/stats/live').catch(() => null)]);
    if (live) {
      const on = root.querySelector('#mh-online'), rd = root.querySelector('#mh-rounds');
      if (on) on.textContent = live.online.toLocaleString('en-US');
      if (rd) rd.textContent = live.roundsToday.toLocaleString('en-US');
    }
    const box = root.querySelector('#wins');
    if (!box) return;
    const wins = rows.filter((r) => r.payout > r.stake).slice(0, 12);
    const html = wins.length ? wins.map((r) => `<a class="win-card ${r.multiplier >= 10 ? 'gold' : r.multiplier >= 2 ? 'hot' : ''}" href="#/${GAMES.find((g) => g.id === r.game)?.path ?? ''}">
        <span class="wc-ico">${icon(iconOf(r.game))}</span><span class="wc-txt"><b class="num">${frags(r.payout)}</b><span>${esc(r.name)}</span><small>${esc(gameName(r.game))} · ${r.multiplier.toFixed(2)}×</small></span></a>`).join('')
      : '<p class="muted" style="font-size:13px">No wins yet today. The first one shows up here.</p>';
    if (html !== sig) { sig = html; box.innerHTML = html; }
  };
  void load();
  const t = setInterval(() => void load(), 4000);
  return () => clearInterval(t);
}

/* ---------- phone: highlight carousel (swipe, arrows, dots, slow autoplay) ---------- */
function mountPromo(root: HTMLElement): () => void {
  const track = root.querySelector<HTMLElement>('#promo');
  if (!track) return () => undefined;
  const slides = [...track.children] as HTMLElement[];
  const dots = [...root.querySelectorAll<HTMLButtonElement>('[data-dot]')];
  const at = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  const go = (i: number) => track.scrollTo({ left: ((i + slides.length) % slides.length) * track.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' });
  let touched = false;
  const paintDots = () => dots.forEach((d, i) => (i === at() ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current')));
  track.addEventListener('scroll', paintDots, { passive: true });
  track.addEventListener('pointerdown', () => { touched = true; });
  root.querySelector('.promo-nav.prev')?.addEventListener('click', () => { touched = true; go(at() - 1); });
  root.querySelector('.promo-nav.next')?.addEventListener('click', () => { touched = true; go(at() + 1); });
  dots.forEach((d, i) => d.addEventListener('click', () => { touched = true; go(i); }));
  const t = setInterval(() => { if (!touched && !reducedMotion() && track.offsetParent) go(at() + 1); }, 6000);
  return () => clearInterval(t);
}
