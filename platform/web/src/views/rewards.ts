import { api } from '../api';
import { icon } from '../icons';
import type { View } from '../main';
import { $, esc, frags, guard, pct, pctShort, sleep, toast } from '../ui';

interface Rewards {
  xp: number; level: number; levelXp: number; nextLevelXp: number; rakebackRate: number; rakebackAvailable: number; rakebackBands: [number, number][];
  daily: { nextAt: number; items: { name: string; value: number; chance: number }[] };
  rain: { open: boolean; closesAt?: number; nextAt: number; pot: number; joiners: number; joined: boolean };
  promoEligible: boolean;
  crew: { code: string | null; joinedCode: string | null; members: number; rate: number; ngr: number; available: number };
}

const until = (t: number) => {
  const s = Math.max(0, Math.round((t - Date.now()) / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor(s / 60) % 60} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
};

export const rewardsView: View = {
  title: 'Rewards',
  html: () => `
  <section class="card">
    <p class="eyebrow">Workbench tier</p>
    <h1 class="h-display">Rewards</h1>
    <p class="muted" style="max-width:66ch">Everything here is based on <b>expected loss</b> (stake × the game's house edge), not on volume. A lower edge earns less XP, and no strategy earns more in rewards than it costs on average.</p>
    <div id="level"></div>
  </section>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:16px">
    <section class="card" id="rakeback"></section>
    <section class="card" id="daily"></section>
    <section class="card" id="rain"></section>
    <section class="card" id="crew"></section>
  </div>`,
  mount: (root, c) => {
    let r: Rewards | null = null;
    let lastDaily = '';
    const load = async () => { r = await api<Rewards>('GET', '/rewards'); paint(); };
    const paint = () => {
      if (!r) return;
      const span = r.nextLevelXp - r.levelXp;
      const k = span ? (r.xp - r.levelXp) / span : 1;
      $('#level', root).innerHTML = `
        <div class="row" style="justify-content:space-between"><b class="h-sect">Level ${r.level}</b><span class="num muted">${r.xp.toLocaleString('en-US')} / ${r.nextLevelXp.toLocaleString('en-US')} XP</span></div>
        <div style="height:14px;border:1px solid var(--line);border-radius:2px;background:var(--bg);overflow:hidden"><div style="height:100%;width:${Math.round(k * 100)}%;background:repeating-linear-gradient(-45deg,var(--hazard) 0 10px,#c79612 10px 20px)"></div></div>
        <p class="muted" style="font-size:13px">1 XP = 1 Frag of expected loss. Level L needs 100 · (L − 1)^1.6 XP.</p>`;

      $('#rakeback', root).innerHTML = `
        <h2 class="h-sect">${icon('gauge')} Rakeback</h2>
        <p>Your rate: <b class="num">${pct(r.rakebackRate, 0)}</b> of expected loss.</p>
        <p class="big-mult num" style="font-size:36px">${frags(r.rakebackAvailable)}</p>
        <button class="btn" id="rb" type="button" ${r.rakebackAvailable < 1 ? 'disabled' : ''}>Claim</button>
        <p class="muted" style="font-size:12px">${r.rakebackBands.map(([l, x]) => `from lvl ${l}: ${pct(x, 0)}`).join(' · ')}</p>`;

      const dailyReady = r.level >= 2 && Date.now() >= r.daily.nextAt && r.promoEligible;
      $('#daily', root).innerHTML = `
        <h2 class="h-sect">${icon('crate')} Scrap Crate</h2>
        <p class="muted">Free once every 24 hours from level 2. Rolled from your own seed, so it is verifiable.</p>
        <div id="daily-out" class="big-mult" style="font-size:28px;min-height:1.2em">${esc(lastDaily)}</div>
        <button class="btn" id="dl" type="button" ${dailyReady ? '' : 'disabled'}>${r.level < 2 ? 'From level 2' : !r.promoEligible ? 'Break active' : Date.now() < r.daily.nextAt ? `Again in ${until(r.daily.nextAt)}` : 'Open'}</button>
        <details><summary class="muted" style="cursor:pointer;font-size:13px">Contents</summary><table style="margin-top:6px"><tbody>${r.daily.items.map((i) => `<tr><td>${esc(i.name)}</td><td class="r num">${frags(i.value, 0)}</td><td class="r num">${pctShort(i.chance)}</td></tr>`).join('')}</tbody></table></details>`;

      const rain = r.rain;
      $('#rain', root).innerHTML = `
        <h2 class="h-sect">${icon('rain')} Oil Rain</h2>
        <p class="muted">Every 30 minutes, open for 2 minutes: pot = 1 % of the period's expected loss (demo minimum 500 Frags), split equally. Requires level 5 and 100 Frags wagered in 24 h.</p>
        <p><b class="num">${frags(rain.pot, 0)}</b> Frags · ${rain.joiners} joined</p>
        <button class="btn" id="rn" type="button" ${rain.open && !rain.joined && r.promoEligible ? '' : 'disabled'}>${rain.joined ? 'You are in' : rain.open ? `Join · ${until(rain.closesAt!)} left` : `Next rain in ${until(rain.nextAt)}`}</button>`;

      const crew = r.crew;
      $('#crew', root).innerHTML = `
        <h2 class="h-sect">${icon('user')} Crew code</h2>
        ${crew.code ? `<p>Your code: <b class="num" style="color:var(--hazard)">${esc(crew.code)}</b> · ${crew.members} members · share ${pct(crew.rate, 1)} of NGR</p>
          <p class="muted" style="font-size:13px">NGR since last payout: <span class="num">${frags(crew.ngr)}</span> Frags (your crew's wagers − wins − bonuses)</p>
          <button class="btn" id="cc" type="button" ${crew.available < 1 ? 'disabled' : ''}>Claim · ${frags(crew.available)}</button>`
        : `<div class="row"><input id="code" class="num" maxlength="16" placeholder="YOUR OWN CODE" style="flex:1;min-width:140px;background:var(--bg);border:1px solid var(--line);border-radius:3px;padding:9px;color:var(--text)"><button class="btn ghost" id="mk" type="button">Create</button></div>`}
        ${crew.joinedCode ? `<p class="muted" style="font-size:13px">You are in crew <b>${esc(crew.joinedCode)}</b>.</p>`
        : `<div class="row"><input id="redeem" class="num" maxlength="16" placeholder="A friend's code" style="flex:1;min-width:140px;background:var(--bg);border:1px solid var(--line);border-radius:3px;padding:9px;color:var(--text)"><button class="btn ghost" id="rd" type="button">Redeem</button></div>
           <p class="muted" style="font-size:12px">Only within 24 hours of signing up.</p>`}`;
      bind();
    };
    const bind = () => {
      $('#rb', root)?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => { const x = await api<{ amount: number }>('POST', '/rewards/rakeback'); toast(`+${frags(x.amount)} Frags Rakeback`); await c.refresh(); await load(); }));
      $('#dl', root)?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
        const x = await api<{ item: { name: string; value: number }; fairness: { nonce: number } }>('POST', '/rewards/daily');
        const out = $('#daily-out', root);
        for (const it of r!.daily.items.slice(0, 4)) { out.textContent = it.name; await sleep(120); }
        lastDaily = `${x.item.name} · ${frags(x.item.value, 0)}`;
        out.textContent = lastDaily;
        await sleep(900); await c.refresh(); await load();
      }));
      $('#rn', root)?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => { await api('POST', '/rewards/rain'); toast('You joined the Oil Rain.'); await load(); }));
      $('#cc', root)?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => { const x = await api<{ amount: number }>('POST', '/crew/claim'); toast(`+${frags(x.amount)} Frags crew share`); await c.refresh(); await load(); }));
      $('#mk', root)?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => { await api('POST', '/crew/code', { code: ($('#code', root) as HTMLInputElement).value }); await load(); }));
      $('#rd', root)?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => { await api('POST', '/crew/redeem', { code: ($('#redeem', root) as HTMLInputElement).value }); toast('Crew code redeemed.'); await load(); }));
    };
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  },
};
