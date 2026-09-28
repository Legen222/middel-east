import { type Bet, api } from '../api';
import type { View } from '../main';
import { $, esc, frags, mult } from '../ui';

const NAMES: Record<string, string> = { dice: 'Dice', plinko: 'Scrap Chute', upgrader: 'Workbench', cases: 'Cases', mines: 'Minefield', raid: 'Raid', crash: 'Scrap Press', coinflip: 'Coinflip', battle: 'Case Battle' };

export const historyView: View = {
  title: 'History',
  html: () => `
  <section class="card">
    <p class="eyebrow">Account</p>
    <h1 class="h-display">History</h1>
    <p class="muted">Your last 100 bets. After a seed rotation the server seed appears and every row can be recomputed.</p>
    <div class="tablewrap"><table><thead><tr><th>Time</th><th>Game</th><th class="r">Stake</th><th class="r">Multi</th><th class="r">Payout</th><th class="r">Nonce</th><th>Server seed</th></tr></thead><tbody id="rows"><tr><td colspan="7" class="muted">Loading …</td></tr></tbody></table></div>
  </section>`,
  mount: (root) => {
    api<Bet[]>('GET', '/bets?limit=100').then((bets) => {
      $('#rows', root).innerHTML = bets.length ? bets.map((b) => `<tr>
        <td class="num" style="font-size:12px;white-space:nowrap">${new Date(b.createdAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' })}</td>
        <td>${esc(NAMES[b.game] ?? b.game)}${b.status === 'open' ? ' <span class="chip">open</span>' : ''}</td>
        <td class="r num">${frags(b.stake)}</td>
        <td class="r num">${b.status === 'open' ? '–' : mult(b.multiplier)}</td>
        <td class="r num ${b.payout > b.stake ? 'pos' : b.status === 'settled' ? 'neg' : ''}">${frags(b.payout)}</td>
        <td class="r num">${b.fairness.nonce}</td>
        <td class="num" style="font-size:11px;word-break:break-all;max-width:220px">${b.fairness.serverSeed ? esc(b.fairness.serverSeed) : '<span class="muted">after rotation</span>'}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="muted">No bets yet.</td></tr>';
    }).catch(() => null);
  },
};
