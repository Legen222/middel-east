/**
 * Live chat panel with the Oil Rain box. Used as the right-hand aside on wide screens and as the
 * #/chat view everywhere else. Reloads GET /chat when the server pushes a chat event over SSE (/events),
 * with a slow poll as fallback.
 *   Players: the rules (live values from the server) open before the first message; any message can be reported.
 *   Moderators and admins: delete and mute on every message, and the queue of reported messages.
 */
import { api } from './api';
import { icon } from './icons';
import type { Ctx, View } from './main';
import { $, esc, guard, modal, scrap, toast } from './ui';

interface Msg { id: number; userId: string | null; name: string; level: number | null; role: string | null; kind: 'user' | 'system' | 'win' | 'rain'; body: string; createdAt: number; you: boolean; avatar?: string | null }

/** Steam avatar, or the first letter on a colour picked from the name (stable per player). */
const AV_COLORS = ['#3DDCFF', '#9B7BFF', '#D9B467', '#3EE89A', '#FF8FA3', '#7FB2FF'];
function avatarOf(m: Msg): string {
  if (m.avatar) return `<span class="av"><img src="${esc(m.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  let h = 0;
  for (const ch of m.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span class="av" style="--av:${AV_COLORS[h % AV_COLORS.length]}">${esc([...m.name][0]?.toUpperCase() ?? '?')}</span>`;
}
/** Name colour climbs with the level. */
const tier = (lv: number) => (lv >= 50 ? 't4' : lv >= 20 ? 't3' : lv >= 10 ? 't2' : lv >= 5 ? 't1' : '');
interface Rules { minLevel: number; slowModeSeconds: number; maxLength: number; reportHideAt: number }
interface ChatState {
  messages: Msg[];
  rain: { open: boolean; closesAt?: number; nextAt: number; pot: number; joiners: number; joined: boolean };
  mute: { until: number | null; reason: string | null } | null;
  role: string | null;
  rules: Rules;
  openReports?: number;
}
interface Report { messageId: number; reports: number; lastAt: number; author: { id: string; name: string }; body: string; state: 'visible' | 'hidden' | 'deleted'; reasons: Record<string, number> }

/** Bump when the rules change so everyone reads them again before writing. */
const RULES_VERSION = '1';
const RULES_KEY = 'scrapline.chatRules';
let rulesSeen = false; // when storage is blocked: once per page load
const rulesAccepted = () => { try { return rulesSeen || localStorage.getItem(RULES_KEY) === RULES_VERSION; } catch { return rulesSeen; } };
const acceptRules = () => { rulesSeen = true; try { localStorage.setItem(RULES_KEY, RULES_VERSION); } catch { /* storage blocked */ } };

const REASONS: [string, string][] = [['spam', 'Spam or advertising'], ['abuse', 'Slurs, hate or harassment'], ['scam', 'Scam or posing as staff'], ['other', 'Something else']];

/** The chat rules, with the live slow mode and level from the server. */
export function showRules(r: Rules, onAccept?: () => void) {
  const m = modal(`<p class="eyebrow">Chat</p><h2 class="h-sect" style="font-size:20px">Chat rules</h2>
    <ol class="rules-list">
      <li><b>Be decent.</b> No slurs, hate speech, harassment or threats. Telling anyone to harm themselves gets you muted at once.</li>
      <li><b>No links and no advertising.</b> No other sites, referral or promo codes from elsewhere, Discord invites.</li>
      <li><b>No begging, trading or selling</b> items, accounts or Scrap in chat.</li>
      <li><b>Staff wear a badge.</b> Only accounts with a <span class="badge">MOD</span> or <span class="badge">ADMIN</span> badge are staff. Staff never ask for your password, Steam Guard code or items. Names that look like staff are not allowed.</li>
      <li><b>No spam.</b> One message every ${r.slowModeSeconds} second${r.slowModeSeconds === 1 ? '' : 's'}, up to ${r.maxLength} characters. No flooding or repeating.</li>
      <li><b>Chat unlocks at level ${r.minLevel}.</b> Reading is open to everyone.</li>
      <li><b>Report what breaks the rules</b> with the flag on a message. Moderators review every report; ${r.reportHideAt} reports from different players hide a message until they do.</li>
    </ol>
    <p class="muted" style="font-size:13px">Breaking the rules means deleted messages and mutes from minutes to permanent; repeated or serious cases can put the account on hold. Three messages caught by the word filter within 10 minutes mute you for 15 minutes.</p>
    <div class="row"><button class="btn" type="button" data-ok>${onAccept ? 'Got it, send my message' : 'Got it'}</button>${onAccept ? '<button class="btn ghost" type="button" data-no>Not now</button>' : ''}</div>`);
  m.root.querySelector('[data-no]')?.addEventListener('click', m.close);
  m.root.querySelector('[data-ok]')!.addEventListener('click', () => { acceptRules(); m.close(); onAccept?.(); });
}

const clock = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
const left = (t: number) => { const s = Math.max(0, Math.round((t - Date.now()) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function chatPanelHtml(id: string) {
  return `<section class="chat" id="${id}" aria-label="Chat">
    <header class="chat-head"><b class="h-sect">${icon('chat')} Chat</b><span class="chat-head-r"><span class="muted" data-count></span><button class="chip-btn" type="button" data-queue hidden></button></span></header>
    <div class="rainbox" data-rain></div>
    <ol class="chat-msgs" data-msgs aria-live="polite" aria-relevant="additions"></ol>
    <form class="chat-form" data-form>
      <input data-input maxlength="200" autocomplete="off" placeholder="Write a message…" aria-label="Chat message">
      <button class="btn small" type="submit">Send</button>
    </form>
    <p class="muted chat-rules"><span data-rules-line>No slurs, links, begging or trading.</span> <button class="linkish" type="button" data-rules>Chat rules</button></p>
  </section>`;
}

/** Mounts the panel into an element rendered from chatPanelHtml. Returns a cleanup function. */
export function mountChatPanel(el: HTMLElement, c: Ctx): () => void {
  let state: ChatState | null = null;
  let lastId = 0;
  const list = $('[data-msgs]', el);
  const canModerate = () => c.me.role === 'moderator' || c.me.role === 'admin';

  const paintRain = () => {
    if (!state) return;
    const r = state.rain;
    const box = $('[data-rain]', el);
    box.classList.toggle('open', r.open);
    box.innerHTML = `${icon('rain')}<div><b>Oil Rain</b> <span class="num">${scrap(r.pot, 0)}</span><br>
      <span class="muted">${r.open ? `open · ${left(r.closesAt!)} left · ${r.joiners} joined` : `next in ${left(r.nextAt)} · level 5+, not during a break`}</span></div>
      ${r.open ? `<button class="btn small ${r.joined ? 'ghost' : 'win'}" type="button" data-join ${r.joined || !c.me.promoEligible ? 'disabled' : ''}>${r.joined ? 'Joined' : 'Join'}</button>` : ''}`;
    $('[data-join]', box)?.addEventListener('click', (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
      await api('POST', '/rewards/rain'); toast('You joined the Oil Rain.'); await load();
    }));
  };

  const paintMessages = () => {
    if (!state) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    list.innerHTML = state.messages.map((m) => {
      const badge = m.role === 'admin' ? '<span class="badge">ADMIN</span>' : m.role === 'moderator' ? '<span class="badge">MOD</span>' : '';
      const actions = m.kind !== 'user' || m.you || c.guest ? ''
        : canModerate()
        ? `<span class="mod"><button type="button" data-del="${m.id}" aria-label="Delete message">✕</button><button type="button" data-mute="${esc(m.userId)}" data-name="${esc(m.name)}" aria-label="Mute ${esc(m.name)}">mute</button></span>`
        : `<span class="mod"><button type="button" data-report="${m.id}" data-name="${esc(m.name)}" aria-label="Report message by ${esc(m.name)}" title="Report">⚑</button></span>`;
      if (m.kind !== 'user') return `<li class="msg sys ${m.kind}"><span class="t num">${clock(m.createdAt)}</span>${m.kind === 'rain' ? icon('rain') : m.kind === 'win' ? icon('trophy') : ''}<span>${esc(m.body)}</span></li>`;
      return `<li class="msg ${m.you ? 'you' : ''}" title="${clock(m.createdAt)}">${avatarOf(m)}<div class="mc"><div class="mh"><span class="lv num">${m.level ?? 1}</span><b class="${tier(m.level ?? 1)}">${esc(m.name)}</b>${badge}${actions}</div><span class="body">${esc(m.body)}</span></div></li>`;
    }).join('') || '<li class="muted" style="padding:10px">No messages yet. Say hi.</li>';
    const newest = state.messages.at(-1)?.id ?? 0;
    if (nearBottom || newest > lastId && state.messages.at(-1)?.you) list.scrollTop = list.scrollHeight;
    lastId = newest;
    const muted = state.mute;
    const r = state.rules;
    const lowLevel = !c.guest && c.me.role === 'player' && c.me.level < r.minLevel;
    const input = $<HTMLInputElement>('[data-input]', el);
    input.disabled = c.guest || Boolean(muted) || !c.me.promoEligible || lowLevel;
    input.maxLength = r.maxLength;
    input.placeholder = c.guest ? 'Sign up to chat' : muted ? (muted.until ? `Muted until ${clock(muted.until)}` : 'You are muted') : !c.me.promoEligible ? 'Chat is read-only during a break'
      : lowLevel ? `Chat unlocks at level ${r.minLevel} (you are ${c.me.level})` : 'Write a message…';
    $('[data-rules-line]', el).textContent = `Level ${r.minLevel}+ · one message every ${r.slowModeSeconds} s · no slurs, links, begging or trading.`;
    const q = $<HTMLButtonElement>('[data-queue]', el);
    q.hidden = !canModerate();
    q.textContent = `Reports${state.openReports ? ` · ${state.openReports}` : ''}`;
    q.classList.toggle('hot', Boolean(state.openReports));
  };

  /** Moderators: reported messages with dismiss, delete and mute. */
  const openQueue = async () => {
    const m = modal('<p class="eyebrow">Moderation</p><h2 class="h-sect" style="font-size:20px">Reported messages</h2><div data-list><p class="muted">Loading …</p></div><div class="row"><button class="btn ghost" type="button" data-no>Close</button></div>');
    m.root.querySelector('[data-no]')!.addEventListener('click', m.close);
    const box = m.root.querySelector<HTMLElement>('[data-list]')!;
    const paint = async () => {
      const list = await api<Report[]>('GET', '/mod/reports');
      box.innerHTML = list.length ? `<ul class="reports">${list.map((r) => `<li>
        <div class="row" style="justify-content:space-between"><b>${esc(r.author.name)}</b><span class="chip ${r.state === 'hidden' ? 'lose' : ''}">${r.state === 'hidden' ? 'hidden by reports' : r.state}</span></div>
        <p class="rep-body">${esc(r.body)}</p>
        <p class="muted" style="font-size:12px">${r.reports} report${r.reports === 1 ? '' : 's'} · ${Object.entries(r.reasons).map(([k, n]) => `${esc(k)} ${n}`).join(' · ')} · last ${clock(r.lastAt)}</p>
        <div class="row"><button class="btn ghost small" type="button" data-act="dismiss" data-id="${r.messageId}">Dismiss${r.state === 'hidden' ? ' and show' : ''}</button>
          <button class="btn ghost small" type="button" data-act="delete" data-id="${r.messageId}">Delete</button>
          <button class="btn small" type="button" data-act="mute" data-min="60" data-id="${r.messageId}">Delete + mute 1 h</button>
          <button class="btn small" type="button" data-act="mute" data-min="1440" data-id="${r.messageId}">Delete + mute 24 h</button></div></li>`).join('')}</ul>`
        : '<p class="muted">Nothing reported. 🎉</p>';
      box.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.addEventListener('click', () => guard(b, async () => {
        await api('PUT', `/mod/reports/${b.dataset.id}`, { action: b.dataset.act, minutes: b.dataset.min ? Number(b.dataset.min) : null, note: 'From the report queue' });
        toast(b.dataset.act === 'dismiss' ? 'Report dismissed.' : b.dataset.act === 'delete' ? 'Message deleted.' : 'Deleted and muted.');
        await Promise.all([paint(), load()]);
      })));
    };
    await paint().catch((e) => { box.innerHTML = `<p class="status lose">${esc(String((e as Error).message ?? e))}</p>`; });
  };

  const load = async () => {
    state = await api<ChatState>('GET', '/chat');
    $('[data-count]', el).textContent = `${new Set(state.messages.filter((m) => m.userId).map((m) => m.userId)).size} chatting`;
    paintRain();
    paintMessages();
  };

  $('[data-rules]', el).addEventListener('click', () => { if (state) showRules(state.rules); });
  $('[data-queue]', el).addEventListener('click', () => void openQueue());

  list.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const rep = t.closest<HTMLButtonElement>('[data-report]');
    if (rep) {
      const m = modal(`<h2 class="h-sect">Report ${esc(rep.dataset.name)}'s message</h2>
        <div class="reasons">${REASONS.map(([k, l], i) => `<label class="check"><input type="radio" name="reason" value="${k}" ${i === 0 ? 'checked' : ''}> <span>${l}</span></label>`).join('')}</div>
        <p class="muted" style="font-size:12px">Moderators see who reported. False reports on purpose break the rules too.</p>
        <div class="row"><button class="btn" data-ok type="button">Report</button><button class="btn ghost" data-no type="button">Cancel</button></div>`);
      m.root.querySelector('[data-no]')!.addEventListener('click', m.close);
      m.root.querySelector('[data-ok]')!.addEventListener('click', (ev) => guard(ev.currentTarget as HTMLButtonElement, async () => {
        const reason = (m.root.querySelector('input[name="reason"]:checked') as HTMLInputElement).value;
        const r = await api<{ hidden: boolean }>('POST', `/chat/${rep.dataset.report}/report`, { reason });
        m.close();
        toast(r.hidden ? 'Thanks. The message is hidden until a moderator checks it.' : 'Thanks. A moderator will look at it.');
        if (r.hidden) await load();
      }));
      return;
    }
    const del = t.closest<HTMLButtonElement>('[data-del]');
    if (del) void guard(del, async () => { await api('DELETE', `/mod/chat/${del.dataset.del}`); toast('Message deleted.'); await load(); });
    const mu = t.closest<HTMLButtonElement>('[data-mute]');
    if (mu) {
      const m = modal(`<h2 class="h-sect">Mute ${esc(mu.dataset.name)}</h2>
        <label class="field">Duration<select data-min><option value="10">10 minutes</option><option value="60">1 hour</option><option value="1440">24 hours</option><option value="null">Until lifted</option></select></label>
        <label class="field">Reason (shown in the audit log)<input data-reason maxlength="200" placeholder="e.g. spam, links, abuse"></label>
        <div class="row"><button class="btn" data-ok type="button">Mute</button><button class="btn ghost" data-no type="button">Cancel</button></div>`);
      m.root.querySelector('[data-no]')!.addEventListener('click', m.close);
      m.root.querySelector('[data-ok]')!.addEventListener('click', (ev) => guard(ev.currentTarget as HTMLButtonElement, async () => {
        const v = (m.root.querySelector('[data-min]') as HTMLSelectElement).value;
        await api('POST', '/mod/mute', { userId: mu.dataset.mute, minutes: v === 'null' ? null : Number(v), reason: (m.root.querySelector('[data-reason]') as HTMLInputElement).value });
        m.close(); toast(`${mu.dataset.name} is muted.`); await load();
      }));
    }
  });

  if (c.guest) $<HTMLButtonElement>('[data-form] button', el).textContent = 'Sign up';
  $('[data-form]', el).addEventListener('submit', (e) => {
    e.preventDefault();
    if (c.guest) { c.openSignup(); return; }
    const input = $<HTMLInputElement>('[data-input]', el);
    const body = input.value.trim();
    if (!body) return;
    if (!rulesAccepted() && state) { showRules(state.rules, () => $<HTMLFormElement>('[data-form]', el).requestSubmit()); return; }
    void guard($<HTMLButtonElement>('[data-form] button', el), async () => {
      await api('POST', '/chat', { body });
      input.value = '';
      lastId = 0;
      await load();
      list.scrollTop = list.scrollHeight;
    });
  });

  // Pushed updates over SSE; the slow poll only covers a dropped stream.
  let queued = false;
  const refresh = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; void load().catch(() => null); }, 150); };
  const es = new EventSource('/api/events');
  es.addEventListener('chat', refresh);
  void load().catch(() => null);
  const poll = window.setInterval(refresh, 15_000);
  const rainClock = window.setInterval(paintRain, 1000);
  return () => { es.close(); clearInterval(poll); clearInterval(rainClock); };
}

export const chatView: View = {
  title: 'Chat',
  html: () => `<div class="chat-page">${chatPanelHtml('chat-main')}</div>`,
  mount: (root, c) => mountChatPanel($('#chat-main', root), c),
};
