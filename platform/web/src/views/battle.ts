import { type CaseInfo, api } from '../api';
import { icon } from '../icons';
import { crateFigures, oddsTable, rarity, showCrateOdds } from '../crates';
import { crateArt, itemArt } from '../loot-art';
import type { View } from '../main';
import { $, $$, SCRAP_SYM, esc, frags, guard, modal, reducedMotion, scrap, sleep } from '../ui';

type Rule = 'normal' | 'crazy' | 'terminal' | 'bonus';
type Mode = Rule | 'team';
interface Player { seat: number; name: string; bot: boolean; you: boolean; payout: number }
interface Drop { name: string; value: number }
interface Bonus { powers: number[]; jackpots: boolean[][]; points: number[]; shares: number[]; spin: number; jackpotPaid: number[]; rest: number }
interface Battle {
  id: string; status: 'open' | 'locked' | 'settled' | 'cancelled'; params: { caseIds: string[]; versions?: number[]; mode: Mode }; seats: number; seatStake: number;
  players: Player[]; mine: boolean; result: { drops: Drop[][]; totals: number[]; winners: number[]; bonus?: Bonus } | null; createdAt: number;
  fairness: { serverSeedHash: string; serverSeed: string | null; beacon: { name: string; trustless: boolean; round: number | null; resolvesAt: number | null; value: string | null } };
}

const MAX_ROUNDS = 10;
const FORMATS: [string, number, boolean][] = [['1v1', 2, false], ['1v1v1', 3, false], ['1v1v1v1', 4, false], ['2v2', 4, true]];
const RULES: [Rule, string, string][] = [['normal', 'Normal', 'Highest total takes the pool'], ['crazy', 'Crazy', 'Lowest total takes the pool'], ['terminal', 'Terminal', 'Best drop of the last round takes the pool'], ['bonus', 'Bonus', 'Power rounds, jackpot drops and a final spin']];
/** The five bonus features, as the lobby and the room explain them (engine: BONUS in games/cases.ts). */
const BONUS_FEATURES: [string, string, string][] = [
  ['×5', 'Power rounds', 'Before each round a multiplier is drawn for its points: ×1 (50 %), ×2 (30 %), ×3 (15 %) or ×5 (5 %).'],
  ['★', 'Golden round', 'The last round always counts double on top of its power roll: up to ×10.'],
  ['JP', 'Jackpot drop', 'Pull a crate\'s top item and you keep it, win or lose. It still scores points.'],
  ['%', 'Final spin', 'The rest of the pool goes to one seat drawn on a wheel. Your slice is your share of the points.'],
  ['10', 'Scrap back', '10 % of that rest is split between the seats the wheel did not pick.'],
];
const SEAT_COLORS = ['var(--bp)', 'var(--brass)', 'var(--ok)', 'var(--lose)'];
/** Slot reel: the drop sits at symbol STOP of the strip; the strip is longer so symbols show below it too. */
const STOP = 42;
const STRIP = STOP + 3;
const format = (b: Battle) => (b.params.mode === 'team' ? '2v2' : Array.from({ length: b.seats }, () => '1').join('v'));
const ruleName = (m: Mode) => (m === 'team' ? 'Team' : RULES.find(([k]) => k === m)![1]);
const pctTxt = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)} %`;
const bonusInfo = () => `<div class="bonus-info">${BONUS_FEATURES.map(([k, t, d]) => `<div><span class="bk">${k}</span><b>${t}</b><p>${d}</p></div>`).join('')}</div>`;
const team = (seat: number) => (seat < 2 ? 'a' : 'b');
/** Bots all share one account name; number them by seat so the room can tell them apart. */
const seatName = (p: Player) => (p.bot ? `${p.name} ${p.seat + 1}` : p.name);

function fairness(b: Battle) {
  const bc = b.fairness.beacon;
  return `<details style="font-size:12px"><summary class="muted">Round proof</summary><dl class="fairbox" style="margin-top:6px">
    <dt>Seed hash</dt><dd>${esc(b.fairness.serverSeedHash)}</dd>
    ${b.fairness.serverSeed ? `<dt>Server seed</dt><dd>${esc(b.fairness.serverSeed)}</dd>` : ''}
    <dt>Beacon</dt><dd>${esc(bc.name)}${bc.trustless ? '' : ' <span class="neg">(demo, not trustless)</span>'}${bc.round ? ` · round ${bc.round}` : ' · picked when the last seat fills'}</dd>
    ${bc.value ? `<dt>Client seed</dt><dd>${esc(bc.value)}</dd>` : ''}<dt>Order</dt><dd>${b.params.mode === 'bonus' ? 'per round one power float, then one float per seat; one spin float at the end' : 'round by round, seat by seat, one float each'}</dd></dl></details>`;
}

/** The four rules as cards in the builder. 2v2 is a format and always plays Normal as teams. */
const MODES: { k: Rule; ic: string; text: string; tag?: string }[] = [
  { k: 'normal', ic: 'trophy', text: 'Highest total takes the whole pool.' },
  { k: 'crazy', ic: 'mine', text: 'Lowest total wins. Hope for scrap.' },
  { k: 'terminal', ic: 'target', text: 'Best drop of the last round wins.' },
  { k: 'bonus', ic: 'battle', text: 'Power rounds, jackpot drops, final spin.', tag: 'NEW' },
];
const MODE_ICON: Record<Mode, string> = { normal: 'trophy', crazy: 'mine', terminal: 'target', bonus: 'battle', team: 'user' };
/** Seat dots for a format button: ● ● vs ● ●. */
const seatDots = (n: number, teams: boolean) => Array.from({ length: n }, (_, i) => `${teams && i === 2 ? '<em>vs</em>' : ''}<i></i>`).join('');
/** A seat's avatar: first letter on the seat colour, a wrench for demo bots, a dashed ring when open. */
const seatAvatar = (p: Player | undefined, seat: number, cls = '') => (p
  ? `<span class="sa ${cls}" style="--av:${SEAT_COLORS[seat % 4]}" title="${esc(seatName(p))}">${p.bot ? icon('wrench') : esc([...p.name][0]?.toUpperCase() ?? '?')}</span>`
  : `<span class="sa empty ${cls}" title="Open seat">+</span>`);

export const battleView: View = {
  title: 'Case Battle',
  html: (c) => {
    const id = new URLSearchParams(location.hash.split('?')[1] ?? '').get('id');
    const cases = [...c.cfg.cases].sort((a, b) => a.price - b.price);
    const how = `<details class="bt-how"><summary>How Case Battle works</summary>
      <p>Everyone opens the same crates, round by round. Normal: the highest total takes the whole pool. Crazy: the lowest. Terminal: the best drop of the last round. 2v2: the team with the higher combined total wins and splits the pool. Bonus: power rounds, jackpot drops and a final spin. Every mode hands the whole pool back to the seats, so the house edge is the crates' 7 % in all of them. The result is fixed by a beacon round picked when the last seat fills.</p>
      <p class="eyebrow" style="margin:10px 0 8px">Bonus mode · same 7 % house edge</p>${bonusInfo()}</details>`;
    if (id) return `<section class="card battle-room" id="room"><p class="muted">Loading battle …</p></section>${how}`;
    return `
  <section class="bt-hero">
    <div class="bt-hero-copy"><p class="eyebrow">PvP · Beacon randomness</p><h1 class="h-display">Case Battle</h1>
      <p>Open the same crates as your rivals, round by round. Every mode hands the whole pool back to the seats, so the house edge stays the crates' 7 %.</p>
      <div class="row"><button class="btn" type="button" data-go-builder>${icon('battle')} Create battle</button><a class="btn ghost" href="#/crates">${icon('crate')} Crate odds</a></div></div>
    <div class="bt-stats"><div><b class="num" id="bs-open">–</b><span>open battles</span></div><div><b class="num" id="bs-live">–</b><span>drawing now</span></div><div><b id="bs-pool">–</b><span>biggest open pool</span></div></div>
    <span class="bt-hero-art" aria-hidden="true">${crateArt('elite-crate', 4500)}<em>VS</em>${crateArt('military-crate', 2000)}</span>
  </section>
  ${how}
  <section class="bt-builder" id="builder">
    <div class="card bb-main">
      <div class="bb-step"><span class="bb-n">1</span><div class="bb-body"><h2 class="h-sect">Mode</h2>
        <div class="mode-cards">${MODES.map((m, i) => `<button type="button" class="mode-card" data-rule="${m.k}" aria-pressed="${i === 0}">${icon(m.ic)}<b>${ruleName(m.k)}${m.tag ? `<em>${m.tag}</em>` : ''}</b><span>${m.text}</span></button>`).join('')}</div></div></div>
      <div class="bb-step"><span class="bb-n">2</span><div class="bb-body"><h2 class="h-sect">Players</h2>
        <div class="fmt-cards">${FORMATS.map(([l, seats, teams], i) => `<button type="button" class="fmt-card" data-format="${i}" aria-pressed="${i === 0}"><span class="fmt-seats">${seatDots(seats, teams)}</span><b>${l}</b></button>`).join('')}</div>
        <p class="muted bb-note" id="team-note" hidden>2v2 plays as two teams: the higher combined total wins and the team splits the pool.</p></div></div>
      <div class="bb-step"><span class="bb-n">3</span><div class="bb-body">
        <div class="bb-crates-head"><h2 class="h-sect">Crates</h2><input class="input" id="crate-q" type="search" placeholder="Search crates" aria-label="Search crates">
          <div class="seg" role="group" aria-label="Sort"><button type="button" data-sort="asc" aria-pressed="true">Price ↑</button><button type="button" data-sort="desc" aria-pressed="false">Price ↓</button></div></div>
        <div class="bpick" id="bpick">${cases.map((k) => `
          <div class="bcase" data-case="${k.id}" data-name="${esc(k.name.toLowerCase())}" data-price="${k.price}">
            <span class="bc-count num" data-count="${k.id}" hidden>0</span>
            <button type="button" class="bc-info" data-info="${k.id}" aria-label="Contents and chances of ${esc(k.name)}" title="Contents and chances">i</button>
            <span class="art">${crateArt(k.id, k.price)}</span><b>${esc(k.name)}</b><span class="num bc-price">${scrap(k.price, 0)}</span>
            <div class="bc-act"><button type="button" class="bc-minus" data-minus="${k.id}" aria-label="One ${esc(k.name)} less" hidden>−</button><button type="button" class="bc-plus" data-plus="${k.id}" aria-label="Add ${esc(k.name)}">+ Add</button></div></div>`).join('')}</div>
      </div></div>
    </div>
    <aside class="card bb-summary">
      <p class="eyebrow">Your battle</p>
      <div class="bs-format"><span id="sum-mode"></span><span class="fmt-seats" id="sum-seats"></span></div>
      <ol class="bs-list" id="order"></ol>
      <p class="muted bs-empty" id="sum-empty">Add crates from the list. Each crate is one round, up to ${MAX_ROUNDS}.</p>
      <dl class="bs-figs"><dt>Rounds</dt><dd class="num" id="sum-rounds">0 / ${MAX_ROUNDS}</dd><dt>Cost per seat</dt><dd id="sum-cost">–</dd><dt>Total pool</dt><dd id="sum-pool">–</dd><dt>Pays back</dt><dd class="num">93 %</dd></dl>
      <button class="btn block bs-create" id="create" type="button" disabled>${icon('battle')} Create battle</button>
      <button class="btn ghost small" type="button" id="clear">Clear crates</button>
    </aside>
  </section>
  <section class="bt-list-sect">
    <div class="sect-head"><div><p class="eyebrow"><span class="live-dot"></span> Lobby</p><h2 class="h-sect">Battles</h2></div>
      <div class="seg" role="group" aria-label="Which battles"><button type="button" data-show="open" aria-pressed="true">Open</button><button type="button" data-show="all" aria-pressed="false">All</button></div></div>
    <div class="blist" id="blist"><p class="muted">Loading …</p></div>
  </section>`;
  },
  mount: (root, c) => {
    const id = new URLSearchParams(location.hash.split('?')[1] ?? '').get('id');
    const caseById = new Map(c.cfg.cases.map((k) => [k.id, k]));
    return id ? mountRoom(root, c, id, caseById) : mountLobby(root, c, caseById);
  },
};

/* ---------- lobby: build a battle, list the others ---------- */
function mountLobby(root: HTMLElement, c: Parameters<NonNullable<View['mount']>>[1], caseById: Map<string, CaseInfo>) {
  const order: string[] = [];
  let fmt = 0;
  let rule: Rule = 'normal';
  let show: 'open' | 'all' = 'open';
  const paintPick = () => {
    const [fmtName, seats, isTeam] = FORMATS[fmt];
    for (const [cid] of caseById) {
      const n = order.filter((x) => x === cid).length;
      const badge = root.querySelector<HTMLElement>(`[data-count="${cid}"]`);
      if (badge) { badge.textContent = `×${n}`; badge.hidden = n === 0; }
      const minus = root.querySelector<HTMLElement>(`[data-minus="${cid}"]`);
      if (minus) minus.hidden = n === 0;
      root.querySelector(`.bcase[data-case="${cid}"]`)?.classList.toggle('on', n > 0);
    }
    $$<HTMLButtonElement>('[data-plus]', root).forEach((b) => { b.disabled = order.length >= MAX_ROUNDS; });
    $('#order', root).innerHTML = order.map((cid, i) => {
      const k = caseById.get(cid);
      return `<li><span class="bs-i num">${i + 1}</span><span class="bs-art">${crateArt(cid, k?.price ?? 0)}</span><span class="bs-name">${esc(k?.name ?? cid)}</span><span class="num muted">${frags(k?.price ?? 0, 0)}</span><button type="button" data-drop="${i}" aria-label="Remove round ${i + 1}">✕</button></li>`;
    }).join('');
    $$<HTMLButtonElement>('[data-drop]', root).forEach((b) => b.addEventListener('click', () => { order.splice(Number(b.dataset.drop), 1); paintPick(); }));
    $('#sum-empty', root).hidden = order.length > 0;
    const cost = order.reduce((s, cid) => s + (caseById.get(cid)?.price ?? 0), 0);
    $('#sum-rounds', root).textContent = `${order.length} / ${MAX_ROUNDS}`;
    $('#sum-cost', root).innerHTML = order.length ? scrap(cost, 0) : '–';
    $('#sum-pool', root).innerHTML = order.length ? scrap(cost * seats, 0) : '–';
    $('#sum-mode', root).innerHTML = `${icon(MODE_ICON[isTeam ? 'team' : rule])}${fmtName} · ${isTeam ? 'Teams' : ruleName(rule)}`;
    $('#sum-seats', root).innerHTML = seatDots(seats, isTeam);
    const btn = $<HTMLButtonElement>('#create', root);
    btn.disabled = order.length === 0;
    btn.innerHTML = `${icon('battle')} ${order.length ? `Create · ${scrap(cost, 0)}` : 'Add a crate first'}`;
    $$<HTMLButtonElement>('[data-rule]', root).forEach((b) => { b.disabled = isTeam; b.setAttribute('aria-pressed', String(!isTeam && b.dataset.rule === rule)); });
    $('#team-note', root).hidden = !isTeam;
  };
  const add = (cid: string) => { if (order.length < MAX_ROUNDS) { order.push(cid); paintPick(); } };
  $('#bpick', root).addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const info = t.closest<HTMLElement>('[data-info]');
    if (info) { const k = caseById.get(info.dataset.info!); if (k) showCrateOdds(k); return; }
    const minus = t.closest<HTMLElement>('[data-minus]');
    if (minus) { const i = order.lastIndexOf(minus.dataset.minus!); if (i >= 0) { order.splice(i, 1); paintPick(); } return; }
    const card = t.closest<HTMLElement>('.bcase');
    if (card) add(card.dataset.case!);
  });
  $$<HTMLButtonElement>('[data-format]', root).forEach((b) => b.addEventListener('click', () => { fmt = Number(b.dataset.format); $$('[data-format]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); paintPick(); }));
  $$<HTMLButtonElement>('[data-rule]', root).forEach((b) => b.addEventListener('click', () => { rule = b.dataset.rule as Rule; paintPick(); }));
  $('#clear', root).addEventListener('click', () => { order.length = 0; paintPick(); });
  root.querySelector('[data-go-builder]')?.addEventListener('click', () => $('#builder', root).scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }));
  // search and sort the crate grid
  const grid = $('#bpick', root);
  $<HTMLInputElement>('#crate-q', root).addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
    $$<HTMLElement>('.bcase', grid).forEach((el) => { el.hidden = Boolean(q) && !el.dataset.name!.includes(q); });
  });
  $$<HTMLButtonElement>('[data-sort]', root).forEach((b) => b.addEventListener('click', () => {
    $$('[data-sort]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const dir = b.dataset.sort === 'desc' ? -1 : 1;
    [...grid.children].sort((x, y) => dir * (Number((x as HTMLElement).dataset.price) - Number((y as HTMLElement).dataset.price))).forEach((el) => grid.append(el));
  }));
  // a sensible start: one of the cheapest crate
  const first = [...caseById.values()].sort((a, b) => a.price - b.price)[0];
  if (first) order.push(first.id);
  paintPick();

  $('#create', root).addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
    const [, seats, isTeam] = FORMATS[fmt];
    const g = await api<Battle>('POST', '/pvp/battle', { caseIds: order, seats, mode: isTeam ? 'team' : rule });
    await c.refresh();
    location.hash = `#/battle?id=${g.id}`;
  }));

  let games: Battle[] = [];
  let sig = '';
  const paint = () => {
    const open = games.filter((g) => g.status === 'open');
    const pools = open.map((g) => g.seatStake * g.seats);
    $('#bs-open', root).textContent = String(open.length);
    $('#bs-live', root).textContent = String(games.filter((g) => g.status === 'locked').length);
    $('#bs-pool', root).innerHTML = pools.length ? scrap(Math.max(...pools), 0) : '–';
    const list = show === 'open' ? games.filter((g) => g.status === 'open' || g.status === 'locked') : games;
    const html = list.length ? list.map((g) => {
      const pool = g.seatStake * g.seats;
      const inGame = g.players.some((p) => p.you);
      const winners = g.status === 'settled' && g.result ? g.result.winners : [];
      const seats = Array.from({ length: g.seats }, (_, s) => `${g.params.mode === 'team' && s === 2 ? '<em class="br-vs">vs</em>' : ''}${seatAvatar(g.players.find((p) => p.seat === s), s, winners.includes(s) ? 'won' : '')}`).join('');
      // crates in order, repeats folded into ×n
      const runs: [string, number][] = [];
      for (const cid of g.params.caseIds) { const last = runs[runs.length - 1]; if (last && last[0] === cid) last[1]++; else runs.push([cid, 1]); }
      const winnerName = winners.length ? winners.map((w) => { const p = g.players.find((x) => x.seat === w); return p ? seatName(p) : `Seat ${w + 1}`; }).join(' & ') : '';
      const act = g.status === 'open' && !inGame ? 'Join' : 'Watch';
      return `<a class="brow ${g.status} ${inGame ? 'mine' : ''}" href="#/battle?id=${g.id}">
        <span class="br-mode"><span class="mode-badge m-${g.params.mode}">${icon(MODE_ICON[g.params.mode])}${ruleName(g.params.mode)}</span><small class="num">${format(g)} · ${g.params.caseIds.length} round${g.params.caseIds.length === 1 ? '' : 's'}</small></span>
        <span class="br-seats">${seats}</span>
        <span class="br-crates">${runs.slice(0, 6).map(([cid, n]) => `<span class="br-crate" title="${esc(caseById.get(cid)?.name ?? cid)}">${crateArt(cid, caseById.get(cid)?.price ?? 0)}${n > 1 ? `<em>×${n}</em>` : ''}</span>`).join('')}${runs.length > 6 ? `<em class="br-more">+${runs.length - 6}</em>` : ''}</span>
        <span class="br-price"><b>${scrap(g.seatStake, 0)}</b><small>${g.status === 'settled' && winnerName ? `won by ${esc(winnerName)}` : `pool ${frags(pool, 0)}`}</small></span>
        <span class="br-act"><span class="chip ${g.status === 'settled' ? 'win' : g.status === 'locked' ? 'hot' : ''}">${g.status === 'open' ? `${g.players.length}/${g.seats}` : g.status === 'locked' ? 'drawing' : g.status}</span><span class="btn small ${act === 'Join' ? '' : 'ghost'}">${act}</span></span>
      </a>`;
    }).join('') : `<p class="muted bt-empty">${show === 'open' ? 'No open battles right now. Create one; demo bots can fill the seats.' : 'No battles yet.'}</p>`;
    if (html !== sig) { sig = html; $('#blist', root).innerHTML = html; }
  };
  $$<HTMLButtonElement>('[data-show]', root).forEach((b) => b.addEventListener('click', () => {
    show = b.dataset.show as typeof show;
    $$('[data-show]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    paint();
  }));
  let gone = false; // a list that arrives after leaving the lobby is dropped
  const load = async () => { const list = await api<Battle[]>('GET', '/pvp/list/battle'); if (gone) return; games = list; paint(); };
  void load();
  const t = setInterval(() => void load(), 2000);
  return () => { gone = true; clearInterval(t); };
}

/* ---------- battle room ---------- */
function mountRoom(root: HTMLElement, c: Parameters<NonNullable<View['mount']>>[1], id: string, caseById: Map<string, CaseInfo>) {
  let g: Battle | null = null;
  let playing = false;
  let shownFinal = false;
  let stopped = false;
  const room = $('#room', root);
  // a round chip opens that crate's odds; "Crate odds" shows every crate of this battle
  room.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const r = t.closest<HTMLElement>('[data-crate]');
    if (r) { const k = caseById.get(r.dataset.crate!); if (k) showCrateOdds(k); return; }
    if (t.closest('[data-odds-all]') && g) {
      const ids = [...new Set(g.params.caseIds)];
      const m = modal(`<p class="eyebrow">This battle · ${ids.length} crate${ids.length === 1 ? '' : 's'}</p><h2 class="h-sect" style="font-size:22px">Crate odds</h2>
        ${ids.map((cid) => { const k = caseById.get(cid); return k ? `<section class="bo-crate"><div class="om-head"><span class="om-art">${crateArt(k.id, k.price)}</span><div><h3 class="h-sect">${esc(k.name)}</h3>${crateFigures(k)}</div></div>${oddsTable(k)}</section>` : ''; }).join('')}
        <div class="row"><button class="btn" type="button" data-close>Close</button></div>`);
      m.root.querySelector('.modal')?.classList.add('wide');
      m.root.querySelector('[data-close]')?.addEventListener('click', m.close);
    }
  });
  const priceOf = (cid: string) => caseById.get(cid)?.price ?? 1;

  const skeleton = (b: Battle) => {
    const bonus = b.params.mode === 'bonus';
    const last = b.params.caseIds.length - 1;
    const seats = Array.from({ length: b.seats }, (_, s) => {
      const p = b.players.find((x) => x.seat === s);
      const teamCls = b.params.mode === 'team' ? `team-${team(s)}` : '';
      return `${b.params.mode === 'team' && s === 2 ? '<div class="vs" aria-hidden="true">VS</div>' : ''}<div class="seat ${teamCls}" data-seat="${s}">
        <div class="seat-head"><span class="who">${seatAvatar(p, s)}${p ? `<b>${esc(seatName(p))}</b>${p.you ? '<em class="you-pill">you</em>' : ''}` : '<span class="muted">Waiting for a player</span>'}</span><span class="total-box">${SCRAP_SYM}<span class="num total" data-total="${s}">0</span></span></div>
        ${bonus ? `<div class="chance" data-chance="${s}"><span><i style="width:${100 / b.seats}%;background:${SEAT_COLORS[s]}"></i></span><small class="num"><b data-pts="${s}">0</b> pts · <b data-pct="${s}">${pctTxt(1 / b.seats)}</b></small></div>` : ''}
        <div class="slot" data-slot="${s}"><div class="vtrack" data-vtrack="${s}"></div><i class="payline" aria-hidden="true"></i></div>
        <p class="slot-label" data-label="${s}"><span class="muted">–</span></p>
        <ol class="seat-drops" data-drops="${s}"></ol>
        <div class="seat-foot" data-foot="${s}"></div>
      </div>`;
    }).join('');
    const pool = b.seatStake * b.seats;
    room.innerHTML = `
      <div class="room-head">
        <div class="rh-title"><span class="mode-badge m-${b.params.mode}">${icon(MODE_ICON[b.params.mode])}${ruleName(b.params.mode)}</span><p class="eyebrow">${format(b)} · ${b.params.caseIds.length} round${b.params.caseIds.length === 1 ? '' : 's'}</p>
          <h2 class="rh-pool">${scrap(pool, 0)}<small>pool · ${frags(b.seatStake, 0)} per seat</small></h2></div>
        <div class="row"><span class="chip" id="room-status"></span><button class="btn ghost small" type="button" data-odds-all>${icon('crate')} Crate odds</button><a class="btn ghost small" href="#/battle">← Lobby</a></div>
      </div>
      ${bonus ? `<details class="bonus-legend"><summary>Bonus mode: power rounds · golden last round · jackpot drops · final spin · 10 % scrap back</summary>${bonusInfo()}</details>` : ''}
      <div class="round-strip" id="strip">${b.params.caseIds.map((cid, i) => `<span class="rnd ${bonus && i === last ? 'golden' : ''}" data-round="${i}" data-crate="${cid}" title="${esc(caseById.get(cid)?.name ?? cid)}: contents and chances">${bonus ? `<em class="pow" data-pow="${i}">${i === last ? '★×?' : '×?'}</em>` : ''}<span class="art">${crateArt(cid, priceOf(cid))}</span><small>${i + 1}. ${esc(caseById.get(cid)?.name ?? cid)}</small></span>`).join('')}</div>
      ${bonus ? '<p class="bonus-banner" id="banner" aria-live="polite"></p>' : ''}
      <div class="seats seats-${b.seats} ${b.params.mode === 'team' ? 'teams' : ''}">${seats}</div>
      ${bonus ? `<div class="spin" id="spin" hidden><p class="eyebrow">Final spin · the rest of the pool <span class="num" id="spin-rest"></span></p><div class="spin-win"><div class="spin-strip" id="spin-strip"></div><i class="spin-ptr" aria-hidden="true"></i></div></div>` : ''}
      <div class="row" id="room-actions"></div>
      <p class="status" id="room-msg" role="status"></p>
      <div id="room-fair">${fairness(b)}</div>`;
  };

  const paintMeta = (b: Battle) => {
    const st = $('#room-status', room);
    const left = b.fairness.beacon.resolvesAt ? Math.max(0, Math.ceil((b.fairness.beacon.resolvesAt - Date.now()) / 1000)) : 0;
    st.textContent = b.status === 'open' ? `Waiting for players · ${b.players.length}/${b.seats}` : b.status === 'locked' ? `Beacon round in ${left} s` : b.status === 'settled' ? 'Settled' : 'Cancelled';
    st.className = `chip ${b.status === 'settled' ? 'win' : b.status === 'cancelled' ? 'lose' : ''}`;
    const inGame = b.players.some((p) => p.you);
    const acts = $('#room-actions', room);
    const sig = `${b.status}|${b.players.length}|${inGame}|${b.mine}`;
    if (acts.dataset.sig === sig) return; // unchanged: keep the buttons (and the Fast switch) as they are
    acts.dataset.sig = sig;
    acts.innerHTML = b.status === 'open' ? `${!inGame ? `<button class="btn" type="button" data-act="join">Join · ${scrap(b.seatStake, 0)}</button>` : ''}
        ${b.mine ? `<button class="btn ghost" type="button" data-act="bots">Fill with demo bots</button><button class="btn ghost" type="button" data-act="cancel">Cancel</button>` : ''}`
      : b.status === 'settled' ? `<button class="btn ghost" type="button" data-act="replay">${icon('upgrade')} Replay</button><label class="check"><input type="checkbox" id="fast"> <span>Fast</span></label>` : '';
    $$<HTMLButtonElement>('[data-act]', acts).forEach((btn) => btn.addEventListener('click', () => guard(btn, async () => {
      const a = btn.dataset.act;
      if (a === 'join') { await api('POST', `/pvp/${b.id}/join`); await c.refresh(); }
      if (a === 'cancel') { await api('POST', `/pvp/${b.id}/cancel`); await c.refresh(); }
      if (a === 'bots') for (let i = b.players.length; i < b.seats; i++) await api('POST', `/pvp/${b.id}/bot`);
      if (a === 'replay') { await play(b); return; }
      await load();
    })));
  };

  /** Shows every round at once (a battle that was already settled when the room opened). */
  const paintFinal = (b: Battle) => {
    const r = b.result!;
    for (let s = 0; s < b.seats; s++) {
      $(`[data-drops="${s}"]`, room).innerHTML = r.drops.map((round, i) => dropRow(round[s], b.params.caseIds[i])).join('');
      $(`[data-total="${s}"]`, room).textContent = frags(r.totals[s], 0);
      const li = r.drops.length - 1;
      const tr = $(`[data-vtrack="${s}"]`, room);
      tr.innerHTML = symHtml(r.drops[li][s], b.params.caseIds[li], true);
      tr.style.transform = `translateY(${(tr.parentElement!.clientHeight - symH(tr)) / 2}px)`;
      landLabel(s, r.drops[li][s], b.params.caseIds[li], Boolean(r.bonus?.jackpots[li][s]));
    }
    $$('.rnd', room).forEach((x) => x.classList.add('done'));
    if (r.bonus) {
      r.bonus.powers.forEach((p, i) => setPower(i, p));
      paintChance(b, r.bonus.points);
      markJackpots(b, r.drops.length);
      showSpin(b, r.bonus, 0);
    }
    finish(b);
  };
  const setPower = (i: number, p: number) => {
    const el = room.querySelector<HTMLElement>(`[data-pow="${i}"]`);
    if (el) { el.textContent = `${el.closest('.golden') ? '★' : ''}×${p}`; el.className = `pow on p${Math.min(p, 5)}${p >= 5 ? ' hot' : ''}`; }
  };
  const paintChance = (b: Battle, points: number[]) => {
    const sum = points.reduce((a, x) => a + x, 0);
    points.forEach((pt, s) => {
      const share = sum > 0 ? pt / sum : 1 / b.seats;
      const bar = room.querySelector<HTMLElement>(`[data-chance="${s}"] i`);
      if (bar) bar.style.width = `${(share * 100).toFixed(2)}%`;
      const pts = room.querySelector(`[data-pts="${s}"]`);
      if (pts) pts.textContent = frags(pt, 0);
      const pc = room.querySelector(`[data-pct="${s}"]`);
      if (pc) pc.textContent = pctTxt(share);
    });
  };
  /** Marks the jackpot drops of the first `rounds` rounds in every seat's list. */
  const markJackpots = (b: Battle, rounds: number) => {
    const jp = b.result!.bonus!.jackpots;
    for (let s = 0; s < b.seats; s++) {
      const items = room.querySelectorAll(`[data-drops="${s}"] li`);
      for (let i = 0; i < rounds; i++) if (jp[i][s]) items[i]?.classList.add('jp');
    }
  };
  /** The final spin as a horizontal reel of slices; the pointer stops at the spin float. */
  const showSpin = async (b: Battle, bonus: Bonus, ms: number) => {
    const box = room.querySelector<HTMLElement>('#spin');
    if (!box) return;
    box.hidden = false;
    $('#spin-rest', room).textContent = `${frags(bonus.rest, 0)} Scrap`;
    const LAPS = 4;
    const slices = bonus.shares.map((sh, s) => `<span style="flex:${Math.max(sh, 0.0001)};background:${SEAT_COLORS[s]}" title="${esc(nameOf(b, s))} ${pctTxt(sh)}"><b>${sh >= 0.08 ? pctTxt(sh) : ''}</b></span>`).join('');
    const strip = $('#spin-strip', room);
    strip.innerHTML = Array.from({ length: LAPS + 1 }, () => `<div class="lap">${slices}</div>`).join('');
    const win = strip.parentElement!.clientWidth;
    strip.querySelectorAll<HTMLElement>('.lap').forEach((l) => { l.style.width = `${win}px`; });
    const target = -((LAPS - 1) * win + bonus.spin * win) + win / 2;
    strip.style.transition = 'none';
    strip.style.transform = ms ? 'translateX(0)' : `translateX(${target}px)`;
    if (!ms) return;
    void strip.offsetWidth;
    strip.style.transition = `transform ${ms}ms cubic-bezier(.12,.75,.2,1)`;
    strip.style.transform = `translateX(${target}px)`;
    await sleep(ms + 150);
  };
  /** One slot symbol: the item's icon, tinted with its rarity colour. */
  const symHtml = (d: Drop, cid: string, win = false) => `<div class="sym ${win ? 'win' : ''}" style="--rc:${rarity(d.value, priceOf(cid))}">${itemArt(d.name)}</div>`;
  const symH = (track: HTMLElement) => (track.firstElementChild as HTMLElement | null)?.offsetHeight || 64;
  /** The name and value under a reel once it stands still. */
  const landLabel = (s: number, d: Drop, cid: string, jp: boolean) => {
    const el = room.querySelector<HTMLElement>(`[data-label="${s}"]`);
    if (el) el.innerHTML = `<b style="color:${rarity(d.value, priceOf(cid))}">${esc(d.name)}</b><span class="num">${jp ? '<em>JACKPOT · kept</em> ' : ''}${frags(d.value, 0)}</span>`;
  };
  const dropRow = (d: Drop, cid: string) => `<li style="--rc:${rarity(d.value, priceOf(cid))}" title="${esc(d.name)}"><span class="di-art">${itemArt(d.name)}</span><span class="di-name">${esc(d.name)}</span><span class="num">${frags(d.value, 0)}</span></li>`;
  const nameOf = (b: Battle, s: number) => { const p = b.players.find((x) => x.seat === s); return p ? seatName(p) : `Seat ${s + 1}`; };
  const finish = (b: Battle) => {
    const r = b.result!;
    const bonus = r.bonus;
    for (let s = 0; s < b.seats; s++) {
      const p = b.players.find((x) => x.seat === s);
      const won = r.winners.includes(s);
      room.querySelector(`.seat[data-seat="${s}"]`)?.classList.toggle('winner', won);
      room.querySelector(`.seat[data-seat="${s}"]`)?.classList.toggle('loser', !won && !(bonus && (p?.payout ?? 0) > 0));
      const parts = bonus ? [bonus.jackpotPaid[s] > 0 ? `jackpot ${frags(bonus.jackpotPaid[s], 0)}` : '', won ? 'spin 90 %' : 'scrap back'].filter(Boolean).join(' + ') : '';
      $(`[data-foot="${s}"]`, room).innerHTML = (p?.payout ?? 0) > 0 ? `<span class="pos num">+${frags(p?.payout ?? 0)}</span> Scrap${parts ? ` <small class="muted">${parts}</small>` : ''}` : '<span class="muted">0.00</span>';
    }
    const me = b.players.find((p) => p.you);
    const msg = $('#room-msg', room);
    if (bonus) {
      const w = r.winners[0];
      const under = bonus.points[w] < Math.max(...bonus.points) ? ' Underdog!' : '';
      msg.textContent = me ? (w === me.seat ? `You won the spin with ${pctTxt(bonus.shares[w])}: +${frags(me.payout)} Scrap.${under}` : `${nameOf(b, w)} won the spin (${pctTxt(bonus.shares[w])}). You get ${frags(me.payout)} Scrap back.`)
        : `${nameOf(b, w)} won the spin with ${pctTxt(bonus.shares[w])}.${under}`;
      msg.className = `status ${me ? (w === me.seat ? 'win' : 'lose') : ''}`;
      return;
    }
    msg.textContent = me ? (r.winners.includes(me.seat) ? `You won ${frags(me.payout)} Scrap.` : 'Not this time.') : `${r.winners.map((w) => nameOf(b, w)).join(' & ')} won.`;
    msg.className = `status ${me ? (r.winners.includes(me.seat) ? 'win' : 'lose') : ''}`;
  };

  /**
   * One slot reel: the strip races up with motion blur, slows down, runs a little past the drop and
   * settles back onto it, so the drop ends exactly on the payline.
   */
  const spinReel = async (track: HTMLElement, ms: number) => {
    const h = symH(track);
    const end = -(STOP * h) + (track.parentElement!.clientHeight - h) / 2;
    if (!ms) { track.style.transform = `translateY(${end}px)`; return; }
    const over = end - h * 0.22;
    const a = track.animate([
      { transform: 'translateY(0)', filter: 'blur(0)' },
      { filter: 'blur(2.5px)', offset: 0.1 },
      { filter: 'blur(2.5px)', offset: 0.5 },
      { filter: 'blur(0)', offset: 0.78 },
      { transform: `translateY(${over}px)`, offset: 0.9 },
      { transform: `translateY(${end}px)`, filter: 'blur(0)' },
    ], { duration: ms, easing: 'cubic-bezier(.1,.6,.15,1)', fill: 'forwards' });
    await a.finished.catch(() => null);
    track.style.transform = `translateY(${end}px)`;
    a.cancel();
  };

  /** Plays the rounds one by one: every seat's reel spins to its drop, then the totals move. */
  const play = async (b: Battle) => {
    if (playing || !b.result) return;
    playing = true;
    const fast = Boolean(($('#fast', room) as HTMLInputElement | null)?.checked);
    const spin = reducedMotion() ? 0 : fast ? 1100 : 3600;
    const r = b.result;
    const bonus = r.bonus;
    const totals = new Array(b.seats).fill(0);
    const points = new Array(b.seats).fill(0);
    $$('.seat', room).forEach((x) => x.classList.remove('winner', 'loser'));
    if (bonus) {
      const last = r.drops.length - 1;
      $$('[data-pow]', room).forEach((el, i) => { el.textContent = i === last ? '★×?' : '×?'; el.className = 'pow'; });
      paintChance(b, points);
      const sp = room.querySelector<HTMLElement>('#spin');
      if (sp) sp.hidden = true;
    }
    for (let s = 0; s < b.seats; s++) { $(`[data-drops="${s}"]`, room).innerHTML = ''; $(`[data-total="${s}"]`, room).textContent = '0'; $(`[data-foot="${s}"]`, room).innerHTML = ''; }
    $('#room-msg', room).textContent = '';
    for (let i = 0; i < r.drops.length && !stopped; i++) {
      const cid = b.params.caseIds[i];
      const k = caseById.get(cid);
      $$('.rnd', room).forEach((x) => { x.classList.toggle('cur', Number(x.dataset.round) === i); x.classList.toggle('done', Number(x.dataset.round) < i); });
      room.querySelector(`.rnd[data-round="${i}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
      if (bonus) await powerRoll(i, bonus.powers[i], i === r.drops.length - 1, fast);
      // every seat's reel: a strip of symbols drawn by their real chances, the drop at STOP; all start and stop together
      const tracks: HTMLElement[] = [];
      for (let s = 0; s < b.seats; s++) {
        const track = $(`[data-vtrack="${s}"]`, room);
        const filler = (): Drop => { if (!k) return r.drops[i][s]; let x = Math.random(); for (const it of k.items) { x -= it.chance; if (x < 0) return it; } return k.items[0]; };
        track.getAnimations().forEach((a) => a.cancel());
        track.innerHTML = Array.from({ length: STRIP }, (_, j) => symHtml(j === STOP ? r.drops[i][s] : filler(), cid)).join('');
        track.style.transform = 'translateY(0)';
        const lbl = room.querySelector<HTMLElement>(`[data-label="${s}"]`);
        if (lbl) lbl.innerHTML = '<span class="muted">spinning …</span>';
        room.querySelector(`[data-slot="${s}"]`)?.classList.add('spinning');
        tracks.push(track);
      }
      await Promise.all(tracks.map((track) => spinReel(track, spin)));
      for (let s = 0; s < b.seats; s++) {
        room.querySelector(`[data-slot="${s}"]`)?.classList.remove('spinning');
        tracks[s].children[STOP]?.classList.add('win');
        landLabel(s, r.drops[i][s], cid, Boolean(bonus?.jackpots[i][s]));
      }
      await sleep(fast ? 120 : 280);
      for (let s = 0; s < b.seats; s++) {
        totals[s] += r.drops[i][s].value;
        $(`[data-total="${s}"]`, room).textContent = frags(totals[s], 0);
        $(`[data-drops="${s}"]`, room).insertAdjacentHTML('beforeend', dropRow(r.drops[i][s], cid));
        if (bonus) points[s] += bonus.powers[i] * r.drops[i][s].value;
      }
      if (bonus) {
        paintChance(b, points);
        markJackpots(b, i + 1);
        const hits = bonus.jackpots[i].flatMap((h, s) => (h ? [s] : []));
        if (hits.length) banner(`JACKPOT · ${hits.map((s) => nameOf(b, s)).join(' & ')} keep${hits.length === 1 ? 's' : ''} ${r.drops[i][hits[0]].name}`, 'jp');
      }
      if (!fast) await sleep(bonus ? 600 : 350);
    }
    $$('.rnd', room).forEach((x) => { x.classList.remove('cur'); x.classList.add('done'); });
    if (bonus && !stopped) {
      banner(`Final spin · ${frags(bonus.rest, 0)} Scrap · slices = share of the points`, '');
      await showSpin(b, bonus, reducedMotion() ? 0 : fast ? 1400 : 4200);
      banner(`${nameOf(b, r.winners[0])} wins the spin`, 'win');
    }
    if (!stopped) finish(b);
    playing = false;
  };
  const banner = (t: string, cls: string) => {
    const el = room.querySelector<HTMLElement>('#banner');
    if (!el) return;
    el.textContent = t;
    el.className = `bonus-banner show ${cls}`;
  };
  /** Rolls the round's power multiplier on its strip chip before the reels spin. */
  const powerRoll = async (i: number, power: number, golden: boolean, fast: boolean) => {
    const el = room.querySelector<HTMLElement>(`[data-pow="${i}"]`);
    if (!reducedMotion() && el) {
      const steps = fast ? 4 : 10;
      for (let k = 0; k < steps && !stopped; k++) { el.textContent = `×${[1, 2, 3, 5][k % 4] * (golden ? 2 : 1)}`; el.className = 'pow rolling'; await sleep(fast ? 50 : 70); }
    }
    setPower(i, power);
    banner(golden ? `Golden round · ×${power} points` : power > 1 ? `Power round · ×${power} points` : `Round ${i + 1} · ×1`, golden ? 'gold' : power >= 3 ? 'hot' : '');
    if (!fast && !reducedMotion()) await sleep(power > 1 ? 650 : 250);
  };

  const load = async () => {
    const prev = g?.status;
    g = await api<Battle>('GET', `/pvp/game/${id}`);
    if (stopped) return;
    const seatsChanged = !room.querySelector('.seats') || room.querySelectorAll('.seat .who b').length !== g.players.length;
    if (seatsChanged && !playing) skeleton(g); // also drops the action buttons, so paintMeta redraws them
    paintMeta(g);
    if (g.status === 'settled' && !shownFinal && !playing) {
      shownFinal = true;
      if (prev && prev !== 'settled') { await play(g); await c.refresh(); } // we watched it lock: play it live
      else paintFinal(g);
    }
  };
  load().catch(() => { room.innerHTML = '<p class="status lose">This battle does not exist.</p><a class="btn ghost small" href="#/battle">← Lobby</a>'; });
  const t = setInterval(() => { if (!playing && g?.status !== 'settled' && g?.status !== 'cancelled') void load().catch(() => null); }, 1000);
  return () => { stopped = true; clearInterval(t); };
}
