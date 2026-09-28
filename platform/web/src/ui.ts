import { RequestError } from './api';

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const frags = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const mult = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}×`;
export const pct = (n: number, d = 2) => `${(n * 100).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
/** Percent without trailing zeros, up to 3 decimals (for odds tables). */
export const pctShort = (n: number) => `${(n * 100).toLocaleString('en-US', { maximumFractionDigits: 3 })} %`;
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, reducedMotion() ? 0 : ms));

let toastTimer = 0;
export function toast(message: string, kind: 'info' | 'err' = 'info') {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.className = `toast ${kind === 'err' ? 'err' : ''}`;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.hidden = true; }, 4200);
}

export function errorText(e: unknown): string {
  if (e instanceof RequestError) return e.body.message;
  return 'Something went wrong. Please try again.';
}

/** Runs an action with the button disabled; shows API errors as a toast. */
export async function guard<T>(btn: HTMLButtonElement | null, fn: () => Promise<T>): Promise<T | undefined> {
  if (btn) btn.disabled = true;
  try { return await fn(); } catch (e) { toast(errorText(e), 'err'); return undefined; } finally { if (btn) btn.disabled = false; }
}

export function modal(html: string): { root: HTMLElement; close: () => void } {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.append(back);
  const close = () => back.remove();
  back.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Escape') close(); });
  ($('button, input, select', back) as HTMLElement | null)?.focus();
  return { root: back, close };
}

/** Stake input with ½ and 2× buttons. Reads Frags. */
export function stakeField(id: string, value: number, label = 'Stake (Frags)') {
  return `<div class="stakebar"><label class="field">${label}<input id="${id}" inputmode="decimal" value="${value}"></label>
    <button type="button" class="btn ghost small" data-stake="${id}" data-f="0.5">½</button><button type="button" class="btn ghost small" data-stake="${id}" data-f="2">2×</button></div>`;
}
export function bindStake(root: ParentNode) {
  $$<HTMLButtonElement>('[data-stake]', root).forEach((b) => b.addEventListener('click', () => {
    const inp = $<HTMLInputElement>(`#${b.dataset.stake}`, root);
    const v = readNum(inp.value) * Number(b.dataset.f);
    inp.value = String(Math.max(1, Math.round(v * 100) / 100));
    inp.dispatchEvent(new Event('input'));
  }));
}
export const readNum = (s: string) => Number(String(s).replace(',', '.'));

export function fairBox(f: { serverSeedHash?: string; clientSeed?: string; nonce: number; serverSeed?: string | null }) {
  return `<dl class="fairbox"><dt>Seed hash</dt><dd>${esc(f.serverSeedHash ?? '–')}</dd><dt>Client seed</dt><dd>${esc(f.clientSeed ?? '–')}</dd><dt>Nonce</dt><dd>${f.nonce}</dd>${f.serverSeed ? `<dt>Server seed</dt><dd>${esc(f.serverSeed)}</dd>` : ''}</dl>`;
}
