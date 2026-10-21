import { mountVerifier, type VerifyPrefill } from '../../../engine/verify/core';
import { api } from '../api';
import type { View } from '../main';

/**
 * In-app verifier: the same engine code the server runs, computed here in the browser. A bet's detail
 * links here with its seeds and parameters (`#/verify?q=…`), so a player checks a round in one click.
 */

/** The parts of a bet detail (GET /history/:game/:ref) the verifier needs. */
export interface BetDetail {
  game: string; ref: string; stake: number; params: Record<string, any>; result: Record<string, any> | null;
  fairness: Record<string, any>; seats?: unknown[]; entries?: { amount: number }[];
}

const caseItems = async (id: string, version: number) => (await api<{ items: { name: string; value: number; weight: number }[] }>('GET', `/cases/${encodeURIComponent(id)}/v/${version}`)).items
  .map(({ name, value, weight }) => ({ name, value, weight }));

/** Seeds and per-game fields for a round, ready for the verifier. Null when there is nothing to replay. */
export async function prefillFor(d: BetDetail): Promise<VerifyPrefill | null> {
  const f = d.fairness ?? {};
  const p = d.params ?? {};
  const r = d.result ?? {};
  const seeded = (fields: Record<string, string> = {}): VerifyPrefill => ({ game: d.game, serverSeed: f.serverSeed ?? '', serverHash: f.serverSeedHash ?? '', clientSeed: f.clientSeed ?? '', nonce: f.nonce ?? 0, fields });
  const beacon = (game: string, fields: Record<string, string> = {}): VerifyPrefill => ({ game, serverSeed: f.serverSeed ?? '', serverHash: f.serverSeedHash ?? '', clientSeed: f.beaconValue ?? '', nonce: 0, fields });
  switch (d.game) {
    case 'dice': return seeded({ 'p-chance': String(p.chance), 'p-dir': String(p.direction) });
    case 'mines': return seeded({ 'p-mines': String(p.mines) });
    case 'plinko': return seeded({ 'p-rows': String(p.rows), 'p-risk': String(p.risk) });
    case 'raid': return seeded(Array.isArray(r.steps) ? { 'p-plan': r.steps.map((s: { tool: string }) => s.tool).join(',') } : {});
    case 'upgrader': return seeded({ 'p-in': String(d.stake), 'p-target': String(d.stake * Number(p.multiplier)), 'p-zone': String(p.zone ?? 0) });
    case 'airdrop': return seeded({ 'p-target-x': String(p.target) });
    case 'towers': return seeded({ 'p-level': String(p.level) });
    case 'hilo': return seeded(Array.isArray(r.moves) ? { 'p-moves': r.moves.join(',') } : {});
    case 'blackjack': return seeded(Array.isArray(r.actions) ? { 'p-actions': r.actions.join(',') } : {});
    case 'cases': return seeded({ 'p-case': String(p.caseId), 'p-items': JSON.stringify(await caseItems(p.caseId, p.version ?? 1)) });
    case 'coinflip': return beacon('coinflip', { 'p-side': String(p.side) });
    case 'battle': {
      const ids: string[] = p.caseIds ?? [];
      const items: Record<string, unknown> = {};
      for (const [i, id] of ids.entries()) items[id] = await caseItems(id, p.versions?.[i] ?? 1);
      return beacon('battles', { 'p-bcases': ids.join(','), 'p-seats': String(d.seats?.length ?? 2), 'p-mode': String(p.mode), 'p-bitems': JSON.stringify(items) });
    }
    case 'jackpot': return beacon('jackpot', { 'p-entries': (d.entries ?? []).map((e) => String(e.amount)).join(', ') });
    case 'wheel': return f.seed ? { game: 'wheel', serverSeed: f.seed, clientSeed: f.clientSeed ?? '', nonce: 0 } : null;
    case 'crash': return f.seed ? { game: 'crash', serverSeed: f.seed, clientSeed: f.clientSeed ?? '' } : null;
    default: return null;
  }
}

export const verifyHref = (p: VerifyPrefill) => `#/verify?q=${encodeURIComponent(JSON.stringify(p))}`;

export const verifyView: View = {
  title: 'Verifier',
  html: () => `
  <section class="card">
    <div class="game-head"><div><p class="eyebrow">Provably fair · computed in your browser</p><h1 class="h-display">Verifier</h1>
      <p>Replay any round with the same engine code the server runs. Open a bet in <a href="#/history">History</a> and press “Verify in browser”, or paste seeds by hand. Nothing here talks to the server.</p></div></div>
  </section>
  <section id="verifier"></section>`,
  mount: (root) => {
    let prefill: VerifyPrefill | undefined;
    try {
      const q = new URLSearchParams(location.hash.split('?')[1] ?? '').get('q');
      if (q) prefill = JSON.parse(q) as VerifyPrefill;
    } catch { prefill = undefined; }
    mountVerifier(root.querySelector('#verifier') as HTMLElement, prefill);
  },
};
