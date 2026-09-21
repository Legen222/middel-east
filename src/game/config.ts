import type { BombId, Coord, JackpotId, SymbolId } from './types';

export const ROWS = 5;
export const COLS = 5;
export const CELLS = ROWS * COLS;

export interface SymbolDef {
  id: SymbolId;
  name: string;
  arabic: string;
  tier: 'low' | 'mid' | 'high' | 'special';
  /** Coin values (bet multipliers) and their relative weights. */
  values: [value: number, weight: number][];
  /** Reel weight. */
  weight: number;
  accent: string;
  accent2: string;
}

/**
 * Tiles never pay by matching. A share of them land as *loot* — carrying a
 * printed coin value — and that value is only banked when a bomb clears the
 * tile. Everything else is scenery that a blast simply sweeps away.
 */
export const SYMBOLS: Record<SymbolId, SymbolDef> = {
  dates: {
    id: 'dates', name: 'Dates', arabic: 'تمر', tier: 'low',
    values: [[0.1, 60], [0.2, 30], [0.4, 10]],
    weight: 130, accent: '#c98b4b', accent2: '#7a4a1e',
  },
  tea: {
    id: 'tea', name: 'Mint Tea', arabic: 'شاي', tier: 'low',
    values: [[0.1, 55], [0.25, 32], [0.5, 13]],
    weight: 125, accent: '#79c7a8', accent2: '#2c6b52',
  },
  spice: {
    id: 'spice', name: 'Spice Bowls', arabic: 'بهارات', tier: 'low',
    values: [[0.15, 55], [0.3, 33], [0.6, 12]],
    weight: 120, accent: '#e0703a', accent2: '#8a2f13',
  },
  lantern: {
    id: 'lantern', name: 'Souk Lantern', arabic: 'فانوس', tier: 'low',
    values: [[0.15, 50], [0.4, 35], [0.8, 15]],
    weight: 115, accent: '#f0c14b', accent2: '#8a6414',
  },
  carpet: {
    id: 'carpet', name: 'Flying Carpet', arabic: 'بساط', tier: 'mid',
    values: [[0.25, 48], [0.5, 34], [1.2, 18]],
    weight: 92, accent: '#b5497c', accent2: '#5c1c3d',
  },
  hookah: {
    id: 'hookah', name: 'Hookah', arabic: 'شيشة', tier: 'mid',
    values: [[0.3, 46], [0.75, 34], [1.5, 20]],
    weight: 86, accent: '#6f8fd8', accent2: '#243a72',
  },
  falcon: {
    id: 'falcon', name: 'Desert Falcon', arabic: 'صقر', tier: 'mid',
    values: [[0.4, 44], [1, 34], [2, 22]],
    weight: 78, accent: '#cdd6e4', accent2: '#4d5a70',
  },
  scarab: {
    id: 'scarab', name: 'Golden Scarab', arabic: 'جعران', tier: 'high',
    values: [[0.5, 42], [1.5, 34], [3, 24]],
    weight: 58, accent: '#5fd0c6', accent2: '#1d6b66',
  },
  jambiya: {
    id: 'jambiya', name: 'Jambiya Dagger', arabic: 'جنبية', tier: 'high',
    values: [[0.75, 40], [2, 34], [5, 26]],
    weight: 46, accent: '#e05a52', accent2: '#7a1f1c',
  },
  sabre: {
    id: 'sabre', name: 'Crossed Sabres', arabic: 'سيوف', tier: 'high',
    values: [[1, 38], [3, 34], [8, 28]],
    weight: 34, accent: '#f2d98b', accent2: '#8a6a1c',
  },
  scatter: {
    id: 'scatter', name: 'Sandstorm', arabic: 'عاصفة', tier: 'special',
    values: [[0, 1]],
    weight: 12, accent: '#f5b942', accent2: '#8a5a12',
  },
  crate: {
    id: 'crate', name: 'Ammo Crate', arabic: 'ذخيرة', tier: 'special',
    values: [[0, 1]],
    weight: 20, accent: '#c2a35e', accent2: '#4a3d24',
  },
};

export const SYMBOL_ORDER: SymbolId[] = [
  'sabre', 'jambiya', 'scarab', 'falcon', 'hookah', 'carpet',
  'lantern', 'spice', 'tea', 'dates',
];

/** Share of ordinary tiles that land carrying a coin value. */
export const LOOT_RATE = { base: 0.171, free: 0.3 };

export interface BombDef {
  id: BombId;
  name: string;
  arabic: string;
  shape: string;
  /** Cells cleared relative to the bomb; the bomb's own cell is implicit. */
  footprint: (at: Coord) => Coord[];
  values: [value: number, weight: number][];
  /** Richer value table used while the Minefield hold & win is running. */
  holdValues: [value: number, weight: number][];
  weight: number;
  accent: string;
  accent2: string;
  /** Screen-shake strength, 0..1. */
  shake: number;
}

const plus = (at: Coord): Coord[] => [
  { r: at.r - 1, c: at.c }, { r: at.r + 1, c: at.c },
  { r: at.r, c: at.c - 1 }, { r: at.r, c: at.c + 1 },
];

const box3 = (at: Coord): Coord[] => {
  const out: Coord[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      out.push({ r: at.r + dr, c: at.c + dc });
    }
  }
  return out;
};

const wholeRow = (at: Coord): Coord[] => {
  const out: Coord[] = [];
  for (let c = 0; c < COLS; c++) if (c !== at.c) out.push({ r: at.r, c });
  return out;
};

const wholeCol = (at: Coord): Coord[] => {
  const out: Coord[] = [];
  for (let r = 0; r < ROWS; r++) if (r !== at.r) out.push({ r, c: at.c });
  return out;
};

const diagonals = (at: Coord): Coord[] => {
  const out: Coord[] = [];
  for (let d = 1; d < Math.max(ROWS, COLS); d++) {
    out.push({ r: at.r - d, c: at.c - d }, { r: at.r - d, c: at.c + d });
    out.push({ r: at.r + d, c: at.c - d }, { r: at.r + d, c: at.c + d });
  }
  return out;
};

export const BOMBS: Record<BombId, BombDef> = {
  grenade: {
    id: 'grenade', name: 'Hand Grenade', arabic: 'قنبلة', shape: 'Cross blast',
    footprint: plus,
    values: [[0.2, 48], [0.4, 30], [0.8, 16], [2, 6]],
    holdValues: [[0.5, 40], [1, 28], [2, 18], [4, 10], [10, 4]],
    weight: 46, accent: '#7fae5a', accent2: '#2f4d1e', shake: 0.35,
  },
  dynamite: {
    id: 'dynamite', name: 'Dynamite Bundle', arabic: 'ديناميت', shape: 'Full column',
    footprint: wholeCol,
    values: [[0.25, 48], [0.5, 30], [1, 16], [2.5, 6]],
    holdValues: [[0.75, 40], [1.5, 28], [3, 18], [6, 10], [15, 4]],
    weight: 30, accent: '#d4453c', accent2: '#701713', shake: 0.55,
  },
  scimitar: {
    id: 'scimitar', name: 'Scimitar Sweep', arabic: 'مقص', shape: 'Full row',
    footprint: wholeRow,
    values: [[0.25, 48], [0.5, 30], [1, 16], [2.5, 6]],
    holdValues: [[0.75, 40], [1.5, 28], [3, 18], [6, 10], [15, 4]],
    weight: 30, accent: '#9fd2e8', accent2: '#2a5a73', shake: 0.5,
  },
  djinn: {
    id: 'djinn', name: 'Djinn Lamp', arabic: 'مصباح', shape: '3×3 burst',
    footprint: box3,
    values: [[0.3, 46], [0.6, 30], [1.2, 17], [3, 7]],
    holdValues: [[1, 38], [2, 28], [4, 19], [8, 11], [20, 4]],
    weight: 20, accent: '#b98ce8', accent2: '#4a2a75', shake: 0.7,
  },
  starmine: {
    id: 'starmine', name: 'Star Mine', arabic: 'نجمة', shape: 'Both diagonals',
    footprint: diagonals,
    values: [[0.3, 46], [0.75, 30], [1.5, 17], [4, 7]],
    holdValues: [[1, 38], [2.5, 28], [5, 19], [10, 11], [25, 4]],
    weight: 16, accent: '#f2a93b', accent2: '#8a4d0e', shake: 0.65,
  },
};

export const BOMB_ORDER: BombId[] = ['grenade', 'dynamite', 'scimitar', 'djinn', 'starmine'];

/** Chance a dropped tile is a bomb, per context. */
export const BOMB_RATE = { base: 0.014, free: 0.034, refill: 0.032 };

/** Chain multiplier ladder — wave 1 is ×1, wave 2 is ×2, and so on. */
export const CHAIN_LADDER = [1, 2, 3, 5, 8, 12, 20, 35, 60];

export const SCATTERS_FOR_FREE = 3;
export const FREE_SPINS_BASE = 10;
export const FREE_SPINS_PER_EXTRA_SCATTER = 5;
/** Extra free spins when 3+ Sandstorms land again during the feature. */
export const FREE_SPINS_RETRIGGER = 5;
/** Cap on the persistent free-spins multiplier. */
export const FREE_MULT_CAP = 20;

export const CRATES_FOR_MINEFIELD = 4;
export const MINEFIELD_RESPINS = 3;

export const JACKPOTS: Record<JackpotId, { label: string; arabic: string; mult: number; cells: number }> = {
  mini: { label: 'Mini', arabic: 'صغير', mult: 10, cells: 15 },
  minor: { label: 'Minor', arabic: 'أصغر', mult: 30, cells: 19 },
  major: { label: 'Major', arabic: 'كبير', mult: 80, cells: 22 },
  grand: { label: 'Grand', arabic: 'أكبر', mult: 2000, cells: 25 },
};

export const JACKPOT_ORDER: JackpotId[] = ['grand', 'major', 'minor', 'mini'];

export const BET_STEPS = [
  0.2, 0.4, 0.6, 0.8, 1, 1.5, 2, 3, 4, 5, 7.5, 10, 15, 20, 30, 50, 75, 100,
];

export const DEFAULT_BALANCE = 1000;

/** Win presentation thresholds, as multiples of the stake. */
export const WIN_TIERS = [
  { at: 8, label: 'NICE WIN', arabic: 'فوز' },
  { at: 20, label: 'BIG WIN', arabic: 'فوز كبير' },
  { at: 50, label: 'MEGA WIN', arabic: 'فوز ضخم' },
  { at: 120, label: 'EPIC WIN', arabic: 'فوز أسطوري' },
  { at: 300, label: 'SIEGE WIN', arabic: 'حصار' },
];

/** Buy-feature prices, as multiples of the stake. Calibrated by tools/sim.ts. */
export const BUY_FEATURE = {
  free: 73,
  minefield: 76,
};
