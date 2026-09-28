/**
 * Seed pairs per player. The active pair's server seed stays secret; only its SHA-256 is shown.
 * Every bet takes the next nonce inside the betting transaction. Rotation reveals the old seed and
 * starts a fresh pair at nonce 0. Rotation is refused while a game on the active seed is still open,
 * otherwise the player could see the outcome of an unfinished mines or raid round.
 */

import { randomBytes } from 'node:crypto';

import { newServerSeed } from '../../engine/src/index';
import { type DB, audit, tx } from './db';
import { fail } from './errors';

export interface SeedRow {
  id: string;
  user_id: string;
  server_seed: string;
  server_hash: string;
  client_seed: string;
  nonce: number;
  active: number;
  created_at: number;
  revealed_at: number | null;
}

const rnd = (n: number) => new Uint8Array(randomBytes(n));
const newId = () => randomBytes(12).toString('hex');

export function validateClientSeed(s: string): string {
  const v = s.trim();
  if (v.length < 1 || v.length > 64 || !/^[\x21-\x7e]+$/.test(v)) fail('invalid_client_seed', 'Client seed: 1–64 visible ASCII characters, no spaces.');
  return v;
}

export async function createSeed(db: DB, userId: string, clientSeed: string, now: number): Promise<SeedRow> {
  const { seed, hash } = newServerSeed(rnd);
  const id = newId();
  await db.prepare('INSERT INTO seeds (id, user_id, server_seed, server_hash, client_seed, nonce, active, created_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?)')
    .run(id, userId, seed, hash, validateClientSeed(clientSeed), now);
  return activeSeed(db, userId);
}

export async function activeSeed(db: DB, userId: string): Promise<SeedRow> {
  const row = (await db.prepare('SELECT * FROM seeds WHERE user_id = ? AND active = 1').get(userId)) as SeedRow | undefined;
  if (!row) fail('no_seed', 'No active seed.', 500);
  return row!;
}

/** Reserves the next nonce. Must run inside the bet transaction. */
export async function takeNonce(db: DB, userId: string): Promise<{ seed: SeedRow; nonce: number }> {
  const seed = await activeSeed(db, userId);
  await db.prepare('UPDATE seeds SET nonce = nonce + 1 WHERE id = ?').run(seed.id);
  return { seed, nonce: seed.nonce };
}

export function rotateSeed(db: DB, userId: string, newClientSeed: string | null, now: number): Promise<{ revealed: Pick<SeedRow, 'server_seed' | 'server_hash' | 'client_seed' | 'nonce'>; next: PublicSeed }> {
  return tx(db, async (db) => {
    const cur = await activeSeed(db, userId);
    const open = (await db.prepare("SELECT COUNT(*) AS n FROM bets WHERE seed_id = ? AND status = 'open'").get(cur.id)) as { n: number };
    if (open.n > 0) fail('open_game', 'Finish your running game first, then rotate the seed.', 409);
    await db.prepare('UPDATE seeds SET active = 0, revealed_at = ? WHERE id = ?').run(now, cur.id);
    const next = await createSeed(db, userId, newClientSeed ?? randomBytes(8).toString('hex'), now);
    await audit(db, userId, 'seed_rotated', { revealedHash: cur.server_hash, bets: cur.nonce }, now);
    return { revealed: { server_seed: cur.server_seed, server_hash: cur.server_hash, client_seed: cur.client_seed, nonce: cur.nonce }, next: publicSeed(next) };
  });
}

export interface PublicSeed { serverSeedHash: string; clientSeed: string; nextNonce: number }
export const publicSeed = (s: SeedRow): PublicSeed => ({ serverSeedHash: s.server_hash, clientSeed: s.client_seed, nextNonce: s.nonce });
