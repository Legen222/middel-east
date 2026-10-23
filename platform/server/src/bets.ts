/**
 * Bet service. One transaction per action:
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
  FairStream, PLINKO_TABLES, RAID_LAYERS, RAID_TOOLS, TILES, caseEv, diceMultiplier, layMines,
  minesMultiplier, openCase, playAirdrop, playDice, playPlinko, playUpgrader, raidMultiplier, validateTarget,
  upgraderChance, validateDice, validateZone, type DiceBet, type PlinkoRisk, type PlinkoRows, type RaidTool,
} from '../../engine/src/index';
import { type Config, MF_PER_FRAG, fmtFrags } from './config';
import { type DB, PUBLIC_NAME, tx } from './db';
import { fail } from './errors';
import { systemMessage } from './chat';
import { type CaseVersion, playableCase } from './cases';
import { GAME_NAME, type GameId, assertGameEnabled, gameConfig } from './flags';
import { checkBet } from './rg';
import { activeSeed, takeNonce, type SeedRow } from './seeds';
import { HOUSE, balanceOf, transfer, userAccount } from './wallet';

export type Game = 'dice' | 'plinko' | 'upgrader' | 'cases' | 'mines' | 'raid' | 'airdrop' | 'towers' | 'hilo' | 'blackjack';
export const GAMES: Game[] = ['dice', 'plinko', 'upgrader', 'cases', 'mines', 'raid', 'airdrop', 'towers', 'hilo', 'blackjack'];

export interface BetRow {
  id: string; user_id: string; game: Game; status: 'open' | 'settled'; stake: number; payout: number; multiplier: number;
  seed_id: string; nonce: number; params: string; state: string | null; result: string | null; created_at: number; settled_at: number | null;
}

const newBetId = () => randomBytes(10).toString('hex');
const payoutFor = (stake: number, mult: number) => Math.floor(stake * mult + 1e-9);

export function checkStake(cfg: Config, stake: number): void {
  if (!Number.isSafeInteger(stake) || stake < cfg.minStake || stake > cfg.maxStake) {
    fail('invalid_stake', `Stake: ${cfg.minStake / MF_PER_FRAG} to ${cfg.maxStake / MF_PER_FRAG} Scrap.`, 400, { min: cfg.minStake, max: cfg.maxStake });
  }
}
export function checkMaxWin(cfg: Config, stake: number, maxMult: number): void {
  if (stake * maxMult > cfg.maxWin) {
    fail('max_win', `Max win per bet is ${cfg.maxWin / MF_PER_FRAG} Scrap. Highest stake here: ${Math.floor(cfg.maxWin / maxMult / MF_PER_FRAG)} Scrap.`, 400, { maxWin: cfg.maxWin, maxStake: Math.floor(cfg.maxWin / maxMult) });
  }
}

export async function open(db: DB, userId: string, game: Game, stake: number, params: unknown, now: number): Promise<{ bet: string; seed: SeedRow; nonce: number }> {
  await assertGameEnabled(db, game);
  await checkBet(db, userId, stake, now);
  const id = newBetId();
  await transfer(db, userAccount(userId), HOUSE, stake, 'stake', id, now);
  const { seed, nonce } = await takeNonce(db, userId);
  await db.prepare("INSERT INTO bets (id, user_id, game, status, stake, seed_id, nonce, params, created_at) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?)")
    .run(id, userId, game, stake, seed.id, nonce, JSON.stringify(params), now);
  return { bet: id, seed, nonce };
}

/** Wins announced in chat: at least 10× and 100 Scrap. */
export const BIG_WIN = { minMultiple: 10, minPayout: 100 * MF_PER_FRAG };

export async function settle(db: DB, betId: string, userId: string, stake: number, mult: number, result: unknown, now: number): Promise<BetRow> {
  const payout = payoutFor(stake, mult);
  if (payout > 0) await transfer(db, HOUSE, userAccount(userId), payout, 'payout', betId, now);
  await db.prepare("UPDATE bets SET status = 'settled', payout = ?, multiplier = ?, result = ?, state = NULL, settled_at = ? WHERE id = ?")
    .run(payout, mult, JSON.stringify(result), now, betId);
  if (payout >= BIG_WIN.minPayout && payout >= stake * BIG_WIN.minMultiple) {
    const b = (await db.prepare(`SELECT ${PUBLIC_NAME} AS name, b.game FROM bets b JOIN users u ON u.id = b.user_id WHERE b.id = ?`).get(betId)) as { name: string; game: GameId };
    await systemMessage(db, 'win', `${b.name} hit ${+(payout / stake).toFixed(2)}× on ${GAME_NAME[b.game] ?? b.game}: +${fmtFrags(payout)} Scrap`, now);
  }
  return (await getBet(db, betId))!;
}

export const getBet = async (db: DB, id: string): Promise<BetRow | undefined> => (await db.prepare('SELECT * FROM bets WHERE id = ?').get(id)) as BetRow | undefined;
export const stream = (seed: SeedRow, nonce: number) => new FairStream(seed.server_seed, seed.client_seed, nonce);
/** The bet's stream advanced past the floats it has already used. */
export function resumeStream(seed: SeedRow, nonce: number, used: number): FairStream {
  const s = stream(seed, nonce);
  for (let i = 0; i < used; i++) s.next();
  return s;
}
export const seedById = async (db: DB, id: string) => (await db.prepare('SELECT * FROM seeds WHERE id = ?').get(id)) as SeedRow;

/* ---------- instant games ---------- */

export interface InstantParams {
  dice: DiceBet;
  plinko: { rows: PlinkoRows; risk: PlinkoRisk };
  upgrader: { multiplier: number; zone?: number }; // target value / stake (2 = double); zone = where the win arc starts, 0–9999
  cases: { caseId: string; version?: number }; // version is set by the server
  airdrop: { target: number };
}

export function playInstant<G extends keyof InstantParams>(db: DB, cfgIn: Config, userId: string, game: G, stakeIn: number, paramsIn: InstantParams[G], now: number): Promise<BetRow> {
  return tx(db, async (db) => {
    const cfg = await gameConfig(db, cfgIn, game);
    let stake = stakeIn;
    let params = paramsIn;
    let maxMult: number;
    let box: CaseVersion | null = null;
    switch (game) {
      case 'dice': { const p = params as DiceBet; validateDice(p); maxMult = diceMultiplier(p.chance); break; }
      case 'plinko': { const p = params as InstantParams['plinko']; const t = PLINKO_TABLES[p.rows]?.[p.risk]; if (!t) fail('invalid_params', 'Unknown Scrap Chute table.'); maxMult = Math.max(...t); break; }
      case 'upgrader': {
        const p = params as InstantParams['upgrader'];
        upgraderChance(1, p.multiplier);
        validateZone(p.zone ?? 0);
        params = { multiplier: p.multiplier, zone: p.zone ?? 0 } as InstantParams[G];
        maxMult = p.multiplier;
        break;
      }
      case 'airdrop': { const p = params as InstantParams['airdrop']; validateTarget(p.target); maxMult = p.target; break; }
      case 'cases': {
        box = await playableCase(db, (params as InstantParams['cases']).caseId);
        params = { caseId: box.id, version: box.version } as InstantParams[G]; // the bet records the exact item list it used
        stake = box.price * MF_PER_FRAG; // price is fixed, the client's stake is ignored
        maxMult = Math.max(...box.items.map((i) => i.value)) * MF_PER_FRAG / stake;
        break;
      }
      default: return fail('invalid_game', 'Unknown game.');
    }
    checkStake(cfg, stake);
    checkMaxWin(cfg, stake, maxMult);
    const { bet, seed, nonce } = await open(db, userId, game, stake, params, now);
    const src = stream(seed, nonce);
    switch (game) {
      case 'dice': { const o = playDice(src, params as DiceBet); return settle(db, bet, userId, stake, o.multiplier, o, now); }
      case 'plinko': { const p = params as InstantParams['plinko']; const o = playPlinko(src, p.rows, p.risk); return settle(db, bet, userId, stake, o.multiplier, o, now); }
      case 'upgrader': { const p = params as InstantParams['upgrader']; const o = playUpgrader(src, 1, p.multiplier, undefined, p.zone); return settle(db, bet, userId, stake, o.win ? o.value : 0, o, now); }
      case 'airdrop': { const o = playAirdrop(src, (params as InstantParams['airdrop']).target); return settle(db, bet, userId, stake, o.multiplier, o, now); }
      default: {
        const o = openCase(src, box!);
        return settle(db, bet, userId, stake, (o.item.value * MF_PER_FRAG) / stake, { ticket: o.ticket, item: o.item, ev: caseEv(box!), version: box!.version }, now);
      }
    }
  });
}

export const MAX_MULTI_OPEN = 5;

/** Opens 1–5 of the same case at once: one bet (and nonce) per case, all in one transaction, so it is all or nothing. */
export function openCases(db: DB, cfg: Config, userId: string, caseId: string, count: number, now: number): Promise<BetRow[]> {
  if (!Number.isInteger(count) || count < 1 || count > MAX_MULTI_OPEN) fail('invalid_params', `Open 1 to ${MAX_MULTI_OPEN} cases at once.`);
  return tx(db, async (db) => {
    const out: BetRow[] = [];
    for (let i = 0; i < count; i++) out.push(await playInstant(db, cfg, userId, 'cases', 0, { caseId }, now));
    return out;
  });
}

/* ---------- mines ---------- */

interface MinesState { mines: number[]; revealed: number[] }

export function minesStart(db: DB, cfgIn: Config, userId: string, stake: number, mineCount: number, now: number) {
  return tx(db, async (db) => {
    const cfg = await gameConfig(db, cfgIn, 'mines');
    if (!Number.isInteger(mineCount) || mineCount < 1 || mineCount > 24) fail('invalid_params', 'Mines: 1 to 24.');
    await assertNoOpen(db, userId, 'mines');
    checkStake(cfg, stake);
    checkMaxWin(cfg, stake, minesMultiplier(mineCount, 1));
    const { bet, seed, nonce } = await open(db, userId, 'mines', stake, { mines: mineCount }, now);
    const state: MinesState = { mines: layMines(stream(seed, nonce), mineCount), revealed: [] };
    await db.prepare('UPDATE bets SET state = ? WHERE id = ?').run(JSON.stringify(state), bet);
    return publicMines((await getBet(db, bet))!, db);
  });
}

export function minesReveal(db: DB, cfgIn: Config, userId: string, betId: string, tile: number, now: number) {
  return tx(db, async (db) => {
    const cfg = await gameConfig(db, cfgIn, 'mines');
    const b = await openBet(db, userId, betId, 'mines');
    await assertGameEnabled(db, 'mines');
    const s = JSON.parse(b.state!) as MinesState;
    const m = JSON.parse(b.params).mines as number;
    if (!Number.isInteger(tile) || tile < 0 || tile >= TILES || s.revealed.includes(tile)) fail('invalid_params', 'Invalid tile.');
    if (b.stake * minesMultiplier(m, s.revealed.length + 1) > cfg.maxWin) fail('max_win', 'The next tile could exceed the max win. Please cash out.', 400);
    if (s.mines.includes(tile)) return publicMines(await settle(db, b.id, userId, b.stake, 0, { mines: s.mines, revealed: s.revealed, hit: tile }, now), db);
    s.revealed.push(tile);
    if (s.revealed.length === TILES - m) return publicMines(await settle(db, b.id, userId, b.stake, minesMultiplier(m, s.revealed.length), { mines: s.mines, revealed: s.revealed }, now), db);
    await db.prepare('UPDATE bets SET state = ? WHERE id = ?').run(JSON.stringify(s), b.id);
    return publicMines((await getBet(db, b.id))!, db);
  });
}

export function minesCashout(db: DB, userId: string, betId: string, now: number) {
  return tx(db, async (db) => {
    const b = await openBet(db, userId, betId, 'mines');
    const s = JSON.parse(b.state!) as MinesState;
    if (s.revealed.length === 0) fail('invalid_action', 'Reveal at least one tile first.');
    const m = JSON.parse(b.params).mines as number;
    return publicMines(await settle(db, b.id, userId, b.stake, minesMultiplier(m, s.revealed.length), { mines: s.mines, revealed: s.revealed }, now), db);
  });
}

async function publicMines(b: BetRow, db: DB) {
  const m = JSON.parse(b.params).mines as number;
  if (b.status === 'settled') return { ...(await publicBet(b, db)), mines: m };
  const s = JSON.parse(b.state!) as MinesState; // never expose s.mines while open
  return { ...(await publicBet(b, db)), mines: m, revealed: s.revealed, currentMultiplier: minesMultiplier(m, s.revealed.length), nextMultiplier: minesMultiplier(m, s.revealed.length + 1) };
}

/* ---------- raid ---------- */

interface RaidState { tools: RaidTool[] }

export function raidStart(db: DB, cfgIn: Config, userId: string, stake: number, now: number) {
  return tx(db, async (db) => {
    const cfg = await gameConfig(db, cfgIn, 'raid');
    await assertNoOpen(db, userId, 'raid');
    checkStake(cfg, stake);
    checkMaxWin(cfg, stake, raidMultiplier(['satchel'])); // smallest first step that could be taken
    const { bet } = await open(db, userId, 'raid', stake, {}, now);
    await db.prepare('UPDATE bets SET state = ? WHERE id = ?').run(JSON.stringify({ tools: [] } satisfies RaidState), bet);
    return publicRaid((await getBet(db, bet))!, db);
  });
}

export function raidBlast(db: DB, cfgIn: Config, userId: string, betId: string, tool: RaidTool, now: number) {
  return tx(db, async (db) => {
    const cfg = await gameConfig(db, cfgIn, 'raid');
    const b = await openBet(db, userId, betId, 'raid');
    await assertGameEnabled(db, 'raid');
    if (!(tool in RAID_TOOLS)) fail('invalid_params', 'Explosive: c4, rocket or satchel.');
    const s = JSON.parse(b.state!) as RaidState;
    const next = [...s.tools, tool];
    if (b.stake * raidMultiplier(next) > cfg.maxWin) fail('max_win', 'This layer could exceed the max win. Secure your loot or pick a weaker explosive.', 400);
    const src = stream(await seedById(db, b.seed_id), b.nonce);
    for (let i = 0; i < s.tools.length; i++) src.next(); // replay floats already used
    const roll = src.next();
    const breached = roll < RAID_TOOLS[tool];
    const steps = next.map((t, i) => ({ layer: RAID_LAYERS[i], tool: t }));
    if (!breached) return publicRaid(await settle(db, b.id, userId, b.stake, 0, { steps, heldAt: RAID_LAYERS[s.tools.length], roll }, now), db);
    if (next.length === RAID_LAYERS.length) return publicRaid(await settle(db, b.id, userId, b.stake, raidMultiplier(next), { steps, roll }, now), db);
    await db.prepare('UPDATE bets SET state = ? WHERE id = ?').run(JSON.stringify({ tools: next } satisfies RaidState), b.id);
    return publicRaid((await getBet(db, b.id))!, db);
  });
}

export function raidCashout(db: DB, userId: string, betId: string, now: number) {
  return tx(db, async (db) => {
    const b = await openBet(db, userId, betId, 'raid');
    const s = JSON.parse(b.state!) as RaidState;
    if (s.tools.length === 0) fail('invalid_action', 'Blast at least one layer first.');
    return publicRaid(await settle(db, b.id, userId, b.stake, raidMultiplier(s.tools), { steps: s.tools.map((t, i) => ({ layer: RAID_LAYERS[i], tool: t })) }, now), db);
  });
}

async function publicRaid(b: BetRow, db: DB) {
  if (b.status === 'settled') return publicBet(b, db);
  const s = JSON.parse(b.state!) as RaidState;
  return { ...(await publicBet(b, db)), layersBreached: s.tools.length, nextLayer: RAID_LAYERS[s.tools.length], currentMultiplier: raidMultiplier(s.tools) };
}

/* ---------- shared ---------- */

/** Open stateful rounds of a player (for page reloads). Never includes hidden state. */
export async function openGames(db: DB, userId: string) {
  const rows = (await db.prepare("SELECT id FROM bets WHERE user_id = ? AND status = 'open' ORDER BY created_at").all(userId)) as { id: string }[];
  const out = [];
  for (const { id } of rows) {
    const b = (await getBet(db, id))!;
    out.push(b.game === 'mines' ? await publicMines(b, db) : b.game === 'raid' ? await publicRaid(b, db) : await publicBet(b, db));
  }
  return out;
}

export async function assertNoOpen(db: DB, userId: string, game: Game): Promise<void> {
  const r = (await db.prepare("SELECT id FROM bets WHERE user_id = ? AND game = ? AND status = 'open'").get(userId, game)) as { id: string } | undefined;
  if (r) fail('open_game', 'You already have a round in progress.', 409, { betId: r.id });
}

export async function openBet(db: DB, userId: string, betId: string, game: Game): Promise<BetRow> {
  const b = await getBet(db, betId);
  if (!b || b.user_id !== userId || b.game !== game) fail('not_found', 'Round not found.', 404);
  if (b!.status !== 'open') fail('already_settled', 'This round is already settled.', 409);
  return b!;
}

/** What the player (and the verifier) sees. The server seed appears only after rotation. */
export async function publicBet(b: BetRow, db?: DB) {
  const seed = db ? await seedById(db, b.seed_id) : null;
  return {
    id: b.id, game: b.game, status: b.status, stake: b.stake, payout: b.payout, multiplier: b.multiplier,
    params: JSON.parse(b.params), result: b.result ? JSON.parse(b.result) : null, createdAt: b.created_at, settledAt: b.settled_at,
    fairness: seed ? { serverSeedHash: seed.server_hash, clientSeed: seed.client_seed, nonce: b.nonce, serverSeed: seed.revealed_at ? seed.server_seed : null } : { nonce: b.nonce },
  };
}

export function balance(db: DB, userId: string): Promise<number> {
  return balanceOf(db, userAccount(userId));
}

export async function activeSeedPublic(db: DB, userId: string) {
  const s = await activeSeed(db, userId);
  return { serverSeedHash: s.server_hash, clientSeed: s.client_seed, nextNonce: s.nonce };
}

/** Live RTP per game over a window: the public "Fair-Ledger" statistic. */
export async function liveRtp(db: DB, since: number) {
  const rows = (await db.prepare('SELECT game, COUNT(*) AS n, SUM(stake) AS staked, SUM(payout) AS paid FROM wagers WHERE settled = 1 AND settled_at >= ? GROUP BY game ORDER BY game').all(since)) as { game: string; n: number; staked: number; paid: number }[];
  return rows.map((r) => ({ game: r.game, bets: r.n, wagered: r.staked, paid: r.paid, rtp: r.staked ? r.paid / r.staked : null }));
}
