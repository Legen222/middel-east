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
const fmt = (x: number, d = 2) => x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

type Row = [string, string];
interface Report { headline: string; tone: 'win' | 'lose' | 'neutral'; rows: Row[]; floats?: number[] }

const GAMES: Record<string, { label: string; fields: string; run: (s: FloatSource) => Report }> = {
  dice: {
    label: 'Würfel',
    fields: `<label>Gewinnchance (%)<input id="p-chance" value="49.5" inputmode="decimal"></label>
      <label>Richtung<select id="p-dir"><option value="under">unter</option><option value="over">über</option></select></label>`,
    run: (s) => {
      const chance = num('p-chance'); const direction = val('p-dir') as 'under' | 'over';
      const o = playDice(s, { chance, direction });
      return { headline: `Wurf ${fmt(o.roll)}`, tone: o.win ? 'win' : 'lose', rows: [
        ['Formel', 'wurf = ⌊f · 10000⌋ / 100'], ['Bedingung', direction === 'under' ? `wurf < ${chance}` : `wurf ≥ ${fmt(100 - chance)}`],
        ['Ergebnis', o.win ? `gewonnen · ${fmt(diceMultiplier(chance), 4)}×` : 'verloren']] };
    },
  },
  mines: {
    label: 'Minenfeld',
    fields: `<label>Anzahl Minen<input id="p-mines" value="3" inputmode="numeric"></label>`,
    run: (s) => {
      const m = Math.round(num('p-mines')); const mines = layMines(s, m);
      const grid = Array.from({ length: TILES }, (_, i) => (mines.includes(i) ? '✹' : '·'));
      const rows: Row[] = [['Minen auf Feld', mines.map((x) => x + 1).join(', ')], ['Verfahren', 'Fisher–Yates: j = i + ⌊f · (25 − i)⌋']];
      rows.push(['Brett', '<pre class="grid">' + [0, 1, 2, 3, 4].map((r) => grid.slice(r * 5, r * 5 + 5).join(' ')).join('\n') + '</pre>']);
      rows.push(['Multiplikator nach 1 / 3 / 5 Feldern', [1, 3, 5].filter((k) => k <= TILES - m).map((k) => fmt(minesMultiplier(m, k), 4) + '×').join(' · ')]);
      return { headline: `${m} Minen gelegt`, tone: 'neutral', rows };
    },
  },
  plinko: {
    label: 'Schrottrutsche',
    fields: `<label>Reihen<select id="p-rows"><option>8</option><option>12</option><option selected>16</option></select></label>
      <label>Risiko<select id="p-risk"><option value="low">niedrig</option><option value="medium" selected>mittel</option><option value="high">hoch</option></select></label>`,
    run: (s) => {
      const rows = Number(val('p-rows')) as PlinkoRows; const risk = val('p-risk') as PlinkoRisk;
      const o = playPlinko(s, rows, risk);
      return { headline: `Fach ${o.bucket} · ${fmt(o.multiplier, 2)}×`, tone: o.multiplier >= 1 ? 'win' : 'lose', rows: [
        ['Pfad', o.path.join(' ')], ['Regel', 'f ≥ 0,5 → rechts'], ['Tabelle', PLINKO_TABLES[rows][risk].join(' · ')]] };
    },
  },
  raid: {
    label: 'Raid',
    fields: `<label>Sprengstoff je Schicht<input id="p-plan" value="c4,c4,rocket,satchel" aria-describedby="plan-help"></label>
      <small id="plan-help">c4 (80 %), rocket (60 %), satchel (40 %), kommagetrennt, max. 6</small>`,
    run: (s) => {
      const plan = val('p-plan').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) as RaidTool[];
      const o = playRaid(s, (steps) => plan[steps.length] ?? null);
      return { headline: o.held ? `Gehalten bei ${o.steps[o.steps.length - 1].layer}` : `Durch · ${fmt(o.multiplier, 4)}×`, tone: o.held ? 'lose' : 'win',
        rows: o.steps.map((st) => [st.layer, `${st.tool} · f = ${st.roll.toFixed(8)} ${st.breached ? '<' : '≥'} p → ${st.breached ? 'durch' : 'hält'}`] as Row) };
    },
  },
  upgrader: {
    label: 'Werkbank',
    fields: `<label>Einsatz-Wert<input id="p-in" value="100" inputmode="decimal"></label><label>Ziel-Wert<input id="p-target" value="200" inputmode="decimal"></label>`,
    run: (s) => {
      const o = playUpgrader(s, num('p-in'), num('p-target'));
      return { headline: o.win ? 'Upgrade erfolgreich' : 'Upgrade fehlgeschlagen', tone: o.win ? 'win' : 'lose', rows: [
        ['Chance', `${fmt(o.chance * 100, 4)} % = Einsatz / Ziel · 0,95`], ['Wurf', `f = ${o.roll.toFixed(8)} ${o.win ? '<' : '≥'} Chance`]] };
    },
  },
  coinflip: {
    label: 'Münzwurf',
    fields: `<label>Seite des Erstellers<select id="p-side"><option value="rust">Rust</option><option value="scrap">Scrap</option></select></label>`,
    run: (s) => {
      const o = playCoinflip(s, val('p-side') as 'rust' | 'scrap');
      return { headline: `Seite: ${o.side === 'rust' ? 'Rust' : 'Scrap'}`, tone: 'neutral', rows: [
        ['Regel', 'f < 0,5 → Rust, sonst Scrap'], ['Ersteller', o.creatorWins ? 'gewinnt' : 'verliert'], ['Gewinner erhält', `${fmt(o.winnerMultiplier, 2)}× Einsatz (Pot − 4 %)`]] };
    },
  },
  cases: {
    label: 'Kisten',
    fields: `<label>Kiste<select id="p-case">${SAMPLE_CASES.map((c) => `<option value="${c.id}">${c.name} · ${priceCase(c)} Frags</option>`).join('')}</select></label>`,
    run: (s) => {
      const c = SAMPLE_CASES.find((x) => x.id === val('p-case'))!;
      const o = openCase(s, c);
      const W = c.items.reduce((a, i) => a + i.weight, 0);
      return { headline: `${o.item.name} · ${o.item.value} Frags`, tone: o.item.value >= priceCase(c) ? 'win' : 'lose', rows: [
        ['Ticket', `⌊f · ${W.toLocaleString('de-DE')}⌋ = ${o.ticket.toLocaleString('de-DE')}`],
        ['Inhalt', c.items.map((i) => `${i.name} ${fmt((i.weight / W) * 100, 3)} %`).join(' · ')]] };
    },
  },
  battles: {
    label: 'Kisten-Battle',
    fields: `<label>Kisten (IDs, kommagetrennt)<input id="p-bcases" value="werkzeugkiste,militaerkiste,elite-crate"></label>
      <label>Plätze<select id="p-seats"><option>2</option><option>3</option><option>4</option></select></label>
      <label>Modus<select id="p-mode"><option value="normal">Normal</option><option value="crazy">Crazy</option><option value="terminal">Terminal</option></select></label>`,
    run: (s) => {
      const ids = val('p-bcases').split(',').map((x) => x.trim());
      const cases = ids.map((id) => { const c = SAMPLE_CASES.find((x) => x.id === id); if (!c) throw new Error(`Unbekannte Kiste: ${id}`); return c; });
      const o = playBattle(s, cases, Number(val('p-seats')), val('p-mode') as BattleMode);
      return { headline: `Gewinner: Platz ${o.winners.map((w) => w + 1).join(' & ')}`, tone: 'neutral', rows: [
        ...o.drops.map((r, i) => [`Runde ${i + 1}`, r.map((it, s2) => `P${s2 + 1}: ${it.name} (${it.value})`).join(' · ')] as Row),
        ['Summen', o.totals.map((t, i) => `P${i + 1}: ${t}`).join(' · ')], ['Auszahlung', o.payouts.map((p, i) => `P${i + 1}: ${fmt(p)}`).join(' · ')]] };
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
  const floats = r.floats?.length ? [['Verbrauchte Floats', r.floats.slice(0, 24).map((f) => f.toFixed(8)).join(' · ') + (r.floats.length > 24 ? ' …' : '')] as Row] : [];
  $('out').innerHTML = `<p class="headline ${r.tone}">${esc(r.headline)}</p>
    <dl>${[...checks, ...r.rows, ...floats].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v.startsWith('<pre') ? v : esc(v)}</dd>`).join('')}</dl>`;
}

function verify(): void {
  try {
    const game = val('game');
    if (game === 'crash') {
      const seed = val('c-seed'), client = val('c-client'), prev = val('c-prev');
      const cp = crashPoint(seed, client);
      const checks: Row[] = [['HMAC(Spiel-Seed, Client-Seed)', cp.hex], ['h (52 Bit)', `${cp.hex.slice(0, 13)} = ${cp.h.toLocaleString('de-DE')}`],
        ['Formel', 'crash = max(1, ⌊100 · 0,98 · 2⁵² / (2⁵² − h)⌋ / 100)']];
      if (prev) checks.unshift(['Kette', verifyChainLink(seed, prev) ? '✓ sha256(Seed) = vorheriger Seed / Terminal-Hash' : '✗ passt nicht zum vorherigen Seed']);
      show({ headline: `Crash bei ${fmt(cp.crash)}×`, tone: 'neutral', rows: [] }, checks);
      return;
    }
    const server = val('s-seed'), hash = val('s-hash'), client = val('s-client'), nonce = Math.round(num('s-nonce'));
    if (!server) throw new Error('Server-Seed fehlt. Er wird nach dem Rotieren im Konto angezeigt.');
    const checks: Row[] = [];
    if (hash) checks.push(['Commitment', sha256Hex(server) === hash.toLowerCase() ? '✓ sha256(Server-Seed) = veröffentlichter Hash' : '✗ Hash stimmt NICHT – Seed wurde verändert oder falsch kopiert']);
    checks.push(['HMAC Runde 0', toHex(hmacHex(server, `${client}:${nonce}:0`))]);
    const rec = new Recorder(new FairStream(server, client, nonce));
    const r = GAMES[game].run(rec);
    r.floats = rec.floats;
    show(r, checks);
  } catch (e) {
    $('out').innerHTML = `<p class="headline lose">Prüfung nicht möglich</p><p class="err">${esc((e as Error).message)}</p>`;
  }
}

function init(): void {
  $('game').innerHTML = Object.entries(GAMES).map(([k, g]) => `<option value="${k}">${g.label}</option>`).join('') + '<option value="crash">Schrottpresse (Crash)</option>';
  $('game').addEventListener('change', () => { render(); verify(); });
  document.querySelectorAll('#seed-mode input, #crash-mode input').forEach((el) => el.addEventListener('input', verify));
  $('go').addEventListener('click', verify);
  render();
  verify();
}
init();
