#!/usr/bin/env node
/**
 * Art pipeline: generates the site's images with OpenAI's image model, from the briefs in art/manifest.json.
 * Claude writes and revises the briefs, reviews every variant and picks; the model only draws.
 *
 *   npm run art -- --batch style-test            generate the assets of one batch (2 variants each)
 *   npm run art -- --only crate-barrel,hero --variants 3
 *   npm run art -- --dry --batch v1              print what would be sent, call nothing
 *   npm run art -- --pick crate-barrel=2         copy art/out/crate-barrel/v2.webp to art/picked/crate-barrel.webp
 *
 * Environment: OPENAI_API_KEY (required for generating), OPENAI_IMAGE_MODEL (default gpt-image-1).
 * Variants go to art/out/<id>/vN.webp (not committed) with a log of prompt, model and settings; picked
 * images go to art/picked/ (committed) and art/picked.json records which brief produced them.
 * Existing variants are kept: a new run adds vN+1 … unless --force starts the asset over.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'art');
const API = 'https://api.openai.com/v1/images/generations';
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i < 0 ? null : args[i + 1] ?? ''; };
const has = (name) => args.includes(`--${name}`);

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const promptOf = (a) => [manifest.style, manifest.kinds[a.kind]?.style, a.prompt].filter(Boolean).join(' ');
const settingsOf = (a) => ({ ...manifest.kinds[a.kind]?.settings, ...a.settings });
const briefHash = (a) => createHash('sha256').update(JSON.stringify([MODEL, promptOf(a), settingsOf(a)])).digest('hex').slice(0, 12);

/* ---------- pick ---------- */
if (opt('pick')) {
  const pickedPath = join(ROOT, 'picked.json');
  const picked = existsSync(pickedPath) ? JSON.parse(readFileSync(pickedPath, 'utf8')) : {};
  for (const pair of opt('pick').split(',')) {
    const [id, n] = pair.split('=');
    const asset = manifest.assets.find((a) => a.id === id);
    const src = join(ROOT, 'out', id, `v${n}.webp`);
    if (!asset || !existsSync(src)) { console.error(`No variant ${n} for "${id}".`); process.exit(1); }
    mkdirSync(join(ROOT, 'picked'), { recursive: true });
    copyFileSync(src, join(ROOT, 'picked', `${id}.webp`));
    const log = JSON.parse(readFileSync(join(ROOT, 'out', id, 'log.json'), 'utf8'));
    picked[id] = { variant: Number(n), ...log.variants.find((v) => v.n === Number(n)) };
    console.log(`picked ${id} ← v${n}`);
  }
  writeFileSync(pickedPath, `${JSON.stringify(picked, null, 2)}\n`);
  process.exit(0);
}

/* ---------- generate ---------- */
const only = opt('only')?.split(',').filter(Boolean);
const batch = opt('batch');
const variants = Math.max(1, Math.min(4, Number(opt('variants') ?? manifest.defaultVariants ?? 2)));
const assets = manifest.assets.filter((a) => (only ? only.includes(a.id) : batch ? a.batch === batch : false));
if (!assets.length) {
  console.error(only || batch ? 'No asset matches.' : 'Say what to generate: --batch <name> or --only <id,id>.');
  console.error(`Batches: ${[...new Set(manifest.assets.map((a) => a.batch))].join(', ')}`);
  process.exit(1);
}

if (has('dry')) {
  for (const a of assets) console.log(`\n# ${a.id} (${a.kind}) × ${variants}\n${JSON.stringify({ model: MODEL, ...settingsOf(a), prompt: promptOf(a) }, null, 2)}`);
  process.exit(0);
}
if (!process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY is not set.'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generate(a, n) {
  const body = { model: MODEL, prompt: promptOf(a), n, ...settingsOf(a) };
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API, { method: 'POST', headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return { body, json: await res.json() };
    const text = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 4) { await sleep(2000 * 2 ** attempt); continue; }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
}

let failed = 0;
for (const a of assets) {
  const dir = join(ROOT, 'out', a.id);
  if (has('force')) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const logPath = join(dir, 'log.json');
  const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : { id: a.id, variants: [] };
  const next = Math.max(0, ...readdirSync(dir).map((f) => Number(/^v(\d+)\.webp$/.exec(f)?.[1] ?? 0))) + 1;
  try {
    const { body, json } = await generate(a, variants);
    json.data.forEach((d, i) => {
      const n = next + i;
      writeFileSync(join(dir, `v${n}.webp`), Buffer.from(d.b64_json, 'base64'));
      log.variants.push({ n, brief: briefHash(a), model: MODEL, settings: settingsOf(a), prompt: body.prompt, createdAt: new Date().toISOString() });
    });
    writeFileSync(logPath, `${JSON.stringify(log, null, 2)}\n`);
    console.log(`${a.id}: v${next}–v${next + json.data.length - 1}${json.usage ? ` · ${json.usage.total_tokens} tokens` : ''}`);
  } catch (e) {
    failed++;
    console.error(`${a.id}: ${e.message}`);
    if (/HTTP 40[13]/.test(e.message)) break; // bad key or no access: no point trying the rest
  }
}
process.exit(failed ? 1 : 0);
