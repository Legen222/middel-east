/**
 * Crypto deposits that credit themselves (real-money mode only; CRYPTO_BTC_XPUB and a licence, see env.ts).
 *
 * How a deposit finds its player
 *   The server holds only the extended PUBLIC key (xpub / zpub, BIP84 account level) of the operator's wallet.
 *   Every player gets their own native-SegWit address, derived as <xpub>/0/<index>; the index is stored with the
 *   player, so an incoming payment to that address belongs to exactly one account. The server can derive
 *   addresses but never spend: the private keys stay in the operator's wallet.
 *
 * How it is detected
 *   The leader polls a public Esplora API (mempool.space by default) for the players' addresses. Each output to
 *   an address becomes one deposit row (id = asset:txid:vout), so polling again changes nothing. A deposit is
 *   'pending' until it has `confirmations` blocks, then it settles once, in one transaction, guarded by its status.
 *
 * What settling does
 *   value = the coin amount × the USD price at settlement, in whole cents (1 Scrap = 1 $). Then:
 *   - below the minimum, a blocked or self-excluded player, a deposit limit it would break, or missing KYC
 *     → 'held': nothing is credited, an operator reviews it (credit after all, or send it back and mark it
 *     refunded). A blockchain transfer cannot be refused, so it is never silently dropped either.
 *   - otherwise → 'credited': ledger 'deposit' from house:crypto to the player (player_stats follows by trigger),
 *     AML flags (flagDeposit) and an audit row.
 */
import { bech32 } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';

import type { UserRow } from './accounts';
import { flagDeposit } from './compliance';
import { type Config, MF_PER_CENT, MF_PER_FRAG } from './config';
import { type DB, audit, tx } from './db';
export { CRYPTO_SCHEMA } from './db';
import { AppError, fail } from './errors';
import { assertNotBlocked, checkDeposit } from './rg';
import type { Fetch } from './steam';
import { transfer, userAccount } from './wallet';

export const CRYPTO = 'house:crypto';


/* ---------- addresses ---------- */

/** Version bytes of the extended public keys we accept; all of them give native SegWit (P2WPKH) addresses. */
const KEY_KINDS: Record<string, { pub: number; hrp: string }> = {
  xpub: { pub: 0x0488b21e, hrp: 'bc' }, zpub: { pub: 0x04b24746, hrp: 'bc' },
  tpub: { pub: 0x043587cf, hrp: 'tb' }, vpub: { pub: 0x045f1cf6, hrp: 'tb' },
};

/** Address n of the receive chain (<key>/0/n) as bech32 P2WPKH. Throws on a key that is not a public key. */
export function deriveAddress(extKey: string, n: number): string {
  const kind = KEY_KINDS[extKey.slice(0, 4)];
  if (!kind) throw new Error('CRYPTO_BTC_XPUB must be an account-level xpub, zpub, tpub or vpub');
  if (!Number.isSafeInteger(n) || n < 0 || n >= 0x80000000) throw new RangeError('address index out of range');
  const key = HDKey.fromExtendedKey(extKey, { public: kind.pub, private: 0 });
  const pub = key.deriveChild(0).deriveChild(n).publicKey;
  if (!pub) throw new Error('no public key');
  return bech32.encode(kind.hrp, [0, ...bech32.toWords(ripemd160(sha256(pub)))]);
}

export const isTestnetKey = (extKey: string) => KEY_KINDS[extKey.slice(0, 4)]?.hrp === 'tb';

/* ---------- the chain: an Esplora API (mempool.space, blockstream.info or your own) ---------- */

export interface ChainTx { txid: string; height: number | null; outs: { n: number; address: string | null; value: number }[] }
export interface Chain {
  tipHeight(): Promise<number>;
  /** Transactions touching `address`, newest first; paging stops at the page that holds `seen` (a txid read before). */
  addressTxs(address: string, seen?: string | null): Promise<ChainTx[]>;
  /** USD per coin. */
  usdPrice(): Promise<number>;
}

export class EsploraChain implements Chain {
  constructor(private api: string, private priceUrl: string, private fetchFn: Fetch) {}
  private async get(url: string) {
    const r = await this.fetchFn(url, { method: 'GET', headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`${new URL(url).host}: HTTP ${r.status ?? '?'}`);
    return r.text();
  }
  async tipHeight() {
    const h = Number(await this.get(`${this.api}/blocks/tip/height`));
    if (!Number.isSafeInteger(h) || h <= 0) throw new Error('chain: bad tip height');
    return h;
  }
  /**
   * Esplora answers with the mempool and the newest 25 confirmed transactions; older ones come page by page from
   * /txs/chain/<last txid>. Paging stops at a short page, at the page holding `seen` (the newest confirmed
   * transaction of the last pass, spends included), or after 40 pages (1 000 transactions) per pass.
   */
  async addressTxs(address: string, seen: string | null = null): Promise<ChainTx[]> {
    const base = `${this.api}/address/${encodeURIComponent(address)}/txs`;
    const out: ChainTx[] = [];
    let page = await this.page(base);
    for (let n = 0; n < 40; n++) {
      out.push(...page);
      const confirmed = page.filter((t) => t.height !== null);
      if (confirmed.length < 25 || (seen && confirmed.some((t) => t.txid === seen))) break;
      page = await this.page(`${base}/chain/${confirmed[confirmed.length - 1].txid}`);
    }
    return out;
  }
  private async page(url: string): Promise<ChainTx[]> {
    const list = JSON.parse(await this.get(url)) as unknown;
    if (!Array.isArray(list)) throw new Error('chain: unexpected answer');
    return list.map((t: { txid?: unknown; status?: { confirmed?: unknown; block_height?: unknown }; vout?: { scriptpubkey_address?: unknown; value?: unknown }[] }) => ({
      txid: String(t.txid ?? ''),
      height: t.status?.confirmed === true && Number.isSafeInteger(t.status.block_height) ? Number(t.status.block_height) : null,
      outs: (t.vout ?? []).map((o, n) => ({ n, address: typeof o.scriptpubkey_address === 'string' ? o.scriptpubkey_address : null, value: Number(o.value) })),
    })).filter((t) => /^[0-9a-f]{64}$/.test(t.txid));
  }
  async usdPrice() {
    const p = Number((JSON.parse(await this.get(this.priceUrl)) as { USD?: unknown }).USD);
    if (!Number.isFinite(p) || p <= 0) throw new Error('price: no USD price');
    return p;
  }
}

/* ---------- player side ---------- */

const cryptoOn = (cfg: Config) => { if (!cfg.crypto.enabled || cfg.demo) fail('crypto_off', 'Crypto deposits are not available.', 403); };

/** The player's deposit address; created on first request (index = next free one). */
export function depositAddress(db: DB, cfg: Config, user: UserRow, asset: string, now: number): Promise<{ asset: string; address: string }> {
  cryptoOn(cfg);
  if (asset !== 'BTC') fail('invalid_params', 'Unknown coin.');
  return tx(db, async (db) => {
    const have = (await db.prepare('SELECT address FROM crypto_addresses WHERE user_id = ? AND asset = ?').get(user.id, asset)) as { address: string } | undefined;
    if (have) return { asset, address: have.address };
    await assertNotBlocked(db, user.id, now);
    if (cfg.crypto.kycBeforeDeposit && user.kyc_level < 1) fail('kyc_required', 'Please verify your identity before your first deposit.', 403);
    const next = Number(((await db.prepare('SELECT COALESCE(MAX(idx), -1) + 1 AS n FROM crypto_addresses WHERE asset = ?').get(asset)) as { n: number }).n);
    const address = deriveAddress(cfg.crypto.btc.xpub, next);
    await db.prepare('INSERT INTO crypto_addresses (address, user_id, asset, idx, created_at, checked_at) VALUES (?, ?, ?, ?, ?, 0)').run(address, user.id, asset, next, now);
    await audit(db, user.id, 'crypto_address', { asset, idx: next, address }, now);
    return { asset, address };
  });
}

interface DepositRow {
  id: string; user_id: string; asset: string; address: string; txid: string; vout: number; amount: number; confirmations: number;
  status: 'pending' | 'credited' | 'held' | 'refunded'; usd_cents: number | null; value: number | null; reason: string | null; note: string | null;
  created_at: number; updated_at: number;
}
const btc = (sats: number) => (Number(sats) / 1e8).toFixed(8);
const depositOut = (d: DepositRow, need: number) => ({
  id: d.id, asset: d.asset, address: d.address, txid: d.txid, amount: btc(d.amount), confirmations: Math.min(Number(d.confirmations), need), needed: need,
  status: d.status, usd: d.usd_cents === null ? null : Number(d.usd_cents) / 100, value: d.value === null ? null : Number(d.value) / MF_PER_FRAG,
  reason: d.reason, createdAt: Number(d.created_at), updatedAt: Number(d.updated_at),
});

/** Everything the wallet page shows: whether crypto is on, the coins, the player's address and deposits. */
export async function cryptoState(db: DB, cfg: Config, userId: string) {
  const on = cfg.crypto.enabled && !cfg.demo;
  const need = cfg.crypto.confirmations;
  const addr = on ? ((await db.prepare("SELECT address FROM crypto_addresses WHERE user_id = ? AND asset = 'BTC'").get(userId)) as { address: string } | undefined) : undefined;
  const deps = on ? ((await db.prepare('SELECT * FROM crypto_deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 25').all(userId)) as DepositRow[]) : [];
  return {
    enabled: on,
    assets: on ? [{ asset: 'BTC', name: 'Bitcoin', network: isTestnetKey(cfg.crypto.btc.xpub) ? 'Bitcoin testnet' : 'Bitcoin', confirmations: need, minDeposit: cfg.crypto.minDeposit / MF_PER_FRAG, address: addr?.address ?? null }] : [],
    deposits: deps.map((d) => depositOut(d, need)),
  };
}

/* ---------- detection (leader) ---------- */

/**
 * One polling pass: up to `max` addresses, those with a pending deposit first, then the longest unchecked.
 * New outputs become 'pending' rows; rows with enough confirmations settle. Returns what changed.
 */
export async function scanDeposits(db: DB, cfg: Config, chain: Chain, now: number, max = 20): Promise<{ checked: number; found: number; settled: number }> {
  if (!cfg.crypto.enabled || cfg.demo) return { checked: 0, found: 0, settled: 0 };
  const rows = (await db.prepare(`SELECT a.address, a.user_id, a.asset, a.seen_txid FROM crypto_addresses a
    ORDER BY CASE WHEN EXISTS (SELECT 1 FROM crypto_deposits d WHERE d.address = a.address AND d.status = 'pending') THEN 0 ELSE 1 END, a.checked_at
    LIMIT ?`).all(max)) as { address: string; user_id: string; asset: string; seen_txid: string | null }[];
  if (!rows.length) return { checked: 0, found: 0, settled: 0 };
  const tip = await chain.tipHeight();
  let price: number | null = null;
  let found = 0, settled = 0;
  for (const a of rows) {
    const txs = await chain.addressTxs(a.address, a.seen_txid);
    for (const t of txs) {
      for (const o of t.outs) {
        if (o.address !== a.address || !Number.isSafeInteger(o.value) || o.value <= 0) continue;
        const id = `${a.asset}:${t.txid}:${o.n}`;
        const conf = t.height === null ? 0 : Math.max(0, tip - t.height + 1);
        const ins = await db.prepare(`INSERT INTO crypto_deposits (id, user_id, asset, address, txid, vout, amount, confirmations, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) ON CONFLICT (id) DO NOTHING`).run(id, a.user_id, a.asset, a.address, t.txid, o.n, o.value, conf, now, now);
        if (ins.changes === 1) { found++; await audit(db, a.user_id, 'crypto_seen', { id, amount: o.value, confirmations: conf }, now); }
        else await db.prepare("UPDATE crypto_deposits SET confirmations = ?, updated_at = ? WHERE id = ? AND status = 'pending' AND confirmations <> ?").run(conf, now, id, conf);
        if (conf < cfg.crypto.confirmations) continue;
        const open = await db.prepare("SELECT 1 FROM crypto_deposits WHERE id = ? AND status = 'pending'").get(id);
        if (!open) continue;
        price ??= await chain.usdPrice();
        if (await settleDeposit(db, cfg, id, price, now)) settled++;
      }
    }
    // remember the newest confirmed transaction deep enough not to be reorganised away: the next pass pages only to it
    const deep = txs.find((t) => t.height !== null && tip - t.height + 1 >= cfg.crypto.confirmations);
    await db.prepare('UPDATE crypto_addresses SET checked_at = ?, seen_txid = COALESCE(?, seen_txid) WHERE address = ?').run(now, deep?.txid ?? null, a.address);
  }
  return { checked: rows.length, found, settled };
}

/** Settles one pending deposit exactly once: credited, or held with the reason. True if it changed. */
export function settleDeposit(db: DB, cfg: Config, id: string, usdPerCoin: number, now: number): Promise<boolean> {
  return tx(db, async (db) => {
    const d = (await db.prepare("SELECT * FROM crypto_deposits WHERE id = ? AND status = 'pending'").get(id)) as DepositRow | undefined;
    if (!d) return false;
    const cents = Math.floor((Number(d.amount) / 1e8) * usdPerCoin * 100);
    const value = cents * MF_PER_CENT;
    const user = (await db.prepare('SELECT kyc_level FROM users WHERE id = ?').get(d.user_id)) as { kyc_level: number };
    let reason: string | null = null;
    if (value < cfg.crypto.minDeposit) reason = `Below the minimum deposit (${(cfg.crypto.minDeposit / MF_PER_FRAG).toFixed(2)} $).`;
    else if (cfg.crypto.kycBeforeDeposit && Number(user.kyc_level) < 1) reason = 'Identity not verified yet.';
    else {
      try { await checkDeposit(db, d.user_id, value, now); } catch (e) {
        if (!(e instanceof AppError)) throw e;
        reason = e.message;
      }
    }
    const status = reason ? 'held' : 'credited';
    const r = await db.prepare("UPDATE crypto_deposits SET status = ?, usd_cents = ?, value = ?, reason = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
      .run(status, cents, reason ? 0 : value, reason, now, id);
    if (r.changes !== 1) return false;
    if (!reason) {
      await transfer(db, CRYPTO, userAccount(d.user_id), value, 'deposit', id, now);
      await flagDeposit(db, cfg, d.user_id, value, now);
    }
    await audit(db, d.user_id, reason ? 'crypto_held' : 'crypto_deposit', { id, amount: Number(d.amount), usdCents: cents, reason }, now);
    return true;
  });
}

/* ---------- backoffice ---------- */

export async function cryptoAdmin(db: DB, cfg: Config) {
  const list = (await db.prepare(`SELECT d.*, u.display_name AS name FROM crypto_deposits d JOIN users u ON u.id = d.user_id
    ORDER BY CASE d.status WHEN 'held' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, d.created_at DESC LIMIT 100`).all()) as (DepositRow & { name: string })[];
  const sum = (await db.prepare("SELECT COALESCE(SUM(value), 0) AS s, COUNT(*) AS n FROM crypto_deposits WHERE status = 'credited'").get()) as { s: number; n: number };
  return {
    enabled: cfg.crypto.enabled && !cfg.demo, confirmations: cfg.crypto.confirmations,
    credited: { count: Number(sum.n), value: Number(sum.s) / MF_PER_FRAG },
    deposits: list.map((d) => ({ ...depositOut(d, cfg.crypto.confirmations), userId: d.user_id, name: d.name, note: d.note })),
  };
}

/**
 * An operator decides a held deposit: 'credit' books it after all (e.g. KYC done), 'refunded' records that the coins
 * were sent back from the wallet (txid in the note). Both need a reason and are audited.
 */
export function operatorCrypto(db: DB, operatorId: string, id: string, action: unknown, note: unknown, now: number) {
  const n = String(note ?? '').trim();
  if (action !== 'credit' && action !== 'refunded') fail('invalid_params', "Action: 'credit' or 'refunded'.");
  if (n.length < 5 || n.length > 300) fail('reason_required', 'Write a reason (5 to 300 characters).');
  return tx(db, async (db) => {
    const d = (await db.prepare("SELECT * FROM crypto_deposits WHERE id = ? AND status = 'held'").get(id)) as DepositRow | undefined;
    if (!d) fail('not_held', 'This deposit is not on hold.', 409);
    const value = Number(d!.usd_cents ?? 0) * MF_PER_CENT;
    if (action === 'credit' && value <= 0) fail('invalid_params', 'This deposit has no value to credit.');
    // a break or self-exclusion is never overridden: such a deposit can only go back
    if (action === 'credit') await assertNotBlocked(db, d!.user_id, now);
    await db.prepare("UPDATE crypto_deposits SET status = ?, value = ?, note = ?, updated_at = ? WHERE id = ? AND status = 'held'")
      .run(action === 'credit' ? 'credited' : 'refunded', action === 'credit' ? value : 0, n, now, id);
    if (action === 'credit') await transfer(db, CRYPTO, userAccount(d!.user_id), value, 'deposit', id, now);
    await audit(db, operatorId, `crypto_${action}`, { id, userId: d!.user_id, usdCents: d!.usd_cents, note: n }, now);
    return { id, status: action === 'credit' ? 'credited' : 'refunded' };
  });
}
