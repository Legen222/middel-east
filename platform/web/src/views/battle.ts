import { type CaseInfo, api } from '../api';
import { icon } from '../icons';
import { crateArt, itemArt } from '../loot-art';
import type { View } from '../main';
import { $, $$, esc, frags, guard, reducedMotion, sleep } from '../ui';

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
const ITEM_H = 56;
const STOP = 24;
const rarity = (value: number, price: number) => (value >= price * 20 ? '#C9A45C' : value >= price * 5 ? '#E5534B' : value >= price * 2 ? '#4C8DF6' : value >= price ? '#3FB950' : '#6B747D');
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

export const battleView: View = {
  title: 'Case Battle',
  html: (c) => {
    const id = new URLSearchParams(location.hash.split('?')[1] ?? '').get('id');
    const cases = [...c.cfg.cases].sort((a, b) => a.price - b.price);
    return `
  <section class="card" style="gap:16px">
    <div class="game-head"><div><p class="eyebrow">PvP · Beacon randomness</p><h1 class="h-display">Case Battle</h1>
      <p>Everyone opens the same crates, round by round. Normal: the highest total takes the whole pool. Crazy: the lowest. Terminal: the best drop of the last round. 2v2: the team with the higher combined total wins and splits the pool. Bonus: power rounds, jackpot drops and a final spin. Every mode hands the whole pool back to the seats, so the house edge is the crates' 7 % in all of them. The result is fixed by a beacon round picked when the last seat fills.</p></div></div>
  </section>
  ${id ? '<section class="card battle-room" id="room"><p class="muted">Loading battle …</p></section>' : `
  <section class="card" style="gap:14px">
    <div class="sect-head"><div><p class="eyebrow">New battle</p><h2 class="h-sect">Pick the crates</h2></div><p class="num" id="rounds-txt">0 / ${MAX_ROUNDS} rounds</p></div>
    <div class="bpick" id="bpick">${cases.map((k) => `
      <div class="bcase" data-case="${k.id}"><span class="art">${crateArt(k.id, k.price)}</span><b>${esc(k.name)}</b><span class="num muted">${frags(k.price, 0)} Frags</span>
        <div class="stepper"><button type="button" class="btn ghost small" data-minus="${k.id}" aria-label="One ${esc(k.name)} less">−</button><span class="num" data-count="${k.id}">0</span><button type="button" class="btn ghost small" data-plus="${k.id}" aria-label="One ${esc(k.name)} more">+</button></div></div>`).join('')}</div>
    <div class="chips" id="order"></div>
    <div class="row" style="align-items:flex-end;gap:12px">
      <label class="field">Format<div class="seg" role="group" aria-label="Format">${FORMATS.map(([l], i) => `<button type="button" data-format="${i}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div></label>
      <label class="field">Rule<div class="seg" role="group" aria-label="Rule">${RULES.map(([k, l], i) => `<button type="button" data-rule="${k}" aria-pressed="${i === 0}" title="${RULES[i][2]}">${l}</button>`).join('')}</div></label>
      <div class="spacer"></div>
      <button class="btn" id="create" type="button" disabled>${icon('battle')} Create battle</button>
    </div>
    <div id="bonus-box" hidden><p class="eyebrow" style="margin-bottom:8px">Bonus mode · same 7 % house edge</p>${bonusInfo()}</div>
  </section>
  <section style="display:flex;flex-direction:column;gap:12px">
    <div class="sect-head"><div><p class="eyebrow">Lobby</p><h2 class="h-sect">Open and recent battles</h2></div></div>
    <div class="blist" id="blist"><p class="muted">Loading …</p></div>
  </section>`}`;
  },
  mount: (root, c) => {
    const id = new URLSearchParams(location.hash.split('?')[1] ?? '').get('id');
    const caseById = new Map(c.cfg.cases.map((k) => [k.id, k]));
    return id ? mountRoom(root, c, id, caseById) : mountLobby(root, c, caseById);
  },
};

/* ---------- lobby: create and list ---------- */
function mountLobby(root: HTMLElement, c: Parameters<NonNullable<View['mount']>>[1], caseById: Map<string, CaseInfo>) {
  const order: string[] = [];
  let fmt = 0;
  let rule: Rule = 'normal';
  const paintPick = () => {
    for (const [cid] of caseById) {
      const n = order.filter((x) => x === cid).length;
      const el = root.querySelector(`[data-count="${cid}"]`);
      if (el) el.textContent = String(n);
      root.querySelector(`.bcase[data-case="${cid}"]`)?.classList.toggle('on', n > 0);
    }
    $('#order', root).innerHTML = order.map((cid, i) => `<button type="button" class="chip" data-drop="${i}" title="Remove">${i + 1}. ${esc(caseById.get(cid)?.name ?? cid)} ✕</button>`).join('');
    $$<HTMLButtonElement>('[data-drop]', root).forEach((b) => b.addEventListener('click', () => { order.splice(Number(b.dataset.drop), 1); paintPick(); }));
    $('#rounds-txt', root).textContent = `${order.length} / ${MAX_ROUNDS} rounds`;
    const cost = order.reduce((s, cid) => s + (caseById.get(cid)?.price ?? 0), 0);
    const btn = $<HTMLButtonElement>('#create', root);
    btn.disabled = order.length === 0;
    btn.innerHTML = `${icon('battle')} ${order.length ? `Create ${FORMATS[fmt][0]} · ${frags(cost, 0)} Frags per seat` : 'Add at least one crate'}`;
    $$<HTMLButtonElement>('[data-rule]', root).forEach((b) => { b.disabled = FORMATS[fmt][2]; });
    $('#bonus-box', root).hidden = rule !== 'bonus' || FORMATS[fmt][2];
  };
  $$<HTMLButtonElement>('[data-plus]', root).forEach((b) => b.addEventListener('click', () => { if (order.length < MAX_ROUNDS) { order.push(b.dataset.plus!); paintPick(); } }));
  $$<HTMLButtonElement>('[data-minus]', root).forEach((b) => b.addEventListener('click', () => { const i = order.lastIndexOf(b.dataset.minus!); if (i >= 0) { order.splice(i, 1); paintPick(); } }));
  $$<HTMLButtonElement>('[data-format]', root).forEach((b) => b.addEventListener('click', () => { fmt = Number(b.dataset.format); $$('[data-format]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); paintPick(); }));
  $$<HTMLButtonElement>('[data-rule]', root).forEach((b) => b.addEventListener('click', () => { rule = b.dataset.rule as Rule; $$('[data-rule]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); paintPick(); }));
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
  const paint = () => {
    const box = $('#blist', root);
    box.innerHTML = games.length ? games.map((g) => {
      const filled = g.players.length;
      const pool = g.seatStake * g.seats;
      return `<article class="bcard ${g.status}">
        <div class="bcard-head"><b>${format(g)} · ${ruleName(g.params.mode)}${g.params.mode === 'bonus' ? ' <span class="bonus-tag">★</span>' : ''}</b><span class="chip ${g.status === 'settled' ? 'win' : ''}">${g.status === 'open' ? `${filled}/${g.seats} seats` : g.status === 'locked' ? 'drawing' : g.status}</span></div>
        <div class="bcard-cases">${g.params.caseIds.slice(0, 6).map((cid) => `<span title="${esc(caseById.get(cid)?.name ?? cid)}">${crateArt(cid, caseById.get(cid)?.price ?? 0)}</span>`).join('')}${g.params.caseIds.length > 6 ? `<em>+${g.params.caseIds.length - 6}</em>` : ''}</div>
        <div class="bcard-foot"><span class="num">${frags(g.seatStake, 0)} <small>per seat</small></span><span class="num muted">pool ${frags(pool, 0)}</span>
          <a class="btn ${g.status === 'open' && !g.players.some((p) => p.you) ? '' : 'ghost'} small" href="#/battle?id=${g.id}">${g.status === 'open' && !g.players.some((p) => p.you) ? 'Join' : 'Watch'}</a></div>
      </article>`;
    }).join('') : '<p class="muted">No battles yet. Create one and fill the seats with demo bots.</p>';
  };
  const load = async () => { games = await api<Battle[]>('GET', '/pvp/list/battle'); paint(); };
  void load();
  const t = setInterval(() => void load(), 2000);
  return () => clearInterval(t);
}

/* ---------- battle room ---------- */
function mountRoom(root: HTMLElement, c: Parameters<NonNullable<View['mount']>>[1], id: string, caseById: Map<string, CaseInfo>) {
  let g: Battle | null = null;
  let playing = false;
  let shownFinal = false;
  let stopped = false;
  const room = $('#room', root);
  const priceOf = (cid: string) => caseById.get(cid)?.price ?? 1;

  const skeleton = (b: Battle) => {
    const bonus = b.params.mode === 'bonus';
    const last = b.params.caseIds.length - 1;
    const seats = Array.from({ length: b.seats }, (_, s) => {
      const p = b.players.find((x) => x.seat === s);
      const teamCls = b.params.mode === 'team' ? `team-${team(s)}` : '';
      return `${b.params.mode === 'team' && s === 2 ? '<div class="vs" aria-hidden="true">VS</div>' : ''}<div class="seat ${teamCls}" data-seat="${s}">
        <div class="seat-head"><span class="who">${bonus ? `<i class="sw" style="background:${SEAT_COLORS[s]}"></i>` : ''}${p ? `${p.bot ? icon('wrench') : icon('user')}<b>${esc(seatName(p))}${p.you ? ' (you)' : ''}</b>` : '<span class="muted">Open seat</span>'}</span><span class="num total" data-total="${s}">0</span></div>
        ${bonus ? `<div class="chance" data-chance="${s}"><span><i style="width:${100 / b.seats}%;background:${SEAT_COLORS[s]}"></i></span><small class="num"><b data-pts="${s}">0</b> pts · <b data-pct="${s}">${pctTxt(1 / b.seats)}</b></small></div>` : ''}
        <div class="vreel"><div class="vtrack" data-vtrack="${s}"></div></div>
        <ol class="seat-drops" data-drops="${s}"></ol>
        <div class="seat-foot" data-foot="${s}"></div>
      </div>`;
    }).join('');
    const pool = b.seatStake * b.seats;
    room.innerHTML = `
      <div class="room-head">
        <div><p class="eyebrow">${format(b)} · ${ruleName(b.params.mode)} · ${b.params.caseIds.length} round${b.params.caseIds.length === 1 ? '' : 's'}</p><h2 class="h-sect" style="font-size:20px">Pool <span class="num">${frags(pool, 0)}</span> Frags · ${frags(b.seatStake, 0)} per seat</h2></div>
        <div class="row"><span class="chip" id="room-status"></span><a class="btn ghost small" href="#/battle">← Lobby</a></div>
      </div>
      ${bonus ? `<details class="bonus-legend"><summary>Bonus mode: power rounds · golden last round · jackpot drops · final spin · 10 % scrap back</summary>${bonusInfo()}</details>` : ''}
      <div class="round-strip" id="strip">${b.params.caseIds.map((cid, i) => `<span class="rnd ${bonus && i === last ? 'golden' : ''}" data-round="${i}">${bonus ? `<em class="pow" data-pow="${i}">${i === last ? '★×?' : '×?'}</em>` : ''}<span class="art">${crateArt(cid, priceOf(cid))}</span><small>${i + 1}. ${esc(caseById.get(cid)?.name ?? cid)}</small></span>`).join('')}</div>
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
    acts.innerHTML = b.status === 'open' ? `${!inGame ? `<button class="btn" type="button" data-act="join">Join · ${frags(b.seatStake, 0)} Frags</button>` : ''}
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
      $(`[data-vtrack="${s}"]`, room).innerHTML = itemHtml(r.drops[r.drops.length - 1][s], b.params.caseIds[r.drops.length - 1], Boolean(r.bonus?.jackpots[r.drops.length - 1][s]));
      const tr = $(`[data-vtrack="${s}"]`, room);
      tr.style.transform = `translateY(${(tr.parentElement!.clientHeight - ITEM_H) / 2}px)`;
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
    $('#spin-rest', room).textContent = `${frags(bonus.rest, 0)} Frags`;
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
  const itemHtml = (d: Drop, cid: string, jp = false) => `<div class="vitem ${jp ? 'jackpot' : ''}" style="--rc:${rarity(d.value, priceOf(cid))}">${itemArt(d.name)}<span class="vt"><b>${esc(d.name)}</b><span class="num">${jp ? 'JACKPOT · kept · ' : ''}${frags(d.value, 0)}</span></span></div>`;
  const dropRow = (d: Drop, cid: string) => `<li style="--rc:${rarity(d.value, priceOf(cid))}"><span>${esc(d.name)}</span><span class="num">${frags(d.value, 0)}</span></li>`;
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
      $(`[data-foot="${s}"]`, room).innerHTML = (p?.payout ?? 0) > 0 ? `<span class="pos num">+${frags(p?.payout ?? 0)}</span> Frags${parts ? ` <small class="muted">${parts}</small>` : ''}` : '<span class="muted">0.00</span>';
    }
    const me = b.players.find((p) => p.you);
    const msg = $('#room-msg', room);
    if (bonus) {
      const w = r.winners[0];
      const under = bonus.points[w] < Math.max(...bonus.points) ? ' Underdog!' : '';
      msg.textContent = me ? (w === me.seat ? `You won the spin with ${pctTxt(bonus.shares[w])}: +${frags(me.payout)} Frags.${under}` : `${nameOf(b, w)} won the spin (${pctTxt(bonus.shares[w])}). You get ${frags(me.payout)} Frags back.`)
        : `${nameOf(b, w)} won the spin with ${pctTxt(bonus.shares[w])}.${under}`;
      msg.className = `status ${me ? (w === me.seat ? 'win' : 'lose') : ''}`;
      return;
    }
    msg.textContent = me ? (r.winners.includes(me.seat) ? `You won ${frags(me.payout)} Frags.` : 'Not this time.') : `${r.winners.map((w) => nameOf(b, w)).join(' & ')} won.`;
    msg.className = `status ${me ? (r.winners.includes(me.seat) ? 'win' : 'lose') : ''}`;
  };

  /** Plays the rounds one by one: every seat's reel spins to its drop, then the totals move. */
  const play = async (b: Battle) => {
    if (playing || !b.result) return;
    playing = true;
    const fast = Boolean(($('#fast', room) as HTMLInputElement | null)?.checked);
    const spin = reducedMotion() ? 0 : fast ? 700 : 2300;
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
      for (let s = 0; s < b.seats; s++) {
        const track = $(`[data-vtrack="${s}"]`, room);
        const filler = (): Drop => { if (!k) return r.drops[i][s]; let x = Math.random(); for (const it of k.items) { x -= it.chance; if (x < 0) return it; } return k.items[0]; };
        track.innerHTML = Array.from({ length: STOP + 4 }, (_, j) => (j === STOP ? itemHtml(r.drops[i][s], cid, Boolean(bonus?.jackpots[i][s])) : itemHtml(filler(), cid))).join('');
        track.style.transition = 'none';
        track.style.transform = 'translateY(0)';
      }
      void room.offsetWidth;
      for (let s = 0; s < b.seats; s++) {
        const track = $(`[data-vtrack="${s}"]`, room);
        track.style.transition = `transform ${spin + s * 90}ms cubic-bezier(.15,.8,.25,1)`;
        track.style.transform = `translateY(${-(STOP * ITEM_H) + (track.parentElement!.clientHeight - ITEM_H) / 2}px)`; // drop centred, whatever the reel height
      }
      await sleep(spin + (b.seats - 1) * 90 + 120);
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
      banner(`Final spin · ${frags(bonus.rest, 0)} Frags · slices = share of the points`, '');
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
