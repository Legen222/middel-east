/**
 * Scrap Press (crash): one shared round at a time.
 *
 *   betting (6 s) ──▶ running ──(t = ln(crash) / RATE)──▶ crashed ──(3 s)──▶ next round
 *
 * Fairness: a chain of seeds is generated from a secret tip; only the terminal hash is published.
 * The chain's client seed is the value of a beacon round chosen *after* the terminal hash was stored,
 * so the operator cannot search for a favourable chain. Round i uses seed_i; after the round the seed
 * is revealed and sha256(seed_i) must equal seed_{i−1} (or the terminal hash for i = 0).
 *
 * Multiplier curve m(t) = e^(RATE · t), t in ms since the round started. Auto cash-out targets are
 * settled when the round crashes; a manual cash-out pays the current multiplier (floored to 0.01) if it
 * arrives before the crash time. The crash point is computed at round creation and never leaves the
 * server before the crash.
 */

import { randomBytes } from 'node:crypto';

import { buildChain, crashPoint, sha256Hex } from '../../engine/src/index';
import type { Beacon } from './beacon';
import { type Config, MF_PER_FRAG } from './config';
import { type DB, tx } from './db';
import { fail } from './errors';
import { assertGameEnabled } from './flags';
import { checkBet } from './rg';
import { HOUSE, transfer, userAccount } from './wallet';

export const RATE = 0.00006; // per ms → 2× after 11.6 s, 10× after 38 s, 100× after 77 s
export const BETTING_MS = 6000;
export const PAUSE_MS = 3000;
export const MIN_TARGET = 101;
export const MAX_TARGET = 1_000_000; // 10 000×

export const multiplierAt = (elapsedMs: number) => Math.floor(100 * Math.exp(RATE * Math.max(0, elapsedMs)) + 1e-9); // ×100
export const durationFor = (crash100: number) => Math.ceil(Math.log(crash100 / 100) / RATE);

interface ChainRow { id: number; terminal_hash: string; tip: string; length: number; beacon_round: number; client_seed: string | null }
interface RoundRow { id: number; chain_id: number; idx: number; seed: string; crash: number; betting_ends_at: number; crash_at: number; status: 'betting' | 'running' | 'crashed' }
interface BetRow { id: string; round_id: number; user_id: string; stake: number; target: number; cashed_at: number | null; payout: number; status: 'open' | 'settled'; created_at: number }

export type CrashEvent =
  | { type: 'betting'; round: number; bettingEndsAt: number }
  | { type: 'running'; round: number; startedAt: number }
  | { type: 'crashed'; round: number; crash: number; seed: string }
  | { type: 'bet'; round: number; name: string; stake: number; target: number }
  | { type: 'cashout'; round: number; name: string; multiplier: number; payout: number };

export class CrashService {
  private seeds: string[] = [];
  private listeners = new Set<(e: CrashEvent) => void>();

  constructor(private db: DB, private cfg: Config, private beacon: Beacon, private chainLength = 100_000) {}

  on(fn: (e: CrashEvent) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(e: CrashEvent) { for (const l of this.listeners) { try { l(e); } catch { /* a broken client must not stop the game */ } } }

  private chain(): ChainRow | undefined {
    return this.db.prepare('SELECT * FROM crash_chains ORDER BY id DESC LIMIT 1').get() as unknown as ChainRow | undefined;
  }
  private current(): RoundRow | undefined {
    return this.db.prepare('SELECT * FROM crash_rounds ORDER BY id DESC LIMIT 1').get() as unknown as RoundRow | undefined;
  }

  /** Creates the chain if needed and loads its seeds into memory. */
  private ensureChain(now: number): ChainRow {
    let c = this.chain();
    if (!c) {
      const tip = randomBytes(32).toString('hex');
      const { terminal } = buildChain(tip, this.chainLength);
      this.db.prepare('INSERT INTO crash_chains (terminal_hash, tip, length, beacon_round, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(terminal, tip, this.chainLength, this.beacon.roundAt(now) + 2, now);
      c = this.chain()!;
    }
    if (this.seeds.length !== c.length) this.seeds = buildChain(c.tip, c.length).seeds;
    return c;
  }

  /** Advances the state machine. Call every ~200 ms in production; tests call it with a fake clock. */
  async tick(now: number): Promise<void> {
    const c = this.ensureChain(now);
    if (!c.client_seed) {
      const v = await this.beacon.get(c.beacon_round, now);
      if (!v) return;
      this.db.prepare('UPDATE crash_chains SET client_seed = ? WHERE id = ?').run(v.randomness, c.id);
      c.client_seed = v.randomness;
    }
    const r = this.current();
    if (!r || (r.status === 'crashed' && now >= r.crash_at + PAUSE_MS)) {
      const idx = r ? r.idx + 1 : 0;
      if (idx >= c.length) return; // chain exhausted: a new chain must be published first
      const seed = this.seeds[idx];
      const crash = Math.round(crashPoint(seed, c.client_seed).crash * 100);
      const bettingEndsAt = now + BETTING_MS;
      const info = this.db.prepare("INSERT INTO crash_rounds (chain_id, idx, seed, crash, betting_ends_at, crash_at, status) VALUES (?, ?, ?, ?, ?, ?, 'betting')")
        .run(c.id, idx, seed, crash, bettingEndsAt, bettingEndsAt + durationFor(crash));
      this.emit({ type: 'betting', round: Number(info.lastInsertRowid), bettingEndsAt });
      return;
    }
    if (r.status === 'betting' && now >= r.betting_ends_at) {
      this.db.prepare("UPDATE crash_rounds SET status = 'running' WHERE id = ?").run(r.id);
      this.emit({ type: 'running', round: r.id, startedAt: r.betting_ends_at });
    }
    if ((r.status === 'running' || r.status === 'betting') && now >= r.crash_at) this.crash(r, now);
  }

  private crash(r: RoundRow, now: number) {
    tx(this.db, () => {
      const open = this.db.prepare("SELECT * FROM crash_bets WHERE round_id = ? AND status = 'open'").all(r.id) as unknown as BetRow[];
      for (const b of open) {
        const payout = b.target <= r.crash ? Math.floor((b.stake * b.target) / 100) : 0;
        if (payout > 0) transfer(this.db, HOUSE, userAccount(b.user_id), payout, 'payout', b.id, now);
        this.db.prepare("UPDATE crash_bets SET payout = ?, status = 'settled' WHERE id = ?").run(payout, b.id);
      }
      this.db.prepare("UPDATE crash_rounds SET status = 'crashed' WHERE id = ?").run(r.id);
    });
    this.emit({ type: 'crashed', round: r.id, crash: r.crash / 100, seed: r.seed });
  }

  placeBet(userId: string, stake: number, target: number, now: number) {
    return tx(this.db, () => {
      assertGameEnabled(this.db, 'crash');
      const r = this.current();
      if (!r || r.status !== 'betting' || now >= r.betting_ends_at) fail('not_betting', 'Betting is closed. Wait for the next round.', 409);
      if (!Number.isInteger(target) || target < MIN_TARGET || target > MAX_TARGET) fail('invalid_params', 'Auto cash-out: 1.01× to 10,000×.');
      if (!Number.isSafeInteger(stake) || stake < this.cfg.minStake || stake > this.cfg.maxStake) fail('invalid_stake', `Stake: ${this.cfg.minStake / MF_PER_FRAG} to ${this.cfg.maxStake / MF_PER_FRAG} Frags.`);
      if ((stake * target) / 100 > this.cfg.maxWin) fail('max_win', `Max win is ${this.cfg.maxWin / MF_PER_FRAG} Frags: lower the stake or the auto cash-out.`);
      if (this.db.prepare('SELECT 1 FROM crash_bets WHERE round_id = ? AND user_id = ?').get(r!.id, userId)) fail('already_bet', 'You already placed a bet this round.', 409);
      checkBet(this.db, userId, stake, now);
      const id = randomBytes(10).toString('hex');
      transfer(this.db, userAccount(userId), HOUSE, stake, 'stake', id, now);
      this.db.prepare("INSERT INTO crash_bets (id, round_id, user_id, stake, target, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)").run(id, r!.id, userId, stake, target, now);
      this.emit({ type: 'bet', round: r!.id, name: this.name(userId), stake: stake / MF_PER_FRAG, target: target / 100 });
      return { id, round: r!.id };
    });
  }

  cashout(userId: string, now: number) {
    return tx(this.db, () => {
      const r = this.current();
      if (!r || r.status === 'crashed' || now < r.betting_ends_at || now >= r.crash_at) fail('not_running', 'No round is running right now.', 409);
      const b = this.db.prepare("SELECT * FROM crash_bets WHERE round_id = ? AND user_id = ? AND status = 'open'").get(r!.id, userId) as unknown as BetRow | undefined;
      if (!b) fail('no_bet', 'No open bet in this round.', 404);
      const m = Math.min(multiplierAt(now - r!.betting_ends_at), b!.target, r!.crash - 1);
      const payout = Math.floor((b!.stake * m) / 100);
      transfer(this.db, HOUSE, userAccount(userId), payout, 'payout', b!.id, now);
      this.db.prepare("UPDATE crash_bets SET cashed_at = ?, payout = ?, status = 'settled' WHERE id = ?").run(m, payout, b!.id);
      this.emit({ type: 'cashout', round: r!.id, name: this.name(userId), multiplier: m / 100, payout: payout / MF_PER_FRAG });
      return { multiplier: m / 100, payout: payout / MF_PER_FRAG };
    });
  }

  private name(userId: string) {
    return (this.db.prepare('SELECT display_name AS n FROM users WHERE id = ?').get(userId) as { n: string } | undefined)?.n ?? '?';
  }

  /** Public state. The crash point and seed of the current round stay hidden until it has crashed. */
  state(now: number, viewerId: string | null) {
    const c = this.chain();
    const r = this.current();
    const history = (this.db.prepare("SELECT id, idx, crash, seed FROM crash_rounds WHERE status = 'crashed' ORDER BY id DESC LIMIT 20").all() as { id: number; idx: number; crash: number; seed: string }[])
      .map((h) => ({ round: h.id, index: h.idx, crash: h.crash / 100, seed: h.seed }));
    const bets = r ? (this.db.prepare('SELECT * FROM crash_bets WHERE round_id = ? ORDER BY created_at').all(r.id) as unknown as BetRow[]).map((b) => ({
      name: this.name(b.user_id), you: b.user_id === viewerId, stake: b.stake / MF_PER_FRAG, target: b.target / 100,
      cashedAt: b.cashed_at === null ? null : b.cashed_at / 100, payout: b.status === 'settled' ? b.payout / MF_PER_FRAG : null,
    })) : [];
    return {
      now, rate: RATE,
      chain: c ? { terminalHash: c.terminal_hash, length: c.length, clientSeed: c.client_seed, beaconRound: c.beacon_round, beacon: { name: this.beacon.name, trustless: this.beacon.trustless, verifyUrl: this.beacon.verifyUrl(c.beacon_round) } } : null,
      round: r ? {
        id: r.id, index: r.idx, status: r.status, bettingEndsAt: r.betting_ends_at,
        crash: r.status === 'crashed' ? r.crash / 100 : null, seed: r.status === 'crashed' ? r.seed : null,
        previousSeed: r.idx === 0 ? c?.terminal_hash ?? null : this.revealedPrev(r),
      } : null,
      bets, history,
    };
  }

  /** The previous round's seed is public once that round crashed, so players can check the link. */
  private revealedPrev(r: RoundRow): string | null {
    const prev = this.db.prepare("SELECT seed FROM crash_rounds WHERE chain_id = ? AND idx = ? AND status = 'crashed'").get(r.chain_id, r.idx - 1) as { seed: string } | undefined;
    return prev?.seed ?? null;
  }
}

export const verifyCrashLink = (seed: string, previous: string) => sha256Hex(seed) === previous;
