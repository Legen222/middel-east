/**
 * Geo-blocking, KYC and AML hooks.
 *
 * Geo: the country comes only from the trusted edge header (Cloudflare CF-IPCountry or the load
 * balancer's GeoIP). Sanctioned countries are blocked everywhere; the licence list applies to real money.
 * VPN/proxy detection and the player's KYC address (which wins over IP once verified) come on top in production.
 *
 * KYC levels
 *   0  18+ self-declared (demo only)
 *   1  ID document + liveness + address, required before the first real-money deposit
 *   2  source of funds / wealth, required above the cumulative deposit threshold
 *
 * AML (withdrawal preconditions, shown to the player in plain words before depositing):
 *   - wager at least amlWagerMultiple × deposits since the last withdrawal (anti money-mule)
 *   - withdrawals go only to the deposit rail or a verified skin trade URL of the same Steam account
 *   - large or structured deposits raise an audit flag for manual review
 */

import type { Config } from './config';
import { type DB, audit } from './db';
import { fail } from './errors';
import type { UserRow } from './accounts';

export function checkGeo(cfg: Config, country: string | null, realMoney: boolean): void {
  const c = (country ?? '').toUpperCase();
  if (cfg.sanctioned.includes(c)) fail('geo_blocked', 'SCRAPLINE is not available in your country.', 451, { country: c });
  if (realMoney && (c === '' || c === 'XX' || c === 'T1' || cfg.realMoneyBlocked.includes(c))) {
    fail('geo_blocked', 'Real-money play is not allowed in your country. Demo mode stays available.', 451, { country: c });
  }
}

export interface KycProvider {
  /** Starts a verification and returns the provider's hosted URL for the player. */
  start(userId: string, level: 1 | 2): Promise<{ url: string; reference: string }>;
  /** Parses and authenticates a provider webhook; returns the new level or null if still pending/declined. */
  webhook(headers: Record<string, string>, body: string): Promise<{ userId: string; level: 0 | 1 | 2 } | null>;
}

/** Demo provider: never verifies anyone. Real providers (Sumsub, Veriff, Onfido) implement the same interface. */
export const demoKyc: KycProvider = {
  async start() { return fail('not_available', 'Verification is not needed in demo mode.', 400); },
  async webhook() { return null; },
};

export interface WithdrawalCheck { allowed: boolean; reasons: { code: string; message: string }[] }

export async function withdrawalCheck(db: DB, cfg: Config, user: UserRow, amount: number): Promise<WithdrawalCheck> {
  const reasons: WithdrawalCheck['reasons'] = [];
  if (cfg.demo) reasons.push({ code: 'demo', message: 'There are no withdrawals in demo mode. Demo balance has no value.' });
  const account = `user:${user.id}`;
  const lastW = ((await db.prepare("SELECT COALESCE(MAX(created_at), 0) AS t FROM ledger WHERE account = ? AND kind = 'withdrawal'").get(account)) as { t: number }).t;
  const deposits = ((await db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE account = ? AND kind = 'deposit' AND amount > 0 AND created_at > ?").get(account, lastW)) as { s: number }).s;
  const allDeposits = ((await db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE account = ? AND kind = 'deposit' AND amount > 0").get(account)) as { s: number }).s;
  const wagered = ((await db.prepare('SELECT COALESCE(SUM(stake), 0) AS s FROM wagers WHERE user_id = ? AND created_at > ?').get(user.id, lastW)) as { s: number }).s;
  if (user.kyc_level < 1) reasons.push({ code: 'kyc_1', message: 'Please verify your identity (ID document and selfie).' });
  if (allDeposits > cfg.kycDepositThreshold && user.kyc_level < 2) reasons.push({ code: 'kyc_2', message: 'Above this deposit total we need proof of the source of your funds.' });
  if (wagered < deposits * cfg.amlWagerMultiple) {
    reasons.push({ code: 'aml_wager', message: `Wager your deposits at least once before withdrawing (${(deposits * cfg.amlWagerMultiple - wagered) / 1000} Frags to go).` });
  }
  if (amount <= 0) reasons.push({ code: 'invalid_amount', message: 'Amount must be positive.' });
  return { allowed: reasons.length === 0, reasons };
}

/** AML monitoring hook for deposits (real money). Flags, never blocks silently. */
export async function flagDeposit(db: DB, cfg: Config, userId: string, amount: number, now: number): Promise<string[]> {
  const flags: string[] = [];
  if (amount >= cfg.amlLargeDeposit) flags.push('large_deposit');
  const recent = (await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE account = ? AND kind = 'deposit' AND amount > 0 AND created_at > ?").get(`user:${userId}`, now - 86_400_000)) as { n: number };
  if (recent.n >= 5) flags.push('structuring_pattern');
  if (flags.length) await audit(db, userId, 'aml_flag', { amount, flags }, now);
  return flags;
}
