import { type RaidBet, api } from '../api';
import type { View } from '../main';
import { $, $$, bindStake, esc, fairBox, frags, guard, mult, readNum, sleep, stakeField } from '../ui';

const LAYERS: [string, string][] = [['Twig', '#8a6a3c'], ['Holz', '#a0763f'], ['Stein', '#8b8680'], ['Metall', '#7d8a93'], ['HQM', '#5b6a78'], ['Tool Cupboard', '#B7471D']];
const TOOLS = [
  { id: 'c4', name: 'C4', p: 0.8 },
  { id: 'rocket', name: 'Rakete', p: 0.6 },
  { id: 'satchel', name: 'Satchel', p: 0.4 },
] as const;
const E = 0.03;

export const raidView: View = {
  title: 'Raid',
  html: () => `
  <section class="game">
    <div class="game-stage">
      <div class="game-head">
        <div><p class="eyebrow">Signature</p><h1 class="h-display">Raid</h1>
          <p>Pro Wand wählst du den Sprengstoff. Aussteigen zahlt Einsatz × 0,97 ÷ (Produkt der Chancen). Egal wie du spielst: 97 % RTP.</p></div>
        <div class="big-mult" id="mult">1,00×</div>
      </div>
      <div class="walls" id="walls"></div>
      <p class="status" id="status" role="status">Einsatz wählen und Raid starten.</p>
    </div>
    <aside class="game-side">
      ${stakeField('stake', 10)}
      <div class="tools" id="tools">${TOOLS.map((t) => `<button type="button" class="tool" data-tool="${t.id}" disabled><b>${t.name}</b><span>${Math.round(t.p * 100)} % · ×${(1 / t.p).toFixed(2).replace('.', ',')}</span></button>`).join('')}</div>
      <button class="btn block" id="start" type="button">Raid starten</button>
      <button class="btn win block" id="cash" type="button" hidden>Loot sichern</button>
      <div id="fair"></div>
      <p class="muted" style="font-size:12px">Jede Wand: ein Wurf f ∈ [0, 1), durch bei f &lt; Chance. Der Wurf steht schon beim Start fest (Seed + Nonce).</p>
    </aside>
  </section>`,
  mount: (root, c) => {
    bindStake(root);
    let bet: RaidBet | null = null;
    let tools: string[] = [];

    const draw = (heldAt = -1) => {
      const breached = bet?.status === 'open' ? bet.layersBreached ?? 0 : tools.length - (heldAt >= 0 ? 1 : 0);
      $('#walls', root).innerHTML = LAYERS.map(([n, col], i) => {
        const cls = i < breached ? 'broken' : i === heldAt ? 'held' : bet?.status === 'open' && i === breached ? 'cur' : '';
        const used = tools[i] ? TOOLS.find((t) => t.id === tools[i])!.name + (i === heldAt ? ' ✗' : ' ✓') : '';
        return `<div class="wall ${cls}" style="--wc:${col}"><span class="tier">${n}</span><span class="hp"></span><span class="x">${used}</span></div>`;
      }).join('');
      const open = bet?.status === 'open';
      $$<HTMLButtonElement>('.tool', root).forEach((b) => { b.disabled = !open; });
      $('#start', root).hidden = open;
      const cash = $<HTMLButtonElement>('#cash', root);
      cash.hidden = !open;
      cash.disabled = !open || breached === 0;
      if (open) cash.textContent = `Loot sichern · ${frags(bet!.stake * (bet!.currentMultiplier ?? 1))}`;
      $('#mult', root).textContent = mult(open ? bet!.currentMultiplier ?? 1 : bet?.status === 'settled' ? bet.multiplier : 1);
      $('#mult', root).className = `big-mult ${bet?.status === 'settled' ? (bet.payout > 0 ? 'win' : 'lose') : ''}`;
      $('#fair', root).innerHTML = bet ? fairBox(bet.fairness) : fairBox({ ...c.me.seed, nonce: c.me.seed.nextNonce });
      $$<HTMLButtonElement>('.tool', root).forEach((b) => {
        const t = TOOLS.find((x) => x.id === b.dataset.tool)!;
        const base = open && breached > 0 ? bet!.currentMultiplier ?? 1 - E : 1 - E; // 0.97/Πp so far
        const next = base / t.p;
        b.querySelector('span')!.textContent = `${Math.round(t.p * 100)} % · → ${mult(next)}`;
      });
    };
    const status = (t: string, cls = '') => { const s = $('#status', root); s.textContent = t; s.className = `status ${cls}`; };

    api<RaidBet[]>('GET', '/games/open').then((g) => {
      const r = g.find((x) => x.game === 'raid');
      if (r) { bet = r; tools = []; status(`Offener Raid gefunden: ${r.layersBreached} Wände durch. Weiter oder sichern?`); draw(); }
    }).catch(() => null);

    $('#start', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      bet = await api<RaidBet>('POST', '/raid/start', { stake: readNum($<HTMLInputElement>('#stake', root).value) });
      tools = [];
      status('Basis gefunden. Erste Wand: Twig.');
      draw();
      await c.refresh();
    }));
    $$<HTMLButtonElement>('.tool', root).forEach((b) => b.addEventListener('click', () => guard(b, async () => {
      if (!bet) return;
      const layer = LAYERS[bet.layersBreached ?? 0][0];
      status(`Sprengsatz an ${layer} …`);
      await sleep(450);
      const res = await api<RaidBet>('POST', `/raid/${bet.id}/blast`, { tool: b.dataset.tool });
      tools.push(b.dataset.tool!);
      bet = res;
      if (res.status === 'settled') {
        const held = res.payout === 0;
        draw(held ? tools.length - 1 : -1);
        status(held ? `${layer} hält. Raid abgewehrt.` : `Tool Cupboard geknackt: +${frags(res.payout)} Frags.`, held ? 'lose' : 'win');
        await c.refresh();
      } else {
        draw();
        status(`${esc(layer)} ist durch. Nächste Wand: ${res.nextLayer}. Weiter oder sichern?`);
      }
    })));
    $('#cash', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      if (!bet) return;
      bet = await api<RaidBet>('POST', `/raid/${bet.id}/cashout`, {});
      draw();
      status(`Loot gesichert: ${frags(bet.payout)} Frags.`, 'win');
      await c.refresh();
    }));
    draw();
  },
};
