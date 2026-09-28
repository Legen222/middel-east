// Builds demo/scrapline-demo.html: one self-contained page (app + in-browser server + SQLite as asm.js).
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
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
