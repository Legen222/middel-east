/**
 * Operator step-up MFA with TOTP (RFC 6238: HMAC-SHA1, 30-second steps, 6 digits), compatible with
 * Google Authenticator, 1Password, Authy and friends.
 *   enroll   POST /mfa/enroll   → secret + otpauth:// URI (only while not yet enrolled)
 *   confirm  POST /mfa/confirm  → first valid code activates the secret
 *   verify   POST /mfa/verify   → marks the session as stepped up (sessions.mfa_at)
 * Backoffice and moderation routes require a step-up younger than cfg.operatorMfaMaxAgeMinutes when
 * cfg.requireOperatorMfa is on (always outside the demo). Codes are accepted ±1 step for clock drift,
 * and a code already used in this session is refused (replay).
 */

import { randomBytes } from 'node:crypto';

import { type Session } from './accounts';
import { type DB, audit } from './db';
import { fail } from './errors';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_MS = 30_000;

export function base32Encode(buf: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('invalid base32');
    value = (value << 5) | v; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

/** SHA-1 (FIPS 180-4), only for HOTP where RFC 4226/6238 fix the hash. Pure TS so the browser demo can run it too. */
function sha1(msg: Uint8Array): Uint8Array {
  const len = msg.length;
  const words = new Uint32Array((((len + 8) >> 6) + 1) * 16);
  for (let i = 0; i < len; i++) words[i >> 2] |= msg[i] << (24 - (i % 4) * 8);
  words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  words[words.length - 1] = len * 8;
  let [a, b, c, d, e] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 80; t++) w[t] = t < 16 ? words[i + t] : rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let [A, B, C, D, E] = [a, b, c, d, e];
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (B & C) | (~B & D) : t < 40 ? B ^ C ^ D : t < 60 ? (B & C) | (B & D) | (C & D) : B ^ C ^ D;
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const tmp = (rotl(A, 5) + f + E + k + w[t]) >>> 0;
      E = D; D = C; C = rotl(B, 30) >>> 0; B = A; A = tmp;
    }
    a = (a + A) >>> 0; b = (b + B) >>> 0; c = (c + C) >>> 0; d = (d + D) >>> 0; e = (e + E) >>> 0;
  }
  const out = new Uint8Array(20);
  [a, b, c, d, e].forEach((v, i) => { out[i * 4] = v >>> 24; out[i * 4 + 1] = v >>> 16; out[i * 4 + 2] = v >>> 8; out[i * 4 + 3] = v; });
  return out;
}

function hmacSha1(key: Uint8Array, msg: Uint8Array): Uint8Array {
  const k = new Uint8Array(64);
  k.set(key.length > 64 ? sha1(key) : key);
  const inner = new Uint8Array(64 + msg.length);
  const outer = new Uint8Array(64 + 20);
  for (let i = 0; i < 64; i++) { inner[i] = k[i] ^ 0x36; outer[i] = k[i] ^ 0x5c; }
  inner.set(msg, 64);
  outer.set(sha1(inner), 64);
  return sha1(outer);
}

/** RFC 4226 HOTP value for a counter. */
export function hotp(secret: Uint8Array, counter: number): string {
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setBigUint64(0, BigInt(counter));
  const h = hmacSha1(secret, msg);
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

/** Constant-time string comparison for equal-length codes. */
function sameCode(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const totp = (secretB32: string, now: number) => hotp(base32Decode(secretB32), Math.floor(now / STEP_MS));

/** Returns the matching step (for replay protection) or null. */
export function checkTotp(secretB32: string, code: string, now: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  const step = Math.floor(now / STEP_MS);
  for (const s of [step, step - 1, step + 1]) {
    if (sameCode(hotp(secret, s), code)) return s;
  }
  return null;
}

export async function enroll(db: DB, s: Session, issuer: string, now: number) {
  if (s.user.totp_secret) fail('mfa_enrolled', 'Two-factor authentication is already set up.', 409);
  const secret = base32Encode(new Uint8Array(randomBytes(20)));
  await db.prepare('UPDATE users SET totp_pending = ?, totp_pending_at = ? WHERE id = ?').run(secret, now, s.user.id);
  const label = encodeURIComponent(`${issuer}:${s.user.display_name}`);
  await audit(db, s.user.id, 'mfa_enroll_started', null, now);
  return { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30` };
}

export async function confirm(db: DB, s: Session, code: string, now: number) {
  const secret = s.user.totp_pending;
  if (!secret || now - (s.user.totp_pending_at ?? 0) > 10 * 60_000) fail('mfa_not_started', 'Start the setup again.', 409);
  const step = checkTotp(secret!, code, now);
  if (step === null) fail('mfa_invalid', 'That code is not valid. Check the time on your phone and try again.', 401);
  await db.prepare('UPDATE users SET totp_secret = ?, totp_pending = NULL, totp_pending_at = NULL WHERE id = ?').run(secret, s.user.id);
  await markStepUp(db, s, step!, now);
  await audit(db, s.user.id, 'mfa_enrolled', null, now);
  return { ok: true };
}

async function markStepUp(db: DB, s: Session, step: number, now: number) {
  await db.prepare('UPDATE sessions SET mfa_at = ?, mfa_step = ? WHERE token_hash = ?').run(now, step, s.tokenHash);
}

export async function verify(db: DB, s: Session, code: string, now: number) {
  if (!s.user.totp_secret) fail('mfa_not_enrolled', 'Set up two-factor authentication first.', 409);
  const step = checkTotp(s.user.totp_secret!, code, now);
  if (step === null || (s.mfaStep ?? -1) >= step) {
    await audit(db, s.user.id, 'mfa_failed', null, now);
    fail('mfa_invalid', 'That code is not valid.', 401);
  }
  await markStepUp(db, s, step!, now);
  await audit(db, s.user.id, 'mfa_verified', null, now);
  return { ok: true, mfaAt: now };
}
