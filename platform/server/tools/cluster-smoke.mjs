// Cluster smoke test: two API instances on one Postgres database.
// Checks leader election, cross-instance events (chat posted on A arrives over SSE on B, crash rounds
// ticked by the leader reach both), readiness, and a clean SIGTERM shutdown.
// Usage: DATABASE_URL=postgres://… node tools/cluster-smoke.mjs   (after `npm run build`)
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const b32 = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, v = 0; const out = []; for (const ch of s) { v = (v << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
const totp = (secret) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac('sha1', b32(secret)).update(m).digest(); const o = h[19] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL missing'); process.exit(2); }
const ports = [18801, 18802];
const procs = ports.map((port) => spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'dist/main.mjs'], {
  env: { ...process.env, PORT: String(port), LOG: 'off', CRASH_CHAIN: '200', DEMO: 'true', REQUIRE_OPERATOR_MFA: 'true' }, stdio: ['ignore', 'inherit', 'inherit'],
}));
const base = (i) => `http://127.0.0.1:${ports[i]}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (i, method, path, body, token) => {
  const res = await fetch(base(i) + path, { method, headers: { 'content-type': 'application/json', 'cf-ipcountry': 'NZ', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
};

/** Minimal SSE reader: collects [event, data] pairs. */
async function listen(i, seen) {
  const res = await fetch(base(i) + '/events', { headers: { 'cf-ipcountry': 'NZ' } });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ done: true }));
      if (done) return;
      buf += dec.decode(value, { stream: true });
      let k;
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, k); buf = buf.slice(k + 2);
        const ev = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (ev) seen.push([ev, data ? JSON.parse(data) : null]);
      }
    }
  })();
  return () => reader.cancel().catch(() => undefined);
}

try {
  for (let t = 0; t < 50; t++) { try { if ((await call(0, 'GET', '/health')).status === 200 && (await call(1, 'GET', '/health')).status === 200) break; } catch { /* starting */ } await sleep(200); }
  const seenB = [];
  const stopB = await listen(1, seenB); // subscribe before the first round opens
  await sleep(6000); // leader election runs every 5 s
  const ready = [(await call(0, 'GET', '/ready')).json, (await call(1, 'GET', '/ready')).json];
  assert.equal(ready.filter((r) => r.leader).length, 1, `exactly one leader: ${JSON.stringify(ready)}`);
  assert.ok(ready.every((r) => r.dialect === 'pg'));
  console.log('leader: instance', ready.findIndex((r) => r.leader) + 1);

  const a = (await call(0, 'POST', '/auth/demo', { displayName: 'Node A', ageConfirmed: true })).json.token;
  const msg = await call(0, 'POST', '/chat', { body: 'hello from A' }, a);
  assert.equal(msg.status, 200);
  for (let t = 0; t < 50 && !seenB.some(([e, d]) => e === 'chat' && d?.id === msg.json.id); t++) await sleep(100);
  assert.ok(seenB.some(([e, d]) => e === 'chat' && d?.id === msg.json.id), 'chat event from A reached B');
  const history = (await call(1, 'GET', '/chat')).json.messages.map((m) => m.body);
  assert.ok(history.includes('hello from A'));
  for (let t = 0; t < 100 && !seenB.some(([e]) => e === 'betting'); t++) await sleep(100);
  assert.ok(seenB.some(([e]) => e === 'betting'), 'crash rounds from the leader reach B');
  // a bet placed on the non-leader instance works and is visible on the other
  let placed;
  for (let t = 0; t < 120; t++) {
    placed = await call(1, 'POST', '/crash/bet', { stake: 5, target: 2 }, a);
    if (placed.status === 200) break;
    await sleep(250);
  }
  assert.equal(placed.status, 200, JSON.stringify(placed.json));
  const state = (await call(0, 'GET', '/crash/state', undefined, a)).json;
  assert.ok(state.bets.some((b) => b.you), 'bet placed on B is visible on A');
  // operator MFA state is shared: enrol on A, confirm on B, use the backoffice on A
  await call(0, 'POST', '/demo/role', { role: 'admin' }, a);
  assert.equal((await call(1, 'GET', '/admin/overview', undefined, a)).json.error, 'mfa_enroll_required');
  const { secret } = (await call(0, 'POST', '/mfa/enroll', {}, a)).json;
  assert.equal((await call(1, 'POST', '/mfa/confirm', { code: totp(secret) }, a)).status, 200);
  assert.equal((await call(0, 'GET', '/admin/overview', undefined, a)).status, 200);
  assert.equal((await call(0, 'POST', '/mfa/verify', { code: totp(secret) }, a)).json.error, 'mfa_invalid', 'replay refused on the other instance');
  stopB();
  console.log('cluster smoke test passed');
} finally {
  const exits = procs.map((p) => new Promise((r) => p.on('exit', (code) => r(code))));
  for (const p of procs) p.kill('SIGTERM');
  const codes = await Promise.race([Promise.all(exits), sleep(20_000).then(() => 'timeout')]);
  console.log('shutdown exit codes:', codes);
  if (codes === 'timeout' || codes.some((c) => c !== 0)) process.exitCode = 1;
}
