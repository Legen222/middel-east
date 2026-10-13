// Renders the concept screens to PNG: node render.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const { chromium } = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright');
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svg, SYMBOLS } from './symbols.js';

const here = dirname(fileURLToPath(import.meta.url));
const font = `<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Cinzel+Decorative:wght@900&display=block" rel="stylesheet">`;

// Simple carved glyph marks (drawn, so no hieroglyph font is needed)
const GLYPHS = [
  '<path d="M4 14 Q16 4 28 14 Q16 22 4 14Z M16 22 L14 30 M22 20 Q26 28 30 26" />', // eye
  '<path d="M16 2 C8 2 8 14 16 16 C24 14 24 2 16 2Z M6 18 H26 M16 16 V32" />',      // ankh
  '<path d="M2 10 L8 4 L14 10 L20 4 L26 10 L32 4 M2 20 L8 14 L14 20 L20 14 L26 20 L32 14" />', // water
  '<path d="M8 30 V18 Q8 6 18 6 Q26 8 24 14 L18 16 L26 30 M14 12 h1" />',            // bird
  '<circle cx="16" cy="16" r="9" /><circle cx="16" cy="16" r="2" />',                  // sun
  '<path d="M4 30 H28 M8 30 V12 H24 V30 M12 12 V4 H20 V12" />',                         // shrine
  '<path d="M6 28 Q16 2 26 28 M10 20 H22" />',                                          // reed
  '<path d="M4 16 Q10 6 16 16 T28 16 M16 16 V30" />',                                   // lotus
];
const hieroColumn = (seed) =>
  Array.from({ length: 11 }, (_, i) =>
    `<svg viewBox="0 0 32 32" width="40" height="40" fill="none" stroke="#3b1d08" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[(seed * 3 + i * 5) % GLYPHS.length]}</svg>`).join('');

const background = `
  <div class="bg">
    <div class="sunbeam"></div>
    ${[0, 1, 2, 3].map((i) => `<div class="pillar p${i}"><div class="hiero">${hieroColumn(i + 1)}</div></div>`).join('')}
    <div class="floor"></div>
    ${Array.from({ length: 70 }, (_, i) => {
      const x = (i * 137.5) % 100, y = (i * 61.3) % 100, s = 1 + (i % 3);
      return `<i class="dust" style="left:${x}%;top:${y}%;width:${s}px;height:${s}px;opacity:${0.25 + (i % 5) / 8}"></i>`;
    }).join('')}
  </div>`;

const css = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1600px;height:900px;overflow:hidden;background:#120804;font-family:Cinzel,Georgia,serif;color:#f6e3a8}
  .bg{position:absolute;inset:0;background:
      radial-gradient(ellipse 60% 70% at 50% 40%,#5c3214 0%,#2a1408 55%,#0c0503 100%)}
  .sunbeam{position:absolute;left:50%;top:-10%;width:900px;height:900px;transform:translateX(-50%);
      background:conic-gradient(from 180deg at 50% 0%,transparent 0 160deg,rgba(255,200,100,.18) 170deg,transparent 175deg,
      rgba(255,210,120,.14) 182deg,transparent 190deg,rgba(255,200,100,.12) 197deg,transparent 205deg 360deg)}
  .pillar{position:absolute;top:0;bottom:120px;width:150px;
      background:linear-gradient(90deg,#3d2210,#8a5a2b 30%,#b98445 50%,#7a4d22 70%,#2e1909);
      box-shadow:0 0 60px #000 inset, 0 0 40px rgba(0,0,0,.8)}
  .pillar::before,.pillar::after{content:"";position:absolute;left:-14px;right:-14px;height:34px;
      background:linear-gradient(#e9b956,#8a5a1c);border-radius:4px}
  .pillar::before{top:0}.pillar::after{bottom:0}
  .p0{left:-30px}.p1{left:140px;transform:scale(.85);opacity:.7}.p2{right:140px;transform:scale(.85);opacity:.7}.p3{right:-30px}
  .hiero{position:absolute;inset:56px 0;display:flex;flex-direction:column;align-items:center;gap:14px;
      filter:drop-shadow(0 1px 0 rgba(255,220,150,.4))}
  .floor{position:absolute;left:0;right:0;bottom:0;height:160px;background:linear-gradient(#3a200c,#120804)}
  .dust{position:absolute;border-radius:50%;background:#ffd98a;box-shadow:0 0 6px #ffb84a}
  .torch{position:absolute;top:240px;width:120px;height:120px;border-radius:50%;
      background:radial-gradient(circle,#fff3c0 0,#ffb030 25%,rgba(255,120,0,.25) 55%,transparent 70%)}
`;

const logo = `
  <div class="logo">
    <div class="sub">✦ Legend of the ✦</div>
    <div class="main">SUN&nbsp;TOME</div>
  </div>`;
const logoCss = `
  .logo{position:absolute;top:22px;left:0;right:0;text-align:center;z-index:5}
  .logo .sub{font-size:22px;letter-spacing:10px;color:#9ffcff;text-shadow:0 0 12px #2ee6ff}
  .logo .main{font-family:"Cinzel Decorative",Cinzel,Georgia,serif;font-weight:900;font-size:78px;line-height:1;letter-spacing:6px;
      background:linear-gradient(#fff6cc 0%,#f2c94c 40%,#b07818 70%,#ffe08a 100%);-webkit-background-clip:text;color:transparent;
      filter:drop-shadow(0 4px 0 #4a2c05) drop-shadow(0 0 18px rgba(255,190,60,.55))}
`;

// 5x3 reel window
const grid = [
  ['K', 'mask', 'A', 'J', 'book'],
  ['book', 'scarab', 'book', 'T', 'Q'],
  ['Q', 'A', 'pyramid', 'ankh', 'K'],
];
const reels = (highlight) => `
  <div class="frame">
    ${[0, 1, 2, 3, 4].map((c) => `<div class="reel">${grid.map((row, r) => {
      const id = row[c];
      const lit = highlight && id === 'book';
      return `<div class="cell ${lit ? 'lit' : ''}">${svg(id, 150)}</div>`;
    }).join('')}</div>`).join('')}
  </div>`;
const reelCss = `
  .frame{position:absolute;left:50%;top:150px;transform:translateX(-50%);display:flex;gap:10px;padding:18px;
      background:linear-gradient(#1a0d05ee,#0b0502ee);border-radius:14px;z-index:4;
      border:8px solid transparent;
      background-clip:padding-box;box-shadow:0 0 0 8px #c08a1e,0 0 0 11px #5a3a06,0 0 0 14px #f2c94c,0 30px 80px #000,0 0 120px rgba(255,170,40,.25)}
  .reel{display:flex;flex-direction:column;gap:8px;background:linear-gradient(90deg,#0004,#ffffff08 50%,#0004);border-radius:8px;padding:4px}
  .cell{width:170px;height:170px;display:grid;place-items:center;border-radius:10px;background:radial-gradient(circle,#3a1f0c 0,#140904 75%)}
  .cell.lit{background:radial-gradient(circle,#0f6b70 0,#08262a 70%);box-shadow:0 0 0 3px #9ffcff,0 0 30px #2ee6ff,inset 0 0 30px #2ee6ff88}
`;

const hud = (msg) => `
  <div class="hud">
    <div class="box"><span>Credit</span><b>1.250,00 €</b></div>
    <div class="box"><span>Bet</span><b>1,00 €</b></div>
    <div class="msg">${msg}</div>
    <div class="box"><span>Win</span><b>0,00 €</b></div>
    <div class="spin">⟳</div>
  </div>`;
const hudCss = `
  .hud{position:absolute;left:0;right:0;bottom:0;height:110px;display:flex;align-items:center;justify-content:center;gap:26px;z-index:6;
      background:linear-gradient(#2a1608,#0b0502);border-top:4px solid #c08a1e}
  .box{min-width:190px;padding:10px 20px;border-radius:10px;background:#0006;border:2px solid #6b4508;text-align:center}
  .box span{display:block;font-size:14px;letter-spacing:3px;text-transform:uppercase;color:#c9a35a}
  .box b{font-size:28px;color:#fff1c2}
  .msg{width:420px;text-align:center;font-size:24px;color:#9ffcff;text-shadow:0 0 10px #2ee6ff}
  .spin{width:92px;height:92px;border-radius:50%;display:grid;place-items:center;font-size:54px;color:#3a2404;
      background:radial-gradient(circle at 35% 30%,#fff6cc,#f2c94c 40%,#a86e12 80%);box-shadow:0 0 0 5px #5a3a06,0 0 30px rgba(255,190,60,.7)}
`;

const page = (body, extraCss = '') =>
  `<!doctype html><html><head><meta charset="utf-8">${font}<style>${css}${logoCss}${reelCss}${hudCss}${extraCss}</style></head><body>${body}</body></html>`;

const pages = {
  '01-main-screen': page(`${background}<div class="torch" style="left:300px"></div><div class="torch" style="right:300px"></div>${logo}${reels(false)}${hud('Place your bet')}`),

  '02-book-feature': page(`${background}${logo}${reels(true)}
    <div class="veil"></div>
    <div class="banner"><div class="big">${svg('book', 230)}</div>
      <div class="t1">3 × TOME</div><div class="t2">10 FREE GAMES</div></div>
    ${hud('Feature triggered!')}`, `
    .veil{position:absolute;inset:0;z-index:7;background:radial-gradient(circle at 50% 48%,rgba(46,230,255,.35),rgba(0,0,0,.75) 60%)}
    .banner{position:absolute;left:50%;top:170px;transform:translateX(-50%);z-index:8;text-align:center;width:820px;padding:20px 40px 34px;
        border-radius:22px;background:radial-gradient(circle at 50% 30%,#0f4d55f2,#06181bf5 75%);
        box-shadow:0 0 0 5px #c08a1e,0 0 0 8px #5a3a06,0 0 0 11px #f2c94c,0 0 90px rgba(46,230,255,.6)}
    .banner .big{filter:drop-shadow(0 0 40px #2ee6ff)}
    .t1{font-size:44px;letter-spacing:8px;color:#9ffcff;text-shadow:0 0 18px #2ee6ff}
    .t2{font-family:"Cinzel Decorative",Cinzel,serif;font-weight:900;font-size:96px;line-height:1.05;
        background:linear-gradient(#fff6cc,#f2c94c 45%,#a86e12);-webkit-background-clip:text;color:transparent;
        filter:drop-shadow(0 5px 0 #4a2c05) drop-shadow(0 0 24px rgba(255,190,60,.7))}`),

  '03-symbol-sheet': `<!doctype html><html><head><meta charset="utf-8">${font}<style>
    *{margin:0;box-sizing:border-box}body{width:1600px;height:900px;background:radial-gradient(circle at 50% 30%,#3a1f0c,#0c0503 75%);
    font-family:Cinzel,Georgia,serif;color:#f6e3a8;padding:40px 60px}
    h1{text-align:center;font-size:40px;letter-spacing:6px;margin-bottom:30px;color:#f2c94c}
    .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:28px}
    .s{text-align:center}.s svg{display:block;margin:0 auto 8px}
    .s b{display:block;font-size:20px}.s span{font-size:15px;color:#c9a35a}
    </style></head><body><h1>SYMBOL SET · Konzept</h1><div class="grid">
    ${[
      ['book', 'Tome', 'Wild + Scatter'], ['mask', 'Pharaoh Mask', 'Premium · 5× = 500×'],
      ['scarab', 'Sun Scarab', 'Premium · 5× = 200×'], ['ankh', 'Golden Ankh', 'Premium · 5× = 150×'],
      ['pyramid', 'Sun Pyramid', 'Mid · 5× = 75×'],
      ['A', 'Ace', 'Low · 5× = 15×'], ['K', 'King', 'Low · 5× = 15×'], ['Q', 'Queen', 'Low · 5× = 10×'],
      ['J', 'Jack', 'Low · 5× = 10×'], ['T', 'Ten', 'Low · 5× = 10×'],
    ].map(([id, n, d]) => `<div class="s">${svg(id, 220)}<b>${n}</b><span>${d}</span></div>`).join('')}
    </div></body></html>`,
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const tab = await browser.newPage({ viewport: { width: 1600, height: 900 } });
for (const [name, html] of Object.entries(pages)) {
  const file = join(here, `${name}.html`);
  writeFileSync(file, html);
  await tab.goto('file://' + file, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
  await tab.waitForTimeout(400);
  await tab.screenshot({ path: join(here, `${name}.png`) });
  console.log('rendered', name);
}
await browser.close();
console.log(Object.keys(SYMBOLS).length, 'symbols');
