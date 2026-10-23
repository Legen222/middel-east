import { api } from '../api';
import { icon } from '../icons';
import type { View } from '../main';
import { $, SCRAP_SYM, errorText, esc, frags, guard, toast } from '../ui';

interface Tx { id: number; kind: string; amount: number; ref: string | null; game: string | null; gameName: string | null; createdAt: number }

/** How each ledger kind reads to a player. */
const KIND: Record<string, string> = {
  stake: 'Stake', payout: 'Payout', refund: 'Refund', demo_grant: 'Demo Scrap', deposit: 'Deposit', withdrawal: 'Withdrawal',
  rakeback: 'Reward', promo: 'Promo code', affiliate: 'Crew reward', adjustment: 'Adjustment by support',
};
const when = (t: number) => new Date(t).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' });

export const walletView: View = {
  title: 'Wallet',
  html: (c) => `
  <section class="card">
    <div class="sect-head"><div><p class="eyebrow">Account</p><h1 class="h-display">Wallet</h1>
      <p class="muted">Your balance and every change to it: stakes, payouts, rewards, refills and adjustments.</p></div></div>
    <div class="wallet-hero">
      <div><span class="muted">Balance</span><b class="num">${SCRAP_SYM}<span id="w-bal">${frags(c.me.balance)}</span></b><small class="muted">Scrap · 100 Scrap = 1 $ ${c.cfg.demo ? 'play money' : ''}</small></div>
      ${c.cfg.demo ? `<button class="btn" type="button" id="w-refill">${icon('upgrade')} Refill demo balance</button>` : ''}
    </div>
  </section>
  <section class="card">
    <h2 class="h-sect">${icon('gauge')} Totals</h2>
    <div class="stats" aria-label="Account totals"><div><b id="t-dep">–</b><span>deposited</span></div><div><b id="t-wd">–</b><span>withdrawn</span></div>
      <div><b id="t-wag">–</b><span>wagered</span></div><div><b id="t-bonus">–</b><span>rewards</span></div></div>
    <p class="muted" style="font-size:12px">Kept live by the database with every booking, so the figures always add up to your balance.</p>
  </section>
  <div class="admin-grid">
    <section class="card">
      <h2 class="h-sect">${icon('pot')} Deposit</h2>
      ${c.cfg.skins?.enabled
        ? `<p class="muted">Deposit Rust skins from your Steam inventory: our bot sends a trade offer with a security code, you accept it in Steam, the Scrap arrives at once.</p><div class="row"><a class="btn" href="#/deposit">${icon('crate')} Deposit skins</a></div>`
        : c.cfg.demo
        ? `<p class="muted">This is a play-money demo: Scrap has no cash value and cannot be bought. When the balance runs low you can refill it once a day, back to ${frags(c.cfg.demoStartBalance ?? 0, 0)} Scrap.</p>`
        : '<p class="muted">Deposits open with the licence: Rust skins via Steam trade, crypto and cards, each with its own checks. Until then nothing can be deposited.</p>'}
    </section>
    <section class="card">
      <h2 class="h-sect">${icon('shield')} Withdraw</h2>
      <p class="muted">${c.cfg.demo ? 'Play money cannot be withdrawn.' : 'Withdrawals need a verified identity and wagering of at least your deposits since the last withdrawal (anti-money-laundering rule).'}
        Limits, breaks and self-exclusion are on <a href="#/limits">Responsible play</a>.</p>
      ${c.cfg.skins?.enabled ? `<div class="row"><a class="btn ghost" href="#/withdraw">${icon('upgrade')} Withdraw skins</a></div>` : ''}
    </section>
  </div>
  <section class="card">
    <div class="sect-head"><h2 class="h-sect">Transactions</h2>
      <label class="field" style="min-width:200px">Type<select id="w-kind"><option value="">All</option>${Object.entries(KIND).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label></div>
    <div class="tablewrap"><table><thead><tr><th>Time</th><th>Type</th><th>Game / reference</th><th class="r">Amount ${SCRAP_SYM}</th></tr></thead><tbody id="w-rows"><tr><td colspan="4" class="muted">Loading …</td></tr></tbody></table></div>
    <div class="row"><button class="btn ghost" type="button" id="w-more" hidden>Load more</button></div>
  </section>`,
  mount: (root, c) => {
    let next: number | null = null;
    let shown = 0;
    const body = $('#w-rows', root);
    const load = async (reset: boolean) => {
      const q = new URLSearchParams({ limit: '50' });
      const kind = ($('#w-kind', root) as HTMLSelectElement).value;
      if (kind) q.set('kind', kind);
      if (!reset && next) q.set('before', String(next));
      const page = await api<{ transactions: Tx[]; next: number | null }>('GET', `/wallet/transactions?${q}`);
      if (reset) { body.innerHTML = ''; shown = 0; }
      body.insertAdjacentHTML('beforeend', page.transactions.map((t) => `<tr>
        <td class="num" style="font-size:12px;white-space:nowrap">${when(t.createdAt)}</td>
        <td>${esc(KIND[t.kind] ?? t.kind)}</td>
        <td class="muted" style="font-size:13px">${t.gameName ? esc(t.gameName) : ''}${t.ref && !t.gameName ? `<span class="num">${esc(t.ref.slice(0, 16))}</span>` : ''}</td>
        <td class="r num ${t.amount > 0 ? 'pos' : t.amount < 0 ? 'neg' : ''}">${t.amount > 0 ? '+' : t.amount < 0 ? '−' : ''}${frags(Math.abs(t.amount))}</td></tr>`).join(''));
      shown += page.transactions.length;
      if (!shown) body.innerHTML = '<tr><td colspan="4" class="muted">Nothing yet.</td></tr>';
      next = page.next;
      $('#w-more', root).hidden = !next;
    };
    void load(true).catch((e) => toast(errorText(e), 'err'));
    api<{ totals: { deposited: number; withdrawn: number; wagered: number; bonuses: number } }>('GET', '/me/stats').then(({ totals: t }) => {
      $('#t-dep', root).textContent = frags(t.deposited);
      $('#t-wd', root).textContent = frags(t.withdrawn);
      $('#t-wag', root).textContent = frags(t.wagered);
      $('#t-bonus', root).textContent = frags(t.bonuses);
    }).catch(() => null);
    $('#w-kind', root).addEventListener('change', () => void load(true).catch((e) => toast(errorText(e), 'err')));
    $('#w-more', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, () => load(false)));
    root.querySelector('#w-refill')?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      await api('POST', '/demo/refill');
      await c.refresh();
      $('#w-bal', root).textContent = frags(c.me.balance);
      toast('Demo balance refilled.');
      await load(true);
    }));
  },
};
