/**
 * Per-game kill switch. A disabled game refuses new rounds and further steps in open rounds
 * (mines reveal, raid blast); cash-outs and settlement of rounds already in play keep working,
 * so no player money is ever trapped by a switch. Every change is audited with the operator's id.
 */

import type { Config } from './config';
import { type DB, audit } from './db';
import { fail } from './errors';
import { getSettings } from './site';

export const GAME_IDS = ['raid', 'cases', 'battle', 'crash', 'coinflip', 'mines', 'dice', 'plinko', 'upgrader', 'wheel', 'jackpot', 'towers', 'hilo', 'blackjack', 'airdrop'] as const;
export type GameId = (typeof GAME_IDS)[number];

export const GAME_NAME: Record<GameId, string> = {
  raid: 'Raid', cases: 'Cases', battle: 'Case Battle', crash: 'Scrap Press', coinflip: 'Coinflip',
  mines: 'Minefield', dice: 'Dice', plinko: 'Scrap Chute', upgrader: 'Workbench',
  wheel: 'Bandit Wheel', jackpot: 'Jackpot', towers: 'Monument Run', hilo: 'Hi-Lo', blackjack: 'Blackjack', airdrop: 'Airdrop',
};

export interface GameLimits { minStake: number | null; maxStake: number | null; maxWin: number | null }
export interface GameFlag { game: GameId; name: string; enabled: boolean; reason: string | null; updatedBy: string | null; updatedAt: number | null; limits: GameLimits }

export async function gameFlags(db: DB): Promise<GameFlag[]> {
  const rows = (await db.prepare('SELECT * FROM game_flags').all()) as { game: string; enabled: number; reason: string | null; updated_by: string | null; updated_at: number; min_stake: number | null; max_stake: number | null; max_win: number | null }[];
  const by = new Map(rows.map((r) => [r.game, r]));
  return GAME_IDS.map((g) => {
    const r = by.get(g);
    return { game: g, name: GAME_NAME[g], enabled: r ? Number(r.enabled) === 1 : true, reason: r?.reason ?? null, updatedBy: r?.updated_by ?? null, updatedAt: r?.updated_at ?? null,
      limits: { minStake: r?.min_stake ?? null, maxStake: r?.max_stake ?? null, maxWin: r?.max_win ?? null } };
  });
}

export async function assertGameEnabled(db: DB, game: string): Promise<void> {
  if ((await getSettings(db)).maintenance) fail('maintenance', 'SCRAPLINE is in maintenance. Open rounds can still be cashed out.', 503);
  const r = (await db.prepare('SELECT enabled, reason FROM game_flags WHERE game = ?').get(game)) as { enabled: number; reason: string | null } | undefined;
  if (r && Number(r.enabled) === 0) {
    const name = GAME_NAME[game as GameId] ?? game;
    fail('game_disabled', `${name} is paused for maintenance. Open rounds can still be cashed out.`, 503, { game, reason: r.reason });
  }
}

export async function setGameFlag(db: DB, actorId: string, game: string, enabled: boolean, reason: string | null, now: number): Promise<GameFlag> {
  if (!(GAME_IDS as readonly string[]).includes(game)) fail('not_found', 'Unknown game.', 404);
  if (!enabled && !reason?.trim()) fail('invalid_params', 'Give a reason when pausing a game.');
  await db.prepare(`INSERT INTO game_flags (game, enabled, reason, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(game) DO UPDATE SET enabled = excluded.enabled, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .run(game, enabled ? 1 : 0, enabled ? null : reason!.trim().slice(0, 200), actorId, now);
  // the upsert above keeps the limit columns of an existing row
  await audit(db, actorId, enabled ? 'admin_game_enabled' : 'admin_game_disabled', { game, reason }, now);
  return (await gameFlags(db)).find((f) => f.game === game)!;
}

/** The global config with this game's limits applied. Per-game limits can only tighten the global ones. */
export async function gameConfig(db: DB, cfg: Config, game: string): Promise<Config> {
  const r = (await db.prepare('SELECT min_stake, max_stake, max_win FROM game_flags WHERE game = ?').get(game)) as { min_stake: number | null; max_stake: number | null; max_win: number | null } | undefined;
  if (!r) return cfg;
  return {
    ...cfg,
    minStake: Math.max(cfg.minStake, r.min_stake ?? 0),
    maxStake: Math.min(cfg.maxStake, r.max_stake ?? Infinity),
    maxWin: Math.min(cfg.maxWin, r.max_win ?? Infinity),
  };
}

export async function setGameLimits(db: DB, cfg: Config, actorId: string, game: string, limits: GameLimits, now: number): Promise<GameFlag> {
  if (!(GAME_IDS as readonly string[]).includes(game)) fail('not_found', 'Unknown game.', 404);
  const check = (v: number | null, name: string, lo: number, hi: number) => {
    if (v === null) return null;
    if (!Number.isSafeInteger(v) || v < lo || v > hi) fail('invalid_params', `${name} must be between ${lo / 1000} and ${hi / 1000} Frags (the global limits).`);
    return v;
  };
  const minStake = check(limits.minStake, 'Min stake', cfg.minStake, cfg.maxStake);
  const maxStake = check(limits.maxStake, 'Max stake', cfg.minStake, cfg.maxStake);
  const maxWin = check(limits.maxWin, 'Max win', cfg.minStake, cfg.maxWin);
  if (minStake !== null && maxStake !== null && minStake > maxStake) fail('invalid_params', 'Min stake is above max stake.');
  await db.prepare(`INSERT INTO game_flags (game, enabled, reason, updated_by, updated_at, min_stake, max_stake, max_win) VALUES (?, 1, NULL, ?, ?, ?, ?, ?)
    ON CONFLICT(game) DO UPDATE SET min_stake = excluded.min_stake, max_stake = excluded.max_stake, max_win = excluded.max_win, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .run(game, actorId, now, minStake, maxStake, maxWin);
  await audit(db, actorId, 'admin_game_limits', { game, minStake, maxStake, maxWin }, now);
  return (await gameFlags(db)).find((f) => f.game === game)!;
}
