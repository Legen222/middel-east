import { chromium } from 'playwright-core';
const [which, outPrefix, ...shots] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1.5 });
const errors = [];
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !t.includes('CERT')) errors.push(t); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:4173/?seed=99', { waitUntil: 'load' });
await page.waitForTimeout(600);
await page.click('#btn-buy');
await page.waitForTimeout(400);
await page.click(`.buy-option[data-which="${which}"]`);
let t = 0;
for (const at of shots) {
  const ms = Number(at);
  await page.waitForTimeout(ms - t); t = ms;
  await page.screenshot({ path: `${outPrefix}-${ms}.png` });
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'clean');
await browser.close();
