/**
 * One list of every game: the lobby, the game bar, the spec line on each game page and the history table
 * read from here. `id` is the server's game id; `rtp` and `edge` are the published figures (proofs and
 * Monte Carlo runs in platform/engine).
 */

export type GameCategory = 'originals' | 'cards' | 'live' | 'pvp';

export interface GameMeta {
  path: string;
  id: string;
  name: string;
  icon: string;
  cat: GameCategory;
  rtp: string;
  edge: string;
  line: string;
  tag?: 'LIVE' | 'NEW' | 'SIGNATURE';
}

export const CATEGORIES: [GameCategory, string, string][] = [
  ['originals', 'Originals', 'Single-player games with a proven RTP for every strategy.'],
  ['cards', 'Cards', 'Infinite-deck card games, drawn from your own seed.'],
  ['live', 'Live', 'Shared rounds on a published hash chain and a public beacon.'],
  ['pvp', 'Cases & PvP', 'Every drop rate public; PvP decided by a beacon round nobody knows in advance.'],
];

export const GAMES: GameMeta[] = [
  { path: 'monument-run', id: 'towers', name: 'Monument Run', icon: 'tower', cat: 'originals', rtp: '97.00 %', edge: '3 %', line: 'Eight rooms, four keycards', tag: 'SIGNATURE' },
  { path: 'raid', id: 'raid', name: 'Raid', icon: 'raid', cat: 'originals', rtp: '97.00 %', edge: '3 %', line: 'Pick an explosive for every wall' },
  { path: 'minefield', id: 'mines', name: 'Minefield', icon: 'mine', cat: 'originals', rtp: '97.00 %', edge: '3 %', line: '5 × 5 field, 1 to 24 mines' },
  { path: 'dice', id: 'dice', name: 'Dice', icon: 'dice', cat: 'originals', rtp: '98.00 %', edge: '2 %', line: 'Any chance from 0.01 to 98 %' },
  { path: 'airdrop', id: 'airdrop', name: 'Airdrop', icon: 'airdrop', cat: 'originals', rtp: '98.00 %', edge: '2 %', line: 'Pick a target from 1.01× to 10,000×', tag: 'NEW' },
  { path: 'scrap-chute', id: 'plinko', name: 'Scrap Chute', icon: 'plinko', cat: 'originals', rtp: '96.5–97 %', edge: '≈ 3 %', line: '8, 12 or 16 rows, three risk tables' },
  { path: 'workbench', id: 'upgrader', name: 'Workbench', icon: 'upgrade', cat: 'originals', rtp: '95.00 %', edge: '5 %', line: 'Drag your win zone, spin the needle', tag: 'NEW' },
  { path: 'blackjack', id: 'blackjack', name: 'Blackjack', icon: 'cards', cat: 'cards', rtp: '99.31 %', edge: '0.69 %', line: '3:2, dealer stands on 17, peeks', tag: 'NEW' },
  { path: 'hi-lo', id: 'hilo', name: 'Hi-Lo', icon: 'cards', cat: 'cards', rtp: '97.00 %', edge: '3 %', line: 'Higher or lower, skips are free', tag: 'NEW' },
  { path: 'scrap-press', id: 'crash', name: 'Scrap Press', icon: 'crash', cat: 'live', rtp: '98.00 %', edge: '2 %', line: 'Live crash, cash out in time', tag: 'LIVE' },
  { path: 'bandit-wheel', id: 'wheel', name: 'Bandit Wheel', icon: 'wheel', cat: 'live', rtp: '96.00 %', edge: '4 %', line: 'Bet on 1, 3, 5, 10 or 20', tag: 'LIVE' },
  { path: 'jackpot', id: 'jackpot', name: 'Jackpot', icon: 'pot', cat: 'live', rtp: '96.00 %', edge: '4 % of the pot', line: 'Your share of the pot is your chance', tag: 'LIVE' },
  { path: 'cases', id: 'cases', name: 'Crate opening', icon: 'crate', cat: 'pvp', rtp: '≤ 93 %', edge: '≥ 7 %', line: 'Twenty crates, $1 to $1,500' },
  { path: 'battle', id: 'battle', name: 'Case Battle', icon: 'battle', cat: 'pvp', rtp: '≤ 93 %', edge: '≥ 7 %', line: 'Bonus mode: power rounds, final spin', tag: 'NEW' },
  { path: 'coinflip', id: 'coinflip', name: 'Coinflip', icon: 'coin', cat: 'pvp', rtp: '96.00 %', edge: '4 % of the pot', line: 'Rust or Scrap, one coin' },
];

export const gameByPath = (path: string) => GAMES.find((g) => g.path === path);
export const gameName = (id: string) => GAMES.find((g) => g.id === id)?.name ?? id;
