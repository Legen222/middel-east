/**
 * Hand-authored SVG sprite. Everything is drawn once into a hidden <defs>
 * sheet and instanced with <use>, so gradients are shared and a 5x5 grid of
 * tiles costs almost nothing to re-render.
 */

const gradients = `
<linearGradient id="g-gold" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#ffeaa0"/><stop offset="45%" stop-color="#e8b64a"/>
  <stop offset="100%" stop-color="#8a5f14"/>
</linearGradient>
<linearGradient id="g-gold-rim" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#fff6d0"/><stop offset="60%" stop-color="#d9a032"/>
  <stop offset="100%" stop-color="#6e4a0d"/>
</linearGradient>
<linearGradient id="g-steel" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#ffffff"/><stop offset="30%" stop-color="#cfdae8"/>
  <stop offset="55%" stop-color="#8b9cb3"/><stop offset="75%" stop-color="#e6eef8"/>
  <stop offset="100%" stop-color="#5d6b80"/>
</linearGradient>
<linearGradient id="g-wood" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#a8804a"/><stop offset="100%" stop-color="#4e3517"/>
</linearGradient>
<radialGradient id="g-flame" cx="50%" cy="60%" r="55%">
  <stop offset="0%" stop-color="#fff8d6"/><stop offset="40%" stop-color="#ffc247"/>
  <stop offset="100%" stop-color="#e2681a" stop-opacity="0.15"/>
</radialGradient>
<linearGradient id="g-teal" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#9df1e6"/><stop offset="50%" stop-color="#3bbcae"/>
  <stop offset="100%" stop-color="#145b55"/>
</linearGradient>
<linearGradient id="g-crimson" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#ff8d72"/><stop offset="45%" stop-color="#d33f34"/>
  <stop offset="100%" stop-color="#6b1512"/>
</linearGradient>
<linearGradient id="g-violet" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#e2c6ff"/><stop offset="50%" stop-color="#9a6be0"/>
  <stop offset="100%" stop-color="#3c2266"/>
</linearGradient>
<linearGradient id="g-olive" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#b6d98c"/><stop offset="45%" stop-color="#6d9c46"/>
  <stop offset="100%" stop-color="#2b4318"/>
</linearGradient>
<linearGradient id="g-glass" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.75"/>
  <stop offset="45%" stop-color="#bcd8ea" stop-opacity="0.25"/>
  <stop offset="100%" stop-color="#3c6e8c" stop-opacity="0.55"/>
</linearGradient>
<linearGradient id="g-sand" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#ffd98a"/><stop offset="55%" stop-color="#d99a3c"/>
  <stop offset="100%" stop-color="#7d4d12"/>
</linearGradient>
<linearGradient id="g-rose" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#f4a0c8"/><stop offset="50%" stop-color="#b5497c"/>
  <stop offset="100%" stop-color="#4b1533"/>
</linearGradient>
<linearGradient id="g-indigo" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#a7bdf0"/><stop offset="50%" stop-color="#4b66b8"/>
  <stop offset="100%" stop-color="#1b2a5c"/>
</linearGradient>
<filter id="f-soft" x="-30%" y="-30%" width="160%" height="160%">
  <feGaussianBlur stdDeviation="1.6"/>
</filter>
<filter id="f-glow" x="-60%" y="-60%" width="220%" height="220%">
  <feGaussianBlur stdDeviation="3" result="b"/>
  <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
`;

/** Shared drop shadow put under every symbol so tiles sit on the reel. */
const shadow = `<ellipse cx="50" cy="88" rx="26" ry="5" fill="#000" opacity="0.28" filter="url(#f-soft)"/>`;

const dates = `
<symbol id="sym-dates" viewBox="0 0 100 100">
  ${shadow}
  <g stroke="#2f5426" stroke-width="2.2" fill="none" stroke-linecap="round">
    <path d="M50 30 Q30 18 8 22"/><path d="M50 30 Q70 18 92 22"/>
    <path d="M50 30 Q34 14 24 6"/><path d="M50 30 Q66 14 76 6"/>
  </g>
  <path d="M50 30 Q32 20 10 23 Q30 30 50 34 Z" fill="#4e8340"/>
  <path d="M50 30 Q68 20 90 23 Q70 30 50 34 Z" fill="#3f6b32"/>
  <path d="M50 30 Q36 16 26 8 Q38 20 48 32 Z" fill="#5c9a4a"/>
  <path d="M50 30 Q64 16 74 8 Q62 20 52 32 Z" fill="#417034"/>
  <g stroke="#3f6b32" stroke-width="1" opacity="0.7">
    <path d="M20 24 l3 4 M30 26 l3 4 M40 29 l3 4"/>
    <path d="M80 24 l-3 4 M70 26 l-3 4 M60 29 l-3 4"/>
  </g>
  <path d="M50 32 V42" stroke="#6b4a22" stroke-width="3" stroke-linecap="round"/>
  <g>
    <ellipse cx="38" cy="52" rx="8" ry="11" fill="#7a3f16" transform="rotate(-18 38 52)"/>
    <ellipse cx="62" cy="52" rx="8" ry="11" fill="#8a4c1c" transform="rotate(18 62 52)"/>
    <ellipse cx="50" cy="50" rx="8.4" ry="11.5" fill="#9a5a24"/>
    <ellipse cx="33" cy="68" rx="8" ry="11" fill="#6f3813" transform="rotate(-12 33 68)"/>
    <ellipse cx="50" cy="70" rx="8.6" ry="12" fill="#8a4c1c"/>
    <ellipse cx="67" cy="68" rx="8" ry="11" fill="#7a3f16" transform="rotate(12 67 68)"/>
    <ellipse cx="42" cy="82" rx="7.4" ry="10" fill="#96591f" transform="rotate(-8 42 82)"/>
    <ellipse cx="58" cy="82" rx="7.4" ry="10" fill="#6f3813" transform="rotate(8 58 82)"/>
  </g>
  <g fill="#d89a58" opacity="0.6">
    <ellipse cx="47" cy="45" rx="2.6" ry="4.4"/><ellipse cx="35" cy="47" rx="2.2" ry="3.6" transform="rotate(-18 35 47)"/>
    <ellipse cx="47" cy="65" rx="2.6" ry="4.4"/><ellipse cx="64" cy="64" rx="2.2" ry="3.6" transform="rotate(12 64 64)"/>
    <ellipse cx="40" cy="78" rx="2" ry="3.2"/>
  </g>
</symbol>`;

const tea = `
<symbol id="sym-tea" viewBox="0 0 100 100">
  ${shadow}
  <g opacity="0.5" stroke="#dff3ea" stroke-width="2.4" stroke-linecap="round" fill="none">
    <path d="M40 24 C36 18 44 14 40 8"/><path d="M58 22 C54 16 62 12 58 6"/>
  </g>
  <path d="M33 34 L37 82 Q50 88 63 82 L67 34 Z" fill="url(#g-glass)" stroke="#e6d7a8" stroke-width="2"/>
  <path d="M36 50 L39.5 79 Q50 84 60.5 79 L64 50 Z" fill="#c98a1e" opacity="0.88"/>
  <path d="M36 50 L64 50 L63.4 56 L36.6 56 Z" fill="#eab63f" opacity="0.75"/>
  <ellipse cx="50" cy="34" rx="17" ry="4.8" fill="#f0c14b" opacity="0.45"/>
  <g>
    <path d="M44 33 Q38 24 44 20 Q50 24 48 33 Z" fill="#4faa78"/>
    <path d="M44 32 Q43 26 44 21" stroke="#2c6b52" stroke-width="1" fill="none"/>
    <path d="M52 33 Q52 22 60 20 Q62 28 56 34 Z" fill="#79c7a8"/>
    <path d="M55 33 Q56 27 59 22" stroke="#2c6b52" stroke-width="1" fill="none"/>
    <path d="M47 31 Q54 26 58 29 Q53 34 47 34 Z" fill="#5fbd8e"/>
  </g>
  <path d="M39 40 L41.5 76" stroke="#ffffff" stroke-width="2.8" opacity="0.5" stroke-linecap="round"/>
  <g stroke="#e0c47a" stroke-width="1.2" opacity="0.75" fill="none">
    <path d="M34 44 H66"/><path d="M35.5 64 H64.5"/>
  </g>
  <g fill="#f0dfae" opacity="0.8">
    <circle cx="42" cy="54" r="1.2"/><circle cx="58" cy="54" r="1.2"/>
    <circle cx="50" cy="60" r="1.2"/><circle cx="42" cy="70" r="1.2"/><circle cx="58" cy="70" r="1.2"/>
  </g>
</symbol>`;

const spice = `
<symbol id="sym-spice" viewBox="0 0 100 100">
  ${shadow}
  <g>
    <path d="M14 66 Q30 50 46 66 Z" fill="#e0703a"/>
    <ellipse cx="30" cy="68" rx="17" ry="6" fill="#8a5a2c"/>
    <path d="M13 66 Q30 76 47 66 Q46 80 30 82 Q14 80 13 66 Z" fill="#6b451f"/>
  </g>
  <g>
    <path d="M54 62 Q70 44 86 62 Z" fill="#f0c14b"/>
    <ellipse cx="70" cy="64" rx="17" ry="6" fill="#8a5a2c"/>
    <path d="M53 62 Q70 72 87 62 Q86 76 70 78 Q54 76 53 62 Z" fill="#6b451f"/>
  </g>
  <g>
    <path d="M32 40 Q48 24 64 40 Z" fill="#a8392e"/>
    <ellipse cx="48" cy="42" rx="17" ry="6" fill="#9a6733"/>
    <path d="M31 42 Q48 52 65 42 Q64 56 48 58 Q32 56 31 42 Z" fill="#7a5226"/>
  </g>
  <g fill="#f5d98a" opacity="0.8">
    <circle cx="22" cy="58" r="1.4"/><circle cx="38" cy="57" r="1.2"/>
    <circle cx="64" cy="54" r="1.4"/><circle cx="78" cy="56" r="1.2"/>
    <circle cx="42" cy="34" r="1.3"/><circle cx="56" cy="33" r="1.1"/>
  </g>
</symbol>`;

const lantern = `
<symbol id="sym-lantern" viewBox="0 0 100 100">
  ${shadow}
  <circle cx="50" cy="52" r="32" fill="url(#g-flame)" opacity="0.5"/>
  <path d="M50 4 V12" stroke="url(#g-gold-rim)" stroke-width="3" stroke-linecap="round"/>
  <path d="M42 12 Q50 6 58 12 Z" fill="url(#g-gold-rim)"/>
  <path d="M40 14 H60 L54 22 H46 Z" fill="url(#g-gold)"/>
  <path d="M50 22 L30 34 V64 L50 78 L70 64 V34 Z" fill="#171c2c"/>
  <path d="M50 22 L30 34 V64 L50 78 L70 64 V34 Z" fill="none" stroke="url(#g-gold-rim)" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="M50 28 L36 37 V61 L50 71 L64 61 V37 Z" fill="#ffca52"/>
  <path d="M50 28 L36 37 V61 L50 71 L64 61 V37 Z" fill="url(#g-flame)" opacity="0.6"/>
  <g fill="#171c2c">
    <path d="M50 33 L44 40 L50 47 L56 40 Z"/>
    <path d="M40 44 l4 4 -4 4 -4 -4 Z"/><path d="M60 44 l4 4 -4 4 -4 -4 Z"/>
    <path d="M50 55 l4.5 4.5 -4.5 4.5 -4.5 -4.5 Z"/>
    <circle cx="42" cy="58" r="1.8"/><circle cx="58" cy="58" r="1.8"/>
  </g>
  <path d="M50 30 V70" stroke="#8a6414" stroke-width="1" opacity="0.5"/>
  <path d="M30 34 L50 24 L70 34" fill="none" stroke="#fff3c4" stroke-width="1.8" opacity="0.7"/>
  <path d="M34 78 H66 L61 86 H39 Z" fill="url(#g-gold)"/>
  <path d="M44 86 H56 L50 94 Z" fill="url(#g-gold-rim)"/>
  <g fill="#fff6d0" opacity="0.5">
    <circle cx="26" cy="30" r="1.6"/><circle cx="76" cy="44" r="1.4"/><circle cx="30" cy="72" r="1.2"/>
  </g>
</symbol>`;

const carpet = `
<symbol id="sym-carpet" viewBox="0 0 100 100">
  ${shadow}
  <path d="M10 58 Q30 40 50 50 Q70 60 90 42 L90 62 Q70 80 50 70 Q30 60 10 78 Z" fill="url(#g-rose)"/>
  <path d="M10 58 Q30 40 50 50 Q70 60 90 42" fill="none" stroke="#ffd9ee" stroke-width="2.4" opacity="0.8"/>
  <path d="M10 78 Q30 60 50 70 Q70 80 90 62" fill="none" stroke="#5c1c3d" stroke-width="2.4"/>
  <path d="M12 64 Q31 47 50 56 Q69 65 88 49" fill="none" stroke="#f0c14b" stroke-width="2" opacity="0.9"/>
  <path d="M12 72 Q31 55 50 64 Q69 73 88 57" fill="none" stroke="#f0c14b" stroke-width="1.4" opacity="0.6"/>
  <g fill="#ffe9b0" opacity="0.95">
    <path d="M28 57 l3 4 -3 4 -3 -4 Z"/><path d="M42 61 l3 4 -3 4 -3 -4 Z"/>
    <path d="M58 65 l3 4 -3 4 -3 -4 Z"/><path d="M72 60 l3 4 -3 4 -3 -4 Z"/>
  </g>
  <g stroke="#f7e3a8" stroke-width="1.6" stroke-linecap="round">
    <path d="M10 78 l-5 5"/><path d="M10 70 l-6 3"/><path d="M10 62 l-6 1"/>
    <path d="M90 62 l5 5"/><path d="M90 54 l6 3"/><path d="M90 46 l6 1"/>
  </g>
</symbol>`;

const hookah = `
<symbol id="sym-hookah" viewBox="0 0 100 100">
  ${shadow}
  <g opacity="0.35" fill="#cfe3f5">
    <circle cx="56" cy="12" r="4.4"/><circle cx="64" cy="6" r="3"/><circle cx="49" cy="6" r="2.4"/>
  </g>
  <path d="M60 60 Q78 58 84 68 Q90 80 78 84 Q68 86 66 80" fill="none" stroke="#243a72" stroke-width="6" stroke-linecap="round"/>
  <path d="M60 60 Q78 58 84 68 Q90 80 78 84 Q68 86 66 80" fill="none" stroke="#7f9be0" stroke-width="2.2" stroke-linecap="round"/>
  <rect x="62" y="76" width="12" height="5" rx="2.5" fill="url(#g-gold)" transform="rotate(14 68 78)"/>
  <path d="M36 62 Q34 84 50 88 Q66 84 64 62 Q62 76 50 78 Q38 76 36 62 Z" fill="url(#g-indigo)"/>
  <path d="M36 62 Q50 72 64 62 Q64 82 50 88 Q36 82 36 62 Z" fill="url(#g-indigo)"/>
  <ellipse cx="50" cy="62" rx="14" ry="5" fill="#8fa8e8" opacity="0.65"/>
  <path d="M39 68 Q50 78 61 68 L60 80 Q50 85 40 80 Z" fill="#8fc6ee" opacity="0.4"/>
  <ellipse cx="43" cy="70" rx="3.4" ry="7" fill="#ffffff" opacity="0.3" transform="rotate(-12 43 70)"/>
  <rect x="46.5" y="34" width="7" height="28" rx="2.5" fill="url(#g-gold)"/>
  <rect x="45" y="44" width="10" height="5" rx="2" fill="url(#g-gold-rim)"/>
  <ellipse cx="50" cy="35" rx="16" ry="4.4" fill="url(#g-gold)"/>
  <ellipse cx="50" cy="34" rx="16" ry="4.4" fill="url(#g-gold-rim)"/>
  <path d="M43 30 H57 L55 22 H45 Z" fill="url(#g-gold)"/>
  <ellipse cx="50" cy="21" rx="9.5" ry="3.8" fill="#8a5f14"/>
  <ellipse cx="50" cy="20" rx="7.4" ry="2.8" fill="#d4453c" opacity="0.85"/>
  <ellipse cx="50" cy="19.4" rx="4" ry="1.6" fill="#ffca6a" opacity="0.8"/>
</symbol>`;

const falcon = `
<symbol id="sym-falcon" viewBox="0 0 100 100">
  ${shadow}
  <path d="M58 16 Q38 18 33 33 Q31 40 32 46 Q32 54 36 60 Q41 74 52 79 Q66 83 76 75 Q88 65 87 46 Q86 26 69 19 Q64 16 58 16 Z" fill="#48546b"/>
  <path d="M58 20 Q41 22 37 34 Q35 41 36 47 Q36 54 40 60 Q45 71 55 75 Q67 78 75 71 Q84 62 83 46 Q82 29 67 23 Q63 20 58 20 Z" fill="#e8edf5"/>
  <path d="M66 22 Q82 29 83 46 Q84 62 75 71 Q71 62 71 48 Q71 32 66 22 Z" fill="#9dabc0"/>
  <path d="M42 30 Q52 22 64 24 Q55 33 44 38 Z" fill="#ffffff" opacity="0.85"/>
  <path d="M60 15 Q72 5 86 8 Q76 14 72 21 Z" fill="#48546b"/>
  <path d="M36 34 C23 33 12 40 9 52 C8 58 13 59 15 54 C19 45 27 42 35 44 C37 40 37 37 36 34 Z" fill="#f0c14b"/>
  <path d="M36 34 C26 33 17 38 12 47 C19 42 27 41 35 43 Z" fill="#fadd9a"/>
  <path d="M12 48 C10 53 12 57 14 54 C16 49 19 45 23 43 C18 43 14 45 12 48 Z" fill="#6b4a0d"/>
  <path d="M35 45 Q27 48 22 53 Q29 54 36 51 Z" fill="#d69f28"/>
  <ellipse cx="39" cy="35" rx="6.5" ry="5.5" fill="#f7d98a"/>
  <circle cx="38" cy="34" r="1.5" fill="#6b4a0d"/>
  <path d="M44 27 Q54 24 60 28 Q52 30 45 33 Z" fill="#3b4557"/>
  <circle cx="53" cy="39" r="9.5" fill="#f0c14b"/>
  <circle cx="53" cy="39" r="7" fill="#12161f"/>
  <circle cx="53" cy="39" r="3" fill="#000"/>
  <circle cx="55.6" cy="36.4" r="2.2" fill="#fff" opacity="0.95"/>
  <path d="M49 47 Q45 60 50 72 Q42 64 42 50 Z" fill="#55627a"/>
  <g stroke="#8494ad" stroke-width="1.4" fill="none" opacity="0.7">
    <path d="M62 34 Q72 40 75 52"/><path d="M58 46 Q68 52 71 63"/><path d="M56 58 Q64 63 66 71"/>
  </g>
  <g fill="#c3cddd" opacity="0.8">
    <path d="M52 64 q5 3 9 2 -4 4 -9 -2Z"/><path d="M58 56 q5 3 9 2 -4 4 -9 -2Z"/>
  </g>
</symbol>`;

const scarab = `
<symbol id="sym-scarab" viewBox="0 0 100 100">
  ${shadow}
  <path d="M50 18 Q26 26 20 48 Q16 64 30 62 Q26 48 38 40 Z" fill="url(#g-gold)"/>
  <path d="M50 18 Q74 26 80 48 Q84 64 70 62 Q74 48 62 40 Z" fill="url(#g-gold-rim)"/>
  <g stroke="#7a5510" stroke-width="1.2" opacity="0.7" fill="none">
    <path d="M24 52 Q30 44 40 40"/><path d="M76 52 Q70 44 60 40"/>
    <path d="M22 58 Q30 50 38 46"/><path d="M78 58 Q70 50 62 46"/>
  </g>
  <ellipse cx="50" cy="56" rx="20" ry="26" fill="url(#g-teal)"/>
  <path d="M50 30 V82" stroke="#0d4642" stroke-width="2.4"/>
  <ellipse cx="50" cy="56" rx="20" ry="26" fill="none" stroke="url(#g-gold-rim)" stroke-width="3"/>
  <ellipse cx="43" cy="46" rx="5" ry="8" fill="#b6f6ec" opacity="0.5"/>
  <g fill="url(#g-gold)">
    <circle cx="50" cy="26" r="9"/>
    <path d="M41 24 Q34 16 28 18 Q34 22 38 28 Z"/>
    <path d="M59 24 Q66 16 72 18 Q66 22 62 28 Z"/>
  </g>
  <circle cx="46" cy="25" r="1.8" fill="#1a1f2e"/><circle cx="54" cy="25" r="1.8" fill="#1a1f2e"/>
  <g stroke="url(#g-gold-rim)" stroke-width="3.4" stroke-linecap="round">
    <path d="M32 52 L20 62"/><path d="M68 52 L80 62"/>
    <path d="M34 66 L24 78"/><path d="M66 66 L76 78"/>
  </g>
</symbol>`;

const jambiya = `
<symbol id="sym-jambiya" viewBox="0 0 100 100">
  ${shadow}
  <path d="M30 20 Q66 22 78 46 Q86 62 70 76 Q62 82 56 78 Q70 66 64 50 Q56 32 30 26 Z" fill="url(#g-steel)"/>
  <path d="M32 23 Q62 26 73 47 Q79 60 68 72" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.65"/>
  <path d="M34 24 Q60 30 68 48 Q73 60 64 70" fill="none" stroke="#5d6b80" stroke-width="1.4" opacity="0.6"/>
  <path d="M20 14 L38 12 L40 30 L22 32 Z" fill="url(#g-gold)" transform="rotate(-8 30 22)"/>
  <path d="M20 14 L38 12 L40 30 L22 32 Z" fill="none" stroke="#6e4a0d" stroke-width="1.6" transform="rotate(-8 30 22)"/>
  <g transform="rotate(-8 30 22)" fill="#7a1f1c">
    <circle cx="29" cy="17" r="2.4"/><circle cx="31" cy="26" r="2.4"/>
  </g>
  <path d="M14 8 Q30 2 42 8 L38 14 Q28 10 18 14 Z" fill="url(#g-gold-rim)"/>
  <g stroke="#e05a52" stroke-width="2" opacity="0.85" fill="none">
    <path d="M24 34 Q32 38 34 46"/>
  </g>
  <path d="M44 62 Q62 74 74 84 Q58 82 44 72 Z" fill="#7a1f1c" opacity="0.55"/>
</symbol>`;

const sabre = `
<symbol id="sym-sabre" viewBox="0 0 100 100">
  ${shadow}
  <g transform="rotate(-18 50 50)">
    <path d="M14 66 Q40 74 74 54 Q86 46 90 34 Q78 44 62 50 Q38 58 14 60 Z" fill="url(#g-steel)"/>
    <path d="M18 62 Q42 68 70 51" fill="none" stroke="#fff" stroke-width="1.8" opacity="0.7"/>
    <rect x="6" y="58" width="16" height="9" rx="3" fill="url(#g-gold)"/>
    <rect x="2" y="56" width="7" height="13" rx="3" fill="url(#g-gold-rim)"/>
    <rect x="20" y="55" width="4" height="15" rx="2" fill="#8a6a1c"/>
  </g>
  <g transform="rotate(18 50 50) scale(-1 1) translate(-100 0)">
    <path d="M14 66 Q40 74 74 54 Q86 46 90 34 Q78 44 62 50 Q38 58 14 60 Z" fill="url(#g-steel)"/>
    <path d="M18 62 Q42 68 70 51" fill="none" stroke="#fff" stroke-width="1.8" opacity="0.7"/>
    <rect x="6" y="58" width="16" height="9" rx="3" fill="url(#g-gold)"/>
    <rect x="2" y="56" width="7" height="13" rx="3" fill="url(#g-gold-rim)"/>
    <rect x="20" y="55" width="4" height="15" rx="2" fill="#8a6a1c"/>
  </g>
  <circle cx="50" cy="52" r="8" fill="url(#g-gold)"/>
  <circle cx="50" cy="52" r="8" fill="none" stroke="#6e4a0d" stroke-width="1.6"/>
  <path d="M50 46 l2.2 4.4 4.8 .7 -3.5 3.4 .8 4.8 -4.3 -2.3 -4.3 2.3 .8 -4.8 -3.5 -3.4 4.8 -.7 Z" fill="#fff3c4"/>
</symbol>`;

const scatter = `
<symbol id="sym-scatter" viewBox="0 0 100 100">
  <circle cx="68" cy="24" r="16" fill="url(#g-flame)" opacity="0.7"/>
  <circle cx="68" cy="24" r="8" fill="#ffd98a" opacity="0.75"/>
  <path d="M14 16 Q32 8 52 11 Q74 8 88 18 Q74 32 66 48 Q58 64 58 86 L42 88 Q44 64 37 48 Q28 30 14 16 Z" fill="url(#g-sand)"/>
  <path d="M14 16 Q32 8 52 11 Q60 10 68 12 Q58 28 54 48 Q50 66 50 87 L42 88 Q44 64 37 48 Q28 30 14 16 Z" fill="#b57a24" opacity="0.4"/>
  <g fill="none" stroke="url(#g-gold-rim)" stroke-width="6" stroke-linecap="round">
    <path d="M16 17 Q50 6 86 18"/>
    <path d="M25 31 Q52 21 79 33"/>
    <path d="M33 46 Q54 37 72 48"/>
    <path d="M39 60 Q54 53 67 62"/>
    <path d="M43 73 Q53 68 62 75"/>
    <path d="M45 85 Q52 82 58 86"/>
  </g>
  <g fill="none" stroke="#fff6d8" stroke-width="2.2" stroke-linecap="round" opacity="0.85">
    <path d="M18 15 Q50 5 84 16"/><path d="M27 29 Q52 19 77 31"/>
    <path d="M35 44 Q54 35 70 46"/><path d="M40 58 Q54 51 66 60"/>
  </g>
  <g fill="none" stroke="#7d4d12" stroke-width="1.6" opacity="0.55">
    <path d="M20 22 Q50 12 84 23"/><path d="M29 36 Q53 27 78 38"/><path d="M36 50 Q54 42 71 52"/>
  </g>
  <g fill="#e8b34a" opacity="0.85">
    <ellipse cx="10" cy="26" rx="7" ry="2.6" transform="rotate(-18 10 26)"/>
    <ellipse cx="90" cy="34" rx="6" ry="2.4" transform="rotate(16 90 34)"/>
    <ellipse cx="18" cy="44" rx="5" ry="2" transform="rotate(-12 18 44)"/>
    <ellipse cx="84" cy="56" rx="4.6" ry="1.9" transform="rotate(14 84 56)"/>
    <ellipse cx="24" cy="66" rx="4" ry="1.7" transform="rotate(-10 24 66)"/>
    <ellipse cx="78" cy="76" rx="3.4" ry="1.5" transform="rotate(12 78 76)"/>
  </g>
  <g fill="#fff0c2">
    <circle cx="8" cy="12" r="2"/><circle cx="92" cy="46" r="1.8"/>
    <circle cx="14" cy="60" r="1.5"/><circle cx="88" cy="88" r="1.4"/><circle cx="26" cy="90" r="1.6"/>
  </g>
</symbol>`;

const crate = `
<symbol id="sym-crate" viewBox="0 0 100 100">
  ${shadow}
  <path d="M18 34 H82 V80 H18 Z" fill="url(#g-wood)"/>
  <path d="M18 34 H82 L74 26 H26 Z" fill="#8a6a3c"/>
  <g stroke="#3a2710" stroke-width="2" opacity="0.7">
    <path d="M18 48 H82"/><path d="M18 64 H82"/>
  </g>
  <path d="M18 34 L82 80 M82 34 L18 80" stroke="#6b4b22" stroke-width="4" opacity="0.6"/>
  <rect x="14" y="30" width="72" height="8" rx="2" fill="#6f6247"/>
  <rect x="14" y="74" width="72" height="8" rx="2" fill="#6f6247"/>
  <g fill="#c2a35e">
    <circle cx="20" cy="34" r="2"/><circle cx="80" cy="34" r="2"/>
    <circle cx="20" cy="78" r="2"/><circle cx="80" cy="78" r="2"/>
  </g>
  <path d="M50 46 l3.4 7 7.6 1.1 -5.5 5.3 1.3 7.6 -6.8 -3.6 -6.8 3.6 1.3 -7.6 -5.5 -5.3 7.6 -1.1 Z" fill="#e0c988" opacity="0.9"/>
  <path d="M30 20 Q50 8 70 20" fill="none" stroke="#9a8256" stroke-width="4" stroke-linecap="round"/>
</symbol>`;

const grenade = `
<symbol id="sym-grenade" viewBox="0 0 100 100">
  ${shadow}
  <path d="M40 24 H60 V34 H40 Z" fill="#5a5f4a"/>
  <path d="M60 26 Q76 22 74 12 Q72 6 64 8" fill="none" stroke="#c9cdbb" stroke-width="3" stroke-linecap="round"/>
  <circle cx="66" cy="10" r="5.5" fill="none" stroke="#e2e6d4" stroke-width="3"/>
  <ellipse cx="50" cy="60" rx="24" ry="26" fill="url(#g-olive)"/>
  <ellipse cx="50" cy="60" rx="24" ry="26" fill="none" stroke="#1e3010" stroke-width="2"/>
  <g stroke="#26400f" stroke-width="2.4" opacity="0.85">
    <path d="M28 48 H72"/><path d="M27 60 H73"/><path d="M29 72 H71"/>
    <path d="M42 36 V84"/><path d="M58 36 V84"/>
  </g>
  <ellipse cx="42" cy="50" rx="7" ry="10" fill="#d7efb4" opacity="0.35"/>
  <rect x="38" y="30" width="24" height="9" rx="3" fill="#7a8064"/>
  <rect x="38" y="30" width="24" height="4" rx="2" fill="#a3a98a" opacity="0.8"/>
</symbol>`;

const dynamite = `
<symbol id="sym-dynamite" viewBox="0 0 100 100">
  ${shadow}
  <path d="M46 30 Q40 16 52 10 Q48 20 58 24" fill="none" stroke="#c9a05a" stroke-width="3" stroke-linecap="round"/>
  <circle cx="57" cy="23" r="5" fill="url(#g-flame)"/>
  <circle cx="57" cy="22" r="2.4" fill="#fff6cf"/>
  <g>
    <rect x="24" y="34" width="17" height="52" rx="6" fill="url(#g-crimson)"/>
    <rect x="41" y="30" width="17" height="56" rx="6" fill="#e05149"/>
    <rect x="58" y="36" width="17" height="50" rx="6" fill="url(#g-crimson)"/>
  </g>
  <g fill="#ffd9cf" opacity="0.3">
    <rect x="27" y="38" width="4" height="44" rx="2"/>
    <rect x="44" y="34" width="4" height="48" rx="2"/>
    <rect x="61" y="40" width="4" height="42" rx="2"/>
  </g>
  <rect x="21" y="52" width="58" height="10" rx="3" fill="#6b4a22"/>
  <rect x="21" y="52" width="58" height="4" rx="2" fill="#9a7440" opacity="0.8"/>
  <g fill="#f7dfb0" font-family="serif" font-size="9" text-anchor="middle" opacity="0.85">
    <text x="49.5" y="47">TNT</text>
  </g>
</symbol>`;

const scimitar = `
<symbol id="sym-scimitar" viewBox="0 0 100 100">
  ${shadow}
  <g opacity="0.45" fill="none" stroke="#bfe3f5" stroke-width="3" stroke-linecap="round">
    <path d="M10 40 Q40 26 84 34"/><path d="M8 52 Q38 38 82 46"/>
  </g>
  <path d="M8 70 Q36 78 66 60 Q84 48 92 30 Q78 44 58 52 Q32 62 8 62 Z" fill="url(#g-steel)"/>
  <path d="M14 66 Q40 72 66 56 Q80 47 86 36" fill="none" stroke="#ffffff" stroke-width="2.2" opacity="0.75"/>
  <path d="M16 62 Q40 66 62 53" fill="none" stroke="#6f7f95" stroke-width="1.4" opacity="0.6"/>
  <rect x="2" y="60" width="18" height="10" rx="3" fill="url(#g-gold)"/>
  <rect x="18" y="56" width="5" height="18" rx="2.5" fill="url(#g-gold-rim)"/>
  <circle cx="7" cy="65" r="3.4" fill="#2a5a73"/>
  <g fill="#e8f6ff" opacity="0.8">
    <circle cx="88" cy="26" r="2"/><circle cx="80" cy="20" r="1.4"/>
  </g>
</symbol>`;

const djinn = `
<symbol id="sym-djinn" viewBox="0 0 100 100">
  ${shadow}
  <g opacity="0.75">
    <path d="M62 44 Q76 34 70 22 Q64 12 74 6 Q68 16 78 20 Q88 26 80 38 Q74 46 66 48 Z" fill="url(#g-violet)" filter="url(#f-soft)"/>
  </g>
  <circle cx="72" cy="16" r="3" fill="#e6d0ff" opacity="0.8"/>
  <circle cx="82" cy="28" r="2" fill="#e6d0ff" opacity="0.6"/>
  <path d="M22 62 Q22 48 42 46 L66 46 Q74 46 74 54 Q74 66 56 70 L34 70 Q22 70 22 62 Z" fill="url(#g-gold)"/>
  <path d="M24 60 Q26 52 42 50 L62 50 Q68 51 68 56 Q66 64 52 66 L34 66 Q25 66 24 60 Z" fill="#f4d98f" opacity="0.55"/>
  <path d="M66 46 Q84 40 90 50 Q82 48 74 54" fill="none" stroke="url(#g-gold-rim)" stroke-width="5" stroke-linecap="round"/>
  <path d="M22 62 Q10 62 8 54 Q18 54 24 58" fill="url(#g-gold-rim)"/>
  <ellipse cx="46" cy="72" rx="26" ry="6" fill="url(#g-gold-rim)"/>
  <ellipse cx="46" cy="44" rx="10" ry="4" fill="url(#g-gold-rim)"/>
  <circle cx="46" cy="42" r="3" fill="#b98ce8"/>
  <g stroke="#7a5510" stroke-width="1.2" opacity="0.7" fill="none">
    <path d="M30 58 Q40 54 52 56"/><path d="M32 63 Q42 60 54 62"/>
  </g>
</symbol>`;

const starmine = `
<symbol id="sym-starmine" viewBox="0 0 100 100">
  ${shadow}
  <g stroke="#3a2a10" stroke-width="5" stroke-linecap="round">
    <path d="M50 12 V22"/><path d="M50 78 V88"/><path d="M12 50 H22"/><path d="M78 50 H88"/>
    <path d="M23 23 L30 30"/><path d="M77 23 L70 30"/><path d="M23 77 L30 70"/><path d="M77 77 L70 70"/>
  </g>
  <g fill="#f2a93b">
    <circle cx="50" cy="12" r="4"/><circle cx="50" cy="88" r="4"/>
    <circle cx="12" cy="50" r="4"/><circle cx="88" cy="50" r="4"/>
    <circle cx="22" cy="22" r="3.4"/><circle cx="78" cy="22" r="3.4"/>
    <circle cx="22" cy="78" r="3.4"/><circle cx="78" cy="78" r="3.4"/>
  </g>
  <rect x="28" y="28" width="44" height="44" rx="6" fill="url(#g-sand)" transform="rotate(45 50 50)"/>
  <rect x="28" y="28" width="44" height="44" rx="6" fill="url(#g-gold)"/>
  <rect x="28" y="28" width="44" height="44" rx="6" fill="none" stroke="#6e4a0d" stroke-width="2" />
  <rect x="28" y="28" width="44" height="44" rx="6" fill="none" stroke="#6e4a0d" stroke-width="2" transform="rotate(45 50 50)"/>
  <circle cx="50" cy="50" r="13" fill="#2a1a08"/>
  <circle cx="50" cy="50" r="9" fill="#f2a93b"/>
  <circle cx="50" cy="50" r="4.5" fill="#fff3c4"/>
  <path d="M50 37 l3 10 10 3 -10 3 -3 10 -3 -10 -10 -3 10 -3 Z" fill="#fff8de" opacity="0.5"/>
</symbol>`;

export const SPRITE_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">
<defs>${gradients}</defs>
${dates}${tea}${spice}${lantern}${carpet}${hookah}${falcon}${scarab}${jambiya}${sabre}${scatter}${crate}
${grenade}${dynamite}${scimitar}${djinn}${starmine}
</svg>`;

/** Inject the sprite sheet once, at boot. */
export function mountSprite(host: HTMLElement = document.body): void {
  if (document.getElementById('ss-sprite')) return;
  const holder = document.createElement('div');
  holder.id = 'ss-sprite';
  holder.innerHTML = SPRITE_MARKUP;
  host.prepend(holder);
}

export const spriteHref = (id: string): string => `#sym-${id}`;
