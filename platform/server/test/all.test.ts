import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';

import { FairStream, SAMPLE_CASES, layMines, openCase, playDice, playPlinko, playRaid, playUpgrader, priceCase, type RaidTool } from '../../engine/src/index';
import { signUp } from '../src/accounts';
import { getBet, minesCashout, minesReveal, minesStart, openCases, playInstant, raidBlast, raidCashout, raidStart } from '../src/bets';
import { checkGeo, withdrawalCheck } from '../src/compliance';
import { type Config, DEFAULT_CONFIG, MF_PER_FRAG, frags } from '../src/config';
import { openDb, type DB } from '../src/db';
import { openPg } from '../src/pg';

/** SQLite by default; TEST_PG_URL runs every test against Postgres, each in a fresh schema. */
let schemaSeq = 0;
const opened: { db: DB; schema: string | null }[] = [];
async function newDb(): Promise<DB> {
  const url = process.env.TEST_PG_URL;
  const schema = url ? `t_${process.pid}_${++schemaSeq}` : null;
  const db = url ? await openPg({ url, max: 8, schema: schema! }) : openDb();
  opened.push({ db, schema });
  return db;
}
after(async () => {
  for (const { db, schema } of opened) {
    if (schema) await db.exec(`DROP SCHEMA ${schema} CASCADE`).catch(() => undefined);
    await db.close().catch(() => undefined);
  }
});
import { AppError } from '../src/errors';
import { createApp } from '../src/http';
import { getLimits, selfExclude, sessionSummary, setLimit, startCooldown } from '../src/rg';
import { activeSeed, rotateSeed } from '../src/seeds';
import { type Fetch, STEAM_OPENID, verifyAssertion } from '../src/steam';
import { HOUSE, balanceOf, ledgerIntegrity, userAccount } from '../src/wallet';
import { getUser } from '../src/accounts';
import { LocalBeacon } from '../src/beacon';
import { DAILY_CASE, PROMO, claimCrew, claimRakeback, createCrewCode, crewState, joinRain, levelForXp, openDaily, progress, rainState, rainTick, rakebackRate, redeemCrewCode, xpForLevel, RAIN_PERIOD_MS, RAIN_WINDOW_MS } from '../src/rewards';
import { CrashService, multiplierAt, verifyCrashLink } from '../src/crash';
import { ESCROW, cancelGame, createBattle, createCoinflip, joinGame, publicGame, settleDue } from '../src/pvp';
import { crashPoint, playCoinflip, playBattle } from '../../engine/src/index';
import { holdPlayer, releaseHold, rgCases, rgScan, rtpMonitor, updateCase } from '../src/admin';
import { deleteMessage, listMessages, mute, postMessage, unmute } from '../src/chat';
import { setGameFlag } from '../src/flags';
import { createRouter } from '../src/router';
import { createSession } from '../src/accounts';
import { base32Encode, hotp, totp } from '../src/mfa';
import { ipAllowed } from '../src/config';
import { WheelService } from '../src/wheel';
import { setSettings, publicSite } from '../src/site';
import { gameFlags, setGameLimits } from '../src/flags';
import { caseVersion, listCases, saveCase, setCaseState } from '../src/cases';
import { createPromo, listPromos, redeemPromo, setPromoActive, PROMO_FAIL_LIMIT } from '../src/rewards';
import { addNote, adjustBalance, auditLog, forceLogout, playerDetail } from '../src/admin';
import { ADJUSTMENTS } from '../src/wallet';
import { resolveSession } from '../src/accounts';
import { dailyReport } from '../src/reports';
import { betDetail, exploreBets } from '../src/explorer';
import { NAME_CHANGE_COOLDOWN_MS, liveStats, logoutAll, playerBetDetail, playerHistory, playerStats, publicFeed, revealedSeeds, transactions, updateProfile } from '../src/player';
import { sha256Hex } from '../../engine/src/index';
import { listChains } from '../src/chains';
import { EDGE, buildChain } from '../../engine/src/index';
import { JACKPOT_COUNTDOWN_MS, JACKPOT_ESCROW, JACKPOT_REFUND_MS, JackpotService } from '../src/jackpot';
import { bjAction, bjStart, hiloCashout, hiloMove, hiloStart, openRounds, towersCashout, towersPick, towersStart } from '../src/originals';
import {
  WHEEL_LAYOUT, bjActions as bjEngineActions, bjAct as bjEngineAct, bjDeal, bjSettle, cardValue, drawCard, drawJackpot, hiloChance,
  layTraps, optimalAction, playAirdrop, spinWheel, towersMultiplier, wheelPayout,
} from '../../engine/src/index';

const T0 = Date.UTC(2026, 8, 28, 12, 0, 0);
const HOUR = 3_600_000;

async function setup(cfg: Partial<Config> = {}) {
  const db = await newDb();
  const conf: Config = { ...DEFAULT_CONFIG, ...cfg };
  const { userId } = await signUp(db, conf, { displayName: 'Tester', ageConfirmed: true, country: 'NZ' }, T0);
  return { db, cfg: conf, userId };
}
const bal = (db: DB, u: string) => balanceOf(db, userAccount(u));
const code = async (fn: () => unknown) => { try { await fn(); } catch (e) { return e instanceof AppError ? e.code : (e as Error).name; } return 'no-error'; };

describe('accounts & wallet', () => {
  it('refuses sign-up without 18+ confirmation', async () => {
    const db = await newDb();
    assert.equal(await code(() => signUp(db, DEFAULT_CONFIG, { displayName: 'Kid', ageConfirmed: false, country: null }, T0)), 'age_required');
  });
  it('grants the demo balance through the ledger and keeps Σ ledger = 0', async () => {
    const { db, userId } = await setup();
    assert.equal(await bal(db, userId), DEFAULT_CONFIG.demoStartBalance);
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });
  it('rolls back the whole bet when the stake exceeds the balance', async () => {
    const { db, cfg, userId } = await setup({ demoStartBalance: frags(5) });
    const before = (await db.prepare('SELECT COUNT(*) AS n FROM ledger').get() as { n: number }).n;
    assert.equal(await code(() => playInstant(db, cfg, userId, 'dice', frags(10), { chance: 50, direction: 'under' }, T0)), 'insufficient_balance');
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM ledger').get() as { n: number }).n, before);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM bets').get() as { n: number }).n, 0);
    assert.equal((await activeSeed(db, userId)).nonce, 0);
  });
});

describe('bets settle correctly and replay exactly from the revealed seed', () => {
  it('40 mixed instant bets: balances, nonces, ledger and replay all agree', async () => {
    const { db, cfg, userId } = await setup();
    const plans = [
      ['dice', frags(10), { chance: 49.5, direction: 'under' }],
      ['dice', frags(3), { chance: 2, direction: 'over' }],
      ['plinko', frags(5), { rows: 16, risk: 'high' }],
      ['plinko', frags(7), { rows: 8, risk: 'low' }],
      ['upgrader', frags(20), { multiplier: 3 }],
      ['cases', 0, { caseId: 'toolbox' }],
    ] as const;
    let expected = await bal(db, userId);
    for (let i = 0; i < 40; i++) {
      const [g, stake, params] = plans[i % plans.length];
      const b = await playInstant(db, cfg, userId, g, stake || cfg.minStake, params as never, T0 + i);
      assert.equal(b.nonce, i);
      expected += b.payout - b.stake;
      assert.equal(await bal(db, userId), expected);
    }
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });

    const { revealed } = await rotateSeed(db, userId, 'new-client', T0 + 100);
    const bets = await db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY nonce').all(userId) as any[];
    for (const b of bets) {
      const src = new FairStream(revealed.server_seed, revealed.client_seed, b.nonce);
      const p = JSON.parse(b.params);
      let mult: number;
      switch (b.game) {
        case 'dice': mult = playDice(src, p).multiplier; break;
        case 'plinko': mult = playPlinko(src, p.rows, p.risk).multiplier; break;
        case 'upgrader': mult = playUpgrader(src, 1, p.multiplier).win ? p.multiplier : 0; break;
        default: { const c = SAMPLE_CASES.find((x) => x.id === p.caseId)!; mult = (openCase(src, c).item.value * MF_PER_FRAG) / b.stake; }
      }
      assert.equal(b.payout, Math.floor(b.stake * mult + 1e-9), `bet ${b.nonce} (${b.game}) replays`);
    }
  });
  it('case price is fixed by the server, the client stake is ignored', async () => {
    const { db, cfg, userId } = await setup();
    const b = await playInstant(db, cfg, userId, 'cases', frags(1), { caseId: 'military-crate' }, T0);
    assert.equal(b.stake, priceCase(SAMPLE_CASES.find((c) => c.id === 'military-crate')!) * MF_PER_FRAG);
  });
});

describe('mines', () => {
  it('hides the layout while open, blocks seed rotation, pays the ladder, and replays', async () => {
    const { db, cfg, userId } = await setup();
    const start = await minesStart(db, cfg, userId, frags(10), 3, T0) as any;
    assert.equal(start.status, 'open');
    assert.equal(JSON.stringify(start).includes('"mines":['), false, 'mine positions must not leak');
    assert.equal(await code(() => rotateSeed(db, userId, null, T0)), 'open_game');
    assert.equal(await code(() => minesStart(db, cfg, userId, frags(10), 3, T0)), 'open_game');
    const seed = await activeSeed(db, userId);
    const layout = layMines(new FairStream(seed.server_seed, seed.client_seed, 0), 3);
    const safe = [...Array(25).keys()].filter((t) => !layout.includes(t));
    await minesReveal(db, cfg, userId, start.id, safe[0], T0);
    await minesReveal(db, cfg, userId, start.id, safe[1], T0);
    const done = await minesCashout(db, userId, start.id, T0) as any;
    assert.equal(done.status, 'settled');
    assert.equal(done.payout, Math.floor(frags(10) * (0.97 * 300) / 231));
    const lose = await minesStart(db, cfg, userId, frags(10), 3, T0) as any;
    const s2 = await activeSeed(db, userId);
    const layout2 = layMines(new FairStream(s2.server_seed, s2.client_seed, 1), 3);
    const hit = await minesReveal(db, cfg, userId, lose.id, layout2[0], T0) as any;
    assert.equal(hit.status, 'settled');
    assert.equal(hit.payout, 0);
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });
  it('refuses a reveal that could exceed the max win (cash-out stays possible)', async () => {
    const { db, cfg, userId } = await setup({ maxWin: frags(40) });
    const g = await minesStart(db, cfg, userId, frags(10), 3, T0) as any; // mult(1)=1.10, … mult(3)≈1.52 … grows
    const seed = await activeSeed(db, userId);
    const layout = layMines(new FairStream(seed.server_seed, seed.client_seed, 0), 3);
    const safe = [...Array(25).keys()].filter((t) => !layout.includes(t));
    let refused = false;
    for (const t of safe) {
      const c = await code(() => minesReveal(db, cfg, userId, g.id, t, T0));
      if (c === 'max_win') { refused = true; break; }
    }
    assert.ok(refused);
    const out = await minesCashout(db, userId, g.id, T0) as any;
    assert.ok(out.payout <= frags(40));
  });
});

describe('raid', () => {
  it('blasts replay the same floats, holds settle at 0, cash-out pays 0.97/Πp', async () => {
    const { db, cfg, userId } = await setup();
    const seed = await activeSeed(db, userId);
    const plan: RaidTool[] = ['c4', 'rocket', 'c4'];
    const expect = playRaid(new FairStream(seed.server_seed, seed.client_seed, 0), (s) => plan[s.length] ?? null);
    const g = await raidStart(db, cfg, userId, frags(10), T0) as any;
    let last: any = g;
    for (const t of plan) { last = await raidBlast(db, cfg, userId, g.id, t, T0); if (last.status === 'settled') break; }
    if (last.status === 'open') last = await raidCashout(db, userId, g.id, T0);
    assert.equal(last.payout, Math.floor(frags(10) * expect.multiplier + 1e-9));
    assert.equal((await getBet(db, g.id))!.status, 'settled');
  });
});

describe('max win and stake bounds', () => {
  it('refuses a dice bet whose win could exceed the cap and names the max stake', async () => {
    const { db, cfg, userId } = await setup({ maxWin: frags(1000) });
    try { await playInstant(db, cfg, userId, 'dice', frags(100), { chance: 1, direction: 'under' }, T0); assert.fail('should throw'); }
    catch (e) { assert.ok(e instanceof AppError && e.code === 'max_win'); assert.equal((e as AppError).details!.maxStake, Math.floor(frags(1000) / 98)); }
  });
  it('refuses stakes outside the min/max band', async () => {
    const { db, cfg, userId } = await setup();
    assert.equal(await code(() => playInstant(db, cfg, userId, 'dice', 1, { chance: 50, direction: 'under' }, T0)), 'invalid_stake');
  });
});

describe('responsible gambling', () => {
  it('loss limit blocks the bet that could break it (open stakes count as lost)', async () => {
    const { db, cfg, userId } = await setup();
    await setLimit(db, cfg, userId, 'loss', 'day', frags(15), T0);
    await playInstant(db, cfg, userId, 'dice', frags(10), { chance: 0.01, direction: 'under' }, T0); // almost surely lost
    assert.equal(await code(() => playInstant(db, cfg, userId, 'dice', frags(10), { chance: 50, direction: 'under' }, T0 + 1)), 'rg_limit');
    assert.doesNotThrow(() => playInstant(db, cfg, userId, 'dice', frags(4), { chance: 50, direction: 'under' }, T0 + 2));
  });
  it('lowering applies now, raising only after 24 h, removing only after 24 h', async () => {
    const { db, cfg, userId } = await setup();
    assert.equal((await setLimit(db, cfg, userId, 'wager', 'week', frags(500), T0)).applied, 'now');
    assert.equal((await setLimit(db, cfg, userId, 'wager', 'week', frags(200), T0)).applied, 'now');
    const r = await setLimit(db, cfg, userId, 'wager', 'week', frags(5000), T0);
    assert.equal(r.applied, 'delayed');
    assert.equal((await getLimits(db, userId, T0 + 23 * HOUR))[0].amount, frags(200));
    assert.equal((await getLimits(db, userId, T0 + 24 * HOUR))[0].amount, frags(5000));
    await setLimit(db, cfg, userId, 'wager', 'week', null, T0 + 25 * HOUR);
    assert.equal((await getLimits(db, userId, T0 + 48 * HOUR))[0].amount, frags(5000));
    assert.equal((await getLimits(db, userId, T0 + 49 * HOUR))[0].amount, null);
  });
  it('cooldown blocks bets until it ends and cannot be shortened', async () => {
    const { db, cfg, userId } = await setup();
    await startCooldown(db, userId, 24, T0);
    assert.equal(await code(() => playInstant(db, cfg, userId, 'dice', frags(1), { chance: 50, direction: 'under' }, T0 + HOUR)), 'rg_cooldown');
    assert.equal(await code(() => startCooldown(db, userId, 1, T0)), 'invalid_cooldown');
    assert.doesNotThrow(() => playInstant(db, cfg, userId, 'dice', frags(1), { chance: 50, direction: 'under' }, T0 + 25 * HOUR));
  });
  it('self-exclusion blocks play and ends all sessions', async () => {
    const { db, cfg, userId } = await setup();
    await db.prepare('INSERT INTO sessions (token_hash, user_id, started_at, expires_at) VALUES (?, ?, ?, ?)').run('x'.repeat(64), userId, T0, T0 + 1e9);
    await selfExclude(db, userId, 6, T0);
    assert.equal(await code(() => playInstant(db, cfg, userId, 'dice', frags(1), { chance: 50, direction: 'under' }, T0 + 1)), 'rg_excluded');
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(userId) as { n: number }).n, 0);
  });
  it('session summary reports wagered, net and the next reality check', async () => {
    const { db, cfg, userId } = await setup();
    const b = await playInstant(db, cfg, userId, 'dice', frags(10), { chance: 50, direction: 'under' }, T0 + 1000);
    const s = await sessionSummary(db, userId, T0, T0 + 61 * 60_000);
    assert.equal(s.wagered, frags(10));
    assert.equal(s.net, b.payout - b.stake);
    assert.equal(s.nextRealityCheckAt, T0 + 120 * 60_000);
  });
});

describe('compliance', () => {
  it('geo: sanctions always, licence list only for real money', () => {
    assert.throws(() => checkGeo(DEFAULT_CONFIG, 'KP', false));
    assert.doesNotThrow(() => checkGeo(DEFAULT_CONFIG, 'DE', false));
    assert.throws(() => checkGeo(DEFAULT_CONFIG, 'DE', true));
    assert.throws(() => checkGeo(DEFAULT_CONFIG, null, true), 'unknown country is blocked for real money');
  });
  it('withdrawal check explains every missing precondition', async () => {
    const { db, cfg, userId } = await setup();
    const r = await withdrawalCheck(db, cfg, (await getUser(db, userId))!, frags(10));
    assert.equal(r.allowed, false);
    assert.deepEqual(r.reasons.map((x) => x.code), ['demo', 'kyc_1']);
  });
});

describe('Steam OpenID', () => {
  const RT = 'https://scrapline.example/auth/steam/return';
  const q = (over: Record<string, string> = {}, now = T0) => new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0', 'openid.mode': 'id_res', 'openid.op_endpoint': STEAM_OPENID,
    'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561198000000001', 'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000001',
    'openid.return_to': RT + '?age=1', 'openid.response_nonce': new Date(now).toISOString().slice(0, 19) + 'Zabc', 'openid.assoc_handle': '1', 'openid.signed': 'x', 'openid.sig': 'y', ...over,
  });
  const steamSays = (valid: boolean): Fetch => async (_u, init) => { assert.ok(init.body?.includes('openid.mode=check_authentication')); return { ok: true, text: async () => `ns:http://specs.openid.net/auth/2.0\nis_valid:${valid}\n` }; };
  it('accepts a valid assertion and extracts the SteamID64', async () => {
    const db = await newDb();
    assert.deepEqual(await verifyAssertion(db, q(), RT, steamSays(true), T0), { steamId: '76561198000000001' });
  });
  it('rejects replay, forged ids, foreign return_to, stale nonces and Steam saying no', async () => {
    const db = await newDb();
    await verifyAssertion(db, q(), RT, steamSays(true), T0);
    await assert.rejects(verifyAssertion(db, q(), RT, steamSays(true), T0), /replayed/);
    await assert.rejects(verifyAssertion(await newDb(), q({ 'openid.claimed_id': 'https://evil.example/openid/id/76561198000000001' }), RT, steamSays(true), T0), /claimed_id/);
    await assert.rejects(verifyAssertion(await newDb(), q({ 'openid.return_to': 'https://evil.example/cb' }), RT, steamSays(true), T0), /return_to/);
    await assert.rejects(verifyAssertion(await newDb(), q({}, T0 - 10 * 60_000), RT, steamSays(true), T0), /stale/);
    await assert.rejects(verifyAssertion(await newDb(), q(), RT, steamSays(false), T0), /rejected/);
  });
});

describe('HTTP API (end to end)', () => {
  it('sign-up → bet → mines → limits → verify → stats', async () => {
    let now = T0;
    const db = await newDb();
    const beacon = new LocalBeacon(T0 - 60_000, 1000);
    const server = createApp({ db, cfg: DEFAULT_CONFIG, clock: () => now, fetch: async () => ({ ok: false, text: async () => '' }), publicUrl: 'http://x', beacon, crash: new CrashService(db, DEFAULT_CONFIG, beacon, 20) });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    let token = '';
    const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'cf-ipcountry': 'NZ', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, json: (await res.json()) as any };
    };
    try {
      assert.equal((await call('POST', '/auth/demo', { displayName: 'Kid', ageConfirmed: false })).status, 403);
      assert.equal((await call('GET', '/config', undefined, { 'cf-ipcountry': 'KP' })).status, 451);
      const s = await call('POST', '/auth/demo', { displayName: 'Rust Ratte', ageConfirmed: true });
      assert.equal(s.status, 200);
      token = s.json.token;
      const me = await call('GET', '/me');
      assert.equal(me.json.balance, 250_000);
      assert.equal(me.json.seed.nextNonce, 0);

      const dice = await call('POST', '/bets/dice', { stake: 25, params: { chance: 49.5, direction: 'under' } });
      assert.equal(dice.status, 200);
      assert.equal(dice.json.stake, 25);
      assert.equal(dice.json.fairness.serverSeed, null, 'server seed stays secret before rotation');

      const m = await call('POST', '/mines/start', { stake: 10, mines: 5 });
      assert.equal(m.status, 200);
      assert.equal(m.json.revealed.length, 0);
      assert.equal((await call('GET', `/bets/${m.json.id}`)).json.result, null);
      assert.equal((await call('POST', '/seed/rotate', {})).status, 409);
      const og = await call('GET', '/games/open');
      assert.equal(og.json.length, 1);
      assert.equal(og.json[0].id, m.json.id);
      assert.equal(JSON.stringify(og.json).includes('"mines":['), false);
      const r = await call('POST', `/mines/${m.json.id}/reveal`, { tile: 12 });
      assert.equal(r.status, 200);
      if (r.json.status === 'open') assert.equal((await call('POST', `/mines/${m.json.id}/cashout`, {})).status, 200);

      assert.equal((await call('PUT', '/rg/limits', { kind: 'wager', period: 'day', amount: 50 })).json.applied, 'now');
      const blocked = await call('POST', '/bets/dice', { stake: 30, params: { chance: 49.5, direction: 'under' } });
      assert.equal(blocked.status, 403);
      assert.equal(blocked.json.error, 'rg_limit');

      const rot = await call('POST', '/seed/rotate', { clientSeed: 'mein-seed' });
      assert.equal(rot.status, 200);
      const verified = await call('GET', `/bets/${dice.json.id}`);
      assert.equal(verified.json.fairness.serverSeed, rot.json.revealed.server_seed);

      now += 1000;
      const stats = await call('GET', '/stats/rtp');
      assert.ok(stats.json.games.find((g: any) => g.game === 'dice').bets >= 1);
      assert.equal((await call('GET', '/nope')).status, 404);
      assert.equal((await call('POST', '/bets/dice', { stake: 'x' })).status, 400);
      assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
      assert.ok(await balanceOf(db, HOUSE) !== 0);
    } finally {
      server.close();
    }
  });
});

describe('PvP (coinflip, battles)', () => {
  const setup2 = async () => {
    const base = await setup();
    const { userId: other } = await signUp(base.db, base.cfg, { displayName: 'Gegner', ageConfirmed: true, country: 'NZ' }, T0);
    return { ...base, other, beacon: new LocalBeacon(T0 - 60_000, 1000) };
  };
  it('coinflip: locks on join, waits for the beacon, pays 2B·0.96, reveals the seed, replays', async () => {
    const { db, cfg, userId, other, beacon } = await setup2();
    const id = await createCoinflip(db, cfg, userId, frags(100), 'rust', T0);
    assert.equal((await publicGame(db, beacon, id)).fairness.serverSeed, null);
    await joinGame(db, cfg, beacon, id, other, T0);
    const locked = await publicGame(db, beacon, id);
    assert.equal(locked.status, 'locked');
    assert.equal(await settleDue(db, beacon, T0 + 1000), 0, 'beacon round is still in the future');
    assert.equal(await settleDue(db, beacon, locked.fairness.beacon.resolvesAt!), 1);
    const g = await publicGame(db, beacon, id);
    assert.equal(g.status, 'settled');
    const expect = playCoinflip(new FairStream(g.fairness.serverSeed!, g.fairness.beacon.value!, 0), 'rust');
    assert.equal(g.result.winnerSeat, expect.creatorWins ? 0 : 1);
    const winner = expect.creatorWins ? userId : other;
    const loser = expect.creatorWins ? other : userId;
    assert.equal(await bal(db, winner), DEFAULT_CONFIG.demoStartBalance - frags(100) + frags(192));
    assert.equal(await bal(db, loser), DEFAULT_CONFIG.demoStartBalance - frags(100));
    assert.equal(await balanceOf(db, ESCROW), 0);
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });
  it('cancel refunds; nobody can join twice; bots only in demo', async () => {
    const { db, cfg, userId, beacon } = await setup2();
    const id = await createCoinflip(db, cfg, userId, frags(50), 'scrap', T0);
    assert.equal(await code(() => joinGame(db, cfg, beacon, id, userId, T0)), 'already_seated');
    await cancelGame(db, id, userId, T0);
    assert.equal(await bal(db, userId), DEFAULT_CONFIG.demoStartBalance);
    const id2 = await createCoinflip(db, { ...cfg, demo: false }, userId, frags(50), 'scrap', T0);
    assert.equal(await code(() => joinGame(db, { ...cfg, demo: false }, beacon, id2, null, T0)), 'no_bots');
  });
  it('battle: 3 seats with demo bots, payouts = pool, rest to house, escrow empty, replays', async () => {
    const { db, cfg, userId, beacon } = await setup2();
    const id = await createBattle(db, cfg, userId, ['toolbox', 'military-crate'], 3, 'normal', T0);
    await joinGame(db, cfg, beacon, id, null, T0);
    await joinGame(db, cfg, beacon, id, null, T0);
    const at = (await publicGame(db, beacon, id)).fairness.beacon.resolvesAt!;
    await settleDue(db, beacon, at);
    const g = await publicGame(db, beacon, id);
    const cases = ['toolbox', 'military-crate'].map((x) => SAMPLE_CASES.find((c) => c.id === x)!);
    const o = playBattle(new FairStream(g.fairness.serverSeed!, g.fairness.beacon.value!, 0), cases, 3, 'normal');
    assert.deepEqual(g.result.winners, o.winners);
    const pool = o.totals.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(g.players.reduce((a, p) => a + p.payout, 0) - pool) < 0.01);
    assert.equal(await balanceOf(db, ESCROW), 0);
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });
  it('battle escrow closes at zero whether the pool is below or above the stakes (60 games)', async () => {
    const { db, cfg, userId, beacon } = await setup2();
    let above = 0, below = 0;
    for (let i = 0; i < 60; i++) { // P(no game above the stakes) ≈ 0.76⁶⁰ ≈ 10⁻⁷
      const id = await createBattle(db, cfg, userId, ['toolbox'], 2, 'normal', T0);
      await joinGame(db, cfg, beacon, id, null, T0);
      await settleDue(db, beacon, (await publicGame(db, beacon, id)).fairness.beacon.resolvesAt!);
      const g = await publicGame(db, beacon, id);
      const pool = g.players.reduce((a, p) => a + p.payout, 0);
      if (pool > 2 * g.seatStake) above++; else below++;
      assert.equal(await balanceOf(db, ESCROW), 0, `escrow after game ${i}`);
    }
    assert.ok(above > 0 && below > 0, `both branches covered (above ${above}, below ${below})`);
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });
  it('responsible-gambling limits apply to PvP seats', async () => {
    const { db, cfg, userId, other, beacon } = await setup2();
    await setLimit(db, cfg, other, 'wager', 'day', frags(50), T0);
    const id = await createCoinflip(db, cfg, userId, frags(100), 'rust', T0);
    assert.equal(await code(() => joinGame(db, cfg, beacon, id, other, T0)), 'rg_limit');
  });
});

describe('crash (Scrap Press)', () => {
  async function run(svc: CrashService, from: number, to: number, step = 100) { for (let t = from; t <= to; t += step) await svc.tick(t); }
  it('chain waits for the beacon, rounds follow the hash chain, crash stays hidden until it happens', async () => {
    const { db, cfg, userId } = await setup();
    const beacon = new LocalBeacon(T0 - 60_000, 1000);
    const svc = new CrashService(db, cfg, beacon, 50);
    await svc.tick(T0);
    assert.equal((await svc.state(T0, null)).round, null, 'no round before the chain client seed exists');
    const s0 = await svc.state(T0, null);
    const readyAt = beacon.timeOf(s0.chain!.beaconRound);
    await svc.tick(readyAt);
    const st = await svc.state(readyAt, userId);
    assert.equal(st.round!.status, 'betting');
    assert.equal(st.round!.crash, null);
    await svc.placeBet(userId, frags(10), 150, readyAt + 100);
    assert.equal(await code(() => svc.placeBet(userId, frags(10), 150, readyAt + 200)), 'already_bet');
    await run(svc, readyAt + 100, readyAt + 6000 + 200_000, 250);
    const after = await svc.state(readyAt + 206_000, userId);
    const first = after.history[after.history.length - 1];
    assert.ok(verifyCrashLink(first.seed, after.chain!.terminalHash), 'round 0 seed hashes to the terminal hash');
    assert.equal(first.crash, crashPoint(first.seed, after.chain!.clientSeed!).crash);
    for (let i = 0; i + 1 < after.history.length; i++) assert.ok(verifyCrashLink(after.history[i].seed, after.history[i + 1].seed), 'each seed links to the previous one');
    const bet = await db.prepare('SELECT * FROM crash_bets WHERE user_id = ?').get(userId) as any;
    assert.equal(bet.status, 'settled');
    assert.equal(bet.payout, first.crash >= 1.5 ? frags(15) : 0);
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });
  it('manual cash-out pays the current multiplier and only before the crash', async () => {
    const { db, cfg, userId } = await setup();
    const beacon = new LocalBeacon(T0 - 60_000, 1000);
    const svc = new CrashService(db, cfg, beacon, 200);
    await svc.tick(T0);
    let t = beacon.timeOf((await svc.state(T0, null)).chain!.beaconRound);
    // find a round that runs past 1.20× so a manual cash-out is possible
    for (let tries = 0; tries < 200; tries++) {
      await svc.tick(t);
      const r = await db.prepare('SELECT * FROM crash_rounds ORDER BY id DESC LIMIT 1').get() as any;
      if (r.status === 'betting' && r.crash >= 130) {
        await svc.placeBet(userId, frags(10), 100000, t);
        const at = r.betting_ends_at + 3100; // e^(0.00006·3100) ≈ 1.204
        await svc.tick(at);
        const out = await svc.cashout(userId, at);
        assert.equal(out.multiplier, multiplierAt(3100) / 100);
        assert.equal(out.payout, Math.floor(10_000 * multiplierAt(3100) / 100) / 1000);
        assert.equal(await code(() => svc.cashout(userId, at + 10)), 'no_bet');
        return;
      }
      t = Math.max(t + 250, r.crash_at + 3000);
    }
    assert.fail('no suitable round found');
  });
  it('refuses bets outside the betting window and over the max win', async () => {
    const { db, cfg, userId } = await setup({ maxWin: frags(100) });
    const beacon = new LocalBeacon(T0 - 60_000, 1000);
    const svc = new CrashService(db, cfg, beacon, 20);
    await svc.tick(T0);
    const t = beacon.timeOf((await svc.state(T0, null)).chain!.beaconRound);
    await svc.tick(t);
    assert.equal(await code(() => svc.placeBet(userId, frags(10), 2000, t)), 'max_win');
    assert.equal(await code(() => svc.placeBet(userId, frags(10), 100, t)), 'invalid_params');
    await svc.tick(t + 6000);
    assert.equal(await code(() => svc.placeBet(userId, frags(10), 200, t + 6000)), 'not_betting');
  });
});

describe('rewards (level, rakeback, Scrap Crate, Oil Rain, crew codes)', () => {
  it('level curve and rakeback bands', () => {
    assert.equal(levelForXp(0), 1);
    assert.equal(xpForLevel(2), 100);
    assert.equal(levelForXp(99), 1);
    assert.equal(levelForXp(100), 2);
    assert.equal(xpForLevel(5), 919);
    assert.deepEqual([1, 9, 10, 24, 25, 50, 75, 100, 250].map(rakebackRate), [0.05, 0.05, 0.1, 0.1, 0.15, 0.2, 0.25, 0.3, 0.3]);
  });
  it('XP and rakeback follow expected loss (stake × edge), claim once, ledger stays balanced', async () => {
    const { db, cfg, userId } = await setup();
    await playInstant(db, cfg, userId, 'dice', frags(1000), { chance: 49.5, direction: 'under' }, T0);     // EL 20
    await playInstant(db, cfg, userId, 'upgrader', frags(1000), { multiplier: 2 }, T0 + 1);                // EL 50
    const p = await progress(db, userId);
    assert.equal(p.xp, 70);
    assert.equal(p.level, 1);
    assert.equal(p.rakebackAvailable, Math.floor(frags(70) * 0.05));
    assert.equal((await claimRakeback(db, userId, T0 + 2)).amount, frags(3.5));
    assert.equal(await code(() => claimRakeback(db, userId, T0 + 3)), 'nothing_to_claim');
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });
  it('Scrap Crate: level 2+, once per 24 h, blocked during a pause, replays from the revealed seed', async () => {
    const { db, cfg, userId } = await setup();
    assert.equal(await code(() => openDaily(db, userId, T0)), 'level_required');
    await playInstant(db, cfg, userId, 'dice', frags(5000), { chance: 49.5, direction: 'under' }, T0); // EL 100 → level 2
    const d = await openDaily(db, userId, T0 + 1);
    assert.equal(await code(() => openDaily(db, userId, T0 + 2)), 'daily_wait');
    const { revealed } = await rotateSeed(db, userId, null, T0 + 3);
    const replay = openCase(new FairStream(revealed.server_seed, revealed.client_seed, d.fairness.nonce), DAILY_CASE);
    assert.equal(replay.item.name, d.item.name);
    await startCooldown(db, userId, 48, T0 + 4);
    assert.equal(await code(() => openDaily(db, userId, T0 + 86_400_000 + 5)), 'rg_blocked');
    assert.ok(await balanceOf(db, PROMO) < 0);
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });
  it('Oil Rain: window, eligibility, equal split at close', async () => {
    const { db, cfg, userId } = await setup();
    const { userId: low } = await signUp(db, cfg, { displayName: 'Neu', ageConfirmed: true, country: 'NZ' }, T0);
    const slot = Math.ceil(T0 / RAIN_PERIOD_MS) * RAIN_PERIOD_MS;
    await playInstant(db, cfg, userId, 'upgrader', frags(20000), { multiplier: 2 }, slot - 1000); // EL 1000 → level 5
    await rainTick(db, cfg, slot);
    assert.equal((await rainState(db, userId, slot + 1)).open, true);
    assert.equal(await code(() => joinRain(db, low, slot + 2)), 'level_required');
    await joinRain(db, userId, slot + 3);
    const before = await bal(db, userId);
    await rainTick(db, cfg, slot + RAIN_WINDOW_MS);
    const pot = await rainState(db, userId, slot + RAIN_WINDOW_MS + 1);
    assert.equal(await bal(db, userId) - before, frags(500), 'single joiner gets the whole demo pot (500 Scrap minimum)');
    assert.equal(await code(() => joinRain(db, userId, slot + RAIN_WINDOW_MS + 10)), 'rain_closed');
    assert.ok(pot.nextAt > slot);
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });
  it('Crew codes: redeem in the first 24 h, NGR share net of bonuses, no self-referral', async () => {
    const { db, cfg, userId: owner } = await setup();
    const { userId: member } = await signUp(db, cfg, { displayName: 'Crew', ageConfirmed: true, country: 'NZ' }, T0);
    await createCrewCode(db, owner, 'rustcrew', T0);
    assert.equal(await code(() => redeemCrewCode(db, owner, 'RUSTCREW', T0)), 'own_code');
    await redeemCrewCode(db, member, 'RUSTCREW', T0 + 1);
    assert.equal(await code(() => redeemCrewCode(db, member, 'RUSTCREW', T0 + 2)), 'already_redeemed');
    const b1 = await playInstant(db, cfg, member, 'dice', frags(1000), { chance: 1, direction: 'under' }, T0 + 3); // lost with 99 %
    const s = await crewState(db, owner);
    assert.equal(s.members, 1);
    assert.equal(s.rate, 0.05);
    assert.equal(s.ngr, b1.stake - b1.payout);
    if (s.available >= frags(1)) assert.equal((await claimCrew(db, owner, T0 + 4)).amount, s.available);
    const { userId: late } = await signUp(db, cfg, { displayName: 'Spät', ageConfirmed: true, country: 'NZ' }, T0);
    assert.equal(await code(() => redeemCrewCode(db, late, 'RUSTCREW', T0 + 86_400_001)), 'too_late');
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });
});

describe('operations: kill switch', () => {
  it('a paused game refuses new rounds and next steps, but open rounds can still cash out', async () => {
    const { db, cfg, userId } = await setup();
    assert.equal(await code(() => setGameFlag(db, 'op', 'dice', false, '', T0)), 'invalid_params', 'pausing needs a reason');
    await setGameFlag(db, 'op', 'dice', false, 'table review', T0);
    assert.equal(await code(() => playInstant(db, cfg, userId, 'dice', frags(10), { chance: 50, direction: 'under' }, T0)), 'game_disabled');
    await playInstant(db, cfg, userId, 'plinko', frags(10), { rows: 8, risk: 'low' }, T0); // other games keep running

    const m = await minesStart(db, cfg, userId, frags(10), 1, T0);
    const layout = JSON.parse((await getBet(db, m.id))!.state!).mines as number[];
    const safe = [...Array(25).keys()].filter((t) => !layout.includes(t));
    await minesReveal(db, cfg, userId, m.id, safe[0], T0);
    await setGameFlag(db, 'op', 'mines', false, 'incident', T0);
    assert.equal(await code(() => minesReveal(db, cfg, userId, m.id, safe[1], T0)), 'game_disabled');
    assert.equal((await minesCashout(db, userId, m.id, T0)).status, 'settled', 'cash-out still works');

    await setGameFlag(db, 'op', 'coinflip', false, 'incident', T0);
    assert.equal(await code(() => createCoinflip(db, cfg, userId, frags(10), 'rust', T0)), 'game_disabled');
    const beacon = new LocalBeacon(T0 - 60_000, 1000);
    const crash = new CrashService(db, cfg, beacon, 20);
    await setGameFlag(db, 'op', 'crash', false, 'incident', T0);
    assert.equal(await code(() => crash.placeBet(userId, frags(10), 200, T0)), 'game_disabled');

    await setGameFlag(db, 'op', 'dice', true, null, T0 + 1);
    assert.equal((await playInstant(db, cfg, userId, 'dice', frags(10), { chance: 50, direction: 'under' }, T0 + 2)).status, 'settled');
    const events = (await db.prepare("SELECT event FROM audit WHERE event LIKE 'admin_game_%'").all() as { event: string }[]).map((e) => e.event);
    assert.deepEqual(events, ['admin_game_disabled', 'admin_game_disabled', 'admin_game_disabled', 'admin_game_disabled', 'admin_game_enabled']);
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });
});

describe('operations: chat', () => {
  it('rules: length, links, 3 s pace, mutes, read-only during a break, deletions', async () => {
    const { db, userId } = await setup();
    const u = (await getUser(db, userId))!;
    assert.equal(await code(() => postMessage(db, u, 2, '   ', T0)), 'invalid_message');
    assert.equal(await code(() => postMessage(db, u, 2, 'x'.repeat(201), T0)), 'invalid_message');
    for (const link of ['join https://evil.example', 'www.free-skins', 'discord.gg/abc', 'go to rustskins.gg now']) assert.equal(await code(() => postMessage(db, u, 2, link, T0)), 'no_links', link);
    const { id } = await postMessage(db, u, 2, 'gl  everyone', T0);
    assert.equal(await code(() => postMessage(db, u, 2, 'again', T0 + 2999)), 'chat_slow');
    await postMessage(db, u, 2, 'again', T0 + 3000);
    const msgs = await listMessages(db, userId);
    assert.deepEqual(msgs.map((m) => m.body), ['gl everyone', 'again']);
    assert.ok(msgs.every((m) => m.you && m.kind === 'user'));

    await deleteMessage(db, 'mod', id, T0 + 4000);
    assert.deepEqual((await listMessages(db, null)).map((m) => m.body), ['again']);
    await mute(db, 'mod', userId, 10, 'spam', T0 + 5000);
    assert.equal(await code(() => postMessage(db, u, 2, 'hello?', T0 + 10_000)), 'muted');
    await postMessage(db, u, 2, 'back', T0 + 5000 + 10 * 60_000);
    await mute(db, 'mod', userId, null, 'spam again', T0 + 700_000);
    await unmute(db, 'mod', userId, T0 + 701_000);
    await postMessage(db, u, 2, 'thanks', T0 + 702_000);
    await startCooldown(db, userId, 24, T0 + 703_000);
    assert.equal(await code(() => postMessage(db, u, 2, 'hi', T0 + 710_000)), 'rg_blocked');
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event LIKE 'mod_%'").get() as { n: number }).n, 4);
  });
  it('the server posts real events only: Oil Rain and big wins', async () => {
    const { db, cfg, userId } = await setup();
    const slot = Math.ceil(T0 / RAIN_PERIOD_MS) * RAIN_PERIOD_MS;
    await rainTick(db, cfg, slot);
    await playInstant(db, cfg, userId, 'upgrader', frags(20000), { multiplier: 2 }, slot + 1); // level 5 for the rain
    await joinRain(db, userId, slot + 2);
    await rainTick(db, cfg, slot + RAIN_WINDOW_MS);
    let t = slot + RAIN_WINDOW_MS + 1;
    const end = t + 2000;
    while (!(await listMessages(db, null)).some((m) => m.kind === 'win') && t < end) await playInstant(db, cfg, userId, 'dice', frags(10), { chance: 9.8, direction: 'under' }, t++);
    const kinds = (await listMessages(db, null)).map((m) => `${m.kind}:${m.body}`);
    assert.ok(kinds[0].startsWith('rain:Oil Rain is open for 2 minutes: 500.00 Scrap pot'), kinds[0]);
    assert.equal(kinds[1], 'rain:Oil Rain paid 500.00 Scrap each to 1 player.');
    assert.equal(kinds[kinds.length - 1], 'win:Tester hit 10× on Dice: +100.00 Scrap');
    assert.equal(kinds.filter((k) => k.startsWith('win:')).length, 1, 'the 2× upgrader win stays quiet, the first 10× dice win is announced');
  });
});

describe('operations: backoffice', () => {
  it('RTP monitor: honest play is ok, a paytable bug raises an alarm', async () => {
    const { db, cfg, userId } = await setup();
    for (let i = 0; i < 2000; i++) await playInstant(db, cfg, userId, 'dice', frags(1), { chance: 49.5, direction: 'under' }, T0 + i);
    for (let i = 0; i < 50; i++) await playInstant(db, cfg, userId, 'cases', 0, { caseId: 'toolbox' }, T0 + 5000 + i);
    let rows = await rtpMonitor(db, T0 - 1);
    const dice = rows.find((r) => r.game === 'dice')!;
    assert.equal(dice.n, 2000);
    assert.equal(dice.status, 'ok');
    assert.ok(Math.abs(dice.z!) < 4 && Math.abs(dice.theory! - 0.98) < 1e-12);
    const cases = rows.find((r) => r.game === 'cases')!;
    assert.equal(cases.status, 'low_sample');
    assert.ok(Math.abs(cases.theory! - 0.93) < 1e-4, 'per-bet theory comes from the case itself');
    await db.exec("UPDATE bets SET payout = CAST(payout * 1.3 AS INTEGER) WHERE game = 'dice'"); // simulated paytable bug
    rows = await rtpMonitor(db, T0 - 1);
    assert.equal(rows.find((r) => r.game === 'dice')!.status, 'alarm');
  });
  it('holds block play; operators lift their own holds but never a cooldown or self-exclusion', async () => {
    const { db, cfg, userId } = await setup();
    const dice = (t: number) => code(() => playInstant(db, cfg, userId, 'dice', frags(1), { chance: 50, direction: 'under' }, t));
    assert.equal(await code(() => holdPlayer(db, 'op', userId, 24, ' ', T0)), 'invalid_params');
    await holdPlayer(db, 'op', userId, null, 'chargeback review', T0);
    assert.equal(await dice(T0 + 1), 'account_hold');
    await releaseHold(db, 'op', userId, T0 + 2);
    assert.equal(await dice(T0 + 3), 'no-error');
    await startCooldown(db, userId, 48, T0 + 4);
    assert.equal(await code(() => releaseHold(db, 'op', userId, T0 + 5)), 'not_found');
    assert.equal(await dice(T0 + 6), 'rg_cooldown');
    await holdPlayer(db, 'op', userId, 1, 'test', T0 + 7);
    await releaseHold(db, 'op', userId, T0 + 8);
    assert.equal(await dice(T0 + 9), 'rg_cooldown', 'releasing a hold leaves the cooldown in place');
    await selfExclude(db, userId, 6, T0 + 10);
    assert.equal(await dice(T0 + 11), 'rg_excluded');
  });
  it('RG cases: net loss, repeated limit raises and long sessions, one open case each', async () => {
    const { db, cfg, userId } = await setup({ rgAlert: { netLoss24h: frags(100), limitRaises30d: 3, sessionHours: 3 } });
    await createSession(db, cfg, userId, T0);
    await setLimit(db, cfg, userId, 'loss', 'day', frags(50_000), T0);
    for (const x of [60_000, 70_000, 80_000]) await setLimit(db, cfg, userId, 'loss', 'day', frags(x), T0 + 1000);
    await minesStart(db, cfg, userId, frags(200), 3, T0 + 3.5 * HOUR); // open stake counts as lost
    assert.equal(await rgScan(db, cfg, T0 + 3.5 * HOUR), 3);
    assert.equal(await rgScan(db, cfg, T0 + 3.5 * HOUR + 1), 0, 'no duplicates while a case is open');
    const cases = await rgCases(db, 'open');
    assert.deepEqual(cases.map((c) => c.reason).sort(), ['limit_raises_30d', 'long_session', 'net_loss_24h']);
    assert.equal(await code(() => updateCase(db, 'op', cases[0].id, 'closed', '', T0)), 'invalid_params');
    await updateCase(db, 'op', cases[0].id, 'contacted', 'sent RG message', T0 + 4 * HOUR);
    await updateCase(db, 'op', cases[0].id, 'closed', 'player set a lower limit', T0 + 5 * HOUR);
    assert.equal((await rgCases(db, 'open')).length, 2);
  });
  it('API: roles gate the backoffice and moderation; the demo can grant itself a role', async () => {
    let now = T0;
    const db = await newDb();
    const beacon = new LocalBeacon(T0 - 60_000, 1000);
    const deps = { db, cfg: DEFAULT_CONFIG, clock: () => now, fetch: async () => ({ ok: false, text: async () => '' }), publicUrl: 'http://x', beacon, crash: new CrashService(db, DEFAULT_CONFIG, beacon, 20) };
    const router = createRouter(deps);
    const call = async (token: string, method: string, url: string, body?: unknown) => {
      now += 50;
      const r = await router.dispatch({ method, url, headers: { 'cf-ipcountry': 'NZ', authorization: `Bearer ${token}` }, body: body ?? null, ip: 't' });
      return { status: r.status, json: r.payload as any };
    };
    const a = (await call('', 'POST', '/auth/demo', { displayName: 'Op', ageConfirmed: true })).json.token;
    const b = (await call('', 'POST', '/auth/demo', { displayName: 'Player', ageConfirmed: true })).json.token;
    assert.equal((await call(a, 'GET', '/admin/overview')).status, 403);
    assert.equal((await call(a, 'POST', '/demo/role', { role: 'root' })).status, 400);
    assert.equal((await call(a, 'POST', '/demo/role', { role: 'admin' })).status, 200);
    assert.equal((await call(a, 'GET', '/me')).json.role, 'admin');
    const ov = await call(a, 'GET', '/admin/overview');
    assert.equal(ov.status, 200);
    assert.equal(ov.json.players.total, 2);
    assert.equal(ov.json.ledger.ok, true);

    assert.equal((await call(b, 'POST', '/chat', { body: 'hi all' })).json.error, 'chat_level', 'new accounts read first');
    assert.equal((await call(a, 'PUT', '/admin/settings', { chatMinLevel: 1 })).status, 200);
    const posted = await call(b, 'POST', '/chat', { body: 'hi all' });
    assert.equal(posted.status, 200);
    assert.equal((await call(b, 'DELETE', `/mod/chat/${posted.json.id}`)).status, 403, 'players cannot moderate');
    assert.equal((await call(a, 'DELETE', `/mod/chat/${posted.json.id}`)).status, 200);
    assert.equal((await call(b, 'GET', '/chat')).json.messages.length, 0);

    assert.equal((await call(a, 'PUT', '/admin/games/dice', { enabled: false, reason: 'review' })).status, 200);
    assert.equal((await call(b, 'GET', '/games/status')).json.find((g: any) => g.game === 'dice').enabled, false);
    const refused = await call(b, 'POST', '/bets/dice', { stake: 1, params: { chance: 50, direction: 'under' } });
    assert.equal(refused.status, 503);
    assert.equal(refused.json.error, 'game_disabled');

    const players = (await call(a, 'GET', '/admin/players?q=Play')).json;
    assert.equal(players.length, 1);
    assert.equal((await call(a, 'POST', `/admin/players/${players[0].id}/hold`, { hours: 2, reason: 'check' })).status, 200);
    const detail = (await call(a, 'GET', `/admin/players/${players[0].id}`)).json;
    assert.equal(detail.block.kind, 'operator');
    assert.ok(detail.audit.some((e: any) => e.event === 'admin_hold'));
    const log = (await call(a, 'GET', '/admin/audit?event=admin_')).json;
    assert.deepEqual(log.map((e: any) => e.event), ['admin_hold', 'admin_game_disabled', 'admin_settings', 'admin_role']);

    const prod = createRouter({ ...deps, cfg: { ...DEFAULT_CONFIG, demo: false } });
    const r = await prod.dispatch({ method: 'POST', url: '/demo/role', headers: { 'cf-ipcountry': 'NZ', authorization: `Bearer ${b}` }, body: { role: 'admin' }, ip: 't2' });
    assert.equal(r.status, 403, 'no self-promotion outside the demo');
  });
});

describe('concurrency (run with TEST_PG_URL for real parallelism)', () => {
  it('parallel requests keep nonces unique, claims single, balances non-negative and the ledger at zero', async () => {
    const { db, cfg, userId } = await setup({ demoStartBalance: frags(1000) });
    // 40 parallel dice bets: every nonce used exactly once
    const bets = await Promise.all(Array.from({ length: 40 }, (_, i) => playInstant(db, cfg, userId, 'dice', frags(1), { chance: 50, direction: 'under' }, T0 + i)));
    assert.deepEqual(bets.map((b) => b.nonce).sort((a, b) => a - b), Array.from({ length: 40 }, (_, i) => i));
    // 10 parallel mines rounds: only one may be open
    const starts = await Promise.all(Array.from({ length: 10 }, () => code(() => minesStart(db, cfg, userId, frags(1), 3, T0 + 100))));
    assert.equal(starts.filter((c) => c === 'no-error').length, 1);
    assert.ok(starts.every((c) => c === 'no-error' || c === 'open_game' || c === 'conflict'), starts.join(','));
    // 8 parallel stakes of 60 % of the balance: at most one fits
    const bal0 = await bal(db, userId);
    const stake = Math.floor((bal0 * 0.6) / 1000) * 1000;
    const big = await Promise.all(Array.from({ length: 8 }, (_, i) => code(() => playInstant(db, cfg, userId, 'upgrader', stake, { multiplier: 90 }, T0 + 200 + i))));
    assert.equal(big.filter((c) => c === 'no-error').length, 1, big.join(','));
    assert.ok((await bal(db, userId)) >= 0);
    // 5 parallel rakeback claims after enough play: paid once
    const { userId: whale } = await signUp(db, cfg, { displayName: 'Whale', ageConfirmed: true, country: 'NZ' }, T0);
    await transferForTest(db, whale);
    await playInstant(db, cfg, whale, 'upgrader', frags(50_000), { multiplier: 2 }, T0 + 300);
    const claims = await Promise.all(Array.from({ length: 5 }, () => code(() => claimRakeback(db, whale, T0 + 400))));
    assert.equal(claims.filter((c) => c === 'no-error').length, 1, claims.join(','));
    assert.equal(((await db.prepare("SELECT COUNT(*) AS n FROM reward_claims WHERE user_id = ? AND kind = 'rakeback'").get(whale)) as { n: number }).n, 1);
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });
});

async function transferForTest(db: DB, userId: string) {
  const { transfer, FAUCET } = await import('../src/wallet');
  await transfer(db, FAUCET, userAccount(userId), frags(100_000), 'demo_grant', 'test', T0);
}

describe('operator security', () => {
  it('TOTP matches the RFC 6238 test vector and base32 round-trips', () => {
    const secret = new TextEncoder().encode('12345678901234567890');
    assert.equal(hotp(secret, Math.floor(59_000 / 30_000)), '287082');
    assert.equal(hotp(secret, Math.floor(1111111109_000 / 30_000)), '081804');
    assert.equal(totp(base32Encode(secret), 59_000), '287082');
  });
  it('IP allowlist: CIDR, exact and IPv4-mapped addresses', () => {
    assert.equal(ipAllowed('10.1.2.3', []), true);
    assert.equal(ipAllowed('10.1.2.3', ['10.0.0.0/8']), true);
    assert.equal(ipAllowed('::ffff:10.1.2.3', ['10.0.0.0/8']), true);
    assert.equal(ipAllowed('11.1.2.3', ['10.0.0.0/8', '192.168.1.5']), false);
    assert.equal(ipAllowed('192.168.1.5', ['10.0.0.0/8', '192.168.1.5']), true);
  });
  it('backoffice needs an enrolled, fresh TOTP step-up and refuses replayed codes and foreign IPs', async () => {
    let now = T0;
    const db = await newDb();
    const beacon = new LocalBeacon(T0 - 60_000, 1000);
    const cfg = { ...DEFAULT_CONFIG, requireOperatorMfa: true, operatorIpAllowlist: ['10.0.0.0/8'] };
    const router = createRouter({ db, cfg, clock: () => now, fetch: async () => ({ ok: false, text: async () => '' }), publicUrl: 'http://x', beacon, crash: new CrashService(db, cfg, beacon, 20) });
    const call = async (token: string, method: string, url: string, body?: unknown, ip = '10.0.0.7') => {
      now += 10;
      const r = await router.dispatch({ method, url, headers: { 'cf-ipcountry': 'NZ', authorization: `Bearer ${token}` }, body: body ?? null, ip });
      return { status: r.status, json: r.payload as any };
    };
    const t = (await call('', 'POST', '/auth/demo', { displayName: 'Op', ageConfirmed: true })).json.token;
    await call(t, 'POST', '/demo/role', { role: 'admin' });
    assert.equal((await call(t, 'GET', '/admin/overview', undefined, '8.8.8.8')).status, 403, 'outside the allowlist');
    assert.equal((await call(t, 'GET', '/admin/overview')).json.error, 'mfa_enroll_required');
    const { secret } = (await call(t, 'POST', '/mfa/enroll')).json;
    assert.equal((await call(t, 'POST', '/mfa/confirm', { code: '000000' })).status, 401);
    assert.equal((await call(t, 'POST', '/mfa/confirm', { code: totp(secret, now) })).status, 200);
    assert.equal((await call(t, 'GET', '/admin/overview')).status, 200, 'confirming counts as a step-up');
    assert.equal((await call(t, 'POST', '/mfa/verify', { code: totp(secret, now) })).json.error, 'mfa_invalid', 'a used code cannot be replayed');
    assert.equal((await call(t, 'GET', '/me')).json.mfa.fresh, true);
    now += 13 * 3_600_000;
    assert.equal((await call(t, 'GET', '/admin/overview')).json.error, 'mfa_required', 'step-up expires');
    assert.equal((await call(t, 'POST', '/mfa/verify', { code: totp(secret, now) })).status, 200);
    assert.equal((await call(t, 'GET', '/admin/overview')).status, 200);
    const events = (await call(t, 'GET', '/admin/audit?event=mfa_')).json.map((e: any) => e.event);
    assert.deepEqual(events, ['mfa_verified', 'mfa_failed', 'mfa_enrolled', 'mfa_enroll_started']);
  });
});

describe('new originals (phase 11)', () => {
  const seedOf = async (db: DB, betId: string) => (await db.prepare('SELECT s.* FROM bets b JOIN seeds s ON s.id = b.seed_id WHERE b.id = ?').get(betId)) as { server_seed: string; client_seed: string };
  const stateOf = async (db: DB, betId: string) => JSON.parse(((await db.prepare('SELECT state FROM bets WHERE id = ?').get(betId)) as { state: string }).state);

  it('airdrop: instant result replays from the seed; targets over the max win are refused', async () => {
    const { db, cfg, userId } = await setup();
    const bet = await playInstant(db, cfg, userId, 'airdrop', frags(10), { target: 2 }, T0);
    const seed = await seedOf(db, bet.id);
    const replay = playAirdrop(new FairStream(seed.server_seed, seed.client_seed, bet.nonce), 2);
    assert.equal(bet.payout, replay.win ? frags(20) : 0);
    assert.equal(await code(() => playInstant(db, cfg, userId, 'airdrop', frags(1000), { target: 9000 }, T0 + 1)), 'max_win');
    assert.equal(await code(() => playInstant(db, cfg, userId, 'airdrop', frags(10), { target: 1 }, T0 + 2)), 'RangeError', 'the router maps this to invalid_params');
  });

  it('monument run: traps stay hidden, safe doors pay the ladder, a trap ends the run, layout replays', async () => {
    const { db, cfg, userId } = await setup();
    const run = (await towersStart(db, cfg, userId, frags(10), 'red', T0)) as any;
    assert.equal('traps' in run, false);
    assert.equal(JSON.stringify(run).includes('traps'), false, 'no trap positions in the public view');
    const { traps } = await stateOf(db, run.id);
    const safe = (room: number) => (traps[room][0] === 0 ? 1 : 0);
    let r = (await towersPick(db, cfg, userId, run.id, safe(0), T0 + 1)) as any;
    r = (await towersPick(db, cfg, userId, run.id, safe(1), T0 + 2)) as any;
    assert.equal(r.currentMultiplier, towersMultiplier('red', 2));
    const before = await bal(db, userId);
    const done = (await towersCashout(db, userId, run.id, T0 + 3)) as any;
    assert.equal(done.status, 'settled');
    assert.equal(await bal(db, userId) - before, Math.floor(frags(10) * towersMultiplier('red', 2)));
    const run2 = (await towersStart(db, cfg, userId, frags(10), 'red', T0 + 4)) as any;
    const t2 = (await stateOf(db, run2.id)).traps;
    const lost = (await towersPick(db, cfg, userId, run2.id, t2[0][0], T0 + 5)) as any;
    assert.equal(lost.status, 'settled');
    assert.equal(lost.payout, 0);
    const seed = await seedOf(db, run2.id);
    assert.deepEqual(layTraps(new FairStream(seed.server_seed, seed.client_seed, run2.fairness.nonce), 'red'), t2);
    assert.equal(await code(() => towersStart(db, cfg, userId, frags(1), 'purple' as never, T0 + 6)), 'invalid_params');
  });

  it('hi-lo: guesses follow the replayed cards, p = 1 guesses are refused, skips keep the value', async () => {
    const { db, cfg, userId } = await setup();
    const round = (await hiloStart(db, cfg, userId, frags(10), T0)) as any;
    const seed = await seedOf(db, round.id);
    const src = new FairStream(seed.server_seed, seed.client_seed, round.fairness.nonce);
    const cards = Array.from({ length: 6 }, () => drawCard(src));
    assert.deepEqual(round.cards, [cards[0]]);
    let r: any = round;
    for (let i = 1; i < 4; i++) {
      const cur = cards[i - 1].rank;
      if (cur === 1 || cur === 13) { r = (await hiloMove(db, cfg, userId, round.id, 'skip', T0 + i)) as any; assert.equal(r.currentMultiplier, i === 1 ? 1 : r.currentMultiplier); continue; }
      const right = cards[i].rank >= cur ? 'hi' : 'lo';
      r = (await hiloMove(db, cfg, userId, round.id, right, T0 + i)) as any;
      assert.equal(r.status, 'open');
    }
    if (r.guesses > 0) {
      const done = (await hiloCashout(db, userId, round.id, T0 + 10)) as any;
      assert.equal(done.status, 'settled');
      assert.ok(done.payout > 0);
    }
    const r2 = (await hiloStart(db, cfg, userId, frags(10), T0 + 20)) as any;
    const s2 = await seedOf(db, r2.id);
    const src2 = new FairStream(s2.server_seed, s2.client_seed, r2.fairness.nonce);
    const c0 = drawCard(src2).rank, c1 = drawCard(src2).rank;
    const blocked = c0 === 1 ? 'hi' : c0 === 13 ? 'lo' : null;
    if (blocked) assert.equal(await code(() => hiloMove(db, cfg, userId, r2.id, blocked, T0 + 21)), 'invalid_action');
    else {
      const wrong = c1 >= c0 ? (c1 === c0 ? null : 'lo') : 'hi';
      if (wrong) { const lost = (await hiloMove(db, cfg, userId, r2.id, wrong, T0 + 21)) as any; assert.equal(lost.payout, 0); assert.equal(lost.status, 'settled'); }
    }
    assert.equal(hiloChance(7, 'hi'), 7 / 13);
  });

  it('blackjack: hole card hidden, doubles and splits take a second stake, results replay, ledger closes', async () => {
    const { db, cfg, userId } = await setup();
    let doubled = 0, split = 0;
    for (let i = 0; i < 400 && (doubled < 2 || split < 1); i++) {
      const start0 = await bal(db, userId);
      let r: any = await bjStart(db, cfg, userId, frags(10), T0 + i * 10);
      if (r.status === 'open') {
        assert.equal(JSON.stringify(r).includes('"dealer":[') , false, 'the hole card is not in the public view');
        assert.deepEqual(Object.keys(r.dealer).sort(), ['up', 'upValue']);
        let step = 0;
        while (r.status === 'open') {
          const st = await stateOf(db, r.id);
          let act = optimalAction(st.hands[st.active].cards, cardValue(st.dealer[0]), r.actions);
          if (r.actions.includes('split') && split < 1) act = 'split';
          else if (r.actions.includes('double') && doubled < 2) act = 'double';
          if (act === 'split') split++;
          if (act === 'double') doubled++;
          r = await bjAction(db, userId, r.id, act, T0 + i * 10 + ++step);
        }
      }
      // replay the round from the seed with the same decisions recorded in the result
      const seed = await seedOf(db, r.id);
      const res = r.result;
      const base = frags(10);
      assert.equal(r.stake, base * res.results.reduce((a: number, h: { stake: number }) => a + h.stake, 0), 'stake = base × stake units');
      assert.equal(r.payout, Math.floor(base * res.results.reduce((a: number, h: { payout: number }) => a + h.payout, 0) + 1e-9));
      assert.equal(await bal(db, userId) - start0, r.payout - r.stake);
      assert.equal(res.dealer[0], bjDeal(new FairStream(seed.server_seed, seed.client_seed, r.fairness.nonce)).dealer[0]);
    }
    assert.ok(doubled >= 1 && split >= 1, `doubled ${doubled}, split ${split}`);
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
    // a full replay of one round with the engine
    const st = bjDeal({ next: (() => { const xs = [0.15, 0.6, 0.15, 0.5, 0.3]; let k = 0; return () => xs[k++]; })() });
    assert.deepEqual(bjEngineActions(st).includes('split'), true);
    const after = bjEngineAct({ next: () => 0.3 }, st, 'stand');
    assert.equal(bjSettle(after).stake, 1);
  });

  it('bandit wheel: field hidden while betting, payouts match the replayed spin, seeds link up', async () => {
    const { db, cfg, userId } = await setup();
    const beacon = new LocalBeacon(T0 - 60_000, 1000);
    const svc = new WheelService(db, cfg, beacon, 30);
    await svc.tick(T0);
    const readyAt = beacon.timeOf((await svc.state(T0, null)).chain!.beaconRound);
    await svc.tick(readyAt);
    const s1 = await svc.state(readyAt, userId);
    assert.equal(s1.round!.status, 'betting');
    assert.equal(s1.round!.field, null);
    await svc.placeBet(userId, '1', frags(10), readyAt + 10);
    await svc.placeBet(userId, '20', frags(5), readyAt + 20);
    assert.equal(await code(() => svc.placeBet(userId, '1', frags(10), readyAt + 30)), 'already_bet');
    assert.equal(await code(() => svc.placeBet(userId, '7' as never, frags(10), readyAt + 30)), 'invalid_params');
    for (let t = readyAt; t <= readyAt + 15_000 + 100; t += 500) await svc.tick(t);
    const spinning = await svc.state(readyAt + 15_200, userId);
    assert.equal(spinning.round!.status, 'spinning');
    assert.ok(spinning.round!.field !== null);
    assert.equal(spinning.round!.seed, null);
    assert.equal(await code(() => svc.placeBet(userId, '3', frags(1), readyAt + 15_300)), 'not_betting');
    for (let t = readyAt + 15_000; t <= readyAt + 60_000; t += 500) await svc.tick(t);
    const st = await svc.state(readyAt + 60_000, userId);
    const first = st.history[st.history.length - 1];
    assert.ok(verifyCrashLink(first.seed, st.chain!.terminalHash));
    assert.equal(first.index, spinWheel(new FairStream(first.seed, st.chain!.clientSeed!, 0)).index);
    const bets = (await db.prepare('SELECT * FROM wheel_bets WHERE user_id = ? ORDER BY field').all(userId)) as { field: string; stake: number; payout: number; status: string }[];
    for (const b of bets) {
      assert.equal(b.status, 'settled');
      assert.equal(b.payout, b.field === WHEEL_LAYOUT[first.index] ? Math.floor(b.stake * wheelPayout(b.field as '1')) : 0);
    }
    assert.ok(st.history.length >= 2, 'rounds keep coming');
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });

  it('jackpot: countdown on the second player, beacon draw, 4 % fee, escrow closes, refunds and limits', async () => {
    const { db, cfg, userId } = await setup();
    const { userId: b } = await signUp(db, cfg, { displayName: 'Bea', ageConfirmed: true, country: 'NZ' }, T0);
    const beacon = new LocalBeacon(T0 - 60_000, 1000);
    const jp = new JackpotService(db, cfg, beacon);
    assert.equal(await code(() => jp.enter(userId, 'low', frags(60), T0)), 'invalid_stake');
    await jp.enter(userId, 'low', frags(30), T0);
    let st = await jp.state('low', T0, userId);
    assert.equal(st.current!.status, 'open');
    await jp.enter(b, 'low', frags(10), T0 + 1000);
    await jp.enter(userId, 'low', frags(20), T0 + 2000);
    st = await jp.state('low', T0 + 2000, userId);
    assert.equal(st.current!.status, 'counting');
    assert.equal(st.current!.total, 60);
    assert.deepEqual(st.current!.entries.map((e) => e.ticketFrom), [0, 30_000, 40_000]);
    assert.equal(st.current!.fairness.serverSeed, null);
    const before = [await bal(db, userId), await bal(db, b)];
    await jp.tick(T0 + 1000 + JACKPOT_COUNTDOWN_MS);
    st = await jp.state('low', T0 + 1000 + JACKPOT_COUNTDOWN_MS, userId);
    assert.equal(st.current!.status, 'locked');
    assert.equal(await code(() => jp.enter(b, 'low', frags(5), T0 + 1000 + JACKPOT_COUNTDOWN_MS + 1)), 'jackpot_locked');
    const resolves = st.current!.fairness.beacon.resolvesAt!;
    await jp.tick(resolves);
    st = await jp.state('low', resolves, userId);
    assert.equal(st.current, null);
    const last = st.last!;
    assert.equal(last.status, 'settled');
    const replay = drawJackpot(new FairStream(last.fairness.serverSeed!, last.fairness.beacon.value!, 0), [{ amount: frags(30) }, { amount: frags(10) }, { amount: frags(20) }]);
    assert.equal(last.winner!.ticket, replay.ticket);
    assert.equal(last.winner!.payout, Math.floor(frags(60) * 0.96) / 1000);
    const gains = [await bal(db, userId) - before[0], await bal(db, b) - before[1]];
    assert.equal(gains.reduce((x, y) => x + y, 0), Math.floor(frags(60) * 0.96));
    assert.equal(await balanceOf(db, JACKPOT_ESCROW), 0);
    // alone for 10 minutes → full refund
    const solo = await bal(db, b);
    await jp.enter(b, 'high', frags(50), T0 + 100_000);
    await jp.tick(T0 + 100_000 + JACKPOT_REFUND_MS);
    assert.equal(await bal(db, b), solo);
    assert.equal(await balanceOf(db, JACKPOT_ESCROW), 0);
    // RG limits apply to entries
    await setLimit(db, cfg, userId, 'wager', 'day', frags(70), T0 + 200_000);
    assert.equal(await code(() => jp.enter(userId, 'low', frags(25), T0 + 200_001)), 'rg_limit', '50 Scrap already in jackpots today + 25 > 70');
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });

  it('open rounds come back after a reload without hidden state; the kill switch covers every new mode', async () => {
    const { db, cfg, userId } = await setup();
    await towersStart(db, cfg, userId, frags(5), 'green', T0);
    await hiloStart(db, cfg, userId, frags(5), T0 + 1);
    const rounds = await openRounds(db, userId);
    assert.deepEqual(rounds.map((r) => r.game).sort(), ['hilo', 'towers']);
    assert.ok(!JSON.stringify(rounds).includes('traps'));
    for (const g of ['airdrop', 'towers', 'hilo', 'blackjack', 'wheel', 'jackpot']) await setGameFlag(db, 'op', g, false, 'test', T0 + 2);
    assert.equal(await code(() => playInstant(db, cfg, userId, 'airdrop', frags(1), { target: 2 }, T0 + 3)), 'game_disabled');
    assert.equal(await code(() => towersPick(db, cfg, userId, rounds.find((r) => r.game === 'towers')!.id, 0, T0 + 3)), 'game_disabled');
    assert.equal(await code(() => bjStart(db, cfg, userId, frags(1), T0 + 3)), 'game_disabled');
    assert.equal(await code(() => new JackpotService(db, cfg, new LocalBeacon(T0, 100)).enter(userId, 'high', frags(10), T0 + 3)), 'game_disabled');
    const rtp = await rtpMonitor(db, T0 - 1);
    assert.ok(['wheel', 'jackpot', 'towers', 'hilo', 'blackjack', 'airdrop'].every((g) => rtp.some((r) => r.game === g)));
    assert.equal(rtp.find((r) => r.game === 'blackjack')!.status, 'skill');
  });
});

describe('admin (phase 11)', () => {
  const beaconAt = () => new LocalBeacon(T0 - 60_000, 1000);

  it('settings: maintenance pauses every game but not cash-outs; sign-ups, chat pace and rain follow the switches', async () => {
    const { db, cfg, userId } = await setup();
    const mines = await minesStart(db, cfg, userId, frags(10), 3, T0);
    const layout = JSON.parse((await getBet(db, mines.id))!.state!).mines as number[];
    await minesReveal(db, cfg, userId, mines.id, [...Array(25).keys()].find((t) => !layout.includes(t))!, T0 + 1);
    assert.equal(await code(() => setSettings(db, userId, { maintenance: 'yes' }, T0)), 'invalid_params');
    assert.equal(await code(() => setSettings(db, userId, { nope: true }, T0)), 'invalid_params');
    assert.equal(await code(() => setSettings(db, userId, { chatSlowModeSeconds: 0 }, T0)), 'invalid_params');
    await setSettings(db, userId, { maintenance: true, registrationOpen: false, chatSlowModeSeconds: 10, rainEnabled: false, announcement: { text: 'Back at 18:00 UTC', tone: 'warn' } }, T0 + 2);
    assert.deepEqual(await publicSite(db), { announcement: { text: 'Back at 18:00 UTC', tone: 'warn' }, maintenance: true, registrationOpen: false });
    assert.equal(await code(() => playInstant(db, cfg, userId, 'dice', frags(1), { chance: 50, direction: 'under' }, T0 + 3)), 'maintenance');
    assert.equal(await code(() => towersStart(db, cfg, userId, frags(1), 'green', T0 + 3)), 'maintenance');
    assert.equal(await code(() => minesReveal(db, cfg, userId, mines.id, 0, T0 + 3)), 'maintenance');
    assert.equal((await minesCashout(db, userId, mines.id, T0 + 4)).status, 'settled', 'cash-out still works');
    assert.equal(await code(() => signUp(db, cfg, { displayName: 'Late', ageConfirmed: true, country: 'NZ' }, T0 + 5)), 'registration_closed');
    const user = (await getUser(db, userId))!;
    await postMessage(db, user, 2, 'hello', T0 + 10);
    assert.equal(await code(() => postMessage(db, user, 2, 'again', T0 + 5000)), 'chat_slow');
    await postMessage(db, user, 2, 'again', T0 + 10_010);
    await rainTick(db, cfg, T0 + 6);
    assert.equal(((await db.prepare('SELECT COUNT(*) AS n FROM rain_rounds').get()) as { n: number }).n, 0, 'no new Oil Rain while switched off');
    await setSettings(db, userId, { maintenance: false, announcement: null }, T0 + 7);
    assert.equal((await playInstant(db, cfg, userId, 'dice', frags(1), { chance: 50, direction: 'under' }, T0 + 8)).status, 'settled');
    assert.equal((await publicSite(db)).announcement, null);
  });

  it('per-game limits only tighten the global ones and apply to that game only', async () => {
    const { db, cfg, userId } = await setup();
    assert.equal(await code(() => setGameLimits(db, cfg, userId, 'dice', { minStake: null, maxStake: cfg.maxStake + 1, maxWin: null }, T0)), 'invalid_params');
    assert.equal(await code(() => setGameLimits(db, cfg, userId, 'dice', { minStake: frags(50), maxStake: frags(10), maxWin: null }, T0)), 'invalid_params');
    assert.equal(await code(() => setGameLimits(db, cfg, userId, 'nope', { minStake: null, maxStake: null, maxWin: null }, T0)), 'not_found');
    const g = await setGameLimits(db, cfg, userId, 'dice', { minStake: frags(5), maxStake: frags(50), maxWin: frags(200) }, T0);
    assert.deepEqual(g.limits, { minStake: frags(5), maxStake: frags(50), maxWin: frags(200) });
    const dice = (stake: number, chance = 50) => playInstant(db, cfg, userId, 'dice', stake, { chance, direction: 'under' }, T0 + 1);
    assert.equal(await code(() => dice(frags(1))), 'invalid_stake');
    assert.equal(await code(() => dice(frags(60))), 'invalid_stake');
    assert.equal(await code(() => dice(frags(50), 10)), 'max_win', '50 × 9.6 > 200');
    assert.equal((await dice(frags(20))).status, 'settled');
    assert.equal((await playInstant(db, cfg, userId, 'plinko', frags(1), { rows: 8, risk: 'low' }, T0 + 2)).status, 'settled', 'other games keep the global limits');
    await setGameFlag(db, userId, 'dice', false, 'check', T0 + 3);
    await setGameFlag(db, userId, 'dice', true, null, T0 + 4);
    assert.deepEqual((await gameFlags(db)).find((x) => x.game === 'dice')!.limits, { minStake: frags(5), maxStake: frags(50), maxWin: frags(200) }, 'the kill switch keeps the limits');
    const crash = new CrashService(db, cfg, beaconAt(), 20);
    await setGameLimits(db, cfg, userId, 'crash', { minStake: null, maxStake: frags(3), maxWin: null }, T0 + 5);
    await crash.tick(T0);
    const readyAt = beaconAt().timeOf((await crash.state(T0, null)).chain!.beaconRound);
    await crash.tick(readyAt);
    assert.equal(await code(() => crash.placeBet(userId, frags(4), 200, readyAt + 1)), 'invalid_stake');
    await crash.placeBet(userId, frags(3), 200, readyAt + 2);
  });

  it('cases: built-ins are version 1, edits publish new versions, old openings and battles keep theirs', async () => {
    const { db, cfg, userId } = await setup();
    const listed = await listCases(db);
    assert.deepEqual(listed.map((c) => [c.id, c.price, c.version]), SAMPLE_CASES.map((c) => [c.id, priceCase(c), 1]));
    const box = SAMPLE_CASES[0];
    const first = await playInstant(db, cfg, userId, 'cases', 0, { caseId: box.id }, T0);
    assert.deepEqual(JSON.parse(first.params), { caseId: box.id, version: 1 });

    const items = [{ name: 'Scrap', value: 10, weight: 900 }, { name: 'Gear', value: 200, weight: 99 }, { name: 'AK', value: 4000, weight: 1 }];
    assert.equal(await code(() => saveCase(db, cfg, userId, { id: 'X!', name: 'Bad', items }, T0)), 'invalid_params');
    assert.equal(await code(() => saveCase(db, cfg, userId, { id: 'big', name: 'Big', items: [{ name: 'a', value: 1, weight: 1 }, { name: 'b', value: cfg.maxWin, weight: 1 }] }, T0)), 'invalid_params');
    assert.equal(await code(() => saveCase(db, cfg, userId, { id: 'neg', name: 'Neg', items: [{ name: 'a', value: -1, weight: 1 }, { name: 'b', value: 1, weight: 1 }] }, T0)), 'invalid_params');
    const fresh = await saveCase(db, cfg, userId, { id: 'scrapyard', name: 'Scrapyard', items }, T0);
    assert.equal(fresh.version, 1);
    assert.equal(fresh.price, priceCase({ id: 'x', name: 'x', items }));
    assert.ok(fresh.rtp <= 1 - EDGE.cases + 1e-12 && fresh.rtp > 0.9, 'priced at ⌈EV / (1 − edge)⌉');
    assert.equal(await code(() => playInstant(db, cfg, userId, 'cases', 0, { caseId: 'scrapyard' }, T0 + 1)), 'case_disabled', 'new cases start disabled');
    await setCaseState(db, userId, 'scrapyard', { enabled: true }, T0 + 2);
    assert.ok((await listCases(db)).some((c) => c.id === 'scrapyard'));

    // a battle created now keeps version 1 of the edited case
    const { userId: other } = await signUp(db, cfg, { displayName: 'Rival', ageConfirmed: true, country: 'NZ' }, T0);
    const beacon = beaconAt();
    const battle = await createBattle(db, cfg, userId, [box.id, box.id], 2, 'normal', T0 + 3);

    const edited = { id: box.id, name: `${box.name} II`, items: box.items.map((i, k) => ({ ...i, weight: k === 0 ? i.weight * 2 : i.weight })) };
    const v2 = await saveCase(db, cfg, userId, edited, T0 + 4);
    assert.equal(v2.version, 2);
    assert.equal((await caseVersion(db, box.id)).version, 2);
    assert.equal((await caseVersion(db, box.id, 1)).name, box.name, 'version 1 is unchanged');
    const second = await playInstant(db, cfg, userId, 'cases', 0, { caseId: box.id }, T0 + 5);
    assert.deepEqual(JSON.parse(second.params), { caseId: box.id, version: 2 });
    assert.equal(second.stake, v2.price * MF_PER_FRAG);

    await joinGame(db, cfg, beacon, battle, other, T0 + 6);
    const g = await publicGame(db, beacon, battle);
    await settleDue(db, beacon, g.fairness.beacon.resolvesAt!);
    const settled = await publicGame(db, beacon, battle);
    const replay = playBattle(new FairStream(settled.fairness.serverSeed!, settled.fairness.beacon.value!, 0), [box, box], 2, 'normal');
    assert.deepEqual(settled.result.totals, replay.totals, 'settled with the version it was created with');
    for (const b of [first, second]) assert.equal((await betDetail(db, beacon, 'cases', b.id, T0 + 10)).verification.status, 'verified');
    assert.equal((await betDetail(db, beacon, 'battle', battle, T0 + 10)).verification.status, 'verified');
    const monitor = await rtpMonitor(db, 0);
    assert.ok(monitor.find((r) => r.game === 'cases')!.theory! > 0.9, 'the RTP monitor reads the version of each opening');
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });

  it('promo codes: one use per player, limited uses, expiry, level, RG and a guessing limit', async () => {
    const { db, cfg, userId: op } = await setup();
    const players = [];
    for (const n of ['Ann', 'Ben', 'Cid']) players.push((await signUp(db, cfg, { displayName: n, ageConfirmed: true, country: 'NZ' }, T0)).userId);
    assert.equal(await code(() => createPromo(db, op, { code: 'x', amount: 5, maxUses: 1 }, T0)), 'invalid_params');
    assert.equal(await code(() => createPromo(db, op, { code: 'HUGE', amount: 10_000, maxUses: 1000 }, T0)), 'invalid_params', 'budget cap');
    assert.equal(await code(() => createPromo(db, op, { code: 'OLD1', amount: 5, maxUses: 5, expiresAt: T0 - 1 }, T0)), 'invalid_params');
    const p = await createPromo(db, op, { code: 'wipe25', amount: 25, maxUses: 2, expiresAt: T0 + HOUR }, T0);
    assert.equal(p.code, 'WIPE25');
    assert.equal(await code(() => createPromo(db, op, { code: 'WIPE25', amount: 5, maxUses: 1 }, T0)), 'promo_exists');
    const [a, b, c] = players;
    const before = await bal(db, a);
    assert.deepEqual(await redeemPromo(db, a, ' wipe25 ', T0 + 1), { code: 'WIPE25', amount: 25 });
    assert.equal(await bal(db, a), before + frags(25));
    assert.equal(await code(() => redeemPromo(db, a, 'WIPE25', T0 + 2)), 'promo_redeemed');
    await startCooldown(db, b, 24, T0 + 3);
    assert.equal(await code(() => redeemPromo(db, b, 'WIPE25', T0 + 4)), 'rg_blocked');
    await redeemPromo(db, c, 'WIPE25', T0 + 5);
    assert.equal(await code(() => redeemPromo(db, op, 'WIPE25', T0 + 6)), 'promo_used_up');
    await createPromo(db, op, { code: 'SOON', amount: 5, maxUses: 10, expiresAt: T0 + 100 }, T0);
    assert.equal(await code(() => redeemPromo(db, op, 'SOON', T0 + 100)), 'promo_expired');
    await createPromo(db, op, { code: 'VIP10', amount: 5, maxUses: 10, minLevel: 10 }, T0);
    assert.equal(await code(() => redeemPromo(db, op, 'VIP10', T0 + 7)), 'level_required');
    await setPromoActive(db, op, 'VIP10', false, T0 + 8);
    for (let i = 0; i < PROMO_FAIL_LIMIT - 1; i++) assert.equal(await code(() => redeemPromo(db, a, `NOPE${i}`, T0 + 10 + i)), 'promo_invalid');
    assert.equal(await code(() => redeemPromo(db, a, 'VIP10', T0 + 30)), 'promo_invalid', 'a paused code is invalid');
    assert.equal(await code(() => redeemPromo(db, a, 'SOON', T0 + 31)), 'too_many_attempts');
    assert.equal(await code(() => redeemPromo(db, a, 'SOON', T0 + 31 + HOUR)), 'promo_expired', 'the limit resets after an hour');
    const list = await listPromos(db);
    assert.deepEqual(list.find((x) => x.code === 'WIPE25')!.uses, 2);
    assert.equal(((await db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM reward_claims WHERE kind = 'promo_code'").get()) as { s: number }).s, frags(50));
    assert.equal(await balanceOf(db, PROMO), -frags(50));
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });

  it('player tools: capped and reasoned adjustments, never on oneself; notes; ending sessions', async () => {
    const { db, cfg, userId: op } = await setup({ demoStartBalance: frags(100) });
    const { userId: p } = await signUp(db, cfg, { displayName: 'Pat', ageConfirmed: true, country: 'NZ' }, T0);
    const token = await createSession(db, cfg, p, T0);
    assert.equal(await code(() => adjustBalance(db, op, p, 50, 'ok', T0)), 'invalid_params', 'reason too short');
    assert.equal(await code(() => adjustBalance(db, op, p, 100_001, 'goodwill after outage', T0)), 'invalid_params');
    assert.equal(await code(() => adjustBalance(db, op, op, 50, 'goodwill after outage', T0)), 'forbidden');
    const start = await bal(db, p);
    assert.equal((await adjustBalance(db, op, p, 50, 'goodwill after outage', T0 + 1)).balance, (start + frags(50)) / MF_PER_FRAG);
    assert.equal(await code(() => adjustBalance(db, op, p, -(start / MF_PER_FRAG) - 51, 'correction of a support error', T0 + 2)), 'insufficient_balance');
    await adjustBalance(db, op, p, -20, 'correction of a support error', T0 + 3);
    assert.equal(await bal(db, p), start + frags(30));
    assert.equal(await balanceOf(db, ADJUSTMENTS), -frags(30));
    await addNote(db, op, p, 'Asked about withdrawals.', T0 + 4);
    const d = await playerDetail(db, p, T0 + 5);
    assert.equal(d.notes[0].body, 'Asked about withdrawals.');
    assert.equal(d.sessions, 1);
    assert.equal((await forceLogout(db, op, p, T0 + 6)).ended, 1);
    assert.equal(await resolveSession(db, token, T0 + 7), null);
    const report = await dailyReport(db, 3, T0 + 8);
    assert.equal(report.rows[0].adjustments, 30);
    assert.ok((await auditLog(db, { event: 'admin_adjust' })).length === 2);
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });

  it('bet explorer: every game verifies from its seeds, active server seeds stay hidden, tampering is caught', async () => {
    const { db, cfg, userId } = await setup();
    const beacon = beaconAt();
    let t = T0;
    const ids: [string, string][] = [];
    for (const [g, p, s] of [['dice', { chance: 40, direction: 'over' }, 2], ['plinko', { rows: 12, risk: 'high' }, 1], ['upgrader', { multiplier: 3 }, 2], ['airdrop', { target: 1.7 }, 2], ['cases', { caseId: SAMPLE_CASES[1].id }, 0]] as const) {
      ids.push([g, (await playInstant(db, cfg, userId, g as 'dice', frags(s as number), p as never, ++t)).id]);
    }
    const m = await minesStart(db, cfg, userId, frags(1), 5, ++t);
    await minesReveal(db, cfg, userId, m.id, 0, ++t).catch(() => undefined);
    const mb = (await getBet(db, m.id))!;
    if (mb.status === 'open') await minesCashout(db, userId, m.id, ++t);
    ids.push(['mines', m.id]);
    const tw = (await towersStart(db, cfg, userId, frags(1), 'blue', ++t)) as any;
    await towersPick(db, cfg, userId, tw.id, 0, ++t);
    if ((await getBet(db, tw.id))!.status === 'open') await towersCashout(db, userId, tw.id, ++t);
    ids.push(['towers', tw.id]);
    const hl = (await hiloStart(db, cfg, userId, frags(1), ++t)) as any;
    await hiloMove(db, cfg, userId, hl.id, 'skip', ++t);
    const card = ((await hiloMove(db, cfg, userId, hl.id, 'skip', ++t)) as any).cards.at(-1).rank;
    // a king only allows "hi" (same), an ace only "lo" (same): a sure guess is refused
    await hiloMove(db, cfg, userId, hl.id, card === 13 ? 'hi' : card === 1 ? 'lo' : card <= 7 ? 'hi' : 'lo', ++t);
    if ((await getBet(db, hl.id))!.status === 'open') await hiloCashout(db, userId, hl.id, ++t);
    ids.push(['hilo', hl.id]);
    const rd = await raidStart(db, cfg, userId, frags(1), ++t);
    await raidBlast(db, cfg, userId, rd.id, 'c4', ++t);
    if ((await getBet(db, rd.id))!.status === 'open') await raidCashout(db, userId, rd.id, ++t);
    ids.push(['raid', rd.id]);
    for (let i = 0; i < 6; i++) {
      let h = (await bjStart(db, cfg, userId, frags(1), ++t)) as any;
      while (h.status === 'open') h = await bjAction(db, userId, h.id, h.actions.includes('double') && i % 2 ? 'double' : h.actions.includes('split') ? 'split' : 'stand', ++t);
      ids.push(['blackjack', h.id]);
    }
    for (const [g, id] of ids) {
      const d = await betDetail(db, beacon, g, id, t);
      assert.equal(d.verification.status, 'verified', `${g}: ${JSON.stringify(d.verification.checks)}`);
      assert.equal((d.fairness as any).serverSeed, null, 'the active server seed is not shown');
      assert.equal((d.fairness as any).seedRevealed, false);
    }
    const open = (await towersStart(db, cfg, userId, frags(1), 'green', ++t)) as any;
    assert.equal((await betDetail(db, beacon, 'towers', open.id, t)).verification.status, 'pending');
    const trap = JSON.parse((await getBet(db, open.id))!.state!).traps[0][0] as number;
    await towersPick(db, cfg, userId, open.id, trap === 0 ? 1 : 0, ++t);
    await towersCashout(db, userId, open.id, ++t);

    const [dg, did] = ids[0];
    await db.prepare('UPDATE bets SET multiplier = multiplier + 1 WHERE id = ?').run(did);
    const tampered = await betDetail(db, beacon, dg, did, t);
    assert.equal(tampered.verification.status, 'mismatch');
    assert.equal(tampered.verification.checks.find((c) => c.name === 'outcome')!.ok, false);
    await rotateSeed(db, userId, null, ++t);
    const revealed = await betDetail(db, beacon, 'plinko', ids[1][1], t);
    assert.ok((revealed.fairness as any).serverSeed, 'shown once the player rotated the seed');

    const list = await exploreBets(db, { game: 'blackjack' });
    assert.equal(list.bets.length, 6);
    assert.equal(list.total.bets, 6);
    assert.ok((await exploreBets(db, { user: 'test', limit: 5 })).bets.length === 5);
    assert.ok((await exploreBets(db, { minMultiplier: 1000 })).bets.every((b) => b.multiplier >= 1000));
  });

  it('live games and PvP verify too; seed chains rotate on demand and when used up', async () => {
    const { db, cfg, userId } = await setup();
    const { userId: other } = await signUp(db, cfg, { displayName: 'Opp', ageConfirmed: true, country: 'NZ' }, T0);
    const beacon = beaconAt();
    const crash = new CrashService(db, cfg, beacon, 3);
    const run = async (from: number, to: number) => { for (let x = from; x <= to; x += 250) await crash.tick(x); };
    await crash.tick(T0);
    const readyAt = beacon.timeOf((await crash.state(T0, null)).chain!.beaconRound);
    await crash.tick(readyAt);
    const bet = await crash.placeBet(userId, frags(5), 120, readyAt + 1);
    await run(readyAt, readyAt + 400_000);
    const rounds = (await db.prepare('SELECT chain_id, idx FROM crash_rounds ORDER BY id').all()) as { chain_id: number; idx: number }[];
    assert.ok(rounds.length > 3, 'rounds go on after the 3-round chain is used up');
    assert.deepEqual(rounds.slice(0, 4).map((r) => [Number(r.chain_id), Number(r.idx)]), [[1, 0], [1, 1], [1, 2], [2, 0]]);
    const betId = ((await db.prepare('SELECT id FROM crash_bets WHERE user_id = ?').get(userId)) as { id: string }).id;
    assert.ok(bet);
    assert.equal((await betDetail(db, beacon, 'crash', betId, readyAt + 400_000)).verification.status, 'verified');
    const chains = await listChains(db, 'crash', beacon);
    assert.equal(chains[0].tip, null, 'the active chain keeps its tip secret');
    assert.ok(chains.slice(1).every((c) => c.tip && verifyCrashLink(buildChain(c.tip, c.length).seeds[0], c.terminalHash)), 'retired chains publish their tip');

    // rotation while a round runs: the old tip stays hidden until that round is over
    let now = readyAt + 400_000;
    while ((await crash.state(now, null)).round?.status !== 'running') { now += 100; await crash.tick(now); }
    const rotated = await crash.rotateChain(userId, now);
    const during = await listChains(db, 'crash', beacon);
    assert.equal(during[0].id, rotated.id);
    assert.equal(during[1].tip, null, 'the old chain still has a running round');
    await run(now, now + 300_000);
    const afterwards = await listChains(db, 'crash', beacon);
    assert.ok(afterwards.find((c) => c.id === during[1].id)!.tip);
    assert.ok(((await db.prepare('SELECT COUNT(*) AS n FROM crash_rounds WHERE chain_id = ?').get(rotated.id)) as { n: number }).n > 0, 'new rounds run on the rotated chain');

    const wheel = new WheelService(db, cfg, beacon, 50);
    await wheel.tick(now);
    const wReady = beacon.timeOf((await wheel.state(now, null)).chain!.beaconRound);
    await wheel.tick(wReady);
    await wheel.placeBet(userId, '3', frags(2), wReady + 1);
    for (let x = wReady; x <= wReady + 30_000; x += 500) await wheel.tick(x);
    const wb = ((await db.prepare('SELECT id FROM wheel_bets WHERE user_id = ?').get(userId)) as { id: string }).id;
    assert.equal((await betDetail(db, beacon, 'wheel', wb, wReady + 30_000)).verification.status, 'verified');

    const cf = await createCoinflip(db, cfg, userId, frags(10), 'scrap', now);
    await joinGame(db, cfg, beacon, cf, other, now);
    await settleDue(db, beacon, (await publicGame(db, beacon, cf)).fairness.beacon.resolvesAt!);
    assert.equal((await betDetail(db, beacon, 'coinflip', cf, now)).verification.status, 'verified');

    const jp = new JackpotService(db, cfg, beacon);
    await jp.enter(userId, 'low', frags(10), now);
    await jp.enter(other, 'low', frags(30), now + 1);
    await jp.tick(now + 1 + JACKPOT_COUNTDOWN_MS);
    const pot = (await jp.state('low', now + 1 + JACKPOT_COUNTDOWN_MS, userId)).current!;
    await jp.tick(beacon.timeOf(pot.fairness.beacon.round!));
    const d = await betDetail(db, beacon, 'jackpot', pot.id, now);
    assert.equal(d.verification.status, 'verified', JSON.stringify(d.verification));
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });

  it('API: settings, limits, cases, promos, explorer and reports through the router, admins only', async () => {
    let now = T0;
    const db = await newDb();
    const beacon = beaconAt();
    const router = createRouter({ db, cfg: DEFAULT_CONFIG, clock: () => now, fetch: async () => ({ ok: false, text: async () => '' }), publicUrl: 'http://x', beacon, crash: new CrashService(db, DEFAULT_CONFIG, beacon, 20) });
    const call = async (token: string, method: string, url: string, body?: unknown) => {
      now += 50;
      const r = await router.dispatch({ method, url, headers: { 'cf-ipcountry': 'NZ', authorization: `Bearer ${token}` }, body: body ?? null, ip: 't' });
      return { status: r.status, json: r.payload as any };
    };
    const a = (await call('', 'POST', '/auth/demo', { displayName: 'Op', ageConfirmed: true })).json.token;
    const p = (await call('', 'POST', '/auth/demo', { displayName: 'Player', ageConfirmed: true })).json.token;
    await call(a, 'POST', '/demo/role', { role: 'admin' });
    for (const [m, u] of [['GET', '/admin/settings'], ['GET', '/admin/cases'], ['GET', '/admin/promos'], ['GET', '/admin/bets'], ['GET', '/admin/reports/daily'], ['GET', '/admin/chains'], ['POST', '/admin/chains/crash/rotate']]) {
      assert.equal((await call(p, m, u)).status, 403, `${m} ${u} is admin-only`);
    }
    assert.equal((await call(a, 'PUT', '/admin/settings', { announcement: { text: 'Wipe day!', tone: 'info' } })).status, 200);
    assert.equal((await call('', 'GET', '/site')).json.announcement.text, 'Wipe day!');
    const lim = await call(a, 'PUT', '/admin/games/dice/limits', { minStake: 2, maxStake: 20, maxWin: null });
    assert.deepEqual(lim.json.limits, { minStake: 2, maxStake: 20, maxWin: null });
    assert.deepEqual((await call(p, 'GET', '/games/status')).json.find((g: any) => g.game === 'dice').limits, { minStake: 2, maxStake: 20, maxWin: DEFAULT_CONFIG.maxWin / MF_PER_FRAG });
    assert.equal((await call(p, 'POST', '/bets/dice', { stake: 1, params: { chance: 50, direction: 'under' } })).json.error, 'invalid_stake');
    const items = [{ name: 'Rock', value: 1, weight: 9 }, { name: 'Sword', value: 30, weight: 1 }];
    assert.equal((await call(a, 'POST', '/admin/cases/preview', { name: 'Stone Age', items })).json.price, priceCase({ id: 'x', name: 'x', items }));
    assert.equal((await call(a, 'PUT', '/admin/cases/stone-age', { name: 'Stone Age', items })).json.version, 1);
    assert.equal((await call(a, 'PUT', '/admin/cases/stone-age/state', { enabled: true })).status, 200);
    assert.ok((await call('', 'GET', '/config')).json.cases.some((c: any) => c.id === 'stone-age'));
    const opened = await call(p, 'POST', '/bets/cases', { params: { caseId: 'stone-age' } });
    assert.equal(opened.status, 200);
    assert.equal((await call('', 'GET', '/cases/stone-age/v/1')).json.items.length, 2);
    assert.equal((await call(a, 'POST', '/admin/promos', { code: 'ROCK10', amount: 10, maxUses: 5 })).status, 200);
    assert.equal((await call(p, 'POST', '/promo/redeem', { code: 'rock10' })).json.amount, 10);
    const bets = (await call(a, 'GET', '/admin/bets?game=cases')).json;
    assert.equal(bets.bets.length, 1);
    const detail = (await call(a, 'GET', `/admin/bets/cases/${bets.bets[0].ref}`)).json;
    assert.equal(detail.verification.status, 'verified');
    const rep = (await call(a, 'GET', '/admin/reports/daily?days=2')).json;
    assert.equal(rep.rows.length, 2);
    assert.equal(rep.totals.bonusCost, 10);
    assert.equal((await call(a, 'POST', '/admin/chains/wheel/rotate')).status, 200);
    assert.equal((await call('', 'GET', '/chains/wheel')).json.length, 1);
  });
});

describe('cases, battles and upgrader (phase 13)', () => {
  it('upgrader: the win zone can sit anywhere on the ring; the result replays with the stored zone', async () => {
    const { db, cfg, userId } = await setup();
    const beacon = new LocalBeacon(T0 - 60_000, 1000);
    let wins = 0;
    for (let i = 0; i < 40; i++) {
      const zone = (i * 2477) % 10_000;
      const b = await playInstant(db, cfg, userId, 'upgrader', frags(2), { multiplier: 2, zone }, T0 + i);
      assert.deepEqual(JSON.parse(b.params), { multiplier: 2, zone });
      const r = JSON.parse(b.result!);
      const start = zone / 10_000;
      const inZone = (r.roll - start + 1) % 1 < r.chance;
      assert.equal(b.payout > 0, inZone, `zone ${zone} roll ${r.roll}`);
      if (b.payout) wins++;
      assert.equal((await betDetail(db, beacon, 'upgrader', b.id, T0 + 100)).verification.status, 'verified');
    }
    assert.ok(wins > 5 && wins < 35, 'about half of 40 at 47.5 %');
    const legacy = await playInstant(db, cfg, userId, 'upgrader', frags(2), { multiplier: 3 }, T0 + 50);
    assert.deepEqual(JSON.parse(legacy.params), { multiplier: 3, zone: 0 }, 'no zone = zone 0 (roll under)');
    for (const zone of [-1, 10_000, 12.5]) assert.equal(await code(() => playInstant(db, cfg, userId, 'upgrader', frags(2), { multiplier: 2, zone }, T0 + 60)), 'RangeError', 'the router answers invalid_params');
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });

  it('multi-open: up to five of one case, one bet and nonce each, all or nothing', async () => {
    const { db, cfg, userId } = await setup();
    const toolbox = SAMPLE_CASES.find((c) => c.id === 'toolbox')!;
    const price = priceCase(toolbox) * MF_PER_FRAG;
    // a wager limit counts stakes only, so where the batch fails does not depend on what the first cases paid
    await setLimit(db, cfg, userId, 'wager', 'day', 4 * price, T0);
    const before = await bal(db, userId);
    const bets = await openCases(db, cfg, userId, 'toolbox', 2, T0);
    assert.equal(bets.length, 2);
    assert.deepEqual(bets.map((b) => b.nonce), [0, 1]);
    const paid = bets.reduce((s, b) => s + b.payout, 0);
    assert.equal(await bal(db, userId), before - 2 * price + paid);
    const count = async () => ((await db.prepare('SELECT COUNT(*) AS n FROM bets').get()) as { n: number }).n;
    const balance = await bal(db, userId);
    assert.equal(await code(() => openCases(db, cfg, userId, 'toolbox', 3, T0 + 1)), 'rg_limit', 'the third case of the batch would pass the wager limit');
    assert.equal(await count(), 2, 'the two cases before it were rolled back too');
    assert.equal(await bal(db, userId), balance);
    await setLimit(db, cfg, userId, 'wager', 'day', null, T0 + 2); // removing applies only after the delay
    assert.equal((await openCases(db, cfg, userId, 'toolbox', 2, T0 + 3)).length, 2, 'exactly up to the limit is fine');
    assert.equal(await code(() => openCases(db, cfg, userId, 'toolbox', 6, T0 + 4)), 'invalid_params');
    assert.equal(await code(() => openCases(db, cfg, userId, 'toolbox', 0, T0 + 4)), 'invalid_params');
    const later = T0 + 25 * HOUR; // limit removal has applied, a new day
    const cheap = await openCases(db, cfg, userId, 'barrel', 5, later);
    assert.equal(cheap.length, 5);
    assert.deepEqual(cheap.map((b) => b.nonce), [4, 5, 6, 7, 8]);
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });

  it('team battle: 2 vs 2, the winning pair splits the pool, escrow closes and the result verifies', async () => {
    const { db, cfg, userId } = await setup();
    const beacon = new LocalBeacon(T0 - 60_000, 1000);
    const { userId: mate } = await signUp(db, cfg, { displayName: 'Mate', ageConfirmed: true, country: 'NZ' }, T0);
    assert.equal(await code(() => createBattle(db, cfg, userId, ['barrel'], 2, 'team', T0)), 'invalid_params', 'team needs 4 seats');
    const id = await createBattle(db, cfg, userId, ['barrel', 'oil-barrel', 'wooden-crate'], 4, 'team', T0);
    await joinGame(db, cfg, beacon, id, mate, T0 + 1);
    await joinGame(db, cfg, beacon, id, null, T0 + 2);
    await joinGame(db, cfg, beacon, id, null, T0 + 3);
    const locked = await publicGame(db, beacon, id);
    assert.equal(locked.status, 'locked');
    await settleDue(db, beacon, locked.fairness.beacon.resolvesAt!);
    const g = await publicGame(db, beacon, id);
    assert.equal(g.status, 'settled');
    const totals = g.result.totals as number[];
    const team = [totals[0] + totals[1], totals[2] + totals[3]];
    const pool = totals.reduce((a: number, b: number) => a + b, 0);
    const expect = team[0] > team[1] ? [0, 1] : team[1] > team[0] ? [2, 3] : [0, 1, 2, 3];
    assert.deepEqual(g.result.winners, expect);
    for (const p of g.players) assert.equal(p.payout, expect.includes(p.seat) ? pool / expect.length : 0);
    assert.equal(await balanceOf(db, ESCROW), 0);
    assert.equal((await betDetail(db, beacon, 'battle', id, T0)).verification.status, 'verified');
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });
});

describe('twenty crates and the bonus battle (phase 14)', () => {
  it('the lobby lists twenty crates from 1 to 1 500 $, the Gold Egg fits the max stake', async () => {
    const { db, cfg, userId } = await setup();
    const list = await listCases(db);
    assert.equal(list.length, 20);
    assert.deepEqual([list[0].id, list[0].price, list[19].id, list[19].price], ['barrel', 100, 'gold-egg', 150_000]);
    assert.ok(list.every((c) => c.rtp > 0.9299 && c.rtp <= 0.93));
    const bet = await playInstant(db, cfg, userId, 'cases', 0, { caseId: 'gold-egg' }, T0);
    assert.equal(bet.stake, frags(150_000));
    assert.equal(await code(() => createBattle(db, cfg, userId, ['gold-egg', 'gold-egg'], 2, 'normal', T0 + 1)), 'invalid_stake', '3 000 $ per seat is above the max stake');
  });

  it('bonus battle: jackpot drops to their openers, the spin pays the rest, escrow closes, the explorer verifies', async () => {
    const { db, cfg, userId } = await setup();
    const beacon = new LocalBeacon(T0 - 60_000, 1000);
    for (let n = 0; n < 12; n++) {
      const id = await createBattle(db, cfg, userId, ['barrel', 'oil-barrel', 'wooden-crate', 'toolbox'], 3, 'bonus', T0 + n);
      await joinGame(db, cfg, beacon, id, null, T0 + n);
      await joinGame(db, cfg, beacon, id, null, T0 + n);
      await settleDue(db, beacon, (await publicGame(db, beacon, id)).fairness.beacon.resolvesAt!);
      const g = await publicGame(db, beacon, id);
      const b = g.result.bonus;
      assert.equal(b.powers.length, 4);
      assert.ok(b.powers[3] % 2 === 0, 'the last round is golden');
      const pool = (g.result.totals as number[]).reduce((a, x) => a + x, 0);
      const paid = g.players.reduce((a, p) => a + p.payout, 0);
      assert.ok(pool - paid > -1e-6 && pool - paid < 0.01, `the whole pool goes back to the seats (pool ${pool}, paid ${paid})`);
      const w = g.result.winners[0];
      for (const p of g.players) {
        const share = p.seat === w ? b.rest * 0.9 : (b.rest * 0.1) / 2;
        assert.ok(Math.abs(p.payout - (b.jackpotPaid[p.seat] + share)) < 0.01, `seat ${p.seat + 1}`);
      }
      assert.equal((await betDetail(db, beacon, 'battle', id, T0)).verification.status, 'verified');
    }
    assert.equal(await balanceOf(db, ESCROW), 0);
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });
    assert.equal(await code(() => createBattle(db, cfg, userId, ['barrel'], 2, 'bonus', T0 + 50)), 'no-error', '2 seats work too');
    assert.equal(await code(() => createBattle(db, cfg, userId, ['barrel'], 2, 'jackpot' as never, T0 + 51)), 'invalid_params');
  });

  it('catalogue sync: seed crates get the new line-up, operator versions stay, retired crates are disabled once', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'scrapline-'));
    try {
      const file = join(dir, 'old.db');
      const old = openDb(file);
      const OLD_ITEMS = JSON.stringify([{ name: 'Tape Hoodie', value: 40, weight: 1 }, { name: 'Glory AK', value: 21000, weight: 1 }]);
      // an older database: Tool Box still on a seed list from before, the Elite Crate edited by an operator, a retired seed crate
      await old.prepare("INSERT INTO case_versions (case_id, version, name, items, price, rtp, created_by, created_at) VALUES ('toolbox', 2, 'Toolbox', ?, 11291, 0.93, NULL, 0)").run(OLD_ITEMS);
      await old.prepare("UPDATE cases SET current_version = 2, name = 'Toolbox' WHERE id = 'toolbox'").run();
      await old.prepare("INSERT INTO case_versions (case_id, version, name, items, price, rtp, created_by, created_at) VALUES ('elite-crate', 2, 'House Elite', ?, 11291, 0.93, 'op', 1)").run(OLD_ITEMS);
      await old.prepare("UPDATE cases SET current_version = 2, name = 'House Elite' WHERE id = 'elite-crate'").run();
      await old.prepare("INSERT INTO cases (id, name, enabled, sort, current_version, created_at, updated_at) VALUES ('vault', 'Vault', 1, 3, 1, 0, 0)").run();
      await old.prepare("INSERT INTO case_versions (case_id, version, name, items, price, rtp, created_by, created_at) VALUES ('vault', 1, 'Vault', ?, 11291, 0.93, NULL, 0)").run(OLD_ITEMS);
      await old.prepare('PRAGMA user_version = 0').run();
      await old.close();

      const db = openDb(file);
      const tool = await caseVersion(db, 'toolbox');
      assert.deepEqual([tool.version, tool.name, tool.price], [3, 'Tool Box', 1000], 'the seed list from before became version 3');
      assert.equal((await caseVersion(db, 'toolbox', 2)).items[0].name, 'Tape Hoodie', 'old versions stay verifiable');
      assert.equal((await caseVersion(db, 'elite-crate')).name, 'House Elite', 'an operator version is never replaced');
      const ids = (await listCases(db)).map((c) => c.id);
      assert.ok(!ids.includes('vault') && ids.includes('gold-egg') && ids.length === 20);
      await setCaseState(db, 'op', 'vault', { enabled: true }, T0);
      await db.close();

      const again = openDb(file);
      assert.ok((await listCases(again)).some((c) => c.id === 'vault'), 'retiring runs once: an operator may enable the crate again');
      assert.equal((await caseVersion(again, 'toolbox')).version, 3, 'idempotent');
      await again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('player account: history, detail, seeds, wallet, profile, feed (phase 16)', () => {
  it('history pages through every game with a tie-safe cursor and filters by game', async () => {
    const { db, cfg, userId } = await setup();
    const beacon = new LocalBeacon(T0 - 60_000, 1000);
    const { userId: other } = await signUp(db, cfg, { displayName: 'Other', ageConfirmed: true, country: 'NZ' }, T0);
    for (let i = 0; i < 3; i++) await playInstant(db, cfg, userId, 'dice', frags(1), { chance: 49.5, direction: 'under' }, T0 + i);
    await openCases(db, cfg, userId, 'barrel', 5, T0 + 10); // five bets in the same millisecond
    const flip = await createCoinflip(db, cfg, userId, frags(5), 'rust', T0 + 20);
    await joinGame(db, cfg, beacon, flip, other, T0 + 21);
    await settleDue(db, beacon, (await publicGame(db, beacon, flip)).fairness.beacon.resolvesAt!);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof playerHistory>> = await playerHistory(db, userId, { cursor, limit: 3 });
      seen.push(...page.bets.map((b) => `${b.game}:${b.ref}`));
      cursor = page.next;
    } while (cursor);
    assert.equal(seen.length, 9, 'dice ×3, crates ×5, coinflip ×1');
    assert.equal(new Set(seen).size, 9, 'no bet twice across pages');
    assert.ok(seen[0].startsWith('coinflip:'), 'newest first, PvP included');
    assert.equal((await playerHistory(db, userId, { game: 'cases' })).bets.length, 5);
    assert.equal((await playerHistory(db, other, {})).bets.length, 1, 'only the own bets');
    assert.equal(await code(() => playerHistory(db, userId, { game: 'poker' })), 'invalid_params');
    assert.equal(await code(() => playerHistory(db, userId, { cursor: 'x' })), 'invalid_params');
  });

  it('bet detail: own rounds only, verified by replay, the server seed shows after rotation', async () => {
    const { db, cfg, userId } = await setup();
    const beacon = new LocalBeacon(T0 - 60_000, 1000);
    const { userId: other } = await signUp(db, cfg, { displayName: 'Other', ageConfirmed: true, country: 'NZ' }, T0);
    const bet = await playInstant(db, cfg, userId, 'dice', frags(2), { chance: 30, direction: 'over' }, T0);
    const d = (await playerBetDetail(db, beacon, userId, 'dice', bet.id, T0)) as any;
    assert.equal(d.verification.status, 'verified');
    assert.equal(d.fairness.serverSeed, null, 'still secret before rotation');
    assert.equal(d.userId, undefined);
    assert.equal(await code(() => playerBetDetail(db, beacon, other, 'dice', bet.id, T0)), 'not_found');
    assert.equal(await code(() => playerBetDetail(db, beacon, userId, 'plinko', bet.id, T0)), 'not_found');
    await rotateSeed(db, userId, 'fresh', T0 + 1);
    const after = (await playerBetDetail(db, beacon, userId, 'dice', bet.id, T0 + 2)) as any;
    assert.equal(sha256Hex(after.fairness.serverSeed), after.fairness.serverSeedHash);
    const seeds = await revealedSeeds(db, userId);
    assert.equal(seeds.length, 1);
    assert.deepEqual([seeds[0].bets, seeds[0].serverSeed], [1, after.fairness.serverSeed]);
  });

  it('wallet transactions: every balance change, newest first, with the game, pageable and filterable', async () => {
    const { db, cfg, userId } = await setup();
    for (let i = 0; i < 4; i++) await playInstant(db, cfg, userId, 'dice', frags(1), { chance: 90, direction: 'under' }, T0 + i);
    const all = await transactions(db, userId, { limit: 100 });
    assert.equal(all.transactions[all.transactions.length - 1].kind, 'demo_grant');
    const stakes = all.transactions.filter((t) => t.kind === 'stake');
    assert.equal(stakes.length, 4);
    assert.ok(stakes.every((t) => t.amount === -1 && t.game === 'dice'));
    const sum = all.transactions.reduce((a, t) => a + t.amount, 0);
    assert.ok(Math.abs(sum - (await bal(db, userId)) / MF_PER_FRAG) < 1e-9, 'the ledger adds up to the balance');
    const p1 = await transactions(db, userId, { limit: 2 });
    const p2 = await transactions(db, userId, { limit: 2, before: p1.next });
    assert.ok(p2.transactions.every((t) => t.id < p1.transactions[1].id));
    assert.equal((await transactions(db, userId, { kind: 'demo_grant' })).transactions.length, 1);
    assert.equal(await code(() => transactions(db, userId, { kind: 'magic' })), 'invalid_params');
  });

  it('stats, profile (name once per 24 h, hidden in public lists) and sign-out everywhere', async () => {
    const { db, cfg, userId } = await setup();
    const beacon = new LocalBeacon(T0 - 60_000, 1000);
    await playInstant(db, cfg, userId, 'dice', frags(10), { chance: 49.5, direction: 'under' }, T0);
    await playInstant(db, cfg, userId, 'dice', frags(10), { chance: 49.5, direction: 'over' }, T0 + 1);
    const st = await playerStats(db, userId, T0 + 2);
    assert.deepEqual([st.bets, st.wagered, st.games[0].game], [2, 20, 'dice']);
    assert.equal(st.memberSince, T0);

    assert.equal((await updateProfile(db, userId, { displayName: 'Neon Rat' }, T0 + 10)).displayName, 'Neon Rat');
    assert.equal(await code(() => updateProfile(db, userId, { displayName: 'Again' }, T0 + 20)), 'name_cooldown');
    assert.equal((await updateProfile(db, userId, { displayName: 'Neon Rat' }, T0 + 30)).displayName, 'Neon Rat', 'the same name is no change');
    assert.equal(await code(() => updateProfile(db, userId, { displayName: '<b>' }, T0 + 40)), 'invalid_name');
    assert.equal((await updateProfile(db, userId, { displayName: 'Later' }, T0 + 10 + NAME_CHANGE_COOLDOWN_MS)).displayName, 'Later');
    assert.equal(await code(() => updateProfile(db, userId, { hidePublic: 'yes' }, T0 + 50)), 'invalid_params');

    const feed = (await publicFeed(db, 'all', T0 + 100)) as { name: string }[];
    assert.equal(feed[0].name, 'Later');
    await updateProfile(db, userId, { hidePublic: true }, T0 + 200);
    const hidden = (await publicFeed(db, 'all', T0 + 5000)) as { name: string }[];
    assert.ok(hidden.every((r) => r.name === 'Hidden player'));
    const flip = await createCoinflip(db, cfg, userId, frags(5), 'rust', T0 + 300);
    const g = await publicGame(db, beacon, flip, userId);
    assert.deepEqual([g.players[0].name, g.players[0].you], ['Hidden player', true], 'the player still knows the seat is theirs');

    const t1 = await createSession(db, cfg, userId, T0);
    const t2 = await createSession(db, cfg, userId, T0);
    assert.ok((await playerStats(db, userId, T0 + 400)).activeSessions >= 2);
    assert.ok((await logoutAll(db, userId, T0 + 500)) >= 2);
    assert.equal(await resolveSession(db, t1, T0 + 600), null);
    assert.equal(await resolveSession(db, t2, T0 + 600), null);
  });

  it('public feed: high wins only above 5×, refuses unknown kinds', async () => {
    const { db, cfg, userId } = await setup();
    for (let i = 0; i < 30; i++) await playInstant(db, cfg, userId, 'dice', frags(1), { chance: 10, direction: 'under' }, T0 + i);
    const high = (await publicFeed(db, 'high', T0 + 100)) as { multiplier: number }[];
    assert.ok(high.every((r) => r.multiplier >= 5));
    assert.ok(((await publicFeed(db, 'all', T0 + 100)) as unknown[]).length <= 20);
    assert.equal(await code(() => publicFeed(db, 'big' as never, T0)), 'invalid_params');
  });

  it('live stats: players seen in the last 5 minutes, rounds and the top win of the day', async () => {
    const { db, cfg, userId } = await setup();
    const { userId: other } = await signUp(db, cfg, { displayName: 'Other', ageConfirmed: true, country: 'NZ' }, T0);
    const t1 = await createSession(db, cfg, userId, T0);
    const t2 = await createSession(db, cfg, other, T0);
    await resolveSession(db, t1, T0 + 1000);
    await resolveSession(db, t2, T0 + 2000);
    await resolveSession(db, t1, T0 + 3000); // within the minute: no second write needed
    await playInstant(db, cfg, userId, 'dice', frags(10), { chance: 90, direction: 'under' }, T0 + 4000);
    let live = await liveStats(db, T0 + 10_000);
    assert.equal(live.online, 2);
    assert.equal(live.roundsToday, 1);
    assert.ok(live.topWin === null || live.topWin.name === 'Tester');
    await resolveSession(db, t1, T0 + 6 * 60_000);
    live = await liveStats(db, T0 + 6 * 60_000 + 1000);
    assert.equal(live.online, 1, 'the other player was last seen over 5 minutes ago');
  });

  it('the HTTP routes answer for a signed-in player', async () => {
    const { db, cfg } = await setup();
    const router = createRouter({ db, cfg, clock: () => T0 + 1000, fetch: async () => ({ ok: false, text: async () => '' }) as never, publicUrl: 'http://x', beacon: new LocalBeacon(T0 - 60_000, 1000) } as never);
    const s = await router.dispatch({ method: 'POST', url: '/auth/demo', headers: {}, body: { displayName: 'Http', ageConfirmed: true }, ip: '1.1.1.1' });
    const auth = { authorization: `Bearer ${(s.payload as { token: string }).token}` };
    for (const url of ['/history', '/seeds', '/wallet/transactions', '/me/stats', '/me/profile', '/feed?kind=high', '/stats/live']) {
      const r = await router.dispatch({ method: 'GET', url, headers: auth, body: null, ip: '1.1.1.1' });
      assert.equal(r.status, 200, url);
    }
    assert.equal((await router.dispatch({ method: 'GET', url: '/history', headers: {}, body: null, ip: '1.1.1.1' })).status, 401);
    const put = await router.dispatch({ method: 'PUT', url: '/me/profile', headers: auth, body: { hidePublic: true }, ip: '1.1.1.1' });
    assert.equal((put.payload as { hidePublic: boolean }).hidePublic, true);
    const out = await router.dispatch({ method: 'POST', url: '/auth/logout-all', headers: auth, body: null, ip: '1.1.1.1' });
    assert.equal(out.status, 200);
    assert.equal((await router.dispatch({ method: 'GET', url: '/me', headers: auth, body: null, ip: '1.1.1.1' })).status, 401);
  });
});

/* ---------- phase 18: Steam profile, trade URL, live player stats, skin rail ---------- */
import { PLAYER_STATS_BACKFILL } from '../src/db';
import { setKyc } from '../src/admin';
import { fetchSteamProfile, parseTradeUrl, steamName } from '../src/steam';
import { setTradeUrl } from '../src/accounts';
import { type BotItem, type OfferState, type TradeBot, SKINS, SkinService, botOnline, botTick, operatorWithdrawal, parsePriceFeed, skinsAdmin, syncPrices } from '../src/skins';

const STEAM_ID = '76561198000000001';
const TRADE_URL = 'https://steamcommunity.com/tradeoffer/new/?partner=39734273&token=Ab12_-Cd';

describe('Steam profile and trade URL', () => {
  it('cleans persona names and only keeps Steam CDN avatars and profile links', async () => {
    assert.equal(steamName('  <b>Rust\u0007 King</b>  ', STEAM_ID), 'bRust King/b');
    assert.equal(steamName('x', STEAM_ID), 'Steam 0001');
    assert.equal(steamName('A'.repeat(40), STEAM_ID).length, 24);
    const reply = (players: unknown[]): Fetch => async (url) => {
      assert.match(url, /GetPlayerSummaries\/v2\/\?key=K%26EY&steamids=76561198000000001$/);
      return { ok: true, text: async () => JSON.stringify({ response: { players } }) };
    };
    assert.deepEqual(await fetchSteamProfile(STEAM_ID, 'K&EY', reply([{ steamid: STEAM_ID, personaname: 'Scrap Baron', avatarfull: 'https://avatars.steamstatic.com/abc_full.jpg', profileurl: 'https://steamcommunity.com/id/baron/' }])),
      { name: 'Scrap Baron', avatarUrl: 'https://avatars.steamstatic.com/abc_full.jpg', profileUrl: 'https://steamcommunity.com/id/baron/' });
    const evil = await fetchSteamProfile(STEAM_ID, 'K&EY', reply([{ steamid: STEAM_ID, personaname: 'Baron', avatarfull: 'https://evil.example/a.jpg', profileurl: 'javascript:alert(1)' }]));
    assert.deepEqual(evil, { name: 'Baron', avatarUrl: null, profileUrl: null });
    assert.equal(await fetchSteamProfile(STEAM_ID, 'K&EY', reply([{ steamid: '76561198000000002', personaname: 'Other' }])), null);
    assert.equal(await fetchSteamProfile(STEAM_ID, null, reply([])), null, 'no key, no call');
    assert.equal(await fetchSteamProfile(STEAM_ID, 'k', async () => { throw new Error('down'); }), null);
  });
  it('accepts only trade URLs of the account itself, in canonical form', () => {
    assert.equal(parseTradeUrl(' https://steamcommunity.com/tradeoffer/new/?token=Ab12_-Cd&partner=39734273 ', STEAM_ID), TRADE_URL);
    assert.equal(parseTradeUrl(TRADE_URL.replace('39734273', '39734274'), STEAM_ID), null, 'someone else');
    assert.equal(parseTradeUrl(TRADE_URL.replace('steamcommunity.com', 'steamcommunlty.com'), STEAM_ID), null);
    assert.equal(parseTradeUrl(TRADE_URL.replace('Ab12_-Cd', 'short'), STEAM_ID), null);
    assert.equal(parseTradeUrl(TRADE_URL.replace('https', 'http'), STEAM_ID), null);
    assert.equal(parseTradeUrl('not a url', STEAM_ID), null);
  });
  it('Steam sign-in takes name and avatar from Steam, keeps them in sync and locks the name', async () => {
    const db = await newDb();
    const cfg: Config = { ...DEFAULT_CONFIG, steamLogin: true, steamApiKey: 'key' };
    let persona = 'Scrap Baron';
    let now = T0;
    const fetchFn: Fetch = async (url, init) => {
      if (url.includes('GetPlayerSummaries')) return { ok: true, text: async () => JSON.stringify({ response: { players: [{ steamid: STEAM_ID, personaname: persona, avatarfull: 'https://avatars.steamstatic.com/a_full.jpg', profileurl: 'https://steamcommunity.com/profiles/76561198000000001/' }] } }) };
      assert.ok(init.body?.includes('openid.mode=check_authentication'));
      return { ok: true, text: async () => 'ns:http://specs.openid.net/auth/2.0\nis_valid:true\n' };
    };
    const router = createRouter({ db, cfg, clock: () => now, fetch: fetchFn, publicUrl: 'https://scrapline.example', beacon: new LocalBeacon(T0 - 60_000, 1000) } as never);
    const ret = (t: number) => `/auth/steam/return?age=1&${new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0', 'openid.mode': 'id_res', 'openid.op_endpoint': STEAM_OPENID,
      'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_ID}`, 'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
      'openid.return_to': 'https://scrapline.example/auth/steam/return?age=1', 'openid.response_nonce': new Date(t).toISOString().slice(0, 19) + 'Z' + t, 'openid.assoc_handle': '1', 'openid.signed': 'x', 'openid.sig': 'y',
    })}`;
    const call = async (method: string, url: string, token?: string, body?: unknown) => {
      const r = await router.dispatch({ method, url, headers: { 'cf-ipcountry': 'NZ', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ?? null, ip: '1.1.1.1' });
      return { status: r.status, json: r.payload as any };
    };
    assert.equal((await call('GET', '/config')).json.steamLogin, true);
    const first = await call('GET', ret(now));
    assert.equal(first.status, 200);
    let me = (await call('GET', '/me', first.json.token)).json;
    assert.equal(me.displayName, 'Scrap Baron');
    assert.deepEqual(me.steam, { id: STEAM_ID, name: 'Scrap Baron', avatarUrl: 'https://avatars.steamstatic.com/a_full.jpg', profileUrl: 'https://steamcommunity.com/profiles/76561198000000001/', tradeUrl: null });
    assert.equal((await call('PUT', '/me/profile', first.json.token, { displayName: 'Other name' })).json.error, 'steam_name');
    assert.equal((await call('PUT', '/me/profile', first.json.token, { displayName: 'Scrap Baron', hidePublic: true })).status, 200, 'same name plus another field is fine');
    assert.equal((await call('PUT', '/me/trade-url', first.json.token, { tradeUrl: TRADE_URL.replace('39734273', '1') })).json.error, 'invalid_trade_url');
    assert.equal((await call('PUT', '/me/trade-url', first.json.token, { tradeUrl: TRADE_URL })).json.tradeUrl, TRADE_URL);

    persona = 'Baron of Scrap';
    now += 60_000;
    const second = await call('GET', ret(now));
    assert.equal(second.json.userId, first.json.userId, 'same account');
    me = (await call('GET', '/me', second.json.token)).json;
    assert.equal(me.displayName, 'Baron of Scrap');
    assert.equal(me.steam.tradeUrl, TRADE_URL);
    assert.ok((await auditLog(db, { event: 'steam_profile' })).length === 1);

    const off = createRouter({ db, cfg: DEFAULT_CONFIG, clock: () => now, fetch: fetchFn, publicUrl: 'https://scrapline.example', beacon: new LocalBeacon(T0 - 60_000, 1000) } as never);
    assert.equal((await off.dispatch({ method: 'GET', url: '/auth/steam', headers: {}, body: null, ip: '2.2.2.2' })).status, 404, 'off unless configured');
  });
  it('trade URLs need a Steam account', async () => {
    const { db, userId } = await setup();
    assert.equal(await code(() => setTradeUrl(db, userId, TRADE_URL, T0)), 'steam_required');
  });
});

describe('live player stats (database trigger)', () => {
  it('every ledger entry updates player_stats in the same transaction; a rebuild from the ledger matches', async () => {
    const { db, cfg, userId } = await setup();
    for (let i = 0; i < 25; i++) await playInstant(db, cfg, userId, 'dice', frags(3 + i), { chance: 40, direction: 'under' }, T0 + i);
    await openCases(db, cfg, userId, 'toolbox', 3, T0 + 100);
    const flip = await createCoinflip(db, cfg, userId, frags(50), 'scrap', T0 + 200);
    await cancelGame(db, flip, userId, T0 + 300); // stake and refund
    await adjustBalance(db, 'op', userId, 12.5, 'goodwill', T0 + 400);
    await claimRakeback(db, userId, T0 + 500).catch(() => null);
    const live = (await db.prepare('SELECT * FROM player_stats WHERE user_id = ?').get(userId)) as Record<string, number>;
    const n = (k: string) => Number(live[k]);
    assert.equal(n('stakes'), 28, '25 dice + 3 crates; the cancelled flip nets out');
    assert.equal(n('grants'), cfg.demoStartBalance);
    assert.equal(n('adjustments'), frags(12.5));
    assert.equal(n('grants') - n('wagered') + n('paid') + n('bonuses') + n('adjustments') + n('deposited') - n('withdrawn'), await bal(db, userId), 'the totals explain the balance');
    const stats = await playerStats(db, userId, T0 + 600);
    assert.equal(stats.totals.balance, (await bal(db, userId)) / MF_PER_FRAG);
    assert.equal(stats.totals.stakes, 28);
    const before = JSON.stringify(await db.prepare('SELECT * FROM player_stats ORDER BY user_id').all());
    await db.exec(PLAYER_STATS_BACKFILL);
    assert.equal(JSON.stringify(await db.prepare('SELECT * FROM player_stats ORDER BY user_id').all()), before);
  });
});

/** Steam's inventory format and Skinport's price list, as the fakes behind the skin rail tests. */
const PRICE_LIST = [
  { market_hash_name: 'Tempered AK47', suggested_price: 12.34, median_price: 13.1, quantity: 50 },
  { market_hash_name: 'Big Grin', suggested_price: 0.05, quantity: 100 },
  { market_hash_name: 'Glory AK47', suggested_price: 50, quantity: 10 },
  { market_hash_name: 'Blackout Hoodie', suggested_price: 5, quantity: 2 },
  { market_hash_name: 'Thin Listing', suggested_price: 10, median_price: 1, quantity: 30 },
  { market_hash_name: 'No Price', suggested_price: null, quantity: 3 },
  { nonsense: true },
];
const INVENTORY = {
  success: 1, total_inventory_count: 6,
  assets: [['1001', 'Tempered AK47', 1], ['1002', 'Big Grin', 1], ['1003', 'Glory AK47', 0], ['1004', 'Blackout Hoodie', 1], ['1005', 'Alien Red', 1], ['1006', 'Thin Listing', 1]]
    .map(([assetid], i) => ({ appid: 252490, contextid: '2', assetid, classid: String(500 + i), instanceid: '0', amount: '1' })),
  descriptions: [['Tempered AK47', 1], ['Big Grin', 1], ['Glory AK47', 0], ['Blackout Hoodie', 1], ['Alien Red', 1], ['Thin Listing', 1]]
    .map(([name, tradable], i) => ({ appid: 252490, classid: String(500 + i), instanceid: '0', market_hash_name: name, name, icon_url: `icon${i}`, name_color: 'ff0000', tradable })),
};

class FakeBot implements TradeBot {
  on = true; escrow = 0; seq = 7000;
  offers = new Map<string, { state: OfferState; assets: string[]; message: string }>();
  canceled: string[] = [];
  inv: BotItem[] = [];
  steamId() { return '76561198000000099'; }
  online() { return this.on; }
  async partnerEscrowDays() { return this.escrow; }
  async requestItems(_url: string, assets: string[], message: string) { const id = String(++this.seq); this.offers.set(id, { state: 'active', assets, message }); return id; }
  async findOffer(tag: string) { for (const [id, o] of this.offers) if (o.message.includes(tag)) return id; return null; }
  async offer(id: string) {
    const o = this.offers.get(id)!;
    const names: Record<string, string> = { 1001: 'Tempered AK47', 1006: 'Thin Listing' };
    return { state: o.state, received: o.state === 'accepted' ? o.assets.map((a) => ({ assetId: `n${a}`, name: names[a] ?? 'Item', icon: 'ic', tradable: true })) : null };
  }
  async cancel(id: string) { this.canceled.push(id); this.offers.get(id)!.state = 'canceled'; }
  async inventory() { return this.inv; }
}

describe('skin rail: Steam deposits through the bot, withdrawals for operators', () => {
  it('prices: lower of suggested and median, junk ignored', () => {
    const rows = parsePriceFeed(PRICE_LIST);
    assert.deepEqual(rows.map((r) => [r.name, r.price, r.volume]), [['Tempered AK47', 1234, 50], ['Big Grin', 5, 100], ['Glory AK47', 5000, 10], ['Blackout Hoodie', 500, 2], ['Thin Listing', 100, 30]]);
    assert.throws(() => parsePriceFeed({}), /array/);
  });

  it('deposit → offer with code → accepted → credited once; decline, trade hold, timeout, crash recovery; withdrawals with refund', async () => {
    const db = await newDb();
    let priv = false;
    const fetchFn: Fetch = async (url) => {
      if (url.includes('skinport')) return { ok: true, status: 200, text: async () => JSON.stringify(PRICE_LIST) };
      assert.ok(url.includes(`/inventory/${STEAM_ID}/252490/2`));
      return priv ? { ok: false, status: 403, text: async () => 'null' } : { ok: true, status: 200, text: async () => JSON.stringify(INVENTORY) };
    };
    const cfg: Config = { ...DEFAULT_CONFIG, demo: false, skins: { ...DEFAULT_CONFIG.skins, enabled: true } };
    let now = T0;
    assert.equal(await syncPrices(db, cfg, fetchFn, now), 5);
    const { userId } = await signUp(db, cfg, { displayName: 'Skinner', ageConfirmed: true, steamId: STEAM_ID, country: 'NZ' }, now);
    assert.equal(await bal(db, userId), 0, 'no play money outside the demo');
    const user = async () => (await getUser(db, userId))!;
    const skins = new SkinService(db, cfg, fetchFn);
    const bot = new FakeBot();

    assert.equal(await code(async () => skins.createDeposit(await user(), ['1001'], now)), 'trade_url_required');
    await setTradeUrl(db, userId, TRADE_URL, now);
    assert.equal(await code(async () => skins.createDeposit(await user(), ['1001'], now)), 'kyc_required');
    await setKyc(db, 'op', userId, 1, 'passport checked by hand', now);
    assert.equal(await code(async () => skins.createDeposit(await user(), ['1001'], now)), 'bot_offline');
    bot.on = false;
    await botTick(db, cfg, bot, now);
    assert.equal(await botOnline(db, now), false);
    bot.on = true;
    await botTick(db, cfg, bot, now);
    assert.equal(await botOnline(db, now), true);

    const inv = await skins.inventory(await user(), false, now);
    const why = Object.fromEntries(inv.items.map((i) => [i.assetId, i.reason]));
    assert.deepEqual(why, { 1001: null, 1006: null, 1002: 'Below the minimum', 1003: 'Not tradable yet', 1004: 'Too rare to price', 1005: 'No price' });
    assert.equal(inv.items[0].assetId, '1001', 'depositable first, by price');
    assert.equal(await code(async () => skins.createDeposit(await user(), ['1001', '1002'], now)), 'invalid_items');
    assert.equal(await code(async () => skins.createDeposit(await user(), ['1001', '1001'], now)), 'invalid_items');

    const dep = await skins.createDeposit(await user(), ['1001', '1006'], now);
    assert.equal(dep.status, 'requested');
    assert.equal(dep.value, 1334);
    assert.match(dep.securityCode, /^[A-Z2-9]{6}$/);
    assert.equal(await code(async () => skins.createDeposit(await user(), ['1001'], now)), 'deposit_open');
    assert.equal((await skins.inventory(await user(), false, now)).items.find((i) => i.assetId === '1001')!.reason, 'In an open deposit');

    await botTick(db, cfg, bot, now += 5000);
    const [offerId, offer] = [...bot.offers][0];
    assert.ok(offer.message.includes(dep.securityCode) && offer.message.includes(`#${dep.id}`));
    assert.deepEqual(offer.assets.sort(), ['1001', '1006']);
    let mine = (await skins.deposits(userId))[0];
    assert.equal(mine.status, 'sent');
    assert.equal(mine.offerUrl, `https://steamcommunity.com/tradeoffer/${offerId}/`);
    await botTick(db, cfg, bot, now += 5000);
    assert.equal(await bal(db, userId), 0, 'nothing before the player accepts');

    offer.state = 'accepted';
    await botTick(db, cfg, bot, now += 5000);
    await botTick(db, cfg, bot, now += 5000);
    assert.equal(await bal(db, userId), frags(1334), 'credited exactly once');
    assert.equal((await skins.deposits(userId))[0].status, 'accepted');
    assert.equal(Number(((await db.prepare('SELECT deposited FROM player_stats WHERE user_id = ?').get(userId)) as { deposited: number }).deposited), frags(1334));
    assert.deepEqual((await skins.shop('', now)).map((i) => [i.assetId, i.price]), [['n1001', 1234], ['n1006', 100]]);

    // declined, trade hold, timeout, and a bot that crashed after sending
    const next = async () => (await skins.createDeposit(await user(), ['1006'], now)).id;
    let id = await next();
    await botTick(db, cfg, bot, now += 1000);
    bot.offers.get(String(bot.seq))!.state = 'declined';
    await botTick(db, cfg, bot, now += 1000);
    assert.equal((await skins.deposits(userId)).find((d) => d.id === id)!.status, 'declined');
    bot.escrow = 7;
    id = await next();
    await botTick(db, cfg, bot, now += 1000);
    const held = (await skins.deposits(userId)).find((d) => d.id === id)!;
    assert.equal(held.status, 'failed');
    assert.match(held.reason!, /7-day trade hold/);
    bot.escrow = 0;
    id = await next();
    await botTick(db, cfg, bot, now += 1000);
    await botTick(db, cfg, bot, now += cfg.skins.offerTtlMs + 1);
    assert.equal((await skins.deposits(userId)).find((d) => d.id === id)!.status, 'expired');
    assert.deepEqual(bot.canceled, [String(bot.seq)]);
    id = await next();
    bot.offers.set('9999', { state: 'active', assets: ['1006'], message: `deposit #${id}` });
    const sentBefore = bot.seq;
    await botTick(db, cfg, bot, now += 1000);
    assert.equal(bot.seq, sentBefore, 'the existing offer is adopted, not sent twice');
    assert.equal((await skins.deposits(userId)).find((d) => d.id === id)!.offerId, '9999');
    bot.offers.get('9999')!.state = 'canceled';
    await botTick(db, cfg, bot, now += 1000);
    assert.equal(await bal(db, userId), frags(1334));

    // withdrawals: AML wager rule first, then reserve, refund on cancel, sent by an operator
    const blocked = await code(async () => skins.createWithdrawal(await user(), ['n1006'], now));
    assert.equal(blocked, 'withdrawal_blocked');
    const easy = new SkinService(db, { ...cfg, amlWagerMultiple: 0 }, fetchFn);
    const w1 = await easy.createWithdrawal(await user(), ['n1006'], now += 1000);
    assert.equal(w1.status, 'pending');
    assert.equal(await bal(db, userId), frags(1234));
    assert.deepEqual((await skins.shop('', now)).map((i) => i.assetId), ['n1001']);
    assert.equal(await code(async () => easy.createWithdrawal(await user(), ['n1006'], now)), 'invalid_items');
    await easy.cancelWithdrawal(userId, w1.id, now += 1000);
    assert.equal(await bal(db, userId), frags(1334), 'refunded');
    assert.ok((await withdrawalCheck(db, cfg, await user(), frags(100))).reasons.some((r) => r.code === 'aml_wager'), 'a cancelled withdrawal does not reset the wager rule');
    const w2 = await easy.createWithdrawal(await user(), ['n1006'], now += 1000);
    assert.equal(await code(() => operatorWithdrawal(db, 'op', w2.id, 'cancel', null, '', now)), 'reason_required');
    assert.equal(await code(() => operatorWithdrawal(db, 'op', w2.id, 'sent', 'abc', null, now)), 'invalid_offer');
    const done = await operatorWithdrawal(db, 'op', w2.id, 'sent', '123456', 'sent from the Steam app', now += 1000);
    assert.equal(done.status, 'sent');
    assert.equal(await code(() => operatorWithdrawal(db, 'op', w2.id, 'cancel', null, 'too late', now)), 'not_pending');
    assert.equal(await code(() => easy.cancelWithdrawal(userId, w2.id, now)), 'not_pending');
    assert.equal(Number(((await db.prepare('SELECT withdrawn FROM player_stats WHERE user_id = ?').get(userId)) as { withdrawn: number }).withdrawn), frags(100));
    assert.equal(await balanceOf(db, SKINS), -frags(1234), 'house:skins holds the counterpart of the stock still at the site');

    // stock sync: new items come in, items gone without a withdrawal leave the shop
    bot.inv = [{ assetId: 'n1001', name: 'Tempered AK47', icon: 'ic', tradable: true }, { assetId: 'x2000', name: 'Glory AK47', icon: 'g', tradable: true }];
    await botTick(db, cfg, bot, now += 1000, { syncInventory: true });
    assert.deepEqual((await skins.shop('glory', now)).map((i) => i.assetId), ['x2000']);
    bot.inv = [bot.inv[1]];
    await botTick(db, cfg, bot, now += 1000, { syncInventory: true });
    assert.deepEqual((await skins.shop('', now)).map((i) => i.assetId), ['x2000']);
    const admin = await skinsAdmin(db, now);
    assert.equal(admin.bot!.online, true);
    assert.equal(admin.bot!.items, 1);
    assert.equal(admin.stock.gone.items, 1);
    assert.equal(admin.pending.length, 0);
    assert.deepEqual(await ledgerIntegrity(db), { sum: 0, mismatched: [] });

    priv = true;
    assert.equal(await code(async () => skins.inventory(await user(), true, now + 20_000)), 'inventory_private');
    assert.equal(await code(async () => skins.shop('', now + PRICE_MAX_AGE + 1)), 'no-error');
    assert.equal((await skins.shop('', now + 7 * HOUR)).length, 0, 'stale prices are not used');
    assert.equal(await code(() => new SkinService(db, DEFAULT_CONFIG, fetchFn).shop('', now)), 'skins_off');
  });
});
const PRICE_MAX_AGE = 6 * HOUR;

/* ---------- chat rules: word filter, reserved names, level gate, reports ---------- */
import { blockedWord, reservedName } from '../src/chat-filter';
import { openReports, reportMessage, resolveReport } from '../src/chat';

describe('chat rules and reports', () => {
  it('the word filter sees through the usual dodges and leaves normal words and swearing alone', () => {
    for (const t of ['N1GG3R', 'n i g g e r', 'n.i.g.g.e.r', 'niiiiggggerrr', 'nïggér', 'you fag', 'f@ggot', 'k.y.s', 'kill urself', 'KILL   YOUR   SELF', 'sieg heil', 'du schwuchtel', 'retards lol']) {
      assert.ok(blockedWord(t), t);
    }
    for (const t of ['snigger', 'he was sniggering', 'Niger is a country', 'raccoon', 'shit roll', 'fuck this crash', 'retardant', 'skill yourself up', 'kill your base', 'gg wp']) {
      assert.equal(blockedWord(t), null, t);
    }
    assert.equal(blockedWord('buy at rustcheap now', ['RustCheap']), 'rustcheap', 'operator words, as part of longer words from 5 letters');
    assert.equal(blockedWord('buy at rust.cheap now', ['RustCheap']), 'rustcheap', 'and across dots or spaces');
    assert.equal(blockedWord('that is a scam site', ['scam site']), 'scam site');
    assert.equal(blockedWord('scam', ['scam site']), null);
  });
  it('names that look like staff or the site are reserved, everywhere a name is set', async () => {
    for (const n of ['Admin', '4dm1n', 'Site_Supp0rt', 'TeamScrapline', 'Mod Max', 'Mod3rator', 'Bot', 'OFFICIAL']) assert.ok(reservedName(n), n);
    for (const n of ['Badminton King', 'Modern Warfare', 'Robot', 'Steam 1234', 'Rust Rat']) assert.equal(reservedName(n), false, n);
    const { db, cfg, userId } = await setup();
    assert.equal(await code(() => signUp(db, cfg, { displayName: 'Support Team', ageConfirmed: true, country: 'NZ' }, T0)), 'reserved_name');
    assert.equal(await code(() => signUp(db, cfg, { displayName: 'n1gg3r', ageConfirmed: true, country: 'NZ' }, T0)), 'invalid_name');
    assert.equal(await code(() => updateProfile(db, userId, { displayName: 'Scrapline Mod' }, T0 + NAME_CHANGE_COOLDOWN_MS)), 'reserved_name');
    await setSettings(db, 'op', { chatBlockedWords: ['rustcheap'] }, T0);
    assert.equal(await code(() => updateProfile(db, userId, { displayName: 'RustCheapGG' }, T0 + NAME_CHANGE_COOLDOWN_MS)), 'invalid_name');
    assert.equal(steamName('ADMIN', '76561198000004321'), 'Steam 4321', 'Steam names that pose as staff are replaced');
  });
  it('level gate, blocked words with strikes and an automatic mute', async () => {
    const { db, userId } = await setup();
    const u = (await getUser(db, userId))!;
    assert.equal(await code(() => postMessage(db, u, 1, 'hi', T0)), 'chat_level');
    assert.ok((await postMessage(db, { ...u, role: 'moderator' }, 1, 'staff can always write', T0)).id > 0);
    await setSettings(db, 'op', { chatMinLevel: 5 }, T0);
    assert.equal(await code(() => postMessage(db, u, 4, 'hi', T0 + 10_000)), 'chat_level');
    await setSettings(db, 'op', { chatMinLevel: 2 }, T0);
    assert.equal(await code(() => setSettings(db, 'op', { chatMinLevel: 0 }, T0)), 'invalid_params');
    assert.equal(await code(() => setSettings(db, 'op', { chatBlockedWords: 'x' }, T0)), 'invalid_params');
    assert.equal(await code(() => postMessage(db, u, 2, 'gg you n1gg3r', T0 + 20_000)), 'blocked_word');
    assert.equal(await code(() => postMessage(db, u, 2, 'k y s', T0 + 21_000)), 'blocked_word');
    assert.deepEqual((await listMessages(db, null)).map((m) => m.body), ['staff can always write'], 'nothing refused is stored');
    let err: AppError | null = null;
    try { await postMessage(db, u, 2, 'kill urself', T0 + 22_000); } catch (e) { err = e as AppError; }
    assert.equal(err?.code, 'blocked_word');
    assert.match(err!.message, /muted until/);
    assert.equal(await code(() => postMessage(db, u, 2, 'sorry', T0 + 30_000)), 'muted', 'third strike in 10 minutes mutes for 15');
    await postMessage(db, u, 2, 'sorry', T0 + 22_000 + 15 * 60_000);
    assert.equal((await auditLog(db, { event: 'chat_auto_mute' })).length, 1);
  });
  it('reports: three players hide a message; moderators dismiss, delete or mute; no self, system or repeat reports', async () => {
    const { db, cfg, userId } = await setup();
    const u = (await getUser(db, userId))!;
    const others: string[] = [];
    for (const n of ['Ann', 'Ben', 'Cid', 'Dee']) others.push((await signUp(db, cfg, { displayName: n, ageConfirmed: true, country: 'NZ' }, T0)).userId);
    const { id } = await postMessage(db, u, 2, 'cheap skins dm me', T0);
    assert.equal(await code(() => reportMessage(db, userId, id, 'spam', T0)), 'invalid_params', 'not your own');
    assert.equal(await code(() => reportMessage(db, others[0], id, 'because', T0)), 'invalid_params');
    assert.deepEqual(await reportMessage(db, others[0], id, 'scam', T0 + 1), { ok: true, hidden: false });
    assert.deepEqual(await reportMessage(db, others[0], id, 'spam', T0 + 2), { ok: true, hidden: false }, 'a second report by the same player counts once');
    await reportMessage(db, others[1], id, 'scam', T0 + 3);
    assert.deepEqual(await reportMessage(db, others[2], id, 'spam', T0 + 4), { ok: true, hidden: true });
    assert.equal((await listMessages(db, null)).some((m) => m.id === id), false, 'hidden until a moderator decides');
    let queue = await openReports(db);
    assert.equal(queue.length, 1);
    assert.deepEqual({ reports: queue[0].reports, state: queue[0].state, reasons: queue[0].reasons }, { reports: 3, state: 'hidden', reasons: { scam: 2, spam: 1 } });
    await resolveReport(db, 'mod', id, 'dismiss', null, 'not a scam, just a joke', T0 + 10);
    assert.ok((await listMessages(db, null)).some((m) => m.id === id), 'dismiss shows it again');
    assert.equal((await openReports(db)).length, 0);
    assert.equal(await code(() => resolveReport(db, 'mod', id, 'delete', null, '', T0 + 11)), 'not_found', 'nothing open any more');

    const second = await postMessage(db, u, 2, 'still selling', T0 + 60_000);
    await reportMessage(db, others[3], second.id, 'spam', T0 + 60_001);
    assert.equal((await openReports(db))[0].state, 'visible');
    await resolveReport(db, 'mod', second.id, 'mute', 60, 'trading in chat', T0 + 60_002);
    assert.equal(await code(() => postMessage(db, u, 2, 'why', T0 + 70_000)), 'muted');
    assert.equal((await listMessages(db, null)).some((m) => m.id === second.id), false);
    const sys = (await db.prepare("INSERT INTO chat_messages (user_id, name, kind, body, created_at) VALUES (NULL, 'SCRAPLINE', 'win', 'big win', ?) RETURNING id").get(T0)) as { id: number };
    assert.equal(await code(() => reportMessage(db, others[0], Number(sys.id), 'spam', T0)), 'invalid_params');
    assert.ok((await auditLog(db, { event: 'mod_report_' })).length >= 2);
  });
});
