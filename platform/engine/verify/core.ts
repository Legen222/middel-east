/**
 * Verifier core: the form, every game's replay and the result panel. Mounted by the standalone page
 * (verify/main.ts → verify.html, works offline) and by the web app's #/verify route, so both run the
 * exact engine code the server runs (pure-JS SHA-256/HMAC).
 */

import {
  FairStream, PLINKO_TABLES, SAMPLE_CASES, TILES,
  crashPoint, diceMultiplier, layMines, minesMultiplier, openCase, playBattle, playCoinflip, playDice,
  playPlinko, playRaid, playUpgrader, upgraderOffset, priceCase, sha256Hex, toHex, hmacHex, verifyChainLink,
  type BattleMode, type FloatSource, type PlinkoRisk, type PlinkoRows, type RaidTool,
  type CaseDef, WHEEL_LAYOUT, spinWheel, wheelPayout, drawJackpot, jackpotTicketRanges, playAirdrop, airdropChance,
  TOWER_LEVELS, layTraps, towersMultiplier, type TowerLevel, drawCard, hiloChance, hiloMultiplier, hiloWins, RANK_NAMES,
  bjActions, bjAct, bjDeal, bjSettle, cardRank, handTotal, type BjAction,
} from '../src/index';

class Recorder implements FloatSource {
  floats: number[] = [];
  constructor(private inner: FloatSource) {}
  next(): number { const f = this.inner.next(); this.floats.push(f); return f; }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const val = (id: string) => ($<HTMLInputElement>(id).value ?? '').trim();
const num = (id: string) => Number(val(id).replace(',', '.'));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (x: number, d = 2) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

type Row = [string, string];
interface Report { headline: string; tone: 'win' | 'lose' | 'neutral'; rows: Row[]; floats?: number[] }

export const VERIFY_GAMES: Record<string, { label: string; fields: string; run: (s: FloatSource) => Report }> = {
  dice: {
    label: 'Dice',
    fields: `<label>Win chance (%)<input id="p-chance" value="49.5" inputmode="decimal"></label>
      <label>Direction<select id="p-dir"><option value="under">under</option><option value="over">over</option></select></label>`,
    run: (s) => {
      const chance = num('p-chance'); const direction = val('p-dir') as 'under' | 'over';
      const o = playDice(s, { chance, direction });
      return { headline: `Roll ${fmt(o.roll)}`, tone: o.win ? 'win' : 'lose', rows: [
        ['Formula', 'roll = ⌊f · 10000⌋ / 100'], ['Condition', direction === 'under' ? `roll < ${chance}` : `roll ≥ ${fmt(100 - chance)}`],
        ['Result', o.win ? `won · ${fmt(diceMultiplier(chance), 4)}×` : 'lost']] };
    },
  },
  mines: {
    label: 'Minefield',
    fields: `<label>Number of mines<input id="p-mines" value="3" inputmode="numeric"></label>`,
    run: (s) => {
      const m = Math.round(num('p-mines')); const mines = layMines(s, m);
      const grid = Array.from({ length: TILES }, (_, i) => (mines.includes(i) ? '✹' : '·'));
      const rows: Row[] = [['Mines on tiles', mines.map((x) => x + 1).join(', ')], ['Method', 'Fisher–Yates: j = i + ⌊f · (25 − i)⌋']];
      rows.push(['Board', '<pre class="grid">' + [0, 1, 2, 3, 4].map((r) => grid.slice(r * 5, r * 5 + 5).join(' ')).join('\n') + '</pre>']);
      rows.push(['Multiplier after 1 / 3 / 5 tiles', [1, 3, 5].filter((k) => k <= TILES - m).map((k) => fmt(minesMultiplier(m, k), 4) + '×').join(' · ')]);
      return { headline: `${m} mines placed`, tone: 'neutral', rows };
    },
  },
  plinko: {
    label: 'Scrap Chute',
    fields: `<label>Rows<select id="p-rows"><option>8</option><option>12</option><option selected>16</option></select></label>
      <label>Risk<select id="p-risk"><option value="low">low</option><option value="medium" selected>medium</option><option value="high">high</option></select></label>`,
    run: (s) => {
      const rows = Number(val('p-rows')) as PlinkoRows; const risk = val('p-risk') as PlinkoRisk;
      const o = playPlinko(s, rows, risk);
      return { headline: `Bucket ${o.bucket} · ${fmt(o.multiplier, 2)}×`, tone: o.multiplier >= 1 ? 'win' : 'lose', rows: [
        ['Path', o.path.join(' ')], ['Rule', 'f ≥ 0.5 → right'], ['Table', PLINKO_TABLES[rows][risk].join(' · ')]] };
    },
  },
  raid: {
    label: 'Raid',
    fields: `<label>Explosive per layer<input id="p-plan" value="c4,c4,rocket,satchel" aria-describedby="plan-help"></label>
      <small id="plan-help">c4 (80 %), rocket (60 %), satchel (40 %), comma-separated, max. 6</small>`,
    run: (s) => {
      const plan = val('p-plan').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) as RaidTool[];
      const o = playRaid(s, (steps) => plan[steps.length] ?? null);
      return { headline: o.held ? `Held at ${o.steps[o.steps.length - 1].layer}` : `Breached · ${fmt(o.multiplier, 4)}×`, tone: o.held ? 'lose' : 'win',
        rows: o.steps.map((st) => [st.layer, `${st.tool} · f = ${st.roll.toFixed(8)} ${st.breached ? '<' : '≥'} p → ${st.breached ? 'breached' : 'holds'}`] as Row) };
    },
  },
  upgrader: {
    label: 'Workbench',
    fields: `<label>Stake value<input id="p-in" value="100" inputmode="decimal"></label><label>Target value<input id="p-target" value="200" inputmode="decimal"></label>
      <label>Zone start (0–9999, from the bet's params)<input id="p-zone" value="0" inputmode="numeric"></label>`,
    run: (s) => {
      const o = playUpgrader(s, num('p-in'), num('p-target'), undefined, Math.round(num('p-zone')));
      const off = upgraderOffset(o.roll, o.zone);
      return { headline: o.win ? 'Upgrade succeeded' : 'Upgrade failed', tone: o.win ? 'win' : 'lose', rows: [
        ['Chance', `${fmt(o.chance * 100, 4)} % = stake / target · 0.95`],
        ['Win zone', `${fmt(o.zone / 100, 2)} % → ${fmt(((o.zone / 10000 + o.chance) % 1) * 100, 2)} % of the ring`],
        ['Roll', `f = ${o.roll.toFixed(8)} · (f − start) mod 1 = ${off.toFixed(8)} ${o.win ? '<' : '≥'} chance`]] };
    },
  },
  coinflip: {
    label: 'Coinflip',
    fields: `<label>Creator's side<select id="p-side"><option value="rust">Rust</option><option value="scrap">Scrap</option></select></label>`,
    run: (s) => {
      const o = playCoinflip(s, val('p-side') as 'rust' | 'scrap');
      return { headline: `Side: ${o.side === 'rust' ? 'Rust' : 'Scrap'}`, tone: 'neutral', rows: [
        ['Rule', 'f < 0.5 → Rust, otherwise Scrap'], ['Creator', o.creatorWins ? 'wins' : 'loses'], ['Winner receives', `${fmt(o.winnerMultiplier, 2)}× stake (pot − 4 %)`]] };
    },
  },
  cases: {
    label: 'Cases',
    fields: `<label>Case<select id="p-case">${SAMPLE_CASES.map((c) => `<option value="${c.id}">${c.name} · ${priceCase(c)} Scrap</option>`).join('')}</select></label>
      <label>Contents of this case version (JSON, optional)<textarea id="p-items" rows="3" placeholder='[{"name":"Rusty Screw","value":1,"weight":50000}, …]'></textarea></label>
      <small>The bet page shows the exact contents of the case version you opened; paste them here for edited or new cases.</small>`,
    run: (s) => {
      const custom = val('p-items');
      const c: CaseDef = custom ? { id: 'custom', name: 'Custom case', items: JSON.parse(custom) } : SAMPLE_CASES.find((x) => x.id === val('p-case'))!;
      const o = openCase(s, c);
      const W = c.items.reduce((a, i) => a + i.weight, 0);
      return { headline: `${o.item.name} · ${o.item.value} Scrap`, tone: o.item.value >= priceCase(c) ? 'win' : 'lose', rows: [
        ['Ticket', `⌊f · ${W.toLocaleString('en-US')}⌋ = ${o.ticket.toLocaleString('en-US')}`],
        ['Contents', c.items.map((i) => `${i.name} ${fmt((i.weight / W) * 100, 3)} %`).join(' · ')]] };
    },
  },
  battles: {
    label: 'Case Battle',
    fields: `<label>Cases (ids, comma-separated)<input id="p-bcases" value="barrel,toolbox,elite-crate"></label>
      <label>Seats<select id="p-seats"><option>2</option><option>3</option><option>4</option></select></label>
      <label>Mode<select id="p-mode"><option value="normal">Normal</option><option value="crazy">Crazy</option><option value="terminal">Terminal</option><option value="team">Team 2v2 (4 seats: P1+P2 vs P3+P4)</option><option value="bonus">Bonus (power rounds, jackpot drops, final spin)</option></select></label>
      <label>Contents of older case versions (JSON, optional)<textarea id="p-bitems" rows="3" placeholder='{"toolbox": [{"name":"Gears","value":30,"weight":22000}, …]}'></textarea></label>
      <small>A battle stores the case versions it used; the battle page shows their contents. Paste them here for cases that changed since.</small>`,
    run: (s) => {
      const ids = val('p-bcases').split(',').map((x) => x.trim());
      const custom = val('p-bitems') ? (JSON.parse(val('p-bitems')) as Record<string, CaseDef['items']>) : {};
      const cases = ids.map((id) => {
        if (custom[id]) return { id, name: id, items: custom[id] } as CaseDef;
        const c = SAMPLE_CASES.find((x) => x.id === id);
        if (!c) throw new Error(`Unknown case: ${id}`);
        return c;
      });
      const mode = val('p-mode') as BattleMode;
      const o = playBattle(s, cases, Number(val('p-seats')), mode);
      const teamRow: Row[] = mode === 'team' ? [['Team totals', `P1+P2: ${o.totals[0] + o.totals[1]} · P3+P4: ${o.totals[2] + o.totals[3]}`]] : [];
      const b = o.bonus;
      const bonusRows: Row[] = b ? [
        ['Power per round', b.powers.map((p, i) => `R${i + 1} ×${p}${i === b.powers.length - 1 ? ' (golden)' : ''}`).join(' · ')],
        ['Jackpot drops', b.jackpotPaid.some((x) => x > 0) ? b.jackpotPaid.map((x, i) => (x > 0 ? `P${i + 1}: ${x}` : '')).filter(Boolean).join(' · ') : 'none'],
        ['Points', b.points.map((x, i) => `P${i + 1}: ${x}`).join(' · ')],
        ['Wheel slices', b.shares.map((x, i) => `P${i + 1}: ${fmt(x * 100, 3)} %`).join(' · ')],
        ['Spin', `f = ${fmt(b.spin, 8)} → seat ${o.winners[0] + 1}; rest of the pool ${fmt(b.rest)} (90 % to the winner, 10 % scrap back)`],
      ] : [];
      return { headline: b ? `Spin winner: seat ${o.winners[0] + 1}` : `Winner: seat ${o.winners.map((w) => w + 1).join(' & ')}`, tone: 'neutral', rows: [
        ...teamRow,
        ...o.drops.map((r, i) => [`Round ${i + 1}`, r.map((it, s2) => `P${s2 + 1}: ${it.name} (${it.value})${b?.jackpots[i][s2] ? ' ★' : ''}`).join(' · ')] as Row),
        ['Totals', o.totals.map((t, i) => `P${i + 1}: ${t}`).join(' · ')], ...bonusRows, ['Payout', o.payouts.map((p, i) => `P${i + 1}: ${fmt(p)}`).join(' · ')]] };
    },
  },
  wheel: {
    label: 'Bandit Wheel (round seed + beacon value, nonce 0)',
    fields: `<small>Server seed = the round's seed (revealed after the spin), client seed = the chain's beacon value, nonce = 0.</small>`,
    run: (s) => {
      const o = spinWheel(s);
      return { headline: `Field ${o.field} · pays ${wheelPayout(o.field)}×`, tone: 'neutral', rows: [
        ['Formula', `index = ⌊f · 25⌋ = ⌊${o.roll.toFixed(8)} · 25⌋ = ${o.index}`], ['Layout', WHEEL_LAYOUT.map((f, i) => (i === o.index ? `<b>[${f}]</b>` : f)).join(' ')]] };
    },
  },
  jackpot: {
    label: 'Jackpot (server seed + beacon value, nonce 0)',
    fields: `<label>Entries in order (Scrap, comma-separated)<input id="p-entries" value="10, 25.5, 4"></label>`,
    run: (s) => {
      const entries = val('p-entries').split(',').map((x) => ({ amount: Math.round(Number(x.trim()) * 1000) }));
      const ranges = jackpotTicketRanges(entries);
      const o = drawJackpot(s, entries);
      return { headline: `Winning ticket ${o.ticket.toLocaleString('en-US')} → entry ${o.winner + 1}`, tone: 'neutral', rows: [
        ['Formula', `ticket = ⌊f · ${o.total.toLocaleString('en-US')}⌋ (1 ticket = 0.001 Scrap)`],
        ...ranges.map((r, i) => [`Entry ${i + 1}`, `tickets ${r.from.toLocaleString('en-US')} – ${(r.to - 1).toLocaleString('en-US')} · ${fmt(((r.to - r.from) / o.total) * 100)} %`] as Row),
        ['Winner receives', `${fmt(o.payout / 1000)} Scrap (pot − 4 %)`]] };
    },
  },
  airdrop: {
    label: 'Airdrop',
    fields: `<label>Target (×)<input id="p-target-x" value="2.00" inputmode="decimal"></label>`,
    run: (s) => {
      const x = num('p-target-x');
      const o = playAirdrop(s, x);
      return { headline: `Landed at ${fmt(o.landing)}×`, tone: o.win ? 'win' : 'lose', rows: [
        ['Formula', 'h = ⌊f₁·2³²⌋·2²⁰ + ⌊f₂·2²⁰⌋ · landing = max(1, ⌊100·0.98·2⁵²/(2⁵²−h)⌋/100)'],
        ['Chance to reach the target', `${fmt(airdropChance(x) * 100, 4)} %`], ['Result', o.win ? `won · ${fmt(x)}×` : 'lost']] };
    },
  },
  towers: {
    label: 'Monument Run',
    fields: `<label>Keycard<select id="p-level">${Object.keys(TOWER_LEVELS).map((l) => `<option>${l}</option>`).join('')}</select></label>`,
    run: (s) => {
      const level = val('p-level') as TowerLevel;
      const traps = layTraps(s, level);
      const { doors } = TOWER_LEVELS[level];
      return { headline: `Trap doors for a ${level} run`, tone: 'neutral', rows: [
        ...traps.map((t, i) => [`Room ${i + 1}`, Array.from({ length: doors }, (_, d) => (t.includes(d) ? '✹' : '·')).join(' ') + ` · cash-out ${fmt(towersMultiplier(level, i + 1), 4)}×`] as Row).reverse(),
        ['Method', 'per room: Fisher–Yates over the doors, j = i + ⌊f · (doors − i)⌋']] };
    },
  },
  hilo: {
    label: 'Hi-Lo',
    fields: `<label>Your moves (hi, lo, skip, comma-separated)<input id="p-moves" value="hi,lo,skip,hi"></label>`,
    run: (s) => {
      const moves = val('p-moves').split(',').map((x) => x.trim()).filter(Boolean);
      const name = (c: { rank: number; suit: number }) => `${RANK_NAMES[c.rank - 1]}${'♠♥♦♣'[c.suit]}`;
      let card = drawCard(s);
      const rows: Row[] = [['Start card', name(card)]];
      const chances: number[] = [];
      for (const m of moves) {
        const next = drawCard(s);
        if (m === 'skip') { rows.push(['skip', name(next)]); card = next; continue; }
        const g = m as 'hi' | 'lo';
        const ok = hiloWins(card.rank, next.rank, g);
        rows.push([`${g} (p = ${hiloChance(card.rank, g).toFixed(4)})`, `${name(next)} → ${ok ? 'correct' : 'wrong'}`]);
        if (!ok) return { headline: 'Round lost', tone: 'lose', rows };
        chances.push(hiloChance(card.rank, g));
        card = next;
      }
      return { headline: `Cash-out value ${fmt(hiloMultiplier(chances), 4)}×`, tone: 'win', rows: [...rows, ['Card formula', 'card = ⌊f · 52⌋ · rank = card mod 13 + 1']] };
    },
  },
  blackjack: {
    label: 'Blackjack',
    fields: `<label>Your actions (hit, stand, double, split, comma-separated)<input id="p-actions" value="hit,stand"></label>`,
    run: (s) => {
      const name = (c: number) => `${RANK_NAMES[cardRank(c) - 1]}${'♠♥♦♣'[Math.floor(c / 13)]}`;
      let st = bjDeal(s);
      for (const a of val('p-actions').split(',').map((x) => x.trim()).filter(Boolean) as BjAction[]) {
        if (st.finished) break;
        if (!bjActions(st).includes(a)) throw new Error(`"${a}" is not allowed at this point`);
        st = bjAct(s, st, a);
      }
      const rows: Row[] = [
        ...st.hands.map((h, i) => [`Hand ${i + 1}${h.doubled ? ' (doubled)' : ''}`, `${h.cards.map(name).join(' ')} = ${handTotal(h.cards).total}`] as Row),
        ['Dealer', `${st.dealer.map(name).join(' ')} = ${handTotal(st.dealer).total}`],
      ];
      if (!st.finished) return { headline: 'Round still open after these actions', tone: 'neutral', rows };
      const r = bjSettle(st);
      return { headline: r.hands.map((h) => h.outcome).join(' · '), tone: r.payout >= r.stake ? 'win' : 'lose', rows: [...rows, ['Return', `${r.payout} of ${r.stake} stake units`], ['Order', 'player, dealer, player, hole card, then every card when needed; card = ⌊f · 52⌋']] };
    },
  },
};

function render(): void {
  const game = val('v-game');
  $('v-fields').innerHTML = game === 'crash' ? '' : VERIFY_GAMES[game].fields;
  $('v-seed-mode').hidden = game === 'crash';
  $('v-crash-mode').hidden = game !== 'crash';
  if (game !== 'crash') $('v-fields').querySelectorAll('input,select,textarea').forEach((el) => el.addEventListener('change', verify));
}

function show(r: Report, checks: Row[]): void {
  const floats = r.floats?.length ? [['Floats used', r.floats.slice(0, 24).map((f) => f.toFixed(8)).join(' · ') + (r.floats.length > 24 ? ' …' : '')] as Row] : [];
  $('v-out').innerHTML = `<p class="vf-headline ${r.tone}">${esc(r.headline)}</p>
    <dl>${[...checks, ...r.rows, ...floats].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v.startsWith('<pre') ? v : esc(v)}</dd>`).join('')}</dl>`;
}

function verify(): void {
  try {
    const game = val('v-game');
    if (game === 'crash') {
      const seed = val('v-c-seed'), client = val('v-c-client'), prev = val('v-c-prev');
      const cp = crashPoint(seed, client);
      const checks: Row[] = [['HMAC(game seed, client seed)', cp.hex], ['h (52 bits)', `${cp.hex.slice(0, 13)} = ${cp.h.toLocaleString('en-US')}`],
        ['Formula', 'crash = max(1, ⌊100 · 0.98 · 2⁵² / (2⁵² − h)⌋ / 100)']];
      if (prev) checks.unshift(['Chain', verifyChainLink(seed, prev) ? '✓ sha256(seed) = previous seed / terminal hash' : '✗ does not match the previous seed']);
      show({ headline: `Crash at ${fmt(cp.crash)}×`, tone: 'neutral', rows: [] }, checks);
      return;
    }
    const server = val('v-s-seed'), hash = val('v-s-hash'), client = val('v-s-client'), nonce = Math.round(num('v-s-nonce'));
    if (!server) throw new Error('Server seed missing. Your account shows it after you rotate the seed.');
    const checks: Row[] = [];
    if (hash) checks.push(['Commitment', sha256Hex(server) === hash.toLowerCase() ? '✓ sha256(server seed) = published hash' : '✗ Hash does NOT match: the seed was changed or copied incorrectly']);
    checks.push(['HMAC round 0', toHex(hmacHex(server, `${client}:${nonce}:0`))]);
    const rec = new Recorder(new FairStream(server, client, nonce));
    const r = VERIFY_GAMES[game].run(rec);
    r.floats = rec.floats;
    show(r, checks);
  } catch (e) {
    $('v-out').innerHTML = `<p class="vf-headline lose">Cannot verify</p><p class="vf-err">${esc((e as Error).message)}</p>`;
  }
}

/** What a caller can fill in up front: seeds, nonce and the game's own fields by id (p-…). */
export interface VerifyPrefill { game: string; serverSeed?: string; serverHash?: string; clientSeed?: string; nonce?: number; prevSeed?: string; fields?: Record<string, string> }

const EXAMPLE = {
  seed: '3f1e9c2a7b6d4e58a1c0f9e8d7b6a5c4b3a29181706f5e4d3c2b1a0918273645', hash: '036b27df7fec37623c4f7a1d088c3bd394b68f40df007484c17c14beaee5823d', client: 'scrapline', nonce: '0',
  crashSeed: '9c1d7e3b5a2f4c6e8d0b1a3c5e7f9b2d4a6c8e0f1b3d5a7c9e2f4b6d8a0c1e3f', crashPrev: 'e7a538b196707e22aec4a2375e7ba6571084af113eed1179ed1c24eb4770cefc',
  crashClient: '0000000000000000000a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcd',
};
const attr = (s: string) => esc(s);

/** Renders the verifier into `root` and runs it once; `prefill` replaces the example values. */
export function mountVerifier(root: HTMLElement, prefill?: VerifyPrefill): void {
  const crash = prefill?.game === 'crash';
  const seeded = prefill && !crash;
  root.innerHTML = `<div class="vf-grid">
    <section class="vf-panel" aria-label="Inputs">
      <h2>Round</h2>
      <label>Game<select id="v-game"></select></label>
      <div id="v-seed-mode" class="vf-fields">
        <label>Server seed (visible after rotation)<input id="v-s-seed" value="${attr(seeded ? prefill.serverSeed ?? '' : EXAMPLE.seed)}" spellcheck="false" autocomplete="off"></label>
        <label>Published hash (before the round)<input id="v-s-hash" value="${attr(seeded ? prefill.serverHash ?? '' : EXAMPLE.hash)}" spellcheck="false" autocomplete="off"></label>
        <label>Client seed<input id="v-s-client" value="${attr(seeded ? prefill.clientSeed ?? '' : EXAMPLE.client)}" spellcheck="false" autocomplete="off"></label>
        <label>Nonce<input id="v-s-nonce" value="${seeded ? prefill.nonce ?? 0 : EXAMPLE.nonce}" inputmode="numeric"></label>
      </div>
      <div id="v-crash-mode" class="vf-fields" hidden>
        <label>Game seed of this round<input id="v-c-seed" value="${attr(crash ? prefill.serverSeed ?? '' : EXAMPLE.crashSeed)}" spellcheck="false" autocomplete="off"></label>
        <label>Previous round's seed or terminal hash (optional)<input id="v-c-prev" value="${attr(crash ? prefill.prevSeed ?? '' : EXAMPLE.crashPrev)}" spellcheck="false" autocomplete="off"></label>
        <label>Chain client seed (public beacon value)<input id="v-c-client" value="${attr(crash ? prefill.clientSeed ?? '' : EXAMPLE.crashClient)}" spellcheck="false" autocomplete="off"></label>
      </div>
      <div id="v-fields" class="vf-fields"></div>
      <button type="button" id="v-go" class="vf-go">Verify</button>
    </section>
    <section class="vf-panel" aria-live="polite" aria-label="Result">
      <h2>Result</h2>
      <div id="v-out"></div>
    </section>
  </div>`;
  $('v-game').innerHTML = Object.entries(VERIFY_GAMES).map(([k, g]) => `<option value="${k}">${g.label}</option>`).join('') + '<option value="crash">Scrap Press (crash)</option>';
  if (prefill && (prefill.game === 'crash' || VERIFY_GAMES[prefill.game])) ($('v-game') as unknown as HTMLSelectElement).value = prefill.game;
  $('v-game').addEventListener('change', () => { render(); verify(); });
  root.querySelectorAll('#v-seed-mode input, #v-crash-mode input').forEach((el) => el.addEventListener('input', verify));
  $('v-go').addEventListener('click', verify);
  render();
  for (const [id, v] of Object.entries(prefill?.fields ?? {})) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.value = v;
  }
  verify();
}
