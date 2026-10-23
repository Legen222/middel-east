/**
 * Backoffice bet explorer: every wager of every game in one list, and a detail view that re-runs the
 * round on the server from its seeds and compares it with what was booked.
 *
 * Checks per round: the commitment (sha256(server seed) = published hash, or the hash-chain link for
 * live games), the beacon value for beacon-seeded games, and the outcome itself (replayed through the
 * engine, with the case version the round used). A player's server seed that is still active is used
 * for the check but never returned: the operator sees it only once the player has rotated it, exactly
 * like the player.
 */

import {
  type BattleMode, type BjAction, type CaseItem, type CoinSide, type DiceBet, type HiloGuess, type PlinkoRisk, type PlinkoRows, type RaidTool,
  type TowerLevel, type WheelField, FairStream, RAID_TOOLS, TILES, WHEEL_LAYOUT, bjAct, bjDeal, crashPoint, drawCard, drawJackpot, hiloMultiplier,
  hiloWins, layMines, layTraps, minesMultiplier, openCase, playAirdrop, playBattle, playCoinflip, playDice, playPlinko, playUpgrader, raidMultiplier,
  sha256Hex, spinWheel, towersMultiplier, wheelPayout,
} from '../../engine/src/index';
import type { Beacon } from './beacon';
import { type BetRow, getBet, seedById, stream } from './bets';
import { caseVersion } from './cases';
import { MF_PER_FRAG } from './config';
import type { DB } from './db';
import { fail } from './errors';
import { GAME_NAME, type GameId } from './flags';

const f = (mf: number) => Number(mf) / MF_PER_FRAG;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

export interface ExploreFilter { game?: string; user?: string; minPayout?: number; minMultiplier?: number; since?: number; before?: number; limit?: number }

export async function exploreBets(db: DB, q: ExploreFilter) {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (q.game) { where.push('w.game = ?'); args.push(q.game); }
  if (q.user) { where.push('(w.user_id = ? OR LOWER(u.display_name) LIKE ?)'); args.push(q.user, `%${q.user.toLowerCase()}%`); }
  if (q.minPayout !== undefined) { where.push('w.payout >= ?'); args.push(Math.round(q.minPayout * MF_PER_FRAG)); }
  if (q.minMultiplier !== undefined) { where.push('w.payout >= w.stake * ?'); args.push(q.minMultiplier); }
  if (q.since !== undefined) { where.push('w.created_at >= ?'); args.push(q.since); }
  if (q.before !== undefined) { where.push('w.created_at < ?'); args.push(q.before); }
  const sql = `FROM wagers w LEFT JOIN users u ON u.id = w.user_id${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
  const limit = Math.min(500, Math.max(1, q.limit ?? 100));
  const rows = (await db.prepare(`SELECT w.ref, w.game, w.user_id, u.display_name AS name, w.stake, w.payout, w.settled, w.created_at, w.settled_at ${sql} ORDER BY w.created_at DESC LIMIT ${limit}`).all(...args)) as
    { ref: string; game: GameId; user_id: string; name: string | null; stake: number; payout: number; settled: number; created_at: number; settled_at: number | null }[];
  const sum = (await db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(w.stake), 0) AS s, COALESCE(SUM(w.payout), 0) AS p ${sql}`).get(...args)) as { n: number; s: number; p: number };
  return {
    total: { bets: Number(sum.n), wagered: f(sum.s), paid: f(sum.p), ggr: f(sum.s - sum.p) },
    bets: rows.map((r) => ({
      game: r.game, gameName: GAME_NAME[r.game] ?? r.game, ref: r.ref, userId: r.user_id, name: r.name, stake: f(r.stake), payout: f(r.payout),
      multiplier: r.stake ? Number(r.payout) / Number(r.stake) : 0, settled: Number(r.settled) === 1, createdAt: r.created_at, settledAt: r.settled_at,
    })),
  };
}

interface Check { name: string; ok: boolean; detail?: string }
type Verification = { status: 'verified' | 'mismatch' | 'pending'; reason?: string; checks: Check[] };
const pending = (reason: string): Verification => ({ status: 'pending', reason, checks: [] });
const verdict = (checks: Check[]): Verification => ({ status: checks.every((c) => c.ok) ? 'verified' : 'mismatch', checks });

async function beaconCheck(beacon: Beacon, round: number | null, value: string | null, now: number): Promise<Check> {
  if (round === null || value === null) return { name: 'beacon', ok: false, detail: 'no beacon value stored' };
  const v = await beacon.get(Number(round), now);
  if (!v) return { name: 'beacon', ok: true, detail: `${beacon.name} round ${round} not reachable from here; stored value kept` };
  return { name: 'beacon', ok: v.randomness === value, detail: `${beacon.name} round ${round}` };
}

/* ---------- player-seeded games (bets table) ---------- */

async function replayBet(db: DB, b: BetRow): Promise<Check[]> {
  const seed = await seedById(db, b.seed_id);
  const checks: Check[] = [{ name: 'commitment', ok: sha256Hex(seed.server_seed) === seed.server_hash, detail: 'sha256(server seed) = published hash' }];
  const src = stream(seed, b.nonce);
  const p = JSON.parse(b.params || '{}');
  const r = JSON.parse(b.result ?? 'null');
  const mult = Number(b.multiplier);
  const outcome = (ok: boolean, detail: string) => checks.push({ name: 'outcome', ok, detail });
  switch (b.game) {
    case 'dice': { const o = playDice(src, p as DiceBet); outcome(o.roll === r.roll && near(o.multiplier, mult), `roll ${o.roll}, ×${o.multiplier}`); break; }
    case 'plinko': { const o = playPlinko(src, p.rows as PlinkoRows, p.risk as PlinkoRisk); outcome(o.bucket === r.bucket && near(o.multiplier, mult), `bucket ${o.bucket}, ×${o.multiplier}`); break; }
    case 'upgrader': { const o = playUpgrader(src, 1, p.multiplier, undefined, p.zone ?? 0); outcome(o.win === mult > 0 && near(o.roll, r.roll), `roll ${o.roll.toFixed(8)}, zone from ${((p.zone ?? 0) / 100).toFixed(2)} %, ${o.win ? 'upgraded' : 'lost'}`); break; }
    case 'airdrop': { const o = playAirdrop(src, p.target); outcome(near(o.landing, r.landing) && near(o.multiplier, mult), `landed ${o.landing}×, target ${p.target}×`); break; }
    case 'cases': {
      const c = await caseVersion(db, p.caseId, p.version ?? 1);
      const o = openCase(src, c);
      outcome(o.ticket === r.ticket && same(o.item, r.item as CaseItem), `${c.name} v${c.version}: ticket ${o.ticket} → ${o.item.name}`);
      break;
    }
    case 'mines': {
      const mines = layMines(src, p.mines);
      const hit = r.hit as number | undefined;
      const revealed = r.revealed as number[];
      const ok = same(sorted(mines), sorted(r.mines)) && (hit !== undefined
        ? mines.includes(hit) && mult === 0
        : revealed.every((t) => !mines.includes(t)) && near(mult, minesMultiplier(p.mines, revealed.length)));
      outcome(ok, `${p.mines} mines of ${TILES}, ${revealed.length} safe tiles${hit !== undefined ? `, hit ${hit}` : ''}`);
      break;
    }
    case 'towers': {
      const level = p.level as TowerLevel;
      const traps = layTraps(src, level);
      const picks = r.picks as number[];
      const at = r.trapAt as number | undefined;
      const ok = same(traps, r.traps) && (at !== undefined
        ? traps[at].includes(picks[at]) && picks.slice(0, at).every((d, i) => !traps[i].includes(d)) && mult === 0
        : picks.every((d, i) => !traps[i].includes(d)) && near(mult, towersMultiplier(level, picks.length)));
      outcome(ok, `${level} keycard, ${at !== undefined ? `trap in room ${at + 1}` : `${picks.length} rooms cleared`}`);
      break;
    }
    case 'hilo': {
      const cards = [drawCard(src)];
      const moves = r.moves as ('hi' | 'lo' | 'skip')[];
      let lost = false;
      for (const m of moves) {
        const next = drawCard(src);
        if (m !== 'skip' && !hiloWins(cards[cards.length - 1].rank, next.rank, m as HiloGuess)) lost = true;
        cards.push(next);
      }
      outcome(same(cards, r.cards) && (lost ? mult === 0 : near(mult, hiloMultiplier(r.chances))), `${cards.length} cards, ${lost ? 'last guess lost' : 'cashed out'}`);
      break;
    }
    case 'raid': {
      const steps = r.steps as { tool: RaidTool }[];
      const rolls = steps.map(() => src.next());
      const held = r.heldAt !== undefined;
      const breached = rolls.map((x, i) => x < RAID_TOOLS[steps[i].tool]);
      const ok = held
        ? breached.slice(0, -1).every(Boolean) && !breached[breached.length - 1] && mult === 0
        : breached.every(Boolean) && near(mult, raidMultiplier(steps.map((s) => s.tool)));
      outcome(ok, `${steps.length} layer${steps.length === 1 ? '' : 's'}, ${held ? `held at ${r.heldAt}` : 'looted'}`);
      break;
    }
    case 'blackjack': {
      if (!Array.isArray(r.actions)) { outcome(false, 'no action log stored for this hand'); break; }
      let s = bjDeal(src);
      for (const a of r.actions as BjAction[]) s = bjAct(src, s, a);
      outcome(s.finished && same(s.hands, r.hands) && same(s.dealer, r.dealer), `deal + ${r.actions.length} action${r.actions.length === 1 ? '' : 's'} (${(r.actions as string[]).join(', ') || 'none'})`);
      break;
    }
    default: outcome(false, `no replay for ${b.game}`);
  }
  return checks;
}

/* ---------- detail ---------- */

export async function betDetail(db: DB, beacon: Beacon, game: string, ref: string, now: number) {
  switch (game) {
    case 'crash': return crashDetail(db, beacon, ref, now);
    case 'wheel': return wheelDetail(db, beacon, ref, now);
    case 'coinflip': case 'battle': return pvpDetail(db, beacon, ref, now);
    case 'jackpot': return jackpotDetail(db, beacon, ref, now);
  }
  const b = (await getBet(db, ref)) ?? fail('not_found', 'Bet not found.', 404);
  if (b.game !== game) fail('not_found', 'Bet not found.', 404);
  const seed = await seedById(db, b.seed_id);
  const user = (await db.prepare('SELECT display_name FROM users WHERE id = ?').get(b.user_id)) as { display_name: string } | undefined;
  return {
    game, gameName: GAME_NAME[game as GameId] ?? game, ref, userId: b.user_id, name: user?.display_name ?? null,
    stake: f(b.stake), payout: f(b.payout), multiplier: Number(b.multiplier), createdAt: b.created_at, settledAt: b.settled_at,
    params: JSON.parse(b.params || '{}'), result: b.status === 'settled' ? JSON.parse(b.result ?? 'null') : null,
    fairness: { serverSeedHash: seed.server_hash, clientSeed: seed.client_seed, nonce: b.nonce, serverSeed: seed.revealed_at ? seed.server_seed : null, seedRevealed: Boolean(seed.revealed_at) },
    verification: b.status !== 'settled' ? pending('The round is still running.') : verdict(await replayBet(db, b)),
  };
}

interface Chain { terminal_hash: string; client_seed: string | null; beacon_round: number }

async function chainChecks(db: DB, beacon: Beacon, table: 'crash' | 'wheel', round: { chain_id: number; idx: number; seed: string }, now: number): Promise<{ chain: Chain; checks: Check[] }> {
  const chain = (await db.prepare(`SELECT terminal_hash, client_seed, beacon_round FROM ${table}_chains WHERE id = ?`).get(round.chain_id)) as Chain;
  const prev = Number(round.idx) === 0 ? null
    : ((await db.prepare(`SELECT seed FROM ${table}_rounds WHERE chain_id = ? AND idx = ?`).get(round.chain_id, Number(round.idx) - 1)) as { seed: string } | undefined);
  const anchor = Number(round.idx) === 0 ? chain.terminal_hash : prev?.seed;
  const checks: Check[] = [
    anchor
      ? { name: 'commitment', ok: sha256Hex(round.seed) === anchor, detail: Number(round.idx) === 0 ? 'sha256(seed) = published terminal hash' : 'sha256(seed) = seed of the previous round' }
      : { name: 'commitment', ok: false, detail: 'previous round of the chain missing' },
    await beaconCheck(beacon, chain.beacon_round, chain.client_seed, now),
  ];
  return { chain, checks };
}

async function crashDetail(db: DB, beacon: Beacon, ref: string, now: number) {
  const b = (await db.prepare('SELECT b.*, u.display_name AS name FROM crash_bets b LEFT JOIN users u ON u.id = b.user_id WHERE b.id = ?').get(ref)) as
    { id: string; round_id: number; user_id: string; name: string; stake: number; target: number; cashed_at: number | null; payout: number; status: string; created_at: number } | undefined;
  if (!b) fail('not_found', 'Bet not found.', 404);
  const r = (await db.prepare('SELECT * FROM crash_rounds WHERE id = ?').get(b!.round_id)) as { id: number; chain_id: number; idx: number; seed: string; crash: number; status: string; crash_at: number };
  const base = { game: 'crash', gameName: GAME_NAME.crash, ref, userId: b!.user_id, name: b!.name, stake: f(b!.stake), payout: f(b!.payout), multiplier: b!.stake ? Number(b!.payout) / Number(b!.stake) : 0, createdAt: b!.created_at, settledAt: r.crash_at, params: { target: b!.target / 100, round: r.id } };
  if (r.status !== 'crashed') return { ...base, result: null, fairness: { round: r.id }, verification: pending('The round is still running.') };
  const { chain, checks } = await chainChecks(db, beacon, 'crash', r, now);
  const crash = Math.round(crashPoint(r.seed, chain.client_seed ?? '').crash * 100);
  checks.push({ name: 'outcome', ok: crash === Number(r.crash), detail: `crash point ${crash / 100}×` });
  checks.push({ name: 'payout', ok: Number(b!.payout) <= Math.floor((b!.stake * Math.min(b!.target, r.crash)) / 100), detail: b!.payout ? `cashed out at ${(b!.payout / b!.stake).toFixed(2)}×` : 'lost' });
  return { ...base, result: { crash: r.crash / 100 }, fairness: { round: r.id, seed: r.seed, chainIndex: Number(r.idx), clientSeed: chain.client_seed, beaconRound: chain.beacon_round }, verification: verdict(checks) };
}

async function wheelDetail(db: DB, beacon: Beacon, ref: string, now: number) {
  const b = (await db.prepare('SELECT b.*, u.display_name AS name FROM wheel_bets b LEFT JOIN users u ON u.id = b.user_id WHERE b.id = ?').get(ref)) as
    { id: string; round_id: number; user_id: string; name: string; field: WheelField; stake: number; payout: number; created_at: number } | undefined;
  if (!b) fail('not_found', 'Bet not found.', 404);
  const r = (await db.prepare('SELECT * FROM wheel_rounds WHERE id = ?').get(b!.round_id)) as { id: number; chain_id: number; idx: number; seed: string; field_index: number; status: string; spin_ends_at: number };
  const base = { game: 'wheel', gameName: GAME_NAME.wheel, ref, userId: b!.user_id, name: b!.name, stake: f(b!.stake), payout: f(b!.payout), multiplier: b!.stake ? Number(b!.payout) / Number(b!.stake) : 0, createdAt: b!.created_at, settledAt: r.spin_ends_at, params: { field: b!.field, round: r.id } };
  if (r.status !== 'settled') return { ...base, result: null, fairness: { round: r.id }, verification: pending('The round is still running.') };
  const { chain, checks } = await chainChecks(db, beacon, 'wheel', r, now);
  const o = spinWheel(new FairStream(r.seed, chain.client_seed ?? '', 0));
  checks.push({ name: 'outcome', ok: o.index === Number(r.field_index), detail: `segment ${o.index} → ${o.field}` });
  const expected = b!.field === WHEEL_LAYOUT[r.field_index] ? Math.floor(b!.stake * wheelPayout(b!.field)) : 0;
  checks.push({ name: 'payout', ok: expected === Number(b!.payout), detail: `${expected / MF_PER_FRAG} Scrap expected` });
  return { ...base, result: { index: Number(r.field_index), field: WHEEL_LAYOUT[r.field_index] }, fairness: { round: r.id, seed: r.seed, chainIndex: Number(r.idx), clientSeed: chain.client_seed, beaconRound: chain.beacon_round }, verification: verdict(checks) };
}

async function pvpDetail(db: DB, beacon: Beacon, ref: string, now: number) {
  const g = (await db.prepare('SELECT * FROM pvp_games WHERE id = ?').get(ref)) as
    { id: string; type: 'coinflip' | 'battle'; status: string; params: string; seats: number; seat_stake: number; server_seed: string; server_hash: string; beacon_round: number | null; beacon_value: string | null; result: string | null; created_at: number; settled_at: number | null } | undefined;
  if (!g) fail('not_found', 'Game not found.', 404);
  const seats = (await db.prepare('SELECT s.seat, s.user_id, s.stake, s.payout, u.display_name AS name FROM pvp_seats s LEFT JOIN users u ON u.id = s.user_id WHERE s.game_id = ? ORDER BY s.seat').all(g!.id)) as { seat: number; user_id: string | null; stake: number; payout: number; name: string | null }[];
  const params = JSON.parse(g!.params);
  const base = {
    game: g!.type, gameName: GAME_NAME[g!.type], ref, userId: seats[0]?.user_id ?? null, name: seats[0]?.name ?? null,
    stake: f(g!.seat_stake), payout: f(seats.reduce((s, x) => s + Number(x.payout), 0)), multiplier: 0, createdAt: g!.created_at, settledAt: g!.settled_at, params,
    seats: seats.map((s) => ({ seat: s.seat, name: s.user_id ? s.name : 'Demo bot', stake: f(s.stake), payout: f(s.payout) })),
  };
  if (g!.status !== 'settled') return { ...base, result: null, fairness: { serverSeedHash: g!.server_hash, beaconRound: g!.beacon_round }, verification: pending(g!.status === 'cancelled' ? 'Cancelled and refunded.' : 'The game has not been drawn yet.') };
  const r = JSON.parse(g!.result ?? 'null');
  const src = new FairStream(g!.server_seed, g!.beacon_value ?? '', 0);
  const checks: Check[] = [{ name: 'commitment', ok: sha256Hex(g!.server_seed) === g!.server_hash, detail: 'sha256(server seed) = published hash' }, await beaconCheck(beacon, g!.beacon_round, g!.beacon_value, now)];
  if (g!.type === 'coinflip') {
    const o = playCoinflip(src, params.side as CoinSide);
    checks.push({ name: 'outcome', ok: o.roll === r.roll && (o.creatorWins ? 0 : 1) === r.winnerSeat, detail: `roll ${o.roll.toFixed(8)} → ${o.side}` });
  } else {
    const cases = [];
    for (const [i, id] of (params.caseIds as string[]).entries()) cases.push(await caseVersion(db, id, params.versions?.[i] ?? 1));
    const o = playBattle(src, cases, g!.seats, params.mode as BattleMode);
    checks.push({ name: 'outcome', ok: same(o.totals, r.totals) && same(o.winners, r.winners), detail: `totals ${o.totals.join(' / ')}, winner seat${o.winners.length > 1 ? 's' : ''} ${o.winners.map((w) => w + 1).join(', ')}` });
    if (o.bonus) checks.push({ name: 'bonus', ok: same(o.bonus.powers, r.bonus?.powers ?? []) && o.bonus.spin === r.bonus?.spin, detail: `powers ×${o.bonus.powers.join(' ×')}, spin ${o.bonus.spin.toFixed(8)} → seat ${o.winners[0] + 1}` });
    const expected = o.payouts.map((p) => Math.floor(p * MF_PER_FRAG));
    checks.push({ name: 'payout', ok: same(expected, seats.map((s) => Number(s.payout))), detail: `${expected.map((p) => p / MF_PER_FRAG).join(' / ')} Scrap per seat` });
  }
  return { ...base, result: r, fairness: { serverSeed: g!.server_seed, serverSeedHash: g!.server_hash, beaconRound: g!.beacon_round, beaconValue: g!.beacon_value }, verification: verdict(checks) };
}

async function jackpotDetail(db: DB, beacon: Beacon, ref: string, now: number) {
  const r = (await db.prepare('SELECT * FROM jackpot_rounds WHERE id = ?').get(ref)) as
    { id: string; room: string; status: string; server_seed: string; server_hash: string; total: number; beacon_round: number | null; beacon_value: string | null; ticket: number | null; winner_entry: number | null; payout: number | null; created_at: number; settled_at: number | null } | undefined;
  if (!r) fail('not_found', 'Round not found.', 404);
  const entries = (await db.prepare('SELECT e.id, e.user_id, e.amount, e.payout, u.display_name AS name FROM jackpot_entries e LEFT JOIN users u ON u.id = e.user_id WHERE e.round_id = ? ORDER BY e.id').all(r!.id)) as { id: number; user_id: string | null; amount: number; payout: number; name: string | null }[];
  const winner = entries.find((e) => Number(e.id) === Number(r!.winner_entry));
  const base = {
    game: 'jackpot', gameName: GAME_NAME.jackpot, ref, userId: winner?.user_id ?? null, name: winner ? (winner.user_id ? winner.name : 'Demo bot') : null,
    stake: f(r!.total), payout: f(r!.payout ?? 0), multiplier: 0, createdAt: r!.created_at, settledAt: r!.settled_at, params: { room: r!.room },
    entries: entries.map((e) => ({ id: Number(e.id), name: e.user_id ? e.name : 'Demo bot', amount: f(e.amount), chance: Number(e.amount) / Number(r!.total || 1), payout: f(e.payout) })),
  };
  if (r!.status !== 'settled') return { ...base, result: null, fairness: { serverSeedHash: r!.server_hash, beaconRound: r!.beacon_round }, verification: pending(r!.status === 'refunded' ? 'Nobody else joined: refunded.' : 'The pot has not been drawn yet.') };
  const o = drawJackpot(new FairStream(r!.server_seed, r!.beacon_value ?? '', 0), entries.map((e) => ({ amount: Number(e.amount) })));
  const checks: Check[] = [
    { name: 'commitment', ok: sha256Hex(r!.server_seed) === r!.server_hash, detail: 'sha256(server seed) = published hash' },
    await beaconCheck(beacon, r!.beacon_round, r!.beacon_value, now),
    { name: 'outcome', ok: o.ticket === Number(r!.ticket) && Number(entries[o.winner]?.id) === Number(r!.winner_entry), detail: `ticket ${o.ticket} of ${o.total} → entry ${o.winner + 1}` },
    { name: 'payout', ok: o.payout === Number(r!.payout), detail: `${o.payout / MF_PER_FRAG} Scrap after the fee` },
  ];
  return { ...base, result: { ticket: Number(r!.ticket), winnerEntry: Number(r!.winner_entry) }, fairness: { serverSeed: r!.server_seed, serverSeedHash: r!.server_hash, beaconRound: r!.beacon_round, beaconValue: r!.beacon_value }, verification: verdict(checks) };
}
