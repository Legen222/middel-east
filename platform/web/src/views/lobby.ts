import { api } from '../api';
import { icon } from '../icons';
import type { View } from '../main';
import { $, esc, pct } from '../ui';

const GAMES = [
  { path: 'raid', name: 'Raid', icon: 'raid', rtp: 0.97, sig: true, line: 'Pick an explosive per wall' },
  { path: 'cases', name: 'Cases', icon: 'crate', rtp: 0.93, line: 'Every drop rate is public' },
  { path: 'scrap-press', name: 'Scrap Press', icon: 'crash', rtp: 0.98, line: 'Live crash, hash chain' },
  { path: 'battle', name: 'Case Battle', icon: 'battle', rtp: 0.93, line: 'PvP, 2–4 seats' },
  { path: 'coinflip', name: 'Coinflip', icon: 'coin', rtp: 0.96, line: 'PvP, 4 % of the pot' },
  { path: 'minefield', name: 'Minefield', icon: 'mine', rtp: 0.97, line: '5×5, 1–24 mines' },
  { path: 'dice', name: 'Dice', icon: 'dice', rtp: 0.98, line: 'Chance 0.01–98 %' },
  { path: 'scrap-chute', name: 'Scrap Chute', icon: 'plinko', rtp: 0.97, line: '8/12/16 rows' },
  { path: 'workbench', name: 'Workbench', icon: 'upgrade', rtp: 0.95, line: 'Upgrade your stake' },
];

export const lobbyView: View = {
  title: 'Workshop',
  html: (c) => `
    <section class="hero">
      <div class="hero-walls" aria-hidden="true">${['#8a6a3c', '#a0763f', '#8b8680', '#7d8a93', '#5b6a78', '#B7471D'].map((w, i) => `<i style="background:${w};width:${100 - i * 9}%"></i>`).join('')}</div>
      <p class="eyebrow">Signature · Raid</p>
      <h1 class="h-display" style="max-width:15ch">Pick your explosive. Every wall counts.</h1>
      <p>Six layers from Twig to Tool Cupboard. C4, rocket or satchel: you decide at every wall. 97 % RTP on every path, mathematically proven.</p>
      <div class="row"><a class="btn" href="#/raid">${icon('raid')} Start raid</a><span class="tape">Seed verified</span></div>
    </section>

    <section class="card" style="gap:14px">
      <div class="row" style="justify-content:space-between"><h2 class="h-sect">Originals</h2><span class="muted" style="font-size:13px">RTP per game, proven and checked by Monte Carlo</span></div>
      <div class="tiles">${GAMES.map((g) => `<a class="tile ${g.sig ? 'sig' : ''}" href="#/${g.path}">${icon(g.icon)}<b>${g.name}</b><span class="muted" style="font-size:13px">${g.line}</span><span class="meta"><span>RTP</span><em>${g.path === 'scrap-chute' ? '96.5–97 %' : g.path === 'cases' || g.path === 'battle' ? '≤ 93 %' : pct(g.rtp, 0)}</em></span></a>`).join('')}</div>
    </section>

    <section class="card">
      <div class="row" style="justify-content:space-between"><h2 class="h-sect">Actual RTP · last 30 days</h2><a href="#/fair" style="font-size:13px">How to verify any round</a></div>
      <div class="tablewrap"><table><thead><tr><th>Game</th><th class="r">Bets</th><th class="r">Wagered</th><th class="r">Paid out</th><th class="r">RTP</th></tr></thead><tbody id="rtp"><tr><td colspan="5" class="muted">Loading …</td></tr></tbody></table></div>
      <p class="muted" style="font-size:13px">Few bets swing a lot. The number becomes meaningful after a few thousand rounds.</p>
    </section>

    ${c.me.block ? `<section class="card" style="border-color:var(--lose)"><p>Your account is on a break. You cannot play until the break ends.</p></section>` : ''}
  `,
  mount: (root) => {
    const names: Record<string, string> = { raid: 'Raid', cases: 'Cases', mines: 'Minefield', dice: 'Dice', plinko: 'Scrap Chute', upgrader: 'Workbench', crash: 'Scrap Press', coinflip: 'Coinflip', battle: 'Case Battle' };
    api<{ games: { game: string; bets: number; wagered: number; paid: number; rtp: number | null }[] }>('GET', '/stats/rtp?days=30').then((s) => {
      const body = $('#rtp', root);
      if (!body) return;
      body.innerHTML = s.games.length
        ? s.games.map((g) => `<tr><td>${esc(names[g.game] ?? g.game)}</td><td class="r num">${g.bets.toLocaleString('en-US')}</td><td class="r num">${(g.wagered / 1000).toLocaleString('en-US')}</td><td class="r num">${(g.paid / 1000).toLocaleString('en-US')}</td><td class="r num">${g.rtp === null ? '–' : pct(g.rtp)}</td></tr>`).join('')
        : '<tr><td colspan="5" class="muted">No rounds yet.</td></tr>';
    }).catch(() => null);
  },
};
