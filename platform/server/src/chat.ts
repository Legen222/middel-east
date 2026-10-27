/**
 * Live chat. New messages and deletions are pushed over the event bus (SSE `/events`); GET /chat returns
 * the latest history, so clients without a stream simply poll.
 *   Rules   1–200 characters, no links, no slurs or hate speech (chat-filter.ts plus the operator's own words),
 *           one message per N seconds (Settings, default 3), level M or higher to write (Settings, default 2;
 *           staff always), muted players cannot post. Three blocked messages within 10 minutes mute for 15 minutes.
 *   Reports Players report a message (spam, abuse, scam, other). Three reports from different players hide it
 *           until a moderator decides: dismiss (shows it again), delete, or delete and mute the author.
 *   System  Oil Rain openings and payouts and big wins are posted as system messages by the server,
 *           so the chat never contains activity that did not happen.
 *   Moderation  moderators and admins delete messages and mute players; both are audited.
 * Players on a break or in self-exclusion cannot post (they can still read), and no promo reaches them.
 */

import type { Role } from './accounts';
import { blockedWord } from './chat-filter';
import { type DB, audit, tx } from './db';
import { fail } from './errors';
import { type ChatEvent, bus } from './events';
import { activeBlock } from './rg';
import { type SiteSettings, getSettings } from './site';

export const CHAT_MAX = 200;
export const CHAT_HISTORY = 50;
const LINK = /(https?:\/\/|www\.|discord\.gg|\b[a-z0-9-]+\.(com|gg|net|io|org|ru|xyz|me|cc|co)\b)/i;

export type ChatKind = 'user' | 'system' | 'win' | 'rain';
interface Row { id: number; user_id: string | null; name: string; level: number | null; role: string | null; kind: ChatKind; body: string; created_at: number; avatar_url: string | null }

const announce = (db: DB, event: ChatEvent) => db.afterCommit(() => bus.publish({ topic: 'chat', event }));

export async function activeMute(db: DB, userId: string, now: number): Promise<{ until: number | null; reason: string | null } | null> {
  const r = (await db.prepare('SELECT until_at, reason FROM chat_mutes WHERE user_id = ? AND (until_at IS NULL OR until_at > ?)').get(userId, now)) as { until_at: number | null; reason: string | null } | undefined;
  return r ? { until: r.until_at, reason: r.reason } : null;
}

/** The rules as the chat shows them (live values from Settings). */
export const chatRules = (s: SiteSettings) => ({ minLevel: s.chatMinLevel, slowModeSeconds: s.chatSlowModeSeconds, maxLength: CHAT_MAX, reportHideAt: REPORT_HIDE_AT });

const STRIKE_WINDOW_MS = 10 * 60_000;
const STRIKES_TO_MUTE = 3;
const STRIKE_MUTE_MINUTES = 15;

const muteText = (until: number | null) => (until ? `You are muted until ${new Date(until).toISOString().slice(11, 16)} UTC.` : 'You are muted.');

export async function postMessage(db: DB, user: { id: string; display_name: string; role: Role }, level: number, body: unknown, now: number): Promise<{ id: number }> {
  const text = String(body ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 1 || text.length > CHAT_MAX) fail('invalid_message', `Messages are 1 to ${CHAT_MAX} characters.`);
  if (LINK.test(text)) fail('no_links', 'Links are not allowed in chat.');
  const s = await getSettings(db);
  if (user.role === 'player' && level < s.chatMinLevel) {
    fail('chat_level', `Chat unlocks at level ${s.chatMinLevel}. Play a few rounds to get there.`, 403, { minLevel: s.chatMinLevel, level });
  }
  const mute = await activeMute(db, user.id, now);
  if (mute) fail('muted', muteText(mute.until), 403, { until: mute.until, reason: mute.reason });
  if (await activeBlock(db, user.id, now)) fail('rg_blocked', 'Chat is read-only during a break.', 403);
  const hit = blockedWord(text, s.chatBlockedWords);
  if (hit) {
    // outside a transaction on purpose: the strike must be recorded although the message is refused
    const until = await strike(db, user.id, hit, text, now);
    fail('blocked_word', `That message breaks the chat rules and was not sent (see “Chat rules” below the chat).${until ? ` ${muteText(until)}` : ''}`, 400);
  }
  return tx(db, async (db) => {
    const last = (await db.prepare('SELECT created_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(user.id)) as { created_at: number } | undefined;
    const gap = s.chatSlowModeSeconds;
    if (last && now - last.created_at < gap * 1000) fail('chat_slow', `Slow down: one message every ${gap} second${gap === 1 ? '' : 's'}.`, 429);
    const r = (await db.prepare("INSERT INTO chat_messages (user_id, name, level, role, kind, body, created_at) VALUES (?, ?, ?, ?, 'user', ?, ?) RETURNING id")
      .get(user.id, user.display_name, level, user.role, text, now)) as { id: number };
    announce(db, { type: 'message', id: r.id });
    return { id: r.id };
  });
}

export async function systemMessage(db: DB, kind: Exclude<ChatKind, 'user'>, body: string, now: number): Promise<void> {
  const r = (await db.prepare('INSERT INTO chat_messages (user_id, name, level, role, kind, body, created_at) VALUES (NULL, ?, NULL, NULL, ?, ?, ?) RETURNING id')
    .get('SCRAPLINE', kind, body.slice(0, 300), now)) as { id: number };
  announce(db, { type: 'message', id: r.id });
}

export async function listMessages(db: DB, viewerId: string | null) {
  const rows = (await db.prepare(`SELECT m.*, u.avatar_url FROM chat_messages m LEFT JOIN users u ON u.id = m.user_id
    WHERE m.deleted_at IS NULL ORDER BY m.id DESC LIMIT ?`).all(CHAT_HISTORY)) as Row[];
  return rows.reverse().map((r) => ({
    id: r.id, userId: r.user_id, name: r.name, level: r.level, role: r.role, kind: r.kind, body: r.body, createdAt: r.created_at, avatar: r.avatar_url ?? null,
    you: r.user_id !== null && r.user_id === viewerId,
  }));
}

/** Records a refused message; the third within 10 minutes mutes the author for 15 minutes. Returns the mute end, if any. */
async function strike(db: DB, userId: string, word: string, body: string, now: number): Promise<number | null> {
  await audit(db, userId, 'chat_blocked', { word, body }, now);
  const n = (await db.prepare("SELECT COUNT(*) AS n FROM audit WHERE user_id = ? AND event = 'chat_blocked' AND created_at > ?").get(userId, now - STRIKE_WINDOW_MS)) as { n: number };
  if (Number(n.n) < STRIKES_TO_MUTE) return null;
  const until = now + STRIKE_MUTE_MINUTES * 60_000;
  await db.prepare(`INSERT INTO chat_mutes (user_id, until_at, reason, by_user, created_at) VALUES (?, ?, ?, 'system', ?)
    ON CONFLICT(user_id) DO UPDATE SET until_at = excluded.until_at, reason = excluded.reason, by_user = excluded.by_user, created_at = excluded.created_at`)
    .run(userId, until, 'Repeated blocked words', now);
  await audit(db, null, 'chat_auto_mute', { user: userId, minutes: STRIKE_MUTE_MINUTES }, now);
  return until;
}

/* ---------- reports ---------- */

export const REPORT_REASONS = ['spam', 'abuse', 'scam', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
/** Distinct reporters that hide a message until a moderator decides. */
export const REPORT_HIDE_AT = 3;
const REPORTS_PER_HOUR = 20;

export async function reportMessage(db: DB, reporterId: string, messageId: number, reason: unknown, now: number): Promise<{ ok: true; hidden: boolean }> {
  if (!REPORT_REASONS.includes(reason as ReportReason)) fail('invalid_params', `Reason: ${REPORT_REASONS.join(', ')}.`);
  return tx(db, async (db) => {
    const m = (await db.prepare('SELECT user_id, kind, deleted_at FROM chat_messages WHERE id = ?').get(messageId)) as { user_id: string | null; kind: ChatKind; deleted_at: number | null } | undefined;
    if (!m || m.deleted_at !== null) fail('not_found', 'Message not found.', 404);
    if (m!.kind !== 'user') fail('invalid_params', 'System messages cannot be reported.');
    if (m!.user_id === reporterId) fail('invalid_params', 'You cannot report your own message.');
    if (await db.prepare('SELECT 1 FROM chat_reports WHERE message_id = ? AND reporter_id = ?').get(messageId, reporterId)) return { ok: true as const, hidden: false };
    const recent = (await db.prepare('SELECT COUNT(*) AS n FROM chat_reports WHERE reporter_id = ? AND created_at > ?').get(reporterId, now - 3_600_000)) as { n: number };
    if (Number(recent.n) >= REPORTS_PER_HOUR) fail('report_limit', 'You have sent a lot of reports. Moderators are on it; please wait a bit.', 429);
    await db.prepare('INSERT INTO chat_reports (message_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?)').run(messageId, reporterId, reason, now);
    const open = (await db.prepare('SELECT COUNT(*) AS n FROM chat_reports WHERE message_id = ? AND resolved_at IS NULL').get(messageId)) as { n: number };
    const hidden = Number(open.n) >= REPORT_HIDE_AT;
    if (hidden) {
      await db.prepare("UPDATE chat_messages SET deleted_at = ?, deleted_by = 'reports' WHERE id = ? AND deleted_at IS NULL").run(now, messageId);
      await audit(db, null, 'chat_auto_hide', { message: messageId, author: m!.user_id, reports: Number(open.n) }, now);
      announce(db, { type: 'deleted', id: messageId });
    }
    return { ok: true as const, hidden };
  });
}

/** Open reports, one row per message, newest first (moderators). */
export async function openReports(db: DB) {
  const rows = (await db.prepare(`SELECT r.message_id, COUNT(*) AS n, MIN(r.created_at) AS first_at, MAX(r.created_at) AS last_at,
      m.user_id, m.name, m.body, m.created_at, m.deleted_at, m.deleted_by
    FROM chat_reports r JOIN chat_messages m ON m.id = r.message_id WHERE r.resolved_at IS NULL
    GROUP BY r.message_id, m.user_id, m.name, m.body, m.created_at, m.deleted_at, m.deleted_by ORDER BY MAX(r.created_at) DESC LIMIT 100`).all()) as
    { message_id: number; n: number; first_at: number; last_at: number; user_id: string; name: string; body: string; created_at: number; deleted_at: number | null; deleted_by: string | null }[];
  const reasons = (await db.prepare('SELECT message_id, reason, COUNT(*) AS n FROM chat_reports WHERE resolved_at IS NULL GROUP BY message_id, reason').all()) as
    { message_id: number; reason: ReportReason; n: number }[];
  return rows.map((r) => ({
    messageId: Number(r.message_id), reports: Number(r.n), firstAt: Number(r.first_at), lastAt: Number(r.last_at),
    author: { id: r.user_id, name: r.name }, body: r.body, postedAt: Number(r.created_at),
    state: r.deleted_at === null ? 'visible' : r.deleted_by === 'reports' ? 'hidden' : 'deleted',
    reasons: Object.fromEntries(reasons.filter((x) => Number(x.message_id) === Number(r.message_id)).map((x) => [x.reason, Number(x.n)])),
  }));
}

export async function openReportCount(db: DB): Promise<number> {
  return Number(((await db.prepare('SELECT COUNT(DISTINCT message_id) AS n FROM chat_reports WHERE resolved_at IS NULL').get()) as { n: number }).n);
}

/** dismiss: the message stays (and shows again if reports hid it); delete; mute: delete and mute the author. */
export async function resolveReport(db: DB, actorId: string, messageId: number, action: unknown, minutes: unknown, note: unknown, now: number) {
  if (action !== 'dismiss' && action !== 'delete' && action !== 'mute') fail('invalid_params', 'Action: dismiss, delete or mute.');
  const m = (await db.prepare('SELECT user_id, body, deleted_at, deleted_by FROM chat_messages WHERE id = ?').get(messageId)) as
    { user_id: string; body: string; deleted_at: number | null; deleted_by: string | null } | undefined;
  if (!m) fail('not_found', 'Message not found.', 404);
  if (!(await db.prepare('SELECT 1 FROM chat_reports WHERE message_id = ? AND resolved_at IS NULL').get(messageId))) fail('not_found', 'No open reports for this message.', 404);
  const reason = String(note ?? '').trim() || 'Chat rules';
  if (action === 'mute') {
    if (minutes !== null && typeof minutes !== 'number') fail('invalid_params', 'minutes is missing or not a number.');
    await mute(db, actorId, m!.user_id, minutes as number | null, reason, now);
  }
  return tx(db, async (db) => {
    if (action === 'dismiss' && m!.deleted_by === 'reports') {
      await db.prepare('UPDATE chat_messages SET deleted_at = NULL, deleted_by = NULL WHERE id = ?').run(messageId);
      announce(db, { type: 'message', id: messageId });
    }
    if (action !== 'dismiss') {
      if (m!.deleted_at === null) announce(db, { type: 'deleted', id: messageId });
      await db.prepare('UPDATE chat_messages SET deleted_at = COALESCE(deleted_at, ?), deleted_by = ? WHERE id = ?').run(now, actorId, messageId);
    }
    const outcome = action === 'dismiss' ? 'dismissed' : action === 'delete' ? 'deleted' : 'muted';
    await db.prepare('UPDATE chat_reports SET resolved_at = ?, resolved_by = ?, outcome = ? WHERE message_id = ? AND resolved_at IS NULL').run(now, actorId, outcome, messageId);
    await audit(db, actorId, `mod_report_${outcome}`, { message: messageId, author: m!.user_id, body: m!.body, note: reason }, now);
    return { messageId, outcome };
  });
}

/* ---------- moderation ---------- */

export async function deleteMessage(db: DB, actorId: string, id: number, now: number) {
  const r = (await db.prepare('SELECT user_id, body FROM chat_messages WHERE id = ? AND deleted_at IS NULL').get(id)) as { user_id: string | null; body: string } | undefined;
  if (!r) fail('not_found', 'Message not found.', 404);
  await db.prepare('UPDATE chat_messages SET deleted_at = ?, deleted_by = ? WHERE id = ?').run(now, actorId, id);
  await db.prepare("UPDATE chat_reports SET resolved_at = ?, resolved_by = ?, outcome = 'deleted' WHERE message_id = ? AND resolved_at IS NULL").run(now, actorId, id);
  await audit(db, actorId, 'mod_chat_delete', { message: id, author: r!.user_id, body: r!.body }, now);
  announce(db, { type: 'deleted', id });
  return { ok: true };
}

export async function mute(db: DB, actorId: string, userId: string, minutes: number | null, reason: string, now: number) {
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 60 * 24 * 30)) fail('invalid_params', 'Mute: 1 minute to 30 days, or until lifted.');
  if (!reason.trim()) fail('invalid_params', 'Give a reason for the mute.');
  if (!(await db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId))) fail('not_found', 'Player not found.', 404);
  const until = minutes === null ? null : now + minutes * 60_000;
  await db.prepare(`INSERT INTO chat_mutes (user_id, until_at, reason, by_user, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET until_at = excluded.until_at, reason = excluded.reason, by_user = excluded.by_user, created_at = excluded.created_at`)
    .run(userId, until, reason.trim().slice(0, 200), actorId, now);
  await audit(db, actorId, 'mod_mute', { user: userId, minutes, reason }, now);
  return { userId, until };
}

export async function unmute(db: DB, actorId: string, userId: string, now: number) {
  await db.prepare('DELETE FROM chat_mutes WHERE user_id = ?').run(userId);
  await audit(db, actorId, 'mod_unmute', { user: userId }, now);
  return { ok: true };
}
