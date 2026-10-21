/**
 * Monte-Carlo RTP verification.
 *   node .cache/sim.mjs [roundsPerRun=10000000] [seed=20260926]
 *
 * Every run draws floats with 2⁻³² resolution (the same resolution FairStream produces) from
 * xoshiro128** and feeds them through the *production* game functions. One run additionally uses the
 * full provably-fair path (HMAC-SHA256 via node:crypto) to show the derivation itself is unbiased.
 * A run passes when |z| < 4 where z = (RTP_mc − RTP_theory) / SE.
 */

import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import {
  EDGE, FairStream, RAID_TOOLS, SAMPLE_CASES, TILES,
  caseRtp, crashFromH, crashSurvival, layMines, minesMultiplier, openCase, playBattle, playCoinflip,
  playDice, playPlinko, playRaid, playUpgrader, plinkoTheoreticalRtp, priceCase,
  type BattleMode, type FloatSource, type PlinkoRisk, type PlinkoRows, type RaidTool,
  WHEEL_FIELDS, spinWheel, wheelPayout, drawJackpot, playAirdrop, TOWER_LEVELS, TOWER_ROOMS, playTowers,
  drawCard, hiloChance, hiloMultiplier, hiloWins, bjActions, bjAct, bjDeal, bjSettle, cardValue, optimalAction, optimalRtp,
  type TowerLevel,
} from '../src/index';

const N = Number(process.argv[2] ?? 10_000_000);
const SEED = Number(process.argv[3] ?? 20260926);

/* ---------- xoshiro128** ---------- */
class Xoshiro implements FloatSource {
  private s = new Uint32Array(4);
  constructor(seed: number) {
    let x = seed >>> 0;
    for (let i = 0; i < 4; i++) { // splitmix32
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      this.s[i] = (z ^ (z >>> 16)) >>> 0;
    }
  }
  u32(): number {
    const s = this.s;
    const r = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 11);
    return r;
  }
  next(): number { return this.u32() / 4294967296; }
}
const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;

/* ---------- accumulator ---------- */
interface Result {
  game: string; config: string; rounds: number; theory: number; rtp: number; se: number; z: number;
  hitRate: number; maxMult: number; pass: boolean; seconds: number; extra?: Record<string, number>;
}
const results: Result[] = [];
let runIdx = 0;

function run(game: string, config: string, theory: number | ((rounds: number) => number), rounds: number, body: (rng: Xoshiro) => { stake: number; payout: number } | null, extra?: (rng: Xoshiro) => Record<string, number>) {
  const rng = new Xoshiro(SEED + 7919 * ++runIdx);
  const t0 = performance.now();
  let S = 0, P = 0, sumX = 0, sumX2 = 0, hits = 0, max = 0, n = 0;
  for (let i = 0; i < rounds; i++) {
    const r = body(rng);
    if (!r) continue;
    const x = r.payout / r.stake;
    S += r.stake; P += r.payout; sumX += x; sumX2 += x * x; n++;
    if (r.payout > 0) hits++;
    if (x > max) max = x;
  }
  const mean = sumX / n;
  const sd = Math.sqrt(Math.max(0, sumX2 / n - mean * mean));
  const rtp = P / S;
  const th = typeof theory === 'function' ? theory(n) : theory;
  const se = sd / Math.sqrt(n);
  const z = se > 0 ? (rtp - th) / se : 0;
  const res: Result = { game, config, rounds: n, theory: th, rtp, se, z, hitRate: hits / n, maxMult: max, pass: Math.abs(z) < 4, seconds: (performance.now() - t0) / 1000 };
  if (extra) res.extra = extra(rng);
  results.push(res);
  const pct = (v: number) => (v * 100).toFixed(4) + ' %';
  console.log(`${res.pass ? 'PASS' : 'FAIL'}  ${game.padEnd(14)} ${config.padEnd(34)} n=${n.toLocaleString('en')}  RTP ${pct(rtp)}  theory ${pct(th)}  z=${z.toFixed(2)}  ${res.seconds.toFixed(1)} s`);
}
const pick = <T,>(rng: Xoshiro, xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)];

/* ---------- Dice ---------- */
run('dice', 'under 49.50 %', 1 - EDGE.dice, N, (r) => ({ stake: 1, payout: playDice(r, { chance: 49.5, direction: 'under' }).multiplier }));
run('dice', 'over 2.00 % (49× payout)', 1 - EDGE.dice, N, (r) => ({ stake: 1, payout: playDice(r, { chance: 2, direction: 'over' }).multiplier }));
run('dice', 'mixed: chance 0.01…98, both sides', 1 - EDGE.dice, N, (r) => {
  const chance = (1 + Math.floor(r.next() * 9800)) / 100;
  return { stake: 1, payout: playDice(r, { chance, direction: r.next() < 0.5 ? 'under' : 'over' }).multiplier };
});
{ // full provably-fair path through node:crypto HMAC
  const nodeHmac = (k: string, m: string) => new Uint8Array(createHmac('sha256', k).update(m).digest());
  const server = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  let nonce = 0;
  run('dice', 'under 49.50 % via HMAC stream', 1 - EDGE.dice, N, () => ({ stake: 1, payout: playDice(new FairStream(server, 'mc-client', nonce++, nodeHmac), { chance: 49.5, direction: 'under' }).multiplier }));
}

/* ---------- Scrap Press ---------- */
const drawH = (r: Xoshiro) => (r.u32() >>> 12) * 4294967296 + r.u32(); // 20 + 32 = 52 bits
for (const target of [1.01, 2, 10, 100]) {
  run('crash', `auto cash-out ${target.toFixed(2)}×`, 1 - EDGE.crash, N, (r) => ({ stake: 1, payout: crashFromH(drawH(r)) >= target ? target : 0 }));
}
run('crash', 'mixed: target log-uniform 1.01…1000×', 1 - EDGE.crash, N, (r) => {
  const target = Math.max(1.01, Math.round(Math.exp(r.next() * Math.log(1000)) * 100) / 100);
  return { stake: 1, payout: crashFromH(drawH(r)) >= target ? target : 0 };
}, (r) => { // survival curve check on 10M fresh crash points
  const xs = [1.01, 2, 10, 100, 1000]; const c = new Array(xs.length).fill(0);
  for (let i = 0; i < N; i++) { const v = crashFromH(drawH(r)); for (let j = 0; j < xs.length; j++) if (v >= xs[j]) c[j]++; }
  const o: Record<string, number> = {};
  xs.forEach((x, j) => { o[`P(≥${x}) mc`] = c[j] / N; o[`P(≥${x}) theory`] = crashSurvival(x); });
  return o;
});

/* ---------- Minefield ---------- */
const minesRound = (r: Xoshiro, m: number, k: number) => {
  const mines = new Set(layMines(r, m));
  // player reveals k tiles in a fixed order 24, 23, … (any fixed or adaptive order is equivalent by symmetry)
  for (let i = 0; i < k; i++) if (mines.has(TILES - 1 - i)) return 0;
  return minesMultiplier(m, k);
};
run('mines', '3 mines, cash out after 5', 1 - EDGE.mines, N, (r) => ({ stake: 1, payout: minesRound(r, 3, 5) }));
run('mines', '24 mines, cash out after 1', 1 - EDGE.mines, N, (r) => ({ stake: 1, payout: minesRound(r, 24, 1) }));
// Mixed run over every (m, k) whose multiplier is ≤ 1 000×. Combinations above that
// (up to 5.04·10⁶×) have too much variance for sampling to say anything; the exhaustive test covers them exactly.
const minesCombos: [number, number][] = [];
for (let m = 1; m <= 24; m++) for (let k = 1; k <= TILES - m; k++) if (minesMultiplier(m, k) <= 1000) minesCombos.push([m, k]);
run('mines', `mixed: ${minesCombos.length} (m, k) with ≤ 1 000×`, 1 - EDGE.mines, N, (r) => {
  const [m, k] = pick(r, minesCombos);
  return { stake: 1, payout: minesRound(r, m, k) };
});

/* ---------- Scrap Chute ---------- */
for (const rows of [8, 12, 16] as PlinkoRows[]) {
  for (const risk of ['low', 'medium', 'high'] as PlinkoRisk[]) {
    run('plinko', `${rows} rows / ${risk}`, plinkoTheoreticalRtp(rows, risk), N, (r) => ({ stake: 1, payout: playPlinko(r, rows, risk).multiplier }));
  }
}

/* ---------- Raid ---------- */
const tools = Object.keys(RAID_TOOLS) as RaidTool[];
run('raid', 'always C4, all 6 layers', 1 - EDGE.raid, N, (r) => ({ stake: 1, payout: playRaid(r, () => 'c4').multiplier }));
run('raid', 'always satchel, all 6 layers', 1 - EDGE.raid, N, (r) => ({ stake: 1, payout: playRaid(r, () => 'satchel').multiplier }));
run('raid', 'mixed: random tool, 30 % stop chance', 1 - EDGE.raid, N, (r) => ({
  stake: 1,
  payout: playRaid(r, (steps) => (steps.length > 0 && r.next() < 0.3 ? null : pick(r, tools))).multiplier,
}));

/* ---------- Workbench ---------- */
run('upgrader', '100 → 200 (47.5 %)', 1 - EDGE.upgrader, N, (r) => ({ stake: 100, payout: playUpgrader(r, 100, 200).value }));
run('upgrader', 'mixed: chance 1 %…80 %', 1 - EDGE.upgrader, N, (r) => {
  const chance = 0.01 + r.next() * 0.79;
  const input = 1000;
  const target = (input * (1 - EDGE.upgrader)) / chance;
  return { stake: input, payout: playUpgrader(r, input, target).value };
});
run('upgrader', 'mixed chance, zone anywhere on the ring', 1 - EDGE.upgrader, N, (r) => {
  const chance = 0.01 + r.next() * 0.79;
  const input = 1000;
  const target = (input * (1 - EDGE.upgrader)) / chance;
  return { stake: input, payout: playUpgrader(r, input, target, EDGE.upgrader, Math.floor(r.next() * 10_000)).value };
});

/* ---------- Coinflip ---------- */
run('coinflip', 'creator seat, random side', 1 - EDGE.coinflip, N, (r) => {
  const o = playCoinflip(r, r.next() < 0.5 ? 'rust' : 'scrap');
  return { stake: 1, payout: o.creatorWins ? o.winnerMultiplier : 0 };
});

/* ---------- Cases ---------- */
for (const c of SAMPLE_CASES) {
  const price = priceCase(c);
  run('cases', `${c.name} (price ${price} Frags)`, caseRtp(c), N, (r) => ({ stake: price, payout: openCase(r, c).item.value }));
}

/* ---------- Case Battle: every seat checked ---------- */
const battleCases = [SAMPLE_CASES[0], SAMPLE_CASES[1], SAMPLE_CASES[2]];
const battleCost = battleCases.reduce((s, c) => s + priceCase(c), 0);
const battleEv = battleCases.reduce((s, c) => s + caseRtp(c) * priceCase(c), 0) / battleCost;
for (const [seats, mode] of [[2, 'normal'], [3, 'crazy'], [4, 'terminal'], [4, 'team'], [2, 'bonus'], [3, 'bonus'], [4, 'bonus']] as [number, BattleMode][]) {
  for (let seat = 0; seat < seats; seat++) {
    run('battles', `${seats} seats / ${mode} / seat ${seat + 1}`, battleEv, N, (r) => ({ stake: battleCost, payout: playBattle(r, battleCases, seats, mode).payouts[seat] }));
  }
}

/* ---------- Bandit Wheel: every field type ---------- */
for (const field of WHEEL_FIELDS) {
  run('wheel', `field ${field} (pays ${wheelPayout(field)}×)`, 1 - EDGE.wheel, N, (r) => ({ stake: 1, payout: spinWheel(r).field === field ? wheelPayout(field) : 0 }));
}

/* ---------- Jackpot: a player's return for different pot shapes ---------- */
run('jackpot', '2 players, equal stakes, seat 1', 1 - EDGE.jackpot, N, (r) => {
  const o = drawJackpot(r, [{ amount: 1000 }, { amount: 1000 }]);
  return { stake: 1000, payout: o.winner === 0 ? o.payout : 0 };
});
run('jackpot', '4 players, small stake (5 % of pot)', 1 - EDGE.jackpot, N, (r) => {
  const o = drawJackpot(r, [{ amount: 1000 }, { amount: 9000 }, { amount: 6000 }, { amount: 4000 }]);
  return { stake: 1000, payout: o.winner === 0 ? o.payout : 0 };
});
run('jackpot', 'mixed: 2–20 entries, random stakes', 1 - EDGE.jackpot, N, (r) => {
  const k = 2 + Math.floor(r.next() * 19);
  const entries = Array.from({ length: k }, () => ({ amount: 1000 + Math.floor(r.next() * 99_000) }));
  const o = drawJackpot(r, entries);
  // the expected value is exact only before flooring the payout to whole mF; the floor costs < 1 mF per pot
  return { stake: entries[0].amount, payout: o.winner === 0 ? o.payout : 0 };
});

/* ---------- Airdrop ---------- */
for (const target of [2, 10, 100]) {
  run('airdrop', `target ${target.toFixed(2)}×`, 1 - EDGE.airdrop, N, (r) => ({ stake: 1, payout: playAirdrop(r, target).multiplier }));
}
run('airdrop', 'mixed: target log-uniform 1.01…1000×', 1 - EDGE.airdrop, N, (r) => {
  const target = Math.max(1.01, Math.round(Math.exp(r.next() * Math.log(1000)) * 100) / 100);
  return { stake: 1, payout: playAirdrop(r, target).multiplier };
});

/* ---------- Monument Run ---------- */
const levels = Object.keys(TOWER_LEVELS) as TowerLevel[];
for (const level of levels) {
  run('towers', `${level}, all 8 rooms`, 1 - EDGE.towers, N, (r) => ({ stake: 1, payout: playTowers(r, level, new Array(TOWER_ROOMS).fill(0)).multiplier }));
}
run('towers', 'mixed: random level, door and stop', 1 - EDGE.towers, N, (r) => {
  const level = pick(r, levels);
  const k = 1 + Math.floor(r.next() * TOWER_ROOMS);
  const picks = Array.from({ length: k }, () => Math.floor(r.next() * TOWER_LEVELS[level].doors));
  return { stake: 1, payout: playTowers(r, level, picks).multiplier };
});

/* ---------- Hi-Lo: adaptive strategies ---------- */
function hiloRound(r: Xoshiro, stopChance: number, maxGuesses: number, skipChance: number): number {
  let card = drawCard(r).rank;
  const chances: number[] = [];
  let skips = 0;
  for (;;) {
    // stopping at 1 000× is a legal strategy; it keeps the variance finite enough for sampling (as with mines)
    if (chances.length >= maxGuesses || hiloMultiplier(chances) >= 1000 || (chances.length > 0 && r.next() < stopChance)) return hiloMultiplier(chances);
    if (skips < 52 && r.next() < skipChance) { card = drawCard(r).rank; skips++; continue; }
    const options = (['hi', 'lo'] as const).filter((g) => hiloChance(card, g) < 1);
    const guess = r.next() < 0.8 ? options.reduce((a, b) => (hiloChance(card, b) > hiloChance(card, a) ? b : a)) : pick(r, options);
    const next = drawCard(r).rank;
    if (!hiloWins(card, next, guess)) return 0;
    chances.push(hiloChance(card, guess));
    card = next;
  }
}
run('hilo', 'likelier side, stop after 1 guess', 1 - EDGE.hilo, N, (r) => ({ stake: 1, payout: hiloRound(r, 1, 1, 0) }));
run('hilo', 'mixed: 25 % stop, 10 % skip, stop ≥ 1 000×', 1 - EDGE.hilo, N, (r) => ({ stake: 1, payout: hiloRound(r, 0.25, 12, 0.1) }));

/* ---------- Blackjack: perfect play vs the exact DP value ---------- */
const bjRtp = optimalRtp();
run('blackjack', 'optimal strategy, per original stake', bjRtp, N, (r) => {
  let s = bjDeal(r);
  while (!s.finished) s = bjAct(r, s, optimalAction(s.hands[s.active].cards, cardValue(s.dealer[0]), bjActions(s)));
  const o = bjSettle(s);
  return { stake: 1, payout: 1 + o.payout - o.stake }; // net result per original stake (doubles and splits included)
});

/* ---------- output ---------- */
const failed = results.filter((r) => !r.pass);
writeFileSync('sim/results.json', JSON.stringify({ roundsPerRun: N, seed: SEED, node: process.version, results }, null, 1));
const md = [
  `| Game | Configuration | Rounds | RTP theory | RTP Monte Carlo | ±95 % | z | Hit rate | max × | OK |`,
  `|---|---|---:|---:|---:|---:|---:|---:|---:|:-:|`,
  ...results.map((r) => `| ${r.game} | ${r.config} | ${r.rounds.toLocaleString('en-US')} | ${(r.theory * 100).toFixed(4)} % | ${(r.rtp * 100).toFixed(4)} % | ${(1.96 * r.se * 100).toFixed(4)} pp | ${r.z.toFixed(2)} | ${(r.hitRate * 100).toFixed(2)} % | ${+r.maxMult.toFixed(2)} | ${r.pass ? '✔' : '✘'} |`),
].join('\n');
writeFileSync('sim/RESULTS.md', `<!-- generated by sim/montecarlo.ts · seed ${SEED} · ${N.toLocaleString('en')} rounds per run -->\n${md}\n`);
console.log(`\n${results.length} runs, ${failed.length} failed.`);
if (failed.length) process.exit(1);
