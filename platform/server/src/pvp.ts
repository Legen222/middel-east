/**
 * PvP games: Coinflip and Case Battle.
 *
 * Lifecycle  open ──(last seat filled)──▶ locked ──(beacon round available)──▶ settled
 *                 └─(creator cancels, refund)─▶ cancelled
 *
 * Fairness: each game gets its own server seed; its SHA-256 is shown from creation. When the last seat
 * fills, the game picks beacon round = current + 2. Nobody can know that round's value when the seats
 * are taken, not the operator (with drand) and not the players. Outcome = engine(FairStream(serverSeed,
 * beaconValue, 0)). The server seed is revealed at settlement, so every game is verifiable right away.
 *
 * Money: seat stakes move to `house:pvp-escrow`. At settlement escrow pays the winners; what remains
 * (coinflip rake, battle case edge) goes to the bankroll. Demo bots are funded by the bankroll.
 */

import { randomBytes } from 'node:crypto';

import { EDGE, FairStream, SAMPLE_CASES, newServerSeed, playBattle, playCoinflip, priceCase, type BattleMode, type CoinSide } from '../../engine/src/index';
import type { Beacon } from './beacon';
import { type Config, MF_PER_FRAG } from './config';
import { type DB, audit, tx } from './db';
import { fail } from './errors';
import { assertGameEnabled } from './flags';
import { checkBet } from './rg';
import { HOUSE, transfer, userAccount } from './wallet';

export const ESCROW = 'house:pvp-escrow';

interface GameRow {
  id: string; type: 'coinflip' | 'battle'; status: 'open' | 'locked' | 'settled' | 'cancelled'; creator_id: string; params: string;
  seats: number; seat_stake: number; server_seed: string; server_hash: string; beacon_round: number | null; beacon_value: string | null;
  result: string | null; created_at: number; locked_at: number | null; settled_at: number | null;
}
interface SeatRow { game_id: string; seat: number; user_id: string | null; stake: number; payout: number }

const getGame = async (db: DB, id: string) => (await db.prepare('SELECT * FROM pvp_games WHERE id = ?').get(id)) as GameRow | undefined;
const getSeats = async (db: DB, id: string) => (await db.prepare('SELECT * FROM pvp_seats WHERE game_id = ? ORDER BY seat').all(id)) as SeatRow[];
const rnd = (n: number) => new Uint8Array(randomBytes(n));

async function takeSeat(db: DB, cfg: Config, game: GameRow, seat: number, userId: string | null, now: number): Promise<void> {
  await assertGameEnabled(db, game.type);
  if (userId) {
    await checkBet(db, userId, game.seat_stake, now);
    await transfer(db, userAccount(userId), ESCROW, game.seat_stake, 'stake', game.id, now);
  } else {
    if (!cfg.demo) fail('no_bots', 'Bots are only available in demo mode.', 403);
    await transfer(db, HOUSE, ESCROW, game.seat_stake, 'stake', game.id, now);
  }
  await db.prepare('INSERT INTO pvp_seats (game_id, seat, user_id, stake, created_at) VALUES (?, ?, ?, ?, ?)').run(game.id, seat, userId, game.seat_stake, now);
}

export function createCoinflip(db: DB, cfg: Config, userId: string, stake: number, side: CoinSide, now: number): Promise<string> {
  if (side !== 'rust' && side !== 'scrap') fail('invalid_params', 'Side: rust or scrap.');
  if (!Number.isSafeInteger(stake) || stake < cfg.minStake || stake > cfg.maxStake) fail('invalid_stake', `Stake: ${cfg.minStake / MF_PER_FRAG} to ${cfg.maxStake / MF_PER_FRAG} Frags.`);
  if (stake * 2 * (1 - EDGE.coinflip) > cfg.maxWin) fail('max_win', 'This stake exceeds the max win.');
  return create(db, cfg, userId, 'coinflip', { side }, 2, stake, now);
}

export function createBattle(db: DB, cfg: Config, userId: string, caseIds: string[], seats: number, mode: BattleMode, now: number): Promise<string> {
  if (!Array.isArray(caseIds) || caseIds.length < 1 || caseIds.length > 10) fail('invalid_params', '1 to 10 cases.');
  if (![2, 3, 4].includes(seats)) fail('invalid_params', '2, 3 or 4 seats.');
  if (!['normal', 'crazy', 'terminal'].includes(mode)) fail('invalid_params', 'Mode: normal, crazy or terminal.');
  const cases = caseIds.map((id) => SAMPLE_CASES.find((c) => c.id === id) ?? fail('invalid_params', `Unknown case: ${id}`));
  const cost = cases.reduce((s, c) => s + priceCase(c), 0) * MF_PER_FRAG;
  const bestPool = cases.reduce((s, c) => s + Math.max(...c.items.map((i) => i.value)), 0) * MF_PER_FRAG * seats;
  if (bestPool > cfg.maxWin) fail('max_win', 'This battle could exceed the max win. Pick fewer or cheaper cases.');
  if (cost > cfg.maxStake) fail('invalid_stake', 'This battle is too expensive.');
  return create(db, cfg, userId, 'battle', { caseIds, mode }, seats, cost, now);
}

function create(db: DB, cfg: Config, userId: string, type: GameRow['type'], params: object, seats: number, seatStake: number, now: number): Promise<string> {
  return tx(db, async (db) => {
    const open = (await db.prepare("SELECT COUNT(*) AS n FROM pvp_games WHERE creator_id = ? AND status = 'open'").get(userId)) as { n: number };
    if (open.n >= 5) fail('too_many_open', 'At most 5 open games at a time.', 429);
    const id = randomBytes(8).toString('hex');
    const { seed, hash } = newServerSeed(rnd);
    await db.prepare("INSERT INTO pvp_games (id, type, status, creator_id, params, seats, seat_stake, server_seed, server_hash, created_at) VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)")
      .run(id, type, userId, JSON.stringify(params), seats, seatStake, seed, hash, now);
    await takeSeat(db, cfg, (await getGame(db, id))!, 0, userId, now);
    await audit(db, userId, 'pvp_create', { id, type, seats, seatStake }, now);
    return id;
  });
}

/** Joins the next free seat (userId = null → demo bot). Locks the game when full. */
export function joinGame(db: DB, cfg: Config, beacon: Beacon, gameId: string, userId: string | null, now: number): Promise<string> {
  return tx(db, async (db) => {
    const g = (await getGame(db, gameId)) ?? fail('not_found', 'Game not found.', 404);
    if (g.status !== 'open') fail('not_open', 'This game is no longer open.', 409);
    const seats = await getSeats(db, gameId);
    if (userId && seats.some((s) => s.user_id === userId)) fail('already_seated', 'You are already seated in this game.', 409);
    if (!userId && g.type === 'coinflip' && seats.length !== 1) fail('invalid_action', 'A bot can only join as the opponent.');
    await takeSeat(db, cfg, g, seats.length, userId, now);
    if (seats.length + 1 === g.seats) {
      const round = beacon.roundAt(now) + 2;
      await db.prepare("UPDATE pvp_games SET status = 'locked', locked_at = ?, beacon_round = ? WHERE id = ?").run(now, round, gameId);
    }
    return gameId;
  });
}

export function cancelGame(db: DB, gameId: string, userId: string, now: number): Promise<string> {
  return tx(db, async (db) => {
    const g = (await getGame(db, gameId)) ?? fail('not_found', 'Game not found.', 404);
    if (g.creator_id !== userId) fail('forbidden', 'Only the creator can cancel.', 403);
    if (g.status !== 'open') fail('not_open', 'Only open games can be cancelled.', 409);
    for (const s of await getSeats(db, gameId)) await transfer(db, ESCROW, s.user_id ? userAccount(s.user_id) : HOUSE, s.stake, 'refund', gameId, now);
    await db.prepare("UPDATE pvp_games SET status = 'cancelled', settled_at = ? WHERE id = ?").run(now, gameId);
    return gameId;
  });
}

/** Settles every locked game whose beacon round is available. Call from a ticker and before reads. */
export async function settleDue(db: DB, beacon: Beacon, now: number): Promise<number> {
  const due = (await db.prepare("SELECT id, beacon_round FROM pvp_games WHERE status = 'locked'").all()) as { id: string; beacon_round: number }[];
  let n = 0;
  for (const d of due) {
    const v = await beacon.get(d.beacon_round, now);
    if (!v) continue;
    const settled = await tx(db, async (db) => {
      const g = (await getGame(db, d.id))!;
      if (g.status !== 'locked') return false;
      const seats = await getSeats(db, g.id);
      const src = new FairStream(g.server_seed, v.randomness, 0);
      const params = JSON.parse(g.params);
      let payouts: number[];
      let result: unknown;
      if (g.type === 'coinflip') {
        const o = playCoinflip(src, params.side as CoinSide);
        const win = Math.floor(g.seat_stake * o.winnerMultiplier);
        payouts = [o.creatorWins ? win : 0, o.creatorWins ? 0 : win];
        result = { roll: o.roll, side: o.side, winnerSeat: o.creatorWins ? 0 : 1 };
      } else {
        const cases = (params.caseIds as string[]).map((id) => SAMPLE_CASES.find((c) => c.id === id)!);
        const o = playBattle(src, cases, g.seats, params.mode as BattleMode);
        payouts = o.payouts.map((p) => Math.floor(p * MF_PER_FRAG));
        result = { drops: o.drops.map((r) => r.map((i) => ({ name: i.name, value: i.value }))), totals: o.totals, winners: o.winners };
      }
      // Battles can pay out more than was staked (a lucky pool); the bankroll tops up escrow first,
      // so escrow never goes negative and the per-game balance closes at exactly zero.
      const escrowed = g.seat_stake * g.seats;
      const totalPay = payouts.reduce((a, b) => a + b, 0);
      if (totalPay > escrowed) await transfer(db, HOUSE, ESCROW, totalPay - escrowed, 'payout', g.id, now);
      let paid = 0;
      for (const [i, s] of seats.entries()) {
        if (payouts[i] > 0) await transfer(db, ESCROW, s.user_id ? userAccount(s.user_id) : HOUSE, payouts[i], 'payout', g.id, now);
        paid += payouts[i];
        await db.prepare('UPDATE pvp_seats SET payout = ? WHERE game_id = ? AND seat = ?').run(payouts[i], g.id, s.seat);
      }
      const rest = escrowed - paid;
      if (rest > 0) await transfer(db, ESCROW, HOUSE, rest, 'payout', g.id, now);
      await db.prepare("UPDATE pvp_games SET status = 'settled', beacon_value = ?, result = ?, settled_at = ? WHERE id = ?").run(v.randomness, JSON.stringify(result), now, g.id);
      return true;
    });
    if (settled) n++;
  }
  return n;
}

export async function publicGame(db: DB, beacon: Beacon, id: string, viewerId: string | null = null) {
  const g = (await getGame(db, id)) ?? fail('not_found', 'Game not found.', 404);
  const seats = (await db.prepare('SELECT s.*, u.display_name AS name FROM pvp_seats s LEFT JOIN users u ON u.id = s.user_id WHERE s.game_id = ? ORDER BY s.seat').all(id)) as (SeatRow & { name: string | null })[];
  return {
    id: g.id, type: g.type, status: g.status, params: JSON.parse(g.params), seats: g.seats, seatStake: g.seat_stake / MF_PER_FRAG,
    players: seats.map((s) => ({ seat: s.seat, name: s.user_id ? s.name : 'Demo bot', bot: !s.user_id, you: viewerId !== null && s.user_id === viewerId, payout: s.payout / MF_PER_FRAG })),
    mine: viewerId !== null && g.creator_id === viewerId,
    result: g.result ? JSON.parse(g.result) : null, createdAt: g.created_at, lockedAt: g.locked_at, settledAt: g.settled_at,
    fairness: {
      serverSeedHash: g.server_hash, serverSeed: g.status === 'settled' ? g.server_seed : null, nonce: 0,
      beacon: { name: beacon.name, trustless: beacon.trustless, round: g.beacon_round, resolvesAt: g.beacon_round ? beacon.timeOf(g.beacon_round) : null, value: g.beacon_value, verifyUrl: g.beacon_round ? beacon.verifyUrl(g.beacon_round) : null },
    },
  };
}

export async function listGames(db: DB, beacon: Beacon, type: 'coinflip' | 'battle', since: number, viewerId: string | null = null) {
  const rows = (await db.prepare("SELECT id FROM pvp_games WHERE type = ? AND (status IN ('open', 'locked') OR settled_at >= ?) ORDER BY created_at DESC LIMIT 50").all(type, since)) as { id: string }[];
  const out = [];
  for (const r of rows) out.push(await publicGame(db, beacon, r.id, viewerId));
  return out;
}
