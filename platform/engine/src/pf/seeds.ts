/**
 * Seed lifecycle.
 *
 * Per-player games (dice, mines, plinko, upgrader, cases, raid):
 *   1. Server draws a 32-byte serverSeed and publishes sha256(serverSeed) *before* any bet.
 *   2. Player sets clientSeed at any time (default random); each bet uses nonce = 0, 1, 2, …
 *   3. On rotation the old serverSeed is revealed; anyone can check sha256(seed) === published hash
 *      and replay every bet with the verifier.
 *
 * Shared-round game (crash):
 *   A chain of N seeds is generated backwards, seed_{i} = sha256(seed_{i+1}). The *last* hash
 *   (terminal) is published before round 1. Round i uses seed_i, and sha256(seed_i) === seed_{i-1},
 *   so every revealed seed proves it was fixed in advance. The clientSeed for the whole chain is the
 *   hash of a public block mined *after* the terminal hash was published — the operator cannot
 *   grind the chain against it.
 *
 * PvP games (coinflip, battles): clientSeed = hash of a public block chosen when the game locks
 * (last seat filled), nonce = game id. Neither the operator nor any player knows it in advance.
 */

import { sha256Hex } from './sha256';

export type RandomBytes = (n: number) => Uint8Array;

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function newServerSeed(randomBytes: RandomBytes): { seed: string; hash: string } {
  const seed = hex(randomBytes(32));
  return { seed, hash: sha256Hex(seed) };
}

export function verifyCommit(seed: string, publishedHash: string): boolean {
  return sha256Hex(seed) === publishedHash.toLowerCase();
}

/** Builds a hash chain. Returns seeds in play order (index 0 plays first) plus the terminal hash to publish. */
export function buildChain(tip: string, length: number): { seeds: string[]; terminal: string } {
  const rev: string[] = [tip];
  for (let i = 1; i < length; i++) rev.push(sha256Hex(rev[i - 1]));
  const seeds = rev.reverse();
  return { seeds, terminal: sha256Hex(seeds[0]) };
}

/** True when `seed` hashes, after `steps` applications, to `anchor` (the terminal hash or an earlier revealed seed). */
export function verifyChainLink(seed: string, anchor: string, steps = 1): boolean {
  let h = seed;
  for (let i = 0; i < steps; i++) h = sha256Hex(h);
  return h === anchor.toLowerCase();
}
