/**
 * PvP games: Münzwurf (coinflip) and Kisten-Battle.
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
import { checkBet } from './rg';
import { HOUSE, transfer, userAccount } from './wallet';

export const ESCROW = 'house:pvp-escrow';

interface GameRow {
  id: string; type: 'coinflip' | 'battle'; status: 'open' | 'locked' | 'settled' | 'cancelled'; creator_id: string; params: string;
  seats: number; seat_stake: number; server_seed: string; server_hash: string; beacon_round: number | null; beacon_value: string | null;
  result: string | null; created_at: number; locked_at: number | null; settled_at: number | null;
}
interface SeatRow { game_id: string; seat: number; user_id: string | null; stake: number; payout: number }

const getGame = (db: DB, id: string) => db.prepare('SELECT * FROM pvp_games WHERE id = ?').get(id) as unknown as GameRow | undefined;
const getSeats = (db: DB, id: string) => db.prepare('SELECT * FROM pvp_seats WHERE game_id = ? ORDER BY seat').all(id) as unknown as SeatRow[];
const rnd = (n: number) => new Uint8Array(randomBytes(n));

function takeSeat(db: DB, cfg: Config, game: GameRow, seat: number, userId: string | null, now: number) {
  if (userId) {
    checkBet(db, userId, game.seat_stake, now);
    transfer(db, userAccount(userId), ESCROW, game.seat_stake, 'stake', game.id, now);
  } else {
    if (!cfg.demo) fail('no_bots', 'Bots gibt es nur im Demo-Modus.', 403);
    transfer(db, HOUSE, ESCROW, game.seat_stake, 'stake', game.id, now);
  }
  db.prepare('INSERT INTO pvp_seats (game_id, seat, user_id, stake, created_at) VALUES (?, ?, ?, ?, ?)').run(game.id, seat, userId, game.seat_stake, now);
}

export function createCoinflip(db: DB, cfg: Config, userId: string, stake: number, side: CoinSide, now: number) {
  if (side !== 'rust' && side !== 'scrap') fail('invalid_params', 'Seite: rust oder scrap.');
  if (!Number.isSafeInteger(stake) || stake < cfg.minStake || stake > cfg.maxStake) fail('invalid_stake', `Einsatz: ${cfg.minStake / MF_PER_FRAG} bis ${cfg.maxStake / MF_PER_FRAG} Frags.`);
  if (stake * 2 * (1 - EDGE.coinflip) > cfg.maxWin) fail('max_win', 'Einsatz überschreitet den Maximalgewinn.');
  return create(db, cfg, userId, 'coinflip', { side }, 2, stake, now);
}

export function createBattle(db: DB, cfg: Config, userId: string, caseIds: string[], seats: number, mode: BattleMode, now: number) {
  if (!Array.isArray(caseIds) || caseIds.length < 1 || caseIds.length > 10) fail('invalid_params', '1 bis 10 Kisten.');
  if (![2, 3, 4].includes(seats)) fail('invalid_params', '2, 3 oder 4 Plätze.');
  if (!['normal', 'crazy', 'terminal'].includes(mode)) fail('invalid_params', 'Modus: normal, crazy oder terminal.');
  const cases = caseIds.map((id) => SAMPLE_CASES.find((c) => c.id === id) ?? fail('invalid_params', `Unbekannte Kiste: ${id}`));
  const cost = cases.reduce((s, c) => s + priceCase(c), 0) * MF_PER_FRAG;
  const bestPool = cases.reduce((s, c) => s + Math.max(...c.items.map((i) => i.value)), 0) * MF_PER_FRAG * seats;
  if (bestPool > cfg.maxWin) fail('max_win', 'Diese Battle könnte den Maximalgewinn überschreiten. Weniger oder günstigere Kisten wählen.');
  if (cost > cfg.maxStake) fail('invalid_stake', 'Battle ist zu teuer.');
  return create(db, cfg, userId, 'battle', { caseIds, mode }, seats, cost, now);
}

function create(db: DB, cfg: Config, userId: string, type: GameRow['type'], params: object, seats: number, seatStake: number, now: number) {
  return tx(db, () => {
    const open = db.prepare("SELECT COUNT(*) AS n FROM pvp_games WHERE creator_id = ? AND status = 'open'").get(userId) as { n: number };
    if (open.n >= 5) fail('too_many_open', 'Höchstens 5 offene Spiele gleichzeitig.', 429);
    const id = randomBytes(8).toString('hex');
    const { seed, hash } = newServerSeed(rnd);
    db.prepare("INSERT INTO pvp_games (id, type, status, creator_id, params, seats, seat_stake, server_seed, server_hash, created_at) VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)")
      .run(id, type, userId, JSON.stringify(params), seats, seatStake, seed, hash, now);
    takeSeat(db, cfg, getGame(db, id)!, 0, userId, now);
    audit(db, userId, 'pvp_create', { id, type, seats, seatStake }, now);
    return id;
  });
}

/** Joins the next free seat (userId = null → demo bot). Locks the game when full. */
export function joinGame(db: DB, cfg: Config, beacon: Beacon, gameId: string, userId: string | null, now: number) {
  return tx(db, () => {
    const g = getGame(db, gameId) ?? fail('not_found', 'Spiel nicht gefunden.', 404);
    if (g.status !== 'open') fail('not_open', 'Das Spiel ist nicht mehr offen.', 409);
    const seats = getSeats(db, gameId);
    if (userId && seats.some((s) => s.user_id === userId)) fail('already_seated', 'Du sitzt schon in diesem Spiel.', 409);
    if (!userId && g.type === 'coinflip' && seats.length !== 1) fail('invalid_action', 'Bot kann nur als Gegner beitreten.');
    takeSeat(db, cfg, g, seats.length, userId, now);
    if (seats.length + 1 === g.seats) {
      const round = beacon.roundAt(now) + 2;
      db.prepare("UPDATE pvp_games SET status = 'locked', locked_at = ?, beacon_round = ? WHERE id = ?").run(now, round, gameId);
    }
    return gameId;
  });
}

export function cancelGame(db: DB, gameId: string, userId: string, now: number) {
  return tx(db, () => {
    const g = getGame(db, gameId) ?? fail('not_found', 'Spiel nicht gefunden.', 404);
    if (g.creator_id !== userId) fail('forbidden', 'Nur der Ersteller kann abbrechen.', 403);
    if (g.status !== 'open') fail('not_open', 'Nur offene Spiele lassen sich abbrechen.', 409);
    for (const s of getSeats(db, gameId)) transfer(db, ESCROW, s.user_id ? userAccount(s.user_id) : HOUSE, s.stake, 'refund', gameId, now);
    db.prepare("UPDATE pvp_games SET status = 'cancelled', settled_at = ? WHERE id = ?").run(now, gameId);
    return gameId;
  });
}

/** Settles every locked game whose beacon round is available. Call from a ticker and before reads. */
export async function settleDue(db: DB, beacon: Beacon, now: number): Promise<number> {
  const due = db.prepare("SELECT id, beacon_round FROM pvp_games WHERE status = 'locked'").all() as { id: string; beacon_round: number }[];
  let n = 0;
  for (const d of due) {
    const v = await beacon.get(d.beacon_round, now);
    if (!v) continue;
    tx(db, () => {
      const g = getGame(db, d.id)!;
      if (g.status !== 'locked') return;
      const seats = getSeats(db, g.id);
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
      if (totalPay > escrowed) transfer(db, HOUSE, ESCROW, totalPay - escrowed, 'payout', g.id, now);
      let paid = 0;
      seats.forEach((s, i) => {
        if (payouts[i] > 0) transfer(db, ESCROW, s.user_id ? userAccount(s.user_id) : HOUSE, payouts[i], 'payout', g.id, now);
        paid += payouts[i];
        db.prepare('UPDATE pvp_seats SET payout = ? WHERE game_id = ? AND seat = ?').run(payouts[i], g.id, s.seat);
      });
      const rest = escrowed - paid;
      if (rest > 0) transfer(db, ESCROW, HOUSE, rest, 'payout', g.id, now);
      db.prepare("UPDATE pvp_games SET status = 'settled', beacon_value = ?, result = ?, settled_at = ? WHERE id = ?").run(v.randomness, JSON.stringify(result), now, g.id);
      n++;
    });
  }
  return n;
}

export function publicGame(db: DB, beacon: Beacon, id: string, viewerId: string | null = null) {
  const g = getGame(db, id) ?? fail('not_found', 'Spiel nicht gefunden.', 404);
  const seats = getSeats(db, id);
  const names = new Map<string, string>();
  for (const s of seats) if (s.user_id && !names.has(s.user_id)) names.set(s.user_id, (db.prepare('SELECT display_name AS n FROM users WHERE id = ?').get(s.user_id) as { n: string }).n);
  return {
    id: g.id, type: g.type, status: g.status, params: JSON.parse(g.params), seats: g.seats, seatStake: g.seat_stake / MF_PER_FRAG,
    players: seats.map((s) => ({ seat: s.seat, name: s.user_id ? names.get(s.user_id) : 'Demo-Bot', bot: !s.user_id, you: viewerId !== null && s.user_id === viewerId, payout: s.payout / MF_PER_FRAG })),
    mine: viewerId !== null && g.creator_id === viewerId,
    result: g.result ? JSON.parse(g.result) : null, createdAt: g.created_at, lockedAt: g.locked_at, settledAt: g.settled_at,
    fairness: {
      serverSeedHash: g.server_hash, serverSeed: g.status === 'settled' ? g.server_seed : null, nonce: 0,
      beacon: { name: beacon.name, trustless: beacon.trustless, round: g.beacon_round, resolvesAt: g.beacon_round ? beacon.timeOf(g.beacon_round) : null, value: g.beacon_value, verifyUrl: g.beacon_round ? beacon.verifyUrl(g.beacon_round) : null },
    },
  };
}

export function listGames(db: DB, beacon: Beacon, type: 'coinflip' | 'battle', since: number, viewerId: string | null = null) {
  const rows = db.prepare("SELECT id FROM pvp_games WHERE type = ? AND (status IN ('open', 'locked') OR settled_at >= ?) ORDER BY created_at DESC LIMIT 50").all(type, since) as { id: string }[];
  return rows.map((r) => publicGame(db, beacon, r.id, viewerId));
}
