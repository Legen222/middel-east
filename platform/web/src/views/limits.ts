import { api } from '../api';
import type { View } from '../main';
import { $, $$, esc, frags, guard, modal, readNum, toast } from '../ui';

interface Limit { kind: string; period: string; amount: number | null; pending: { amount: number | null; effectiveAt: number } | null; used: number }
interface RgState { limits: Limit[]; block: { kind: string; until: number | null } | null; session: { elapsedMs: number; wagered: number; net: number; realityCheckMinutes: number } }

const KINDS: [string, string][] = [['loss', 'Loss limit'], ['wager', 'Wager limit'], ['deposit', 'Deposit limit']];
const PERIODS: [string, string][] = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];
const when = (t: number) => new Date(t).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

export const limitsView: View = {
  title: 'Limits & Breaks',
  html: (c) => `
  <section class="card">
    <p class="eyebrow">Responsible Gambling</p>
    <h1 class="h-display">Limits &amp; Breaks</h1>
    <p class="muted" style="max-width:62ch">A new or lower limit applies immediately. A higher limit, or removing a limit, only applies after ${c.cfg.responsibleGambling.limitIncreaseDelayHours} hours. Open rounds count as lost until they are settled.</p>
    <div id="block"></div>
  </section>
  <section class="card">
    <h2 class="h-sect">Limits (Frags)</h2>
    <div class="tablewrap"><table><thead><tr><th>Type</th>${PERIODS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody id="limits"></tbody></table></div>
  </section>
  <section class="card">
    <h2 class="h-sect">This session</h2>
    <p id="session" class="num"></p>
    <label class="field" style="max-width:280px">Reality check every
      <select id="rc">${c.cfg.responsibleGambling.realityCheckOptions.map((m) => `<option value="${m}">${m} minutes</option>`).join('')}</select></label>
  </section>
  <section class="card" style="border-color:var(--line)">
    <h2 class="h-sect">Take a break</h2>
    <p class="muted">During a break you cannot play and receive no promotions. A break cannot be shortened.</p>
    <div class="row">${[[24, '24 hours'], [72, '3 days'], [168, '1 week'], [1008, '6 weeks']].map(([h, l]) => `<button type="button" class="btn ghost" data-cool="${h}">${l}</button>`).join('')}</div>
  </section>
  <section class="card" style="border-color:var(--lose)">
    <h2 class="h-sect">Self-exclusion</h2>
    <p class="muted">Locks your account for 6, 12 or 60 months, or permanently. You are signed out immediately.</p>
    <div class="row">${[[6, '6 months'], [12, '12 months'], [60, '5 years'], [0, 'Permanent']].map(([m, l]) => `<button type="button" class="btn ghost" data-excl="${m}">${l}</button>`).join('')}</div>
    <p class="muted" style="font-size:13px">Help: <a href="https://www.begambleaware.org" target="_blank" rel="noopener">BeGambleAware</a> · <a href="https://www.check-dein-spiel.de" target="_blank" rel="noopener">check-dein-spiel.de</a> · National Gambling Helpline (UK, free): 0808 8020 133</p>
  </section>`,
  mount: (root, c) => {
    const load = async () => {
      const s = await api<RgState>('GET', '/rg');
      $('#block', root).innerHTML = s.block ? `<p class="status lose">Active: ${s.block.kind === 'cooldown' ? 'Break' : 'Self-exclusion'} ${s.block.until ? `until ${when(s.block.until)}` : '(permanent)'}</p>` : '';
      $('#limits', root).innerHTML = KINDS.map(([k, label]) => `<tr><td>${label}</td>${PERIODS.map(([p]) => {
        const l = s.limits.find((x) => x.kind === k && x.period === p);
        const pend = l?.pending ? `<br><span class="muted" style="font-size:12px">from ${when(l.pending.effectiveAt)}: ${l.pending.amount === null ? 'no limit' : frags(l.pending.amount, 0)}</span>` : '';
        const used = l?.amount != null ? `<br><span class="muted num" style="font-size:12px">used ${frags(l.used, 0)}</span>` : '';
        return `<td><div class="row" style="flex-wrap:nowrap"><input class="num" style="width:110px;background:var(--bg);border:1px solid var(--line);border-radius:3px;padding:7px;color:var(--text)" aria-label="${label} per ${p}" data-k="${k}" data-p="${p}" value="${l?.amount ?? ''}" placeholder="none"><button type="button" class="btn ghost small" data-save="${k}:${p}">OK</button></div>${used}${pend}</td>`;
      }).join('')}</tr>`).join('');
      $$<HTMLButtonElement>('[data-save]', root).forEach((b) => b.addEventListener('click', () => guard(b, async () => {
        const [k, p] = b.dataset.save!.split(':');
        const raw = ($(`input[data-k="${k}"][data-p="${p}"]`, root) as HTMLInputElement).value.trim();
        const r = await api<{ applied: string; effectiveAt: number }>('PUT', '/rg/limits', { kind: k, period: p, amount: raw === '' ? null : readNum(raw) });
        toast(r.applied === 'now' ? 'Limit applies now.' : `Change applies from ${when(r.effectiveAt)}.`);
        await load();
      })));
      $('#session', root).textContent = `${Math.round(s.session.elapsedMs / 60000)} min · wagered ${frags(s.session.wagered)} · net ${s.session.net > 0 ? '+' : ''}${frags(s.session.net)} Frags`;
      ($('#rc', root) as HTMLSelectElement).value = String(s.session.realityCheckMinutes);
    };
    load().catch(() => null);
    $('#rc', root).addEventListener('change', (e) => guard(null, async () => {
      await api('PUT', '/rg/reality-check', { minutes: Number((e.target as HTMLSelectElement).value) });
      await c.refresh(); toast('Reality check saved.');
    }));
    const confirmThen = (title: string, text: string, action: () => Promise<void>) => {
      const m = modal(`<h2 class="h-sect">${esc(title)}</h2><p>${esc(text)}</p><div class="row"><button class="btn" data-ok type="button">Confirm</button><button class="btn ghost" data-no type="button">Cancel</button></div>`);
      m.root.querySelector('[data-no]')!.addEventListener('click', m.close);
      m.root.querySelector('[data-ok]')!.addEventListener('click', async (e) => { await guard(e.currentTarget as HTMLButtonElement, action); m.close(); });
    };
    $$<HTMLButtonElement>('[data-cool]', root).forEach((b) => b.addEventListener('click', () => confirmThen('Take a break', `No play for ${b.textContent}. This cannot be undone.`, async () => {
      await api('POST', '/rg/cooldown', { hours: Number(b.dataset.cool) }); toast('Break active.'); await c.refresh(); await load();
    })));
    $$<HTMLButtonElement>('[data-excl]', root).forEach((b) => b.addEventListener('click', () => confirmThen('Self-exclusion', `${b.textContent}: your account will be locked and you will be signed out.`, async () => {
      const m = Number(b.dataset.excl);
      await api('POST', '/rg/exclusion', { months: m === 0 ? null : m });
      location.hash = ''; location.reload();
    })));
  },
};
