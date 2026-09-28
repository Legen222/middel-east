import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';

import { FairStream, SAMPLE_CASES, layMines, openCase, playDice, playPlinko, playRaid, playUpgrader, priceCase, type RaidTool } from '../../engine/src/index';
import { signUp } from '../src/accounts';
import { getBet, minesCashout, minesReveal, minesStart, playInstant, raidBlast, raidCashout, raidStart } from '../src/bets';
import { checkGeo, withdrawalCheck } from '../src/compliance';
import { type Config, DEFAULT_CONFIG, MF_PER_FRAG, frags } from '../src/config';
import { openDb, type DB } from '../src/db';
import { AppError } from '../src/errors';
import { createApp } from '../src/http';
import { getLimits, selfExclude, sessionSummary, setLimit, startCooldown } from '../src/rg';
import { activeSeed, rotateSeed } from '../src/seeds';
import { type Fetch, STEAM_OPENID, verifyAssertion } from '../src/steam';
import { HOUSE, balanceOf, ledgerIntegrity, userAccount } from '../src/wallet';
import { getUser } from '../src/accounts';

const T0 = Date.UTC(2026, 8, 28, 12, 0, 0);
const HOUR = 3_600_000;

function setup(cfg: Partial<Config> = {}) {
  const db = openDb();
  const conf: Config = { ...DEFAULT_CONFIG, ...cfg };
  const { userId } = signUp(db, conf, { displayName: 'Tester', ageConfirmed: true, country: 'NZ' }, T0);
  return { db, cfg: conf, userId };
}
const bal = (db: DB, u: string) => balanceOf(db, userAccount(u));
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof AppError ? e.code : (e as Error).name; } return 'no-error'; };

describe('accounts & wallet', () => {
  it('refuses sign-up without 18+ confirmation', () => {
    const db = openDb();
    assert.equal(code(() => signUp(db, DEFAULT_CONFIG, { displayName: 'Kid', ageConfirmed: false, country: null }, T0)), 'age_required');
  });
  it('grants the demo balance through the ledger and keeps Σ ledger = 0', () => {
    const { db, userId } = setup();
    assert.equal(bal(db, userId), DEFAULT_CONFIG.demoStartBalance);
    assert.deepEqual(ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });
  it('rolls back the whole bet when the stake exceeds the balance', () => {
    const { db, cfg, userId } = setup({ demoStartBalance: frags(5) });
    const before = (db.prepare('SELECT COUNT(*) AS n FROM ledger').get() as { n: number }).n;
    assert.equal(code(() => playInstant(db, cfg, userId, 'dice', frags(10), { chance: 50, direction: 'under' }, T0)), 'insufficient_balance');
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM ledger').get() as { n: number }).n, before);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM bets').get() as { n: number }).n, 0);
    assert.equal(activeSeed(db, userId).nonce, 0);
  });
});

describe('bets settle correctly and replay exactly from the revealed seed', () => {
  it('40 mixed instant bets: balances, nonces, ledger and replay all agree', () => {
    const { db, cfg, userId } = setup();
    const plans = [
      ['dice', frags(10), { chance: 49.5, direction: 'under' }],
      ['dice', frags(3), { chance: 2, direction: 'over' }],
      ['plinko', frags(5), { rows: 16, risk: 'high' }],
      ['plinko', frags(7), { rows: 8, risk: 'low' }],
      ['upgrader', frags(20), { multiplier: 3 }],
      ['cases', 0, { caseId: 'werkzeugkiste' }],
    ] as const;
    let expected = bal(db, userId);
    for (let i = 0; i < 40; i++) {
      const [g, stake, params] = plans[i % plans.length];
      const b = playInstant(db, cfg, userId, g, stake || cfg.minStake, params as never, T0 + i);
      assert.equal(b.nonce, i);
      expected += b.payout - b.stake;
      assert.equal(bal(db, userId), expected);
    }
    assert.deepEqual(ledgerIntegrity(db), { sum: 0, mismatched: [] });

    const { revealed } = rotateSeed(db, userId, 'new-client', T0 + 100);
    const bets = db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY nonce').all(userId) as any[];
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
  it('case price is fixed by the server, the client stake is ignored', () => {
    const { db, cfg, userId } = setup();
    const b = playInstant(db, cfg, userId, 'cases', frags(1), { caseId: 'militaerkiste' }, T0);
    assert.equal(b.stake, priceCase(SAMPLE_CASES[1]) * MF_PER_FRAG);
  });
});

describe('mines', () => {
  it('hides the layout while open, blocks seed rotation, pays the ladder, and replays', () => {
    const { db, cfg, userId } = setup();
    const start = minesStart(db, cfg, userId, frags(10), 3, T0) as any;
    assert.equal(start.status, 'open');
    assert.equal(JSON.stringify(start).includes('"mines":['), false, 'mine positions must not leak');
    assert.equal(code(() => rotateSeed(db, userId, null, T0)), 'open_game');
    assert.equal(code(() => minesStart(db, cfg, userId, frags(10), 3, T0)), 'open_game');
    const seed = activeSeed(db, userId);
    const layout = layMines(new FairStream(seed.server_seed, seed.client_seed, 0), 3);
    const safe = [...Array(25).keys()].filter((t) => !layout.includes(t));
    minesReveal(db, cfg, userId, start.id, safe[0], T0);
    minesReveal(db, cfg, userId, start.id, safe[1], T0);
    const done = minesCashout(db, userId, start.id, T0) as any;
    assert.equal(done.status, 'settled');
    assert.equal(done.payout, Math.floor(frags(10) * (0.97 * 300) / 231));
    const lose = minesStart(db, cfg, userId, frags(10), 3, T0) as any;
    const s2 = activeSeed(db, userId);
    const layout2 = layMines(new FairStream(s2.server_seed, s2.client_seed, 1), 3);
    const hit = minesReveal(db, cfg, userId, lose.id, layout2[0], T0) as any;
    assert.equal(hit.status, 'settled');
    assert.equal(hit.payout, 0);
    assert.deepEqual(ledgerIntegrity(db), { sum: 0, mismatched: [] });
  });
  it('refuses a reveal that could exceed the max win (cash-out stays possible)', () => {
    const { db, cfg, userId } = setup({ maxWin: frags(40) });
    const g = minesStart(db, cfg, userId, frags(10), 3, T0) as any; // mult(1)=1.10, … mult(3)≈1.52 … grows
    const seed = activeSeed(db, userId);
    const layout = layMines(new FairStream(seed.server_seed, seed.client_seed, 0), 3);
    const safe = [...Array(25).keys()].filter((t) => !layout.includes(t));
    let refused = false;
    for (const t of safe) {
      const c = code(() => minesReveal(db, cfg, userId, g.id, t, T0));
      if (c === 'max_win') { refused = true; break; }
    }
    assert.ok(refused);
    const out = minesCashout(db, userId, g.id, T0) as any;
    assert.ok(out.payout <= frags(40));
  });
});

describe('raid', () => {
  it('blasts replay the same floats, holds settle at 0, cash-out pays 0.97/Πp', () => {
    const { db, cfg, userId } = setup();
    const seed = activeSeed(db, userId);
    const plan: RaidTool[] = ['c4', 'rocket', 'c4'];
    const expect = playRaid(new FairStream(seed.server_seed, seed.client_seed, 0), (s) => plan[s.length] ?? null);
    const g = raidStart(db, cfg, userId, frags(10), T0) as any;
    let last: any = g;
    for (const t of plan) { last = raidBlast(db, cfg, userId, g.id, t, T0); if (last.status === 'settled') break; }
    if (last.status === 'open') last = raidCashout(db, userId, g.id, T0);
    assert.equal(last.payout, Math.floor(frags(10) * expect.multiplier + 1e-9));
    assert.equal(getBet(db, g.id)!.status, 'settled');
  });
});

describe('max win and stake bounds', () => {
  it('refuses a dice bet whose win could exceed the cap and names the max stake', () => {
    const { db, cfg, userId } = setup({ maxWin: frags(1000) });
    try { playInstant(db, cfg, userId, 'dice', frags(100), { chance: 1, direction: 'under' }, T0); assert.fail('should throw'); }
    catch (e) { assert.ok(e instanceof AppError && e.code === 'max_win'); assert.equal((e as AppError).details!.maxStake, Math.floor(frags(1000) / 98)); }
  });
  it('refuses stakes outside the min/max band', () => {
    const { db, cfg, userId } = setup();
    assert.equal(code(() => playInstant(db, cfg, userId, 'dice', 1, { chance: 50, direction: 'under' }, T0)), 'invalid_stake');
  });
});

describe('responsible gambling', () => {
  it('loss limit blocks the bet that could break it (open stakes count as lost)', () => {
    const { db, cfg, userId } = setup();
    setLimit(db, cfg, userId, 'loss', 'day', frags(15), T0);
    playInstant(db, cfg, userId, 'dice', frags(10), { chance: 0.01, direction: 'under' }, T0); // almost surely lost
    assert.equal(code(() => playInstant(db, cfg, userId, 'dice', frags(10), { chance: 50, direction: 'under' }, T0 + 1)), 'rg_limit');
    assert.doesNotThrow(() => playInstant(db, cfg, userId, 'dice', frags(4), { chance: 50, direction: 'under' }, T0 + 2));
  });
  it('lowering applies now, raising only after 24 h, removing only after 24 h', () => {
    const { db, cfg, userId } = setup();
    assert.equal(setLimit(db, cfg, userId, 'wager', 'week', frags(500), T0).applied, 'now');
    assert.equal(setLimit(db, cfg, userId, 'wager', 'week', frags(200), T0).applied, 'now');
    const r = setLimit(db, cfg, userId, 'wager', 'week', frags(5000), T0);
    assert.equal(r.applied, 'delayed');
    assert.equal(getLimits(db, userId, T0 + 23 * HOUR)[0].amount, frags(200));
    assert.equal(getLimits(db, userId, T0 + 24 * HOUR)[0].amount, frags(5000));
    setLimit(db, cfg, userId, 'wager', 'week', null, T0 + 25 * HOUR);
    assert.equal(getLimits(db, userId, T0 + 48 * HOUR)[0].amount, frags(5000));
    assert.equal(getLimits(db, userId, T0 + 49 * HOUR)[0].amount, null);
  });
  it('cooldown blocks bets until it ends and cannot be shortened', () => {
    const { db, cfg, userId } = setup();
    startCooldown(db, userId, 24, T0);
    assert.equal(code(() => playInstant(db, cfg, userId, 'dice', frags(1), { chance: 50, direction: 'under' }, T0 + HOUR)), 'rg_cooldown');
    assert.equal(code(() => startCooldown(db, userId, 1, T0)), 'invalid_cooldown');
    assert.doesNotThrow(() => playInstant(db, cfg, userId, 'dice', frags(1), { chance: 50, direction: 'under' }, T0 + 25 * HOUR));
  });
  it('self-exclusion blocks play and ends all sessions', () => {
    const { db, cfg, userId } = setup();
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run('x'.repeat(64), userId, T0, T0 + 1e9);
    selfExclude(db, userId, 6, T0);
    assert.equal(code(() => playInstant(db, cfg, userId, 'dice', frags(1), { chance: 50, direction: 'under' }, T0 + 1)), 'rg_excluded');
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(userId) as { n: number }).n, 0);
  });
  it('session summary reports wagered, net and the next reality check', () => {
    const { db, cfg, userId } = setup();
    const b = playInstant(db, cfg, userId, 'dice', frags(10), { chance: 50, direction: 'under' }, T0 + 1000);
    const s = sessionSummary(db, userId, T0, T0 + 61 * 60_000);
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
  it('withdrawal check explains every missing precondition', () => {
    const { db, cfg, userId } = setup();
    const r = withdrawalCheck(db, cfg, getUser(db, userId)!, frags(10));
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
  const steamSays = (valid: boolean): Fetch => async (_u, init) => { assert.ok(init.body.includes('openid.mode=check_authentication')); return { ok: true, text: async () => `ns:http://specs.openid.net/auth/2.0\nis_valid:${valid}\n` }; };
  it('accepts a valid assertion and extracts the SteamID64', async () => {
    const db = openDb();
    assert.deepEqual(await verifyAssertion(db, q(), RT, steamSays(true), T0), { steamId: '76561198000000001' });
  });
  it('rejects replay, forged ids, foreign return_to, stale nonces and Steam saying no', async () => {
    const db = openDb();
    await verifyAssertion(db, q(), RT, steamSays(true), T0);
    await assert.rejects(verifyAssertion(db, q(), RT, steamSays(true), T0), /replayed/);
    await assert.rejects(verifyAssertion(openDb(), q({ 'openid.claimed_id': 'https://evil.example/openid/id/76561198000000001' }), RT, steamSays(true), T0), /claimed_id/);
    await assert.rejects(verifyAssertion(openDb(), q({ 'openid.return_to': 'https://evil.example/cb' }), RT, steamSays(true), T0), /return_to/);
    await assert.rejects(verifyAssertion(openDb(), q({}, T0 - 10 * 60_000), RT, steamSays(true), T0), /stale/);
    await assert.rejects(verifyAssertion(openDb(), q(), RT, steamSays(false), T0), /rejected/);
  });
});

describe('HTTP API (end to end)', () => {
  it('sign-up → bet → mines → limits → verify → stats', async () => {
    let now = T0;
    const db = openDb();
    const server = createApp({ db, cfg: DEFAULT_CONFIG, clock: () => now, fetch: async () => ({ ok: false, text: async () => '' }), publicUrl: 'http://x' });
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
      assert.equal(me.json.balance, 100_000);
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
      assert.deepEqual(ledgerIntegrity(db), { sum: 0, mismatched: [] });
      assert.ok(balanceOf(db, HOUSE) !== 0);
    } finally {
      server.close();
    }
  });
});
