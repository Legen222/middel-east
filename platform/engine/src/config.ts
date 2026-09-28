/** House edge per game (fraction of stake). The single source of truth for RTP = 1 − edge. */
export const EDGE = {
  dice: 0.02,
  crash: 0.02,
  mines: 0.03,
  plinko: 0.03,
  raid: 0.03,
  upgrader: 0.05,
  coinflip: 0.04, // rake taken from the pot
  cases: 0.07, // target; each case is priced so its RTP is at most 1 − 0.07
} as const;

/** SCRAPLINE display names. */
export const DISPLAY_NAME = {
  dice: 'Dice',
  crash: 'Scrap Press',
  mines: 'Minefield',
  plinko: 'Scrap Chute',
  raid: 'Raid',
  upgrader: 'Workbench',
  coinflip: 'Coinflip',
  cases: 'Cases',
  battles: 'Case Battle',
} as const;
