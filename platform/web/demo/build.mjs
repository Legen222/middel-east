// Builds demo/scrapline-demo.html: one self-contained page (app + in-browser server + SQLite as asm.js).
//   --preview  also writes demo/scrapline-demo-preview.html with the Steam item pictures inside the page (the artifact
//              viewer refuses outside images). Copies of other people's pictures: a private preview, not committed.
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

const result = await build({
  entryPoints: [here('./main.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
  alias: { 'node:crypto': here('./shims/node-crypto.ts'), 'node:sqlite': here('./shims/node-sqlite.ts') },
  external: ['fs', 'path', 'crypto'], // sql.js' Node-only branches; never executed in the browser
  define: { 'import.meta.env': '{}' },
  logLevel: 'warning',
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(here('../src/styles.css'), 'utf8');
const tpl = readFileSync(here('./template.html'), 'utf8');
const html = tpl.replace('/*CSS*/', () => css).replace('/*BUNDLE*/', () => js);
writeFileSync(here('./scrapline-demo.html'), html);
console.log(`demo/scrapline-demo.html written (${(html.length / 1024).toFixed(0)} KB)`);

if (process.argv.includes('--preview')) {
  const seed = readFileSync(here('../../server/src/item-icon-seed.ts'), 'utf8');
  const hashes = [...new Set([...seed.matchAll(/: "([\w-]{16,1000}|fp:\d{1,10})",/g)].map((m) => m[1]))];
  const cache = here('./.steam-cache/');
  mkdirSync(cache, { recursive: true });
  const pics = {};
  for (const h of hashes) {
    const fp = /^fp:(\d+)$/.exec(h);
    const webp = fp ? `${cache}fp-${fp[1]}.webp` : `${cache}${h.slice(0, 40)}-${h.length}.webp`;
    if (!existsSync(webp)) {
      const res = await fetch(fp ? `https://files.facepunch.com/rust/icons/inventory/rust/${fp[1]}_small.png` : `https://community.steamstatic.com/economy/image/${h}/128fx128f`);
      if (!res.ok) { console.warn(`picture ${h.slice(0, 12)}…: HTTP ${res.status}`); continue; }
      const png = `${cache}tmp.png`;
      writeFileSync(png, Buffer.from(await res.arrayBuffer()));
      execFileSync('convert', [png, '-resize', '128x128>', '-quality', '82', webp]);
      rmSync(png);
    }
    pics[h] = `data:image/webp;base64,${readFileSync(webp).toString('base64')}`;
  }
  const inline = `<script>window.__ITEM_IMG__=${JSON.stringify(pics)}</script>`;
  const preview = html.replace('<script>', () => `${inline}<script>`);
  writeFileSync(here('./scrapline-demo-preview.html'), preview);
  console.log(`demo/scrapline-demo-preview.html written (${(preview.length / 1024).toFixed(0)} KB, ${Object.keys(pics).length} of ${hashes.length} pictures)`);
}
