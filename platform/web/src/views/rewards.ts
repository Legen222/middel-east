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
  title: 'Belohnungen',
  html: () => `
  <section class="card">
    <p class="eyebrow">Werkbank-Stufe</p>
    <h1 class="h-display">Belohnungen</h1>
    <p class="muted" style="max-width:66ch">Alles hier zählt nach <b>erwartetem Verlust</b> (Einsatz × House Edge des Spiels), nicht nach Umsatz. Niedrige Edge bringt also weniger XP, und keine Strategie bringt mehr Belohnung, als sie im Schnitt kostet.</p>
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
        <div class="row" style="justify-content:space-between"><b class="h-sect">Level ${r.level}</b><span class="num muted">${r.xp.toLocaleString('de-DE')} / ${r.nextLevelXp.toLocaleString('de-DE')} XP</span></div>
        <div style="height:14px;border:1px solid var(--line);border-radius:2px;background:var(--bg);overflow:hidden"><div style="height:100%;width:${Math.round(k * 100)}%;background:repeating-linear-gradient(-45deg,var(--hazard) 0 10px,#c79612 10px 20px)"></div></div>
        <p class="muted" style="font-size:13px">1 XP = 1 Frag erwarteter Verlust. Level L braucht 100 · (L − 1)^1,6 XP.</p>`;

      $('#rakeback', root).innerHTML = `
        <h2 class="h-sect">${icon('gauge')} Rakeback</h2>
        <p>Dein Satz: <b class="num">${pct(r.rakebackRate, 0)}</b> des erwarteten Verlusts.</p>
        <p class="big-mult num" style="font-size:36px">${frags(r.rakebackAvailable)}</p>
        <button class="btn" id="rb" type="button" ${r.rakebackAvailable < 1 ? 'disabled' : ''}>Abholen</button>
        <p class="muted" style="font-size:12px">${r.rakebackBands.map(([l, x]) => `ab Lvl ${l}: ${pct(x, 0)}`).join(' · ')}</p>`;

      const dailyReady = r.level >= 2 && Date.now() >= r.daily.nextAt && r.promoEligible;
      $('#daily', root).innerHTML = `
        <h2 class="h-sect">${icon('crate')} Schrottkiste</h2>
        <p class="muted">Einmal pro 24 Stunden gratis, ab Level 2. Gezogen aus deinem eigenen Seed, also nachprüfbar.</p>
        <div id="daily-out" class="big-mult" style="font-size:28px;min-height:1.2em">${esc(lastDaily)}</div>
        <button class="btn" id="dl" type="button" ${dailyReady ? '' : 'disabled'}>${r.level < 2 ? 'Ab Level 2' : !r.promoEligible ? 'Pause aktiv' : Date.now() < r.daily.nextAt ? `Wieder in ${until(r.daily.nextAt)}` : 'Öffnen'}</button>
        <details><summary class="muted" style="cursor:pointer;font-size:13px">Inhalt</summary><table style="margin-top:6px"><tbody>${r.daily.items.map((i) => `<tr><td>${esc(i.name)}</td><td class="r num">${frags(i.value, 0)}</td><td class="r num">${pctShort(i.chance)}</td></tr>`).join('')}</tbody></table></details>`;

      const rain = r.rain;
      $('#rain', root).innerHTML = `
        <h2 class="h-sect">${icon('rain')} Ölregen</h2>
        <p class="muted">Alle 30 Minuten 2 Minuten lang: Topf = 1 % des erwarteten Verlusts der Periode (Demo mindestens 500 Frags), gleich verteilt. Ab Level 5 und 100 Frags Einsatz in 24 h.</p>
        <p><b class="num">${frags(rain.pot, 0)}</b> Frags · ${rain.joiners} dabei</p>
        <button class="btn" id="rn" type="button" ${rain.open && !rain.joined && r.promoEligible ? '' : 'disabled'}>${rain.joined ? 'Du bist dabei' : rain.open ? `Mitmachen · noch ${until(rain.closesAt!)}` : `Nächster Regen in ${until(rain.nextAt)}`}</button>`;

      const crew = r.crew;
      $('#crew', root).innerHTML = `
        <h2 class="h-sect">${icon('user')} Crew-Code</h2>
        ${crew.code ? `<p>Dein Code: <b class="num" style="color:var(--hazard)">${esc(crew.code)}</b> · ${crew.members} Mitglieder · Anteil ${pct(crew.rate, 1)} vom NGR</p>
          <p class="muted" style="font-size:13px">NGR seit letzter Auszahlung: <span class="num">${frags(crew.ngr)}</span> Frags (Einsatz − Gewinne − Boni deiner Crew)</p>
          <button class="btn" id="cc" type="button" ${crew.available < 1 ? 'disabled' : ''}>Abholen · ${frags(crew.available)}</button>`
        : `<div class="row"><input id="code" class="num" maxlength="16" placeholder="EIGENER CODE" style="flex:1;min-width:140px;background:var(--bg);border:1px solid var(--line);border-radius:3px;padding:9px;color:var(--text)"><button class="btn ghost" id="mk" type="button">Anlegen</button></div>`}
        ${crew.joinedCode ? `<p class="muted" style="font-size:13px">Du bist in der Crew <b>${esc(crew.joinedCode)}</b>.</p>`
        : `<div class="row"><input id="redeem" class="num" maxlength="16" placeholder="Code eines Freundes" style="flex:1;min-width:140px;background:var(--bg);border:1px solid var(--line);border-radius:3px;padding:9px;color:var(--text)"><button class="btn ghost" id="rd" type="button">Eintragen</button></div>
           <p class="muted" style="font-size:12px">Nur in den ersten 24 Stunden nach der Registrierung.</p>`}`;
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
      $('#rn', root)?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => { await api('POST', '/rewards/rain'); toast('Du bist beim Ölregen dabei.'); await load(); }));
      $('#cc', root)?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => { const x = await api<{ amount: number }>('POST', '/crew/claim'); toast(`+${frags(x.amount)} Frags Crew-Anteil`); await c.refresh(); await load(); }));
      $('#mk', root)?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => { await api('POST', '/crew/code', { code: ($('#code', root) as HTMLInputElement).value }); await load(); }));
      $('#rd', root)?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => { await api('POST', '/crew/redeem', { code: ($('#redeem', root) as HTMLInputElement).value }); toast('Crew-Code eingetragen.'); await load(); }));
    };
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  },
};
