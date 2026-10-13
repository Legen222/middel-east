// Egyptian "book" slot concept – hand-authored SVG symbols (own designs, no third-party IP).
// Each symbol is a 200x200 SVG body; shared gradients live in DEFS.

export const DEFS = `
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#fff4c2"/><stop offset=".35" stop-color="#f2c94c"/>
  <stop offset=".7" stop-color="#c08a1e"/><stop offset="1" stop-color="#6b4508"/>
</linearGradient>
<linearGradient id="goldH" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#fff8d8"/><stop offset=".5" stop-color="#e2ad35"/>
  <stop offset="1" stop-color="#7a4f0a"/>
</linearGradient>
<linearGradient id="lapis" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#5b8cff"/><stop offset=".5" stop-color="#1f3fa8"/>
  <stop offset="1" stop-color="#0b1a52"/>
</linearGradient>
<linearGradient id="emerald" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#9dffcf"/><stop offset=".45" stop-color="#1fb57a"/>
  <stop offset="1" stop-color="#05462c"/>
</linearGradient>
<linearGradient id="ruby" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#ffb3b3"/><stop offset=".45" stop-color="#e0263a"/>
  <stop offset="1" stop-color="#5c0610"/>
</linearGradient>
<linearGradient id="turq" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#c9fff6"/><stop offset=".5" stop-color="#2ec4b6"/>
  <stop offset="1" stop-color="#0b5a55"/>
</linearGradient>
<linearGradient id="leather" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#8c2a1c"/><stop offset="1" stop-color="#3a0d07"/>
</linearGradient>
<linearGradient id="sand" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffe0a3"/><stop offset="1" stop-color="#b9772f"/>
</linearGradient>
<radialGradient id="glowT" cx=".5" cy=".5" r=".5">
  <stop offset="0" stop-color="#9ffcff" stop-opacity=".95"/>
  <stop offset=".4" stop-color="#2ee6ff" stop-opacity=".45"/>
  <stop offset="1" stop-color="#2ee6ff" stop-opacity="0"/>
</radialGradient>
<radialGradient id="glowG" cx=".5" cy=".5" r=".5">
  <stop offset="0" stop-color="#fff2b0" stop-opacity=".9"/>
  <stop offset=".45" stop-color="#ffb52e" stop-opacity=".35"/>
  <stop offset="1" stop-color="#ff9a00" stop-opacity="0"/>
</radialGradient>
<radialGradient id="sun" cx=".5" cy=".45" r=".55">
  <stop offset="0" stop-color="#fffbe6"/><stop offset=".35" stop-color="#ffd25a"/>
  <stop offset="1" stop-color="#d4580f"/>
</radialGradient>
<filter id="drop" x="-20%" y="-20%" width="140%" height="140%">
  <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity=".6"/>
</filter>
<filter id="bloom" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur stdDeviation="6"/>
</filter>
`;

const gem = (cx, cy, r, fill) => `
  <circle cx="${cx}" cy="${cy}" r="${r + 2.5}" fill="url(#gold)" stroke="#4a2f05" stroke-width="1.5"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${fill})"/>
  <ellipse cx="${cx - r * 0.35}" cy="${cy - r * 0.4}" rx="${r * 0.35}" ry="${r * 0.22}" fill="#fff" opacity=".75"/>`;

// Eye of Horus path, centred at 0,0, ~80 wide
const EYE = `
  <path d="M-38 0 Q-10 -24 30 -6 Q36 -3 40 0 Q10 14 -20 10 Q-32 8 -38 0Z" fill="#0d0d0d"/>
  <path d="M-30 0 Q-8 -16 26 -4 Q4 8 -18 6 Q-26 5 -30 0Z" fill="#f6efd6"/>
  <circle cx="0" cy="-2" r="8" fill="#0d0d0d"/>
  <circle cx="-2.5" cy="-4.5" r="2.4" fill="#fff"/>
  <path d="M-40 -16 Q-6 -36 40 -16" fill="none" stroke="#0d0d0d" stroke-width="6" stroke-linecap="round"/>
  <path d="M-6 10 L-10 32 Q-8 40 -2 36" fill="none" stroke="#0d0d0d" stroke-width="5" stroke-linecap="round"/>
  <path d="M8 10 Q20 26 34 26 Q42 24 40 16" fill="none" stroke="#0d0d0d" stroke-width="5" stroke-linecap="round"/>`;

export const SYMBOLS = {
  book: `
  <circle cx="100" cy="100" r="98" fill="url(#glowT)"/>
  <g filter="url(#drop)">
    <!-- back cover / page block -->
    <path d="M38 52 L162 52 L166 160 L34 160Z" fill="#3a0d07"/>
    <path d="M42 150 L158 150 L160 166 L40 166Z" fill="#f3e2b4" stroke="#9c7a3a" stroke-width="1"/>
    <path d="M44 156 H156 M44 161 H156" stroke="#c9ad6e" stroke-width="1"/>
    <!-- front cover -->
    <rect x="34" y="40" width="132" height="116" rx="8" fill="url(#leather)" stroke="url(#gold)" stroke-width="5"/>
    <rect x="46" y="52" width="108" height="92" rx="4" fill="none" stroke="url(#gold)" stroke-width="2.5"/>
    <!-- corner caps -->
    <path d="M34 40 h24 l-24 24Z M166 40 h-24 l24 24Z M34 156 h24 l-24 -24Z M166 156 h-24 l24 -24Z" fill="url(#goldH)"/>
    <!-- spine -->
    <rect x="28" y="38" width="12" height="120" rx="4" fill="url(#gold)"/>
    <path d="M28 62 h12 M28 100 h12 M28 136 h12" stroke="#5a3a06" stroke-width="2"/>
    <!-- eye medallion -->
    <circle cx="103" cy="98" r="36" fill="url(#gold)" stroke="#5a3a06" stroke-width="2"/>
    <circle cx="103" cy="98" r="29" fill="url(#turq)"/>
    <g transform="translate(103 96) scale(.62)">${EYE}</g>
    ${gem(103, 56, 5, 'ruby')}${gem(103, 140, 5, 'ruby')}${gem(60, 98, 4, 'lapis')}${gem(146, 98, 4, 'lapis')}
  </g>
  <!-- magic light leaking out -->
  <path d="M40 160 Q100 178 160 160" stroke="#9ffcff" stroke-width="3" fill="none" opacity=".8" filter="url(#bloom)"/>`,

  mask: `
  <circle cx="100" cy="104" r="96" fill="url(#glowG)" opacity=".7"/>
  <g filter="url(#drop)">
    <!-- nemes headdress -->
    <path d="M100 18 C58 18 40 52 36 92 L22 176 L72 176 L74 120 L126 120 L128 176 L178 176 L164 92 C160 52 142 18 100 18Z" fill="url(#gold)"/>
    <path d="M44 70 L30 172 M54 64 L44 172 M146 64 L156 172 M156 70 L170 172" stroke="url(#lapis)" stroke-width="7"/>
    <path d="M62 30 Q100 12 138 30" stroke="url(#lapis)" stroke-width="7" fill="none"/>
    <path d="M56 44 Q100 26 144 44" stroke="url(#lapis)" stroke-width="7" fill="none"/>
    <!-- face -->
    <path d="M66 60 Q66 44 100 42 Q134 44 134 60 L132 112 Q126 140 100 146 Q74 140 68 112Z" fill="url(#goldH)" stroke="#6b4508" stroke-width="2"/>
    <!-- brows + eyes -->
    <path d="M72 74 Q84 66 96 74 M104 74 Q116 66 128 74" stroke="#10206a" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M72 86 Q84 78 96 86 Q84 92 72 86Z M104 86 Q116 78 128 86 Q116 92 104 86Z" fill="#fff"/>
    <circle cx="84" cy="85.5" r="4" fill="#111"/><circle cx="116" cy="85.5" r="4" fill="#111"/>
    <path d="M70 86 L64 88 M130 86 L136 88" stroke="#10206a" stroke-width="3" stroke-linecap="round"/>
    <!-- nose + mouth -->
    <path d="M100 88 L96 112 Q100 116 104 112Z" fill="#c08a1e"/>
    <path d="M88 124 Q100 130 112 124 Q100 120 88 124Z" fill="#9c4a1a"/>
    <!-- beard -->
    <path d="M92 144 L108 144 L106 176 Q100 182 94 176Z" fill="url(#lapis)" stroke="url(#gold)" stroke-width="2.5"/>
    <path d="M94 152 h12 M94 160 h12 M95 168 h10" stroke="url(#gold)" stroke-width="2"/>
    <!-- uraeus cobra -->
    <path d="M100 22 Q92 30 96 40 Q100 46 104 40 Q108 30 100 22Z" fill="url(#gold)" stroke="#6b4508" stroke-width="1.5"/>
    ${gem(100, 34, 3, 'ruby')}
  </g>`,

  scarab: `
  <circle cx="100" cy="100" r="96" fill="url(#glowG)" opacity=".55"/>
  <g filter="url(#drop)">
    <!-- wings -->
    <path d="M86 92 C60 70 28 66 8 78 C24 82 18 90 30 96 C22 102 30 108 42 108 C38 116 52 120 62 116 C66 124 80 120 86 110Z" fill="url(#turq)" stroke="url(#gold)" stroke-width="3"/>
    <path d="M114 92 C140 70 172 66 192 78 C176 82 182 90 170 96 C178 102 170 108 158 108 C162 116 148 120 138 116 C134 124 120 120 114 110Z" fill="url(#turq)" stroke="url(#gold)" stroke-width="3"/>
    <path d="M30 86 Q60 86 84 98 M38 100 Q62 98 84 104 M60 110 Q72 108 84 108" stroke="url(#gold)" stroke-width="2" fill="none"/>
    <path d="M170 86 Q140 86 116 98 M162 100 Q138 98 116 104 M140 110 Q128 108 116 108" stroke="url(#gold)" stroke-width="2" fill="none"/>
    <!-- legs -->
    <path d="M78 120 L58 140 L52 156 M122 120 L142 140 L148 156 M80 136 L64 168 M120 136 L136 168" stroke="url(#gold)" stroke-width="5" stroke-linecap="round" fill="none"/>
    <!-- sun disc held -->
    <circle cx="100" cy="36" r="20" fill="url(#sun)" stroke="url(#gold)" stroke-width="3"/>
    <!-- head + body -->
    <path d="M84 62 Q100 48 116 62 L114 72 L86 72Z" fill="url(#gold)" stroke="#4a2f05" stroke-width="1.5"/>
    <ellipse cx="100" cy="112" rx="28" ry="42" fill="url(#emerald)" stroke="url(#gold)" stroke-width="4"/>
    <path d="M100 78 V152" stroke="url(#gold)" stroke-width="3"/>
    <path d="M74 92 Q100 84 126 92" stroke="url(#gold)" stroke-width="3" fill="none"/>
    <ellipse cx="88" cy="104" rx="5" ry="14" fill="#fff" opacity=".35"/>
  </g>`,

  ankh: `
  <circle cx="100" cy="100" r="96" fill="url(#glowG)" opacity=".5"/>
  <g filter="url(#drop)">
    <path d="M100 14 C70 14 62 44 70 64 C76 78 86 86 92 92 L40 92 Q32 92 32 100 L32 108 Q32 116 40 116 L88 116 L84 182 Q84 190 92 190 L108 190 Q116 190 116 182 L112 116 L160 116 Q168 116 168 108 L168 100 Q168 92 160 92 L108 92 C114 86 124 78 130 64 C138 44 130 14 100 14Z M100 34 C114 34 116 50 110 62 C106 70 102 76 100 80 C98 76 94 70 90 62 C84 50 86 34 100 34Z" fill="url(#gold)" fill-rule="evenodd" stroke="#5a3a06" stroke-width="2"/>
    <path d="M100 98 V186" stroke="#fff6cf" stroke-width="2" opacity=".5"/>
    ${gem(100, 104, 8, 'lapis')}${gem(48, 104, 4, 'turq')}${gem(152, 104, 4, 'turq')}${gem(100, 172, 4, 'ruby')}
  </g>`,

  pyramid: `
  <circle cx="100" cy="70" r="70" fill="url(#glowG)"/>
  <g filter="url(#drop)">
    <circle cx="100" cy="58" r="30" fill="url(#sun)"/>
    <path d="M100 52 L22 176 L178 176Z" fill="url(#sand)" stroke="#6b3d10" stroke-width="2"/>
    <path d="M100 52 L22 176 L100 176Z" fill="#000" opacity=".22"/>
    <path d="M86 74 L114 74 M74 94 L126 94 M62 114 L138 114 M50 134 L150 134 M38 154 L162 154" stroke="#7a4a18" stroke-width="2" opacity=".55"/>
    <path d="M100 52 L88 71 L112 71Z" fill="url(#gold)"/>
    <path d="M88 176 V156 Q100 144 112 156 V176Z" fill="#2a1406"/>
    <path d="M14 178 H186" stroke="url(#gold)" stroke-width="5" stroke-linecap="round"/>
  </g>`,
};

// Royals A K Q J 10 – carved gold letters on coloured stone plates
const royal = (txt, stone, size = 104) => `
  <g filter="url(#drop)">
    <path d="M40 30 H160 L172 100 L160 170 H40 L28 100Z" fill="url(#${stone})" stroke="url(#gold)" stroke-width="5" opacity=".95"/>
    <path d="M50 42 H150 L160 100 L150 158 H50 L40 100Z" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="2"/>
    <text x="100" y="${100 + size * 0.36}" text-anchor="middle" font-family="Cinzel, 'Trajan Pro', Georgia, serif"
      font-weight="900" font-size="${size}" fill="#3a2404" opacity=".6" transform="translate(3 4)">${txt}</text>
    <text x="100" y="${100 + size * 0.36}" text-anchor="middle" font-family="Cinzel, 'Trajan Pro', Georgia, serif"
      font-weight="900" font-size="${size}" fill="url(#gold)" stroke="#fff3c4" stroke-width="1.5">${txt}</text>
  </g>`;

Object.assign(SYMBOLS, {
  A: royal('A', 'ruby'),
  K: royal('K', 'lapis'),
  Q: royal('Q', 'emerald'),
  J: royal('J', 'turq'),
  T: royal('10', 'leather', 84),
});

export const svg = (id, size = 200) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}"><defs>${DEFS}</defs>${SYMBOLS[id]}</svg>`;
