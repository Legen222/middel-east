/**
 * JSON HTTP API (node:http, no framework). Every request passes, in order:
 *   rate limit (per IP) → body size limit → geo check → auth (Bearer session token) → handler.
 * Errors are { error: code, message, details? } with a matching HTTP status.
 */

import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';

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
import { rotateSeed } from './seeds';
import { type Fetch, loginUrl, verifyAssertion } from './steam';

export interface AppDeps { db: DB; cfg: Config; clock: Clock; fetch: Fetch; publicUrl: string }

interface Ctx {
  req: IncomingMessage; url: URL; body: any; ip: string; country: string | null; token?: string;
  auth: () => { user: UserRow; startedAt: number };
}

const MAX_BODY = 16 * 1024;

export function createApp(deps: AppDeps) {
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
  route('GET', '/bets/:id', (_c, p) => { const b = getBet(db, p.id) ?? fail('not_found', 'Wette nicht gefunden.', 404); const pb = publicBet(b, db); return b.status === 'open' ? { ...pb, result: null } : pb; });

  /* ---------- auth ---------- */
  route('POST', '/auth/demo', (c) => {
    const { userId } = signUp(db, cfg, { displayName: String(c.body?.displayName ?? ''), ageConfirmed: c.body?.ageConfirmed === true, country: c.country }, clock());
    return { token: createSession(db, cfg, userId, clock()), userId };
  });
  route('GET', '/auth/steam', () => ({ url: loginUrl(`${deps.publicUrl}/auth/steam/return?age=1`, deps.publicUrl) }));
  route('GET', '/auth/steam/return', async (c) => {
    const { steamId } = await verifyAssertion(db, c.url.searchParams, `${deps.publicUrl}/auth/steam/return`, deps.fetch, clock())
      .catch((e: Error) => fail('steam_login_failed', 'Steam-Login fehlgeschlagen. Bitte erneut versuchen.', 401, { reason: e.message }));
    const { userId } = signUp(db, cfg, { displayName: `Steam ${steamId.slice(-4)}`, ageConfirmed: c.url.searchParams.get('age') === '1', steamId, country: c.country }, clock());
    return { token: createSession(db, cfg, userId, clock()), userId };
  });
  route('POST', '/auth/logout', (c) => { c.auth(); endSession(db, c.token!); return { ok: true }; });

  /* ---------- account ---------- */
  route('GET', '/me', (c) => {
    const { user, startedAt } = c.auth();
    return {
      id: user.id, displayName: user.display_name, steamLinked: Boolean(user.steam_id), kycLevel: user.kyc_level,
      balance: balance(db, user.id) / MF_PER_FRAG, seed: activeSeedPublic(db, user.id),
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

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(payload));
    };
    try {
      const ip = req.socket.remoteAddress ?? 'unknown';
      if (rateLimited(ip)) fail('rate_limited', 'Zu viele Anfragen. Bitte kurz warten.', 429);
      const url = new URL(req.url ?? '/', 'http://local');
      const country = (req.headers[cfg.countryHeader] as string | undefined)?.toUpperCase() ?? null;
      if (url.pathname !== '/health') checkGeo(cfg, country, !cfg.demo);
      const body = await readBody(req);
      const token = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization ?? '')?.[1];
      const ctx: Ctx = { req, url, body, ip, country, token, auth: () => resolveSession(db, token, clock()) ?? fail('unauthorized', 'Bitte einloggen.', 401) };
      for (const r of routes) {
        const m = r.method === req.method ? r.pattern.exec(url.pathname) : null;
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
        return send(200, await r.handler(ctx, params));
      }
      fail('not_found', 'Unbekannter Endpunkt.', 404);
    } catch (e) {
      if (e instanceof AppError) return send(e.status, { error: e.code, message: e.message, details: e.details });
      if (e instanceof RangeError) return send(400, { error: 'invalid_params', message: e.message });
      console.error(e);
      return send(500, { error: 'internal', message: 'Interner Fehler.' });
    }
  }
  return createServer((req, res) => { void handle(req, res); });
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve(null);
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new AppError('payload_too_large', 'Anfrage zu groß.', 413)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new AppError('invalid_json', 'Ungültiges JSON.')); }
    });
    req.on('error', reject);
  });
}

const theoryRtp = (g: string) => ({ dice: 1 - EDGE.dice, plinko: null, upgrader: 1 - EDGE.upgrader, cases: null, mines: 1 - EDGE.mines, raid: 1 - EDGE.raid } as Record<string, number | null>)[g] ?? null;
const fmtSession = (s: ReturnType<typeof sessionSummary>) => ({ ...s, wagered: s.wagered / MF_PER_FRAG, net: s.net / MF_PER_FRAG });
function fmtMoney<T extends { stake: number; payout: number }>(b: T): T { return { ...b, stake: b.stake / MF_PER_FRAG, payout: b.payout / MF_PER_FRAG }; }
