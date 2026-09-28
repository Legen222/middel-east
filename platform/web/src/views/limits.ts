import { api } from '../api';
import type { View } from '../main';
import { $, $$, esc, frags, guard, modal, readNum, toast } from '../ui';

interface Limit { kind: string; period: string; amount: number | null; pending: { amount: number | null; effectiveAt: number } | null; used: number }
interface RgState { limits: Limit[]; block: { kind: string; until: number | null } | null; session: { elapsedMs: number; wagered: number; net: number; realityCheckMinutes: number } }

const KINDS: [string, string][] = [['loss', 'Verlustlimit'], ['wager', 'Einsatzlimit'], ['deposit', 'Einzahlungslimit']];
const PERIODS: [string, string][] = [['day', 'Tag'], ['week', 'Woche'], ['month', 'Monat']];
const when = (t: number) => new Date(t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

export const limitsView: View = {
  title: 'Limits & Pausen',
  html: (c) => `
  <section class="card">
    <p class="eyebrow">Responsible Gambling</p>
    <h1 class="h-display">Limits &amp; Pausen</h1>
    <p class="muted" style="max-width:62ch">Ein neues oder niedrigeres Limit gilt sofort. Ein höheres Limit oder das Entfernen eines Limits gilt erst nach ${c.cfg.responsibleGambling.limitIncreaseDelayHours} Stunden. Laufende Runden zählen als verloren, bis sie abgerechnet sind.</p>
    <div id="block"></div>
  </section>
  <section class="card">
    <h2 class="h-sect">Limits (Frags)</h2>
    <div class="tablewrap"><table><thead><tr><th>Art</th>${PERIODS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody id="limits"></tbody></table></div>
  </section>
  <section class="card">
    <h2 class="h-sect">Diese Sitzung</h2>
    <p id="session" class="num"></p>
    <label class="field" style="max-width:280px">Reality-Check alle
      <select id="rc">${c.cfg.responsibleGambling.realityCheckOptions.map((m) => `<option value="${m}">${m} Minuten</option>`).join('')}</select></label>
  </section>
  <section class="card" style="border-color:var(--line)">
    <h2 class="h-sect">Pause einlegen</h2>
    <p class="muted">Während einer Pause kannst du nicht spielen und bekommst keine Aktionen. Eine Pause lässt sich nicht verkürzen.</p>
    <div class="row">${[[24, '24 Stunden'], [72, '3 Tage'], [168, '1 Woche'], [1008, '6 Wochen']].map(([h, l]) => `<button type="button" class="btn ghost" data-cool="${h}">${l}</button>`).join('')}</div>
  </section>
  <section class="card" style="border-color:var(--lose)">
    <h2 class="h-sect">Selbstausschluss</h2>
    <p class="muted">Sperrt dein Konto für 6, 12 oder 60 Monate oder dauerhaft. Du wirst sofort abgemeldet.</p>
    <div class="row">${[[6, '6 Monate'], [12, '12 Monate'], [60, '5 Jahre'], [0, 'Dauerhaft']].map(([m, l]) => `<button type="button" class="btn ghost" data-excl="${m}">${l}</button>`).join('')}</div>
    <p class="muted" style="font-size:13px">Hilfe: <a href="https://www.begambleaware.org" target="_blank" rel="noopener">BeGambleAware</a> · <a href="https://www.check-dein-spiel.de" target="_blank" rel="noopener">check-dein-spiel.de</a> · Telefon (DE, kostenlos): 0800 1 37 27 00</p>
  </section>`,
  mount: (root, c) => {
    const load = async () => {
      const s = await api<RgState>('GET', '/rg');
      $('#block', root).innerHTML = s.block ? `<p class="status lose">Aktiv: ${s.block.kind === 'cooldown' ? 'Pause' : 'Selbstausschluss'} ${s.block.until ? `bis ${when(s.block.until)}` : '(dauerhaft)'}</p>` : '';
      $('#limits', root).innerHTML = KINDS.map(([k, label]) => `<tr><td>${label}</td>${PERIODS.map(([p]) => {
        const l = s.limits.find((x) => x.kind === k && x.period === p);
        const pend = l?.pending ? `<br><span class="muted" style="font-size:12px">ab ${when(l.pending.effectiveAt)}: ${l.pending.amount === null ? 'kein Limit' : frags(l.pending.amount, 0)}</span>` : '';
        const used = l?.amount != null ? `<br><span class="muted num" style="font-size:12px">genutzt ${frags(l.used, 0)}</span>` : '';
        return `<td><div class="row" style="flex-wrap:nowrap"><input class="num" style="width:110px;background:var(--bg);border:1px solid var(--line);border-radius:3px;padding:7px;color:var(--text)" aria-label="${label} pro ${p}" data-k="${k}" data-p="${p}" value="${l?.amount ?? ''}" placeholder="kein"><button type="button" class="btn ghost small" data-save="${k}:${p}">OK</button></div>${used}${pend}</td>`;
      }).join('')}</tr>`).join('');
      $$<HTMLButtonElement>('[data-save]', root).forEach((b) => b.addEventListener('click', () => guard(b, async () => {
        const [k, p] = b.dataset.save!.split(':');
        const raw = ($(`input[data-k="${k}"][data-p="${p}"]`, root) as HTMLInputElement).value.trim();
        const r = await api<{ applied: string; effectiveAt: number }>('PUT', '/rg/limits', { kind: k, period: p, amount: raw === '' ? null : readNum(raw) });
        toast(r.applied === 'now' ? 'Limit gilt ab sofort.' : `Änderung gilt ab ${when(r.effectiveAt)}.`);
        await load();
      })));
      $('#session', root).textContent = `${Math.round(s.session.elapsedMs / 60000)} min · Einsatz ${frags(s.session.wagered)} · Netto ${s.session.net > 0 ? '+' : ''}${frags(s.session.net)} Frags`;
      ($('#rc', root) as HTMLSelectElement).value = String(s.session.realityCheckMinutes);
    };
    load().catch(() => null);
    $('#rc', root).addEventListener('change', (e) => guard(null, async () => {
      await api('PUT', '/rg/reality-check', { minutes: Number((e.target as HTMLSelectElement).value) });
      await c.refresh(); toast('Reality-Check gespeichert.');
    }));
    const confirmThen = (title: string, text: string, action: () => Promise<void>) => {
      const m = modal(`<h2 class="h-sect">${esc(title)}</h2><p>${esc(text)}</p><div class="row"><button class="btn" data-ok type="button">Bestätigen</button><button class="btn ghost" data-no type="button">Abbrechen</button></div>`);
      m.root.querySelector('[data-no]')!.addEventListener('click', m.close);
      m.root.querySelector('[data-ok]')!.addEventListener('click', async (e) => { await guard(e.currentTarget as HTMLButtonElement, action); m.close(); });
    };
    $$<HTMLButtonElement>('[data-cool]', root).forEach((b) => b.addEventListener('click', () => confirmThen('Pause einlegen', `${b.textContent} kein Spiel. Das lässt sich nicht rückgängig machen.`, async () => {
      await api('POST', '/rg/cooldown', { hours: Number(b.dataset.cool) }); toast('Pause aktiv.'); await c.refresh(); await load();
    })));
    $$<HTMLButtonElement>('[data-excl]', root).forEach((b) => b.addEventListener('click', () => confirmThen('Selbstausschluss', `${b.textContent}: Dein Konto wird gesperrt und du wirst abgemeldet.`, async () => {
      const m = Number(b.dataset.excl);
      await api('POST', '/rg/exclusion', { months: m === 0 ? null : m });
      location.hash = ''; location.reload();
    })));
  },
};
