/**
 * Storage behind one async interface, two adapters:
 *   SQLite  node:sqlite (tests, single-node demo) and sql.js (browser demo). One connection; a transaction
 *           holds a lock, so statements from other requests wait until it commits (same as BEGIN IMMEDIATE).
 *   Postgres  production (pg.ts). Every transaction runs SERIALIZABLE and is retried on a serialization
 *           failure, so the code keeps the "one transaction at a time" semantics it was written for.
 * All money moves happen inside tx(): balance checks, nonce increments, ledger rows and bet rows commit
 * together or not at all. Inside tx() always use the handle passed to the callback.
 * SQL is written once in the common subset (? placeholders, ON CONFLICT, RETURNING); the Postgres
 * adapter rewrites placeholders to $n.
 */

import { DatabaseSync } from 'node:sqlite';

export interface RunResult { changes: number }
export interface Stmt {
  get(...args: unknown[]): Promise<any>;
  all(...args: unknown[]): Promise<any[]>;
  run(...args: unknown[]): Promise<RunResult>;
}
export interface DB {
  readonly dialect: 'sqlite' | 'pg';
  readonly inTx: boolean;
  prepare(sql: string): Stmt;
  exec(sql: string): Promise<void>;
  /** Runs fn in one transaction. On a transaction handle it simply joins the running transaction. */
  transaction<T>(fn: (db: DB) => Promise<T>): Promise<T>;
  /** Runs fn once the surrounding transaction has committed (right away outside a transaction). */
  afterCommit(fn: () => void): void;
  close(): Promise<void>;
}

/** Runs queued after-commit callbacks; one failing callback must not stop the others. */
export function runAfterCommit(queue: (() => void)[]): void {
  for (const fn of queue) { try { fn(); } catch (e) { console.error('afterCommit', e); } }
}

type Raw = DatabaseSync;
type RawStmt = ReturnType<Raw['prepare']>;

/** SQLite adapter. node:sqlite is synchronous, so every statement completes before the next microtask. */
class SqliteDb implements DB {
  readonly dialect = 'sqlite' as const;
  private cache = new Map<string, RawStmt>();
  private chain: Promise<void> = Promise.resolve();
  private locked = false;
  private after: (() => void)[] = [];
  constructor(readonly raw: Raw, readonly inTx = false, private root?: SqliteDb) {}

  afterCommit(fn: () => void): void {
    if (this.inTx) this.after.push(fn);
    else runAfterCommit([fn]);
  }

  private stmt(sql: string): RawStmt {
    const c = (this.root ?? this).cache;
    let s = c.get(sql);
    if (!s) { s = this.raw.prepare(sql); c.set(sql, s); }
    return s;
  }
  /** Statements on the root handle wait while a transaction holds the connection. */
  private async ready(): Promise<void> {
    if (this.inTx) return;
    while (this.locked) await this.chain;
  }
  prepare(sql: string): Stmt {
    return {
      get: async (...a) => { await this.ready(); return this.stmt(sql).get(...(a as never[])) ?? undefined; },
      all: async (...a) => { await this.ready(); return this.stmt(sql).all(...(a as never[])); },
      run: async (...a) => { await this.ready(); const r = this.stmt(sql).run(...(a as never[])); return { changes: Number(r.changes) }; },
    };
  }
  async exec(sql: string): Promise<void> { await this.ready(); this.raw.exec(sql); }
  async transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this);
    let release!: () => void;
    const prev = this.chain;
    this.chain = new Promise<void>((r) => { release = r; });
    await prev;
    this.locked = true;
    this.raw.exec('BEGIN IMMEDIATE');
    const handle = new SqliteDb(this.raw, true, this);
    try {
      const out = await fn(handle);
      this.raw.exec('COMMIT');
      this.locked = false;
      release();
      runAfterCommit(handle.after);
      return out;
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    } finally {
      this.locked = false;
      release();
    }
  }
  async close(): Promise<void> { this.raw.close(); }
}

const PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
`;

/**
 * One schema for both dialects, written in their common subset. pg.ts derives the Postgres DDL from it
 * (INTEGER → BIGINT, AUTOINCREMENT → identity, REAL → DOUBLE PRECISION). Timestamps are ms since epoch,
 * money is integer milli-Frags.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  steam_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  country TEXT,
  age_confirmed_at INTEGER,
  kyc_level INTEGER NOT NULL DEFAULT 0,
  last_refill_at INTEGER,
  created_at INTEGER NOT NULL,
  crew_code TEXT,
  role TEXT NOT NULL DEFAULT 'player',
  totp_secret TEXT                -- operator MFA (base32), NULL = not enrolled
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  mfa_at INTEGER                  -- last successful TOTP step-up in this session
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

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
CREATE INDEX IF NOT EXISTS bets_seed ON bets(seed_id, status);
-- Mines and raid allow one open round per player; the service checks it, the index guarantees it.
CREATE UNIQUE INDEX IF NOT EXISTS bets_one_open ON bets(user_id, game) WHERE status = 'open';

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
CREATE UNIQUE INDEX IF NOT EXISTS crash_bets_one ON crash_bets(round_id, user_id);
CREATE INDEX IF NOT EXISTS crash_rounds_chain ON crash_rounds(chain_id, idx);

CREATE TABLE IF NOT EXISTS openid_nonces (
  nonce TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- Every wager across instant/stateful bets, PvP seats (humans only, cancelled games excluded) and crash bets.
-- Responsible-gambling limits, session summaries, AML turnover and live RTP all read from here.
CREATE VIEW IF NOT EXISTS wagers AS
  SELECT user_id, game, stake, payout, created_at, settled_at, CASE WHEN status = 'settled' THEN 1 ELSE 0 END AS settled FROM bets
  UNION ALL
  SELECT s.user_id, g.type, s.stake, s.payout, s.created_at, g.settled_at, CASE WHEN g.status = 'settled' THEN 1 ELSE 0 END
    FROM pvp_seats s JOIN pvp_games g ON g.id = s.game_id WHERE s.user_id IS NOT NULL AND g.status != 'cancelled'
  UNION ALL
  SELECT b.user_id, 'crash', b.stake, b.payout, b.created_at, r.crash_at, CASE WHEN b.status = 'settled' THEN 1 ELSE 0 END
    FROM crash_bets b JOIN crash_rounds r ON r.id = b.round_id;

-- Retention
CREATE TABLE IF NOT EXISTS reward_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,             -- rakeback | daily | rain | affiliate
  amount INTEGER NOT NULL,
  data TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reward_claims_user ON reward_claims(user_id, kind, created_at);
CREATE TABLE IF NOT EXISTS rain_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opens_at INTEGER NOT NULL,
  closes_at INTEGER NOT NULL,
  pot INTEGER NOT NULL,
  status TEXT NOT NULL            -- open | paid
);
CREATE TABLE IF NOT EXISTS rain_joins (
  rain_id INTEGER NOT NULL REFERENCES rain_rounds(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (rain_id, user_id)
);
CREATE TABLE IF NOT EXISTS crew_codes (
  code TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  created_at INTEGER NOT NULL
);

-- Operations: per-game kill switch, chat, responsible-gambling case queue.
CREATE TABLE IF NOT EXISTS game_flags (
  game TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,
  reason TEXT,
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,                   -- NULL = system message
  name TEXT NOT NULL,
  level INTEGER,
  role TEXT,
  kind TEXT NOT NULL,             -- user | system | win | rain
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  deleted_by TEXT
);
CREATE INDEX IF NOT EXISTS chat_recent ON chat_messages(created_at);
CREATE TABLE IF NOT EXISTS chat_mutes (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  until_at INTEGER,               -- NULL = until lifted
  reason TEXT,
  by_user TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rg_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,           -- net_loss_24h | limit_raises_30d | long_session
  data TEXT,
  status TEXT NOT NULL,           -- open | contacted | closed
  note TEXT,
  handled_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS rg_cases_one_open ON rg_cases(user_id, reason) WHERE status != 'closed';

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  event TEXT NOT NULL,
  data TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_user ON audit(user_id, created_at);
`;

/** Opens (and migrates) a SQLite database. Synchronous so tests and the browser demo can set up in one step. */
export function openDb(path = ':memory:'): DB {
  const raw = new DatabaseSync(path);
  raw.exec(PRAGMAS);
  const legacy = raw.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get() !== undefined;
  if (legacy) migrateLegacy(raw);
  raw.exec(SCHEMA);
  return new SqliteDb(raw);
}

/** Additive migrations for demo databases created by earlier versions. */
function migrateLegacy(raw: Raw): void {
  const cols = (t: string) => (raw.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
  const u = cols('users');
  if (!u.includes('crew_code')) raw.exec('ALTER TABLE users ADD COLUMN crew_code TEXT');
  if (!u.includes('role')) raw.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'");
  if (!u.includes('totp_secret')) raw.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT');
  if (!cols('sessions').includes('mfa_at')) raw.exec('ALTER TABLE sessions ADD COLUMN mfa_at INTEGER');
  raw.exec('DROP VIEW IF EXISTS wagers');
}

/** Runs fn in one transaction (nested calls join the outer one). Use the handle passed to fn. */
export function tx<T>(db: DB, fn: (db: DB) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}

export async function audit(db: DB, userId: string | null, event: string, data: unknown, now: number): Promise<void> {
  await db.prepare('INSERT INTO audit (user_id, event, data, created_at) VALUES (?, ?, ?, ?)').run(userId, event, JSON.stringify(data ?? null), now);
}
