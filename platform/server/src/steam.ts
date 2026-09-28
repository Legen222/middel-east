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

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; text(): Promise<string> }>;

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
