/**
 * Raid — SCRAPLINE signature mode.
 * A base has 6 layers (Twig → Holz → Stein → Metall → HQM → Tool Cupboard). Before each layer the
 * player picks an explosive with breach probability p (C4 0.80, Rakete 0.60, Satchel 0.40).
 * One float per blast: breach ⇔ f < p.
 * Cash-out after j breached layers pays  mult_j = (1 − e) / Π_{i≤j} p_i.
 *
 * Fairness for every strategy: let V_j = mult_j while alive (0 once held). One more blast with p gives
 *   E[V_{j+1} | V_j] = p · V_j / p + (1 − p) · 0 = V_j,
 * so V is a martingale. The first blast gives E[V_1] = p · (1 − e)/p = 1 − e, and by optional stopping
 * (at most 6 steps) E[payout] = 1 − e no matter which tools are chosen or when the player stops.
 */

import { EDGE } from '../config';
import type { FloatSource } from '../pf/stream';

export const RAID_LAYERS = ['Twig', 'Holz', 'Stein', 'Metall', 'HQM', 'Tool Cupboard'] as const;
export const RAID_TOOLS = { c4: 0.8, rocket: 0.6, satchel: 0.4 } as const;
export type RaidTool = keyof typeof RAID_TOOLS;

export interface RaidStep {
  layer: (typeof RAID_LAYERS)[number];
  tool: RaidTool;
  roll: number;
  breached: boolean;
}

export interface RaidOutcome {
  steps: RaidStep[];
  held: boolean;
  multiplier: number;
}

export const raidMultiplier = (tools: RaidTool[], edge = EDGE.raid): number =>
  tools.length === 0 ? 1 : (1 - edge) / tools.reduce((p, t) => p * RAID_TOOLS[t], 1);

/**
 * Plays a raid. `plan` is called before each layer with the steps so far and returns the tool to use,
 * or null to cash out. At least one blast is required; after 6 breaches the raid cashes out automatically.
 */
export function playRaid(src: FloatSource, plan: (steps: RaidStep[]) => RaidTool | null, edge = EDGE.raid): RaidOutcome {
  const steps: RaidStep[] = [];
  for (let i = 0; i < RAID_LAYERS.length; i++) {
    const tool = plan(steps);
    if (tool === null) {
      if (i === 0) throw new RangeError('a raid needs at least one blast');
      break;
    }
    const p = RAID_TOOLS[tool];
    const roll = src.next();
    const breached = roll < p;
    steps.push({ layer: RAID_LAYERS[i], tool, roll, breached });
    if (!breached) return { steps, held: true, multiplier: 0 };
  }
  return { steps, held: false, multiplier: raidMultiplier(steps.map((s) => s.tool), edge) };
}

export const raidTheoreticalRtp = (edge = EDGE.raid): number => 1 - edge;
