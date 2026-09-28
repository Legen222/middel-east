/**
 * Live chat. Plain polling (GET /chat) keeps it transport-independent; the in-browser demo and
 * node:http serve it the same way.
 *   Rules   1–200 characters, no links, one message per 3 s, muted players cannot post.
 *   System  Oil Rain openings and payouts and big wins are posted as system messages by the server,
 *           so the chat never contains activity that did not happen.
 *   Moderation  moderators and admins delete messages and mute players; both are audited.
 * Players on a break or in self-exclusion cannot post (they can still read), and no promo reaches them.
 */

import type { Role } from './accounts';
import { type DB, audit, tx } from './db';
import { fail } from './errors';
import { activeBlock } from './rg';

export const CHAT_MAX = 200;
export const CHAT_INTERVAL_MS = 3000;
export const CHAT_HISTORY = 50;
const LINK = /(https?:\/\/|www\.|discord\.gg|\b[a-z0-9-]+\.(com|gg|net|io|org|ru|xyz|me|cc|co)\b)/i;

export type ChatKind = 'user' | 'system' | 'win' | 'rain';
interface Row { id: number; user_id: string | null; name: string; level: number | null; role: string | null; kind: ChatKind; body: string; created_at: number }

export function activeMute(db: DB, userId: string, now: number): { until: number | null; reason: string | null } | null {
  const r = db.prepare('SELECT until_at, reason FROM chat_mutes WHERE user_id = ? AND (until_at IS NULL OR until_at > ?)').get(userId, now) as { until_at: number | null; reason: string | null } | undefined;
  return r ? { until: r.until_at, reason: r.reason } : null;
}

export function postMessage(db: DB, user: { id: string; display_name: string; role: Role }, level: number, body: unknown, now: number) {
  const text = String(body ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 1 || text.length > CHAT_MAX) fail('invalid_message', `Messages are 1 to ${CHAT_MAX} characters.`);
  if (LINK.test(text)) fail('no_links', 'Links are not allowed in chat.');
  return tx(db, () => {
    const mute = activeMute(db, user.id, now);
    if (mute) fail('muted', mute.until ? `You are muted until ${new Date(mute.until).toISOString().slice(11, 16)} UTC.` : 'You are muted.', 403, { until: mute.until, reason: mute.reason });
    if (activeBlock(db, user.id, now)) fail('rg_blocked', 'Chat is read-only during a break.', 403);
    const last = db.prepare('SELECT created_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(user.id) as { created_at: number } | undefined;
    if (last && now - last.created_at < CHAT_INTERVAL_MS) fail('chat_slow', 'Slow down: one message every 3 seconds.', 429);
    const r = db.prepare("INSERT INTO chat_messages (user_id, name, level, role, kind, body, created_at) VALUES (?, ?, ?, ?, 'user', ?, ?)")
      .run(user.id, user.display_name, level, user.role, text, now);
    return { id: Number(r.lastInsertRowid) };
  });
}

export function systemMessage(db: DB, kind: Exclude<ChatKind, 'user'>, body: string, now: number): void {
  db.prepare('INSERT INTO chat_messages (user_id, name, level, role, kind, body, created_at) VALUES (NULL, ?, NULL, NULL, ?, ?, ?)').run('SCRAPLINE', kind, body.slice(0, 300), now);
}

export function listMessages(db: DB, viewerId: string | null) {
  const rows = db.prepare('SELECT * FROM chat_messages WHERE deleted_at IS NULL ORDER BY id DESC LIMIT ?').all(CHAT_HISTORY) as unknown as Row[];
  return rows.reverse().map((r) => ({ id: r.id, userId: r.user_id, name: r.name, level: r.level, role: r.role, kind: r.kind, body: r.body, createdAt: r.created_at, you: r.user_id !== null && r.user_id === viewerId }));
}

/* ---------- moderation ---------- */

export function deleteMessage(db: DB, actorId: string, id: number, now: number) {
  const r = db.prepare('SELECT user_id, body FROM chat_messages WHERE id = ? AND deleted_at IS NULL').get(id) as { user_id: string | null; body: string } | undefined;
  if (!r) fail('not_found', 'Message not found.', 404);
  db.prepare('UPDATE chat_messages SET deleted_at = ?, deleted_by = ? WHERE id = ?').run(now, actorId, id);
  audit(db, actorId, 'mod_chat_delete', { message: id, author: r!.user_id, body: r!.body }, now);
  return { ok: true };
}

export function mute(db: DB, actorId: string, userId: string, minutes: number | null, reason: string, now: number) {
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 60 * 24 * 30)) fail('invalid_params', 'Mute: 1 minute to 30 days, or until lifted.');
  if (!reason.trim()) fail('invalid_params', 'Give a reason for the mute.');
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) fail('not_found', 'Player not found.', 404);
  const until = minutes === null ? null : now + minutes * 60_000;
  db.prepare(`INSERT INTO chat_mutes (user_id, until_at, reason, by_user, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET until_at = excluded.until_at, reason = excluded.reason, by_user = excluded.by_user, created_at = excluded.created_at`)
    .run(userId, until, reason.trim().slice(0, 200), actorId, now);
  audit(db, actorId, 'mod_mute', { user: userId, minutes, reason }, now);
  return { userId, until };
}

export function unmute(db: DB, actorId: string, userId: string, now: number) {
  db.prepare('DELETE FROM chat_mutes WHERE user_id = ?').run(userId);
  audit(db, actorId, 'mod_unmute', { user: userId }, now);
  return { ok: true };
}
