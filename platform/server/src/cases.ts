/**
 * Case manager. Cases are data: every edit in the backoffice writes a new immutable version
 * (items, price, RTP), and every opening or battle stores the version it used. A player can always
 * re-verify an old opening against the exact item list it was drawn from, and an edit never
 * changes a round that is already running.
 *
 * The price is never typed in: it is ⌈EV / (1 − edge)⌉ like every other case (engine priceCase), so
 * the operator cannot publish a case above the house edge. Disabled cases stay verifiable.
 */

import { type CaseDef, type CaseItem, EDGE, caseRtp, caseWeight, priceCase } from '../../engine/src/index';
import { type Config, MF_PER_FRAG } from './config';
import { type DB, audit, tx } from './db';
import { fail } from './errors';

export interface CaseVersion extends CaseDef { version: number; price: number; rtp: number }
interface CaseRow { id: string; name: string; enabled: number; sort: number; current_version: number }
interface VersionRow { case_id: string; version: number; name: string; items: string; price: number; rtp: number; created_by: string | null; created_at: number }

const toVersion = (v: VersionRow): CaseVersion => ({ id: v.case_id, name: v.name, items: JSON.parse(v.items) as CaseItem[], version: Number(v.version), price: Number(v.price), rtp: Number(v.rtp) });

export async function caseVersion(db: DB, id: string, version?: number): Promise<CaseVersion> {
  const v = version === undefined
    ? await db.prepare('SELECT v.* FROM cases c JOIN case_versions v ON v.case_id = c.id AND v.version = c.current_version WHERE c.id = ?').get(String(id))
    : await db.prepare('SELECT * FROM case_versions WHERE case_id = ? AND version = ?').get(String(id), version);
  if (!v) fail('not_found', 'Unknown case.', 404);
  return toVersion(v as VersionRow);
}

/** The current version of a case players can open now (enabled only). */
export async function playableCase(db: DB, id: string): Promise<CaseVersion> {
  const c = (await db.prepare('SELECT enabled FROM cases WHERE id = ?').get(String(id))) as { enabled: number } | undefined;
  if (!c) fail('invalid_params', 'Unknown case.');
  if (Number(c!.enabled) !== 1) fail('case_disabled', 'This case is not available right now.', 409);
  return caseVersion(db, id);
}

const withChances = (c: CaseVersion) => {
  const W = caseWeight(c);
  return { id: c.id, name: c.name, version: c.version, price: c.price, rtp: c.rtp, items: c.items.map((i) => ({ name: i.name, value: i.value, chance: i.weight / W })) };
};

/** Lobby list: enabled cases, current versions, in display order. */
export async function listCases(db: DB) {
  const rows = (await db.prepare(`SELECT v.* FROM cases c JOIN case_versions v ON v.case_id = c.id AND v.version = c.current_version
    WHERE c.enabled = 1 ORDER BY c.sort, c.id`).all()) as VersionRow[];
  return rows.map((r) => withChances(toVersion(r)));
}

/** Backoffice list: every case with its state and version history size. */
export async function adminCases(db: DB) {
  const rows = (await db.prepare('SELECT * FROM cases ORDER BY sort, id').all()) as CaseRow[];
  const out = [];
  for (const r of rows) {
    const cur = await caseVersion(db, r.id, Number(r.current_version));
    const versions = (await db.prepare('SELECT version, price, rtp, created_by, created_at FROM case_versions WHERE case_id = ? ORDER BY version DESC').all(r.id)) as { version: number; price: number; rtp: number; created_by: string | null; created_at: number }[];
    const opened = (await db.prepare("SELECT COUNT(*) AS n FROM bets WHERE game = 'cases' AND status = 'settled' AND params LIKE ?").get(`%"caseId":"${r.id}"%`)) as { n: number };
    out.push({ ...withChances(cur), weights: cur.items.map((i) => i.weight), enabled: Number(r.enabled) === 1, sort: Number(r.sort), opened: Number(opened.n), versions });
  }
  return out;
}

const ID = /^[a-z0-9][a-z0-9-]{1,31}$/;

function validateItems(cfg: Config, name: string, items: unknown): { name: string; items: CaseItem[] } {
  const n = String(name ?? '').trim();
  if (n.length < 2 || n.length > 40) fail('invalid_params', 'Case name: 2 to 40 characters.');
  if (!Array.isArray(items) || items.length < 2 || items.length > 60) fail('invalid_params', 'A case needs 2 to 60 items.');
  const out: CaseItem[] = (items as unknown[]).map((raw, k) => {
    const i = raw as { name?: unknown; value?: unknown; weight?: unknown };
    const iname = String(i?.name ?? '').trim();
    const value = Number(i?.value);
    const weight = Number(i?.weight);
    if (iname.length < 1 || iname.length > 60) fail('invalid_params', `Item ${k + 1}: name 1 to 60 characters.`);
    if (!Number.isSafeInteger(value) || value < 0 || value > 10_000_000) fail('invalid_params', `Item ${k + 1}: value must be whole Frags (0 to 10,000,000).`);
    if (!Number.isSafeInteger(weight) || weight < 1 || weight > 1_000_000_000) fail('invalid_params', `Item ${k + 1}: weight must be a whole number of tickets (1 to 1,000,000,000).`);
    return { name: iname, value, weight };
  });
  const c: CaseDef = { id: 'x', name: n, items: out };
  if (caseWeight(c) > 4_000_000_000) fail('invalid_params', 'Total weight is above 4,000,000,000 tickets.');
  const price = priceCase(c);
  if (price < 1) fail('invalid_params', 'The case has no value: every item is worth 0.');
  if (price * MF_PER_FRAG > cfg.maxStake) fail('invalid_params', `Price ${price} Frags is above the max stake (${cfg.maxStake / MF_PER_FRAG} Frags).`);
  if (Math.max(...out.map((i) => i.value)) * MF_PER_FRAG > cfg.maxWin) fail('invalid_params', `An item is worth more than the max win (${cfg.maxWin / MF_PER_FRAG} Frags).`);
  return { name: n, items: out };
}

/** Preview without saving: what the backoffice shows while the operator edits weights. */
export function previewCase(cfg: Config, name: string, items: unknown) {
  const v = validateItems(cfg, name, items);
  const c: CaseDef = { id: 'preview', ...v };
  return withChances({ ...c, version: 0, price: priceCase(c), rtp: caseRtp(c) });
}

/** Creates a case (new id) or publishes a new version of an existing one. */
export function saveCase(db: DB, cfg: Config, actorId: string, input: { id: string; name: string; items: unknown }, now: number) {
  return tx(db, async (db) => {
    const id = String(input?.id ?? '').trim().toLowerCase();
    if (!ID.test(id)) fail('invalid_params', 'Case id: 2 to 32 characters, a–z, 0–9 and dashes.');
    const v = validateItems(cfg, input.name, input.items);
    const c: CaseDef = { id, ...v };
    const price = priceCase(c);
    const rtp = caseRtp(c);
    const cur = (await db.prepare('SELECT * FROM cases WHERE id = ?').get(id)) as CaseRow | undefined;
    const version = cur ? Number(cur.current_version) + 1 : 1;
    if (cur) {
      await db.prepare('UPDATE cases SET name = ?, current_version = ?, updated_at = ? WHERE id = ?').run(v.name, version, now, id);
    } else {
      const sort = ((await db.prepare('SELECT COALESCE(MAX(sort), -1) AS s FROM cases').get()) as { s: number }).s + 1;
      await db.prepare('INSERT INTO cases (id, name, enabled, sort, current_version, created_at, updated_at) VALUES (?, ?, 0, ?, 1, ?, ?)').run(id, v.name, sort, now, now);
    }
    await db.prepare('INSERT INTO case_versions (case_id, version, name, items, price, rtp, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, version, v.name, JSON.stringify(v.items), price, rtp, actorId, now);
    await audit(db, actorId, 'admin_case_version', { id, version, price, rtp, edge: EDGE.cases }, now);
    return withChances(await caseVersion(db, id, version));
  });
}

/** New cases start disabled; the operator enables them after checking the preview. */
export async function setCaseState(db: DB, actorId: string, id: string, patch: { enabled?: unknown; sort?: unknown }, now: number) {
  const cur = (await db.prepare('SELECT * FROM cases WHERE id = ?').get(String(id))) as CaseRow | undefined;
  if (!cur) fail('not_found', 'Unknown case.', 404);
  if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') fail('invalid_params', 'enabled must be true or false.');
  if (patch.sort !== undefined && (!Number.isInteger(patch.sort) || (patch.sort as number) < 0 || (patch.sort as number) > 9999)) fail('invalid_params', 'sort: 0 to 9999.');
  const enabled = patch.enabled === undefined ? Number(cur!.enabled) : patch.enabled ? 1 : 0;
  const sort = patch.sort === undefined ? Number(cur!.sort) : (patch.sort as number);
  await db.prepare('UPDATE cases SET enabled = ?, sort = ?, updated_at = ? WHERE id = ?').run(enabled, sort, now, cur!.id);
  await audit(db, actorId, 'admin_case_state', { id: cur!.id, enabled: enabled === 1, sort }, now);
  return { id: cur!.id, enabled: enabled === 1, sort };
}

/** RTP and price per `id@version`, for the RTP monitor. */
export async function caseRtpMap(db: DB): Promise<Map<string, { rtp: number; price: number }>> {
  const rows = (await db.prepare('SELECT case_id, version, rtp, price FROM case_versions').all()) as { case_id: string; version: number; rtp: number; price: number }[];
  return new Map(rows.map((r) => [`${r.case_id}@${Number(r.version)}`, { rtp: Number(r.rtp), price: Number(r.price) }]));
}
