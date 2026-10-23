/**
 * Accounts and sessions.
 * Every account must confirm 18+ before it can play; the confirmation is audited. For real money the
 * self-declaration is not enough: KYC level 1 (document + liveness via the KYC provider) is required
 * before the first deposit (see compliance.ts).
 * Session tokens are random 32-byte values; only their SHA-256 is stored. Operators step up with a TOTP
 * code per session (mfa.ts); the time of the last step-up is kept on the session row.
 */

import { createHash, randomBytes } from 'node:crypto';

import type { Config } from './config';
import { type DB, audit, tx } from './db';
import { fail } from './errors';
import { createSeed } from './seeds';
import { nameProblem } from './chat-filter';
import { getSettings } from './site';
import { type SteamProfile, parseTradeUrl } from './steam';
import { FAUCET, balanceOf, transfer, userAccount } from './wallet';

export type Role = 'player' | 'moderator' | 'admin';

export interface UserRow {
  id: string; steam_id: string | null; display_name: string; country: string | null;
  age_confirmed_at: number | null; kyc_level: number; last_refill_at: number | null; created_at: number;
  role: Role; totp_secret: string | null; totp_pending: string | null; totp_pending_at: number | null;
  steam_name: string | null; avatar_url: string | null; profile_url: string | null; trade_url: string | null;
}

export interface Session { user: UserRow; startedAt: number; mfaAt: number | null; mfaStep: number | null; tokenHash: string }

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export async function getUser(db: DB, id: string): Promise<UserRow | undefined> {
  return (await db.prepare('SELECT * FROM users WHERE id = ?').get(id)) as UserRow | undefined;
}

/** 2–24 characters, no markup, no slurs (built-in list plus the operator's), nothing that looks like staff. */
export function validateName(name: string, blocked: readonly string[] = []): string {
  const n = name.trim();
  if (n.length < 2 || n.length > 24 || /[<>]/.test(n)) fail('invalid_name', 'Name: 2 to 24 characters.');
  const problem = nameProblem(n, blocked);
  if (problem === 'blocked') fail('invalid_name', 'That name is not allowed. Pick another one.');
  if (problem === 'reserved') fail('reserved_name', 'Names that look like staff or the site (admin, mod, support …) are reserved. Pick another one.');
  return n;
}

/** Creates (or finds, when steamId is given) an account. `ageConfirmed` must be true. */
export async function signUp(db: DB, cfg: Config, input: { displayName: string; ageConfirmed: boolean; steamId?: string; country: string | null }, now: number): Promise<{ userId: string; created: boolean }> {
  if (input.ageConfirmed !== true) fail('age_required', 'You must confirm that you are at least 18 years old.', 403);
  return tx(db, async (db) => {
    if (input.steamId) {
      const existing = (await db.prepare('SELECT id FROM users WHERE steam_id = ?').get(input.steamId)) as { id: string } | undefined;
      if (existing) return { userId: existing.id, created: false };
    }
    const settings = await getSettings(db);
    if (!settings.registrationOpen) fail('registration_closed', 'New sign-ups are paused right now. Please try again later.', 403);
    const id = randomBytes(8).toString('hex');
    await db.prepare('INSERT INTO users (id, steam_id, display_name, country, age_confirmed_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, input.steamId ?? null, validateName(input.displayName, settings.chatBlockedWords), input.country, now, now);
    await createSeed(db, id, randomBytes(8).toString('hex'), now);
    if (cfg.demo) await transfer(db, FAUCET, userAccount(id), cfg.demoStartBalance, 'demo_grant', 'signup', now);
    await audit(db, id, 'signup', { steam: Boolean(input.steamId), ageConfirmed: true, country: input.country }, now);
    return { userId: id, created: true };
  });
}

/** Steam accounts carry the Steam persona: name, avatar and profile link follow Steam at every Steam sign-in. */
export async function syncSteamProfile(db: DB, userId: string, p: SteamProfile, now: number): Promise<void> {
  const u = await getUser(db, userId);
  if (!u?.steam_id) return;
  if (u.display_name === p.name && u.steam_name === p.name && u.avatar_url === p.avatarUrl && u.profile_url === p.profileUrl) return;
  await db.prepare('UPDATE users SET display_name = ?, steam_name = ?, avatar_url = ?, profile_url = ? WHERE id = ?').run(p.name, p.name, p.avatarUrl, p.profileUrl, userId);
  if (u.display_name !== p.name) await audit(db, userId, 'steam_profile', { from: u.display_name, to: p.name }, now);
}

/** Where skin offers go. Only a trade URL of the account's own SteamID is accepted. */
export async function setTradeUrl(db: DB, userId: string, raw: unknown, now: number): Promise<string> {
  const u = (await getUser(db, userId)) ?? fail('not_found', 'Account not found.', 404);
  if (!u.steam_id) fail('steam_required', 'Sign in with Steam to add a trade URL.', 403);
  const url = parseTradeUrl(raw, u.steam_id!) ?? fail('invalid_trade_url', 'That is not the trade URL of your Steam account. Copy it from Steam → Inventory → Trade Offers → Who can send me trade offers?');
  if (url !== u.trade_url) {
    await db.prepare('UPDATE users SET trade_url = ? WHERE id = ?').run(url, userId);
    await audit(db, userId, 'trade_url', { set: true }, now);
  }
  return url;
}

export async function createSession(db: DB, cfg: Config, userId: string, now: number): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await db.prepare('INSERT INTO sessions (token_hash, user_id, started_at, expires_at) VALUES (?, ?, ?, ?)').run(hashToken(token), userId, now, now + cfg.sessionTtlHours * 3_600_000);
  return token;
}

export async function resolveSession(db: DB, token: string | undefined, now: number): Promise<Session | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const s = (await db.prepare('SELECT user_id, started_at, mfa_at, mfa_step, last_seen FROM sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash, now)) as { user_id: string; started_at: number; mfa_at: number | null; mfa_step: number | null; last_seen: number | null } | undefined;
  if (!s) return null;
  // presence for "players online": one write per session and minute at most
  if (s.last_seen === null || now - Number(s.last_seen) >= 60_000) await db.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').run(now, tokenHash);
  const user = await getUser(db, s.user_id);
  return user ? { user, startedAt: s.started_at, mfaAt: s.mfa_at ?? null, mfaStep: s.mfa_step ?? null, tokenHash } : null;
}

export async function endSession(db: DB, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

/** Demo only: tops the balance back up once per 24 h when it has fallen below the refill amount. */
export async function demoRefill(db: DB, cfg: Config, userId: string, now: number): Promise<number> {
  if (!cfg.demo) fail('not_demo', 'Demo mode only.', 403);
  return tx(db, async (db) => {
    const u = (await getUser(db, userId))!;
    if (u.last_refill_at && now - u.last_refill_at < 86_400_000) fail('refill_wait', 'Refills are available once every 24 hours.', 429, { nextAt: u.last_refill_at + 86_400_000 });
    const bal = await balanceOf(db, userAccount(userId));
    if (bal >= cfg.demoRefill) fail('refill_not_needed', 'You still have enough demo balance.', 400);
    await transfer(db, FAUCET, userAccount(userId), cfg.demoRefill - bal, 'demo_grant', 'refill', now);
    await db.prepare('UPDATE users SET last_refill_at = ? WHERE id = ?').run(now, userId);
    return balanceOf(db, userAccount(userId));
  });
}
