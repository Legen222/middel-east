import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CHAIN_LADDER, COLS, CRATES_FOR_MINEFIELD, FREE_MULT_CAP, JACKPOTS,
  MINEFIELD_RESPINS, ROWS, SCATTERS_FOR_FREE,
} from '../src/game/config';
import { inBounds, playFreeSpins, spin } from '../src/game/engine';
import { Rng } from '../src/game/rng';
import type { Grid, SpinResult } from '../src/game/types';

const play = (seed: number, opts = {}): SpinResult =>
  spin(new Rng(seed), { kind: 'base', persistentMultiplier: 1 }, opts);

const fullGrid = (grid: Grid): boolean =>
  grid.length === ROWS &&
  grid.every((row) => row.length === COLS && row.every((cell) => cell.kind !== 'empty'));

describe('grid integrity', () => {
  it('always lands a full grid and refills every crater', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const result = play(seed);
      assert.ok(fullGrid(result.initialGrid), `seed ${seed}: landing grid has holes`);
      for (const wave of result.waves) {
        assert.ok(fullGrid(wave.gridAfterRefill), `seed ${seed}: refill left holes`);
      }
    }
  });

  it('never clears a cell outside the board', () => {
    for (let seed = 1; seed <= 400; seed++) {
      for (const wave of play(seed).waves) {
        for (const hit of wave.cleared) assert.ok(inBounds(hit.at));
      }
    }
  });

  it('gives every surviving tile a unique id after a collapse', () => {
    for (let seed = 1; seed <= 400; seed++) {
      for (const wave of play(seed).waves) {
        const uids = wave.gridAfterRefill.flat().map((cell) => cell.uid);
        assert.equal(new Set(uids).size, uids.length, `seed ${seed}: duplicate tile ids`);
      }
    }
  });
});

describe('detonation payouts', () => {
  it('pays exactly the banked value times the wave multiplier', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const result = play(seed);
      let expected = 0;
      for (const wave of result.waves) {
        const banked = wave.cleared.reduce((sum, hit) => sum + hit.value, 0);
        assert.ok(Math.abs(banked - wave.base) < 1e-9, `seed ${seed}: banked value mismatch`);
        assert.ok(Math.abs(wave.base * wave.multiplier - wave.win) < 1e-9);
        expected += wave.win;
      }
      assert.ok(Math.abs(expected - result.chainWin) < 1e-9, `seed ${seed}: chain total mismatch`);
    }
  });

  it('walks the chain ladder one rung per wave', () => {
    for (let seed = 1; seed <= 600; seed++) {
      const result = play(seed);
      result.waves.forEach((wave, i) => {
        assert.equal(wave.multiplier, CHAIN_LADDER[Math.min(i, CHAIN_LADDER.length - 1)]);
      });
    }
  });

  it('pays nothing at all when no bomb lands', () => {
    for (let seed = 1; seed <= 600; seed++) {
      const result = play(seed);
      if (result.waves.length === 0 && !result.minefield) {
        assert.equal(result.totalWin, 0, `seed ${seed}: paid without a detonation`);
      }
    }
  });
});

describe('feature tiles', () => {
  it('never destroys a Sandstorm or an Ammo Crate', () => {
    for (let seed = 1; seed <= 600; seed++) {
      const result = play(seed);
      for (const wave of result.waves) {
        for (const hit of wave.cleared) {
          assert.ok(hit.label !== 'Sandstorm' && hit.label !== 'Ammo Crate',
            `seed ${seed}: a blast destroyed ${hit.label}`);
        }
      }
    }
  });

  it('awards free spins only on enough Sandstorms', () => {
    for (let seed = 1; seed <= 1500; seed++) {
      const result = play(seed);
      if (result.scatters.length >= SCATTERS_FOR_FREE) assert.ok(result.triggeredFreeSpins > 0);
      else assert.equal(result.triggeredFreeSpins, 0);
    }
  });

  it('starts the Minefield only on enough Ammo Crates', () => {
    for (let seed = 1; seed <= 2500; seed++) {
      const result = play(seed);
      assert.equal(result.minefield !== null, result.crates.length >= CRATES_FOR_MINEFIELD);
    }
  });
});

describe('minefield', () => {
  it('locks bombs permanently and pays the jackpot its cell count earns', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const result = play(seed, { forceMinefield: true });
      const mf = result.minefield;
      assert.ok(mf !== null, 'forced Minefield did not run');

      const filled = mf.finalGrid.flat().filter((cell) => cell.kind === 'bomb').length;
      assert.ok(filled >= CRATES_FOR_MINEFIELD && filled <= ROWS * COLS);

      // Locked cells only ever grow, and the respin counter resets on a lock.
      let previous = 0;
      for (const step of mf.steps) {
        assert.ok(step.filled >= previous, 'a locked bomb disappeared');
        previous = step.filled;
        if (step.locked.length > 0) assert.equal(step.respinsLeft, MINEFIELD_RESPINS);
      }

      const expected = mf.jackpot ? JACKPOTS[mf.jackpot].mult : 0;
      assert.ok(Math.abs(mf.win - (mf.collected + expected)) < 1e-9);
      if (mf.jackpot) assert.ok(filled >= JACKPOTS[mf.jackpot].cells);
      if (filled >= JACKPOTS.mini.cells) assert.ok(mf.jackpot !== null, 'earned a jackpot but got none');
    }
  });

  it('ends once the respins run out or the board is full', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const mf = play(seed, { forceMinefield: true }).minefield;
      assert.ok(mf !== null, 'forced Minefield did not run');
      const filled = mf.finalGrid.flat().filter((cell) => cell.kind === 'bomb').length;
      const last = mf.steps[mf.steps.length - 1];
      assert.ok(filled === ROWS * COLS || !last || last.respinsLeft === 0);
    }
  });
});

describe('free spins', () => {
  it('plays the awarded count and honours retriggers', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const session = playFreeSpins(new Rng(seed), 10);
      const retriggered = session.rounds.reduce((sum, r) => sum + r.extraSpins, 0);
      assert.equal(session.spinsPlayed, session.rounds.length);
      assert.ok(session.spinsPlayed >= 10);
      assert.ok(session.spinsPlayed <= 10 + retriggered);
    }
  });

  it('never lets the persistent multiplier fall or exceed the cap', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const session = playFreeSpins(new Rng(seed), 10);
      let previous = 1;
      for (const round of session.rounds) {
        assert.ok(round.multiplierBefore >= previous, 'the multiplier reset mid-feature');
        assert.ok(round.multiplierBefore <= FREE_MULT_CAP);
        previous = round.multiplierBefore;
      }
      assert.ok(session.finalMultiplier <= FREE_MULT_CAP);
    }
  });

  it('totals its rounds exactly', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const session = playFreeSpins(new Rng(seed), 10);
      const sum = session.rounds.reduce((acc, r) => acc + r.result.totalWin, 0);
      assert.ok(Math.abs(sum - session.totalWin) < 1e-9);
    }
  });
});

describe('rng', () => {
  it('is reproducible from a seed', () => {
    const a = Array.from({ length: 50 }, () => new Rng(99).next());
    assert.equal(new Set(a).size, 1, 'same seed produced different first draws');
    // Tile ids come from a global counter, so compare the contents only.
    const strip = (grid: Grid) =>
      grid.map((row) => row.map(({ uid: _uid, ...rest }) => rest));
    const left = play(1234);
    const right = play(1234);
    assert.deepEqual(strip(left.initialGrid), strip(right.initialGrid));
    assert.equal(left.totalWin, right.totalWin);
  });

  it('stays inside [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 100_000; i++) {
      const v = rng.next();
      assert.ok(v >= 0 && v < 1);
    }
  });
});
