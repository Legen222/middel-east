/**
 * Drawings for the crate line-up and item icons, in the same blueprint style as art.ts: plain inline SVG,
 * lines in the surrounding colour, brass for the valuable parts. Every built-in crate has its own drawing
 * (keyed by case id); crates an operator adds in the backoffice fall back to the generic crate. Item
 * icons are picked from the item name (rifle, mask, door, explosive, …), so new items need no artwork.
 */

import { caseArt } from './art';

const W = 240;
const H = 150;
const svg = (body: string, label: string) =>
  `<svg class="art" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const dimH = (x1: number, x2: number, y: number, label: string) =>
  `<path class="d" d="M${x1} ${y - 4}v8M${x2} ${y - 4}v8M${x1} ${y}H${x2}"/><text class="t" x="${(x1 + x2) / 2}" y="${y - 5}" text-anchor="middle">${label}</text>`;

/** Isometric box: top face centred on cx at y, half-width w, face depth d, height h. */
const iso = (cx: number, y: number, w: number, d: number, h: number, cls = '') =>
  `<path class="${cls}" d="M${cx} ${y}L${cx + w} ${y + d}L${cx} ${y + 2 * d}L${cx - w} ${y + d}Z"/><path class="${cls}" d="M${cx - w} ${y + d}V${y + d + h}L${cx} ${y + 2 * d + h}V${y + 2 * d}M${cx + w} ${y + d}V${y + d + h}L${cx} ${y + 2 * d + h}"/>`;

/** Upright cylinder: top ellipse at y, height h, optional ribs. */
const drum = (cx: number, y: number, rx: number, ry: number, h: number, ribs: number[] = []) =>
  `<ellipse cx="${cx}" cy="${y}" rx="${rx}" ry="${ry}"/><path d="M${cx - rx} ${y}V${y + h}M${cx + rx} ${y}V${y + h}"/><path d="M${cx - rx} ${y + h}A${rx} ${ry} 0 0 0 ${cx + rx} ${y + h}"/>`
  + ribs.map((r) => `<path opacity=".55" d="M${cx - rx} ${y + r}A${rx} ${ry} 0 0 0 ${cx + rx} ${y + r}"/>`).join('');

const CRATES: Record<string, () => string> = {
  barrel: () => drum(120, 26, 34, 9, 92, [28, 62]) + '<ellipse class="brass" cx="132" cy="25" rx="5" ry="1.6"/><path opacity=".35" d="M98 40v64M104 42v66"/>',
  'oil-barrel': () => drum(120, 24, 36, 9, 94, [14, 80])
    + '<path class="bad" stroke-width="2" d="M84 52A36 9 0 0 0 156 52M84 70A36 9 0 0 0 156 70"/><path class="brass fill-brass" d="M120 78C116 85 113 89 113 92A7 7 0 0 0 127 92C127 89 124 85 120 78Z"/>',
  'wooden-crate': () => '<rect x="68" y="36" width="96" height="84"/><path d="M68 36l16-14h96l-16 14M180 22v84l-16 14"/><path opacity=".6" d="M68 64H164M68 92H164M80 36v84M152 36v84"/><path opacity=".45" d="M80 112L152 44"/>',
  'ration-box': () => iso(120, 44, 64, 22, 36) + '<text class="t" x="80" y="104" transform="rotate(19 80 104)">RATION</text><path class="brass" d="M140 98l18-8"/>',
  'food-box': () => '<rect x="72" y="62" width="96" height="58"/><path d="M72 62l14-12h96l-14 12M182 50v58l-14 12"/>'
    + '<ellipse cx="98" cy="50" rx="11" ry="3.5"/><path d="M87 50v12M109 50v12"/><ellipse cx="128" cy="44" rx="11" ry="3.5"/><path d="M117 44v18M139 44v18"/>'
    + '<path class="brass" d="M88 84h64M88 94h44"/>',
  toolbox: () => '<path d="M60 64H180V120H60Z"/><path d="M60 64l8-10H172l8 10"/><path d="M100 54V42H140V54"/><path opacity=".55" d="M60 82H180"/>'
    + '<rect class="brass fill-brass" x="80" y="78" width="10" height="9" rx="1"/><rect class="brass fill-brass" x="150" y="78" width="10" height="9" rx="1"/>',
  'medical-crate': () => '<rect x="70" y="38" width="100" height="82" rx="3"/><path d="M70 38l12-12h100l-12 12M182 26v82l-12 12"/>'
    + '<path class="bad fill-bad" d="M113 56h14v15h15v14h-15v15h-14v-15h-15v-14h15z"/>',
  'military-crate': () => iso(120, 30, 80, 24, 50)
    + '<path class="brass" d="M70 80l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6-4.5-4 6-1z"/><path opacity=".55" d="M88 68v50M152 68v50"/><text class="t" x="138" y="96" transform="rotate(-17 138 96)">MIL-7</text>',
  'supply-drop': () => '<path d="M60 52Q120 -8 180 52"/><path opacity=".55" d="M80 46Q90 22 100 43M100 43Q120 6 140 43M140 43Q150 22 160 46"/><path d="M60 52Q66 58 72 52Q78 58 84 52"/><path d="M168 52Q174 58 180 52"/>'
    + '<path opacity=".6" d="M62 54L104 92M178 54L136 92M120 46V86"/>' + iso(120, 86, 30, 11, 26) + '<path class="bad" stroke-dasharray="2 3" d="M152 112q8-6 4-14q-4-8 4-14"/>',
  'elite-crate': () => iso(120, 18, 64, 26, 58) + '<path class="bp" stroke-width="3" d="M56 64L120 94M184 64L120 94"/>'
    + '<rect class="brass fill-brass" x="114" y="104" width="12" height="14" rx="1.5"/><text class="t" x="70" y="88" transform="rotate(25 70 88)">ELITE</text>',
  'locked-crate': () => '<rect x="56" y="62" width="128" height="58" rx="2"/><path d="M56 62l12-10h128l-12 10M196 52v58l-12 10"/><path opacity=".55" d="M56 82H184"/>'
    + '<path d="M96 52V30H144V52"/><rect x="100" y="34" width="40" height="15" class="fill-surface"/><text class="t" x="120" y="45" text-anchor="middle">15:00</text>'
    + '<rect class="brass fill-brass" x="112" y="90" width="16" height="16" rx="2"/><path class="brass" d="M120 95v6"/>',
  'bradley-crate': () => '<rect x="48" y="102" width="144" height="22" rx="11"/>'
    + [64, 86, 108, 130, 152, 174].map((x) => `<circle cx="${x}" cy="113" r="6"/>`).join('')
    + '<path d="M58 102L74 76H168L184 102"/><rect x="100" y="60" width="44" height="16" rx="2"/><path d="M144 66L206 58"/><path class="brass" d="M206 54v8"/>'
    + '<path class="brass" opacity=".8" d="M82 88h20M150 88h20"/>',
  'heli-crate': () => '<path d="M36 22H204"/><circle cx="120" cy="22" r="4" class="brass"/><path d="M120 26V36"/>' + iso(120, 38, 58, 22, 46)
    + '<text class="t" x="80" y="94" transform="rotate(21 80 94)">HELI</text><path class="brass" d="M140 100l20-8"/>',
  'oil-rig': () => '<path d="M80 128L94 58M160 128L146 58"/><path opacity=".55" d="M84 108L156 90M84 90L156 108M88 76L152 70"/><rect x="74" y="50" width="92" height="8"/>'
    + '<path d="M104 50L120 14L136 50"/><path opacity=".55" d="M110 36H130M107 44H133M113 28H127"/><path class="brass" d="M150 50V30H178M178 30v10"/>'
    + '<path class="bp" d="M36 128q10-6 20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0"/>',
  'cargo-ship': () => '<path d="M34 98H206L190 124H50Z"/><rect x="170" y="62" width="22" height="36"/><path opacity=".6" d="M174 70h14M174 78h14"/>'
    + [[52, 80, 'bp'], [80, 80, 'brass'], [108, 80, ''], [136, 80, 'bp'], [66, 62, ''], [94, 62, 'bp'], [122, 62, 'brass']]
      .map(([x, y, c]) => `<rect class="${c}" x="${x}" y="${y}" width="26" height="17"/><path class="${c}" opacity=".5" d="M${+x + 7} ${+y + 3}v11M${+x + 13} ${+y + 3}v11M${+x + 19} ${+y + 3}v11"/>`).join('')
    + '<path class="bp" opacity=".7" d="M30 130q10-5 20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0"/>',
  'underwater-lab': () => '<path class="bp" d="M30 20q10-5 20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0"/><rect x="58" y="62" width="124" height="50" rx="25"/>'
    + [90, 120, 150].map((x) => `<circle cx="${x}" cy="87" r="9"/><circle cx="${x}" cy="87" r="5" opacity=".5"/>`).join('')
    + '<path d="M80 112L72 128M160 112L168 128M120 112V128"/><circle cx="196" cy="52" r="3"/><circle cx="202" cy="38" r="2"/><circle cx="194" cy="28" r="1.5"/><path class="brass" d="M120 62V44h18"/>',
  'launch-site': () => '<path d="M120 14C131 26 133 40 133 52V104H107V52C107 40 109 26 120 14Z"/><path d="M107 88L94 106V114L107 106M133 88L146 106V114L133 106"/>'
    + '<circle cx="120" cy="56" r="6"/><path class="brass" d="M112 104l-2 12 6-5 4 10 4-10 6 5-2-12"/>'
    + '<path opacity=".6" d="M166 128V24M188 128V24M166 24H188M166 44L188 64M188 44L166 64M166 84L188 104M188 84L166 104M166 64H188M166 104H188M146 40H166"/><path d="M40 128H200" opacity=".5"/>',
  'large-present': () => iso(120, 40, 60, 24, 52) + '<path class="brass" stroke-width="3" d="M90 52L150 76M150 52L90 76M120 88V140"/>'
    + '<path class="brass" d="M120 64C108 44 92 46 98 56C102 62 112 64 120 64C128 64 138 62 142 56C148 46 132 44 120 64Z"/>',
  'missile-silo': () => '<path d="M36 112H204" /><ellipse cx="120" cy="112" rx="56" ry="10"/><ellipse cx="120" cy="112" rx="40" ry="7" opacity=".55"/>'
    + '<path d="M64 112L44 76M176 112L196 76" /><path opacity=".55" d="M44 76L80 72M196 76L160 72"/>'
    + '<path class="brass" d="M120 24C128 34 131 46 131 58V108H109V58C109 46 112 34 120 24Z"/><path class="brass" opacity=".7" d="M109 70H131M109 92H131"/>',
  'gold-egg': () => '<path class="brass fill-brass" d="M120 14C150 14 168 62 168 88C168 114 148 132 120 132C92 132 72 114 72 88C72 62 90 14 120 14Z"/>'
    + '<path class="brass" d="M76 70l11 8 11-8 11 8 11-8 11 8 11-8 11 8 11-8 6 4M73 98l11 8 11-8 11 8 11-8 11 8 11-8 11 8 11-8 11 8"/>'
    + '<circle class="brass" cx="120" cy="40" r="4"/><circle class="brass" cx="104" cy="120" r="3"/><circle class="brass" cx="136" cy="120" r="3"/>',
};

/** A crate's own drawing with its price as the dimension line; unknown ids get the generic crate. */
export function crateArt(id: string, price: number): string {
  const draw = CRATES[id];
  if (!draw) return caseArt(price);
  return svg(draw() + dimH(48, 192, 146, `${price.toLocaleString('en-US')} Scrap`), `${id.replace(/-/g, ' ')} drawing`);
}

/* ---------- item icons ---------- */

export type ItemKind = 'rifle' | 'smg' | 'pistol' | 'shotgun' | 'sniper' | 'heavy' | 'explosive' | 'mask' | 'helmet' | 'armour' | 'top' | 'legs'
  | 'gloves' | 'boots' | 'door' | 'storage' | 'resource' | 'medical' | 'tech' | 'melee' | 'set';

const KIND_RULES: [RegExp, ItemKind][] = [
  [/\b(set|collection)\b/i, 'set'],
  [/\bdoor\b/i, 'door'],
  [/storage|\bbox\b/i, 'storage'],
  [/rocket launcher|grenade launcher|\bm249\b/i, 'heavy'],
  [/bolt action|\bl96\b/i, 'sniper'],
  [/\b(ak|ak47|ak-47)\b|assault rifle|lr-300|\bm39\b|semi-automatic rifle|alien red/i, 'rifle'],
  [/thompson|\bsmg\b|mp5/i, 'smg'],
  [/revolver|pistol/i, 'pistol'],
  [/shotgun/i, 'shotgun'],
  [/explosive|satchel|\brocket\b/i, 'explosive'],
  [/facemask|\bmask\b|big grin/i, 'mask'],
  [/helmet/i, 'helmet'],
  [/chest plate|roadsign vest|press vest/i, 'armour'],
  [/gloves/i, 'gloves'],
  [/boots/i, 'boots'],
  [/trousers|pants|kilt/i, 'legs'],
  [/shirt|hoodie|jacket|suit|vest/i, 'top'],
  [/bandage|syringe|medkit/i, 'medical'],
  [/computer|camera|sight|signal|turret/i, 'tech'],
  [/knife|spear|hatchet/i, 'melee'],
];

export const itemKind = (name: string): ItemKind => KIND_RULES.find(([re]) => re.test(name))?.[1] ?? 'resource';

/** Icons on a 64 × 40 grid. */
const ICONS: Record<ItemKind, string> = {
  rifle: '<path d="M4 18H40L44 15H58V19H46L44 22H30L27 32H20L22 22H12L8 27H4Z"/><path opacity=".6" d="M28 22l-2 6M44 15V11H50"/>',
  smg: '<path d="M10 16H48V21H40L38 24H28L26 34H20L22 24H16L12 28H8L10 21Z"/><path opacity=".6" d="M48 18H56M30 24v6"/>',
  pistol: '<path d="M18 14H50V20H34L32 24H30L28 34H20L22 24L18 20Z"/><path opacity=".6" d="M30 20l2 4M36 14v-3"/>',
  shotgun: '<path d="M4 17H46V21H4ZM4 21H46V24H4Z" /><path d="M46 17L52 15H60V24H50L46 21"/><path opacity=".6" d="M22 24l-2 8"/>',
  sniper: '<path d="M2 19H44L48 16H62V20H48L46 23H32L29 32H22L24 23H2Z"/><rect x="24" y="12" width="14" height="4" rx="2"/><path opacity=".6" d="M28 16v3M34 16v3"/>',
  heavy: '<rect x="10" y="12" width="34" height="12" rx="2"/><path d="M44 15H60M44 20H60"/><path d="M20 24l-2 10H26L28 24M34 24v8"/><circle opacity=".6" cx="16" cy="18" r="3"/>',
  explosive: '<rect x="14" y="12" width="36" height="20" rx="2"/><path opacity=".6" d="M14 18H50M14 26H50"/><rect class="bad" x="26" y="15" width="12" height="7" rx="1"/><path class="brass" d="M50 14q6-6 10 0"/>',
  mask: '<path d="M20 6H44V22C44 30 38 36 32 36C26 36 20 30 20 22Z"/><path d="M24 16H30M34 16H40"/><path opacity=".6" d="M26 26Q32 31 38 26M32 6V36"/>',
  helmet: '<path d="M14 28C14 14 22 6 32 6C42 6 50 14 50 28Z"/><path d="M10 28H54V32H10Z"/><path opacity=".6" d="M32 6V28M22 12L26 28M42 12L38 28"/>',
  armour: '<path d="M18 6L26 10H38L46 6L52 14L48 34H16L12 14Z"/><path opacity=".6" d="M20 18H44M20 26H44M32 10V34"/>',
  top: '<path d="M22 6L32 10L42 6L54 14L50 22L45 19V36H19V19L14 22L10 14Z"/><path opacity=".6" d="M32 10V36"/>',
  legs: '<path d="M20 4H44L46 36H36L32 16L28 36H18Z"/><path opacity=".6" d="M20 9H44"/>',
  gloves: '<path d="M22 36V18L18 10L22 8L26 14V6H30V14V4H34V14V6H38V16L44 12L46 15L40 24V36Z"/><path opacity=".6" d="M22 30H40"/>',
  boots: '<path d="M18 4H32V24L48 28V36H14V24Z"/><path opacity=".6" d="M14 32H48M18 10H32"/>',
  door: '<rect x="20" y="3" width="24" height="34" rx="1"/><path opacity=".6" d="M24 8H40V32H24Z"/><circle class="brass" cx="38" cy="21" r="1.6"/>',
  storage: '<rect x="12" y="12" width="40" height="24" rx="1"/><path d="M12 12L18 6H58L52 12M58 6V30L52 36"/><rect class="brass" x="28" y="18" width="8" height="6" rx="1"/>',
  resource: '<path d="M14 30L22 16L32 22L40 10L50 28Z"/><path opacity=".6" d="M22 16L26 30M40 10L38 30M10 34H54"/>',
  medical: '<rect x="14" y="8" width="36" height="26" rx="3"/><path class="bad" d="M29 13h6v6h6v6h-6v6h-6v-6h-6v-6h6z"/>',
  tech: '<rect x="12" y="10" width="40" height="22" rx="2"/><path opacity=".6" d="M18 16H30M18 22H26M38 16v10M44 16v10"/><circle class="brass" cx="47" cy="27" r="2"/><path d="M22 32V36M42 32V36"/>',
  melee: '<path d="M10 32L40 8L46 6L44 12L20 38Z"/><path opacity=".6" d="M16 30L22 36M40 8L44 12"/>',
  set: '<path class="brass" d="M12 14H52V36H12Z"/><path class="brass" d="M12 14L20 6H44L52 14"/><path opacity=".6" d="M24 14V36M40 14V36M12 24H52"/><path class="brass" d="M28 6l4-3 4 3"/>',
};

const drawn = (kind: ItemKind) =>
  `<svg class="art item-art" viewBox="0 0 64 40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind] ?? ICONS.resource}</svg>`;

/* Steam market pictures by item name (sent with /config, see the server's item-icons.ts). */
let icons: Record<string, string> = {};
export const steamImg = (hash: string, size = 256) => `https://community.cloudflare.steamstatic.com/economy/image/${encodeURIComponent(hash)}/${size}fx${size}f`;
export function setItemIcons(map: Record<string, string> | undefined): void {
  icons = Object.fromEntries(Object.entries(map ?? {}).filter(([, h]) => /^[\w-]+$/.test(h)));
}
/* a picture Steam does not deliver turns back into the drawing */
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img instanceof HTMLImageElement && img.classList.contains('item-img') && img.parentNode) img.outerHTML = drawn(img.dataset.kind as ItemKind);
}, true);

/**
 * An item's picture: the Steam market icon when the item has one, otherwise a drawing tinted with --rc (rarity
 * colour) by CSS. `lazy` for long lists such as the odds tables.
 */
export const itemArt = (name: string, lazy = false) => {
  const hash = icons[name];
  return hash
    ? `<img class="art item-art item-img" src="${steamImg(hash)}" alt="" decoding="async" referrerpolicy="no-referrer"${lazy ? ' loading="lazy"' : ''} data-kind="${itemKind(name)}">`
    : drawn(itemKind(name));
};
