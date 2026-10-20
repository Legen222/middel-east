/**
 * Bandit Wheel: one shared round at a time, like the Big Wheel at Rust's Bandit Camp.
 *
 *   betting (15 s) ──▶ spinning (7 s) ──▶ settled ──(3 s)──▶ next round
 *
 * Fairness: the same scheme as the Scrap Press. A chain of round seeds is built from a secret tip and only
 * the terminal hash is published; the chain's client seed is a beacon value fixed after publication.
 * Round i: field = ⌊f · 25⌋ with f = first float of FairStream(seed_i, clientSeed, 0). The field is computed
 * when the round is created and leaves the server only when betting has closed; the seed follows at the end,
 * and sha256(seed_i) must equal seed_{i−1}.
 * Players may bet on several field types per round (one bet per type). Only the leader calls tick().
 */

import { randomBytes } from 'node:crypto';

import { FairStream, WHEEL_COUNTS, WHEEL_FIELDS, WHEEL_LAYOUT, buildChain, spinWheel, wheelPayout, type WheelField } from '../../engine/src/index';
import type { Beacon } from './beacon';
import { type ChainRow, latestChain, publishChain } from './chains';
import { type Config, MF_PER_FRAG } from './config';
import { type DB, audit, tx } from './db';
import { fail } from './errors';
import { bus } from './events';
import { assertGameEnabled, gameConfig } from './flags';
import { checkBet } from './rg';
import { HOUSE, transfer, userAccount } from './wallet';

export const WHEEL_BETTING_MS = 15_000;
export const WHEEL_SPIN_MS = 7_000;
export const WHEEL_PAUSE_MS = 3_000;

interface RoundRow { id: number; chain_id: number; idx: number; seed: string; field_index: number; betting_ends_at: number; spin_ends_at: number; status: 'betting' | 'spinning' | 'settled' }
interface BetRow { id: string; round_id: number; user_id: string; field: WheelField; stake: number; payout: number; status: 'open' | 'settled'; created_at: number }

export type WheelEvent =
  | { type: 'betting'; round: number; bettingEndsAt: number }
  | { type: 'spin'; round: number; index: number; field: WheelField; spinEndsAt: number }
  | { type: 'result'; round: number; index: number; field: WheelField; seed: string }
  | { type: 'bet'; round: number; name: string; field: WheelField; stake: number };

const currentOf = async (db: DB) => (await db.prepare('SELECT * FROM wheel_rounds ORDER BY id DESC LIMIT 1').get()) as RoundRow | undefined;

export class WheelService {
  private seeds: string[] = [];
  private seedsFor = -1;
  constructor(private db: DB, private cfg: Config, private beacon: Beacon, private chainLength = 100_000) {}

  private emit(db: DB, e: WheelEvent) { db.afterCommit(() => bus.publish({ topic: 'wheel', event: e })); }

  private async ensureChain(now: number): Promise<ChainRow> {
    const c = (await latestChain(this.db, 'wheel')) ?? (await publishChain(this.db, 'wheel', this.chainLength, this.beacon, now));
    if (this.seedsFor !== c.id) { this.seeds = buildChain(c.tip, c.length).seeds; this.seedsFor = c.id; }
    return c;
  }

  /** Backoffice: publish a new chain now. The running round finishes on the old one. */
  rotateChain(actorId: string, now: number) {
    return tx(this.db, async (db) => {
      const c = await publishChain(db, 'wheel', this.chainLength, this.beacon, now);
      await audit(db, actorId, 'admin_chain_rotate', { game: 'wheel', chain: c.id, terminalHash: c.terminal_hash, beaconRound: c.beacon_round }, now);
      return { id: c.id, terminalHash: c.terminal_hash, length: c.length, beaconRound: c.beacon_round };
    });
  }

  async tick(now: number): Promise<void> {
    const c = await this.ensureChain(now);
    if (!c.client_seed) {
      const v = await this.beacon.get(c.beacon_round, now);
      if (v) {
        await this.db.prepare('UPDATE wheel_chains SET client_seed = ? WHERE id = ?').run(v.randomness, c.id);
        c.client_seed = v.randomness;
      }
    }
    await tx(this.db, async (db) => {
      const r = await currentOf(db);
      if (!r || (r.status === 'settled' && now >= r.spin_ends_at + WHEEL_PAUSE_MS)) {
        if (!c.client_seed) return; // a new chain waits for its beacon round; the last round already finished
        const idx = r && r.chain_id === c.id ? r.idx + 1 : 0;
        if (idx >= c.length) { await publishChain(db, 'wheel', this.chainLength, this.beacon, now); return; } // used up: the next tick starts the new chain
        const seed = this.seeds[idx];
        const { index } = spinWheel(new FairStream(seed, c.client_seed!, 0));
        const bettingEndsAt = now + WHEEL_BETTING_MS;
        const row = (await db.prepare("INSERT INTO wheel_rounds (chain_id, idx, seed, field_index, betting_ends_at, spin_ends_at, status) VALUES (?, ?, ?, ?, ?, ?, 'betting') RETURNING id")
          .get(c.id, idx, seed, index, bettingEndsAt, bettingEndsAt + WHEEL_SPIN_MS)) as { id: number };
        this.emit(db, { type: 'betting', round: row.id, bettingEndsAt });
        return;
      }
      if (r.status === 'betting' && now >= r.betting_ends_at) {
        await db.prepare("UPDATE wheel_rounds SET status = 'spinning' WHERE id = ?").run(r.id);
        this.emit(db, { type: 'spin', round: r.id, index: r.field_index, field: WHEEL_LAYOUT[r.field_index], spinEndsAt: r.spin_ends_at });
        return;
      }
      if (r.status === 'spinning' && now >= r.spin_ends_at) {
        const field = WHEEL_LAYOUT[r.field_index];
        const open = (await db.prepare("SELECT * FROM wheel_bets WHERE round_id = ? AND status = 'open'").all(r.id)) as BetRow[];
        for (const b of open) {
          const payout = b.field === field ? Math.floor(b.stake * wheelPayout(field)) : 0;
          if (payout > 0) await transfer(db, HOUSE, userAccount(b.user_id), payout, 'payout', b.id, now);
          await db.prepare("UPDATE wheel_bets SET payout = ?, status = 'settled' WHERE id = ?").run(payout, b.id);
        }
        await db.prepare("UPDATE wheel_rounds SET status = 'settled' WHERE id = ?").run(r.id);
        this.emit(db, { type: 'result', round: r.id, index: r.field_index, field, seed: r.seed });
      }
    });
  }

  placeBet(userId: string, field: WheelField, stake: number, now: number) {
    return tx(this.db, async (db) => {
      await assertGameEnabled(db, 'wheel');
      const cfg = await gameConfig(db, this.cfg, 'wheel');
      if (!WHEEL_FIELDS.includes(field)) fail('invalid_params', 'Field: 1, 3, 5, 10 or 20.');
      const r = await currentOf(db);
      if (!r || r.status !== 'betting' || now >= r.betting_ends_at) fail('not_betting', 'Betting is closed. Wait for the next spin.', 409);
      if (!Number.isSafeInteger(stake) || stake < cfg.minStake || stake > cfg.maxStake) fail('invalid_stake', `Stake: ${cfg.minStake / MF_PER_FRAG} to ${cfg.maxStake / MF_PER_FRAG} Frags.`);
      if (stake * wheelPayout(field) > cfg.maxWin) fail('max_win', `Max win is ${cfg.maxWin / MF_PER_FRAG} Frags: lower the stake.`);
      if (await db.prepare('SELECT 1 FROM wheel_bets WHERE round_id = ? AND user_id = ? AND field = ?').get(r!.id, userId, field)) fail('already_bet', 'You already bet on this field this round.', 409);
      await checkBet(db, userId, stake, now);
      const id = randomBytes(10).toString('hex');
      await transfer(db, userAccount(userId), HOUSE, stake, 'stake', id, now);
      await db.prepare("INSERT INTO wheel_bets (id, round_id, user_id, field, stake, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)").run(id, r!.id, userId, field, stake, now);
      const name = ((await db.prepare('SELECT display_name AS n FROM users WHERE id = ?').get(userId)) as { n: string }).n;
      this.emit(db, { type: 'bet', round: r!.id, name, field, stake: stake / MF_PER_FRAG });
      return { id, round: r!.id };
    });
  }

  /** Public state. The field stays hidden while bets are open; the seed until the round is settled. */
  async state(now: number, viewerId: string | null) {
    const c = await latestChain(this.db, 'wheel');
    const r = await currentOf(this.db);
    const bets = r ? ((await this.db.prepare(`SELECT b.*, u.display_name AS name FROM wheel_bets b JOIN users u ON u.id = b.user_id
      WHERE b.round_id = ? ORDER BY b.created_at, b.id`).all(r.id)) as (BetRow & { name: string })[]) : [];
    const history = ((await this.db.prepare("SELECT id, field_index, seed FROM wheel_rounds WHERE status = 'settled' ORDER BY id DESC LIMIT 30").all()) as { id: number; field_index: number; seed: string }[])
      .map((h) => ({ round: h.id, index: h.field_index, field: WHEEL_LAYOUT[h.field_index], seed: h.seed }));
    const revealed = r && r.status !== 'betting';
    const prev = r && r.idx > 0 ? ((await this.db.prepare("SELECT seed FROM wheel_rounds WHERE chain_id = ? AND idx = ? AND status = 'settled'").get(r.chain_id, r.idx - 1)) as { seed: string } | undefined) : undefined;
    return {
      now, layout: WHEEL_LAYOUT, payouts: Object.fromEntries(WHEEL_FIELDS.map((f) => [f, wheelPayout(f)])), counts: WHEEL_COUNTS,
      chain: c ? { terminalHash: c.terminal_hash, length: c.length, clientSeed: c.client_seed, beaconRound: c.beacon_round, beacon: { name: this.beacon.name, trustless: this.beacon.trustless, verifyUrl: this.beacon.verifyUrl(c.beacon_round) } } : null,
      round: r ? {
        id: r.id, index: r.idx, status: r.status, bettingEndsAt: r.betting_ends_at, spinEndsAt: r.spin_ends_at,
        fieldIndex: revealed ? r.field_index : null, field: revealed ? WHEEL_LAYOUT[r.field_index] : null,
        seed: r.status === 'settled' ? r.seed : null, previousSeed: r.idx === 0 ? c?.terminal_hash ?? null : prev?.seed ?? null,
      } : null,
      bets: bets.map((b) => ({ name: b.name, you: b.user_id === viewerId, field: b.field, stake: b.stake / MF_PER_FRAG, payout: b.status === 'settled' ? b.payout / MF_PER_FRAG : null })),
      totals: Object.fromEntries(WHEEL_FIELDS.map((f) => [f, bets.filter((b) => b.field === f).reduce((a, b) => a + b.stake, 0) / MF_PER_FRAG])),
      history,
    };
  }
}
