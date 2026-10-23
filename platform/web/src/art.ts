/**
 * Blueprint drawings for the game tiles, the lobby hero and the sign-up page. Plain inline SVG:
 * lines take the surrounding text colour (blueprint blue), dimension lines and labels are brass,
 * hits and traps use the win/lose colours. Classes are styled in styles.css (.art …).
 */

const W = 240;
const H = 150;
const svg = (body: string, vb = `0 0 ${W} ${H}`, label = '') =>
  `<svg class="art" viewBox="${vb}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** Horizontal dimension ⊢──label──⊣ at height y. */
const dimH = (x1: number, x2: number, y: number, label: string) =>
  `<path class="d" d="M${x1} ${y - 4}v8M${x2} ${y - 4}v8M${x1} ${y}H${x2}"/><text class="t" x="${(x1 + x2) / 2}" y="${y - 5}" text-anchor="middle">${label}</text>`;
/** Vertical dimension with a rotated label at x. */
const dimV = (x: number, y1: number, y2: number, label: string) =>
  `<path class="d" d="M${x - 4} ${y1}h8M${x - 4} ${y2}h8M${x} ${y1}V${y2}"/><text class="t" x="${x + 5}" y="${(y1 + y2) / 2}" text-anchor="middle" transform="rotate(90 ${x + 5} ${(y1 + y2) / 2})">${label}</text>`;
const tick = (x: number, y: number) => `<path class="ok" d="M${x - 3} ${y}l2.2 2.4 4.2-4.8"/>`;
const cross = (x: number, y: number) => `<path class="bad" d="M${x - 3} ${y - 3}l6 6M${x + 3} ${y - 3}l-6 6"/>`;

function tower(x: number, yBottom: number, floor: number, doorW: number, gap: number, doors: number, floors: number, picks: number[], trapAt: number) {
  const w = doors * doorW + (doors + 1) * gap;
  const top = yBottom - floors * floor;
  let s = `<path d="M${x - 6} ${top}L${x + w / 2} ${top - floor * 1.3}L${x + w + 6} ${top}Z"/><rect x="${x}" y="${top}" width="${w}" height="${floors * floor}"/>`;
  for (let f = 0; f < floors; f++) {
    const y = yBottom - (f + 1) * floor;
    if (f) s += `<path d="M${x} ${y + floor}H${x + w}" opacity=".55"/>`;
    for (let d = 0; d < doors; d++) {
      const dx = x + gap + d * (doorW + gap);
      const picked = picks[f] === d;
      const cls = picked ? (f === trapAt ? 'bad fill-bad' : 'ok fill-ok') : '';
      s += `<rect class="${cls}" x="${dx}" y="${y + floor * 0.22}" width="${doorW}" height="${floor * 0.62}" rx="1"/>`;
      if (picked) s += f === trapAt ? cross(dx + doorW / 2, y + floor * 0.53 - 0) : tick(dx + doorW / 2, y + floor * 0.53);
    }
  }
  return { s, w, top };
}

const ART: Record<string, () => string> = {
  towers: () => {
    const t = tower(82, 138, 13.5, 16, 5, 3, 8, [0, 2, 1, 1, 0], 4);
    return t.s + dimV(t.w + 96, t.top, 138, '8 rooms') + dimH(82, 82 + t.w, 147, 'p = 2/3');
  },
  raid: () => {
    let s = '';
    for (let i = 0; i < 6; i++) {
      const y = 132 - (i + 1) * 18;
      const broken = i < 2;
      s += `<rect x="58" y="${y}" width="124" height="14" rx="1" ${broken ? 'stroke-dasharray="3 3" opacity=".55"' : ''}/>`;
      for (let k = 0; k < 7; k++) s += `<path d="M${70 + k * 17 + (i % 2) * 8} ${y + 3}v8" opacity="${broken ? 0.3 : 0.45}"/>`;
    }
    s += `<circle class="brass" cx="120" cy="83" r="6"/><path class="brass" d="M120 71v-5M120 95v5M108 83h-5M132 83h5M111.5 74.5l-3.5-3.5M128.5 91.5l3.5 3.5M128.5 74.5l3.5-3.5M111.5 91.5l-3.5 3.5"/>`;
    return s + dimV(198, 24, 132, '6 layers') + `<text class="t" x="58" y="144">TWIG → TOOL CUPBOARD</text>`;
  },
  mines: () => {
    let s = '';
    const mines = [3, 11, 17];
    const safe = [0, 6, 12, 13, 22];
    for (let i = 0; i < 25; i++) {
      const x = 62 + (i % 5) * 24;
      const y = 10 + Math.floor(i / 5) * 24;
      s += `<rect x="${x}" y="${y}" width="20" height="20" rx="2" ${mines.includes(i) ? 'class="bad"' : safe.includes(i) ? 'class="ok fill-ok"' : 'opacity=".7"'}/>`;
      if (mines.includes(i)) s += `<circle class="bad" cx="${x + 10}" cy="${y + 11}" r="4"/><path class="bad" d="M${x + 10} ${y + 4}v-1.5M${x + 4} ${y + 11}h-1.5M${x + 16} ${y + 11}h1.5"/>`;
      if (safe.includes(i)) s += tick(x + 10, y + 10);
    }
    return s + dimH(62, 178, 140, '5 × 5');
  },
  dice: () => {
    const pips = [[0, 0], [-1, -1], [1, 1], [1, -1], [-1, 1]].map(([dx, dy]) => `<circle cx="${70 + dx * 15}" cy="${68 + dy * 15}" r="3.4"/>`).join('');
    return `<rect x="40" y="38" width="60" height="60" rx="9"/><path d="M48 38l8-10h60l-8 10M116 28v60l-16 10" opacity=".6"/>${pips}
      <rect x="130" y="80" width="84" height="8" rx="4"/><rect class="fill-bp" x="130" y="80" width="41.6" height="8" rx="4" stroke="none"/>
      <path class="brass" d="M158 72v24"/><text class="t" x="158" y="108" text-anchor="middle">roll 33.71</text>${dimH(130, 171.6, 66, '49.5 %')}`;
  },
  plinko: () => {
    let s = '';
    for (let r = 0; r < 7; r++) for (let k = 0; k < r + 3; k++) s += `<circle cx="${120 + (k - (r + 2) / 2) * 16}" cy="${16 + r * 15}" r="1.8" fill="currentColor" stroke="none"/>`;
    for (let b = 0; b < 10; b++) s += `<rect x="${44 + b * 15.5}" y="124" width="12" height="9" rx="1.5" ${b === 6 ? 'class="brass fill-brass"' : 'opacity=".7"'}/>`;
    s += `<path class="brass" stroke-dasharray="2.5 2.5" d="M120 8L112 23L120 38L128 53L120 68L128 83L136 98L144 113L143 124"/>`;
    return s + `<text class="t" x="121" y="146" text-anchor="middle">bucket = right bounces</text>`;
  },
  upgrader: () => {
    const r = 46, cx = 120, cy = 72, a = 0.475 * 2 * Math.PI;
    const ex = cx + r * Math.sin(a), ey = cy - r * Math.cos(a);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" opacity=".45"/><path class="ok" stroke-width="3" d="M${cx} ${cy - r}A${r} ${r} 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}"/>
      <circle cx="${cx}" cy="${cy}" r="28"/><path class="brass" d="M${cx} ${cy}L${(cx + 40 * Math.sin(2.1)).toFixed(1)} ${(cy - 40 * Math.cos(2.1)).toFixed(1)}"/>
      <text class="t big" x="${cx}" y="${cy + 4}" text-anchor="middle">×2.00</text><text class="t" x="196" y="40">47.5 %</text><path class="d" d="M168 36h26"/>`;
  },
  airdrop: () => `<path d="M78 46Q120 0 162 46"/><path d="M78 46q7 6 14 0q7 6 14 0q7 6 14 0q7 6 14 0q7 6 14 0q7 6 14 0"/>
      <path d="M80 47L110 88M100 46L114 88M140 46L126 88M160 47L130 88" opacity=".6"/>
      <rect x="106" y="88" width="28" height="22" rx="1.5"/><path d="M106 88l28 22M134 88l-28 22" opacity=".55"/>
      <path class="brass" stroke-dasharray="3 3" d="M120 112V136"/><path d="M40 138H200" opacity=".5"/>${dimV(210, 46, 138, '×4.20')}`,
  blackjack: () => `<g transform="rotate(-9 99 72)"><rect x="70" y="30" width="58" height="82" rx="6"/><text class="t card" x="78" y="46">A</text><text class="t card" x="120" y="106" text-anchor="end">♠</text></g>
      <g transform="rotate(7 141 76)"><rect class="fill-surface" x="112" y="34" width="58" height="82" rx="6"/><text class="t card" x="120" y="50">K</text><text class="t card bad-t" x="162" y="110" text-anchor="end">♥</text></g>
      ${dimH(70, 172, 140, '21 · pays 3:2')}`,
  hilo: () => `<rect x="92" y="30" width="56" height="80" rx="6"/><text class="t card" x="100" y="46">Q</text><text class="t card bad-t" x="140" y="104" text-anchor="end">♦</text>
      <path class="ok" d="M168 54l10-12 10 12M178 42v26"/><text class="t" x="178" y="80" text-anchor="middle">≥ Q</text>
      <path class="bad" d="M52 86l10 12 10-12M62 98V72"/><text class="t" x="62" y="64" text-anchor="middle">≤ Q</text>${dimH(92, 148, 132, 'skip = free')}`,
  cases: () => `<path d="M120 22L178 48L120 74L62 48Z"/><path d="M62 48V102L120 128V74M178 48V102L120 128"/>
      <path d="M91 35L149 61M62 66L120 92M178 66L120 92" opacity=".55"/><path class="brass" d="M114 98h12v14h-12z"/>${dimH(62, 178, 142, 'price = ⌈EV ÷ 0.93⌉')}`,
  battle: () => {
    const crate = (x: number) => `<path d="M${x} 46L${x + 34} 61L${x} 76L${x - 34} 61Z"/><path d="M${x - 34} 61V93L${x} 108V76M${x + 34} 61V93L${x} 108"/>`;
    return crate(66) + crate(174) + `<text class="t big" x="120" y="82" text-anchor="middle">VS</text><path class="d" stroke-dasharray="2 3" d="M104 70h-2M136 70h2"/>${dimH(32, 208, 136, 'pool → best total')}`;
  },
  crash: () => {
    let p = 'M42 128';
    for (let i = 1; i <= 30; i++) { const t = i / 30; p += `L${(42 + t * 150).toFixed(1)} ${(128 - (Math.exp(t * 2.6) - 1) / (Math.exp(2.6) - 1) * 96).toFixed(1)}`; }
    return `<path d="M42 18V128H214" opacity=".6"/><path stroke-width="1.8" d="${p}"/><path class="bad" stroke-dasharray="3 3" d="M42 32H192"/><circle class="bad" cx="192" cy="32" r="4"/>
      <text class="t" x="46" y="28">2.00×</text>${dimH(42, 192, 142, 'P(≥ x) = 0.98 ÷ x')}`;
  },
  wheel: () => {
    const cx = 120, cy = 76, r = 56, ri = 22;
    let s = `<circle cx="${cx}" cy="${cy}" r="${r}"/><circle cx="${cx}" cy="${cy}" r="${ri}"/><circle cx="${cx}" cy="${cy}" r="3" fill="currentColor"/>`;
    for (let i = 0; i < 25; i++) {
      const a = (i / 25) * 2 * Math.PI;
      s += `<path d="M${(cx + ri * Math.sin(a)).toFixed(1)} ${(cy - ri * Math.cos(a)).toFixed(1)}L${(cx + r * Math.sin(a)).toFixed(1)} ${(cy - r * Math.cos(a)).toFixed(1)}" opacity=".55"/>`;
    }
    const seg = (i: number, cls: string) => { const a1 = (i / 25) * 2 * Math.PI, a2 = ((i + 1) / 25) * 2 * Math.PI, rr = r - 6;
      return `<path class="${cls}" stroke-width="5" d="M${(cx + rr * Math.sin(a1)).toFixed(1)} ${(cy - rr * Math.cos(a1)).toFixed(1)}A${rr} ${rr} 0 0 1 ${(cx + rr * Math.sin(a2)).toFixed(1)} ${(cy - rr * Math.cos(a2)).toFixed(1)}"/>`; };
    s += seg(0, 'brass') + seg(7, 'ok') + seg(13, 'ok') + seg(19, 'bad');
    return s + `<path class="fill-text" d="M${cx} ${cy - r - 2}l-6-10h12z" fill="currentColor"/><text class="t" x="196" y="40">20 → 24×</text><text class="t" x="196" y="52">1 → 2×</text>`;
  },
  jackpot: () => {
    const r = 46, c = 2 * Math.PI * r;
    const parts: [number, string][] = [[0.46, 'bp'], [0.31, 'brass'], [0.23, 'ok']];
    let off = 0, s = '';
    for (const [k, cls] of parts) { s += `<circle class="${cls}" cx="120" cy="74" r="${r}" stroke-width="12" stroke-dasharray="${(k * c - 3).toFixed(1)} ${(c - k * c + 3).toFixed(1)}" stroke-dashoffset="${(-off * c).toFixed(1)}" transform="rotate(-90 120 74)"/>`; off += k; }
    return s + `<path d="M120 18l-6-10h12z" fill="currentColor"/><text class="t big" x="120" y="78" text-anchor="middle">Σ</text><text class="t" x="180" y="122">46 % · 31 % · 23 %</text>`;
  },
  coinflip: () => `<ellipse cx="124" cy="74" rx="42" ry="42" opacity=".45"/><ellipse class="fill-surface" cx="118" cy="72" rx="42" ry="42"/><circle cx="118" cy="72" r="31"/>
      <text class="t big" x="118" y="77" text-anchor="middle">R | S</text><path class="brass" d="M58 40a66 66 0 0 1 22-22M178 104a66 66 0 0 1-22 22"/><path class="brass" d="M80 18l-1 7-6-2M156 126l1-7 6 2"/>
      ${dimH(76, 160, 140, '50 / 50 · 4 % fee')}`,
};

export const gameArt = (id: string) => svg((ART[id] ?? ART.cases)());

/** A crate drawn to scale with its price as the dimension (case picker). */
export const caseArt = (price: number) => svg(`<path d="M120 18L182 46L120 74L58 46Z"/><path d="M58 46V104L120 132V74M182 46V104L120 132"/>
  <path d="M89 32L151 60M58 66L120 94M182 66L120 94" opacity=".55"/><path class="brass" d="M113 100h14v16h-14z"/>${dimH(58, 182, 146, `${price.toLocaleString('en-US')} Scrap`)}`);

/** The large sheet for the lobby hero and the sign-up page: a Monument Run run drawn as a technical drawing. */
export function heroSheet() {
  const t = tower(150, 268, 26, 34, 10, 3, 8, [1, 0, 2, 2, 1, 0], -1);
  const ladder = [1.455, 2.183, 3.274, 4.911, 7.366, 11.049, 16.573, 24.86];
  const marks = ladder.map((m, i) => `<text class="t" x="${150 + t.w + 18}" y="${268 - i * 26 - 9}">×${m.toFixed(2)}</text><path class="d" opacity=".5" d="M${150 + t.w + 4} ${268 - i * 26 - 13}h10"/>`).join('');
  const block = `<rect class="d" x="18" y="236" width="104" height="44"/><path class="d" d="M18 250h104M70 250v30"/>
    <text class="t" x="24" y="246">MONUMENT RUN</text><text class="t" x="24" y="264">KEYCARD</text><text class="t" x="24" y="274">BLUE</text>
    <text class="t" x="76" y="264">RTP</text><text class="t" x="76" y="274">97.00 %</text>`;
  return svg(t.s + marks + dimV(150 + t.w + 74, t.top, 268, '8 rooms · p = 2/3 per room') + dimH(150, 150 + t.w, 296, '3 doors') + block, '0 0 420 310', 'Technical drawing of a Monument Run tower');
}

export const LOGO_MARK = `<svg class="mark" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 9.5h18M9.5 9.5V21"/><circle cx="15.5" cy="15.5" r="2.6"/></svg>`;
