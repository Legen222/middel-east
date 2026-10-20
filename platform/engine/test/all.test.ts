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
  WHEEL_COUNTS, WHEEL_FIELDS, WHEEL_LAYOUT, spinWheel, wheelPayout,
  drawJackpot, jackpotTicketRanges, airdropH, airdropChance, playAirdrop,
  TOWER_LEVELS, TOWER_ROOMS, layTraps, playTowers, towerSafeChance, towersMultiplier, type TowerLevel,
  drawCard, hiloChance, hiloMultiplier, hiloWins,
  bjActions, bjAct, bjDeal, bjSettle, cardValue, handTotal, optimalAction, optimalRtp,
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
  it('a movable zone: wins exactly on the arc [s, s + chance) of the ring, wrapping past 1', () => {
    // chance 0.475, zone starts at 0.9 → wins for f in [0.9, 1) and [0, 0.375)
    assert.equal(playUpgrader(fixed([0.8999]), 100, 200, EDGE.upgrader, 9000).win, false);
    assert.equal(playUpgrader(fixed([0.9]), 100, 200, EDGE.upgrader, 9000).win, true);
    assert.equal(playUpgrader(fixed([0.9999]), 100, 200, EDGE.upgrader, 9000).win, true);
    assert.equal(playUpgrader(fixed([0.3749]), 100, 200, EDGE.upgrader, 9000).win, true);
    assert.equal(playUpgrader(fixed([0.375]), 100, 200, EDGE.upgrader, 9000).win, false);
    // middle of the ring
    assert.equal(playUpgrader(fixed([0.2999]), 100, 200, EDGE.upgrader, 3000).win, false);
    assert.equal(playUpgrader(fixed([0.3]), 100, 200, EDGE.upgrader, 3000).win, true);
    assert.equal(playUpgrader(fixed([0.7749]), 100, 200, EDGE.upgrader, 3000).win, true);
    assert.equal(playUpgrader(fixed([0.775]), 100, 200, EDGE.upgrader, 3000).win, false);
    // every placement covers the same share of a fine grid of rolls
    for (const zone of [0, 1, 2500, 5000, 7777, 9999]) {
      let wins = 0;
      for (let i = 0; i < 100_000; i++) if (playUpgrader(fixed([i / 100_000]), 100, 200, EDGE.upgrader, zone).win) wins++;
      assert.ok(Math.abs(wins - 47_500) <= 1, `zone ${zone}: ${wins}`);
    }
    for (const bad of [-1, 10_000, 0.5, NaN]) assert.throws(() => playUpgrader(fixed([0.1]), 100, 200, EDGE.upgrader, bad), RangeError);
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
  it('team battle: 2 vs 2 on combined totals, the winning pair splits the pool, a team tie splits four ways', () => {
    const c: typeof SAMPLE_CASES[number] = { id: 't', name: 't', items: [{ name: 'lo', value: 10, weight: 1 }, { name: 'hi', value: 100, weight: 1 }] };
    // seats 1–4 draw hi, lo, lo, hi → teams 110 vs 110: tie
    const tie = playBattle(fixed([0.9, 0.1, 0.1, 0.9]), [c], 4, 'team');
    assert.deepEqual(tie.winners, [0, 1, 2, 3]);
    assert.deepEqual(tie.payouts, [55, 55, 55, 55]);
    // hi, hi, lo, hi → 200 vs 110: team 1 (seats 1, 2) takes 310, split in two
    const win = playBattle(fixed([0.9, 0.9, 0.1, 0.9]), [c], 4, 'team');
    assert.deepEqual(win.winners, [0, 1]);
    assert.deepEqual(win.payouts, [155, 155, 0, 0]);
    // the best single drop does not decide: seat 4 has the top item but its team loses
    const lone = playBattle(fixed([0.9, 0.9, 0.1, 0.9, 0.9, 0.9, 0.1, 0.1]), [c, c], 4, 'team');
    assert.deepEqual(lone.winners, [0, 1]);
    assert.throws(() => playBattle(fixed([0.1]), [c], 2, 'team'), RangeError);
  });
});

describe('bandit wheel — exact RTP over all 25 fields', () => {
  it('layout has 12/6/4/2/1 fields and pays 2/4/6/12/24×', () => {
    for (const f of WHEEL_FIELDS) assert.equal(WHEEL_LAYOUT.filter((x) => x === f).length, WHEEL_COUNTS[f]);
    assert.equal(WHEEL_LAYOUT.length, 25);
    assert.deepEqual(WHEEL_FIELDS.map((f) => wheelPayout(f)), [2, 4, 6, 12, 24].map((x) => x));
  });
  it('every field type returns exactly 1 − e', () => {
    for (const f of WHEEL_FIELDS) {
      let ret = 0;
      for (let i = 0; i < 25; i++) if (spinWheel(fixed([at(i, 25)])).field === f) ret += wheelPayout(f) / 25;
      close(ret, 1 - EDGE.wheel, 1e-12);
    }
  });
});

describe('jackpot — exact EV by walking every ticket', () => {
  it('ticket ranges follow entry order and cover the pot without gaps', () => {
    assert.deepEqual(jackpotTicketRanges([{ amount: 5 }, { amount: 3 }, { amount: 12 }]), [{ from: 0, to: 5 }, { from: 5, to: 8 }, { from: 8, to: 20 }]);
    assert.throws(() => jackpotTicketRanges([{ amount: 0 }]));
    assert.throws(() => drawJackpot(fixed([0.5]), [{ amount: 5 }]));
  });
  it('each entry wins with probability amount/total and gets RTP 1 − fee', () => {
    const entries = [{ amount: 5 }, { amount: 3 }, { amount: 12 }, { amount: 7 }];
    const total = 27;
    const wins = [0, 0, 0, 0];
    for (let t = 0; t < total; t++) {
      const o = drawJackpot(fixed([at(t, total)]), entries);
      assert.equal(o.ticket, t);
      wins[o.winner]++;
    }
    assert.deepEqual(wins, entries.map((e) => e.amount));
    const payout = drawJackpot(fixed([0.1]), entries).payout;
    assert.equal(payout, Math.floor(total * (1 - EDGE.jackpot)));
    entries.forEach((e, i) => close((wins[i] / total) * total * (1 - EDGE.jackpot) / e.amount, 1 - EDGE.jackpot, 1e-12));
  });
});

describe('airdrop (limbo)', () => {
  it('builds a 52-bit integer from two floats', () => {
    assert.equal(airdropH(fixed([0, 0])), 0);
    assert.equal(airdropH(fixed([1 - 2 ** -32, 1 - 2 ** -20])), 2 ** 52 - 1);
    assert.equal(airdropH(fixed([0.5, 0.5])), 2 ** 51 + 2 ** 19);
  });
  it('P(landing ≥ x) = (1 − e)/x at the exact boundary h for several targets', () => {
    const E = 2 ** 52;
    for (const x of [1.01, 2, 3.33, 10, 100, 9999.99]) {
      // smallest h that lands ≥ x: ⌈E(1 − (1−e)/x)⌉ up to float rounding, located exactly as in the crash proof
      let hMin = Math.ceil(E * (1 - (1 - EDGE.airdrop) / x));
      while (hMin > 0 && crashFromH(hMin - 1, EDGE.airdrop) >= x) hMin--;
      while (crashFromH(hMin, EDGE.airdrop) < x) hMin++;
      const toFloats = (h: number) => [Math.floor(h / 2 ** 20) / 2 ** 32, (h % 2 ** 20) / 2 ** 20];
      assert.equal(playAirdrop(fixed(toFloats(hMin)), x).win, true, `x=${x} at boundary`);
      assert.equal(playAirdrop(fixed(toFloats(hMin - 1)), x).win, false, `x=${x} below boundary`);
      close((E - hMin) / E, airdropChance(x), 1e-9);
    }
    assert.throws(() => playAirdrop(fixed([0.5, 0.5]), 1));
  });
});

describe('monument run (towers) — exact RTP for every level and room count', () => {
  for (const level of Object.keys(TOWER_LEVELS) as TowerLevel[]) {
    it(`${level}: every door equally likely a trap, mult_k · p^k = 1 − e`, () => {
      const { doors, traps } = TOWER_LEVELS[level];
      const counts = new Array(doors).fill(0);
      // enumerate all float combinations for the traps of one room (midpoints of each choice)
      const choices: number[][] = [[]];
      for (let i = 0; i < traps; i++) {
        const next: number[][] = [];
        for (const c of choices) for (let j = 0; j < doors - i; j++) next.push([...c, at(j, doors - i)]);
        choices.splice(0, choices.length, ...next);
      }
      for (const c of choices) {
        const room = layTraps(fixed([...c, ...new Array(traps * (TOWER_ROOMS - 1)).fill(0)]), level)[0];
        for (const t of room) counts[t]++;
      }
      for (const n of counts) close(n / choices.length, traps / doors, 1e-12);
      for (let k = 1; k <= TOWER_ROOMS; k++) close(towersMultiplier(level, k) * towerSafeChance(level) ** k, 1 - EDGE.towers, 1e-12);
    });
  }
  it('busts on a trap and pays the ladder otherwise', () => {
    const floats = new Array(8).fill(at(1, 2)); // red: trap at door 1 in every room
    assert.deepEqual(layTraps(fixed(floats), 'red'), new Array(8).fill([1]));
    const win = playTowers(fixed(floats), 'red', [0, 0, 0]);
    assert.equal(win.cleared, 3);
    close(win.multiplier, 0.97 * 8);
    const lose = playTowers(fixed(floats), 'red', [0, 1]);
    assert.equal(lose.hitTrap, true);
    assert.equal(lose.cleared, 1);
    assert.throws(() => playTowers(fixed(floats), 'red', [2]));
  });
});

describe('hi-lo — exact RTP by enumerating cards', () => {
  it('draws every card of 52 exactly once over the midpoints', () => {
    const seen = new Set<string>();
    for (let c = 0; c < 52; c++) { const d = drawCard(fixed([at(c, 52)])); seen.add(`${d.rank}/${d.suit}`); assert.ok(d.rank >= 1 && d.rank <= 13); }
    assert.equal(seen.size, 52);
  });
  it('chance equals the share of next ranks that win, and one guess returns 1 − e', () => {
    for (let r = 1; r <= 13; r++) {
      for (const g of ['hi', 'lo'] as const) {
        let wins = 0;
        for (let n = 1; n <= 13; n++) if (hiloWins(r, n, g)) wins++;
        close(wins / 13, hiloChance(r, g), 1e-12);
        close(hiloChance(r, g) * hiloMultiplier([hiloChance(r, g)]), 1 - EDGE.hilo, 1e-12);
      }
    }
  });
  it('a two-guess strategy (always the likelier side) returns exactly 1 − e', () => {
    let ev = 0;
    for (let a = 1; a <= 13; a++) {
      const g1 = hiloChance(a, 'hi') >= hiloChance(a, 'lo') ? 'hi' : 'lo';
      for (let b = 1; b <= 13; b++) {
        if (!hiloWins(a, b, g1)) continue;
        const g2 = hiloChance(b, 'hi') >= hiloChance(b, 'lo') ? 'hi' : 'lo';
        for (let c = 1; c <= 13; c++) if (hiloWins(b, c, g2)) ev += hiloMultiplier([hiloChance(a, g1), hiloChance(b, g2)]) / 13 ** 3;
      }
    }
    close(ev, 1 - EDGE.hilo, 1e-12);
  });
});

describe('blackjack', () => {
  const C = (v: number) => (v === 10 ? 9 : v - 1); // a card index with that value (spades)
  const f = (...cards: number[]) => fixed(cards.map((c) => at(c, 52)));
  it('deals player, dealer, player, hole and resolves naturals with the peek', () => {
    const s = bjDeal(f(C(10), C(9), C(7), C(8)));
    assert.deepEqual([s.hands[0].cards.map(cardValue), s.dealer.map(cardValue)], [[10, 7], [9, 8]]);
    assert.equal(s.finished, false);
    assert.deepEqual(bjActions(s), ['hit', 'stand', 'double']);
    const bj = bjDeal(f(C(1), C(9), C(10), C(8)));
    assert.equal(bj.finished, true);
    assert.equal(bjSettle(bj).payout, 2.5);
    const dealerBj = bjDeal(f(C(10), C(1), C(9), C(10)));
    assert.equal(dealerBj.finished, true);
    assert.equal(bjSettle(dealerBj).payout, 0, 'player loses only the original stake');
    const both = bjDeal(f(C(1), C(1), C(10), C(10)));
    assert.equal(bjSettle(both).payout, 1, 'blackjack against blackjack pushes');
  });
  it('hit, stand, double and the dealer drawing to 17 (stands on soft 17)', () => {
    let s = bjDeal(f(C(5), C(6), C(6), C(10), C(10)));
    s = bjAct(f(C(10), C(1)), s, 'double'); // player 5+6+10 = 21; dealer 6+10 = 16 draws an ace → 17
    assert.equal(s.finished, true);
    assert.equal(handTotal(s.hands[0].cards).total, 21);
    const r = bjSettle(s);
    assert.equal(r.stake, 2);
    s = bjDeal(f(C(10), C(6), C(10), C(1)));
    s = bjAct(f(), s, 'stand');
    assert.equal(handTotal(s.dealer).total, 17, 'soft 17 stands');
    assert.equal(bjSettle(s).payout, 2, '20 beats 17');
    assert.throws(() => bjAct(f(), s, 'hit'), 'no actions after the round');
  });
  it('splits once, split aces get one card, 21 after a split is no blackjack', () => {
    let s = bjDeal(f(C(1), C(9), C(1), C(8)));
    assert.ok(bjActions(s).includes('split'));
    s = bjAct(f(C(10), C(5), C(10)), s, 'split'); // hands A+10, A+5; dealer 9+8 = 17
    assert.equal(s.finished, true);
    const r = bjSettle(s);
    assert.deepEqual(r.hands.map((h) => h.outcome), ['win', 'lose']);
    assert.equal(r.payout, 2, 'A+10 after a split pays 1:1, A+5 (soft 16) loses to 17');
  });
  it('optimal play: textbook S17 basic strategy and an exact RTP of about 99.31 %', () => {
    const all = ['hit', 'stand', 'double'] as const;
    const row = (cards: number[], acts: readonly string[]) => [2, 3, 4, 5, 6, 7, 8, 9, 10, 1].map((u) => optimalAction(cards, u, [...acts] as never)[0]).join('');
    assert.equal(row([C(10), C(2)], all), 'hhssshhhhh');
    assert.equal(row([C(10), C(6)], all), 'ssssshhhhh');
    assert.equal(row([C(1), C(7)], all), 'sddddsshhh');
    assert.equal(row([C(5), C(6)], all), 'dddddddddh');
    assert.equal(row([C(8), C(8)], [...all, 'split']), 'ssssssssss');
    const rtp = optimalRtp();
    assert.ok(rtp > 0.992 && rtp < 0.995, String(rtp));
  });
});
