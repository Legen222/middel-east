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
      <div><span class="muted">Balance</span><b class="num">${SCRAP_SYM}<span id="w-bal">${frags(c.me.balance)}</span></b><small class="muted">Scrap · 1 Scrap = 1 $ ${c.cfg.demo ? 'play money' : ''}</small></div>
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
        ? `<p class="muted">This is a play-money demo: Scrap has no cash value and cannot be bought. When the balance runs low you can refill it once a day, back to ${frags(c.cfg.demoStartBalance ?? 0)} Scrap.</p>`
        : '<p class="muted">Deposit Bitcoin below: your own address, credited automatically once the network confirms it. More ways to pay follow.</p>'}
    </section>
    <section class="card">
      <h2 class="h-sect">${icon('shield')} Withdraw</h2>
      <p class="muted">${c.cfg.demo ? 'Play money cannot be withdrawn.' : 'Withdrawals need a verified identity and wagering of at least your deposits since the last withdrawal (anti-money-laundering rule).'}
        Limits, breaks and self-exclusion are on <a href="#/limits">Responsible play</a>.</p>
      ${c.cfg.skins?.enabled ? `<div class="row"><a class="btn ghost" href="#/withdraw">${icon('upgrade')} Withdraw skins</a></div>` : ''}
    </section>
  </div>
  <section class="card crypto-box" id="crypto" hidden></section>
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
    if (!c.cfg.demo) mountCrypto($('#crypto', root), () => { void c.refresh().then(() => { $('#w-bal', root).textContent = frags(c.me.balance); }); void load(true).catch(() => null); });
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

/* ---------- crypto deposits ---------- */
interface CryptoAsset { asset: string; name: string; network: string; confirmations: number; minDeposit: number; address: string | null }
interface CryptoDeposit { id: string; txid: string; amount: string; confirmations: number; needed: number; status: 'pending' | 'credited' | 'held' | 'refunded'; usd: number | null; value: number | null; reason: string | null; createdAt: number }
const STATUS: Record<CryptoDeposit['status'], [string, string]> = { pending: ['Confirming', ''], credited: ['Credited', 'win'], held: ['On hold', 'hot'], refunded: ['Sent back', 'lose'] };

/** The Bitcoin box: the player's own address, then every deposit as the chain confirms it (polled while open). */
function mountCrypto(box: HTMLElement, credited: () => void) {
  let sig = '';
  let creditedIds = new Set<string>();
  let first = true;
  const paint = (s: { enabled: boolean; assets: CryptoAsset[]; deposits: CryptoDeposit[] }) => {
    if (!s.enabled) { box.hidden = true; return; }
    box.hidden = false;
    const a = s.assets[0];
    const html = `<div class="sect-head"><div><p class="eyebrow">Crypto · automatic</p><h2 class="h-sect">${icon('pot')} Deposit ${esc(a.name)}</h2>
        <p class="muted">Your own address on ${esc(a.network)}. Whatever arrives there is credited to this account after ${a.confirmations} confirmations, at the dollar rate of that moment (1 Scrap = 1 $). Minimum ${frags(a.minDeposit)} $.</p></div></div>
      ${a.address ? `<div class="cb-addr"><code id="cb-address">${esc(a.address)}</code><button class="btn small" type="button" id="cb-copy">Copy</button><a class="btn ghost small" href="bitcoin:${esc(a.address)}">Open wallet app</a></div>
        <p class="cb-warn">Send <b>only ${esc(a.asset)}</b> on the <b>${esc(a.network)}</b> network to this address. Other coins or networks are lost.</p>`
        : `<div class="row"><button class="btn" type="button" id="cb-get">${icon('pot')} Show my ${esc(a.asset)} address</button></div>`}
      ${s.deposits.length ? `<div class="tablewrap"><table><thead><tr><th>Time</th><th>Amount</th><th>Status</th><th class="r">Credited ${SCRAP_SYM}</th></tr></thead><tbody>${s.deposits.map((d) => `<tr>
        <td class="num" style="font-size:12px;white-space:nowrap">${when(d.createdAt)}</td>
        <td class="num">${esc(d.amount)} ${esc(a.asset)}<br><small class="muted" title="${esc(d.txid)}">${esc(d.txid.slice(0, 12))}…</small></td>
        <td><span class="chip ${STATUS[d.status][1]}">${STATUS[d.status][0]}${d.status === 'pending' ? ` · ${d.confirmations}/${d.needed}` : ''}</span>${d.reason ? `<br><small class="muted">${esc(d.reason)}</small>` : ''}</td>
        <td class="r num ${d.status === 'credited' ? 'pos' : ''}">${d.value ? `+${frags(d.value)}` : '–'}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
    if (html !== sig) {
      sig = html;
      box.innerHTML = html;
      box.querySelector('#cb-get')?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => { await api('POST', '/wallet/crypto/address', { asset: a.asset }); await load(); }));
      box.querySelector('#cb-copy')?.addEventListener('click', () => { void navigator.clipboard?.writeText(a.address ?? '').then(() => toast('Address copied.'), () => toast('Copy it by hand, please.', 'err')); });
    }
    // a deposit that turned 'credited' while the page was open: update the balance and say so
    const now = new Set(s.deposits.filter((d) => d.status === 'credited').map((d) => d.id));
    if (!first) for (const d of s.deposits) if (d.status === 'credited' && !creditedIds.has(d.id)) { toast(`Deposit credited: +${frags(d.value ?? 0)} Scrap.`); credited(); }
    creditedIds = now;
    first = false;
  };
  const load = async () => paint(await api('GET', '/wallet/crypto'));
  void load().catch((e) => { box.hidden = false; box.innerHTML = `<p class="status lose">${esc(errorText(e))}</p>`; });
  const t = setInterval(() => { if (!box.isConnected) { clearInterval(t); return; } void load().catch(() => null); }, 20_000);
}
