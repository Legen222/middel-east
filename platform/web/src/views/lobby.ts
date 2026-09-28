import { api } from '../api';
import { icon } from '../icons';
import type { View } from '../main';
import { $, esc, pct } from '../ui';

const GAMES = [
  { path: 'raid', name: 'Raid', icon: 'raid', rtp: 0.97, sig: true, line: 'Sprengstoff pro Wand wählen' },
  { path: 'kisten', name: 'Kisten', icon: 'crate', rtp: 0.93, line: 'Chancen jeder Kiste offen' },
  { path: 'minenfeld', name: 'Minenfeld', icon: 'mine', rtp: 0.97, line: '5×5, 1–24 Minen' },
  { path: 'wuerfel', name: 'Würfel', icon: 'dice', rtp: 0.98, line: 'Chance 0,01–98 %' },
  { path: 'schrottrutsche', name: 'Schrottrutsche', icon: 'plinko', rtp: 0.97, line: '8/12/16 Reihen' },
  { path: 'werkbank', name: 'Werkbank', icon: 'upgrade', rtp: 0.95, line: 'Einsatz hochschrauben' },
];

export const lobbyView: View = {
  title: 'Werkstatt',
  html: (c) => `
    <section class="hero">
      <div class="hero-walls" aria-hidden="true">${['#8a6a3c', '#a0763f', '#8b8680', '#7d8a93', '#5b6a78', '#B7471D'].map((w, i) => `<i style="background:${w};width:${100 - i * 9}%"></i>`).join('')}</div>
      <p class="eyebrow">Signature · Raid</p>
      <h1 class="h-display" style="max-width:15ch">Wähl deinen Sprengstoff. Jede Wand zählt.</h1>
      <p>Sechs Schichten von Twig bis Tool Cupboard. C4, Rakete oder Satchel, du entscheidest pro Wand. Auf jedem Weg 97 % RTP, mathematisch bewiesen.</p>
      <div class="row"><a class="btn" href="#/raid">${icon('raid')} Raid starten</a><span class="tape">Seed geprüft</span></div>
    </section>

    <section class="card" style="gap:14px">
      <div class="row" style="justify-content:space-between"><h2 class="h-sect">Originals</h2><span class="muted" style="font-size:13px">RTP je Spiel, bewiesen und per Monte-Carlo geprüft</span></div>
      <div class="tiles">${GAMES.map((g) => `<a class="tile ${g.sig ? 'sig' : ''}" href="#/${g.path}">${icon(g.icon)}<b>${g.name}</b><span class="muted" style="font-size:13px">${g.line}</span><span class="meta"><span>RTP</span><em>${g.path === 'schrottrutsche' ? '96,5–97 %' : g.path === 'kisten' ? '≤ 93 %' : pct(g.rtp, 0)}</em></span></a>`).join('')}</div>
    </section>

    <section class="card">
      <div class="row" style="justify-content:space-between"><h2 class="h-sect">Tatsächlicher RTP · letzte 30 Tage</h2><a href="#/fair" style="font-size:13px">So prüfst du jede Runde</a></div>
      <div class="tablewrap"><table><thead><tr><th>Spiel</th><th class="r">Wetten</th><th class="r">Eingesetzt</th><th class="r">Ausgezahlt</th><th class="r">RTP</th></tr></thead><tbody id="rtp"><tr><td colspan="5" class="muted">Lädt …</td></tr></tbody></table></div>
      <p class="muted" style="font-size:13px">Wenige Wetten schwanken stark. Aussagekräftig wird der Wert erst ab einigen Tausend Runden.</p>
    </section>

    ${c.me.block ? `<section class="card" style="border-color:var(--lose)"><p>Dein Konto ist pausiert. Spielen ist bis zum Ende der Pause nicht möglich.</p></section>` : ''}
  `,
  mount: (root) => {
    const names: Record<string, string> = { raid: 'Raid', cases: 'Kisten', mines: 'Minenfeld', dice: 'Würfel', plinko: 'Schrottrutsche', upgrader: 'Werkbank' };
    api<{ games: { game: string; bets: number; wagered: number; paid: number; rtp: number | null }[] }>('GET', '/stats/rtp?days=30').then((s) => {
      const body = $('#rtp', root);
      if (!body) return;
      body.innerHTML = s.games.length
        ? s.games.map((g) => `<tr><td>${esc(names[g.game] ?? g.game)}</td><td class="r num">${g.bets.toLocaleString('de-DE')}</td><td class="r num">${(g.wagered / 1000).toLocaleString('de-DE')}</td><td class="r num">${(g.paid / 1000).toLocaleString('de-DE')}</td><td class="r num">${g.rtp === null ? '–' : pct(g.rtp)}</td></tr>`).join('')
        : '<tr><td colspan="5" class="muted">Noch keine Runden.</td></tr>';
    }).catch(() => null);
  },
};
