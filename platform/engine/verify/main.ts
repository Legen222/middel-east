/**
 * Public verifier. Bundled with the exact engine code the server runs (pure-JS SHA-256/HMAC),
 * so every result can be replayed offline in any browser.
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

const GAMES: Record<string, { label: string; fields: string; run: (s: FloatSource) => Report }> = {
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
    fields: `<label>Case<select id="p-case">${SAMPLE_CASES.map((c) => `<option value="${c.id}">${c.name} · ${priceCase(c)} Frags</option>`).join('')}</select></label>
      <label>Contents of this case version (JSON, optional)<textarea id="p-items" rows="3" placeholder='[{"name":"Rusty Screw","value":1,"weight":50000}, …]'></textarea></label>
      <small>The bet page shows the exact contents of the case version you opened; paste them here for edited or new cases.</small>`,
    run: (s) => {
      const custom = val('p-items');
      const c: CaseDef = custom ? { id: 'custom', name: 'Custom case', items: JSON.parse(custom) } : SAMPLE_CASES.find((x) => x.id === val('p-case'))!;
      const o = openCase(s, c);
      const W = c.items.reduce((a, i) => a + i.weight, 0);
      return { headline: `${o.item.name} · ${o.item.value} Frags`, tone: o.item.value >= priceCase(c) ? 'win' : 'lose', rows: [
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
    fields: `<label>Entries in order (Frags, comma-separated)<input id="p-entries" value="10, 25.5, 4"></label>`,
    run: (s) => {
      const entries = val('p-entries').split(',').map((x) => ({ amount: Math.round(Number(x.trim()) * 1000) }));
      const ranges = jackpotTicketRanges(entries);
      const o = drawJackpot(s, entries);
      return { headline: `Winning ticket ${o.ticket.toLocaleString('en-US')} → entry ${o.winner + 1}`, tone: 'neutral', rows: [
        ['Formula', `ticket = ⌊f · ${o.total.toLocaleString('en-US')}⌋ (1 ticket = 0.001 Frag)`],
        ...ranges.map((r, i) => [`Entry ${i + 1}`, `tickets ${r.from.toLocaleString('en-US')} – ${(r.to - 1).toLocaleString('en-US')} · ${fmt(((r.to - r.from) / o.total) * 100)} %`] as Row),
        ['Winner receives', `${fmt(o.payout / 1000)} Frags (pot − 4 %)`]] };
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
  const game = val('game');
  $('fields').innerHTML = game === 'crash' ? '' : GAMES[game].fields;
  $('seed-mode').hidden = game === 'crash';
  $('crash-mode').hidden = game !== 'crash';
  if (game !== 'crash') $('fields').querySelectorAll('input,select,textarea').forEach((el) => el.addEventListener('change', verify));
}

function show(r: Report, checks: Row[]): void {
  const floats = r.floats?.length ? [['Floats used', r.floats.slice(0, 24).map((f) => f.toFixed(8)).join(' · ') + (r.floats.length > 24 ? ' …' : '')] as Row] : [];
  $('out').innerHTML = `<p class="headline ${r.tone}">${esc(r.headline)}</p>
    <dl>${[...checks, ...r.rows, ...floats].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v.startsWith('<pre') ? v : esc(v)}</dd>`).join('')}</dl>`;
}

function verify(): void {
  try {
    const game = val('game');
    if (game === 'crash') {
      const seed = val('c-seed'), client = val('c-client'), prev = val('c-prev');
      const cp = crashPoint(seed, client);
      const checks: Row[] = [['HMAC(game seed, client seed)', cp.hex], ['h (52 bits)', `${cp.hex.slice(0, 13)} = ${cp.h.toLocaleString('en-US')}`],
        ['Formula', 'crash = max(1, ⌊100 · 0.98 · 2⁵² / (2⁵² − h)⌋ / 100)']];
      if (prev) checks.unshift(['Chain', verifyChainLink(seed, prev) ? '✓ sha256(seed) = previous seed / terminal hash' : '✗ does not match the previous seed']);
      show({ headline: `Crash at ${fmt(cp.crash)}×`, tone: 'neutral', rows: [] }, checks);
      return;
    }
    const server = val('s-seed'), hash = val('s-hash'), client = val('s-client'), nonce = Math.round(num('s-nonce'));
    if (!server) throw new Error('Server seed missing. Your account shows it after you rotate the seed.');
    const checks: Row[] = [];
    if (hash) checks.push(['Commitment', sha256Hex(server) === hash.toLowerCase() ? '✓ sha256(server seed) = published hash' : '✗ Hash does NOT match: the seed was changed or copied incorrectly']);
    checks.push(['HMAC round 0', toHex(hmacHex(server, `${client}:${nonce}:0`))]);
    const rec = new Recorder(new FairStream(server, client, nonce));
    const r = GAMES[game].run(rec);
    r.floats = rec.floats;
    show(r, checks);
  } catch (e) {
    $('out').innerHTML = `<p class="headline lose">Cannot verify</p><p class="err">${esc((e as Error).message)}</p>`;
  }
}

function init(): void {
  $('game').innerHTML = Object.entries(GAMES).map(([k, g]) => `<option value="${k}">${g.label}</option>`).join('') + '<option value="crash">Scrap Press (crash)</option>';
  $('game').addEventListener('change', () => { render(); verify(); });
  document.querySelectorAll('#seed-mode input, #crash-mode input').forEach((el) => el.addEventListener('input', verify));
  $('go').addEventListener('click', verify);
  render();
  verify();
}
init();
