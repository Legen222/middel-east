/** Print seeds whose first base spin detonates, for demo and screenshot runs. */
import { spin } from '../src/game/engine';
import { Rng } from '../src/game/rng';

const want = process.argv[2] ?? 'chain';
for (let seed = 1; seed < 6000; seed++) {
  const result = spin(new Rng(seed), { kind: 'base', persistentMultiplier: 1 });
  const ok =
    want === 'chain' ? result.waves.length >= 2 :
    want === 'blast' ? result.waves.length === 1 :
    want === 'scatter' ? result.scatters.length >= 3 :
    result.crates.length >= 4;
  if (ok) {
    console.log(seed, 'waves', result.waves.length, 'win', result.chainWin.toFixed(2), 'peak', result.peakMultiplier);
    if (Number(process.env.LIMIT ?? 5) <= 0) break;
  }
}
