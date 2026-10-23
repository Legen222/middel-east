/**
 * Word filter for chat messages and display names.
 *
 * Text is normalised before matching, so the usual dodges do not work:
 *   - case and accents
 *   - look-alike digits and symbols (n1gg3r, $, @)
 *   - repeated letters (niiigger)
 *   - letters spaced or dotted out (n.i.g.g.e.r)
 * Blocked: slurs and hate speech (English and German), telling someone to kill themselves, and whatever the
 * operator adds in the backoffice (Settings → chat words). Ordinary swearing stays allowed, as on most Rust sites.
 *
 * Display names additionally may not look like staff or the site itself ("Admin", "Support", "SCRAPLINE"):
 * only real staff carry a MOD or ADMIN badge in chat, and the badge comes from the account's role.
 */

const LEET: Record<string, string> = {
  0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't', '€': 'e', ß: 'ss',
};

/** Lower-case ASCII words: accents stripped, look-alikes mapped, everything else a separator. */
function words(text: string): string[] {
  let s = '';
  for (const ch of text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()) s += LEET[ch] ?? ch;
  const raw = s.replace(/[^a-z]+/g, ' ').trim().split(' ').filter(Boolean);
  // letters spaced or dotted out ("n i g g e r") count as one word
  const out: string[] = [];
  let run = '';
  for (const w of raw) {
    if (w.length === 1) { run += w; continue; }
    if (run) out.push(run);
    run = '';
    out.push(w);
  }
  if (run) out.push(run);
  return out;
}

/** Each letter may repeat ("faaag"). */
const stretch = (w: string) => [...w].map((c) => `${c}+`).join('');

/** Slurs that stay offensive inside longer words. `allow` lists real words that contain them. */
const STEMS: { stem: string; allow?: RegExp }[] = [
  { stem: 'nigger', allow: /^s+n+i+g+e+r/ }, { stem: 'nigga', allow: /^n+i+g+a+r+d/ }, { stem: 'faggot' }, { stem: 'wetback' }, { stem: 'raghead' },
  { stem: 'towelhead' }, { stem: 'sandnigger' }, { stem: 'neger' }, { stem: 'schwuchtel' }, { stem: 'kanake' }, { stem: 'judensau' },
];
/** Slurs that are only offensive as a word of their own (plurals included). */
const WORDS = ['fag', 'fags', 'kike', 'spic', 'chink', 'gook', 'coon', 'beaner', 'tranny', 'retard', 'retarded', 'kys', 'nig', 'zigeuner'];
/** Multi-word phrases. */
const PHRASES = [
  'kill yourself', 'kill urself', 'kill your self', 'kill ur self', 'hang yourself', 'neck yourself', 'go kill yourself', 'drink bleach',
  'heil hitler', 'sieg heil', 'gas the jews', 'white power', 'bring dich um', 'hang dich auf', 'erhang dich',
];

interface Matcher { label: string; test: (ws: string[], joined: string) => boolean }

const stemMatcher = (stem: string, allow?: RegExp, acrossWords = false): Matcher => {
  const re = new RegExp(stretch(stem));
  return { label: stem, test: (ws, joined) => ws.some((w) => re.test(w) && !(allow && allow.test(w))) || (acrossWords && re.test(joined.replace(/ /g, ''))) };
};
const wordMatcher = (word: string): Matcher => {
  const re = new RegExp(`^${stretch(word)}(?:s+|z+|e+s+)?$`);
  return { label: word, test: (ws) => ws.some((w) => re.test(w)) };
};
const phraseMatcher = (phrase: string): Matcher => {
  const re = new RegExp(`(?:^| )${phrase.split(' ').map(stretch).join(' ')}(?: |$)`);
  return { label: phrase, test: (_ws, joined) => re.test(joined) };
};

const BUILT_IN: Matcher[] = [...STEMS.map((s) => stemMatcher(s.stem, s.allow)), ...WORDS.map(wordMatcher), ...PHRASES.map(phraseMatcher)];

/**
 * Operator-added entries: several words = phrase; 5+ letters = also inside longer words and across spaces or
 * dots ("rust.cheap" for "rustcheap"), since these are usually site names; shorter = whole word only.
 */
function customMatchers(extra: readonly string[]): Matcher[] {
  const out: Matcher[] = [];
  for (const e of extra) {
    const ws = words(e);
    if (!ws.length) continue;
    out.push(ws.length > 1 ? phraseMatcher(ws.join(' ')) : ws[0].length >= 5 ? stemMatcher(ws[0], undefined, true) : wordMatcher(ws[0]));
  }
  return out;
}
const customCache = new Map<string, Matcher[]>();

/** The blocked entry the text contains, or null. `extra` are the operator's own entries. */
export function blockedWord(text: string, extra: readonly string[] = []): string | null {
  const ws = words(text);
  if (!ws.length) return null;
  const joined = ws.join(' ');
  const key = extra.join('\n');
  let custom = customCache.get(key);
  if (!custom) {
    if (customCache.size > 20) customCache.clear();
    custom = customMatchers(extra);
    customCache.set(key, custom);
  }
  for (const m of BUILT_IN) if (m.test(ws, joined)) return m.label;
  for (const m of custom) if (m.test(ws, joined)) return m.label;
  return null;
}

/* ---------- names that pose as staff or the site ---------- */

/** Anywhere in the name, separators removed ("Site_Supp0rt" → "sitesupport"). */
const RESERVED_PARTS = ['admin', 'moderator', 'support', 'scrapline', 'official', 'staff', 'helpdesk', 'cashier'];
/** As a word of their own ("Mod Max", "xBotx" is fine, "Bot" is not). */
const RESERVED_WORDS = ['mod', 'mods', 'owner', 'system', 'bot', 'dev', 'developer', 'ceo', 'operator'];
/** Real words that contain a reserved part. */
const NAME_ALLOW = /badminton/;

export function reservedName(name: string): boolean {
  const ws = words(name.replace(/([a-z])([A-Z])/g, '$1 $2'));
  const squashed = ws.join('');
  if (RESERVED_PARTS.some((p) => squashed.includes(p)) && !NAME_ALLOW.test(squashed)) return true;
  return ws.some((w) => RESERVED_WORDS.includes(w));
}

/** Why a display name is refused, or null when it is fine. */
export function nameProblem(name: string, extra: readonly string[] = []): 'reserved' | 'blocked' | null {
  if (blockedWord(name, extra)) return 'blocked';
  return reservedName(name) ? 'reserved' : null;
}
