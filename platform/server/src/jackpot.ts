/**
 * Jackpot: everyone adds Scrap to one pot, every 0.001 Scrap is a ticket, one ticket wins the pot minus a
 * 4 % fee. Two rooms, like the "High Rollers" / "Low Ballers" split competitors use:
 *   high  entries 10 Scrap up to the max stake      low  entries 1 to 50 Scrap
 *
 * Lifecycle  open ──(second player)──▶ counting (30 s, or 40 entries) ──▶ locked ──(beacon)──▶ settled
 *                 └─(alone for 10 min: full refund)─▶ refunded
 *
 * Fairness: a server seed per round, its SHA-256 shown from the first entry. On lock the round picks beacon
 * round = current + 2, whose value nobody can know while entries are accepted. Winning ticket =
 * ⌊f · total⌋, f = first float of FairStream(serverSeed, beaconValue, 0). The seed is revealed at settlement.
 * Money: entries go to `house:jackpot-escrow`; the winner gets ⌊total · 0.96⌋, the rest goes to the bankroll.
 * Demo bots (demo mode only) are funded by the bankroll.
 */

import { randomBytes } from 'node:crypto';

import { EDGE, FairStream, drawJackpot, newServerSeed } from '../../engine/src/index';
import type { Beacon } from './beacon';
import { type Config, MF_PER_FRAG, frags } from './config';
import { type DB, PUBLIC_NAME, audit, tx } from './db';
import { fail } from './errors';
import { bus } from './events';
import { assertGameEnabled, gameConfig } from './flags';
import { checkBet } from './rg';
import { HOUSE, transfer, userAccount } from './wallet';

export const JACKPOT_ESCROW = 'house:jackpot-escrow';
export const JACKPOT_ROOMS = {
  high: { label: 'High Rollers', min: frags(10), max: Infinity },
  low: { label: 'Low Ballers', min: frags(1), max: frags(50) },
} as const;
export type JackpotRoom = keyof typeof JACKPOT_ROOMS;
export const JACKPOT_COUNTDOWN_MS = 30_000;
export const JACKPOT_MAX_ENTRIES = 40;
export const JACKPOT_MAX_PER_PLAYER = 5;
export const JACKPOT_REFUND_MS = 10 * 60_000;

interface RoundRow {
  id: string; room: JackpotRoom; status: 'open' | 'counting' | 'locked' | 'settled' | 'refunded'; server_seed: string; server_hash: string;
  total: number; countdown_ends_at: number | null; beacon_round: number | null; beacon_value: string | null; ticket: number | null;
  winner_entry: number | null; payout: number | null; created_at: number; settled_at: number | null;
}
interface EntryRow { id: number; round_id: string; user_id: string | null; amount: number; ticket_from: number; payout: number; created_at: number; name?: string | null }

const rnd = (n: number) => new Uint8Array(randomBytes(n));
const roomOf = (r: string): JackpotRoom => (r === 'high' || r === 'low' ? r : fail('not_found', 'Unknown jackpot room.', 404));
const activeRound = async (db: DB, room: JackpotRoom) => (await db.prepare("SELECT * FROM jackpot_rounds WHERE room = ? AND status IN ('open', 'counting', 'locked') ORDER BY created_at DESC LIMIT 1").get(room)) as RoundRow | undefined;
const entriesOf = async (db: DB, id: string) => (await db.prepare(`SELECT e.*, ${PUBLIC_NAME} AS name FROM jackpot_entries e LEFT JOIN users u ON u.id = e.user_id WHERE e.round_id = ? ORDER BY e.id`).all(id)) as EntryRow[];
const announce = (db: DB, room: JackpotRoom) => db.afterCommit(() => bus.publish({ topic: 'jackpot', event: { type: 'update', room } }));

export class JackpotService {
  constructor(private db: DB, private cfg: Config, private beacon: Beacon) {}

  /** Adds an entry (userId = null → demo bot). Opens a round when none is running. */
  enter(userId: string | null, roomIn: string, amount: number, now: number) {
    return tx(this.db, async (db) => {
      const room = roomOf(roomIn);
      await assertGameEnabled(db, 'jackpot');
      const cfg = await gameConfig(db, this.cfg, 'jackpot');
      const lim = JACKPOT_ROOMS[room];
      const max = Math.min(lim.max, cfg.maxStake);
      if (!Number.isSafeInteger(amount) || amount < Math.max(lim.min, cfg.minStake) || amount > max) {
        fail('invalid_stake', `${lim.label}: ${Math.max(lim.min, cfg.minStake) / MF_PER_FRAG} to ${max / MF_PER_FRAG} Scrap per entry.`);
      }
      let r = await activeRound(db, room);
      if (r && r.status === 'locked') fail('jackpot_locked', 'This pot is being drawn. The next one opens in a moment.', 409);
      if (r && r.status === 'counting' && now >= r.countdown_ends_at!) fail('jackpot_locked', 'This pot is closed. The next one opens in a moment.', 409);
      if (!r) {
        const id = randomBytes(8).toString('hex');
        const { seed, hash } = newServerSeed(rnd);
        await db.prepare("INSERT INTO jackpot_rounds (id, room, status, server_seed, server_hash, total, created_at) VALUES (?, ?, 'open', ?, ?, 0, ?)").run(id, room, seed, hash, now);
        r = (await db.prepare('SELECT * FROM jackpot_rounds WHERE id = ?').get(id)) as RoundRow;
      }
      const entries = await entriesOf(db, r.id);
      if (entries.length >= JACKPOT_MAX_ENTRIES) fail('jackpot_full', 'This pot is full.', 409);
      if (userId && entries.filter((e) => e.user_id === userId).length >= JACKPOT_MAX_PER_PLAYER) fail('too_many_entries', `At most ${JACKPOT_MAX_PER_PLAYER} entries per pot.`, 409);
      if ((r.total + amount) * (1 - EDGE.jackpot) > cfg.maxWin) fail('max_win', 'This entry would push the pot over the max win.');
      if (userId) {
        await checkBet(db, userId, amount, now);
        await transfer(db, userAccount(userId), JACKPOT_ESCROW, amount, 'stake', r.id, now);
      } else {
        if (!this.cfg.demo) fail('no_bots', 'Bots are only available in demo mode.', 403);
        await transfer(db, HOUSE, JACKPOT_ESCROW, amount, 'stake', r.id, now);
      }
      await db.prepare('INSERT INTO jackpot_entries (round_id, user_id, amount, ticket_from, created_at) VALUES (?, ?, ?, ?, ?)').run(r.id, userId, amount, r.total, now);
      const total = r.total + amount;
      const players = new Set([...entries.map((e) => e.user_id ?? `bot:${e.id}`), userId ?? 'bot:new']).size;
      let status = r.status;
      let countdown = r.countdown_ends_at;
      if (status === 'open' && players >= 2) { status = 'counting'; countdown = now + JACKPOT_COUNTDOWN_MS; }
      if (entries.length + 1 >= JACKPOT_MAX_ENTRIES) countdown = Math.min(countdown ?? now, now); // full: draw at once
      await db.prepare('UPDATE jackpot_rounds SET total = ?, status = ?, countdown_ends_at = ? WHERE id = ?').run(total, status, countdown, r.id);
      announce(db, room);
      return { round: r.id, total: total / MF_PER_FRAG };
    });
  }

  /** Demo only: a bot joins with a random amount between the room minimum and the current pot (capped). */
  async bot(userId: string, roomIn: string, now: number) {
    const room = roomOf(roomIn);
    const r = await activeRound(this.db, room);
    if (!r || !(await this.db.prepare('SELECT 1 FROM jackpot_entries WHERE round_id = ? AND user_id = ?').get(r.id, userId))) fail('invalid_action', 'Join the pot first, then call a bot.', 409);
    const lim = JACKPOT_ROOMS[room];
    const cfg = await gameConfig(this.db, this.cfg, 'jackpot');
    const hi = Math.min(lim.max, cfg.maxStake, Math.max(lim.min, r!.total));
    const amount = Math.round((lim.min + Math.random() * (hi - lim.min)) / MF_PER_FRAG) * MF_PER_FRAG;
    return this.enter(null, room, Math.max(lim.min, amount), now);
  }

  /** Locks finished countdowns, draws locked pots whose beacon round is out, refunds lonely pots. */
  async tick(now: number): Promise<number> {
    const rounds = (await this.db.prepare("SELECT * FROM jackpot_rounds WHERE status IN ('open', 'counting', 'locked')").all()) as RoundRow[];
    let settled = 0;
    for (const r0 of rounds) {
      if (r0.status === 'counting' && now >= r0.countdown_ends_at!) {
        await tx(this.db, async (db) => {
          const r = (await db.prepare('SELECT * FROM jackpot_rounds WHERE id = ?').get(r0.id)) as RoundRow;
          if (r.status !== 'counting') return;
          await db.prepare("UPDATE jackpot_rounds SET status = 'locked', beacon_round = ? WHERE id = ?").run(this.beacon.roundAt(now) + 2, r.id);
          announce(db, r.room);
        });
      } else if (r0.status === 'locked') {
        const v = await this.beacon.get(r0.beacon_round!, now);
        if (v && (await this.settle(r0.id, v.randomness, now))) settled++;
      } else if (r0.status === 'open' && now - r0.created_at >= JACKPOT_REFUND_MS) {
        await this.refund(r0.id, now);
      }
    }
    return settled;
  }

  private settle(id: string, beaconValue: string, now: number): Promise<boolean> {
    return tx(this.db, async (db) => {
      const r = (await db.prepare('SELECT * FROM jackpot_rounds WHERE id = ?').get(id)) as RoundRow;
      if (r.status !== 'locked') return false;
      const entries = await entriesOf(db, id);
      const o = drawJackpot(new FairStream(r.server_seed, beaconValue, 0), entries.map((e) => ({ amount: e.amount })));
      const win = entries[o.winner];
      await transfer(db, JACKPOT_ESCROW, win.user_id ? userAccount(win.user_id) : HOUSE, o.payout, 'payout', id, now);
      if (o.total - o.payout > 0) await transfer(db, JACKPOT_ESCROW, HOUSE, o.total - o.payout, 'payout', id, now);
      await db.prepare('UPDATE jackpot_entries SET payout = ? WHERE id = ?').run(o.payout, win.id);
      await db.prepare("UPDATE jackpot_rounds SET status = 'settled', beacon_value = ?, ticket = ?, winner_entry = ?, payout = ?, settled_at = ? WHERE id = ?")
        .run(beaconValue, o.ticket, win.id, o.payout, now, id);
      announce(db, r.room);
      return true;
    });
  }

  private refund(id: string, now: number): Promise<void> {
    return tx(this.db, async (db) => {
      const r = (await db.prepare('SELECT * FROM jackpot_rounds WHERE id = ?').get(id)) as RoundRow;
      if (r.status !== 'open') return;
      for (const e of await entriesOf(db, id)) await transfer(db, JACKPOT_ESCROW, e.user_id ? userAccount(e.user_id) : HOUSE, e.amount, 'refund', id, now);
      await db.prepare("UPDATE jackpot_rounds SET status = 'refunded', settled_at = ? WHERE id = ?").run(now, id);
      await audit(db, null, 'jackpot_refunded', { round: id, total: r.total }, now);
      announce(db, r.room);
    });
  }

  async state(roomIn: string, now: number, viewerId: string | null) {
    const room = roomOf(roomIn);
    const view = async (r: RoundRow) => {
      const entries = await entriesOf(this.db, r.id);
      const winner = entries.find((e) => e.id === r.winner_entry);
      return {
        id: r.id, room: r.room, status: r.status, total: r.total / MF_PER_FRAG, countdownEndsAt: r.countdown_ends_at, settledAt: r.settled_at,
        entries: entries.map((e) => ({
          name: e.user_id ? e.name : 'Demo bot', bot: !e.user_id, you: viewerId !== null && e.user_id === viewerId, amount: e.amount / MF_PER_FRAG,
          chance: r.total ? e.amount / r.total : 0, ticketFrom: e.ticket_from, ticketTo: e.ticket_from + e.amount - 1,
        })),
        winner: winner ? { name: winner.user_id ? winner.name : 'Demo bot', you: winner.user_id === viewerId, chance: winner.amount / r.total, payout: (r.payout ?? 0) / MF_PER_FRAG, ticket: r.ticket } : null,
        fairness: {
          serverSeedHash: r.server_hash, serverSeed: r.status === 'settled' ? r.server_seed : null, nonce: 0,
          beacon: { name: this.beacon.name, trustless: this.beacon.trustless, round: r.beacon_round, resolvesAt: r.beacon_round ? this.beacon.timeOf(r.beacon_round) : null, value: r.beacon_value, verifyUrl: r.beacon_round ? this.beacon.verifyUrl(r.beacon_round) : null },
        },
      };
    };
    const cur = await activeRound(this.db, room);
    const last = (await this.db.prepare("SELECT * FROM jackpot_rounds WHERE room = ? AND status = 'settled' ORDER BY settled_at DESC LIMIT 1").get(room)) as RoundRow | undefined;
    const history = (await this.db.prepare(`SELECT r.id, r.total, r.payout, r.ticket, r.settled_at, e.amount, ${PUBLIC_NAME} AS name, e.user_id FROM jackpot_rounds r JOIN jackpot_entries e ON e.id = r.winner_entry LEFT JOIN users u ON u.id = e.user_id WHERE r.room = ? AND r.status = 'settled' ORDER BY r.settled_at DESC LIMIT 10`).all(room)) as { id: string; total: number; payout: number; ticket: number; settled_at: number; amount: number; name: string | null; user_id: string | null }[];
    const lim = JACKPOT_ROOMS[room];
    const cfg = await gameConfig(this.db, this.cfg, 'jackpot');
    return {
      now, room, label: lim.label, fee: EDGE.jackpot, min: Math.max(lim.min, cfg.minStake) / MF_PER_FRAG, max: Math.min(lim.max, cfg.maxStake) / MF_PER_FRAG,
      countdownMs: JACKPOT_COUNTDOWN_MS, maxEntries: JACKPOT_MAX_ENTRIES,
      current: cur ? await view(cur) : null, last: last ? await view(last) : null,
      history: history.map((h) => ({ id: h.id, total: h.total / MF_PER_FRAG, payout: h.payout / MF_PER_FRAG, chance: h.amount / h.total, name: h.user_id ? h.name : 'Demo bot', settledAt: h.settled_at })),
    };
  }
}
