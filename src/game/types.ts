/** Core domain types for Sandstorm Siege. */

export type SymbolId =
  // low tier — bazaar goods
  | 'dates'
  | 'tea'
  | 'spice'
  | 'lantern'
  // mid tier — treasures
  | 'carpet'
  | 'hookah'
  | 'falcon'
  // high tier — relics
  | 'scarab'
  | 'jambiya'
  | 'sabre'
  // specials
  | 'scatter'
  | 'crate';

/** Bombs are the payout engine. Each detonates in its own footprint. */
export type BombId = 'grenade' | 'dynamite' | 'scimitar' | 'djinn' | 'starmine';

export type CellKind = 'symbol' | 'bomb' | 'empty';

export interface SymbolCell {
  kind: 'symbol';
  id: SymbolId;
  /** Coin value carried by this tile, in bet-multiplier units. 0 for scatter. */
  value: number;
  /** Stable id so the renderer can animate the same DOM node across cascades. */
  uid: number;
}

export interface BombCell {
  kind: 'bomb';
  id: BombId;
  /** Bomb's own collect value, in bet-multiplier units. */
  value: number;
  /** Spins remaining before it blows in Minefield mode; -1 in normal play. */
  fuse: number;
  uid: number;
}

export interface EmptyCell {
  kind: 'empty';
  uid: number;
}

export type Cell = SymbolCell | BombCell | EmptyCell;

export type Grid = Cell[][]; // [row][col]

export interface Coord {
  r: number;
  c: number;
}

/** One detonation wave inside a single spin. */
export interface BlastWave {
  /** Bombs that went off together in this wave. */
  bombs: { at: Coord; id: BombId; value: number }[];
  /** Every cell cleared by this wave (bombs included). */
  cleared: { at: Coord; value: number; label: string }[];
  /** Raw coin total of this wave, before the wave multiplier. */
  base: number;
  /** Chain multiplier applied to this wave. */
  multiplier: number;
  /** base * multiplier */
  win: number;
  /** Grid state after clearing but before refill (for the crater beat). */
  gridAfterClear: Grid;
  /** Grid after gravity + refill. */
  gridAfterRefill: Grid;
  /** Cells that moved down during gravity: uid -> rows fallen. */
  drops: { uid: number; from: Coord; to: Coord }[];
  /** Newly spawned cells from the top. */
  spawns: Coord[];
}

export type JackpotId = 'mini' | 'minor' | 'major' | 'grand';

export interface MinefieldStep {
  /** Bombs newly locked this respin. */
  locked: { at: Coord; id: BombId; value: number }[];
  respinsLeft: number;
  filled: number;
  jackpot: JackpotId | null;
}

export interface MinefieldResult {
  steps: MinefieldStep[];
  finalGrid: Grid;
  collected: number;
  jackpot: JackpotId | null;
  /** Total win in bet-multiplier units. */
  win: number;
}

export interface FreeSpinRound {
  index: number;
  total: number;
  spin: SpinResult;
  /** Chain multiplier carried into the next free spin. */
  carriedMultiplier: number;
}

export interface SpinResult {
  /** Grid as it first lands, before any detonation. */
  initialGrid: Grid;
  waves: BlastWave[];
  scatters: Coord[];
  crates: Coord[];
  /** Win from detonation chains, in bet-multiplier units. */
  chainWin: number;
  /** Total win including features, in bet-multiplier units. */
  totalWin: number;
  triggeredFreeSpins: number;
  minefield: MinefieldResult | null;
  /** Highest chain multiplier reached. */
  peakMultiplier: number;
}

export interface GameMode {
  kind: 'base' | 'free';
  /** Multiplier that persists between spins (free spins only). */
  persistentMultiplier: number;
}
