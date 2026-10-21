/**
 * API routes, independent of the transport. `dispatch` takes a parsed request and returns status + JSON.
 * Order per request: rate limit (per IP) → geo check → auth (Bearer session token) → handler.
 * Backoffice (/admin) and moderation (/mod) additionally check the operator IP allowlist, the role and,
 * when required, a fresh TOTP step-up.
 * Errors are { error: code, message, details? } with a matching HTTP status.
 * node:http (http.ts) and the in-browser demo (platform/web/demo) both call dispatch.
 */

import { PLINKO_TABLES, plinkoTheoreticalRtp, EDGE, type RaidTool } from '../../engine/src/index';
import { type Role, type Session, createSession, demoRefill, endSession, resolveSession, signUp } from './accounts';
import {
  addNote, adjustBalance, auditLog, forceLogout, holdPlayer, listPlayers, overview, playerDetail, releaseHold, requireRole, rgCases, rgScan, rtpMonitor, setRole, updateCase,
} from './admin';
import {
  GAMES, activeSeedPublic, balance, getBet, liveRtp, minesCashout, minesReveal, minesStart, openCases, playInstant,
  publicBet, raidBlast, raidCashout, raidStart, type InstantParams,
} from './bets';
import type { Beacon } from './beacon';
import { adminCases, caseVersion, listCases, previewCase, saveCase, setCaseState } from './cases';
import { type ChainGame, listChains } from './chains';
import { activeMute, deleteMessage, listMessages, mute, postMessage, unmute } from './chat';
import { checkGeo, withdrawalCheck } from './compliance';
import { type Clock, type Config, MF_PER_FRAG, ipAllowed } from './config';
import type { CrashService } from './crash';
import type { DB } from './db';
import { AppError, fail } from './errors';
import { betDetail, exploreBets } from './explorer';
import { type FeedKind, logoutAll, playerBetDetail, playerHistory, playerStats, profile, publicFeed, revealedSeeds, transactions, updateProfile } from './player';
import { GAME_IDS, type GameLimits, gameConfig, gameFlags, setGameFlag, setGameLimits } from './flags';
import { confirm as mfaConfirm, enroll as mfaEnroll, verify as mfaVerify } from './mfa';
import { JackpotService } from './jackpot';
import { bjAction, bjStart, hiloCashout, hiloMove, hiloStart, openRounds, towersCashout, towersPick, towersStart } from './originals';
import { WheelService } from './wheel';
import type { BjAction, TowerLevel, WheelField } from '../../engine/src/index';
import { cancelGame, createBattle, createCoinflip, joinGame, listGames, publicGame, settleDue } from './pvp';
import { dailyReport } from './reports';
import {
  DAILY_CASE, RAKEBACK_BANDS, claimCrew, claimRakeback, createCrewCode, createPromo, crewState, joinRain, listPromos, openDaily, progress, rainState, redeemCrewCode,
  redeemPromo, setPromoActive,
} from './rewards';
import { REALITY_CHECK_OPTIONS, activeBlock, getLimits, promoEligible, selfExclude, sessionSummary, setLimit, setRealityCheck, startCooldown, type LimitKind, type LimitPeriod } from './rg';
import { rotateSeed } from './seeds';
import { getSettings, publicSite, setSettings } from './site';
import { type Fetch, loginUrl, verifyAssertion } from './steam';

export interface AppDeps {
  db: DB; cfg: Config; clock: Clock; fetch: Fetch; publicUrl: string; beacon: Beacon; crash: CrashService;
  /** Live services; created here when the caller does not pass the instances its tickers drive. */
  wheel?: WheelService; jackpot?: JackpotService;
  /** Readiness details for GET /ready (database reachable, leader status, …). */
  ready?: () => Promise<Record<string, unknown>>;
}

interface Ctx {
  url: URL; body: any; ip: string; country: string | null; token?: string;
  auth: () => Promise<Session>;
}

export interface ApiRequest { method: string; url: string; headers: Record<string, string | undefined>; body: unknown; ip: string }
export interface ApiResponse { status: number; payload: unknown }

export function createRouter(deps: AppDeps) {
  const { db, cfg, clock } = deps;
  const wheel = deps.wheel ?? new WheelService(db, cfg, deps.beacon);
  const jackpot = deps.jackpot ?? new JackpotService(db, cfg, deps.beacon);
  const routes: { method: string; pattern: RegExp; keys: string[]; handler: (c: Ctx, p: Record<string, string>) => unknown }[] = [];
  const route = (method: string, path: string, handler: (c: Ctx, p: Record<string, string>) => unknown) => {
    const keys: string[] = [];
    const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([A-Za-z0-9_-]+)'; }) + '$');
    routes.push({ method, pattern, keys, handler });
  };
  const num = (v: unknown, name: string) => (typeof v === 'number' && Number.isFinite(v) ? v : fail('invalid_params', `${name} is missing or not a number.`));
  const stakeMf = (v: unknown) => Math.round(num(v, 'stake') * MF_PER_FRAG); // API takes Frags, stores mF
  const uid = async (c: Ctx) => (await c.auth()).user.id;
  const limitsInFrags = (l: GameLimits) => ({ minStake: l.minStake === null ? null : l.minStake / MF_PER_FRAG, maxStake: l.maxStake === null ? null : l.maxStake / MF_PER_FRAG, maxWin: l.maxWin === null ? null : l.maxWin / MF_PER_FRAG });
  /** Stake range and max win per game after per-game limits, in Frags. */
  const effectiveLimits = async () => {
    const out: Record<string, { minStake: number; maxStake: number; maxWin: number }> = {};
    for (const g of GAME_IDS) { const e = await gameConfig(db, cfg, g); out[g] = { minStake: e.minStake / MF_PER_FRAG, maxStake: e.maxStake / MF_PER_FRAG, maxWin: e.maxWin / MF_PER_FRAG }; }
    return out;
  };
  const viewer = async (c: Ctx) => (await resolveSession(db, c.token, clock()))?.user.id ?? null;

  /* ---------- public ---------- */
  route('GET', '/health', () => ({ ok: true, demo: cfg.demo }));
  route('GET', '/ready', async () => {
    await db.prepare('SELECT 1 AS ok').get();
    return { ok: true, dialect: db.dialect, ...(deps.ready ? await deps.ready() : {}) };
  });
  route('GET', '/config', async () => ({
    demo: cfg.demo, currency: 'Frags', fragsPerDollar: 100, minStake: cfg.minStake / MF_PER_FRAG, maxStake: cfg.maxStake / MF_PER_FRAG, maxWin: cfg.maxWin / MF_PER_FRAG,
    demoStartBalance: cfg.demoStartBalance / MF_PER_FRAG,
    games: GAMES, houseEdge: EDGE, operatorMfa: cfg.requireOperatorMfa,
    plinko: Object.fromEntries(Object.entries(PLINKO_TABLES).map(([r, t]) => [r, Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { multipliers: v, rtp: plinkoTheoreticalRtp(Number(r) as 8, k as 'low') }]))])),
    cases: await listCases(db),
    limits: await effectiveLimits(),
    responsibleGambling: { realityCheckOptions: REALITY_CHECK_OPTIONS, limitIncreaseDelayHours: cfg.limitIncreaseDelayHours },
  }));
  route('GET', '/site', () => publicSite(db));
  route('GET', '/cases', () => listCases(db));
  // any version ever published, so old openings and battles stay verifiable
  route('GET', '/cases/:id/v/:version', async (_c, p) => {
    const v = await caseVersion(db, p.id, num(Number(p.version), 'version'));
    const W = v.items.reduce((s, i) => s + i.weight, 0);
    return { ...v, items: v.items.map((i) => ({ ...i, chance: i.weight / W })) };
  });
  route('GET', '/chains/:game', (_c, p) => {
    if (p.game !== 'crash' && p.game !== 'wheel') fail('not_found', 'Unknown game.', 404);
    return listChains(db, p.game as ChainGame, deps.beacon);
  });
  route('GET', '/stats/rtp', async (c) => {
    const days = Math.min(90, Math.max(1, Number(c.url.searchParams.get('days') ?? 30)));
    return { days, games: (await liveRtp(db, clock() - days * 86_400_000)).map((g) => ({ ...g, theory: theoryRtp(g.game) })) };
  });
  route('GET', '/bets/:id', async (_c, p) => {
    const b = (await getBet(db, p.id)) ?? fail('not_found', 'Bet not found.', 404);
    const pb = await publicBet(b, db);
    return b.status === 'open' ? { ...pb, result: null } : pb;
  });

  /* ---------- auth ---------- */
  route('POST', '/auth/demo', async (c) => {
    const { userId } = await signUp(db, cfg, { displayName: String(c.body?.displayName ?? ''), ageConfirmed: c.body?.ageConfirmed === true, country: c.country }, clock());
    return { token: await createSession(db, cfg, userId, clock()), userId };
  });
  route('GET', '/auth/steam', () => ({ url: loginUrl(`${deps.publicUrl}/auth/steam/return?age=1`, deps.publicUrl) }));
  route('GET', '/auth/steam/return', async (c) => {
    const { steamId } = await verifyAssertion(db, c.url.searchParams, `${deps.publicUrl}/auth/steam/return`, deps.fetch, clock())
      .catch((e: Error) => fail('steam_login_failed', 'Steam login failed. Please try again.', 401, { reason: e.message }));
    const { userId } = await signUp(db, cfg, { displayName: `Steam ${steamId.slice(-4)}`, ageConfirmed: c.url.searchParams.get('age') === '1', steamId, country: c.country }, clock());
    return { token: await createSession(db, cfg, userId, clock()), userId };
  });
  route('POST', '/auth/logout', async (c) => { await c.auth(); await endSession(db, c.token!); return { ok: true }; });

  /* ---------- operator MFA ---------- */
  route('POST', '/mfa/enroll', async (c) => { const s = await c.auth(); requireRole(s.user, 'moderator', 'admin'); return mfaEnroll(db, s, 'SCRAPLINE', clock()); });
  route('POST', '/mfa/confirm', async (c) => { const s = await c.auth(); requireRole(s.user, 'moderator', 'admin'); return mfaConfirm(db, s, String(c.body?.code ?? ''), clock()); });
  route('POST', '/mfa/verify', async (c) => { const s = await c.auth(); requireRole(s.user, 'moderator', 'admin'); return mfaVerify(db, s, String(c.body?.code ?? ''), clock()); });

  /* ---------- account ---------- */
  route('GET', '/me', async (c) => {
    const { user, startedAt, mfaAt } = await c.auth();
    return {
      id: user.id, displayName: user.display_name, role: user.role, steamLinked: Boolean(user.steam_id), kycLevel: user.kyc_level,
      balance: (await balance(db, user.id)) / MF_PER_FRAG, seed: await activeSeedPublic(db, user.id), level: (await progress(db, user.id)).level,
      session: fmtSession(await sessionSummary(db, user.id, startedAt, clock())), block: await activeBlock(db, user.id, clock()), promoEligible: await promoEligible(db, user.id, clock()),
      mfa: { enrolled: Boolean(user.totp_secret), fresh: mfaFresh(mfaAt), required: cfg.requireOperatorMfa },
    };
  });
  route('POST', '/demo/role', async (c) => {
    // Demo only: lets a visitor look at the backoffice. Production roles are granted by an admin (PUT /admin/players/:id/role).
    if (!cfg.demo) fail('not_demo', 'Demo mode only.', 403);
    const id = await uid(c);
    return setRole(db, id, id, String(c.body?.role) as Role, clock());
  });
  route('POST', '/demo/refill', async (c) => ({ balance: (await demoRefill(db, cfg, await uid(c), clock())) / MF_PER_FRAG }));
  route('GET', '/wallet/withdrawal-check', async (c) => withdrawalCheck(db, cfg, (await c.auth()).user, Math.round(Number(c.url.searchParams.get('amount') ?? 0) * MF_PER_FRAG)));

  route('GET', '/me/stats', async (c) => playerStats(db, await uid(c), clock()));
  route('GET', '/me/profile', async (c) => profile(db, await uid(c)));
  route('PUT', '/me/profile', async (c) => updateProfile(db, await uid(c), { displayName: c.body?.displayName, hidePublic: c.body?.hidePublic }, clock()));
  route('POST', '/auth/logout-all', async (c) => ({ sessions: await logoutAll(db, await uid(c), clock()) }));
  route('GET', '/wallet/transactions', async (c) => {
    const q = c.url.searchParams;
    return transactions(db, await uid(c), { kind: q.get('kind'), before: q.get('before') ? Number(q.get('before')) : null, limit: q.get('limit') ? Number(q.get('limit')) : undefined });
  });
  route('GET', '/history', async (c) => {
    const q = c.url.searchParams;
    return playerHistory(db, await uid(c), { game: q.get('game'), cursor: q.get('cursor'), limit: q.get('limit') ? Number(q.get('limit')) : undefined });
  });
  route('GET', '/history/:game/:ref', async (c, p) => playerBetDetail(db, deps.beacon, await uid(c), p.game, p.ref, clock()));
  route('GET', '/feed', async (c) => publicFeed(db, (c.url.searchParams.get('kind') ?? 'all') as FeedKind, clock()));

  /* ---------- seeds ---------- */
  route('GET', '/seed', async (c) => activeSeedPublic(db, await uid(c)));
  route('GET', '/seeds', async (c) => { const id = await uid(c); return { active: await activeSeedPublic(db, id), revealed: await revealedSeeds(db, id) }; });
  route('POST', '/seed/rotate', async (c) => rotateSeed(db, await uid(c), c.body?.clientSeed ? String(c.body.clientSeed) : null, clock()));

  /* ---------- games ---------- */
  for (const g of ['dice', 'plinko', 'upgrader', 'cases', 'airdrop'] as (keyof InstantParams)[]) {
    route('POST', `/bets/${g}`, async (c) => {
      const id = await uid(c);
      const stake = g === 'cases' ? cfg.minStake : stakeMf(c.body?.stake);
      return fmtMoney(await publicBet(await playInstant(db, cfg, id, g, stake, c.body?.params ?? {}, clock()), db));
    });
  }
  route('POST', '/bets/cases/multi', async (c) => {
    const id = await uid(c);
    const bets = await openCases(db, cfg, id, String(c.body?.params?.caseId ?? ''), num(c.body?.count, 'count'), clock());
    const out = [];
    for (const b of bets) out.push(fmtMoney(await publicBet(b, db)));
    return out;
  });
  route('POST', '/mines/start', async (c) => fmtMoney(await minesStart(db, cfg, await uid(c), stakeMf(c.body?.stake), num(c.body?.mines, 'mines'), clock())));
  route('POST', '/mines/:id/reveal', async (c, p) => fmtMoney(await minesReveal(db, cfg, await uid(c), p.id, num(c.body?.tile, 'tile'), clock())));
  route('POST', '/mines/:id/cashout', async (c, p) => fmtMoney(await minesCashout(db, await uid(c), p.id, clock())));
  route('POST', '/raid/start', async (c) => fmtMoney(await raidStart(db, cfg, await uid(c), stakeMf(c.body?.stake), clock())));
  route('POST', '/raid/:id/blast', async (c, p) => fmtMoney(await raidBlast(db, cfg, await uid(c), p.id, String(c.body?.tool) as RaidTool, clock())));
  route('POST', '/raid/:id/cashout', async (c, p) => fmtMoney(await raidCashout(db, await uid(c), p.id, clock())));
  route('GET', '/games/open', async (c) => (await openRounds(db, await uid(c))).map((g) => fmtMoney(g)));
  route('POST', '/towers/start', async (c) => fmtMoney(await towersStart(db, cfg, await uid(c), stakeMf(c.body?.stake), String(c.body?.level) as TowerLevel, clock())));
  route('POST', '/towers/:id/pick', async (c, p) => fmtMoney(await towersPick(db, cfg, await uid(c), p.id, num(c.body?.door, 'door'), clock())));
  route('POST', '/towers/:id/cashout', async (c, p) => fmtMoney(await towersCashout(db, await uid(c), p.id, clock())));
  route('POST', '/hilo/start', async (c) => fmtMoney(await hiloStart(db, cfg, await uid(c), stakeMf(c.body?.stake), clock())));
  route('POST', '/hilo/:id/move', async (c, p) => fmtMoney(await hiloMove(db, cfg, await uid(c), p.id, String(c.body?.move) as 'hi', clock())));
  route('POST', '/hilo/:id/cashout', async (c, p) => fmtMoney(await hiloCashout(db, await uid(c), p.id, clock())));
  route('POST', '/blackjack/start', async (c) => fmtMoney(await bjStart(db, cfg, await uid(c), stakeMf(c.body?.stake), clock())));
  route('POST', '/blackjack/:id/action', async (c, p) => fmtMoney(await bjAction(db, await uid(c), p.id, String(c.body?.action) as BjAction, clock())));

  /* ---------- live: Bandit Wheel and Jackpot ---------- */
  route('GET', '/wheel/state', async (c) => wheel.state(clock(), await viewer(c)));
  route('POST', '/wheel/bet', async (c) => wheel.placeBet(await uid(c), String(c.body?.field) as WheelField, stakeMf(c.body?.stake), clock()));
  route('GET', '/jackpot/:room', async (c, p) => { await jackpot.tick(clock()); return jackpot.state(p.room, clock(), await viewer(c)); });
  route('POST', '/jackpot/:room/enter', async (c, p) => jackpot.enter(await uid(c), p.room, stakeMf(c.body?.amount), clock()));
  route('POST', '/jackpot/:room/bot', async (c, p) => { if (!cfg.demo) fail('no_bots', 'Bots are only available in demo mode.', 403); return jackpot.bot(await uid(c), p.room, clock()); });
  route('GET', '/bets', async (c) => {
    const id = await uid(c);
    const limit = Math.min(100, Math.max(1, Number(c.url.searchParams.get('limit') ?? 20)));
    const rows = (await db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY created_at DESC, nonce DESC LIMIT ?').all(id, limit)) as Parameters<typeof publicBet>[0][];
    const out = [];
    for (const b of rows) { const pb = await publicBet(b, db); out.push(fmtMoney(b.status === 'open' ? { ...pb, result: null } : pb)); }
    return out;
  });

  /* ---------- PvP ---------- */
  route('GET', '/pvp/list/:type', async (c, p) => {
    if (p.type !== 'coinflip' && p.type !== 'battle') fail('not_found', 'Unknown game type.', 404);
    await settleDue(db, deps.beacon, clock());
    return listGames(db, deps.beacon, p.type as 'coinflip' | 'battle', clock() - 10 * 60_000, await viewer(c));
  });
  route('GET', '/pvp/game/:id', async (c, p) => { await settleDue(db, deps.beacon, clock()); return publicGame(db, deps.beacon, p.id, await viewer(c)); });
  route('POST', '/pvp/coinflip', async (c) => { const u = await uid(c); return publicGame(db, deps.beacon, await createCoinflip(db, cfg, u, stakeMf(c.body?.stake), c.body?.side, clock()), u); });
  route('POST', '/pvp/battle', async (c) => { const u = await uid(c); return publicGame(db, deps.beacon, await createBattle(db, cfg, u, c.body?.caseIds, num(c.body?.seats, 'seats'), c.body?.mode, clock()), u); });
  route('POST', '/pvp/:id/join', async (c, p) => { const u = await uid(c); return publicGame(db, deps.beacon, await joinGame(db, cfg, deps.beacon, p.id, u, clock()), u); });
  route('POST', '/pvp/:id/bot', async (c, p) => {
    const u = await uid(c);
    const g = await publicGame(db, deps.beacon, p.id, u);
    if (!g.mine) fail('forbidden', 'Only the creator can add a bot.', 403);
    return publicGame(db, deps.beacon, await joinGame(db, cfg, deps.beacon, p.id, null, clock()), u);
  });
  route('POST', '/pvp/:id/cancel', async (c, p) => { const u = await uid(c); return publicGame(db, deps.beacon, await cancelGame(db, p.id, u, clock()), u); });

  /* ---------- crash ---------- */
  route('GET', '/crash/state', async (c) => deps.crash.state(clock(), await viewer(c)));
  route('POST', '/crash/bet', async (c) => deps.crash.placeBet(await uid(c), stakeMf(c.body?.stake), Math.round(num(c.body?.target, 'target') * 100), clock()));
  route('POST', '/crash/cashout', async (c) => deps.crash.cashout(await uid(c), clock()));

  /* ---------- rewards ---------- */
  route('GET', '/rewards', async (c) => {
    const u = await uid(c);
    const p = await progress(db, u);
    const lastDaily = (await db.prepare("SELECT created_at AS t FROM reward_claims WHERE user_id = ? AND kind = 'daily' ORDER BY created_at DESC LIMIT 1").get(u)) as { t: number } | undefined;
    const W = DAILY_CASE.items.reduce((s, i) => s + i.weight, 0);
    const crew = await crewState(db, u);
    return {
      ...p, rakebackAvailable: p.rakebackAvailable / MF_PER_FRAG, rakebackBands: RAKEBACK_BANDS,
      daily: { nextAt: lastDaily ? lastDaily.t + 86_400_000 : 0, items: DAILY_CASE.items.map((i) => ({ name: i.name, value: i.value, chance: i.weight / W })) },
      rain: await rainState(db, u, clock()), promoEligible: await promoEligible(db, u, clock()),
      crew: { ...crew, ngr: crew.ngr / MF_PER_FRAG, available: crew.available / MF_PER_FRAG },
    };
  });
  route('POST', '/rewards/rakeback', async (c) => { const r = await claimRakeback(db, await uid(c), clock()); return { amount: r.amount / MF_PER_FRAG }; });
  route('POST', '/rewards/daily', async (c) => openDaily(db, await uid(c), clock()));
  route('POST', '/rewards/rain', async (c) => joinRain(db, await uid(c), clock()));
  route('POST', '/crew/code', async (c) => createCrewCode(db, await uid(c), String(c.body?.code ?? ''), clock()));
  route('POST', '/crew/redeem', async (c) => redeemCrewCode(db, await uid(c), String(c.body?.code ?? ''), clock()));
  route('POST', '/promo/redeem', async (c) => redeemPromo(db, await uid(c), c.body?.code, clock()));
  route('POST', '/crew/claim', async (c) => { const r = await claimCrew(db, await uid(c), clock()); return { amount: r.amount / MF_PER_FRAG }; });

  /* ---------- chat ---------- */
  route('GET', '/games/status', async () => {
    const limits = await effectiveLimits();
    const maintenance = (await getSettings(db)).maintenance;
    return (await gameFlags(db)).map((g) => ({ game: g.game, enabled: g.enabled && !maintenance, reason: maintenance ? 'Maintenance' : g.reason, limits: limits[g.game] }));
  });
  route('GET', '/chat', async (c) => {
    const s = await resolveSession(db, c.token, clock());
    return { messages: await listMessages(db, s?.user.id ?? null), rain: await rainState(db, s?.user.id ?? null, clock()), mute: s ? await activeMute(db, s.user.id, clock()) : null, role: s?.user.role ?? null };
  });
  route('POST', '/chat', async (c) => { const { user } = await c.auth(); return postMessage(db, user, (await progress(db, user.id)).level, c.body?.body, clock()); });

  /* ---------- operators ---------- */
  const mfaFresh = (mfaAt: number | null) => mfaAt !== null && clock() - mfaAt < cfg.operatorMfaMaxAgeMinutes * 60_000;
  const operator = async (c: Ctx, ...roles: Role[]) => {
    if (!ipAllowed(c.ip, cfg.operatorIpAllowlist)) fail('forbidden', 'You do not have access to this area.', 403);
    const s = await c.auth();
    requireRole(s.user, ...roles);
    if (cfg.requireOperatorMfa) {
      if (!s.user.totp_secret) fail('mfa_enroll_required', 'Set up two-factor authentication to continue.', 401);
      if (!mfaFresh(s.mfaAt)) fail('mfa_required', 'Enter your authenticator code to continue.', 401);
    }
    return s.user;
  };
  const mod = (c: Ctx) => operator(c, 'moderator', 'admin');
  const admin = (c: Ctx) => operator(c, 'admin');

  route('DELETE', '/mod/chat/:id', async (c, p) => deleteMessage(db, (await mod(c)).id, Number(p.id), clock()));
  route('POST', '/mod/mute', async (c) => mute(db, (await mod(c)).id, String(c.body?.userId ?? ''), c.body?.minutes === null ? null : num(c.body?.minutes, 'minutes'), String(c.body?.reason ?? ''), clock()));
  route('DELETE', '/mod/mute/:userId', async (c, p) => unmute(db, (await mod(c)).id, p.userId, clock()));

  route('GET', '/admin/overview', async (c) => { await admin(c); return overview(db, cfg, clock()); });
  route('GET', '/admin/rtp', async (c) => {
    await admin(c);
    const days = Math.min(90, Math.max(1, Number(c.url.searchParams.get('days') ?? 30)));
    return { days, games: await rtpMonitor(db, clock() - days * 86_400_000) };
  });
  route('GET', '/admin/players', async (c) => { await admin(c); return listPlayers(db, c.url.searchParams.get('q') ?? '', clock()); });
  route('GET', '/admin/players/:id', async (c, p) => { await admin(c); return playerDetail(db, p.id, clock()); });
  route('POST', '/admin/players/:id/hold', async (c, p) => holdPlayer(db, (await admin(c)).id, p.id, c.body?.hours === null ? null : num(c.body?.hours, 'hours'), String(c.body?.reason ?? ''), clock()));
  route('DELETE', '/admin/players/:id/hold', async (c, p) => releaseHold(db, (await admin(c)).id, p.id, clock()));
  route('PUT', '/admin/players/:id/role', async (c, p) => setRole(db, (await admin(c)).id, p.id, String(c.body?.role) as Role, clock()));
  route('GET', '/admin/games', async (c) => { await admin(c); return (await gameFlags(db)).map((g) => ({ ...g, limits: limitsInFrags(g.limits) })); });
  route('PUT', '/admin/games/:game/limits', async (c, p) => {
    const a = await admin(c);
    const mf = (k: string) => (c.body?.[k] == null ? null : Math.round(num(c.body[k], k) * MF_PER_FRAG));
    const g = await setGameLimits(db, cfg, a.id, p.game, { minStake: mf('minStake'), maxStake: mf('maxStake'), maxWin: mf('maxWin') }, clock());
    return { ...g, limits: limitsInFrags(g.limits) };
  });
  route('PUT', '/admin/games/:game', async (c, p) => setGameFlag(db, (await admin(c)).id, p.game, c.body?.enabled === true, c.body?.reason == null ? null : String(c.body.reason), clock()));
  route('GET', '/admin/rg-cases', async (c) => { await admin(c); await rgScan(db, cfg, clock()); return rgCases(db, c.url.searchParams.get('status') === 'all' ? 'all' : 'open'); });
  route('PUT', '/admin/rg-cases/:id', async (c, p) => updateCase(db, (await admin(c)).id, Number(p.id), String(c.body?.status ?? ''), String(c.body?.note ?? ''), clock()));
  route('POST', '/admin/players/:id/adjust', async (c, p) => adjustBalance(db, (await admin(c)).id, p.id, num(c.body?.amount, 'amount'), String(c.body?.reason ?? ''), clock()));
  route('POST', '/admin/players/:id/notes', async (c, p) => addNote(db, (await admin(c)).id, p.id, String(c.body?.body ?? ''), clock()));
  route('POST', '/admin/players/:id/logout', async (c, p) => forceLogout(db, (await admin(c)).id, p.id, clock()));

  route('GET', '/admin/settings', async (c) => { await admin(c); return getSettings(db); });
  route('PUT', '/admin/settings', async (c) => setSettings(db, (await admin(c)).id, c.body ?? {}, clock()));

  route('GET', '/admin/cases', async (c) => { await admin(c); return adminCases(db); });
  route('POST', '/admin/cases/preview', async (c) => { await admin(c); return previewCase(cfg, c.body?.name, c.body?.items); });
  route('PUT', '/admin/cases/:id', async (c, p) => saveCase(db, cfg, (await admin(c)).id, { id: p.id, name: c.body?.name, items: c.body?.items }, clock()));
  route('PUT', '/admin/cases/:id/state', async (c, p) => setCaseState(db, (await admin(c)).id, p.id, { enabled: c.body?.enabled, sort: c.body?.sort }, clock()));

  route('GET', '/admin/promos', async (c) => { await admin(c); return listPromos(db); });
  route('POST', '/admin/promos', async (c) => createPromo(db, (await admin(c)).id, c.body ?? {}, clock()));
  route('PUT', '/admin/promos/:code', async (c, p) => setPromoActive(db, (await admin(c)).id, p.code, c.body?.active === true, clock()));

  route('GET', '/admin/bets', async (c) => {
    await admin(c);
    const q = c.url.searchParams;
    const n = (k: string) => (q.get(k) ? Number(q.get(k)) : undefined);
    return exploreBets(db, { game: q.get('game') ?? undefined, user: q.get('user') ?? undefined, minPayout: n('minPayout'), minMultiplier: n('minMultiplier'), since: n('since'), before: n('before'), limit: n('limit') });
  });
  route('GET', '/admin/bets/:game/:ref', async (c, p) => { await admin(c); return betDetail(db, deps.beacon, p.game, p.ref, clock()); });
  route('GET', '/admin/reports/daily', async (c) => { await admin(c); return dailyReport(db, Number(c.url.searchParams.get('days') ?? 14), clock()); });

  route('GET', '/admin/chains', async (c) => { await admin(c); return { crash: await listChains(db, 'crash', deps.beacon), wheel: await listChains(db, 'wheel', deps.beacon) }; });
  route('POST', '/admin/chains/:game/rotate', async (c, p) => {
    const a = await admin(c);
    if (p.game === 'crash') return deps.crash.rotateChain(a.id, clock());
    if (p.game === 'wheel') return wheel.rotateChain(a.id, clock());
    return fail('not_found', 'Unknown game.', 404);
  });
  route('GET', '/admin/audit', async (c) => {
    await admin(c);
    const q = c.url.searchParams;
    return auditLog(db, { userId: q.get('user') ?? undefined, event: q.get('event') ?? undefined, before: q.get('before') ? Number(q.get('before')) : undefined });
  });

  /* ---------- responsible gambling ---------- */
  route('GET', '/rg', async (c) => {
    const { user, startedAt } = await c.auth();
    return {
      limits: (await getLimits(db, user.id, clock())).map((l) => ({ ...l, amount: l.amount === null ? null : l.amount / MF_PER_FRAG, used: l.used / MF_PER_FRAG, pending: l.pending && { ...l.pending, amount: l.pending.amount === null ? null : l.pending.amount / MF_PER_FRAG } })),
      block: await activeBlock(db, user.id, clock()), session: fmtSession(await sessionSummary(db, user.id, startedAt, clock())),
    };
  });
  route('PUT', '/rg/limits', async (c) => {
    const id = await uid(c);
    const amount = c.body?.amount === null ? null : Math.round(num(c.body?.amount, 'amount') * MF_PER_FRAG);
    return setLimit(db, cfg, id, c.body?.kind as LimitKind, c.body?.period as LimitPeriod, amount, clock());
  });
  route('POST', '/rg/cooldown', async (c) => startCooldown(db, await uid(c), num(c.body?.hours, 'hours'), clock()));
  route('POST', '/rg/exclusion', async (c) => selfExclude(db, await uid(c), c.body?.months === null ? null : (num(c.body?.months, 'months') as 6 | 12 | 60), clock()));
  route('PUT', '/rg/reality-check', async (c) => { await setRealityCheck(db, await uid(c), num(c.body?.minutes, 'minutes'), clock()); return { ok: true }; });

  /* ---------- plumbing ---------- */
  const buckets = new Map<string, { tokens: number; at: number }>();
  const rateLimited = (ip: string) => {
    const now = clock(); const b = buckets.get(ip) ?? { tokens: 40, at: now };
    b.tokens = Math.min(40, b.tokens + ((now - b.at) / 1000) * 20); b.at = now;
    if (b.tokens < 1) { buckets.set(ip, b); return true; }
    b.tokens -= 1; buckets.set(ip, b); return false;
  };
  // Buckets of idle clients are dropped so the map cannot grow without bound.
  let lastSweep = 0;
  const sweep = () => {
    const now = clock();
    if (now - lastSweep < 60_000) return;
    lastSweep = now;
    for (const [ip, b] of buckets) if (now - b.at > 120_000) buckets.delete(ip);
  };

  async function dispatch(req: ApiRequest): Promise<ApiResponse> {
    try {
      sweep();
      if (rateLimited(req.ip)) fail('rate_limited', 'Too many requests. Please wait a moment.', 429);
      const url = new URL(req.url, 'http://local');
      const country = req.headers[cfg.countryHeader]?.toUpperCase() ?? null;
      if (url.pathname !== '/health' && url.pathname !== '/ready') checkGeo(cfg, country, !cfg.demo);
      const token = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization ?? '')?.[1];
      const ctx: Ctx = {
        url, body: req.body, ip: req.ip, country, token,
        auth: async () => (await resolveSession(db, token, clock())) ?? fail('unauthorized', 'Please sign in.', 401),
      };
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
      const code = (e as { code?: string }).code;
      if (code === '23505' || /UNIQUE constraint failed/.test(String((e as Error).message))) {
        return { status: 409, payload: { error: 'conflict', message: 'That was already done. Please refresh.' } };
      }
      console.error(e);
      return { status: 500, payload: { error: 'internal', message: 'Internal error.' } };
    }
  }

  /** Geo check for transports that open a stream before dispatching (SSE). */
  const streamAllowed = (headers: Record<string, string | undefined>) => {
    try { checkGeo(cfg, headers[cfg.countryHeader]?.toUpperCase() ?? null, !cfg.demo); return true; } catch { return false; }
  };

  return { dispatch, streamAllowed, crash: deps.crash, wheel, jackpot };
}

const theoryRtp = (g: string) => ({ dice: 1 - EDGE.dice, plinko: null, upgrader: 1 - EDGE.upgrader, cases: null, mines: 1 - EDGE.mines, raid: 1 - EDGE.raid } as Record<string, number | null>)[g] ?? null;
const fmtSession = (s: Awaited<ReturnType<typeof sessionSummary>>) => ({ ...s, wagered: s.wagered / MF_PER_FRAG, net: s.net / MF_PER_FRAG });
function fmtMoney<T extends { stake: number; payout: number }>(b: T): T { return { ...b, stake: b.stake / MF_PER_FRAG, payout: b.payout / MF_PER_FRAG }; }
