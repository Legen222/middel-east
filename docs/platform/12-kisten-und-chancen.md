# 12 · Kisten, Items und Chancen

Erzeugt aus den Spieldaten (`platform/engine/src/games/case-lineup.ts`) mit `npm run crate-table` im Ordner `platform/engine`. Die Seite **Crate odds** (`#/crates`) zeigt dieselben Zahlen in der App.

**So entstehen die Zahlen:**
- **Chance:** Gewicht des Items ÷ Summe aller Gewichte der Kiste. Sie ist exakt und bei jeder Öffnung gleich.
- **Preis:** Erwartungswert ÷ 0,93, auf den Cent aufgerundet. Damit zahlt jede Kiste höchstens 93 % zurück; der Hausvorteil ist mindestens 7 %.
- **Umrechnung:** 1 Scrap = 1 $, angezeigt mit zwei Nachkommastellen.
- **Item-Werte:** Jedes Item ist ein echter Rust-Skin mit Bild. Sein Wert ist der Marktpreis (Skinport) × 1.5 in Scrap; die Kisten erzeugt `npm run build-crates` in `platform/server`. Auszahlungen aus dem Bestand kosten denselben Faktor (`WITHDRAW_RATE`).

**Seltenheit (relativ zum Kistenpreis):**

| Seltenheit | Wert |
|---|---|
| Legendär | ab 20 × Preis |
| Episch | ab 5 × |
| Selten | ab 2 × |
| Ungewöhnlich | ab 1 × |
| Gewöhnlich | unter dem Preis |

Dieselben Kisten gelten für Kisten-Öffnen und Case Battle.

## Übersicht

| # | Kiste | Preis (Scrap) | RTP | Erwartungswert | Items | Bestes Item | Seine Chance |
|---|---|---:|---:|---:|---:|---|---:|
| 1 | Barrel | 1,00 | 93,00 % | 0,93 | 8 | Comics AR (24,89) | 0,933 % |
| 2 | Oil Barrel | 2,00 | 93,00 % | 1,86 | 8 | Cow Moo Flage Pants (49,14) | 0,946 % |
| 3 | Wooden Crate | 3,50 | 92,99 % | 3,25 | 8 | Rustigé Egg - Blue (91,47) | 0,921 % |
| 4 | Ration Box | 5,00 | 93,00 % | 4,65 | 8 | Stainless Facemask (116,51) | 1,02 % |
| 5 | Food Box | 7,50 | 92,99 % | 6,97 | 8 | Alien Red (188,19) | 0,960 % |
| 6 | Tool Box | 10,00 | 93,00 % | 9,30 | 8 | Hot-tempered Longsword (255,80) | 0,949 % |
| 7 | Medical Crate | 15,00 | 92,99 % | 13,95 | 8 | Glory AK47 (372,23) | 0,979 % |
| 8 | Military Crate | 20,00 | 93,00 % | 18,60 | 8 | Neon Dragon Garage Door (582,60) | 0,842 % |
| 9 | Supply Drop | 30,00 | 93,00 % | 27,90 | 8 | Freshly Dug Grave (656,99) | 1,07 % |
| 10 | Elite Crate | 45,00 | 92,99 % | 41,85 | 8 | Horror Bag (1.220,61) | 0,888 % |
| 11 | Locked Crate | 60,00 | 92,99 % | 55,79 | 8 | Big Grin (1.335,74) | 1,04 % |
| 12 | Bradley Crate | 80,00 | 93,00 % | 74,40 | 8 | Punishment Mask (2.852,40) | 0,720 % |
| 13 | Heli Crate | 100,00 | 93,00 % | 93,00 | 8 | Punishment Mask (2.852,40) | 0,884 % |
| 14 | Large Oil Rig | 150,00 | 92,99 % | 139,49 | 8 | Punishment Mask (2.852,40) | 1,25 % |
| 15 | Cargo Ship | 200,00 | 93,00 % | 185,99 | 8 | Punishment Mask (2.852,40) | 1,63 % |
| 16 | Underwater Lab | 300,00 | 93,00 % | 279,00 | 8 | Punishment Mask (2.852,40) | 2,22 % |
| 17 | Launch Site | 450,00 | 93,00 % | 418,49 | 8 | Big Grin (1.335,74) | 6,59 % |
| 18 | Large Present | 650,00 | 93,00 % | 604,50 | 8 | Punishment Mask (2.852,40) | 5,91 % |
| 19 | Missile Silo | 1.000,00 | 93,00 % | 930,00 | 8 | Punishment Mask (2.852,40) | 10,69 % |
| 20 | Gold Egg | 1.500,00 | 93,00 % | 1.394,99 | 8 | Punishment Mask (2.852,40) | 23,19 % |

## Alle Kisten im Detail

### Barrel · 1,00 Scrap

RTP 93,00 % · Erwartungswert 0,93 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Comics AR | Legendär | 24,89 | 24,89 × | 0,933 % | 107 |
| Reptile Hunter Large Backpack | Episch | 7,98 | 7,98 × | 2,13 % | 47 |
| Slime Monster Tommy | Selten | 3,00 | 3,00 × | 4,31 % | 23 |
| Star Bedroll | Ungewöhnlich | 1,40 | 1,40 × | 7,49 % | 13 |
| Spring Carrot House | Gewöhnlich | 0,75 | 0,75 × | 11,76 % | 8,5 |
| Snow Camo Bandana | Gewöhnlich | 0,51 | 0,51 × | 15,55 % | 6,4 |
| Black Bandana | Gewöhnlich | 0,29 | 0,29 × | 23,40 % | 4,3 |
| Green Jacket | Gewöhnlich | 0,17 | 0,17 × | 34,43 % | 2,9 |

### Oil Barrel · 2,00 Scrap

RTP 93,00 % · Erwartungswert 1,86 Scrap · 8 Items · Gewichtssumme 100.001

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Cow Moo Flage Pants | Legendär | 49,14 | 24,57 × | 0,946 % | 106 |
| Spooky Slime Furnace | Episch | 15,99 | 8,00 × | 2,13 % | 47 |
| Shadowborn Metal Double Door | Selten | 6,00 | 3,00 × | 4,32 % | 23 |
| Punkish Gloves | Ungewöhnlich | 2,81 | 1,41 × | 7,46 % | 13 |
| Sunrise Bucket Helmet | Gewöhnlich | 1,50 | 0,75 × | 11,74 % | 8,5 |
| Star Python | Gewöhnlich | 1,01 | 0,51 × | 15,62 % | 6,4 |
| Scrap Robot Door | Gewöhnlich | 0,60 | 0,30 × | 22,75 % | 4,4 |
| Forest Camo Bandana | Gewöhnlich | 0,33 | 0,17 × | 35,03 % | 2,9 |

### Wooden Crate · 3,50 Scrap

RTP 92,99 % · Erwartungswert 3,25 Scrap · 8 Items · Gewichtssumme 100.001

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Rustigé Egg - Blue | Legendär | 91,47 | 26,13 × | 0,921 % | 109 |
| Desert Raiders Roadsign Pants | Episch | 27,75 | 7,93 × | 2,15 % | 46 |
| Heat Seeker Revolver | Selten | 10,50 | 3,00 × | 4,30 % | 23 |
| Stone Pick Axe from Hell | Ungewöhnlich | 4,91 | 1,40 × | 7,40 % | 14 |
| Sky Seal Hoodie | Gewöhnlich | 2,64 | 0,75 × | 11,51 % | 8,7 |
| Shimmering Custom SMG | Gewöhnlich | 1,76 | 0,50 × | 15,37 % | 6,5 |
| Sunbaked Salvage Axe | Gewöhnlich | 1,05 | 0,30 × | 22,20 % | 4,5 |
| Angler Fish Miners Hat | Gewöhnlich | 0,53 | 0,15 × | 36,14 % | 2,8 |

### Ration Box · 5,00 Scrap

RTP 93,00 % · Erwartungswert 4,65 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Stainless Facemask | Legendär | 116,51 | 23,30 × | 1,02 % | 98 |
| Scarecrow | Episch | 39,42 | 7,88 × | 2,20 % | 46 |
| Neon Clothes Storage | Selten | 15,00 | 3,00 × | 4,35 % | 23 |
| Desert Raiders Gloves | Ungewöhnlich | 7,01 | 1,40 × | 7,43 % | 13 |
| Protector Armored Double Door | Gewöhnlich | 3,75 | 0,75 × | 11,56 % | 8,6 |
| Zap Slasher | Gewöhnlich | 2,51 | 0,50 × | 15,35 % | 6,5 |
| Stealth Python | Gewöhnlich | 1,50 | 0,30 × | 22,08 % | 4,5 |
| Shippy Crate | Gewöhnlich | 0,75 | 0,15 × | 36,01 % | 2,8 |

### Food Box · 7,50 Scrap

RTP 92,99 % · Erwartungswert 6,97 Scrap · 8 Items · Gewichtssumme 100.011

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Alien Red | Legendär | 188,19 | 25,09 × | 0,960 % | 104 |
| Surgeon Scrubs | Episch | 58,07 | 7,74 × | 2,21 % | 45 |
| Raven | Selten | 22,50 | 3,00 × | 4,33 % | 23 |
| Playmaker AK47 | Ungewöhnlich | 10,49 | 1,40 × | 7,44 % | 13 |
| Pearl Python | Gewöhnlich | 5,63 | 0,75 × | 11,54 % | 8,7 |
| Black Gold L96 | Gewöhnlich | 3,75 | 0,50 × | 15,40 % | 6,5 |
| Snake Lord Garage Door | Gewöhnlich | 2,25 | 0,30 × | 22,11 % | 4,5 |
| Sunflowers Garage Door | Gewöhnlich | 1,13 | 0,15 × | 36,02 % | 2,8 |

### Tool Box · 10,00 Scrap

RTP 93,00 % · Erwartungswert 9,30 Scrap · 8 Items · Gewichtssumme 100.007

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Hot-tempered Longsword | Legendär | 255,80 | 25,58 × | 0,949 % | 105 |
| Forest Raiders Helmet | Episch | 76,35 | 7,64 × | 2,23 % | 45 |
| AK-47 From Hell | Selten | 29,66 | 2,97 × | 4,36 % | 23 |
| Cobalt Container Double Door | Ungewöhnlich | 14,00 | 1,40 × | 7,42 % | 13 |
| Abyss Sleeping Bag | Gewöhnlich | 7,50 | 0,75 × | 11,54 % | 8,7 |
| Neon Food Storage | Gewöhnlich | 5,00 | 0,50 × | 15,37 % | 6,5 |
| Optimized SAP | Gewöhnlich | 3,00 | 0,30 × | 22,07 % | 4,5 |
| Scary Kilt | Gewöhnlich | 1,50 | 0,15 × | 36,06 % | 2,8 |

### Medical Crate · 15,00 Scrap

RTP 92,99 % · Erwartungswert 13,95 Scrap · 8 Items · Gewichtssumme 100.002

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Glory AK47 | Legendär | 372,23 | 24,82 × | 0,979 % | 102 |
| Legendary Gold Facemask | Episch | 109,49 | 7,30 × | 2,32 % | 43 |
| Forest Raiders Pants | Selten | 44,63 | 2,98 × | 4,37 % | 23 |
| Scorched Hammer | Ungewöhnlich | 20,97 | 1,40 × | 7,45 % | 13 |
| Whiteout Roadsign Gloves | Gewöhnlich | 11,24 | 0,75 × | 11,55 % | 8,7 |
| Winter Scout | Gewöhnlich | 7,50 | 0,50 × | 15,37 % | 6,5 |
| Runic Ice Pick | Gewöhnlich | 4,50 | 0,30 × | 22,03 % | 4,5 |
| Skullkiller Kilt | Gewöhnlich | 2,25 | 0,15 × | 35,92 % | 2,8 |

### Military Crate · 20,00 Scrap

RTP 93,00 % · Erwartungswert 18,60 Scrap · 8 Items · Gewichtssumme 99.998

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Neon Dragon Garage Door | Legendär | 582,60 | 29,13 × | 0,842 % | 119 |
| Digital Camo MP5 | Episch | 161,43 | 8,07 × | 2,11 % | 47 |
| AK Royale | Selten | 57,80 | 2,89 × | 4,39 % | 23 |
| Dragon Furnace | Ungewöhnlich | 28,65 | 1,43 × | 7,25 % | 14 |
| Military Vest | Gewöhnlich | 14,99 | 0,75 × | 11,51 % | 8,7 |
| Red Skull Bandana | Gewöhnlich | 9,99 | 0,50 × | 15,39 % | 6,5 |
| Murderer T-Shirt | Gewöhnlich | 5,99 | 0,30 × | 22,17 % | 4,5 |
| JPEG MP5 | Gewöhnlich | 3,00 | 0,15 × | 36,35 % | 2,8 |

### Supply Drop · 30,00 Scrap

RTP 93,00 % · Erwartungswert 27,90 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Freshly Dug Grave | Legendär | 656,99 | 21,90 × | 1,07 % | 94 |
| Tempered Mask | Episch | 242,49 | 8,08 × | 2,16 % | 46 |
| Desert Raiders Facemask | Selten | 95,28 | 3,18 × | 4,18 % | 24 |
| Double Door from Hell | Ungewöhnlich | 42,05 | 1,40 × | 7,44 % | 13 |
| Dragon Glass Stone Pickaxe | Gewöhnlich | 22,52 | 0,75 × | 11,57 % | 8,6 |
| Dark Arts Icepick | Gewöhnlich | 14,99 | 0,50 × | 15,42 % | 6,5 |
| Yellow Police Jacket | Gewöhnlich | 9,00 | 0,30 × | 22,10 % | 4,5 |
| Dragon Door | Gewöhnlich | 4,50 | 0,15 × | 36,06 % | 2,8 |

### Elite Crate · 45,00 Scrap

RTP 92,99 % · Erwartungswert 41,85 Scrap · 8 Items · Gewichtssumme 100.001

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Horror Bag | Legendär | 1.220,61 | 27,12 × | 0,888 % | 113 |
| Glory AK47 | Episch | 372,23 | 8,27 × | 2,07 % | 48 |
| Incarceration Armored Door | Selten | 138,81 | 3,08 × | 4,20 % | 24 |
| Shard of True Ice | Ungewöhnlich | 63,48 | 1,41 × | 7,34 % | 14 |
| Desert Raiders Hoodie | Gewöhnlich | 33,72 | 0,75 × | 11,53 % | 8,7 |
| Brutalist Sheet Metal Door | Gewöhnlich | 22,52 | 0,50 × | 15,39 % | 6,5 |
| Christmas Bag | Gewöhnlich | 13,49 | 0,30 × | 22,19 % | 4,5 |
| Werewolf Rug | Gewöhnlich | 6,75 | 0,15 × | 36,39 % | 2,7 |

### Locked Crate · 60,00 Scrap

RTP 92,99 % · Erwartungswert 55,79 Scrap · 8 Items · Gewichtssumme 100.013

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Big Grin | Legendär | 1.335,74 | 22,26 × | 1,04 % | 96 |
| Tempered Mp5 | Episch | 619,85 | 10,33 × | 1,79 % | 56 |
| Gold Rock | Selten | 180,77 | 3,01 × | 4,30 % | 23 |
| Desert Raiders Chest Plate | Ungewöhnlich | 74,39 | 1,24 × | 8,08 % | 12 |
| Desert Raiders Pants | Gewöhnlich | 43,62 | 0,73 × | 11,77 % | 8,5 |
| Blackout Hoodie | Gewöhnlich | 30,62 | 0,51 × | 15,12 % | 6,6 |
| No War Guitar | Gewöhnlich | 18,14 | 0,30 × | 21,91 % | 4,6 |
| Deluxe Christmas Lights | Gewöhnlich | 9,00 | 0,15 × | 36,00 % | 2,8 |

### Bradley Crate · 80,00 Scrap

RTP 93,00 % · Erwartungswert 74,40 Scrap · 8 Items · Gewichtssumme 100.004

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Legendär | 2.852,40 | 35,66 × | 0,720 % | 139 |
| Fire jacket | Episch | 641,82 | 8,02 × | 2,09 % | 48 |
| *S* Door | Selten | 216,65 | 2,71 × | 4,56 % | 22 |
| Forest Raiders Roadsign Pants | Ungewöhnlich | 104,22 | 1,30 × | 7,69 % | 13 |
| Polymer MP5 | Gewöhnlich | 57,72 | 0,72 × | 11,74 % | 8,5 |
| Neon Boom Storage | Gewöhnlich | 40,77 | 0,51 × | 15,06 % | 6,6 |
| Forest Raiders Metal Chest Plate | Gewöhnlich | 24,05 | 0,30 × | 21,97 % | 4,6 |
| Spooky Speaker | Gewöhnlich | 11,99 | 0,15 × | 36,17 % | 2,8 |

### Heli Crate · 100,00 Scrap

RTP 93,00 % · Erwartungswert 93,00 Scrap · 8 Items · Gewichtssumme 100.007

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Legendär | 2.852,40 | 28,52 × | 0,884 % | 113 |
| Alien Relic SMG | Episch | 928,35 | 9,28 × | 1,95 % | 51 |
| Glowing Skull | Selten | 206,34 | 2,06 × | 5,60 % | 18 |
| Frostbite | Ungewöhnlich | 140,31 | 1,40 × | 7,34 % | 14 |
| Rust Island Car Rug | Gewöhnlich | 73,26 | 0,73 × | 11,59 % | 8,6 |
| Howling Double Door | Gewöhnlich | 51,00 | 0,51 × | 14,96 % | 6,7 |
| Whiteout Kilt | Gewöhnlich | 28,77 | 0,29 × | 22,37 % | 4,5 |
| Redemption Kilt | Gewöhnlich | 15,03 | 0,15 × | 35,31 % | 2,8 |

### Large Oil Rig · 150,00 Scrap

RTP 92,99 % · Erwartungswert 139,49 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Episch | 2.852,40 | 19,02 × | 1,25 % | 80 |
| Creepy Clown Bandana | Episch | 983,78 | 6,56 × | 2,59 % | 39 |
| Neon Dragon Garage Door | Selten | 582,60 | 3,88 × | 3,72 % | 27 |
| Christmas Lights | Ungewöhnlich | 193,49 | 1,29 × | 7,93 % | 13 |
| Creepy Jack | Gewöhnlich | 103,88 | 0,69 × | 12,16 % | 8,2 |
| Forest Raiders Roadsign Vest | Gewöhnlich | 73,07 | 0,49 × | 15,49 % | 6,5 |
| Soviet Carpet | Gewöhnlich | 43,05 | 0,29 × | 22,29 % | 4,5 |
| Scientific Fuel Storage | Gewöhnlich | 22,74 | 0,15 × | 34,57 % | 2,9 |

### Cargo Ship · 200,00 Scrap

RTP 93,00 % · Erwartungswert 185,99 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Episch | 2.852,40 | 14,26 × | 1,63 % | 61 |
| Big Grin | Episch | 1.335,74 | 6,68 × | 2,70 % | 37 |
| Tempered Mp5 | Selten | 619,85 | 3,10 × | 4,49 % | 22 |
| Hot-tempered Longsword | Ungewöhnlich | 255,80 | 1,28 × | 8,09 % | 12 |
| Crime Bag | Gewöhnlich | 151,86 | 0,76 × | 11,45 % | 8,7 |
| Plate Carrier - Black | Gewöhnlich | 99,77 | 0,50 × | 15,14 % | 6,6 |
| Burlap Ninja Slippers | Gewöhnlich | 57,32 | 0,29 × | 21,88 % | 4,6 |
| Wakizashi | Gewöhnlich | 28,76 | 0,14 × | 34,62 % | 2,9 |

### Underwater Lab · 300,00 Scrap

RTP 93,00 % · Erwartungswert 279,00 Scrap · 8 Items · Gewichtssumme 100.006

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Episch | 2.852,40 | 9,51 × | 2,22 % | 45 |
| Horror Bag | Selten | 1.220,61 | 4,07 × | 3,90 % | 26 |
| Alien Relic SMG | Selten | 928,35 | 3,09 × | 4,67 % | 21 |
| Fire jacket | Selten | 641,82 | 2,14 × | 5,96 % | 17 |
| *S* Door | Gewöhnlich | 216,65 | 0,72 × | 12,23 % | 8,2 |
| Banana Eoka | Gewöhnlich | 171,65 | 0,57 × | 14,27 % | 7,0 |
| Christmas Tree Door | Gewöhnlich | 96,56 | 0,32 × | 20,88 % | 4,8 |
| Polymer SAP | Gewöhnlich | 42,65 | 0,14 × | 35,87 % | 2,8 |

### Launch Site · 450,00 Scrap

RTP 93,00 % · Erwartungswert 418,49 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Big Grin | Selten | 1.335,74 | 2,97 × | 6,59 % | 15 |
| Horror Bag | Selten | 1.220,61 | 2,71 × | 6,86 % | 15 |
| Creepy Clown Bandana | Selten | 983,78 | 2,19 × | 7,54 % | 13 |
| Freshly Dug Grave | Ungewöhnlich | 656,99 | 1,46 × | 8,99 % | 11 |
| Glory AK47 | Gewöhnlich | 372,23 | 0,83 × | 11,52 % | 8,7 |
| Tempered Mask | Gewöhnlich | 242,49 | 0,54 × | 13,89 % | 7,2 |
| Camo Netting | Gewöhnlich | 101,93 | 0,23 × | 20,28 % | 4,9 |
| Demonic Pistol | Gewöhnlich | 67,05 | 0,15 × | 24,34 % | 4,1 |

### Large Present · 650,00 Scrap

RTP 93,00 % · Erwartungswert 604,50 Scrap · 8 Items · Gewichtssumme 100.002

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Selten | 2.852,40 | 4,39 × | 5,91 % | 17 |
| Big Grin | Selten | 1.335,74 | 2,05 × | 7,99 % | 13 |
| Creepy Clown Bandana | Ungewöhnlich | 983,78 | 1,51 × | 9,02 % | 11 |
| Alien Relic SMG | Ungewöhnlich | 928,35 | 1,43 × | 9,23 % | 11 |
| Neon Dragon Garage Door | Gewöhnlich | 582,60 | 0,90 × | 11,12 % | 9,0 |
| Glowing Skull | Gewöhnlich | 206,34 | 0,32 × | 16,81 % | 6,0 |
| Christmas Lights | Gewöhnlich | 193,49 | 0,30 × | 17,24 % | 5,8 |
| After Death AR | Gewöhnlich | 97,17 | 0,15 × | 22,69 % | 4,4 |

### Missile Silo · 1.000,00 Scrap

RTP 93,00 % · Erwartungswert 930,00 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Selten | 2.852,40 | 2,85 × | 10,69 % | 9,4 |
| Big Grin | Ungewöhnlich | 1.335,74 | 1,34 × | 11,60 % | 8,6 |
| Horror Bag | Ungewöhnlich | 1.220,61 | 1,22 × | 11,71 % | 8,5 |
| Creepy Clown Bandana | Gewöhnlich | 983,78 | 0,98 × | 11,98 % | 8,3 |
| Freshly Dug Grave | Gewöhnlich | 656,99 | 0,66 × | 12,51 % | 8,0 |
| Tempered Mp5 | Gewöhnlich | 619,85 | 0,62 × | 12,59 % | 7,9 |
| Alien Red | Gewöhnlich | 188,19 | 0,19 × | 14,30 % | 7,0 |
| Crime Bag | Gewöhnlich | 151,86 | 0,15 × | 14,63 % | 6,8 |

### Gold Egg · 1.500,00 Scrap

RTP 93,00 % · Erwartungswert 1.394,99 Scrap · 8 Items · Gewichtssumme 100.004

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Ungewöhnlich | 2.852,40 | 1,90 × | 23,19 % | 4,3 |
| Big Grin | Gewöhnlich | 1.335,74 | 0,89 × | 14,78 % | 6,8 |
| Horror Bag | Gewöhnlich | 1.220,61 | 0,81 × | 14,01 % | 7,1 |
| Creepy Clown Bandana | Gewöhnlich | 983,78 | 0,66 × | 12,33 % | 8,1 |
| Alien Relic SMG | Gewöhnlich | 928,35 | 0,62 × | 11,91 % | 8,4 |
| Freshly Dug Grave | Gewöhnlich | 656,99 | 0,44 × | 9,70 % | 10 |
| Fire jacket | Gewöhnlich | 641,82 | 0,43 × | 9,57 % | 10 |
| Gold Rock | Gewöhnlich | 180,77 | 0,12 × | 4,51 % | 22 |
