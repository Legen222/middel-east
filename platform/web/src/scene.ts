/**
 * Full-page backdrop for wide screens: a scrapyard at night (crane, stacked containers, barrels, a fence and an
 * oil rig with a gas flare on the horizon), in three silhouette layers with cyan and violet haze. Our own drawing,
 * pure SVG, generated once; it sits behind everything and never takes pointer events.
 */

const W = 1600;
const H = 900;

/** Deterministic noise so the skyline looks the same on every load. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function skyline(y: number, x0: number, x1: number, fill: string, seed: number): string {
  const r = rng(seed);
  let d = `M${x0} ${H}`;
  for (let x = x0; x < x1;) {
    const w = 26 + r() * 70;
    const h = 30 + r() * 120;
    d += `V${y - h}H${x + w}`;
    x += w;
  }
  return `<path d="${d}V${H}Z" fill="${fill}"/>`;
}

function windows(y: number, x0: number, x1: number, seed: number): string {
  const r = rng(seed);
  let s = '';
  for (let i = 0; i < 26; i++) {
    const x = x0 + r() * (x1 - x0);
    const yy = y - 20 - r() * 110;
    s += `<rect x="${x.toFixed(0)}" y="${yy.toFixed(0)}" width="3" height="4" fill="${r() > 0.7 ? '#D9B467' : '#3DDCFF'}" opacity="${(0.25 + r() * 0.45).toFixed(2)}"/>`;
  }
  return s;
}

function crane(x: number, ground: number, fill: string): string {
  const top = ground - 520;
  let lattice = '';
  for (let y = ground; y > top + 20; y -= 34) lattice += `M${x} ${y}L${x + 30} ${y - 34}M${x + 30} ${y}L${x} ${y - 34}`;
  let jib = '';
  for (let i = 0; i < 14; i++) jib += `M${x - 120 + i * 34} ${top + 18}L${x - 103 + i * 34} ${top}L${x - 86 + i * 34} ${top + 18}`;
  return `<g fill="none" stroke="${fill}" stroke-width="3">
    <path d="M${x} ${ground}V${top}M${x + 30} ${ground}V${top}${lattice}" />
    <path d="M${x - 120} ${top}H${x + 360}M${x - 120} ${top + 18}H${x + 360}${jib}" />
    <path d="M${x + 15} ${top - 60}L${x - 120} ${top}M${x + 15} ${top - 60}L${x + 360} ${top}M${x + 15} ${top - 60}V${top}" stroke-width="2"/>
    <path d="M${x + 250} ${top + 18}V${top + 230}" stroke-width="1.5"/>
  </g>
  <rect x="${x + 236}" y="${top + 230}" width="28" height="16" fill="${fill}"/>
  <rect x="${x - 150}" y="${top - 6}" width="44" height="34" fill="${fill}"/>
  <circle cx="${x + 15}" cy="${top - 62}" r="3" fill="#FF5C6C" class="blink"/>`;
}

function containers(x: number, ground: number, fill: string, edge: string): string {
  const stack = [[0, 0, 210], [210, 0, 170], [40, 1, 230], [0, 2, 150], [150, 2, 120]];
  let s = '';
  for (const [dx, row, w] of stack) {
    const y = ground - (row + 1) * 62;
    s += `<rect x="${x + dx}" y="${y}" width="${w}" height="60" fill="${fill}" stroke="${edge}" stroke-width="1.5"/>`;
    for (let rx = x + dx + 10; rx < x + dx + w - 6; rx += 9) s += `<path d="M${rx} ${y + 5}V${y + 55}" stroke="${edge}" stroke-width="1" opacity=".7"/>`;
  }
  return s;
}

function barrels(x: number, ground: number, fill: string, edge: string): string {
  const spots = [[0, 0], [38, 0], [76, 0], [19, 1], [57, 1], [190, 0], [228, 0], [209, 1]];
  return spots.map(([dx, row]) => {
    const bx = x + dx, by = ground - (row + 1) * 52;
    return `<rect x="${bx}" y="${by}" width="34" height="50" rx="4" fill="${fill}" stroke="${edge}" stroke-width="1.5"/><path d="M${bx} ${by + 16}h34M${bx} ${by + 34}h34" stroke="${edge}" stroke-width="1.2"/>`;
  }).join('');
}

function rig(x: number, ground: number, fill: string): string {
  const deck = ground - 150;
  let legs = '';
  for (let i = 0; i < 4; i++) legs += `M${x + i * 60} ${ground}V${deck}`;
  for (let y = ground; y > deck; y -= 30) legs += `M${x} ${y}L${x + 180} ${y - 30}M${x + 180} ${y}L${x} ${y - 30}`;
  let derrick = '';
  for (let y = deck; y > deck - 210; y -= 30) {
    const w = 40 - ((deck - y) / 210) * 30;
    derrick += `M${x + 110 - w} ${y}L${x + 110 + w} ${y - 30}M${x + 110 + w} ${y}L${x + 110 - w} ${y - 30}`;
  }
  return `<g stroke="${fill}" fill="none" stroke-width="3"><path d="${legs}"/><path d="M${x + 70} ${deck}L${x + 100} ${deck - 210}M${x + 150} ${deck}L${x + 120} ${deck - 210}${derrick}" stroke-width="2"/>
    <path d="M${x + 200} ${deck}L${x + 290} ${deck - 120}" stroke-width="4"/></g>
    <rect x="${x - 20}" y="${deck - 26}" width="230" height="26" fill="${fill}"/><rect x="${x + 10}" y="${deck - 60}" width="70" height="34" fill="${fill}"/>
    <circle cx="${x + 290}" cy="${deck - 128}" r="16" fill="url(#flare)" class="flare"/>
    <circle cx="${x + 110}" cy="${deck - 214}" r="3" fill="#FF5C6C" class="blink"/>
    ${[0, 1, 2, 3].map((i) => `<rect x="${x + 16 + i * 14}" y="${deck - 50}" width="5" height="5" fill="#3DDCFF" opacity=".5"/>`).join('')}`;
}

function fence(ground: number, fill: string): string {
  let posts = '', wire = '';
  for (let x = 0; x <= W; x += 46) posts += `M${x} ${ground}V${ground - 70}`;
  for (const y of [ground - 66, ground - 46, ground - 26]) wire += `M0 ${y}H${W}`;
  return `<path d="${posts}" stroke="${fill}" stroke-width="4"/><path d="${wire}" stroke="${fill}" stroke-width="1.2" opacity=".85"/>`;
}

function heap(x: number, ground: number, w: number, h: number, fill: string, seed: number): string {
  const r = rng(seed);
  let d = `M${x} ${ground}`;
  for (let i = 1; i <= 10; i++) {
    const px = x + (w * i) / 10;
    const peak = Math.sin((Math.PI * i) / 10) * h;
    d += `L${px - w / 20} ${ground - peak - r() * 26}L${px} ${ground - peak + r() * 10}`;
  }
  return `<path d="${d}L${x + w} ${ground}Z" fill="${fill}"/>`;
}

let cached = '';
export function sceneArt(): string {
  if (cached) return cached;
  const far = '#121922', mid = '#0D1218', midEdge = '#18212B', near = '#080B0F';
  cached = `<svg class="scene-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#06080B"/><stop offset=".62" stop-color="#0C1117"/><stop offset="1" stop-color="#121820"/></linearGradient>
      <radialGradient id="hazeC" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#3DDCFF" stop-opacity=".16"/><stop offset="1" stop-color="#3DDCFF" stop-opacity="0"/></radialGradient>
      <radialGradient id="hazeV" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#9B7BFF" stop-opacity=".16"/><stop offset="1" stop-color="#9B7BFF" stop-opacity="0"/></radialGradient>
      <radialGradient id="hazeB" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#D9B467" stop-opacity=".12"/><stop offset="1" stop-color="#D9B467" stop-opacity="0"/></radialGradient>
      <radialGradient id="flare" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE7A8"/><stop offset=".4" stop-color="#F0A23C" stop-opacity=".8"/><stop offset="1" stop-color="#F0A23C" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <ellipse cx="800" cy="790" rx="760" ry="230" fill="url(#hazeC)"/>
    <ellipse cx="1330" cy="610" rx="380" ry="280" fill="url(#hazeV)"/>
    <ellipse cx="250" cy="700" rx="320" ry="220" fill="url(#hazeB)"/>
    ${skyline(760, 0, W, far, 7)}${windows(760, 0, W, 11)}
    ${rig(1180, 760, far)}
    ${crane(250, 830, mid)}
    ${containers(40, 830, mid, midEdge)}
    ${barrels(1240, 830, mid, midEdge)}
    ${heap(560, 840, 420, 60, mid, 3)}
    <rect y="830" width="${W}" height="${H - 830}" fill="${near}"/>
    ${fence(842, near)}
    ${heap(-40, 900, 520, 70, near, 5)}${heap(1120, 900, 560, 80, near, 9)}
  </svg>`;
  return cached;
}
