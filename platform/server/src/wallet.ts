/**
 * Double-entry wallet. Every transfer writes a debit and a credit row that sum to zero, so
 * Σ ledger.amount = 0 always holds and every balance is reproducible from the ledger alone.
 * Player accounts can never go negative; house accounts (bankroll, faucet) can.
 */

import { type DB, tx } from './db';
import { fail } from './errors';

export const userAccount = (userId: string) => `user:${userId}`;
export const HOUSE = 'house:bankroll';
export const FAUCET = 'house:demo-faucet';

export type LedgerKind = 'stake' | 'payout' | 'refund' | 'demo_grant' | 'deposit' | 'withdrawal' | 'rakeback' | 'promo' | 'affiliate';

export function balanceOf(db: DB, account: string): number {
  const row = db.prepare('SELECT amount FROM balances WHERE account = ?').get(account) as { amount: number } | undefined;
  return row?.amount ?? 0;
}

function bump(db: DB, account: string, delta: number): void {
  db.prepare('INSERT INTO balances (account, amount) VALUES (?, ?) ON CONFLICT(account) DO UPDATE SET amount = amount + excluded.amount').run(account, delta);
}

export function transfer(db: DB, from: string, to: string, amount: number, kind: LedgerKind, ref: string | null, now: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`invalid amount ${amount}`);
  if (amount === 0) return;
  tx(db, () => {
    if (from.startsWith('user:') && balanceOf(db, from) < amount) {
      fail('insufficient_balance', 'Insufficient balance.', 400, { balance: balanceOf(db, from), needed: amount });
    }
    const txId = `${now}-${Math.random().toString(36).slice(2, 10)}`;
    const ins = db.prepare('INSERT INTO ledger (tx_id, account, amount, kind, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    ins.run(txId, from, -amount, kind, ref, now);
    ins.run(txId, to, amount, kind, ref, now);
    bump(db, from, -amount);
    bump(db, to, amount);
  });
}

/** Integrity check used by tests and by a periodic job in production. */
export function ledgerIntegrity(db: DB): { sum: number; mismatched: string[] } {
  const sum = (db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM ledger').get() as { s: number }).s;
  const rows = db.prepare(`SELECT b.account, b.amount AS cached, COALESCE(SUM(l.amount), 0) AS actual
    FROM balances b LEFT JOIN ledger l ON l.account = b.account GROUP BY b.account`).all() as { account: string; cached: number; actual: number }[];
  return { sum, mismatched: rows.filter((r) => r.cached !== r.actual).map((r) => r.account) };
}
