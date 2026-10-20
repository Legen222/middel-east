/**
 * Stateful originals added in phase 11: Monument Run (towers), Hi-Lo and Blackjack.
 * Same pattern as Minefield and Raid in bets.ts: the stake and the nonce are taken when the round opens,
 * so every card, trap and draw is fixed by seed + nonce from that moment. The server keeps hidden state
 * (trap doors, the dealer's hole card) in bets.state and never sends it before the round is settled.
 * Each step replays the bet's stream past the floats already used (resumeStream).
 *
 * Blackjack doubles and splits take a second stake inside the same transaction, with the same RG and
 * balance checks as any bet; bets.stake grows to the total wagered.
 */

import {
  TOWER_LEVELS, TOWER_ROOMS, bjActions, bjAct, bjDeal, bjSettle, cardValue, drawCard, handTotal, hiloChance,
  hiloMultiplier, hiloWins, HILO_MAX_SKIPS, layTraps, towersMultiplier, towerSafeChance,
  type BjAction, type BjState, type Card, type HiloGuess, type TowerLevel,
} from '../../engine/src/index';
import {
  type BetRow, assertNoOpen, openGames, checkMaxWin, checkStake, getBet, open, openBet, publicBet, resumeStream, seedById, settle, stream,
} from './bets';
import { type Config, MF_PER_FRAG } from './config';
import { type DB, tx } from './db';
import { fail } from './errors';
import { assertGameEnabled, gameConfig } from './flags';
import { checkBet } from './rg';
import { HOUSE, transfer, userAccount } from './wallet';

const json = <T>(s: string | null) => JSON.parse(s ?? 'null') as T;
const saveState = (db: DB, id: string, state: unknown) => db.prepare('UPDATE bets SET state = ? WHERE id = ?').run(JSON.stringify(state), id);

/* ---------- Monument Run ---------- */

interface TowersState { traps: number[][]; picks: number[] }

export function towersStart(db: DB, cfgIn: Config, userId: string, stake: number, level: TowerLevel, now: number) {
  return tx(db, async (db) => {
    const cfg = await gameConfig(db, cfgIn, 'towers');
    if (!(level in TOWER_LEVELS)) fail('invalid_params', 'Keycard: green, blue, red or black.');
    await assertNoOpen(db, userId, 'towers');
    checkStake(cfg, stake);
    checkMaxWin(cfg, stake, towersMultiplier(level, 1));
    const { bet, seed, nonce } = await open(db, userId, 'towers', stake, { level }, now);
    await saveState(db, bet, { traps: layTraps(stream(seed, nonce), level), picks: [] } satisfies TowersState);
    return publicTowers((await getBet(db, bet))!, db);
  });
}

export function towersPick(db: DB, cfgIn: Config, userId: string, betId: string, door: number, now: number) {
  return tx(db, async (db) => {
    const cfg = await gameConfig(db, cfgIn, 'towers');
    const b = await openBet(db, userId, betId, 'towers');
    await assertGameEnabled(db, 'towers');
    const level = json<{ level: TowerLevel }>(b.params).level;
    const s = json<TowersState>(b.state);
    const room = s.picks.length;
    if (!Number.isInteger(door) || door < 0 || door >= TOWER_LEVELS[level].doors) fail('invalid_params', 'Invalid door.');
    if (b.stake * towersMultiplier(level, room + 1) > cfg.maxWin) fail('max_win', 'The next room could exceed the max win. Please cash out.', 400);
    s.picks.push(door);
    if (s.traps[room].includes(door)) return publicTowers(await settle(db, b.id, userId, b.stake, 0, { traps: s.traps, picks: s.picks, trapAt: room }, now), db);
    if (s.picks.length === TOWER_ROOMS) return publicTowers(await settle(db, b.id, userId, b.stake, towersMultiplier(level, TOWER_ROOMS), { traps: s.traps, picks: s.picks }, now), db);
    await saveState(db, b.id, s);
    return publicTowers((await getBet(db, b.id))!, db);
  });
}

export function towersCashout(db: DB, userId: string, betId: string, now: number) {
  return tx(db, async (db) => {
    const b = await openBet(db, userId, betId, 'towers');
    const s = json<TowersState>(b.state);
    if (s.picks.length === 0) fail('invalid_action', 'Clear at least one room first.');
    const level = json<{ level: TowerLevel }>(b.params).level;
    return publicTowers(await settle(db, b.id, userId, b.stake, towersMultiplier(level, s.picks.length), { traps: s.traps, picks: s.picks }, now), db);
  });
}

export async function publicTowers(b: BetRow, db: DB) {
  const level = json<{ level: TowerLevel }>(b.params).level;
  const base = { ...(await publicBet(b, db)), level, doors: TOWER_LEVELS[level].doors, rooms: TOWER_ROOMS, safeChance: towerSafeChance(level) };
  if (b.status === 'settled') return base;
  const s = json<TowersState>(b.state); // traps stay on the server while the run is open
  return { ...base, picks: s.picks, currentMultiplier: towersMultiplier(level, s.picks.length), nextMultiplier: towersMultiplier(level, s.picks.length + 1) };
}

/* ---------- Hi-Lo ---------- */

interface HiloState { cards: Card[]; moves: ('hi' | 'lo' | 'skip')[]; chances: number[]; skips: number; used: number }

export function hiloStart(db: DB, cfgIn: Config, userId: string, stake: number, now: number) {
  return tx(db, async (db) => {
    const cfg = await gameConfig(db, cfgIn, 'hilo');
    await assertNoOpen(db, userId, 'hilo');
    checkStake(cfg, stake);
    checkMaxWin(cfg, stake, hiloMultiplier([12 / 13])); // the safest first guess
    const { bet, seed, nonce } = await open(db, userId, 'hilo', stake, {}, now);
    const first = drawCard(stream(seed, nonce));
    await saveState(db, bet, { cards: [first], moves: [], chances: [], skips: 0, used: 1 } satisfies HiloState);
    return publicHilo((await getBet(db, bet))!, db);
  });
}

export function hiloMove(db: DB, cfgIn: Config, userId: string, betId: string, move: HiloGuess | 'skip', now: number) {
  return tx(db, async (db) => {
    const cfg = await gameConfig(db, cfgIn, 'hilo');
    const b = await openBet(db, userId, betId, 'hilo');
    await assertGameEnabled(db, 'hilo');
    if (move !== 'hi' && move !== 'lo' && move !== 'skip') fail('invalid_params', 'Move: hi, lo or skip.');
    const s = json<HiloState>(b.state);
    const current = s.cards[s.cards.length - 1].rank;
    if (move === 'skip') {
      if (s.skips >= HILO_MAX_SKIPS) fail('invalid_action', `At most ${HILO_MAX_SKIPS} skips per round.`);
    } else {
      const p = hiloChance(current, move);
      if (p >= 1) fail('invalid_action', move === 'hi' ? 'Every card is higher or the same as an ace. Guess lo or skip.' : 'Every card is lower or the same as a king. Guess hi or skip.');
      if (b.stake * hiloMultiplier([...s.chances, p]) > cfg.maxWin) fail('max_win', 'This guess could exceed the max win. Please cash out.', 400);
    }
    const seed = await seedById(db, b.seed_id);
    const next = drawCard(resumeStream(seed, b.nonce, s.used));
    s.used++;
    s.cards.push(next);
    s.moves.push(move);
    if (move === 'skip') {
      s.skips++;
    } else {
      if (!hiloWins(current, next.rank, move)) {
        return publicHilo(await settle(db, b.id, userId, b.stake, 0, { cards: s.cards, moves: s.moves, chances: s.chances }, now), db);
      }
      s.chances.push(hiloChance(current, move));
    }
    await saveState(db, b.id, s);
    return publicHilo((await getBet(db, b.id))!, db);
  });
}

export function hiloCashout(db: DB, userId: string, betId: string, now: number) {
  return tx(db, async (db) => {
    const b = await openBet(db, userId, betId, 'hilo');
    const s = json<HiloState>(b.state);
    if (s.chances.length === 0) fail('invalid_action', 'Make at least one correct guess first.');
    return publicHilo(await settle(db, b.id, userId, b.stake, hiloMultiplier(s.chances), { cards: s.cards, moves: s.moves, chances: s.chances }, now), db);
  });
}

export async function publicHilo(b: BetRow, db: DB) {
  const base = await publicBet(b, db);
  if (b.status === 'settled') return base;
  const s = json<HiloState>(b.state); // every card in the state is already public; future cards are not drawn yet
  const card = s.cards[s.cards.length - 1].rank;
  const option = (g: HiloGuess) => {
    const p = hiloChance(card, g);
    return p >= 1 ? null : { chance: p, multiplier: hiloMultiplier([...s.chances, p]) };
  };
  return { ...base, cards: s.cards, moves: s.moves, skips: s.skips, currentMultiplier: hiloMultiplier(s.chances), guesses: s.chances.length, hi: option('hi'), lo: option('lo') };
}

/* ---------- Blackjack ---------- */

export const BJ_MAX_UNITS = 4; // a split with two winning hands, or a winning double: 4 × the base stake
/** The engine state plus the player's actions in order: deal + actions replays the hand exactly. */
type BjRound = BjState & { actions?: BjAction[] };

export function bjStart(db: DB, cfgIn: Config, userId: string, stake: number, now: number) {
  return tx(db, async (db) => {
    const cfg = await gameConfig(db, cfgIn, 'blackjack');
    await assertNoOpen(db, userId, 'blackjack');
    checkStake(cfg, stake);
    checkMaxWin(cfg, stake, BJ_MAX_UNITS);
    const { bet, seed, nonce } = await open(db, userId, 'blackjack', stake, {}, now);
    const state = bjDeal(stream(seed, nonce));
    if (state.finished) return publicBj(await settleBj(db, bet, userId, stake, state, now), db);
    await saveState(db, bet, state);
    return publicBj((await getBet(db, bet))!, db);
  });
}

export function bjAction(db: DB, userId: string, betId: string, action: BjAction, now: number) {
  return tx(db, async (db) => {
    const b = await openBet(db, userId, betId, 'blackjack');
    await assertGameEnabled(db, 'blackjack');
    const state = json<BjRound>(b.state);
    if (!bjActions(state).includes(action)) fail('invalid_action', `You cannot ${action} now.`);
    const base = json<{ base?: number }>(b.params)?.base ?? b.stake;
    let total = b.stake;
    if (action === 'double' || action === 'split') {
      // the second stake is a bet of its own: same RG limits, same balance check, booked to the ledger
      await checkBet(db, userId, base, now);
      await transfer(db, userAccount(userId), HOUSE, base, 'stake', b.id, now);
      total += base;
      await db.prepare('UPDATE bets SET stake = ?, params = ? WHERE id = ?').run(total, JSON.stringify({ base }), b.id);
    }
    const seed = await seedById(db, b.seed_id);
    const next: BjRound = { ...bjAct(resumeStream(seed, b.nonce, state.drawn), state, action), actions: [...(state.actions ?? []), action] };
    if (next.finished) return publicBj(await settleBj(db, b.id, userId, base, next, now), db);
    await saveState(db, b.id, next);
    return publicBj((await getBet(db, b.id))!, db);
  });
}

async function settleBj(db: DB, betId: string, userId: string, base: number, state: BjRound, now: number): Promise<BetRow> {
  const r = bjSettle(state);
  const totalStake = base * r.stake;
  await db.prepare('UPDATE bets SET stake = ?, params = ? WHERE id = ?').run(totalStake, JSON.stringify({ base }), betId);
  // settle() floors stake × multiplier; multiplier = payout units / stake units keeps that exact
  return settle(db, betId, userId, totalStake, r.payout / r.stake, { hands: state.hands, dealer: state.dealer, dealerBlackjack: state.dealerBlackjack, results: r.hands, actions: state.actions ?? [] }, now);
}

export async function publicBj(b: BetRow, db: DB) {
  const base = await publicBet(b, db);
  if (b.status === 'settled') return base;
  const s = json<BjState>(b.state);
  return {
    ...base,
    hands: s.hands.map((h) => ({ cards: h.cards, total: handTotal(h.cards).total, soft: handTotal(h.cards).soft, doubled: h.doubled, done: h.done })),
    dealer: { up: s.dealer[0], upValue: cardValue(s.dealer[0]) }, // the hole card stays on the server
    active: s.active, actions: bjActions(s), baseStake: (json<{ base?: number }>(b.params)?.base ?? b.stake) / MF_PER_FRAG,
  };
}

/** Open rounds of a player for page reloads, including the hidden-state games above. */
export async function openRounds(db: DB, userId: string) {
  const out = [];
  for (const g of await openGames(db, userId)) {
    if (g.game !== 'towers' && g.game !== 'hilo' && g.game !== 'blackjack') { out.push(g); continue; }
    const b = (await getBet(db, g.id))!;
    out.push(g.game === 'towers' ? await publicTowers(b, db) : g.game === 'hilo' ? await publicHilo(b, db) : await publicBj(b, db));
  }
  return out;
}
