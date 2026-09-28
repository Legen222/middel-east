/**
 * Bet service. One IMMEDIATE transaction per action:
 *   geo/age/RG checks → max-win check → debit stake → reserve nonce → resolve with the engine
 *   → credit floor(stake × multiplier) → write bet row.
 *
 * Instant games: dice, plinko, upgrader, cases.
 * Stateful games (one open round per player): mines and raid. The mine layout / raid floats come from the
 * nonce reserved at start, so the outcome is fixed the moment the stake is taken. Each later step replays
 * the same FairStream, which is why the seed cannot rotate while such a round is open.
 *
 * Max win: a bet whose *best possible* payout exceeds cfg.maxWin is refused up front. Mines and raid
 * instead refuse the next step once it could exceed the cap; cashing out at the current value keeps the
 * RTP exact, while a clamped payout would not.
 */

import { randomBytes } from 'node:crypto';

import {
  FairStream, PLINKO_TABLES, RAID_LAYERS, RAID_TOOLS, SAMPLE_CASES, TILES, caseEv, diceMultiplier, layMines,
  minesMultiplier, openCase, playDice, playPlinko, playUpgrader, priceCase, raidMultiplier,
  upgraderChance, validateDice, type DiceBet, type PlinkoRisk, type PlinkoRows, type RaidTool,
} from '../../engine/src/index';
import { type Config, MF_PER_FRAG } from './config';
import { type DB, tx } from './db';
import { fail } from './errors';
import { checkBet } from './rg';
import { activeSeed, takeNonce, type SeedRow } from './seeds';
import { HOUSE, balanceOf, transfer, userAccount } from './wallet';

export type Game = 'dice' | 'plinko' | 'upgrader' | 'cases' | 'mines' | 'raid';
export const GAMES: Game[] = ['dice', 'plinko', 'upgrader', 'cases', 'mines', 'raid'];

export interface BetRow {
  id: string; user_id: string; game: Game; status: 'open' | 'settled'; stake: number; payout: number; multiplier: number;
  seed_id: string; nonce: number; params: string; state: string | null; result: string | null; created_at: number; settled_at: number | null;
}

const newBetId = () => randomBytes(10).toString('hex');
const payoutFor = (stake: number, mult: number) => Math.floor(stake * mult + 1e-9);

function checkStake(cfg: Config, stake: number): void {
  if (!Number.isSafeInteger(stake) || stake < cfg.minStake || stake > cfg.maxStake) {
    fail('invalid_stake', `Einsatz: ${cfg.minStake / MF_PER_FRAG} bis ${cfg.maxStake / MF_PER_FRAG} Frags.`, 400, { min: cfg.minStake, max: cfg.maxStake });
  }
}
function checkMaxWin(cfg: Config, stake: number, maxMult: number): void {
  if (stake * maxMult > cfg.maxWin) {
    fail('max_win', `Maximalgewinn pro Wette ist ${cfg.maxWin / MF_PER_FRAG} Frags. Höchster Einsatz hier: ${Math.floor(cfg.maxWin / maxMult / MF_PER_FRAG)} Frags.`, 400, { maxWin: cfg.maxWin, maxStake: Math.floor(cfg.maxWin / maxMult) });
  }
}

function open(db: DB, userId: string, game: Game, stake: number, params: unknown, now: number): { bet: string; seed: SeedRow; nonce: number } {
  checkBet(db, userId, stake, now);
  const id = newBetId();
  transfer(db, userAccount(userId), HOUSE, stake, 'stake', id, now);
  const { seed, nonce } = takeNonce(db, userId);
  db.prepare("INSERT INTO bets (id, user_id, game, status, stake, seed_id, nonce, params, created_at) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?)")
    .run(id, userId, game, stake, seed.id, nonce, JSON.stringify(params), now);
  return { bet: id, seed, nonce };
}

function settle(db: DB, betId: string, userId: string, stake: number, mult: number, result: unknown, now: number): BetRow {
  const payout = payoutFor(stake, mult);
  if (payout > 0) transfer(db, HOUSE, userAccount(userId), payout, 'payout', betId, now);
  db.prepare("UPDATE bets SET status = 'settled', payout = ?, multiplier = ?, result = ?, state = NULL, settled_at = ? WHERE id = ?")
    .run(payout, mult, JSON.stringify(result), now, betId);
  return getBet(db, betId)!;
}

export const getBet = (db: DB, id: string): BetRow | undefined => db.prepare('SELECT * FROM bets WHERE id = ?').get(id) as unknown as BetRow | undefined;
const stream = (seed: SeedRow, nonce: number) => new FairStream(seed.server_seed, seed.client_seed, nonce);
const seedById = (db: DB, id: string) => db.prepare('SELECT * FROM seeds WHERE id = ?').get(id) as unknown as SeedRow;

/* ---------- instant games ---------- */

export interface InstantParams {
  dice: DiceBet;
  plinko: { rows: PlinkoRows; risk: PlinkoRisk };
  upgrader: { multiplier: number }; // target value / stake, e.g. 2 = double
  cases: { caseId: string };
}

export function playInstant<G extends keyof InstantParams>(db: DB, cfg: Config, userId: string, game: G, stakeIn: number, params: InstantParams[G], now: number): BetRow {
  return tx(db, () => {
    let stake = stakeIn;
    let maxMult: number;
    switch (game) {
      case 'dice': { const p = params as DiceBet; validateDice(p); maxMult = diceMultiplier(p.chance); break; }
      case 'plinko': { const p = params as InstantParams['plinko']; const t = PLINKO_TABLES[p.rows]?.[p.risk]; if (!t) fail('invalid_params', 'Unbekannte Plinko-Tabelle.'); maxMult = Math.max(...t); break; }
      case 'upgrader': { const p = params as InstantParams['upgrader']; upgraderChance(1, p.multiplier); maxMult = p.multiplier; break; }
      case 'cases': {
        const c = SAMPLE_CASES.find((x) => x.id === (params as InstantParams['cases']).caseId) ?? fail('invalid_params', 'Unbekannte Kiste.');
        stake = priceCase(c) * MF_PER_FRAG; // price is fixed, the client's stake is ignored
        maxMult = Math.max(...c.items.map((i) => i.value)) * MF_PER_FRAG / stake;
        break;
      }
      default: return fail('invalid_game', 'Unbekanntes Spiel.');
    }
    checkStake(cfg, stake);
    checkMaxWin(cfg, stake, maxMult);
    const { bet, seed, nonce } = open(db, userId, game, stake, params, now);
    const src = stream(seed, nonce);
    switch (game) {
      case 'dice': { const o = playDice(src, params as DiceBet); return settle(db, bet, userId, stake, o.multiplier, o, now); }
      case 'plinko': { const p = params as InstantParams['plinko']; const o = playPlinko(src, p.rows, p.risk); return settle(db, bet, userId, stake, o.multiplier, o, now); }
      case 'upgrader': { const o = playUpgrader(src, 1, (params as InstantParams['upgrader']).multiplier); return settle(db, bet, userId, stake, o.win ? o.value : 0, o, now); }
      default: {
        const c = SAMPLE_CASES.find((x) => x.id === (params as InstantParams['cases']).caseId)!;
        const o = openCase(src, c);
        return settle(db, bet, userId, stake, (o.item.value * MF_PER_FRAG) / stake, { ticket: o.ticket, item: o.item, ev: caseEv(c) }, now);
      }
    }
  });
}

/* ---------- mines ---------- */

interface MinesState { mines: number[]; revealed: number[] }

export function minesStart(db: DB, cfg: Config, userId: string, stake: number, mineCount: number, now: number) {
  return tx(db, () => {
    if (!Number.isInteger(mineCount) || mineCount < 1 || mineCount > 24) fail('invalid_params', 'Minen: 1 bis 24.');
    assertNoOpen(db, userId, 'mines');
    checkStake(cfg, stake);
    checkMaxWin(cfg, stake, minesMultiplier(mineCount, 1));
    const { bet, seed, nonce } = open(db, userId, 'mines', stake, { mines: mineCount }, now);
    const state: MinesState = { mines: layMines(stream(seed, nonce), mineCount), revealed: [] };
    db.prepare('UPDATE bets SET state = ? WHERE id = ?').run(JSON.stringify(state), bet);
    return publicMines(getBet(db, bet)!, db);
  });
}

export function minesReveal(db: DB, cfg: Config, userId: string, betId: string, tile: number, now: number) {
  return tx(db, () => {
    const b = openBet(db, userId, betId, 'mines');
    const s = JSON.parse(b.state!) as MinesState;
    const m = JSON.parse(b.params).mines as number;
    if (!Number.isInteger(tile) || tile < 0 || tile >= TILES || s.revealed.includes(tile)) fail('invalid_params', 'Ungültiges Feld.');
    if (b.stake * minesMultiplier(m, s.revealed.length + 1) > cfg.maxWin) fail('max_win', 'Das nächste Feld würde den Maximalgewinn überschreiten. Bitte auszahlen.', 400);
    if (s.mines.includes(tile)) return publicMines(settle(db, b.id, userId, b.stake, 0, { mines: s.mines, revealed: s.revealed, hit: tile }, now), db);
    s.revealed.push(tile);
    if (s.revealed.length === TILES - m) return publicMines(settle(db, b.id, userId, b.stake, minesMultiplier(m, s.revealed.length), { mines: s.mines, revealed: s.revealed }, now), db);
    db.prepare('UPDATE bets SET state = ? WHERE id = ?').run(JSON.stringify(s), b.id);
    return publicMines(getBet(db, b.id)!, db);
  });
}

export function minesCashout(db: DB, userId: string, betId: string, now: number) {
  return tx(db, () => {
    const b = openBet(db, userId, betId, 'mines');
    const s = JSON.parse(b.state!) as MinesState;
    if (s.revealed.length === 0) fail('invalid_action', 'Decke mindestens ein Feld auf.');
    const m = JSON.parse(b.params).mines as number;
    return publicMines(settle(db, b.id, userId, b.stake, minesMultiplier(m, s.revealed.length), { mines: s.mines, revealed: s.revealed }, now), db);
  });
}

function publicMines(b: BetRow, db: DB) {
  const m = JSON.parse(b.params).mines as number;
  if (b.status === 'settled') return { ...publicBet(b, db), mines: m };
  const s = JSON.parse(b.state!) as MinesState; // never expose s.mines while open
  return { ...publicBet(b, db), mines: m, revealed: s.revealed, currentMultiplier: minesMultiplier(m, s.revealed.length), nextMultiplier: minesMultiplier(m, s.revealed.length + 1) };
}

/* ---------- raid ---------- */

interface RaidState { tools: RaidTool[] }

export function raidStart(db: DB, cfg: Config, userId: string, stake: number, now: number) {
  return tx(db, () => {
    assertNoOpen(db, userId, 'raid');
    checkStake(cfg, stake);
    checkMaxWin(cfg, stake, raidMultiplier(['satchel'])); // smallest first step that could be taken
    const { bet } = open(db, userId, 'raid', stake, {}, now);
    db.prepare('UPDATE bets SET state = ? WHERE id = ?').run(JSON.stringify({ tools: [] } satisfies RaidState), bet);
    return publicRaid(getBet(db, bet)!, db);
  });
}

export function raidBlast(db: DB, cfg: Config, userId: string, betId: string, tool: RaidTool, now: number) {
  return tx(db, () => {
    const b = openBet(db, userId, betId, 'raid');
    if (!(tool in RAID_TOOLS)) fail('invalid_params', 'Sprengstoff: c4, rocket oder satchel.');
    const s = JSON.parse(b.state!) as RaidState;
    const next = [...s.tools, tool];
    if (b.stake * raidMultiplier(next) > cfg.maxWin) fail('max_win', 'Diese Schicht würde den Maximalgewinn überschreiten. Bitte Loot sichern oder schwächeren Sprengstoff wählen.', 400);
    const src = stream(seedById(db, b.seed_id), b.nonce);
    for (let i = 0; i < s.tools.length; i++) src.next(); // replay floats already used
    const roll = src.next();
    const breached = roll < RAID_TOOLS[tool];
    const steps = next.map((t, i) => ({ layer: RAID_LAYERS[i], tool: t }));
    if (!breached) return publicRaid(settle(db, b.id, userId, b.stake, 0, { steps, heldAt: RAID_LAYERS[s.tools.length], roll }, now), db);
    if (next.length === RAID_LAYERS.length) return publicRaid(settle(db, b.id, userId, b.stake, raidMultiplier(next), { steps, roll }, now), db);
    db.prepare('UPDATE bets SET state = ? WHERE id = ?').run(JSON.stringify({ tools: next } satisfies RaidState), b.id);
    return publicRaid(getBet(db, b.id)!, db);
  });
}

export function raidCashout(db: DB, userId: string, betId: string, now: number) {
  return tx(db, () => {
    const b = openBet(db, userId, betId, 'raid');
    const s = JSON.parse(b.state!) as RaidState;
    if (s.tools.length === 0) fail('invalid_action', 'Sprenge mindestens eine Schicht.');
    return publicRaid(settle(db, b.id, userId, b.stake, raidMultiplier(s.tools), { steps: s.tools.map((t, i) => ({ layer: RAID_LAYERS[i], tool: t })) }, now), db);
  });
}

function publicRaid(b: BetRow, db: DB) {
  if (b.status === 'settled') return publicBet(b, db);
  const s = JSON.parse(b.state!) as RaidState;
  return { ...publicBet(b, db), layersBreached: s.tools.length, nextLayer: RAID_LAYERS[s.tools.length], currentMultiplier: raidMultiplier(s.tools) };
}

/* ---------- shared ---------- */

function assertNoOpen(db: DB, userId: string, game: Game): void {
  const r = db.prepare("SELECT id FROM bets WHERE user_id = ? AND game = ? AND status = 'open'").get(userId, game) as { id: string } | undefined;
  if (r) fail('open_game', 'Du hast schon eine laufende Runde.', 409, { betId: r.id });
}

function openBet(db: DB, userId: string, betId: string, game: Game): BetRow {
  const b = getBet(db, betId);
  if (!b || b.user_id !== userId || b.game !== game) fail('not_found', 'Runde nicht gefunden.', 404);
  if (b!.status !== 'open') fail('already_settled', 'Diese Runde ist schon abgerechnet.', 409);
  return b!;
}

/** What the player (and the verifier) sees. The server seed appears only after rotation. */
export function publicBet(b: BetRow, db?: DB) {
  const seed = db ? seedById(db, b.seed_id) : null;
  return {
    id: b.id, game: b.game, status: b.status, stake: b.stake, payout: b.payout, multiplier: b.multiplier,
    params: JSON.parse(b.params), result: b.result ? JSON.parse(b.result) : null, createdAt: b.created_at, settledAt: b.settled_at,
    fairness: seed ? { serverSeedHash: seed.server_hash, clientSeed: seed.client_seed, nonce: b.nonce, serverSeed: seed.revealed_at ? seed.server_seed : null } : { nonce: b.nonce },
  };
}

export function balance(db: DB, userId: string): number {
  return balanceOf(db, userAccount(userId));
}

export function activeSeedPublic(db: DB, userId: string) {
  const s = activeSeed(db, userId);
  return { serverSeedHash: s.server_hash, clientSeed: s.client_seed, nextNonce: s.nonce };
}

/** Live RTP per game over a window: the public "Fair-Ledger" statistic. */
export function liveRtp(db: DB, since: number) {
  const rows = db.prepare("SELECT game, COUNT(*) AS n, SUM(stake) AS staked, SUM(payout) AS paid FROM bets WHERE status = 'settled' AND settled_at >= ? GROUP BY game").all(since) as { game: Game; n: number; staked: number; paid: number }[];
  return rows.map((r) => ({ game: r.game, bets: r.n, wagered: r.staked, paid: r.paid, rtp: r.staked ? r.paid / r.staked : null }));
}
