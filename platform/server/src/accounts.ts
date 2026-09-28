/**
 * Accounts and sessions.
 * Every account must confirm 18+ before it can play; the confirmation is audited. For real money the
 * self-declaration is not enough: KYC level 1 (document + liveness via the KYC provider) is required
 * before the first deposit (see compliance.ts).
 * Session tokens are random 32-byte values; only their SHA-256 is stored.
 */

import { createHash, randomBytes } from 'node:crypto';

import type { Config } from './config';
import { type DB, audit, tx } from './db';
import { fail } from './errors';
import { createSeed } from './seeds';
import { FAUCET, balanceOf, transfer, userAccount } from './wallet';

export interface UserRow {
  id: string; steam_id: string | null; display_name: string; country: string | null;
  age_confirmed_at: number | null; kyc_level: number; last_refill_at: number | null; created_at: number;
  role: Role;
}

export type Role = 'player' | 'moderator' | 'admin';

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export function getUser(db: DB, id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined;
}

function validateName(name: string): string {
  const n = name.trim();
  if (n.length < 2 || n.length > 24 || /[<>]/.test(n)) fail('invalid_name', 'Name: 2 to 24 characters.');
  return n;
}

/** Creates (or finds, when steamId is given) an account. `ageConfirmed` must be true. */
export function signUp(db: DB, cfg: Config, input: { displayName: string; ageConfirmed: boolean; steamId?: string; country: string | null }, now: number) {
  if (input.ageConfirmed !== true) fail('age_required', 'You must confirm that you are at least 18 years old.', 403);
  return tx(db, () => {
    if (input.steamId) {
      const existing = db.prepare('SELECT id FROM users WHERE steam_id = ?').get(input.steamId) as { id: string } | undefined;
      if (existing) return { userId: existing.id, created: false };
    }
    const id = randomBytes(8).toString('hex');
    db.prepare('INSERT INTO users (id, steam_id, display_name, country, age_confirmed_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, input.steamId ?? null, validateName(input.displayName), input.country, now, now);
    createSeed(db, id, randomBytes(8).toString('hex'), now);
    if (cfg.demo) transfer(db, FAUCET, userAccount(id), cfg.demoStartBalance, 'demo_grant', 'signup', now);
    audit(db, id, 'signup', { steam: Boolean(input.steamId), ageConfirmed: true, country: input.country }, now);
    return { userId: id, created: true };
  });
}

export function createSession(db: DB, cfg: Config, userId: string, now: number): string {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token_hash, user_id, started_at, expires_at) VALUES (?, ?, ?, ?)').run(hashToken(token), userId, now, now + cfg.sessionTtlHours * 3_600_000);
  return token;
}

export function resolveSession(db: DB, token: string | undefined, now: number): { user: UserRow; startedAt: number } | null {
  if (!token) return null;
  const s = db.prepare('SELECT user_id, started_at FROM sessions WHERE token_hash = ? AND expires_at > ?').get(hashToken(token), now) as { user_id: string; started_at: number } | undefined;
  if (!s) return null;
  const user = getUser(db, s.user_id);
  return user ? { user, startedAt: s.started_at } : null;
}

export function endSession(db: DB, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

/** Demo only: tops the balance back up once per 24 h when it has fallen below the refill amount. */
export function demoRefill(db: DB, cfg: Config, userId: string, now: number): number {
  if (!cfg.demo) fail('not_demo', 'Demo mode only.', 403);
  return tx(db, () => {
    const u = getUser(db, userId)!;
    if (u.last_refill_at && now - u.last_refill_at < 86_400_000) fail('refill_wait', 'Refills are available once every 24 hours.', 429, { nextAt: u.last_refill_at + 86_400_000 });
    const bal = balanceOf(db, userAccount(userId));
    if (bal >= cfg.demoRefill) fail('refill_not_needed', 'You still have enough demo balance.', 400);
    transfer(db, FAUCET, userAccount(userId), cfg.demoRefill - bal, 'demo_grant', 'refill', now);
    db.prepare('UPDATE users SET last_refill_at = ? WHERE id = ?').run(now, userId);
    return balanceOf(db, userAccount(userId));
  });
}
