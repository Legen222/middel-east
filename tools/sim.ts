/** Monte-Carlo RTP / volatility probe. Usage: node sim.mjs [spins] [seed] */
import { BUY_FEATURE, CRATES_FOR_MINEFIELD, JACKPOTS, JACKPOT_ORDER } from '../src/game/config';
import { playFreeSpins, spin } from '../src/game/engine';
import { Rng } from '../src/game/rng';
import type { JackpotId } from '../src/game/types';

const N = Number(process.argv[2] ?? 200_000);
const seed = Number(process.argv[3] ?? 12345);
const rng = new Rng(seed);

let staked = 0;
let returned = 0;
let fsTriggers = 0;
let mfTriggers = 0;
let fsReturn = 0;
let mfReturn = 0;
let baseReturn = 0;
let deadSpins = 0;
let best = 0;
let waveTotal = 0;
let waveSpins = 0;
const jackpotHits: Record<JackpotId, number> = { mini: 0, minor: 0, major: 0, grand: 0 };
const buckets = [0, 1, 2, 5, 10, 25, 50, 100, 250, 1000, Infinity];
const hist = new Array(buckets.length - 1).fill(0);

for (let i = 0; i < N; i++) {
  staked += 1;
  const result = spin(rng, { kind: 'base', persistentMultiplier: 1 });
  let win = result.totalWin;
  baseReturn += result.chainWin;
  if (result.waves.length > 0) { waveSpins++; waveTotal += result.waves.length; }
  if (result.minefield) {
    mfTriggers++;
    mfReturn += result.minefield.win;
    if (result.minefield.jackpot) jackpotHits[result.minefield.jackpot]++;
  }
  if (result.triggeredFreeSpins > 0) {
    fsTriggers++;
    const session = playFreeSpins(rng, result.triggeredFreeSpins);
    win += session.totalWin;
    fsReturn += session.totalWin;
  }
  returned += win;
  if (win === 0) deadSpins++;
  best = Math.max(best, win);
  for (let b = 0; b < hist.length; b++) {
    if (win >= buckets[b] && win < buckets[b + 1]) { hist[b]++; break; }
  }
}

const pct = (x: number) => `${((x / staked) * 100).toFixed(2)}%`;
console.log(`spins              ${N.toLocaleString()}  (seed ${seed})`);
console.log(`RTP                ${pct(returned)}`);
console.log(`  base chains      ${pct(baseReturn)}`);
console.log(`  minefield        ${pct(mfReturn)}`);
console.log(`  free spins       ${pct(fsReturn)}`);
console.log(`hit rate           ${(((N - deadSpins) / N) * 100).toFixed(2)}%`);
console.log(`avg waves / win    ${(waveTotal / Math.max(1, waveSpins)).toFixed(2)}`);
console.log(`free spins         1 in ${(N / Math.max(1, fsTriggers)).toFixed(0)}  avg ${(fsReturn / Math.max(1, fsTriggers)).toFixed(1)}x  (buy ${BUY_FEATURE.free}x)`);
console.log(`minefield (${CRATES_FOR_MINEFIELD}+ crates) 1 in ${(N / Math.max(1, mfTriggers)).toFixed(0)}  avg ${(mfReturn / Math.max(1, mfTriggers)).toFixed(1)}x  (buy ${BUY_FEATURE.minefield}x)`);
for (const id of JACKPOT_ORDER) {
  const hits = jackpotHits[id];
  console.log(`  ${JACKPOTS[id].label.padEnd(6)} ${String(JACKPOTS[id].mult).padStart(5)}x  1 in ${hits ? (N / hits).toFixed(0) : '∞'}`);
}
console.log(`max win            ${best.toFixed(1)}x`);
console.log('win distribution (x stake):');
for (let b = 0; b < hist.length; b++) {
  const label = buckets[b + 1] === Infinity ? `${buckets[b]}x+` : `${buckets[b]}-${buckets[b + 1]}x`;
  console.log(`  ${label.padEnd(12)} ${((hist[b] / N) * 100).toFixed(3)}%`);
}
