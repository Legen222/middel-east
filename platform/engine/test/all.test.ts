import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  CRASH_MIN_TARGET, EDGE, FairStream, PLINKO_TABLES, RAID_TOOLS, SAMPLE_CASES, TILES,
  binom, buildChain, caseEv, caseRtp, caseWeight, crashFromH, crashPoint, diceMultiplier, hmacHex,
  layMines, minesMultiplier, newServerSeed, openCase, playBattle, playCoinflip, playDice, playMines,
  playPlinko, playRaid, playUpgrader, plinkoTheoreticalRtp, priceCase, raidMultiplier, settleCrash,
  sha256, sha256Hex, toHex, upgraderChance, verifyChainLink, verifyCommit,
  type FloatSource, type PlinkoRisk, type PlinkoRows, type RaidTool,
} from '../src/index';

/** Feeds a fixed list of floats. */
const fixed = (xs: number[]): FloatSource => {
  let i = 0;
  return { next: () => { if (i >= xs.length) throw new Error('fixed source exhausted'); return xs[i++]; } };
};
/** Float that maps to ticket t out of n: the midpoint of the ticket's interval. */
const at = (t: number, n: number) => (t + 0.5) / n;
const nodeHmac = (k: string, m: string) => new Uint8Array(createHmac('sha256', k).update(m).digest());
const close = (a: number, b: number, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

describe('SHA-256 / HMAC', () => {
  it('matches node:crypto for inputs of every length 0…300', () => {
    for (let n = 0; n <= 300; n++) {
      const buf = randomBytes(n);
      assert.equal(toHex(sha256(buf)), createHash('sha256').update(buf).digest('hex'));
    }
  });
  it('matches node:crypto HMAC for short and long keys', () => {
    for (const keyLen of [0, 1, 32, 63, 64, 65, 200]) {
      const key = randomBytes(keyLen).toString('hex');
      const msg = randomBytes(50).toString('hex');
      assert.equal(toHex(hmacHex(key, msg)), toHex(nodeHmac(key, msg)));
    }
  });
  it('known answer: sha256("abc")', () => {
    assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('FairStream', () => {
  const server = 'a'.repeat(64);
  it('derives floats from HMAC(server, client:nonce:round), 4 bytes each', () => {
    const s = new FairStream(server, 'client', 7);
    const b = nodeHmac(server, 'client:7:0');
    const expected = b[0] / 256 + b[1] / 65536 + b[2] / 16777216 + b[3] / 4294967296;
    close(s.next(), expected, 0);
  });
  it('moves to round 1 after 8 floats', () => {
    const s = new FairStream(server, 'client', 7);
    for (let i = 0; i < 8; i++) s.next();
    const b = nodeHmac(server, 'client:7:1');
    close(s.next(), b[0] / 256 + b[1] / 65536 + b[2] / 16777216 + b[3] / 4294967296, 0);
  });
  it('pure-JS and node HMAC give identical streams', () => {
    const a = new FairStream(server, 'x', 1);
    const b = new FairStream(server, 'x', 1, nodeHmac);
    for (let i = 0; i < 40; i++) assert.equal(a.next(), b.next());
  });
  it('golden vector (pins the public verifier)', () => {
    const s = new FairStream('3f1e9c2a7b6d4e58a1c0f9e8d7b6a5c4b3a29181706f5e4d3c2b1a0918273645', 'scrapline', 0);
    assert.equal(s.next().toFixed(10), GOLDEN_FIRST_FLOAT);
  });
  it('is uniform: χ² over 64 bins, 256 000 floats', () => {
    const s = new FairStream(randomBytes(32).toString('hex'), 'uniformity', 0, nodeHmac);
    const bins = new Array(64).fill(0);
    const N = 256_000;
    for (let i = 0; i < N; i++) bins[Math.floor(s.next() * 64)]++;
    const exp = N / 64;
    const chi = bins.reduce((acc, o) => acc + (o - exp) ** 2 / exp, 0);
    assert.ok(chi < 120, `χ²=${chi.toFixed(1)} (df 63, p≈1e-5 cut-off ≈ 120)`); // flaky rate ≈ 1e-5
  });
});
// Pinned literal: HMAC-SHA256(key=seed, 'scrapline:0:0') = 333ce1db714c00d1…, first 4 bytes → 0.2001477394
const GOLDEN_FIRST_FLOAT = '0.2001477394';

describe('seeds', () => {
  it('commit / reveal', () => {
    const { seed, hash } = newServerSeed((n) => new Uint8Array(randomBytes(n)));
    assert.ok(verifyCommit(seed, hash));
    assert.ok(!verifyCommit(seed, sha256Hex('another seed')));
  });
  it('hash chain links every seed to the published terminal hash', () => {
    const { seeds, terminal } = buildChain(randomBytes(32).toString('hex'), 50);
    assert.ok(verifyChainLink(seeds[0], terminal));
    for (let i = 1; i < seeds.length; i++) assert.ok(verifyChainLink(seeds[i], seeds[i - 1]));
    assert.ok(verifyChainLink(seeds[49], terminal, 50));
  });
});

describe('dice — exact RTP by enumerating all 10 000 tickets', () => {
  for (const chance of [0.01, 1, 33.33, 49.5, 50, 98]) {
    for (const direction of ['under', 'over'] as const) {
      it(`${direction} ${chance} %`, () => {
        let ret = 0;
        for (let t = 0; t < 10000; t++) ret += playDice(fixed([at(t, 10000)]), { chance, direction }).multiplier;
        close(ret / 10000, 1 - EDGE.dice, 1e-12);
      });
    }
  }
  it('rejects invalid chances', () => {
    assert.throws(() => playDice(fixed([0.5]), { chance: 98.01, direction: 'under' }));
    assert.throws(() => playDice(fixed([0.5]), { chance: 10.005, direction: 'under' }));
    close(diceMultiplier(50), 1.96);
  });
});

describe('crash — boundary proof of P(crash ≥ x) = (1 − e)/x', () => {
  const E = 2 ** 52;
  for (const x of [1.01, 1.5, 2, 3.33, 10, 100, 1000, 9999.99]) {
    it(`x = ${x}`, () => {
      // smallest h with crash ≥ x is ⌈E(1 − (1−e)/x)⌉ (± float rounding); check the boundary exactly
      const hStar = Math.ceil(E * (1 - (1 - EDGE.crash) / x));
      let h = hStar;
      while (h > 0 && crashFromH(h - 1) >= x) h--;
      while (crashFromH(h) < x) h++;
      assert.ok(crashFromH(h) >= x && (h === 0 || crashFromH(h - 1) < x));
      const pSurvive = (E - h) / E;
      close(pSurvive * x, 1 - EDGE.crash, 1e-9);
    });
  }
  it('crash is at least 1.00 and targets below 1.01 are refused', () => {
    assert.equal(crashFromH(0), 1);
    assert.throws(() => settleCrash(2, 1));
    assert.equal(CRASH_MIN_TARGET, 1.01);
    assert.deepEqual(settleCrash(2.5, 2), { win: true, multiplier: 2 });
  });
  it('crash point is reproducible from seed + client seed', () => {
    const a = crashPoint('seed', 'block');
    const b = crashPoint('seed', 'block', EDGE.crash, nodeHmac);
    assert.equal(a.crash, b.crash);
    assert.equal(a.h, parseInt(toHex(nodeHmac('seed', 'block')).slice(0, 13), 16));
  });
});

describe('mines', () => {
  it('RTP of "cash out after k" is exactly 1 − e for every m and feasible k', () => {
    for (let m = 1; m <= 24; m++) {
      for (let k = 1; k <= TILES - m; k++) {
        const pSurvive = binom(TILES - m, k) / binom(TILES, k);
        close(pSurvive * minesMultiplier(m, k), 1 - EDGE.mines, 1e-9);
      }
    }
  });
  it('lays exactly m distinct mines inside the board', () => {
    const s = new FairStream('s', 'c', 0);
    for (let m = 1; m <= 24; m++) {
      const mines = layMines(s, m);
      assert.equal(new Set(mines).size, m);
      assert.ok(mines.every((t) => t >= 0 && t < TILES));
    }
  });
  it('every tile is equally likely to hold a mine (m = 3)', () => {
    const s = new FairStream(randomBytes(32).toString('hex'), 'mines', 0, nodeHmac);
    const hits = new Array(TILES).fill(0);
    const N = 100_000;
    for (let i = 0; i < N; i++) for (const t of layMines(s, 3)) hits[t]++;
    const exp = (N * 3) / TILES;
    for (const h of hits) assert.ok(Math.abs(h - exp) < 6 * Math.sqrt(exp), `tile count ${h} vs ${exp}`);
  });
  it('busts on a mine and pays the ladder otherwise', () => {
    const src = () => fixed(Array(24).fill(0)); // j = i each step → mines on tiles 0…m-1
    assert.equal(playMines(src(), 3, [0]).hitMine, true);
    const ok = playMines(src(), 3, [5, 6]);
    assert.equal(ok.hitMine, false);
    close(ok.multiplier, minesMultiplier(3, 2));
  });
});

describe('plinko', () => {
  for (const rows of [8, 12, 16] as PlinkoRows[]) {
    for (const risk of ['low', 'medium', 'high'] as PlinkoRisk[]) {
      it(`${rows} rows / ${risk}: symmetric, n+1 buckets, RTP in [96.5 %, 97.0 %]`, () => {
        const t = PLINKO_TABLES[rows][risk];
        assert.equal(t.length, rows + 1);
        for (let k = 0; k <= rows; k++) assert.equal(t[k], t[rows - k]);
        const r = plinkoTheoreticalRtp(rows, risk);
        assert.ok(r >= 0.965 && r <= 0.97, `RTP ${r}`);
      });
    }
  }
  it('bucket = number of right bounces', () => {
    const o = playPlinko(fixed([0.9, 0.1, 0.6, 0.4, 0.5, 0.2, 0.7, 0.3]), 8, 'low');
    assert.equal(o.bucket, 4);
    assert.equal(o.path.join(''), 'RLRLRLRL');
  });
});

describe('raid — exact RTP for every fixed tool plan (probability tree)', () => {
  const tools = Object.keys(RAID_TOOLS) as RaidTool[];
  // enumerate all plans of length 1…6 over 3 tools: 3 + 9 + … + 729 = 1092 plans
  const plans: RaidTool[][] = [];
  const grow = (p: RaidTool[]) => { if (p.length) plans.push(p); if (p.length < 6) for (const t of tools) grow([...p, t]); };
  grow([]);
  it(`${plans.length} plans all return exactly 1 − e`, () => {
    for (const plan of plans) {
      const pWin = plan.reduce((p, t) => p * RAID_TOOLS[t], 1);
      close(pWin * raidMultiplier(plan), 1 - EDGE.raid, 1e-12);
    }
  });
  it('plays a plan: breach on f < p, hold otherwise', () => {
    const plan = (s: unknown[]) => (s.length < 2 ? 'c4' : null);
    const win = playRaid(fixed([0.1, 0.79]), plan);
    assert.equal(win.held, false);
    close(win.multiplier, 0.97 / 0.64);
    const lose = playRaid(fixed([0.1, 0.8]), plan);
    assert.equal(lose.held, true);
    assert.equal(lose.multiplier, 0);
    assert.throws(() => playRaid(fixed([]), () => null));
  });
});

describe('upgrader', () => {
  it('chance = input/target · (1 − e); RTP exact', () => {
    const c = upgraderChance(100, 200);
    close(c, 0.475);
    close(c * 200 / 100, 1 - EDGE.upgrader);
    assert.equal(playUpgrader(fixed([0.4749]), 100, 200).win, true);
    assert.equal(playUpgrader(fixed([0.475]), 100, 200).win, false);
  });
  it('refuses targets outside the chance band', () => {
    assert.throws(() => upgraderChance(100, 110)); // 86 % > 80 % cap
    assert.throws(() => upgraderChance(1, 1000)); // 0.095 % < 1 % floor
  });
});

describe('coinflip', () => {
  it('50/50 split and 1 − rake RTP', () => {
    assert.equal(playCoinflip(fixed([0.49999]), 'rust').creatorWins, true);
    assert.equal(playCoinflip(fixed([0.5]), 'rust').creatorWins, false);
    close(0.5 * playCoinflip(fixed([0.1]), 'rust').winnerMultiplier, 1 - EDGE.coinflip);
  });
});

describe('cases', () => {
  for (const c of SAMPLE_CASES) {
    it(`${c.name}: integer weights, RTP ≤ 93 %, price rounding ≤ 1 Frag, every ticket maps to an item`, () => {
      assert.ok(c.items.every((i) => Number.isInteger(i.weight) && i.weight > 0 && Number.isInteger(i.value)));
      const r = caseRtp(c);
      assert.ok(r <= 1 - EDGE.cases, `RTP ${r}`);
      assert.ok(priceCase(c) - caseEv(c) / (1 - EDGE.cases) < 1, 'price rounds up by less than one Frag');
      const W = caseWeight(c);
      let sum = 0;
      for (let t = 0; t < W; t += 1) sum += openCase(fixed([at(t, W)]), c).item.value;
      close(sum / W, caseEv(c), 1e-9);
      assert.equal(priceCase(c), Math.ceil(caseEv(c) / 0.93));
    });
  }
  it('battle: payouts sum to the pool, ties split, crazy picks the lowest', () => {
    const c: typeof SAMPLE_CASES[number] = { id: 't', name: 't', items: [{ name: 'lo', value: 10, weight: 1 }, { name: 'hi', value: 100, weight: 1 }] };
    const normal = playBattle(fixed([0.1, 0.9]), [c], 2, 'normal');
    assert.deepEqual(normal.winners, [1]);
    assert.deepEqual(normal.payouts, [0, 110]);
    const crazy = playBattle(fixed([0.1, 0.9]), [c], 2, 'crazy');
    assert.deepEqual(crazy.winners, [0]);
    const tie = playBattle(fixed([0.9, 0.9]), [c], 2, 'normal');
    assert.deepEqual(tie.payouts, [100, 100]);
    const term = playBattle(fixed([0.9, 0.1, 0.1, 0.9]), [c, c], 2, 'terminal');
    assert.deepEqual(term.winners, [1]);
  });
});
