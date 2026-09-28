/**
 * Live chat panel with the Oil Rain box. Used as the right-hand aside on wide screens and as the
 * #/chat view everywhere else. Reloads GET /chat when the server pushes a chat event over SSE (/events),
 * with a slow poll as fallback; moderators and admins get delete and mute actions.
 */
import { api } from './api';
import { icon } from './icons';
import type { Ctx, View } from './main';
import { $, esc, frags, guard, modal, toast } from './ui';

interface Msg { id: number; userId: string | null; name: string; level: number | null; role: string | null; kind: 'user' | 'system' | 'win' | 'rain'; body: string; createdAt: number; you: boolean }
interface ChatState {
  messages: Msg[];
  rain: { open: boolean; closesAt?: number; nextAt: number; pot: number; joiners: number; joined: boolean };
  mute: { until: number | null; reason: string | null } | null;
  role: string | null;
}

const clock = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
const left = (t: number) => { const s = Math.max(0, Math.round((t - Date.now()) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function chatPanelHtml(id: string) {
  return `<section class="chat" id="${id}" aria-label="Chat">
    <header class="chat-head"><b class="h-sect">${icon('chat')} Chat</b><span class="muted" data-count></span></header>
    <div class="rainbox" data-rain></div>
    <ol class="chat-msgs" data-msgs aria-live="polite" aria-relevant="additions"></ol>
    <form class="chat-form" data-form>
      <input data-input maxlength="200" autocomplete="off" placeholder="Write a message…" aria-label="Chat message">
      <button class="btn small" type="submit">Send</button>
    </form>
    <p class="muted chat-rules">No links, no begging, no trading. One message every 3 seconds.</p>
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
    box.innerHTML = `${icon('rain')}<div><b>Oil Rain</b> <span class="num">${frags(r.pot, 0)} Frags</span><br>
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
      const actions = canModerate() && m.kind === 'user' && !m.you
        ? `<span class="mod"><button type="button" data-del="${m.id}" aria-label="Delete message">✕</button><button type="button" data-mute="${esc(m.userId)}" data-name="${esc(m.name)}" aria-label="Mute ${esc(m.name)}">mute</button></span>` : '';
      if (m.kind !== 'user') return `<li class="msg sys ${m.kind}"><span class="t num">${clock(m.createdAt)}</span>${m.kind === 'rain' ? icon('rain') : m.kind === 'win' ? icon('trophy') : ''}<span>${esc(m.body)}</span></li>`;
      return `<li class="msg ${m.you ? 'you' : ''}"><span class="t num">${clock(m.createdAt)}</span><span class="lv num">${m.level ?? 1}</span><b>${esc(m.name)}</b>${badge}<span class="body">${esc(m.body)}</span>${actions}</li>`;
    }).join('') || '<li class="muted" style="padding:10px">No messages yet. Say hi.</li>';
    const newest = state.messages.at(-1)?.id ?? 0;
    if (nearBottom || newest > lastId && state.messages.at(-1)?.you) list.scrollTop = list.scrollHeight;
    lastId = newest;
    const muted = state.mute;
    const input = $<HTMLInputElement>('[data-input]', el);
    input.disabled = Boolean(muted) || !c.me.promoEligible;
    input.placeholder = muted ? (muted.until ? `Muted until ${clock(muted.until)}` : 'You are muted') : !c.me.promoEligible ? 'Chat is read-only during a break' : 'Write a message…';
  };

  const load = async () => {
    state = await api<ChatState>('GET', '/chat');
    $('[data-count]', el).textContent = `${new Set(state.messages.filter((m) => m.userId).map((m) => m.userId)).size} chatting`;
    paintRain();
    paintMessages();
  };

  list.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
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

  $('[data-form]', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>('[data-input]', el);
    const body = input.value.trim();
    if (!body) return;
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
