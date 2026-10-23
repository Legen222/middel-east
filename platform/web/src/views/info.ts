import { GAMES } from '../games';
import type { View } from '../main';

/**
 * Static pages: terms, privacy, help and "not found". The texts describe what this build actually does
 * (play money, what is stored where); real-money operation needs its own, licence-specific terms.
 */

const page = (eyebrow: string, title: string, intro: string, sections: [string, string][]) => `
  <section class="card">
    <p class="eyebrow">${eyebrow}</p><h1 class="h-display">${title}</h1>
    <p class="muted" style="max-width:70ch">${intro}</p>
  </section>
  <section class="card prose">${sections.map(([h, body]) => `<h2 class="h-sect">${h}</h2>${body}`).join('')}</section>`;

export const HELP_LINES = `<a href="https://www.begambleaware.org" target="_blank" rel="noopener">BeGambleAware</a> · <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener">Gamblers Anonymous</a> · <a href="https://www.check-dein-spiel.de" target="_blank" rel="noopener">Check dein Spiel</a>`;

export const termsView: View = {
  title: 'Terms',
  html: () => page('Legal', 'Terms of play', 'The rules of this play-money demo. A real-money launch comes with licence-specific terms that replace these.', [
    ['1 · Play money only', '<p>Frags are play money. They have no cash value, cannot be bought, sold, traded or withdrawn, and are not a prize. 100 Frags are shown as 1 $ only to make prices readable.</p>'],
    ['2 · Who may play', '<p>You must be at least 18 years old and confirm this when you sign up. Access from sanctioned countries is blocked. One account per person.</p>'],
    ['3 · Fair play', `<p>Every game publishes its maths and its house edge; ${GAMES.length} games, RTP 93 % to 99.31 %. Every round can be replayed from its seeds on the <a href="#/fair">Provably fair</a> page and in the <a href="#/verify">Verifier</a>. PvP seats and jackpot entries marked “Demo bot” are filled by the house with play money.</p>`],
    ['4 · Limits and breaks', '<p>You can set deposit, wager and loss limits, take a break or exclude yourself on <a href="#/limits">Responsible play</a>. Lower limits apply at once; higher limits and removals only after a waiting period.</p>'],
    ['5 · Conduct', '<p>Chat: no slurs, hate speech, harassment or threats; no links or advertising; no begging, trading or selling; no names or messages that pose as staff. Staff carry a MOD or ADMIN badge and never ask for passwords, Steam Guard codes or items. Messages caught by the word filter are refused; repeated attempts mute the account. Players can report messages, and moderators can delete messages and mute accounts. Operators can put an account on hold; every operator action is audited.</p>'],
    ['6 · Changes and resets', '<p>Game rules, crates and limits can change; a crate edit never changes a round that already started, and old versions stay verifiable. The browser demo can be reset at any time with “Reset demo”.</p>'],
  ]),
};

export const privacyView: View = {
  title: 'Privacy',
  html: () => page('Legal', 'Privacy', 'What this build stores, where, and why. No advertising, no tracking cookies, no analytics.', [
    ['What we store', `<ul>
      <li><b>Account:</b> display name, the time you confirmed you are 18+, country code from the network edge (for the country checks), role.</li>
      <li><b>Play:</b> bets, seeds, results and every balance change (needed to replay rounds and keep the books).</li>
      <li><b>Chat:</b> your messages and moderation actions.</li>
      <li><b>Sessions:</b> a hash of your sign-in token and its expiry. The token itself never leaves your browser.</li>
      <li><b>Responsible play:</b> your limits, breaks and reality-check setting.</li>
      <li><b>Audit log:</b> sign-ups, profile changes and every operator action.</li>
    </ul>`],
    ['Where', '<p>The browser demo runs the whole server inside this page: everything stays in your browser\'s local storage on this device, and “Reset demo” deletes it. On a hosted server the same data lives in its database.</p>'],
    ['In your browser', '<p>Local storage keeps your sign-in token, the chat-panel preference and, in the demo, the database. Nothing is shared with third parties. Fonts load from Google Fonts, which sees your IP address when it serves them.</p>'],
    ['Your choices', '<p>Hide your name in public lists and change it in your <a href="#/profile">Profile</a>. Sign out on every device there. Your full <a href="#/history">History</a> and <a href="#/wallet">Wallet</a> are always visible to you.</p>'],
  ]),
};

const FAQ: [string, string][] = [
  ['Why can I not write in chat?', 'Chat unlocks at a small level so throwaway spam accounts stay out; play a few rounds and it opens. Reading is open to everyone. A break, self-exclusion or a mute also makes the chat read-only. The rules are under “Chat rules” below the chat.'],
  ['How do I get Frags?', 'Every new account starts with play money. When your balance runs low, refill it in the <a href="#/wallet">Wallet</a> once a day. Rewards, rakeback and the Oil Rain in the chat add more.'],
  ['What do RTP and house edge mean?', 'RTP is the share of all stakes a game pays back over many rounds; the house edge is the rest. Dice pays back 98 %, so the edge is 2 %. Every game page shows both.'],
  ['How do I check a round?', 'Open it in <a href="#/history">History</a> and press “Verify in browser”. Your own games need the server seed first: rotate your seed on <a href="#/fair">Provably fair</a> and it is revealed. Shared games (crash, wheel, PvP, jackpot) can be checked right after the round.'],
  ['Why can I not rotate my seed?', 'A Minefield, Raid, Monument Run, Hi-Lo or Blackjack round is still open. Finish or cash it out first, so its outcome cannot change.'],
  ['Who are the demo bots?', 'In the demo the house fills empty PvP seats and jackpot entries with bots that play with house money. They are always labelled, and they play by the same seeds and rules.'],
  ['How do limits work?', 'Set them on <a href="#/limits">Responsible play</a>. Lowering a limit applies immediately; raising or removing one waits 24 hours. Breaks and self-exclusion cannot be undone early.'],
  ['Can I hide my name?', 'Yes: in your <a href="#/profile">Profile</a>. Public lists then show “Hidden player”; you still see your own seats.'],
];

export const helpView: View = {
  title: 'Help',
  html: () => `
  <section class="card">
    <p class="eyebrow">Help</p><h1 class="h-display">Questions and answers</h1>
    <p class="muted" style="max-width:70ch">Short answers to what players ask most. Gambling can be addictive; if it stops being fun, take a break or talk to someone: ${HELP_LINES}.</p>
  </section>
  <section class="card faq">${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</section>`,
};

export const notFoundView: View = {
  title: 'Not found',
  html: () => `
  <section class="card" style="align-items:flex-start">
    <p class="eyebrow">404</p><h1 class="h-display">This page does not exist</h1>
    <p class="muted">The link may be old or mistyped.</p>
    <div class="row"><a class="btn" href="#/">Back to the lobby</a><a class="btn ghost" href="#/help">Help</a></div>
  </section>`,
};
