import { frags } from '../ui';

/** Helpers shared by the backoffice tabs. */
export const when = (t: number | null) => (t ? new Date(t).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short', hour12: false }) : '–');
export const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${frags(Math.abs(n))}`;
export const kpi = (label: string, value: string, sub = '') => `<div class="kpi"><span class="eyebrow">${label}</span><b class="num">${value}</b>${sub ? `<span class="muted">${sub}</span>` : ''}</div>`;
