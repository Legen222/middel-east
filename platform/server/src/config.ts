/**
 * Money: all amounts are integer milli-Frags (mF). 1 Frag = 1 000 mF = 0.01 $.
 * Payouts are floored to whole mF, so rounding never favours the player and costs at most 0.001 Frag per bet.
 */
export const MF_PER_FRAG = 1000;
export const frags = (n: number): number => Math.round(n * MF_PER_FRAG);
/** mF → "1,234.50" for server-written text (chat, audit). */
export const fmtFrags = (mf: number): string => (mf / MF_PER_FRAG).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface Config {
  /** Demo mode: no deposits/withdrawals of skins, crypto or cards; balance comes from the faucet. */
  demo: boolean;
  minStake: number; // mF
  maxStake: number; // mF
  /** Liability cap per bet. A bet is refused if it *could* pay more; stateful games refuse the next step. */
  maxWin: number; // mF
  demoStartBalance: number; // mF
  demoRefill: number; // mF, once per 24 h when balance is below it
  /** ISO-3166 alpha-2. Always blocked, demo included (sanctions). */
  sanctioned: string[];
  /** Blocked for real-money play only (licence scope; final list comes with the chosen licence). */
  realMoneyBlocked: string[];
  /** Header set by the trusted edge (e.g. Cloudflare CF-IPCountry). Never trust a client-supplied value elsewhere. */
  countryHeader: string;
  /** Hours before a raised or removed RG limit takes effect. */
  limitIncreaseDelayHours: number;
  /** KYC: cumulative deposits (mF) above which ID verification is required before any withdrawal. */
  kycDepositThreshold: number;
  /** AML: wager at least this multiple of deposits since the last withdrawal before withdrawing. */
  amlWagerMultiple: number;
  /** AML: single deposit at or above this raises a review flag. */
  amlLargeDeposit: number;
  sessionTtlHours: number;
  /** RG case queue triggers (admin backoffice). */
  rgAlert: { netLoss24h: number; limitRaises30d: number; sessionHours: number };
  /** Backoffice and moderation need a TOTP step-up in the current session (always on outside the demo). */
  requireOperatorMfa: boolean;
  operatorMfaMaxAgeMinutes: number;
  /** Source IPs/CIDRs allowed to reach /admin and /mod (empty = no restriction). */
  operatorIpAllowlist: string[];
  /** Take the client IP from X-Forwarded-For (only behind a proxy that overwrites it). */
  trustProxy: boolean;
}

export const DEFAULT_CONFIG: Config = {
  demo: true,
  minStake: frags(1),
  maxStake: frags(100_000), // 1 000 $
  maxWin: frags(1_000_000), // 10 000 $
  demoStartBalance: frags(100_000),
  demoRefill: frags(100_000),
  sanctioned: ['KP', 'IR', 'SY', 'CU'],
  realMoneyBlocked: ['US', 'GB', 'FR', 'NL', 'DE', 'AU', 'ES', 'IT', 'BE', 'DK', 'SE', 'PT', 'CH', 'AT', 'SG', 'TR', 'IL'],
  countryHeader: 'cf-ipcountry',
  limitIncreaseDelayHours: 24,
  kycDepositThreshold: frags(200_000), // 2 000 $
  amlWagerMultiple: 1,
  amlLargeDeposit: frags(100_000), // 1 000 $
  sessionTtlHours: 24 * 7,
  rgAlert: { netLoss24h: frags(50_000), limitRaises30d: 3, sessionHours: 3 },
  requireOperatorMfa: false,
  operatorMfaMaxAgeMinutes: 12 * 60,
  operatorIpAllowlist: [],
  trustProxy: false,
};

/** IPv4 CIDR or exact-address match (IPv6 exact only; IPv4-mapped IPv6 is unwrapped). */
export function ipAllowed(ip: string, list: string[]): boolean {
  if (!list.length) return true;
  const v4 = ip.replace(/^::ffff:/, '');
  const num = (a: string) => a.split('.').reduce((n, o) => n * 256 + Number(o), 0);
  return list.some((entry) => {
    const [base, bits] = entry.split('/');
    if (!bits) return base === v4 || base === ip;
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(v4) || !/^\d+\.\d+\.\d+\.\d+$/.test(base)) return false;
    const b = Number(bits);
    const mask = b === 0 ? 0 : (0xffffffff << (32 - b)) >>> 0;
    return ((num(v4) & mask) >>> 0) === ((num(base) & mask) >>> 0);
  });
}

export type Clock = () => number; // ms since epoch
export const systemClock: Clock = () => Date.now();
