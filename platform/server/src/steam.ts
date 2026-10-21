/**
 * Steam login via OpenID 2.0 (the only login Valve offers third parties).
 *   1. Redirect the player to loginUrl(returnTo).
 *   2. Steam redirects back with openid.* query parameters.
 *   3. verifyAssertion() checks return_to, endpoint and claimed_id shape, rejects replayed nonces,
 *      then POSTs the parameters back with mode=check_authentication; Steam must answer "is_valid:true".
 * The SteamID64 in claimed_id is the account key. Steam's Web API key (profile, inventory) is only used
 * server-side and never shipped to the client.
 */

import type { DB } from './db';

export const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/;

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status?: number; text(): Promise<string> }>;

export function loginUrl(returnTo: string, realm: string): string {
  const p = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  return `${STEAM_OPENID}?${p}`;
}

export async function verifyAssertion(db: DB, query: URLSearchParams, expectedReturnTo: string, fetchFn: Fetch, now: number): Promise<{ steamId: string }> {
  const get = (k: string) => query.get(`openid.${k}`) ?? '';
  if (get('mode') !== 'id_res') throw new Error('openid: mode is not id_res');
  if (get('op_endpoint') !== STEAM_OPENID) throw new Error('openid: wrong endpoint');
  const rt = get('return_to');
  if (!rt || rt.split('?')[0] !== expectedReturnTo.split('?')[0]) throw new Error('openid: return_to mismatch');
  const m = CLAIMED_ID.exec(get('claimed_id'));
  if (!m || get('identity') !== get('claimed_id')) throw new Error('openid: invalid claimed_id');
  const nonce = get('response_nonce');
  if (!nonce) throw new Error('openid: missing nonce');
  const issued = Date.parse(nonce.slice(0, 20));
  if (!Number.isFinite(issued) || Math.abs(now - issued) > 5 * 60_000) throw new Error('openid: stale nonce');
  if (await db.prepare('SELECT 1 FROM openid_nonces WHERE nonce = ?').get(nonce)) throw new Error('openid: replayed nonce');

  const body = new URLSearchParams();
  for (const [k, v] of query) if (k.startsWith('openid.')) body.set(k, v);
  body.set('openid.mode', 'check_authentication');
  const res = await fetchFn(STEAM_OPENID, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  const text = res.ok ? await res.text() : '';
  if (!/^is_valid\s*:\s*true\s*$/m.test(text)) throw new Error('openid: Steam rejected the assertion');

  // The primary key makes a concurrent replay of the same assertion fail here.
  await db.prepare('INSERT INTO openid_nonces (nonce, created_at) VALUES (?, ?)').run(nonce, now);
  await db.prepare('DELETE FROM openid_nonces WHERE created_at < ?').run(now - 10 * 60_000);
  return { steamId: m[1] };
}

/* ---------- profile (Steam Web API) ---------- */

export interface SteamProfile { name: string; avatarUrl: string | null; profileUrl: string | null }

/** Persona names may hold anything; the site shows 2–24 visible characters without markup. */
export function steamName(raw: unknown, steamId: string): string {
  const n = [...String(raw ?? '').replace(/[\p{Cc}\p{Cf}<>]/gu, '').replace(/\s+/g, ' ').trim()].slice(0, 24).join('').trim();
  return n.length >= 2 ? n : `Steam ${steamId.slice(-4)}`;
}
/** Steam's image hosts; the web CSP (nginx.conf img-src) allows the same ones. */
const STEAM_CDN = /^https:\/\/(?:(?:[a-z0-9-]+\.)*steamstatic\.com|steamcdn-a\.akamaihd\.net)\/[\w./-]+$/i;
const PROFILE = /^https:\/\/steamcommunity\.com\/(?:id|profiles)\/[\w-]+\/?$/;

/**
 * Name, avatar and profile link via ISteamUser/GetPlayerSummaries. Returns null when the key is missing or
 * Steam does not answer, so sign-in never depends on the Web API.
 */
export async function fetchSteamProfile(steamId: string, apiKey: string | null, fetchFn: Fetch): Promise<SteamProfile | null> {
  if (!apiKey) return null;
  try {
    const res = await fetchFn(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(apiKey)}&steamids=${steamId}`, { method: 'GET', headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const p = (JSON.parse(await res.text()) as { response?: { players?: Record<string, unknown>[] } }).response?.players?.find((x) => x.steamid === steamId);
    if (!p) return null;
    const url = (v: unknown, re: RegExp) => (typeof v === 'string' && re.test(v) ? v : null);
    return { name: steamName(p.personaname, steamId), avatarUrl: url(p.avatarfull, STEAM_CDN), profileUrl: url(p.profileurl, PROFILE) };
  } catch {
    return null;
  }
}

/* ---------- trade URL ---------- */

const ACCOUNT_ID_BASE = 76561197960265728n;

/**
 * Checks a trade URL and returns it in canonical form. The partner id must be the account's own SteamID,
 * so skins can only ever go to the Steam account that signed in.
 */
export function parseTradeUrl(raw: unknown, steamId: string): string | null {
  let u: URL;
  try { u = new URL(String(raw ?? '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'steamcommunity.com' || !/^\/tradeoffer\/new\/?$/.test(u.pathname)) return null;
  const partner = u.searchParams.get('partner') ?? '';
  const token = u.searchParams.get('token') ?? '';
  if (!/^\d{1,10}$/.test(partner) || !/^[A-Za-z0-9_-]{8}$/.test(token)) return null;
  if (BigInt(partner) + ACCOUNT_ID_BASE !== BigInt(steamId)) return null;
  return `https://steamcommunity.com/tradeoffer/new/?partner=${partner}&token=${token}`;
}
