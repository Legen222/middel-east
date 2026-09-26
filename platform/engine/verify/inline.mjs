// Inlines the esbuild bundle into the verifier page so it ships as one self-contained file.
import { readFileSync, writeFileSync } from 'node:fs';

const tpl = readFileSync(new URL('./template.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../.cache/verify.js', import.meta.url), 'utf8').replace(/<\/script/gi, '<\\/script');
if (!tpl.includes('/*BUNDLE*/')) throw new Error('template has no /*BUNDLE*/ marker');
writeFileSync(new URL('./verify.html', import.meta.url), tpl.replace('/*BUNDLE*/', () => js));
console.log(`verify/verify.html written (${Math.round((tpl.length + js.length) / 1024)} KB)`);
