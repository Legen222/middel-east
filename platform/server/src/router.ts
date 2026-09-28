/**
 * API routes, independent of the transport. `dispatch` takes a parsed request and returns status + JSON.
 * Order per request: rate limit (per IP) → geo check → auth (Bearer session token) → handler.
 * Errors are { error: code, message, details? } with a matching HTTP status.
 * node:http (http.ts) and the in-browser demo (platform/web/demo) both call dispatch.
 */

import { PLINKO_TABLES, SAMPLE_CASES, caseRtp, plinkoTheoreticalRtp, priceCase, EDGE, type RaidTool } from '../../engine/src/index';
import { createSession, demoRefill, endSession, resolveSession, signUp, type UserRow } from './accounts';
import {
  GAMES, activeSeedPublic, balance, getBet, liveRtp, openGames, minesCashout, minesReveal, minesStart, playInstant,
  publicBet, raidBlast, raidCashout, raidStart, type InstantParams,
} from './bets';
import { checkGeo, withdrawalCheck } from './compliance';
import { type Clock, type Config, MF_PER_FRAG } from './config';
import type { DB } from './db';
import { AppError, fail } from './errors';
import { REALITY_CHECK_OPTIONS, activeBlock, getLimits, promoEligible, selfExclude, sessionSummary, setLimit, setRealityCheck, startCooldown, type LimitKind, type LimitPeriod } from './rg';
import type { Beacon } from './beacon';
import type { CrashService } from './crash';
import { cancelGame, createBattle, createCoinflip, joinGame, listGames, publicGame, settleDue } from './pvp';
import { DAILY_CASE, RAKEBACK_BANDS, claimCrew, claimRakeback, createCrewCode, crewState, joinRain, openDaily, progress, rainState, redeemCrewCode } from './rewards';
import { rotateSeed } from './seeds';
import { type Fetch, loginUrl, verifyAssertion } from './steam';

export interface AppDeps { db: DB; cfg: Config; clock: Clock; fetch: Fetch; publicUrl: string; beacon: Beacon; crash: CrashService }

interface Ctx {
  url: URL; body: any; ip: string; country: string | null; token?: string;
  auth: () => { user: UserRow; startedAt: number };
}

export interface ApiRequest { method: string; url: string; headers: Record<string, string | undefined>; body: unknown; ip: string }
export interface ApiResponse { status: number; payload: unknown }

export function createRouter(deps: AppDeps) {
  const { db, cfg, clock } = deps;
  const routes: { method: string; pattern: RegExp; keys: string[]; handler: (c: Ctx, p: Record<string, string>) => unknown }[] = [];
  const route = (method: string, path: string, handler: (c: Ctx, p: Record<string, string>) => unknown) => {
    const keys: string[] = [];
    const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([A-Za-z0-9_-]+)'; }) + '$');
    routes.push({ method, pattern, keys, handler });
  };
  const num = (v: unknown, name: string) => (typeof v === 'number' && Number.isFinite(v) ? v : fail('invalid_params', `${name} fehlt oder ist keine Zahl.`));
  const stakeMf = (v: unknown) => Math.round(num(v, 'stake') * MF_PER_FRAG); // API takes Frags, stores mF

  /* ---------- public ---------- */
  route('GET', '/health', () => ({ ok: true, demo: cfg.demo }));
  route('GET', '/config', () => ({
    demo: cfg.demo, currency: 'Frags', fragsPerDollar: 100, minStake: cfg.minStake / MF_PER_FRAG, maxStake: cfg.maxStake / MF_PER_FRAG, maxWin: cfg.maxWin / MF_PER_FRAG,
    games: GAMES, houseEdge: EDGE,
    plinko: Object.fromEntries(Object.entries(PLINKO_TABLES).map(([r, t]) => [r, Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { multipliers: v, rtp: plinkoTheoreticalRtp(Number(r) as 8, k as 'low') }]))])),
    cases: SAMPLE_CASES.map((c) => { const W = c.items.reduce((s, i) => s + i.weight, 0); return { id: c.id, name: c.name, price: priceCase(c), rtp: caseRtp(c), items: c.items.map((i) => ({ name: i.name, value: i.value, chance: i.weight / W })) }; }),
    responsibleGambling: { realityCheckOptions: REALITY_CHECK_OPTIONS, limitIncreaseDelayHours: cfg.limitIncreaseDelayHours },
  }));
  route('GET', '/stats/rtp', (c) => {
    const days = Math.min(90, Math.max(1, Number(c.url.searchParams.get('days') ?? 30)));
    return { days, games: liveRtp(db, clock() - days * 86_400_000).map((g) => ({ ...g, theory: theoryRtp(g.game) })) };
  });
  route('GET', '/bets/:id', (_c, p) => { const b = getBet(db, p.id) ?? fail('not_found', 'Bet not found.', 404); const pb = publicBet(b, db); return b.status === 'open' ? { ...pb, result: null } : pb; });

  /* ---------- auth ---------- */
  route('POST', '/auth/demo', (c) => {
    const { userId } = signUp(db, cfg, { displayName: String(c.body?.displayName ?? ''), ageConfirmed: c.body?.ageConfirmed === true, country: c.country }, clock());
    return { token: createSession(db, cfg, userId, clock()), userId };
  });
  route('GET', '/auth/steam', () => ({ url: loginUrl(`${deps.publicUrl}/auth/steam/return?age=1`, deps.publicUrl) }));
  route('GET', '/auth/steam/return', async (c) => {
    const { steamId } = await verifyAssertion(db, c.url.searchParams, `${deps.publicUrl}/auth/steam/return`, deps.fetch, clock())
      .catch((e: Error) => fail('steam_login_failed', 'Steam login failed. Please try again.', 401, { reason: e.message }));
    const { userId } = signUp(db, cfg, { displayName: `Steam ${steamId.slice(-4)}`, ageConfirmed: c.url.searchParams.get('age') === '1', steamId, country: c.country }, clock());
    return { token: createSession(db, cfg, userId, clock()), userId };
  });
  route('POST', '/auth/logout', (c) => { c.auth(); endSession(db, c.token!); return { ok: true }; });

  /* ---------- account ---------- */
  route('GET', '/me', (c) => {
    const { user, startedAt } = c.auth();
    return {
      id: user.id, displayName: user.display_name, steamLinked: Boolean(user.steam_id), kycLevel: user.kyc_level,
      balance: balance(db, user.id) / MF_PER_FRAG, seed: activeSeedPublic(db, user.id), level: progress(db, user.id).level,
      session: fmtSession(sessionSummary(db, user.id, startedAt, clock())), block: activeBlock(db, user.id, clock()), promoEligible: promoEligible(db, user.id, clock()),
    };
  });
  route('POST', '/demo/refill', (c) => ({ balance: demoRefill(db, cfg, c.auth().user.id, clock()) / MF_PER_FRAG }));
  route('GET', '/wallet/withdrawal-check', (c) => withdrawalCheck(db, cfg, c.auth().user, Math.round(Number(c.url.searchParams.get('amount') ?? 0) * MF_PER_FRAG)));

  /* ---------- seeds ---------- */
  route('GET', '/seed', (c) => activeSeedPublic(db, c.auth().user.id));
  route('POST', '/seed/rotate', (c) => rotateSeed(db, c.auth().user.id, c.body?.clientSeed ? String(c.body.clientSeed) : null, clock()));

  /* ---------- games ---------- */
  for (const g of ['dice', 'plinko', 'upgrader', 'cases'] as (keyof InstantParams)[]) {
    route('POST', `/bets/${g}`, (c) => {
      const { user } = c.auth();
      const stake = g === 'cases' ? cfg.minStake : stakeMf(c.body?.stake);
      return fmtMoney(publicBet(playInstant(db, cfg, user.id, g, stake, c.body?.params ?? {}, clock()), db));
    });
  }
  route('POST', '/mines/start', (c) => fmtMoney(minesStart(db, cfg, c.auth().user.id, stakeMf(c.body?.stake), num(c.body?.mines, 'mines'), clock())));
  route('POST', '/mines/:id/reveal', (c, p) => fmtMoney(minesReveal(db, cfg, c.auth().user.id, p.id, num(c.body?.tile, 'tile'), clock())));
  route('POST', '/mines/:id/cashout', (c, p) => fmtMoney(minesCashout(db, c.auth().user.id, p.id, clock())));
  route('POST', '/raid/start', (c) => fmtMoney(raidStart(db, cfg, c.auth().user.id, stakeMf(c.body?.stake), clock())));
  route('POST', '/raid/:id/blast', (c, p) => fmtMoney(raidBlast(db, cfg, c.auth().user.id, p.id, String(c.body?.tool) as RaidTool, clock())));
  route('POST', '/raid/:id/cashout', (c, p) => fmtMoney(raidCashout(db, c.auth().user.id, p.id, clock())));
  route('GET', '/games/open', (c) => openGames(db, c.auth().user.id).map((g) => fmtMoney(g)));
  route('GET', '/bets', (c) => {
    const { user } = c.auth();
    const limit = Math.min(100, Math.max(1, Number(c.url.searchParams.get('limit') ?? 20)));
    const rows = db.prepare('SELECT id FROM bets WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?').all(user.id, limit) as { id: string }[];
    return rows.map((r) => { const b = getBet(db, r.id)!; return fmtMoney(b.status === 'open' ? { ...publicBet(b, db), result: null } : publicBet(b, db)); });
  });

  /* ---------- PvP ---------- */
  const viewer = (c: Ctx) => resolveSession(db, c.token, clock())?.user.id ?? null;
  route('GET', '/pvp/list/:type', async (c, p) => {
    if (p.type !== 'coinflip' && p.type !== 'battle') fail('not_found', 'Unknown game type.', 404);
    await settleDue(db, deps.beacon, clock());
    return listGames(db, deps.beacon, p.type as 'coinflip' | 'battle', clock() - 10 * 60_000, viewer(c));
  });
  route('GET', '/pvp/game/:id', async (c, p) => { await settleDue(db, deps.beacon, clock()); return publicGame(db, deps.beacon, p.id, viewer(c)); });
  route('POST', '/pvp/coinflip', (c) => { const u = c.auth().user.id; return publicGame(db, deps.beacon, createCoinflip(db, cfg, u, stakeMf(c.body?.stake), c.body?.side, clock()), u); });
  route('POST', '/pvp/battle', (c) => { const u = c.auth().user.id; return publicGame(db, deps.beacon, createBattle(db, cfg, u, c.body?.caseIds, num(c.body?.seats, 'seats'), c.body?.mode, clock()), u); });
  route('POST', '/pvp/:id/join', (c, p) => { const u = c.auth().user.id; return publicGame(db, deps.beacon, joinGame(db, cfg, deps.beacon, p.id, u, clock()), u); });
  route('POST', '/pvp/:id/bot', (c, p) => {
    const u = c.auth().user.id;
    const g = publicGame(db, deps.beacon, p.id, u);
    if (!g.mine) fail('forbidden', 'Only the creator can add a bot.', 403);
    return publicGame(db, deps.beacon, joinGame(db, cfg, deps.beacon, p.id, null, clock()), u);
  });
  route('POST', '/pvp/:id/cancel', (c, p) => { const u = c.auth().user.id; return publicGame(db, deps.beacon, cancelGame(db, p.id, u, clock()), u); });

  /* ---------- crash ---------- */
  route('GET', '/crash/state', (c) => deps.crash.state(clock(), viewer(c)));
  route('POST', '/crash/bet', (c) => deps.crash.placeBet(c.auth().user.id, stakeMf(c.body?.stake), Math.round(num(c.body?.target, 'target') * 100), clock()));
  route('POST', '/crash/cashout', (c) => deps.crash.cashout(c.auth().user.id, clock()));

  /* ---------- rewards ---------- */
  route('GET', '/rewards', (c) => {
    const u = c.auth().user.id;
    const p = progress(db, u);
    const lastDaily = db.prepare("SELECT created_at AS t FROM reward_claims WHERE user_id = ? AND kind = 'daily' ORDER BY created_at DESC LIMIT 1").get(u) as { t: number } | undefined;
    const W = DAILY_CASE.items.reduce((s, i) => s + i.weight, 0);
    const crew = crewState(db, u);
    return {
      ...p, rakebackAvailable: p.rakebackAvailable / MF_PER_FRAG, rakebackBands: RAKEBACK_BANDS,
      daily: { nextAt: lastDaily ? lastDaily.t + 86_400_000 : 0, items: DAILY_CASE.items.map((i) => ({ name: i.name, value: i.value, chance: i.weight / W })) },
      rain: rainState(db, u, clock()), promoEligible: promoEligible(db, u, clock()),
      crew: { ...crew, ngr: crew.ngr / MF_PER_FRAG, available: crew.available / MF_PER_FRAG },
    };
  });
  route('POST', '/rewards/rakeback', (c) => { const r = claimRakeback(db, c.auth().user.id, clock()); return { amount: r.amount / MF_PER_FRAG }; });
  route('POST', '/rewards/daily', (c) => openDaily(db, c.auth().user.id, clock()));
  route('POST', '/rewards/rain', (c) => joinRain(db, c.auth().user.id, clock()));
  route('POST', '/crew/code', (c) => createCrewCode(db, c.auth().user.id, String(c.body?.code ?? ''), clock()));
  route('POST', '/crew/redeem', (c) => redeemCrewCode(db, c.auth().user.id, String(c.body?.code ?? ''), clock()));
  route('POST', '/crew/claim', (c) => { const r = claimCrew(db, c.auth().user.id, clock()); return { amount: r.amount / MF_PER_FRAG }; });

  /* ---------- responsible gambling ---------- */
  route('GET', '/rg', (c) => {
    const { user, startedAt } = c.auth();
    return { limits: getLimits(db, user.id, clock()).map((l) => ({ ...l, amount: l.amount === null ? null : l.amount / MF_PER_FRAG, used: l.used / MF_PER_FRAG, pending: l.pending && { ...l.pending, amount: l.pending.amount === null ? null : l.pending.amount / MF_PER_FRAG } })),
      block: activeBlock(db, user.id, clock()), session: fmtSession(sessionSummary(db, user.id, startedAt, clock())) };
  });
  route('PUT', '/rg/limits', (c) => {
    const { user } = c.auth();
    const amount = c.body?.amount === null ? null : Math.round(num(c.body?.amount, 'amount') * MF_PER_FRAG);
    return setLimit(db, cfg, user.id, c.body?.kind as LimitKind, c.body?.period as LimitPeriod, amount, clock());
  });
  route('POST', '/rg/cooldown', (c) => startCooldown(db, c.auth().user.id, num(c.body?.hours, 'hours'), clock()));
  route('POST', '/rg/exclusion', (c) => selfExclude(db, c.auth().user.id, c.body?.months === null ? null : (num(c.body?.months, 'months') as 6 | 12 | 60), clock()));
  route('PUT', '/rg/reality-check', (c) => { setRealityCheck(db, c.auth().user.id, num(c.body?.minutes, 'minutes'), clock()); return { ok: true }; });

  /* ---------- plumbing ---------- */
  const buckets = new Map<string, { tokens: number; at: number }>();
  const rateLimited = (ip: string) => {
    const now = clock(); const b = buckets.get(ip) ?? { tokens: 40, at: now };
    b.tokens = Math.min(40, b.tokens + ((now - b.at) / 1000) * 20); b.at = now;
    if (b.tokens < 1) { buckets.set(ip, b); return true; }
    b.tokens -= 1; buckets.set(ip, b); return false;
  };

  async function dispatch(req: ApiRequest): Promise<ApiResponse> {
    try {
      if (rateLimited(req.ip)) fail('rate_limited', 'Too many requests. Please wait a moment.', 429);
      const url = new URL(req.url, 'http://local');
      const country = req.headers[cfg.countryHeader]?.toUpperCase() ?? null;
      if (url.pathname !== '/health') checkGeo(cfg, country, !cfg.demo);
      const token = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization ?? '')?.[1];
      const ctx: Ctx = { url, body: req.body, ip: req.ip, country, token, auth: () => resolveSession(db, token, clock()) ?? fail('unauthorized', 'Please sign in.', 401) };
      for (const r of routes) {
        const m = r.method === req.method ? r.pattern.exec(url.pathname) : null;
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
        return { status: 200, payload: await r.handler(ctx, params) };
      }
      return fail('not_found', 'Unknown endpoint.', 404);
    } catch (e) {
      if (e instanceof AppError) return { status: e.status, payload: { error: e.code, message: e.message, details: e.details } };
      if (e instanceof RangeError) return { status: 400, payload: { error: 'invalid_params', message: e.message } };
      console.error(e);
      return { status: 500, payload: { error: 'internal', message: 'Internal error.' } };
    }
  }

  /** Geo check for transports that open a stream before dispatching (SSE). */
  const streamAllowed = (headers: Record<string, string | undefined>) => {
    try { checkGeo(cfg, headers[cfg.countryHeader]?.toUpperCase() ?? null, !cfg.demo); return true; } catch { return false; }
  };

  return { dispatch, streamAllowed, crash: deps.crash };
}

const theoryRtp = (g: string) => ({ dice: 1 - EDGE.dice, plinko: null, upgrader: 1 - EDGE.upgrader, cases: null, mines: 1 - EDGE.mines, raid: 1 - EDGE.raid } as Record<string, number | null>)[g] ?? null;
const fmtSession = (s: ReturnType<typeof sessionSummary>) => ({ ...s, wagered: s.wagered / MF_PER_FRAG, net: s.net / MF_PER_FRAG });
function fmtMoney<T extends { stake: number; payout: number }>(b: T): T { return { ...b, stake: b.stake / MF_PER_FRAG, payout: b.payout / MF_PER_FRAG }; }
