/** Typed client for the demo API. The token lives in localStorage; every call is same-origin via /api. */

export interface ApiError { error: string; message: string; details?: Record<string, unknown> }

export class RequestError extends Error {
  constructor(readonly status: number, readonly body: ApiError) { super(body.message); }
}

const BASE = import.meta.env.VITE_API_BASE ?? '/api';
const KEY = 'scrapline.token';

export const token = {
  get(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(t: string | null) { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* storage blocked */ } },
};

export async function api<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const t = token.get();
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ error: 'network', message: 'No connection to the server.' }));
  if (!res.ok) {
    if (res.status === 401 && t) { token.set(null); dispatchEvent(new Event('scrapline:unauthorized')); }
    throw new RequestError(res.status, json as ApiError);
  }
  return json as T;
}

/* ---------- response shapes ---------- */

export interface Fairness { serverSeedHash?: string; clientSeed?: string; nonce: number; serverSeed?: string | null }
export interface Bet<R = any> {
  id: string; game: string; status: 'open' | 'settled'; stake: number; payout: number; multiplier: number;
  params: any; result: R | null; createdAt: number; settledAt: number | null; fairness: Fairness;
}
export interface MinesBet extends Bet { mines: number; revealed?: number[]; currentMultiplier?: number; nextMultiplier?: number }
export interface RaidBet extends Bet { layersBreached?: number; nextLayer?: string; currentMultiplier?: number }

export interface Session { startedAt: number; elapsedMs: number; bets: number; wagered: number; net: number; realityCheckMinutes: number; nextRealityCheckAt: number }
export interface Me {
  id: string; displayName: string; steamLinked: boolean; kycLevel: number; balance: number; level: number;
  seed: { serverSeedHash: string; clientSeed: string; nextNonce: number };
  session: Session; block: { kind: string; until: number | null } | null; promoEligible: boolean;
  role: 'player' | 'moderator' | 'admin';
  mfa: { enrolled: boolean; fresh: boolean; required: boolean };
  /** Steam accounts: persona and links from Steam, refreshed at every Steam sign-in. */
  steam?: { id: string; name: string | null; avatarUrl: string | null; profileUrl: string | null; tradeUrl: string | null } | null;
}
export interface SkinRail { enabled: boolean; depositRate: number; withdrawRate: number; minItem: number; maxItems: number; kycBeforeDeposit: boolean }
export interface CaseInfo { id: string; name: string; version: number; price: number; rtp: number; items: { name: string; value: number; chance: number }[] }
export interface PublicConfig {
  demo: boolean; currency: string; fragsPerDollar: number; minStake: number; maxStake: number; maxWin: number; demoStartBalance: number;
  games: string[]; houseEdge: Record<string, number>; operatorMfa: boolean;
  plinko: Record<string, Record<string, { multipliers: number[]; rtp: number }>>;
  cases: CaseInfo[];
  /** Item name → Steam market icon hash, for items that have one. */
  itemIcons?: Record<string, string>;
  /** Stake range and max win per game after per-game limits (Scrap). */
  limits: Record<string, { minStake: number; maxStake: number; maxWin: number }>;
  responsibleGambling: { realityCheckOptions: number[]; limitIncreaseDelayHours: number };
  steamLogin?: boolean;
  skins?: SkinRail;
}
