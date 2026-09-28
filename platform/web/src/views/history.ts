import { type Bet, api } from '../api';
import type { View } from '../main';
import { $, esc, frags, mult } from '../ui';

const NAMES: Record<string, string> = { dice: 'Würfel', plinko: 'Schrottrutsche', upgrader: 'Werkbank', cases: 'Kisten', mines: 'Minenfeld', raid: 'Raid' };

export const historyView: View = {
  title: 'Verlauf',
  html: () => `
  <section class="card">
    <p class="eyebrow">Konto</p>
    <h1 class="h-display">Verlauf</h1>
    <p class="muted">Die letzten 100 Wetten. Nach einer Seed-Rotation erscheint der Server-Seed, und jede Zeile lässt sich nachrechnen.</p>
    <div class="tablewrap"><table><thead><tr><th>Zeit</th><th>Spiel</th><th class="r">Einsatz</th><th class="r">Multi</th><th class="r">Auszahlung</th><th class="r">Nonce</th><th>Server-Seed</th></tr></thead><tbody id="rows"><tr><td colspan="7" class="muted">Lädt …</td></tr></tbody></table></div>
  </section>`,
  mount: (root) => {
    api<Bet[]>('GET', '/bets?limit=100').then((bets) => {
      $('#rows', root).innerHTML = bets.length ? bets.map((b) => `<tr>
        <td class="num" style="font-size:12px;white-space:nowrap">${new Date(b.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' })}</td>
        <td>${esc(NAMES[b.game] ?? b.game)}${b.status === 'open' ? ' <span class="chip">offen</span>' : ''}</td>
        <td class="r num">${frags(b.stake)}</td>
        <td class="r num">${b.status === 'open' ? '–' : mult(b.multiplier)}</td>
        <td class="r num ${b.payout > b.stake ? 'pos' : b.status === 'settled' ? 'neg' : ''}">${frags(b.payout)}</td>
        <td class="r num">${b.fairness.nonce}</td>
        <td class="num" style="font-size:11px;word-break:break-all;max-width:220px">${b.fairness.serverSeed ? esc(b.fairness.serverSeed) : '<span class="muted">nach Rotation</span>'}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="muted">Noch keine Wetten.</td></tr>';
    }).catch(() => null);
  },
};
