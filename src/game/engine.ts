import {
  BOMBS, BOMB_RATE, CHAIN_LADDER, COLS, CRATES_FOR_MINEFIELD, FREE_MULT_CAP,
  FREE_SPINS_BASE, FREE_SPINS_PER_EXTRA_SCATTER, FREE_SPINS_RETRIGGER,
  JACKPOTS, JACKPOT_ORDER, LOOT_RATE, MINEFIELD_RESPINS, ROWS,
  SCATTERS_FOR_FREE, SYMBOLS,
} from './config';
import type { Rng } from './rng';
import type {
  BlastWave, BombCell, BombId, Cell, Coord, GameMode, Grid,
  JackpotId, MinefieldResult, MinefieldStep, SpinResult, SymbolCell, SymbolId,
} from './types';

let uidCounter = 1;
const nextUid = () => uidCounter++;

/** Reset the tile-id counter. Only used by tools and tests. */
export function resetUids(): void {
  uidCounter = 1;
}

const ORDINARY_WEIGHTS = (Object.keys(SYMBOLS) as SymbolId[])
  .filter((id) => id !== 'scatter' && id !== 'crate')
  .map((id) => [id, SYMBOLS[id].weight] as const);

const FULL_WEIGHTS = (Object.keys(SYMBOLS) as SymbolId[])
  .map((id) => [id, SYMBOLS[id].weight] as const);

const BOMB_WEIGHTS = (Object.keys(BOMBS) as BombId[])
  .map((id) => [id, BOMBS[id].weight] as const);

export const inBounds = (c: Coord): boolean =>
  c.r >= 0 && c.r < ROWS && c.c >= 0 && c.c < COLS;

export const isFeatureTile = (cell: Cell): boolean =>
  cell.kind === 'symbol' && (cell.id === 'scatter' || cell.id === 'crate');

export function makeSymbol(rng: Rng, id: SymbolId, lootRate: number): SymbolCell {
  const def = SYMBOLS[id];
  const carriesLoot = id !== 'scatter' && id !== 'crate' && rng.chance(lootRate);
  const value = carriesLoot
    ? rng.weighted(def.values.map(([v, w]) => [v, w] as const))
    : 0;
  return { kind: 'symbol', id, value, uid: nextUid() };
}

export function makeBomb(rng: Rng, id?: BombId, rich = false): BombCell {
  const chosen = id ?? rng.weighted(BOMB_WEIGHTS);
  const def = BOMBS[chosen];
  const table = rich ? def.holdValues : def.values;
  const value = rng.weighted(table.map(([v, w]) => [v, w] as const));
  return { kind: 'bomb', id: chosen, value, fuse: -1, uid: nextUid() };
}

interface DrawCtx {
  bombRate: number;
  lootRate: number;
  /** Feature tiles (Sandstorm / Ammo Crate) only land on the opening drop. */
  allowFeature: boolean;
}

function drawCell(rng: Rng, ctx: DrawCtx): Cell {
  if (rng.chance(ctx.bombRate)) return makeBomb(rng);
  const pool = ctx.allowFeature ? FULL_WEIGHTS : ORDINARY_WEIGHTS;
  return makeSymbol(rng, rng.weighted(pool), ctx.lootRate);
}

function findSymbol(grid: Grid, id: SymbolId): Coord[] {
  const out: Coord[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (cell.kind === 'symbol' && cell.id === id) out.push({ r, c });
    }
  }
  return out;
}

function findBombs(grid: Grid): Coord[] {
  const out: Coord[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) if (grid[r][c].kind === 'bomb') out.push({ r, c });
  }
  return out;
}

export function makeGrid(rng: Rng, mode: GameMode): Grid {
  const ctx: DrawCtx = {
    bombRate: mode.kind === 'free' ? BOMB_RATE.free : BOMB_RATE.base,
    lootRate: mode.kind === 'free' ? LOOT_RATE.free : LOOT_RATE.base,
    allowFeature: true,
  };
  const grid: Grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) row.push(drawCell(rng, ctx));
    grid.push(row);
  }
  return grid;
}

export const cloneGrid = (grid: Grid): Grid => grid.map((row) => row.map((cell) => ({ ...cell })));

function cellLabel(cell: Cell): string {
  if (cell.kind === 'bomb') return BOMBS[cell.id].name;
  if (cell.kind === 'symbol') return SYMBOLS[cell.id].name;
  return '';
}

/**
 * One detonation wave: every bomb on the grid goes off together and the coin
 * value of everything inside a footprint is banked. Sandstorms and Ammo
 * Crates are blast-proof — they have to survive to trigger their features.
 */
function detonate(grid: Grid, waveIndex: number, extraMultiplier: number) {
  const bombs = findBombs(grid);
  if (bombs.length === 0) return null;

  const clearedKeys = new Set<string>();
  const cleared: BlastWave['cleared'] = [];
  const waveBombs: BlastWave['bombs'] = [];
  let base = 0;

  const bank = (at: Coord) => {
    const key = `${at.r}:${at.c}`;
    if (clearedKeys.has(key)) return;
    const cell = grid[at.r][at.c];
    if (cell.kind === 'empty' || isFeatureTile(cell)) return;
    clearedKeys.add(key);
    base += cell.value;
    cleared.push({ at, value: cell.value, label: cellLabel(cell) });
  };

  for (const at of bombs) {
    const cell = grid[at.r][at.c] as BombCell;
    waveBombs.push({ at, id: cell.id, value: cell.value });
    bank(at);
    for (const target of BOMBS[cell.id].footprint(at)) {
      if (inBounds(target)) bank(target);
    }
  }

  const ladder = CHAIN_LADDER[Math.min(waveIndex, CHAIN_LADDER.length - 1)];
  const multiplier = ladder * extraMultiplier;

  const gridAfterClear = cloneGrid(grid);
  for (const key of clearedKeys) {
    const [r, c] = key.split(':').map(Number);
    gridAfterClear[r][c] = { kind: 'empty', uid: nextUid() };
  }

  return { bombs: waveBombs, cleared, base, multiplier, win: base * multiplier, gridAfterClear };
}

/** Gravity inside each column, then a top-up from above. */
function collapse(grid: Grid, rng: Rng, mode: GameMode) {
  const out = cloneGrid(grid);
  const drops: BlastWave['drops'] = [];
  const spawns: Coord[] = [];
  const ctx: DrawCtx = {
    bombRate: BOMB_RATE.refill,
    lootRate: mode.kind === 'free' ? LOOT_RATE.free : LOOT_RATE.base,
    allowFeature: false,
  };

  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      const cell = out[r][c];
      if (cell.kind === 'empty') continue;
      if (write !== r) {
        out[write][c] = cell;
        out[r][c] = { kind: 'empty', uid: nextUid() };
        drops.push({ uid: cell.uid, from: { r, c }, to: { r: write, c } });
      }
      write--;
    }
    for (let r = write; r >= 0; r--) {
      out[r][c] = drawCell(rng, ctx);
      spawns.push({ r, c });
    }
  }

  return { grid: out, drops, spawns };
}

/**
 * Minefield hold & win. Ammo Crates and any bombs on the landing grid lock in
 * place, everything else is swept away, and three respins try to fill the
 * board. Each new bomb resets the respin counter.
 */
function runMinefield(rng: Rng, landing: Grid): MinefieldResult {
  const grid: Grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) {
      const cell = landing[r][c];
      if (cell.kind === 'bomb') {
        row.push({ ...makeBomb(rng, cell.id, true), fuse: 0 });
      } else if (cell.kind === 'symbol' && cell.id === 'crate') {
        row.push({ ...makeBomb(rng, undefined, true), fuse: 0 });
      } else {
        row.push({ kind: 'empty', uid: nextUid() });
      }
    }
    grid.push(row);
  }

  const filledCount = () => grid.flat().filter((cell) => cell.kind === 'bomb').length;

  const steps: MinefieldStep[] = [];
  let respins = MINEFIELD_RESPINS;

  while (respins > 0) {
    const open: Coord[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (grid[r][c].kind === 'empty') open.push({ r, c });
    }
    if (open.length === 0) break;

    // Every empty cell gets an independent shot. The rate tightens as the
    // board fills so the Grand stays genuinely rare.
    const pressure = 0.09 * (1 - 0.4 * (filledCount() / (ROWS * COLS)));
    const locked: MinefieldStep['locked'] = [];
    for (const at of open) {
      if (!rng.chance(pressure)) continue;
      const bomb = makeBomb(rng, undefined, true);
      grid[at.r][at.c] = bomb;
      locked.push({ at, id: bomb.id, value: bomb.value });
    }

    respins = locked.length > 0 ? MINEFIELD_RESPINS : respins - 1;
    steps.push({ locked, respinsLeft: respins, filled: filledCount(), jackpot: null });
  }

  const filled = filledCount();
  let jackpot: JackpotId | null = null;
  for (const id of JACKPOT_ORDER) {
    if (filled >= JACKPOTS[id].cells) { jackpot = id; break; }
  }
  if (steps.length > 0) steps[steps.length - 1].jackpot = jackpot;

  const collected = grid.flat()
    .reduce((sum, cell) => sum + (cell.kind === 'bomb' ? cell.value : 0), 0);
  const jackpotWin = jackpot ? JACKPOTS[jackpot].mult : 0;

  return { steps, finalGrid: grid, collected, jackpot, win: collected + jackpotWin };
}

export interface SpinOptions {
  /** Force the Minefield trigger (buy feature / debug). */
  forceMinefield?: boolean;
  /** Force this many Sandstorms onto the landing grid (buy feature / debug). */
  forceScatters?: number;
}

/**
 * Play one spin end to end.
 *
 * Tiles never pay by matching. Bombs land, detonate together, and bank the
 * coin value of every loot tile inside their footprint. Survivors fall into
 * the crater, fresh tiles drop in, and a bomb in that refill continues the
 * chain one rung up the multiplier ladder.
 */
export function spin(rng: Rng, mode: GameMode, opts: SpinOptions = {}): SpinResult {
  let initialGrid = makeGrid(rng, mode);

  if (opts.forceScatters && opts.forceScatters > 0) {
    initialGrid = forceSymbol(rng, initialGrid, 'scatter', opts.forceScatters, mode);
  }
  if (opts.forceMinefield) {
    initialGrid = forceSymbol(rng, initialGrid, 'crate', CRATES_FOR_MINEFIELD + rng.int(2), mode);
  }

  const scatters = findSymbol(initialGrid, 'scatter');
  const crates = findSymbol(initialGrid, 'crate');

  const triggeredFreeSpins = scatters.length >= SCATTERS_FOR_FREE
    ? FREE_SPINS_BASE + (scatters.length - SCATTERS_FOR_FREE) * FREE_SPINS_PER_EXTRA_SCATTER
    : 0;

  // Ammo Crates take the whole spin — the board freezes into hold & win
  // instead of detonating.
  if (crates.length >= CRATES_FOR_MINEFIELD) {
    const minefield = runMinefield(rng, initialGrid);
    return {
      initialGrid,
      waves: [],
      scatters,
      crates,
      chainWin: 0,
      totalWin: minefield.win,
      triggeredFreeSpins,
      minefield,
      peakMultiplier: 1,
    };
  }

  const waves: BlastWave[] = [];
  let working = initialGrid;
  let chainWin = 0;
  let peakMultiplier = 0;

  for (let waveIndex = 0; waveIndex < 24; waveIndex++) {
    const blast = detonate(working, waveIndex, mode.persistentMultiplier || 1);
    if (!blast) break;

    const { grid: refilled, drops, spawns } = collapse(blast.gridAfterClear, rng, mode);
    waves.push({ ...blast, gridAfterRefill: refilled, drops, spawns });
    chainWin += blast.win;
    peakMultiplier = Math.max(peakMultiplier, blast.multiplier);
    working = refilled;
  }

  return {
    initialGrid,
    waves,
    scatters,
    crates,
    chainWin,
    totalWin: chainWin,
    triggeredFreeSpins,
    minefield: null,
    peakMultiplier: peakMultiplier || 1,
  };
}

function forceSymbol(rng: Rng, grid: Grid, id: SymbolId, count: number, mode: GameMode): Grid {
  const out = cloneGrid(grid);
  const slots: Coord[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) slots.push({ r, c });
  const lootRate = mode.kind === 'free' ? LOOT_RATE.free : LOOT_RATE.base;
  let need = Math.max(0, count - findSymbol(out, id).length);
  while (need > 0 && slots.length > 0) {
    const at = slots.splice(rng.int(slots.length), 1)[0];
    const cell = out[at.r][at.c];
    if (cell.kind === 'symbol' && cell.id === id) continue;
    out[at.r][at.c] = makeSymbol(rng, id, lootRate);
    need--;
  }
  return out;
}

export interface FreeSpinsSession {
  rounds: { result: SpinResult; multiplierBefore: number; extraSpins: number }[];
  totalWin: number;
  spinsPlayed: number;
  finalMultiplier: number;
}

/**
 * Run a whole free-spins session. The chain ladder never resets here: every
 * detonation permanently raises the multiplier carried into the next spin.
 */
export function playFreeSpins(rng: Rng, count: number): FreeSpinsSession {
  const rounds: FreeSpinsSession['rounds'] = [];
  let persistent = 1;
  let remaining = count;
  let played = 0;
  let totalWin = 0;

  while (remaining > 0 && played < 300) {
    remaining--;
    played++;
    const multiplierBefore = persistent;
    const result = spin(rng, { kind: 'free', persistentMultiplier: persistent });
    totalWin += result.totalWin;

    let extraSpins = 0;
    if (result.scatters.length >= SCATTERS_FOR_FREE) {
      extraSpins = FREE_SPINS_RETRIGGER;
      remaining += extraSpins;
    }
    if (result.waves.length > 0) {
      persistent = Math.min(FREE_MULT_CAP, persistent + result.waves.length);
    }

    rounds.push({ result, multiplierBefore, extraSpins });
  }

  return { rounds, totalWin, spinsPlayed: played, finalMultiplier: persistent };
}
