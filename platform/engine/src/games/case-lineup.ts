/**
 * The crate line-up, written by `npm run build-crates` (platform/server/tools/build-crates.ts) on 2026-11-03.
 * Only real Rust skins with a picture. value = market price × ITEM_VALUE_BOOST (1.5) in Scrap
 * in whole cents (1 Scrap = 1 $, so 11651 is 116.51 Scrap); the comment is the market price it was taken from. Do not edit by hand: re-run the tool.
 */
import type { CaseDef, CaseItem } from './cases';

export const CASE_LINEUP: CaseDef[] = [
  {
    id: "barrel",
    name: "Barrel",
    items: [
      { name: "Green Jacket", value: 17, weight: 34433 }, // $0.11
      { name: "Black Bandana", value: 29, weight: 23395 }, // $0.19
      { name: "Snow Camo Bandana", value: 51, weight: 15549 }, // $0.34
      { name: "Spring Carrot House", value: 75, weight: 11763 }, // $0.50
      { name: "Star Bedroll", value: 140, weight: 7488 }, // $0.93
      { name: "Slime Monster Tommy", value: 300, weight: 4314 }, // $2.00
      { name: "Reptile Hunter Large Backpack", value: 798, weight: 2125 }, // $5.32
      { name: "Comics AR", value: 2489, weight: 933 }, // $16.59
    ],
  },
  {
    id: "oil-barrel",
    name: "Oil Barrel",
    items: [
      { name: "Forest Camo Bandana", value: 33, weight: 35029 }, // $0.22
      { name: "Scrap Robot Door", value: 60, weight: 22751 }, // $0.40
      { name: "Star Python", value: 101, weight: 15623 }, // $0.67
      { name: "Sunrise Bucket Helmet", value: 150, weight: 11743 }, // $1.00
      { name: "Punkish Gloves", value: 281, weight: 7464 }, // $1.87
      { name: "Shadowborn Metal Double Door", value: 600, weight: 4317 }, // $4.00
      { name: "Spooky Slime Furnace", value: 1599, weight: 2128 }, // $10.66
      { name: "Cow Moo Flage Pants", value: 4914, weight: 946 }, // $32.76
    ],
  },
  {
    id: "wooden-crate",
    name: "Wooden Crate",
    items: [
      { name: "Angler Fish Miners Hat", value: 53, weight: 36136 }, // $0.35
      { name: "Sunbaked Salvage Axe", value: 105, weight: 22203 }, // $0.70
      { name: "Shimmering Custom SMG", value: 176, weight: 15368 }, // $1.17
      { name: "Sky Seal Hoodie", value: 264, weight: 11512 }, // $1.76
      { name: "Stone Pick Axe from Hell", value: 491, weight: 7402 }, // $3.27
      { name: "Heat Seeker Revolver", value: 1050, weight: 4305 }, // $7.00
      { name: "Desert Raiders Roadsign Pants", value: 2775, weight: 2154 }, // $18.50
      { name: "Rustigé Egg - Blue", value: 9147, weight: 921 }, // $60.98
    ],
  },
  {
    id: "ration-box",
    name: "Ration Box",
    items: [
      { name: "Shippy Crate", value: 75, weight: 36013 }, // $0.50
      { name: "Stealth Python", value: 150, weight: 22077 }, // $1.00
      { name: "Zap Slasher", value: 251, weight: 15350 }, // $1.67
      { name: "Protector Armored Double Door", value: 375, weight: 11562 }, // $2.50
      { name: "Desert Raiders Gloves", value: 701, weight: 7434 }, // $4.67
      { name: "Neon Clothes Storage", value: 1500, weight: 4345 }, // $10.00
      { name: "Scarecrow", value: 3942, weight: 2197 }, // $26.28
      { name: "Stainless Facemask", value: 11651, weight: 1022 }, // $77.67
    ],
  },
  {
    id: "food-box",
    name: "Food Box",
    items: [
      { name: "Sunflowers Garage Door", value: 113, weight: 36023 }, // $0.75
      { name: "Snake Lord Garage Door", value: 225, weight: 22112 }, // $1.50
      { name: "Black Gold L96", value: 375, weight: 15397 }, // $2.50
      { name: "Pearl Python", value: 563, weight: 11545 }, // $3.75
      { name: "Playmaker AK47", value: 1049, weight: 7439 }, // $6.99
      { name: "Raven", value: 2250, weight: 4326 }, // $15.00
      { name: "Surgeon Scrubs", value: 5807, weight: 2209 }, // $38.71
      { name: "Alien Red", value: 18819, weight: 960 }, // $125.46
    ],
  },
  {
    id: "toolbox",
    name: "Tool Box",
    items: [
      { name: "Scary Kilt", value: 150, weight: 36061 }, // $1.00
      { name: "Optimized SAP", value: 300, weight: 22073 }, // $2.00
      { name: "Neon Food Storage", value: 500, weight: 15375 }, // $3.33
      { name: "Abyss Sleeping Bag", value: 750, weight: 11539 }, // $5.00
      { name: "Cobalt Container Double Door", value: 1400, weight: 7418 }, // $9.33
      { name: "AK-47 From Hell", value: 2966, weight: 4360 }, // $19.77
      { name: "Forest Raiders Helmet", value: 7635, weight: 2232 }, // $50.90
      { name: "Hot-tempered Longsword", value: 25580, weight: 949 }, // $170.53
    ],
  },
  {
    id: "medical-crate",
    name: "Medical Crate",
    items: [
      { name: "Skullkiller Kilt", value: 225, weight: 35925 }, // $1.50
      { name: "Runic Ice Pick", value: 450, weight: 22035 }, // $3.00
      { name: "Winter Scout", value: 750, weight: 15370 }, // $5.00
      { name: "Whiteout Roadsign Gloves", value: 1124, weight: 11555 }, // $7.49
      { name: "Scorched Hammer", value: 2097, weight: 7447 }, // $13.98
      { name: "Forest Raiders Pants", value: 4463, weight: 4370 }, // $29.75
      { name: "Legendary Gold Facemask", value: 10949, weight: 2321 }, // $72.99
      { name: "Glory AK47", value: 37223, weight: 979 }, // $248.15
    ],
  },
  {
    id: "military-crate",
    name: "Military Crate",
    items: [
      { name: "JPEG MP5", value: 300, weight: 36345 }, // $2.00
      { name: "Murderer T-Shirt", value: 599, weight: 22174 }, // $3.99
      { name: "Red Skull Bandana", value: 999, weight: 15385 }, // $6.66
      { name: "Military Vest", value: 1499, weight: 11512 }, // $9.99
      { name: "Dragon Furnace", value: 2865, weight: 7246 }, // $19.10
      { name: "AK Royale", value: 5780, weight: 4388 }, // $38.53
      { name: "Digital Camo MP5", value: 16143, weight: 2106 }, // $107.62
      { name: "Neon Dragon Garage Door", value: 58260, weight: 842 }, // $388.40
    ],
  },
  {
    id: "supply-drop",
    name: "Supply Drop",
    items: [
      { name: "Dragon Door", value: 450, weight: 36060 }, // $3.00
      { name: "Yellow Police Jacket", value: 900, weight: 22104 }, // $6.00
      { name: "Dark Arts Icepick", value: 1499, weight: 15419 }, // $9.99
      { name: "Dragon Glass Stone Pickaxe", value: 2252, weight: 11567 }, // $15.01
      { name: "Double Door from Hell", value: 4205, weight: 7443 }, // $28.03
      { name: "Desert Raiders Facemask", value: 9528, weight: 4178 }, // $63.52
      { name: "Tempered Mask", value: 24249, weight: 2160 }, // $161.66
      { name: "Freshly Dug Grave", value: 65699, weight: 1069 }, // $437.99
    ],
  },
  {
    id: "elite-crate",
    name: "Elite Crate",
    items: [
      { name: "Werewolf Rug", value: 675, weight: 36391 }, // $4.50
      { name: "Christmas Bag", value: 1349, weight: 22191 }, // $8.99
      { name: "Brutalist Sheet Metal Door", value: 2252, weight: 15388 }, // $15.01
      { name: "Desert Raiders Hoodie", value: 3372, weight: 11533 }, // $22.48
      { name: "Shard of True Ice", value: 6348, weight: 7339 }, // $42.32
      { name: "Incarceration Armored Door", value: 13881, weight: 4197 }, // $92.54
      { name: "Glory AK47", value: 37223, weight: 2074 }, // $248.15
      { name: "Horror Bag", value: 122061, weight: 888 }, // $813.74
    ],
  },
  {
    id: "locked-crate",
    name: "Locked Crate",
    items: [
      { name: "Deluxe Christmas Lights", value: 900, weight: 36000 }, // $6.00
      { name: "No War Guitar", value: 1814, weight: 21911 }, // $12.09
      { name: "Blackout Hoodie", value: 3062, weight: 15121 }, // $20.41
      { name: "Desert Raiders Pants", value: 4362, weight: 11768 }, // $29.08
      { name: "Desert Raiders Chest Plate", value: 7439, weight: 8078 }, // $49.59
      { name: "Gold Rock", value: 18077, weight: 4298 }, // $120.51
      { name: "Tempered Mp5", value: 61985, weight: 1795 }, // $413.23
      { name: "Big Grin", value: 133574, weight: 1042 }, // $890.49
    ],
  },
  {
    id: "bradley-crate",
    name: "Bradley Crate",
    items: [
      { name: "Spooky Speaker", value: 1199, weight: 36167 }, // $7.99
      { name: "Forest Raiders Metal Chest Plate", value: 2405, weight: 21973 }, // $16.03
      { name: "Neon Boom Storage", value: 4077, weight: 15060 }, // $27.18
      { name: "Polymer MP5", value: 5772, weight: 11742 }, // $38.48
      { name: "Forest Raiders Roadsign Pants", value: 10422, weight: 7692 }, // $69.48
      { name: "*S* Door", value: 21665, weight: 4556 }, // $144.43
      { name: "Fire jacket", value: 64182, weight: 2094 }, // $427.88
      { name: "Punishment Mask", value: 285240, weight: 720 }, // $1901.60
    ],
  },
  {
    id: "heli-crate",
    name: "Heli Crate",
    items: [
      { name: "Redemption Kilt", value: 1503, weight: 35312 }, // $10.02
      { name: "Whiteout Kilt", value: 2877, weight: 22368 }, // $19.18
      { name: "Howling Double Door", value: 5100, weight: 14958 }, // $34.00
      { name: "Rust Island Car Rug", value: 7326, weight: 11595 }, // $48.84
      { name: "Frostbite", value: 14031, weight: 7344 }, // $93.54
      { name: "Glowing Skull", value: 20634, weight: 5600 }, // $137.56
      { name: "Alien Relic SMG", value: 92835, weight: 1946 }, // $618.90
      { name: "Punishment Mask", value: 285240, weight: 884 }, // $1901.60
    ],
  },
  {
    id: "oil-rig",
    name: "Large Oil Rig",
    items: [
      { name: "Scientific Fuel Storage", value: 2274, weight: 34567 }, // $15.16
      { name: "Soviet Carpet", value: 4305, weight: 22289 }, // $28.70
      { name: "Forest Raiders Roadsign Vest", value: 7307, weight: 15492 }, // $48.71
      { name: "Creepy Jack", value: 10388, weight: 12164 }, // $69.25
      { name: "Christmas Lights", value: 19349, weight: 7931 }, // $128.99
      { name: "Neon Dragon Garage Door", value: 58260, weight: 3717 }, // $388.40
      { name: "Creepy Clown Bandana", value: 98378, weight: 2593 }, // $655.85
      { name: "Punishment Mask", value: 285240, weight: 1247 }, // $1901.60
    ],
  },
  {
    id: "cargo-ship",
    name: "Cargo Ship",
    items: [
      { name: "Wakizashi", value: 2876, weight: 34619 }, // $19.17
      { name: "Burlap Ninja Slippers", value: 5732, weight: 21884 }, // $38.21
      { name: "Plate Carrier - Black", value: 9977, weight: 15138 }, // $66.51
      { name: "Crime Bag", value: 15186, weight: 11448 }, // $101.24
      { name: "Hot-tempered Longsword", value: 25580, weight: 8094 }, // $170.53
      { name: "Tempered Mp5", value: 61985, weight: 4493 }, // $413.23
      { name: "Big Grin", value: 133574, weight: 2696 }, // $890.49
      { name: "Punishment Mask", value: 285240, weight: 1628 }, // $1901.60
    ],
  },
  {
    id: "underwater-lab",
    name: "Underwater Lab",
    items: [
      { name: "Polymer SAP", value: 4265, weight: 35869 }, // $28.43
      { name: "Christmas Tree Door", value: 9656, weight: 20883 }, // $64.37
      { name: "Banana Eoka", value: 17165, weight: 14271 }, // $114.43
      { name: "*S* Door", value: 21665, weight: 12233 }, // $144.43
      { name: "Fire jacket", value: 64182, weight: 5962 }, // $427.88
      { name: "Alien Relic SMG", value: 92835, weight: 4670 }, // $618.90
      { name: "Horror Bag", value: 122061, weight: 3896 }, // $813.74
      { name: "Punishment Mask", value: 285240, weight: 2222 }, // $1901.60
    ],
  },
  {
    id: "launch-site",
    name: "Launch Site",
    items: [
      { name: "Demonic Pistol", value: 6705, weight: 24344 }, // $44.70
      { name: "Camo Netting", value: 10193, weight: 20276 }, // $67.95
      { name: "Tempered Mask", value: 24249, weight: 13888 }, // $161.66
      { name: "Glory AK47", value: 37223, weight: 11518 }, // $248.15
      { name: "Freshly Dug Grave", value: 65699, weight: 8988 }, // $437.99
      { name: "Creepy Clown Bandana", value: 98378, weight: 7535 }, // $655.85
      { name: "Horror Bag", value: 122061, weight: 6858 }, // $813.74
      { name: "Big Grin", value: 133574, weight: 6593 }, // $890.49
    ],
  },
  {
    id: "large-present",
    name: "Large Present",
    items: [
      { name: "After Death AR", value: 9717, weight: 22686 }, // $64.78
      { name: "Christmas Lights", value: 19349, weight: 17242 }, // $128.99
      { name: "Glowing Skull", value: 20634, weight: 16806 }, // $137.56
      { name: "Neon Dragon Garage Door", value: 58260, weight: 11116 }, // $388.40
      { name: "Alien Relic SMG", value: 92835, weight: 9234 }, // $618.90
      { name: "Creepy Clown Bandana", value: 98378, weight: 9023 }, // $655.85
      { name: "Big Grin", value: 133574, weight: 7989 }, // $890.49
      { name: "Punishment Mask", value: 285240, weight: 5906 }, // $1901.60
    ],
  },
  {
    id: "missile-silo",
    name: "Missile Silo",
    items: [
      { name: "Crime Bag", value: 15186, weight: 14629 }, // $101.24
      { name: "Alien Red", value: 18819, weight: 14297 }, // $125.46
      { name: "Tempered Mp5", value: 61985, weight: 12587 }, // $413.23
      { name: "Freshly Dug Grave", value: 65699, weight: 12509 }, // $437.99
      { name: "Creepy Clown Bandana", value: 98378, weight: 11981 }, // $655.85
      { name: "Horror Bag", value: 122061, weight: 11708 }, // $813.74
      { name: "Big Grin", value: 133574, weight: 11596 }, // $890.49
      { name: "Punishment Mask", value: 285240, weight: 10693 }, // $1901.60
    ],
  },
  {
    id: "gold-egg",
    name: "Gold Egg",
    items: [
      { name: "Gold Rock", value: 18077, weight: 4514 }, // $120.51
      { name: "Fire jacket", value: 64182, weight: 9568 }, // $427.88
      { name: "Freshly Dug Grave", value: 65699, weight: 9702 }, // $437.99
      { name: "Alien Relic SMG", value: 92835, weight: 11911 }, // $618.90
      { name: "Creepy Clown Bandana", value: 98378, weight: 12328 }, // $655.85
      { name: "Horror Bag", value: 122061, weight: 14012 }, // $813.74
      { name: "Big Grin", value: 133574, weight: 14781 }, // $890.49
      { name: "Punishment Mask", value: 285240, weight: 23188 }, // $1901.60
    ],
  },
];

/** The daily Scrap Crate (server rewards.ts). */
export const DAILY_LINEUP: CaseItem[] = [
  { name: "Blue Hoodie", value: 17, weight: 57069 }, // $0.11
  { name: "Grey Longsleeve T-Shirt", value: 26, weight: 30125 }, // $0.17
  { name: "Ser Winter TShirt", value: 51, weight: 10938 }, // $0.34
  { name: "Steampunk Leather Mask", value: 170, weight: 1789 }, // $1.13
  { name: "Frostbitten Revolver", value: 1370, weight: 78 }, // $9.13
  { name: "Hot-tempered Longsword", value: 25580, weight: 1 }, // $170.53
];
