/**
 * Public verifier. Bundled with the exact engine code the server runs (pure-JS SHA-256/HMAC),
 * so every result can be replayed offline in any browser.
 */

import {
  FairStream, PLINKO_TABLES, SAMPLE_CASES, TILES,
  crashPoint, diceMultiplier, layMines, minesMultiplier, openCase, playBattle, playCoinflip, playDice,
  playPlinko, playRaid, playUpgrader, priceCase, sha256Hex, toHex, hmacHex, verifyChainLink,
  type BattleMode, type FloatSource, type PlinkoRisk, type PlinkoRows, type RaidTool,
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
    fields: `<label>Stake value<input id="p-in" value="100" inputmode="decimal"></label><label>Target value<input id="p-target" value="200" inputmode="decimal"></label>`,
    run: (s) => {
      const o = playUpgrader(s, num('p-in'), num('p-target'));
      return { headline: o.win ? 'Upgrade succeeded' : 'Upgrade failed', tone: o.win ? 'win' : 'lose', rows: [
        ['Chance', `${fmt(o.chance * 100, 4)} % = stake / target · 0.95`], ['Roll', `f = ${o.roll.toFixed(8)} ${o.win ? '<' : '≥'} chance`]] };
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
    fields: `<label>Case<select id="p-case">${SAMPLE_CASES.map((c) => `<option value="${c.id}">${c.name} · ${priceCase(c)} Frags</option>`).join('')}</select></label>`,
    run: (s) => {
      const c = SAMPLE_CASES.find((x) => x.id === val('p-case'))!;
      const o = openCase(s, c);
      const W = c.items.reduce((a, i) => a + i.weight, 0);
      return { headline: `${o.item.name} · ${o.item.value} Frags`, tone: o.item.value >= priceCase(c) ? 'win' : 'lose', rows: [
        ['Ticket', `⌊f · ${W.toLocaleString('en-US')}⌋ = ${o.ticket.toLocaleString('en-US')}`],
        ['Contents', c.items.map((i) => `${i.name} ${fmt((i.weight / W) * 100, 3)} %`).join(' · ')]] };
    },
  },
  battles: {
    label: 'Case Battle',
    fields: `<label>Cases (ids, comma-separated)<input id="p-bcases" value="toolbox,military-crate,elite-crate"></label>
      <label>Seats<select id="p-seats"><option>2</option><option>3</option><option>4</option></select></label>
      <label>Mode<select id="p-mode"><option value="normal">Normal</option><option value="crazy">Crazy</option><option value="terminal">Terminal</option></select></label>`,
    run: (s) => {
      const ids = val('p-bcases').split(',').map((x) => x.trim());
      const cases = ids.map((id) => { const c = SAMPLE_CASES.find((x) => x.id === id); if (!c) throw new Error(`Unknown case: ${id}`); return c; });
      const o = playBattle(s, cases, Number(val('p-seats')), val('p-mode') as BattleMode);
      return { headline: `Winner: seat ${o.winners.map((w) => w + 1).join(' & ')}`, tone: 'neutral', rows: [
        ...o.drops.map((r, i) => [`Round ${i + 1}`, r.map((it, s2) => `P${s2 + 1}: ${it.name} (${it.value})`).join(' · ')] as Row),
        ['Totals', o.totals.map((t, i) => `P${i + 1}: ${t}`).join(' · ')], ['Payout', o.payouts.map((p, i) => `P${i + 1}: ${fmt(p)}`).join(' · ')]] };
    },
  },
};

function render(): void {
  const game = val('game');
  $('fields').innerHTML = game === 'crash' ? '' : GAMES[game].fields;
  $('seed-mode').hidden = game === 'crash';
  $('crash-mode').hidden = game !== 'crash';
  if (game !== 'crash') $('fields').querySelectorAll('input,select').forEach((el) => el.addEventListener('change', verify));
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
