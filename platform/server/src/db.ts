/**
 * Storage. Demo uses node:sqlite (WAL, one file); production uses Postgres with the same schema
 * (see docs/platform/04-architektur.md). All money moves happen inside tx() — one IMMEDIATE transaction,
 * so balance checks, nonce increments, ledger rows and bet rows commit together or not at all.
 */

import { DatabaseSync } from 'node:sqlite';

export type DB = DatabaseSync;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  steam_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  country TEXT,
  age_confirmed_at INTEGER,
  kyc_level INTEGER NOT NULL DEFAULT 0,
  last_refill_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Double-entry ledger: every transfer writes two rows that sum to zero.
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_id TEXT NOT NULL,
  account TEXT NOT NULL,
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_account ON ledger(account, created_at);
CREATE TABLE IF NOT EXISTS balances (
  account TEXT PRIMARY KEY,
  amount INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seeds (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  server_seed TEXT NOT NULL,
  server_hash TEXT NOT NULL,
  client_seed TEXT NOT NULL,
  nonce INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  revealed_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS seeds_one_active ON seeds(user_id) WHERE active = 1;

CREATE TABLE IF NOT EXISTS bets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  game TEXT NOT NULL,
  status TEXT NOT NULL,           -- open | settled
  stake INTEGER NOT NULL,
  payout INTEGER NOT NULL DEFAULT 0,
  multiplier REAL NOT NULL DEFAULT 0,
  seed_id TEXT NOT NULL REFERENCES seeds(id),
  nonce INTEGER NOT NULL,
  params TEXT NOT NULL,
  state TEXT,                     -- server-side state of open games (hidden from the client)
  result TEXT,
  created_at INTEGER NOT NULL,
  settled_at INTEGER
);
CREATE INDEX IF NOT EXISTS bets_user ON bets(user_id, created_at);
CREATE INDEX IF NOT EXISTS bets_game ON bets(game, settled_at);

CREATE TABLE IF NOT EXISTS rg_limits (
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,             -- deposit | loss | wager
  period TEXT NOT NULL,           -- day | week | month
  amount INTEGER,                 -- active limit (NULL = none)
  pending_amount INTEGER,         -- raised/removed value waiting for the delay (-1 = remove)
  pending_at INTEGER,
  PRIMARY KEY (user_id, kind, period)
);

CREATE TABLE IF NOT EXISTS rg_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,             -- cooldown | exclusion
  until_at INTEGER,               -- NULL = permanent
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rg_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  reality_check_minutes INTEGER NOT NULL DEFAULT 60
);

-- PvP: coinflip and case battles. One per-game server seed; client seed = beacon round value.
CREATE TABLE IF NOT EXISTS pvp_games (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,             -- coinflip | battle
  status TEXT NOT NULL,           -- open | locked | settled | cancelled
  creator_id TEXT NOT NULL REFERENCES users(id),
  params TEXT NOT NULL,
  seats INTEGER NOT NULL,
  seat_stake INTEGER NOT NULL,
  server_seed TEXT NOT NULL,
  server_hash TEXT NOT NULL,
  beacon_round INTEGER,
  beacon_value TEXT,
  result TEXT,
  created_at INTEGER NOT NULL,
  locked_at INTEGER,
  settled_at INTEGER
);
CREATE TABLE IF NOT EXISTS pvp_seats (
  game_id TEXT NOT NULL REFERENCES pvp_games(id),
  seat INTEGER NOT NULL,
  user_id TEXT,                   -- NULL = demo bot (house)
  stake INTEGER NOT NULL,
  payout INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, seat)
);
CREATE INDEX IF NOT EXISTS pvp_seats_user ON pvp_seats(user_id, created_at);

-- Crash: one hash chain, rounds played from index 0 upwards.
CREATE TABLE IF NOT EXISTS crash_chains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  terminal_hash TEXT NOT NULL,
  tip TEXT NOT NULL,              -- secret; seeds are derived from it
  length INTEGER NOT NULL,
  beacon_round INTEGER NOT NULL,
  client_seed TEXT,               -- beacon value, known only after the chain was published
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS crash_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chain_id INTEGER NOT NULL REFERENCES crash_chains(id),
  idx INTEGER NOT NULL,
  seed TEXT NOT NULL,
  crash INTEGER NOT NULL,         -- crash point × 100
  betting_ends_at INTEGER NOT NULL,
  crash_at INTEGER NOT NULL,
  status TEXT NOT NULL            -- betting | running | crashed
);
CREATE TABLE IF NOT EXISTS crash_bets (
  id TEXT PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES crash_rounds(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  stake INTEGER NOT NULL,
  target INTEGER NOT NULL,        -- auto cash-out × 100
  cashed_at INTEGER,              -- manual cash-out multiplier × 100
  payout INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,           -- open | settled
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS crash_bets_user ON crash_bets(user_id, created_at);

CREATE TABLE IF NOT EXISTS openid_nonces (
  nonce TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- Every wager across instant/stateful bets, PvP seats (humans only, cancelled games excluded) and crash bets.
-- Responsible-gambling limits, session summaries, AML turnover and live RTP all read from here.
CREATE VIEW IF NOT EXISTS wagers AS
  SELECT user_id, game, stake, payout, created_at, settled_at, (status = 'settled') AS settled FROM bets
  UNION ALL
  SELECT s.user_id, g.type, s.stake, s.payout, s.created_at, g.settled_at, (g.status = 'settled')
    FROM pvp_seats s JOIN pvp_games g ON g.id = s.game_id WHERE s.user_id IS NOT NULL AND g.status != 'cancelled'
  UNION ALL
  SELECT b.user_id, 'crash', b.stake, b.payout, b.created_at, r.crash_at, (b.status = 'settled')
    FROM crash_bets b JOIN crash_rounds r ON r.id = b.round_id;

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  event TEXT NOT NULL,
  data TEXT,
  created_at INTEGER NOT NULL
);
`;

export function openDb(path = ':memory:'): DB {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

let depth = 0;
/** Runs fn in one IMMEDIATE transaction (nested calls join the outer one). */
export function tx<T>(db: DB, fn: () => T): T {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

export function audit(db: DB, userId: string | null, event: string, data: unknown, now: number): void {
  db.prepare('INSERT INTO audit (user_id, event, data, created_at) VALUES (?, ?, ?, ?)').run(userId, event, JSON.stringify(data ?? null), now);
}
