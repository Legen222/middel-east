/**
 * Monument Run (towers). 8 rooms; in every room the player picks one door. The keycard level fixes
 * doors and traps per room for the whole run:
 *   green 4 doors / 1 trap (p = 3/4) · blue 3 / 1 (2/3) · red 2 / 1 (1/2) · black 3 / 2 (1/3)
 * Trap doors are drawn at the start: for every room a partial Fisher–Yates over its doors
 * (one float per trap), so the whole layout is fixed by seed + nonce before the first pick.
 * Cash-out after k cleared rooms pays  mult_k = (1 − e) / p^k.
 * As in Raid, V_k = mult_k is a martingale from the first room on: E[V_{k+1} | V_k] = p · V_k / p = V_k,
 * so RTP = 1 − e for every stopping rule and every choice of doors.
 */

import { EDGE } from '../config';
import type { FloatSource } from '../pf/stream';

export const TOWER_ROOMS = 8;
export const TOWER_LEVELS = {
  green: { doors: 4, traps: 1 },
  blue: { doors: 3, traps: 1 },
  red: { doors: 2, traps: 1 },
  black: { doors: 3, traps: 2 },
} as const;
export type TowerLevel = keyof typeof TOWER_LEVELS;

export const towerSafeChance = (level: TowerLevel): number => {
  const l = TOWER_LEVELS[level];
  return (l.doors - l.traps) / l.doors;
};

export const towersMultiplier = (level: TowerLevel, cleared: number, edge = EDGE.towers): number =>
  cleared === 0 ? 1 : (1 - edge) / towerSafeChance(level) ** cleared;

/** Trap doors per room (sorted), drawn room by room. */
export function layTraps(src: FloatSource, level: TowerLevel): number[][] {
  if (!(level in TOWER_LEVELS)) throw new RangeError('unknown level');
  const { doors, traps } = TOWER_LEVELS[level];
  const rooms: number[][] = [];
  for (let r = 0; r < TOWER_ROOMS; r++) {
    const d = Array.from({ length: doors }, (_, i) => i);
    for (let i = 0; i < traps; i++) {
      const j = i + Math.floor(src.next() * (doors - i));
      [d[i], d[j]] = [d[j], d[i]];
    }
    rooms.push(d.slice(0, traps).sort((a, b) => a - b));
  }
  return rooms;
}

/** Plays fixed picks (one door per room) and cashes out after the last pick, or busts on a trap. */
export function playTowers(src: FloatSource, level: TowerLevel, picks: number[], edge = EDGE.towers): { traps: number[][]; cleared: number; hitTrap: boolean; multiplier: number } {
  if (picks.length < 1 || picks.length > TOWER_ROOMS) throw new RangeError('1 to 8 picks');
  const traps = layTraps(src, level);
  const { doors } = TOWER_LEVELS[level];
  for (let r = 0; r < picks.length; r++) {
    if (!Number.isInteger(picks[r]) || picks[r] < 0 || picks[r] >= doors) throw new RangeError('invalid door');
    if (traps[r].includes(picks[r])) return { traps, cleared: r, hitTrap: true, multiplier: 0 };
  }
  return { traps, cleared: picks.length, hitTrap: false, multiplier: towersMultiplier(level, picks.length, edge) };
}

export const towersTheoreticalRtp = (_level: TowerLevel, edge = EDGE.towers): number => 1 - edge;
