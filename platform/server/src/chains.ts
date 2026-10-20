/**
 * Hash chains of the live games (Scrap Press, Bandit Wheel). A chain is built from a secret tip; only its
 * terminal hash is published, and its client seed is a beacon round picked at publication (current + 2),
 * so neither side can steer outcomes. Round i uses seed_i; sha256(seed_i) = seed_{i−1}.
 *
 * Rotation: the operator (or the ticker, once a chain is used up) publishes a new chain. The round that is
 * running finishes on the old chain; the next round starts at index 0 of the new one. A retired chain's tip
 * is published: anyone can then rebuild that whole chain and check every round it produced.
 */

import { randomBytes } from 'node:crypto';

import { buildChain } from '../../engine/src/index';
import type { Beacon } from './beacon';
import type { DB } from './db';

export type ChainGame = 'crash' | 'wheel';
export interface ChainRow { id: number; terminal_hash: string; tip: string; length: number; beacon_round: number; client_seed: string | null; created_at: number }

const T = { crash: { chains: 'crash_chains', rounds: 'crash_rounds', done: 'crashed' }, wheel: { chains: 'wheel_chains', rounds: 'wheel_rounds', done: 'settled' } } as const;

export const latestChain = async (db: DB, game: ChainGame) => (await db.prepare(`SELECT * FROM ${T[game].chains} ORDER BY id DESC LIMIT 1`).get()) as ChainRow | undefined;

export async function publishChain(db: DB, game: ChainGame, length: number, beacon: Beacon, now: number): Promise<ChainRow> {
  const tip = randomBytes(32).toString('hex');
  const { terminal } = buildChain(tip, length);
  const r = (await db.prepare(`INSERT INTO ${T[game].chains} (terminal_hash, tip, length, beacon_round, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id`)
    .get(terminal, tip, length, beacon.roundAt(now) + 2, now)) as { id: number };
  return (await db.prepare(`SELECT * FROM ${T[game].chains} WHERE id = ?`).get(r.id)) as ChainRow;
}

/**
 * Public chain list. The tip is shown only for a retired chain whose rounds have all finished: right after
 * a rotation the old chain's last round may still be running, and its tip would give that round away.
 */
export async function listChains(db: DB, game: ChainGame, beacon: Beacon) {
  const { chains, rounds, done } = T[game];
  const rows = (await db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM ${rounds} r WHERE r.chain_id = c.id) AS played,
      (SELECT COUNT(*) FROM ${rounds} r WHERE r.chain_id = c.id AND r.status != '${done}') AS running
    FROM ${chains} c ORDER BY c.id DESC LIMIT 20`).all()) as (ChainRow & { played: number; running: number })[];
  const latest = rows[0]?.id;
  return rows.map((c) => ({
    id: c.id, terminalHash: c.terminal_hash, length: Number(c.length), played: Number(c.played), createdAt: Number(c.created_at), active: c.id === latest,
    beacon: { name: beacon.name, round: Number(c.beacon_round), value: c.client_seed, verifyUrl: beacon.verifyUrl(Number(c.beacon_round)) },
    tip: c.id !== latest && Number(c.running) === 0 ? c.tip : null,
  }));
}
