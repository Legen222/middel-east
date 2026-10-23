import { api } from '../api';
import { icon } from '../icons';
import type { Ctx, View } from '../main';
import { $, $$, SCRAP_SYM, errorText, esc, frags, guard, scrap, toast } from '../ui';

/* Skin deposits (Steam trade bot) and withdrawals (beta: an operator sends the offer). Real-money mode only. */

interface InvItem { assetId: string; name: string; icon: string | null; color: string | null; tradable: boolean; price: number | null; value: number | null; reason: string | null }
interface DepItem { assetId: string; name: string; icon: string | null; value: number }
interface Deposit { id: string; status: string; offerId: string | null; securityCode: string; value: number; reason: string | null; createdAt: number; updatedAt: number; offerUrl: string | null; items: DepItem[] }
interface ShopItem { assetId: string; name: string; icon: string | null; price: number }
interface Withdrawal { id: string; status: string; value: number; offerId: string | null; note: string | null; createdAt: number; items: { assetId: string; name: string; icon: string | null }[] }

/** Steam's item image CDN; the inventory gives only the image hash. */
export const skinImg = (hash: string | null, size = 120) => (hash ? `https://community.cloudflare.steamstatic.com/economy/image/${encodeURIComponent(hash)}/${size}fx${size}f` : '');
const when = (t: number) => new Date(t).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
const DEP_STATUS: Record<string, string> = {
  requested: 'Bot is sending the offer', sent: 'Offer sent – accept it in Steam', accepted: 'Credited', declined: 'Declined', canceled: 'Canceled', expired: 'Expired', failed: 'Failed',
};
const W_STATUS: Record<string, string> = { pending: 'Waiting for an operator', sent: 'Sent to your Steam', canceled: 'Canceled, Scrap refunded' };
const chip = (s: string) => (['accepted', 'sent'].includes(s) ? 'win' : ['declined', 'canceled', 'expired', 'failed'].includes(s) ? 'lose' : '');

const card = (i: { assetId: string; name: string; icon: string | null; color?: string | null }, price: string, off: string | null) => `
  <button type="button" class="skin ${off ? 'off' : ''}" data-asset="${esc(i.assetId)}" ${off ? 'disabled' : ''} aria-pressed="false" style="${i.color ? `--rar:#${esc(i.color)}` : ''}">
    ${i.icon ? `<img src="${skinImg(i.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="skin-ph">${icon('crate')}</span>`}
    <span class="skin-name">${esc(i.name)}</span>
    <span class="skin-price num">${off ? esc(off) : price}</span>
  </button>`;

/** What blocks the rail for this player, as a card; null when they can use it. */
function gate(c: Ctx, need: 'deposit' | 'withdraw'): string | null {
  const s = c.cfg.skins;
  if (!s?.enabled) return `<section class="card"><p class="eyebrow">Skins</p><h1 class="h-display">${need === 'deposit' ? 'Deposit' : 'Withdraw'} skins</h1>
    <p class="muted">${c.cfg.demo ? 'This is a play-money demo: skins cannot be deposited or withdrawn here.' : 'Skin trading is not switched on for this site yet.'}</p><div class="row"><a class="btn ghost" href="#/wallet">Back to wallet</a></div></section>`;
  if (!c.me.steam) return `<section class="card"><p class="eyebrow">Skins</p><h1 class="h-display">Sign in with Steam</h1>
    <p class="muted">Skins move between your Steam account and our trade bot, so this account needs to be a Steam account. Sign out and use “Sign in with Steam”.</p></section>`;
  return null;
}

const tradeUrlForm = `
  <section class="card" id="tu-card">
    <h2 class="h-sect">${icon('keycard')} Your Steam trade URL</h2>
    <p class="muted">The bot sends offers to this link. Find it in Steam → Inventory → Trade Offers → <a href="https://steamcommunity.com/my/tradeoffers/privacy#trade_offer_access_url" target="_blank" rel="noopener noreferrer">Who can send me trade offers?</a></p>
    <form class="row" id="tu-form"><input class="input" id="tu" placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&amp;token=…" aria-label="Trade URL" style="flex:1;min-width:240px"><button class="btn" type="submit">Save</button></form>
  </section>`;

function bindTradeUrl(root: HTMLElement, c: Ctx) {
  root.querySelector('#tu-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    void guard($<HTMLButtonElement>('#tu-form button', root), async () => {
      await api('PUT', '/me/trade-url', { tradeUrl: $<HTMLInputElement>('#tu', root).value });
      await c.refresh();
      toast('Trade URL saved.');
      c.rerender();
    });
  });
}

/* ---------- deposit ---------- */

export const depositView: View = {
  title: 'Deposit skins',
  html: (c) => gate(c, 'deposit') ?? `
  <section class="card">
    <div class="sect-head"><div><p class="eyebrow">Wallet · Steam</p><h1 class="h-display">Deposit skins</h1>
      <p class="muted">Pick Rust items from your Steam inventory. Our bot sends you a trade offer that only <b>asks</b> for these items; you accept it in Steam and the Scrap arrives straight away.
      Credit: ${Math.round((c.cfg.skins!.depositRate) * 100)} % of the market price, items from ${frags(c.cfg.skins!.minItem, 0)} Scrap.</p></div>
      <div class="row"><a class="btn ghost" href="#/withdraw">${icon('upgrade')} Withdraw</a><a class="btn ghost" href="#/wallet">${icon('pot')} Wallet</a></div></div>
    <ul class="checks">
      <li class="ok"><b>Security code</b> The offer message shows a code. Accept only if it matches the one on this page.</li>
      <li class="ok"><b>Never give items away</b> A deposit offer never asks you to send anything other than the items you picked, and never contains items from us.</li>
      <li class="${c.cfg.skins!.kycBeforeDeposit && c.me.kycLevel < 1 ? 'warn' : 'ok'}"><b>Identity</b> ${c.cfg.skins!.kycBeforeDeposit && c.me.kycLevel < 1 ? 'Your identity needs to be verified before the first deposit. Contact support to start.' : 'Verified or not needed for deposits.'}</li>
    </ul>
  </section>
  ${c.me.steam!.tradeUrl ? '' : tradeUrlForm}
  <section class="card" id="dep-open" hidden></section>
  <section class="card">
    <div class="sect-head"><h2 class="h-sect">${icon('crate')} Your Rust inventory</h2>
      <div class="row"><span class="chip" id="bot-chip">Bot …</span><button class="btn ghost small" type="button" id="inv-refresh">Refresh</button></div></div>
    <div class="skin-grid" id="inv"><p class="muted">Loading your Steam inventory …</p></div>
  </section>
  <div class="depbar" id="depbar" hidden><span><b id="sel-n">0</b> selected · <b class="num">${SCRAP_SYM}<span id="sel-v">0.00</span></b></span><button class="btn" type="button" id="dep-go">Deposit</button></div>
  <section class="card">
    <h2 class="h-sect">Recent deposits</h2>
    <div class="tablewrap"><table><thead><tr><th>Time</th><th>Items</th><th>Status</th><th class="r">Value</th></tr></thead><tbody id="dep-rows"><tr><td colspan="4" class="muted">Loading …</td></tr></tbody></table></div>
  </section>`,
  mount: (root, c) => {
    if (gate(c, 'deposit')) return;
    bindTradeUrl(root, c);
    const max = c.cfg.skins!.maxItems;
    const picked = new Map<string, number>();
    let items: InvItem[] = [];
    let poll = 0;

    const paintBar = () => {
      $('#depbar', root).hidden = picked.size === 0;
      $('#sel-n', root).textContent = String(picked.size);
      $('#sel-v', root).textContent = frags([...picked.values()].reduce((a, v) => a + v, 0));
    };
    const loadInv = async (refresh: boolean) => {
      const grid = $('#inv', root);
      try {
        const r = await api<{ items: InvItem[]; botOnline: boolean }>('GET', `/skins/inventory${refresh ? '?refresh=1' : ''}`);
        items = r.items;
        const bot = $('#bot-chip', root);
        bot.textContent = r.botOnline ? 'Bot online' : 'Bot offline';
        bot.className = `chip ${r.botOnline ? 'win' : 'lose'}`;
        picked.clear();
        grid.innerHTML = items.length ? items.map((i) => card(i, i.value === null ? '–' : scrap(i.value), i.reason)).join('') : '<p class="muted">No Rust items in your Steam inventory.</p>';
        paintBar();
      } catch (e) {
        grid.innerHTML = `<p class="status lose">${esc(errorText(e))}</p>`;
      }
    };
    $('#inv', root).addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.skin');
      if (!b || b.disabled) return;
      const it = items.find((i) => i.assetId === b.dataset.asset);
      if (!it) return;
      if (picked.has(it.assetId)) picked.delete(it.assetId);
      else if (picked.size >= max) { toast(`At most ${max} items per deposit.`, 'err'); return; } else picked.set(it.assetId, it.value ?? 0);
      b.setAttribute('aria-pressed', String(picked.has(it.assetId)));
      b.classList.toggle('sel', picked.has(it.assetId));
      paintBar();
    });

    const paintOpen = (d: Deposit | undefined) => {
      const box = $('#dep-open', root);
      const open = d && (d.status === 'requested' || d.status === 'sent');
      box.hidden = !open;
      if (!open) return;
      box.innerHTML = `<div class="sect-head"><div><p class="eyebrow">Open deposit</p><h2 class="h-sect">${esc(DEP_STATUS[d!.status])}</h2>
        <p class="muted">${d!.items.length} item${d!.items.length === 1 ? '' : 's'} · <b class="num">${scrap(d!.value)}</b> on acceptance. The offer is canceled if it is not accepted within 10 minutes.</p></div>
        <div class="sec-code"><span class="muted">Security code</span><b class="num">${esc(d!.securityCode)}</b></div></div>
        ${d!.offerUrl ? `<div class="row"><a class="btn" href="${esc(d!.offerUrl)}" target="_blank" rel="noopener noreferrer">${icon('upgrade')} Open the offer in Steam</a></div>` : '<p class="muted">The bot is preparing the offer …</p>'}`;
    };
    const loadDeposits = async () => {
      const list = await api<Deposit[]>('GET', '/deposits');
      paintOpen(list[0]);
      $('#dep-rows', root).innerHTML = list.map((d) => `<tr><td class="num" style="font-size:12px;white-space:nowrap">${when(d.createdAt)}</td>
        <td style="font-size:13px">${d.items.map((i) => esc(i.name)).join(', ')}</td>
        <td><span class="chip ${chip(d.status)}">${esc(DEP_STATUS[d.status] ?? d.status)}</span>${d.reason ? `<br><span class="muted" style="font-size:12px">${esc(d.reason)}</span>` : ''}</td>
        <td class="r num">${d.status === 'accepted' ? '+' : ''}${scrap(d.value)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No deposits yet.</td></tr>';
      const open = list[0] && (list[0].status === 'requested' || list[0].status === 'sent');
      clearTimeout(poll);
      if (open) poll = window.setTimeout(() => void loadDeposits().catch(() => null), 3000);
      else if (list[0]?.status === 'accepted' && Date.now() - list[0].updatedAt < 15_000) { await c.refresh(); }
      return list;
    };

    $('#inv-refresh', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, () => loadInv(true)));
    $('#dep-go', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      const d = await api<Deposit>('POST', '/deposits', { assetIds: [...picked.keys()] });
      toast(`Deposit created. Security code ${d.securityCode}.`);
      await loadDeposits();
      await loadInv(false);
    }));
    void loadInv(false);
    void loadDeposits().catch((e) => toast(errorText(e), 'err'));
    return () => clearTimeout(poll);
  },
};

/* ---------- withdraw ---------- */

export const withdrawView: View = {
  title: 'Withdraw skins',
  html: (c) => gate(c, 'withdraw') ?? `
  <section class="card">
    <div class="sect-head"><div><p class="eyebrow">Wallet · Steam</p><h1 class="h-display">Withdraw skins</h1>
      <p class="muted">Pick items from our stock and pay with Scrap. During the beta an operator sends the trade offer by hand, usually within a few hours; you can cancel until then and get the Scrap back.
      Withdrawals need a verified identity and wagering of at least your deposits since the last withdrawal.</p></div>
      <div class="row"><a class="btn ghost" href="#/deposit">${icon('pot')} Deposit</a><a class="btn ghost" href="#/wallet">Wallet</a></div></div>
  </section>
  ${c.me.steam!.tradeUrl ? '' : tradeUrlForm}
  <section class="card" id="w-mine" hidden></section>
  <section class="card">
    <div class="sect-head"><h2 class="h-sect">${icon('crate')} In stock</h2>
      <input class="input" id="shop-q" type="search" placeholder="Search items" aria-label="Search items" style="max-width:240px"></div>
    <div class="skin-grid" id="shop"><p class="muted">Loading …</p></div>
  </section>
  <div class="depbar" id="wbar" hidden><span><b id="w-n">0</b> selected · <b class="num">${SCRAP_SYM}<span id="w-v">0.00</span></b></span><button class="btn" type="button" id="w-go">Withdraw</button></div>`,
  mount: (root, c) => {
    if (gate(c, 'withdraw')) return;
    bindTradeUrl(root, c);
    const max = c.cfg.skins!.maxItems;
    const picked = new Map<string, number>();
    let stock: ShopItem[] = [];
    let q = '';
    let typing = 0;

    const paintBar = () => {
      const total = [...picked.values()].reduce((a, v) => a + v, 0);
      $('#wbar', root).hidden = picked.size === 0;
      $('#w-n', root).textContent = String(picked.size);
      $('#w-v', root).textContent = frags(total);
      $<HTMLButtonElement>('#w-go', root).disabled = total > c.me.balance;
      $<HTMLButtonElement>('#w-go', root).textContent = total > c.me.balance ? 'Not enough Scrap' : 'Withdraw';
    };
    const loadShop = async () => {
      stock = await api<ShopItem[]>('GET', `/skins/shop?q=${encodeURIComponent(q)}`);
      $('#shop', root).innerHTML = stock.length ? stock.map((i) => card(i, scrap(i.price), null)).join('') : '<p class="muted">Nothing in stock right now.</p>';
      for (const id of [...picked.keys()]) if (!stock.some((s) => s.assetId === id)) picked.delete(id);
      $$<HTMLButtonElement>('.skin', root).forEach((b) => { const on = picked.has(b.dataset.asset!); b.classList.toggle('sel', on); b.setAttribute('aria-pressed', String(on)); });
      paintBar();
    };
    const loadMine = async () => {
      const list = await api<Withdrawal[]>('GET', '/withdrawals');
      const box = $('#w-mine', root);
      box.hidden = !list.length;
      box.innerHTML = `<h2 class="h-sect">Your withdrawals</h2><div class="tablewrap"><table><thead><tr><th>Time</th><th>Items</th><th>Status</th><th class="r">Value</th><th></th></tr></thead><tbody>
        ${list.map((w) => `<tr><td class="num" style="font-size:12px;white-space:nowrap">${when(w.createdAt)}</td><td style="font-size:13px">${w.items.map((i) => esc(i.name)).join(', ')}</td>
          <td><span class="chip ${w.status === 'sent' ? 'win' : w.status === 'canceled' ? 'lose' : ''}">${esc(W_STATUS[w.status] ?? w.status)}</span>${w.note ? `<br><span class="muted" style="font-size:12px">${esc(w.note)}</span>` : ''}</td>
          <td class="r num">−${scrap(w.value)}</td><td>${w.status === 'pending' ? `<button class="btn ghost small" type="button" data-cancel="${esc(w.id)}">Cancel</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
      $$<HTMLButtonElement>('[data-cancel]', box).forEach((b) => b.addEventListener('click', () => guard(b, async () => {
        await api('POST', `/withdrawals/${b.dataset.cancel}/cancel`);
        await c.refresh();
        toast('Withdrawal canceled, Scrap refunded.');
        await Promise.all([loadMine(), loadShop()]);
      })));
    };

    $('#shop', root).addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.skin');
      const it = b && stock.find((i) => i.assetId === b.dataset.asset);
      if (!b || !it) return;
      if (picked.has(it.assetId)) picked.delete(it.assetId);
      else if (picked.size >= max) { toast(`At most ${max} items per withdrawal.`, 'err'); return; } else picked.set(it.assetId, it.price);
      b.classList.toggle('sel', picked.has(it.assetId));
      b.setAttribute('aria-pressed', String(picked.has(it.assetId)));
      paintBar();
    });
    $('#shop-q', root).addEventListener('input', (e) => {
      q = (e.target as HTMLInputElement).value;
      clearTimeout(typing);
      typing = window.setTimeout(() => void loadShop().catch(() => null), 250);
    });
    $('#w-go', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      await api('POST', '/withdrawals', { assetIds: [...picked.keys()] });
      picked.clear();
      await c.refresh();
      toast('Withdrawal requested. An operator sends the offer to your Steam.');
      await Promise.all([loadMine(), loadShop()]);
    }));
    void loadShop().catch((e) => { $('#shop', root).innerHTML = `<p class="status lose">${esc(errorText(e))}</p>`; });
    void loadMine().catch(() => null);
    return () => clearTimeout(typing);
  },
};
