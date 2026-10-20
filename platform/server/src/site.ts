/**
 * Site-wide settings the operator changes at runtime (backoffice → Settings). Stored as JSON per key,
 * every change audited and pushed to clients over the event bus.
 *   announcement      banner text for everyone (info or warning), or none
 *   maintenance       pauses every game at once; cash-outs of running rounds keep working
 *   registrationOpen  new sign-ups allowed (existing accounts can always sign in)
 *   chatSlowModeSeconds  minimum gap between two messages of one player (1–60)
 *   rainEnabled       new Oil Rain rounds open (a running one still pays out)
 */

import { type DB, audit, tx } from './db';
import { fail } from './errors';
import { bus } from './events';

export interface SiteSettings {
  announcement: { text: string; tone: 'info' | 'warn' } | null;
  maintenance: boolean;
  registrationOpen: boolean;
  chatSlowModeSeconds: number;
  rainEnabled: boolean;
}

export const DEFAULT_SETTINGS: SiteSettings = { announcement: null, maintenance: false, registrationOpen: true, chatSlowModeSeconds: 3, rainEnabled: true };
const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof SiteSettings)[];

export async function getSettings(db: DB): Promise<SiteSettings> {
  const rows = (await db.prepare('SELECT key, value FROM settings').all()) as { key: string; value: string }[];
  const out: SiteSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) if ((KEYS as string[]).includes(r.key)) (out as unknown as Record<string, unknown>)[r.key] = JSON.parse(r.value);
  return out;
}

function validate(key: keyof SiteSettings, v: unknown): unknown {
  switch (key) {
    case 'announcement': {
      if (v === null) return null;
      const a = v as { text?: unknown; tone?: unknown };
      const text = String(a?.text ?? '').trim();
      if (text.length < 1 || text.length > 280) fail('invalid_params', 'Announcement: 1 to 280 characters.');
      return { text, tone: a.tone === 'warn' ? 'warn' : 'info' };
    }
    case 'chatSlowModeSeconds': {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 60) fail('invalid_params', 'Chat slow mode: 1 to 60 seconds.');
      return n;
    }
    default:
      if (typeof v !== 'boolean') fail('invalid_params', `${key} must be true or false.`);
      return v;
  }
}

export function setSettings(db: DB, actorId: string, patch: Record<string, unknown>, now: number): Promise<SiteSettings> {
  const keys = Object.keys(patch ?? {});
  if (!keys.length) fail('invalid_params', 'Nothing to change.');
  for (const k of keys) if (!(KEYS as string[]).includes(k)) fail('invalid_params', `Unknown setting: ${k}`);
  return tx(db, async (db) => {
    for (const k of keys as (keyof SiteSettings)[]) {
      const value = validate(k, patch[k]);
      await db.prepare(`INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
        .run(k, JSON.stringify(value), actorId, now);
    }
    await audit(db, actorId, 'admin_settings', patch, now);
    db.afterCommit(() => bus.publish({ topic: 'site', event: { type: 'settings' } }));
    return getSettings(db);
  });
}

/** What every visitor sees (GET /site). */
export async function publicSite(db: DB) {
  const s = await getSettings(db);
  return { announcement: s.announcement, maintenance: s.maintenance, registrationOpen: s.registrationOpen };
}
