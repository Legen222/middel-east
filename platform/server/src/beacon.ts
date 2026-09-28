/**
 * Public randomness for shared and PvP games.
 *
 * Production: drand "quicknet" (League of Entropy, threshold BLS, a new value every 3 s). The value of a
 * future round cannot be known by anyone, the operator included; anyone can fetch and BLS-verify it.
 * A game locks, picks round = current + 2, and resolves with that round's randomness as client seed.
 *
 * Demo/tests: LocalBeacon derives round values from a secret hash chain whose terminal hash is published
 * at start. Values are fixed in advance and verifiable afterwards, but the operator knows them, so it is
 * NOT trustless. The API labels it as such (`beacon.trustless = false`).
 */

import { createHash, randomBytes } from 'node:crypto';

import type { Fetch } from './steam';

export interface BeaconValue { round: number; randomness: string }

export interface Beacon {
  readonly name: string;
  readonly trustless: boolean;
  readonly periodMs: number;
  roundAt(t: number): number;
  timeOf(round: number): number;
  get(round: number, now: number): Promise<BeaconValue | null>;
  /** Where a player can check a round independently. */
  verifyUrl(round: number): string;
}

export const DRAND_QUICKNET = {
  chainHash: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971',
  genesis: 1692803367_000,
  periodMs: 3000,
};

export class DrandBeacon implements Beacon {
  readonly name = 'drand quicknet';
  readonly trustless = true;
  readonly periodMs = DRAND_QUICKNET.periodMs;
  constructor(private fetchFn: Fetch, private base = 'https://api.drand.sh') {}
  roundAt(t: number) { return Math.floor((t - DRAND_QUICKNET.genesis) / this.periodMs) + 1; }
  timeOf(round: number) { return DRAND_QUICKNET.genesis + (round - 1) * this.periodMs; }
  verifyUrl(round: number) { return `${this.base}/${DRAND_QUICKNET.chainHash}/public/${round}`; }
  async get(round: number, now: number): Promise<BeaconValue | null> {
    if (now < this.timeOf(round)) return null;
    const res = await this.fetchFn(this.verifyUrl(round), { method: 'GET', headers: {} }).catch(() => null);
    if (!res?.ok) return null;
    const j = JSON.parse(await res.text()) as { round: number; randomness: string };
    // Production additionally verifies the BLS signature against the chain's public key before use.
    return j.round === round ? { round, randomness: j.randomness } : null;
  }
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export class LocalBeacon implements Beacon {
  readonly name = 'Demo beacon (local, not trustless)';
  readonly trustless = false;
  readonly periodMs: number;
  readonly terminal: string;
  private chain: string[];
  constructor(readonly genesis: number, length = 100_000, periodMs = 3000, tip = randomBytes(32).toString('hex')) {
    this.periodMs = periodMs;
    const rev = [tip];
    for (let i = 1; i < length; i++) rev.push(sha(rev[i - 1]));
    this.chain = rev.reverse(); // chain[0] is round 1
    this.terminal = sha(this.chain[0]);
  }
  roundAt(t: number) { return Math.floor((t - this.genesis) / this.periodMs) + 1; }
  timeOf(round: number) { return this.genesis + (round - 1) * this.periodMs; }
  verifyUrl(round: number) { return `local:${round}`; }
  async get(round: number, now: number): Promise<BeaconValue | null> {
    if (round < 1 || round > this.chain.length || now < this.timeOf(round)) return null;
    return { round, randomness: this.chain[round - 1] };
  }
}
