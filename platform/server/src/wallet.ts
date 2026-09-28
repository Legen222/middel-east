/**
 * Double-entry wallet. Every transfer writes a debit and a credit row that sum to zero, so
 * Σ ledger.amount = 0 always holds and every balance is reproducible from the ledger alone.
 * Player accounts can never go negative; house accounts (bankroll, escrow, promo, faucet) can.
 *
 * Only player balances are cached in `balances`. House balances are summed from the ledger when asked:
 * a cached bankroll row would be written by every bet and turn into the one row all transactions fight
 * over under Postgres SERIALIZABLE.
 */

import { type DB, tx } from './db';
import { fail } from './errors';

export const userAccount = (userId: string) => `user:${userId}`;
export const HOUSE = 'house:bankroll';
export const FAUCET = 'house:demo-faucet';

export type LedgerKind = 'stake' | 'payout' | 'refund' | 'demo_grant' | 'deposit' | 'withdrawal' | 'rakeback' | 'promo' | 'affiliate';

const cached = (account: string) => account.startsWith('user:');

export async function balanceOf(db: DB, account: string): Promise<number> {
  if (!cached(account)) return ((await db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE account = ?').get(account)) as { s: number }).s;
  const row = (await db.prepare('SELECT amount FROM balances WHERE account = ?').get(account)) as { amount: number } | undefined;
  return row?.amount ?? 0;
}

async function bump(db: DB, account: string, delta: number): Promise<void> {
  if (!cached(account)) return;
  await db.prepare('INSERT INTO balances (account, amount) VALUES (?, ?) ON CONFLICT(account) DO UPDATE SET amount = balances.amount + excluded.amount').run(account, delta);
}

export function transfer(db: DB, from: string, to: string, amount: number, kind: LedgerKind, ref: string | null, now: number): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`invalid amount ${amount}`);
  if (amount === 0) return Promise.resolve();
  return tx(db, async (db) => {
    if (cached(from)) {
      const bal = await balanceOf(db, from);
      if (bal < amount) fail('insufficient_balance', 'Insufficient balance.', 400, { balance: bal, needed: amount });
    }
    const txId = `${now}-${Math.random().toString(36).slice(2, 10)}`;
    const ins = db.prepare('INSERT INTO ledger (tx_id, account, amount, kind, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    await ins.run(txId, from, -amount, kind, ref, now);
    await ins.run(txId, to, amount, kind, ref, now);
    await bump(db, from, -amount);
    await bump(db, to, amount);
  });
}

/** Balances of all house accounts, summed from the ledger. */
export async function houseBalances(db: DB): Promise<{ account: string; amount: number }[]> {
  return (await db.prepare("SELECT account, SUM(amount) AS amount FROM ledger WHERE account LIKE 'house:%' GROUP BY account ORDER BY account").all()) as { account: string; amount: number }[];
}

/** Integrity check used by tests, the backoffice and a periodic job in production. */
export async function ledgerIntegrity(db: DB): Promise<{ sum: number; mismatched: string[] }> {
  const sum = ((await db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM ledger').get()) as { s: number }).s;
  const rows = (await db.prepare(`SELECT b.account, b.amount AS cached, COALESCE(SUM(l.amount), 0) AS actual
    FROM balances b LEFT JOIN ledger l ON l.account = b.account WHERE b.account LIKE 'user:%' GROUP BY b.account, b.amount`).all()) as { account: string; cached: number; actual: number }[];
  return { sum, mismatched: rows.filter((r) => r.cached !== r.actual).map((r) => r.account) };
}
