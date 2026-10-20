import { api } from '../api';
import { gameArt, heroSheet } from '../art';
import { CATEGORIES, GAMES, type GameMeta, gameName } from '../games';
import { icon } from '../icons';
import type { View } from '../main';
import { $, esc, pct } from '../ui';

const tile = (g: GameMeta) => `
  <a class="tile ${g.tag === 'SIGNATURE' ? 'sig' : ''}" href="#/${g.path}" data-game="${g.id}">
    <div class="art-box">${gameArt(g.id)}</div>
    ${g.tag ? `<span class="flag ${g.tag}">${g.tag}</span>` : ''}
    <span class="paused-tag" hidden>PAUSED</span>
    <div class="body"><b>${g.name}</b><span class="line">${g.line}</span><span class="meta"><span>RTP</span><em>${g.rtp}</em></span></div>
  </a>`;

const corners = '<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>';

export const lobbyView: View = {
  title: 'Lobby',
  html: (c) => `
    <section class="hero">
      ${corners}
      <div class="copy">
        <p class="eyebrow">Open blueprint · play money · 18+</p>
        <h1>Every round with an open blueprint.</h1>
        <p>Fifteen games with published maths, a proof on every round and limits you set yourself. Start with Monument Run: eight rooms, one door each, 97 % RTP however far you climb.</p>
        <div class="row"><a class="btn" href="#/monument-run">${icon('tower')} Play Monument Run</a><a class="btn ghost" href="#/fair">${icon('shield')} How verification works</a></div>
      </div>
      <div class="drawing">${heroSheet()}</div>
    </section>

    <section class="stats" aria-label="Key figures">
      <div><b>${GAMES.length}</b><span>games, each with a published proof</span></div>
      <div><b>93–99.31 %</b><span>RTP range across all games</span></div>
      <div><b id="st-bets">–</b><span>bets settled in the last 30 days</span></div>
      <div><b id="st-rtp">–</b><span>actual RTP paid out, last 30 days</span></div>
    </section>

    ${c.me.block ? `<section class="card" style="border-color:var(--lose)"><p>${c.me.block.kind === 'operator' ? 'Your account is on hold. Please contact support.' : 'Your account is on a break. You cannot play until the break ends.'}</p></section>` : ''}

    ${CATEGORIES.map(([cat, label, desc]) => `
    <section style="display:flex;flex-direction:column;gap:14px">
      <div class="sect-head"><div><p class="eyebrow">${GAMES.filter((g) => g.cat === cat).length} games</p><h2 class="h-sect" style="font-size:22px">${label}</h2></div><p>${desc}</p></div>
      <div class="tiles">${GAMES.filter((g) => g.cat === cat).map(tile).join('')}</div>
    </section>`).join('')}

    <section class="card">
      <div class="sect-head"><div><p class="eyebrow">Fair-Ledger</p><h2 class="h-sect">Published vs. actual RTP · last 30 days</h2></div><a href="#/fair" style="font-size:13px">Verify any round →</a></div>
      <div class="tablewrap"><table><thead><tr><th>Game</th><th class="r">Bets</th><th class="r">Wagered</th><th class="r">Paid out</th><th class="r">Actual</th><th class="r">Published</th></tr></thead><tbody id="rtp"><tr><td colspan="6" class="muted">Loading …</td></tr></tbody></table></div>
      <p class="muted" style="font-size:13px">A few bets swing a lot; the actual figure settles towards the published one after a few thousand rounds.</p>
    </section>
  `,
  mount: (root) => {
    api<{ game: string; enabled: boolean; reason: string | null }[]>('GET', '/games/status').then((list) => {
      for (const g of list) {
        const t = root.querySelector<HTMLElement>(`.tile[data-game="${g.game}"]`);
        if (!t) continue;
        t.classList.toggle('paused', !g.enabled);
        (t.querySelector('.paused-tag') as HTMLElement).hidden = g.enabled;
        if (!g.enabled) t.title = `Paused${g.reason ? `: ${g.reason}` : ''}`;
      }
    }).catch(() => null);
    api<{ games: { game: string; bets: number; wagered: number; paid: number; rtp: number | null }[] }>('GET', '/stats/rtp?days=30').then((s) => {
      const body = $('#rtp', root);
      if (!body) return;
      const bets = s.games.reduce((a, g) => a + g.bets, 0);
      const wagered = s.games.reduce((a, g) => a + g.wagered, 0);
      const paid = s.games.reduce((a, g) => a + g.paid, 0);
      $('#st-bets', root).textContent = bets.toLocaleString('en-US');
      $('#st-rtp', root).textContent = wagered ? pct(paid / wagered) : '–';
      body.innerHTML = s.games.length
        ? s.games.map((g) => `<tr><td>${esc(gameName(g.game))}</td><td class="r num">${g.bets.toLocaleString('en-US')}</td><td class="r num">${(g.wagered / 1000).toLocaleString('en-US')}</td><td class="r num">${(g.paid / 1000).toLocaleString('en-US')}</td>
            <td class="r num">${g.rtp === null ? '–' : pct(g.rtp)}</td><td class="r num muted">${esc(GAMES.find((x) => x.id === g.game)?.rtp ?? '–')}</td></tr>`).join('')
        : '<tr><td colspan="6" class="muted">No rounds yet.</td></tr>';
    }).catch(() => null);
  },
};
