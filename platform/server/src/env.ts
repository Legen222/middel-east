/**
 * Configuration from the environment, shared by the API (main.ts) and the trade bot (bot-main.ts).
 * See main.ts for the API variables; the skin rail adds:
 *   STEAM_API_KEY        Steam Web API key: name, avatar and profile link at Steam sign-in
 *   STEAM_LOGIN          offer "Sign in with Steam" (default: on with an API key or outside the demo)
 *   SKINS=true           skin deposits and withdrawals (only outside the demo, so only with LICENCE_ID)
 *   DEPOSIT_RATE=1       share of the market price credited per deposited item
 *   WITHDRAW_RATE=1      price factor for items taken from the site's stock
 *   SKIN_MIN_ITEM=10     cheapest item accepted, in Scrap
 *   KYC_BEFORE_DEPOSIT   default true; whether the licence allows later checks is the licence holder's call
 *   PRICE_FEED_URL       default Skinport's public Rust price list
 *   INVENTORY_URL        default Steam's community inventory endpoint ({steamid} is replaced)
 */
import { type Config, DEFAULT_CONFIG } from './config';

type Env = Record<string, string | undefined>;
export const flag = (v: string | undefined, dflt: boolean) => (v === undefined || v === '' ? dflt : /^(1|true|yes|on)$/i.test(v));

function exit(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function num(env: Env, key: string, dflt: number, min: number, max: number): number {
  const v = env[key];
  if (v === undefined || v === '') return dflt;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : exit(`${key} must be a number from ${min} to ${max}.`);
}

export function configFromEnv(env: Env): Config {
  const demo = flag(env.DEMO, true);
  if (!demo && !env.LICENCE_ID) {
    exit('DEMO=false needs LICENCE_ID: real money stays off until a licence, KYC provider and payment rails exist (docs/platform/05-go-live.md).');
  }
  if (flag(env.SKINS, false) && demo) exit('SKINS=true needs DEMO=false: skins have real value, so the skin rail only runs under a licence.');
  const d = DEFAULT_CONFIG.skins;
  return {
    ...DEFAULT_CONFIG,
    demo,
    requireOperatorMfa: flag(env.REQUIRE_OPERATOR_MFA, !demo),
    operatorIpAllowlist: (env.OPERATOR_IP_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: flag(env.TRUST_PROXY, false),
    steamApiKey: env.STEAM_API_KEY || null,
    steamLogin: flag(env.STEAM_LOGIN, Boolean(env.STEAM_API_KEY) || !demo),
    skins: {
      ...d,
      enabled: flag(env.SKINS, false),
      depositRate: num(env, 'DEPOSIT_RATE', d.depositRate, 0.5, 1),
      withdrawRate: num(env, 'WITHDRAW_RATE', d.withdrawRate, 1, 2),
      minItemFrags: num(env, 'SKIN_MIN_ITEM', d.minItemFrags, 1, 100_000),
      kycBeforeDeposit: flag(env.KYC_BEFORE_DEPOSIT, d.kycBeforeDeposit),
      priceUrl: env.PRICE_FEED_URL || d.priceUrl,
      inventoryUrl: env.INVENTORY_URL || d.inventoryUrl,
    },
  };
}
