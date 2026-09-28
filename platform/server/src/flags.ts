/**
 * Per-game kill switch. A disabled game refuses new rounds and further steps in open rounds
 * (mines reveal, raid blast); cash-outs and settlement of rounds already in play keep working,
 * so no player money is ever trapped by a switch. Every change is audited with the operator's id.
 */

import { type DB, audit } from './db';
import { fail } from './errors';

export const GAME_IDS = ['raid', 'cases', 'battle', 'crash', 'coinflip', 'mines', 'dice', 'plinko', 'upgrader'] as const;
export type GameId = (typeof GAME_IDS)[number];

export const GAME_NAME: Record<GameId, string> = {
  raid: 'Raid', cases: 'Cases', battle: 'Case Battle', crash: 'Scrap Press', coinflip: 'Coinflip',
  mines: 'Minefield', dice: 'Dice', plinko: 'Scrap Chute', upgrader: 'Workbench',
};

export interface GameFlag { game: GameId; name: string; enabled: boolean; reason: string | null; updatedBy: string | null; updatedAt: number | null }

export async function gameFlags(db: DB): Promise<GameFlag[]> {
  const rows = (await db.prepare('SELECT * FROM game_flags').all()) as { game: string; enabled: number; reason: string | null; updated_by: string | null; updated_at: number }[];
  const by = new Map(rows.map((r) => [r.game, r]));
  return GAME_IDS.map((g) => {
    const r = by.get(g);
    return { game: g, name: GAME_NAME[g], enabled: r ? Number(r.enabled) === 1 : true, reason: r?.reason ?? null, updatedBy: r?.updated_by ?? null, updatedAt: r?.updated_at ?? null };
  });
}

export async function assertGameEnabled(db: DB, game: string): Promise<void> {
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
  await audit(db, actorId, enabled ? 'admin_game_enabled' : 'admin_game_disabled', { game, reason }, now);
  return (await gameFlags(db)).find((f) => f.game === game)!;
}
