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

import { SAMPLE_CASES, caseRtp, priceCase } from '../../engine/src/index';

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
  totp_secret TEXT,               -- operator MFA (base32), NULL = not enrolled
  totp_pending TEXT,              -- secret shown during enrolment, until the first code confirms it
  totp_pending_at INTEGER,
  name_changed_at INTEGER,        -- last display-name change (once per 24 h)
  hide_public INTEGER NOT NULL DEFAULT 0 -- 1 = shown as "Hidden player" in public lists
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  mfa_at INTEGER,                 -- last successful TOTP step-up in this session
  mfa_step INTEGER                -- TOTP time step used last (a code works once per session)
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

-- Bandit Wheel: live rounds from its own hash chain (same scheme as crash).
CREATE TABLE IF NOT EXISTS wheel_chains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  terminal_hash TEXT NOT NULL,
  tip TEXT NOT NULL,
  length INTEGER NOT NULL,
  beacon_round INTEGER NOT NULL,
  client_seed TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wheel_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chain_id INTEGER NOT NULL REFERENCES wheel_chains(id),
  idx INTEGER NOT NULL,
  seed TEXT NOT NULL,
  field_index INTEGER NOT NULL,   -- hidden until the spin starts
  betting_ends_at INTEGER NOT NULL,
  spin_ends_at INTEGER NOT NULL,
  status TEXT NOT NULL            -- betting | spinning | settled
);
CREATE TABLE IF NOT EXISTS wheel_bets (
  id TEXT PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES wheel_rounds(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  field TEXT NOT NULL,
  stake INTEGER NOT NULL,
  payout INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,           -- open | settled
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS wheel_bets_one ON wheel_bets(round_id, user_id, field);
CREATE INDEX IF NOT EXISTS wheel_bets_user ON wheel_bets(user_id, created_at);

-- Jackpot: one open pot per room; client seed = beacon round picked at lock.
CREATE TABLE IF NOT EXISTS jackpot_rounds (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,             -- high | low
  status TEXT NOT NULL,           -- open | counting | locked | settled | refunded
  server_seed TEXT NOT NULL,
  server_hash TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  countdown_ends_at INTEGER,
  beacon_round INTEGER,
  beacon_value TEXT,
  ticket INTEGER,
  winner_entry INTEGER,
  payout INTEGER,
  created_at INTEGER NOT NULL,
  settled_at INTEGER
);
CREATE INDEX IF NOT EXISTS jackpot_rounds_room ON jackpot_rounds(room, status);
CREATE TABLE IF NOT EXISTS jackpot_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id TEXT NOT NULL REFERENCES jackpot_rounds(id),
  user_id TEXT,                   -- NULL = demo bot (house)
  amount INTEGER NOT NULL,
  ticket_from INTEGER NOT NULL,
  payout INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jackpot_entries_round ON jackpot_entries(round_id, id);
CREATE INDEX IF NOT EXISTS jackpot_entries_user ON jackpot_entries(user_id, created_at);

CREATE TABLE IF NOT EXISTS openid_nonces (
  nonce TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- Every wager across instant/stateful bets, PvP seats (humans only, cancelled games excluded) and crash bets.
-- Responsible-gambling limits, session summaries, AML turnover and live RTP all read from here.
CREATE VIEW IF NOT EXISTS wagers AS
  SELECT user_id, game, stake, payout, created_at, settled_at, CASE WHEN status = 'settled' THEN 1 ELSE 0 END AS settled, id AS ref FROM bets
  UNION ALL
  SELECT s.user_id, g.type, s.stake, s.payout, s.created_at, g.settled_at, CASE WHEN g.status = 'settled' THEN 1 ELSE 0 END, g.id
    FROM pvp_seats s JOIN pvp_games g ON g.id = s.game_id WHERE s.user_id IS NOT NULL AND g.status != 'cancelled'
  UNION ALL
  SELECT b.user_id, 'crash', b.stake, b.payout, b.created_at, r.crash_at, CASE WHEN b.status = 'settled' THEN 1 ELSE 0 END, b.id
    FROM crash_bets b JOIN crash_rounds r ON r.id = b.round_id
  UNION ALL
  SELECT b.user_id, 'wheel', b.stake, b.payout, b.created_at, r.spin_ends_at, CASE WHEN b.status = 'settled' THEN 1 ELSE 0 END, b.id
    FROM wheel_bets b JOIN wheel_rounds r ON r.id = b.round_id
  UNION ALL
  SELECT e.user_id, 'jackpot', e.amount, e.payout, e.created_at, r.settled_at, CASE WHEN r.status = 'settled' THEN 1 ELSE 0 END, r.id
    FROM jackpot_entries e JOIN jackpot_rounds r ON r.id = e.round_id WHERE e.user_id IS NOT NULL AND r.status != 'refunded';

-- Retention
CREATE TABLE IF NOT EXISTS reward_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,             -- rakeback | daily | rain | affiliate | promo_code
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
  updated_at INTEGER NOT NULL,
  min_stake INTEGER,              -- per-game limits (mF); NULL = global limit. Only ever tighter than global.
  max_stake INTEGER,
  max_win INTEGER
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,            -- JSON
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);

-- Cases are data, not code: every edit creates a new immutable version; bets reference the version.
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  current_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS case_versions (
  case_id TEXT NOT NULL REFERENCES cases(id),
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  items TEXT NOT NULL,            -- JSON [{name, value (Frags), weight}]
  price INTEGER NOT NULL,         -- Frags, = ⌈EV / (1 − edge)⌉
  rtp REAL NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (case_id, version)
);

-- Promo ("flash") codes and their redemptions.
CREATE TABLE IF NOT EXISTS promo_codes (
  code TEXT PRIMARY KEY,
  amount INTEGER NOT NULL,        -- mF per redemption
  max_uses INTEGER NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  min_level INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS promo_redemptions (
  code TEXT NOT NULL REFERENCES promo_codes(code),
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (code, user_id)
);

CREATE TABLE IF NOT EXISTS player_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS player_notes_user ON player_notes(user_id, created_at);
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

/** A player's name in public lists (live feed, crash, wheel, jackpot, PvP); `u` is the users alias. */
export const PUBLIC_NAME = "CASE WHEN u.hide_public = 1 THEN 'Hidden player' ELSE u.display_name END";

/** The built-in cases as version 1. Idempotent; edits from the backoffice become version 2, 3, … */
const sq = (v: string) => `'${v.replace(/'/g, "''")}'`;
export const CASE_SEED = SAMPLE_CASES.map((c, i) => `
INSERT INTO cases (id, name, enabled, sort, current_version, created_at, updated_at) VALUES (${sq(c.id)}, ${sq(c.name)}, 1, ${i}, 1, 0, 0) ON CONFLICT (id) DO NOTHING;
INSERT INTO case_versions (case_id, version, name, items, price, rtp, created_by, created_at) VALUES (${sq(c.id)}, 1, ${sq(c.name)}, ${sq(JSON.stringify(c.items))}, ${priceCase(c)}, ${caseRtp(c)}, NULL, 0) ON CONFLICT (case_id, version) DO NOTHING;`).join('');

/**
 * Keeps seed-managed crates on the current line-up: a crate whose current version came from the seed
 * (created_by NULL) and whose items differ gets the new list as its next version. Versions an operator
 * published are never touched, and old versions stay verifiable. Idempotent.
 */
export const CASE_SYNC = SAMPLE_CASES.map((c, i) => {
  const items = sq(JSON.stringify(c.items));
  return `
INSERT INTO case_versions (case_id, version, name, items, price, rtp, created_by, created_at)
  SELECT c.id, c.current_version + 1, ${sq(c.name)}, ${items}, ${priceCase(c)}, ${caseRtp(c)}, NULL, 0
  FROM cases c JOIN case_versions v ON v.case_id = c.id AND v.version = c.current_version
  WHERE c.id = ${sq(c.id)} AND v.created_by IS NULL AND v.items <> ${items};
UPDATE cases SET current_version = (SELECT MAX(version) FROM case_versions WHERE case_id = ${sq(c.id)}), name = ${sq(c.name)}, sort = ${i}
  WHERE id = ${sq(c.id)} AND current_version < (SELECT MAX(version) FROM case_versions WHERE case_id = ${sq(c.id)} AND created_by IS NULL);`;
}).join('');

/** Seed crates that left the line-up with the twenty-crate catalogue. Disabled once (still verifiable). */
export const RETIRED_CASES = ['scrap-box', 'road-sign', 'tech-trash', 'vault'];
export const CASE_RETIRE = `
UPDATE cases SET enabled = 0 WHERE id IN (${RETIRED_CASES.map(sq).join(', ')})
  AND (SELECT created_by FROM case_versions v WHERE v.case_id = cases.id AND v.version = cases.current_version) IS NULL;`;

/** One-shot SQLite steps, tracked in PRAGMA user_version (the schema and seed above are idempotent). */
const SQLITE_STEPS: string[] = [CASE_RETIRE];

/** Opens (and migrates) a SQLite database. Synchronous so tests and the browser demo can set up in one step. */
export function openDb(path = ':memory:'): DB {
  const raw = new DatabaseSync(path);
  raw.exec(PRAGMAS);
  const legacy = raw.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get() !== undefined;
  if (legacy) migrateLegacy(raw);
  raw.exec(SCHEMA);
  raw.exec(CASE_SEED);
  raw.exec(CASE_SYNC);
  const done = Number((raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  for (let v = done; v < SQLITE_STEPS.length; v++) raw.exec(SQLITE_STEPS[v]);
  if (done < SQLITE_STEPS.length) raw.exec(`PRAGMA user_version = ${SQLITE_STEPS.length}`);
  return new SqliteDb(raw);
}

/** Additive migrations for demo databases created by earlier versions. */
function migrateLegacy(raw: Raw): void {
  const cols = (t: string) => (raw.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
  const u = cols('users');
  if (!u.includes('crew_code')) raw.exec('ALTER TABLE users ADD COLUMN crew_code TEXT');
  if (!u.includes('role')) raw.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'");
  if (!u.includes('totp_secret')) raw.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT');
  if (!u.includes('totp_pending')) raw.exec('ALTER TABLE users ADD COLUMN totp_pending TEXT');
  if (!u.includes('totp_pending_at')) raw.exec('ALTER TABLE users ADD COLUMN totp_pending_at INTEGER');
  if (!u.includes('name_changed_at')) raw.exec('ALTER TABLE users ADD COLUMN name_changed_at INTEGER');
  if (!u.includes('hide_public')) raw.exec('ALTER TABLE users ADD COLUMN hide_public INTEGER NOT NULL DEFAULT 0');
  const sc = cols('sessions');
  if (!sc.includes('mfa_at')) raw.exec('ALTER TABLE sessions ADD COLUMN mfa_at INTEGER');
  if (!sc.includes('mfa_step')) raw.exec('ALTER TABLE sessions ADD COLUMN mfa_step INTEGER');
  const gf = cols('game_flags');
  if (gf.length && !gf.includes('min_stake')) raw.exec('ALTER TABLE game_flags ADD COLUMN min_stake INTEGER; ALTER TABLE game_flags ADD COLUMN max_stake INTEGER; ALTER TABLE game_flags ADD COLUMN max_win INTEGER;');
  raw.exec('DROP VIEW IF EXISTS wagers');
}

/** Runs fn in one transaction (nested calls join the outer one). Use the handle passed to fn. */
export function tx<T>(db: DB, fn: (db: DB) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}

export async function audit(db: DB, userId: string | null, event: string, data: unknown, now: number): Promise<void> {
  await db.prepare('INSERT INTO audit (user_id, event, data, created_at) VALUES (?, ?, ?, ?)').run(userId, event, JSON.stringify(data ?? null), now);
}
