# 12 · Kisten, Items und Chancen

Erzeugt aus den Spieldaten (`platform/engine/src/games/case-lineup.ts`) mit `npm run crate-table` im Ordner `platform/engine`. Die Seite **Crate odds** (`#/crates`) zeigt dieselben Zahlen in der App.

**So entstehen die Zahlen:**
- **Chance:** Gewicht des Items ÷ Summe aller Gewichte der Kiste. Sie ist exakt und bei jeder Öffnung gleich.
- **Preis:** Erwartungswert ÷ 0,93, auf ganze Scrap aufgerundet. Damit zahlt jede Kiste höchstens 93 % zurück; der Hausvorteil ist mindestens 7 %.
- **Umrechnung:** 100 Scrap = 1 $.
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

| # | Kiste | Preis (Scrap) | ≈ $ | RTP | Erwartungswert | Items | Bestes Item | Seine Chance |
|---|---|---:|---:|---:|---:|---:|---|---:|
| 1 | Barrel | 100 | 1 | 93,00 % | 93,00 | 8 | Comics AR (2.489) | 0,933 % |
| 2 | Oil Barrel | 200 | 2 | 93,00 % | 185,99 | 8 | Cow Moo Flage Pants (4.914) | 0,946 % |
| 3 | Wooden Crate | 350 | 3,50 | 92,99 % | 325,47 | 8 | Rustigé Egg - Blue (9.147) | 0,921 % |
| 4 | Ration Box | 500 | 5 | 93,00 % | 464,98 | 8 | Stainless Facemask (11.651) | 1,02 % |
| 5 | Food Box | 750 | 7,50 | 92,99 % | 697,43 | 8 | Alien Red (18.819) | 0,960 % |
| 6 | Tool Box | 1.000 | 10 | 93,00 % | 930,00 | 8 | Hot-tempered Longsword (25.580) | 0,949 % |
| 7 | Medical Crate | 1.500 | 15 | 92,99 % | 1.394,85 | 8 | Glory AK47 (37.223) | 0,979 % |
| 8 | Military Crate | 2.000 | 20 | 93,00 % | 1.859,90 | 8 | Neon Dragon Garage Door (58.260) | 0,842 % |
| 9 | Supply Drop | 3.000 | 30 | 93,00 % | 2.789,98 | 8 | Freshly Dug Grave (65.699) | 1,07 % |
| 10 | Elite Crate | 4.500 | 45 | 92,99 % | 4.184,76 | 8 | Horror Bag (122.061) | 0,888 % |
| 11 | Locked Crate | 6.000 | 60 | 92,99 % | 5.579,41 | 8 | Big Grin (133.574) | 1,04 % |
| 12 | Bradley Crate | 8.000 | 80 | 93,00 % | 7.439,96 | 8 | Punishment Mask (285.240) | 0,720 % |
| 13 | Heli Crate | 10.000 | 100 | 93,00 % | 9.299,95 | 8 | Punishment Mask (285.240) | 0,884 % |
| 14 | Large Oil Rig | 15.000 | 150 | 92,99 % | 13.949,17 | 8 | Punishment Mask (285.240) | 1,25 % |
| 15 | Cargo Ship | 20.000 | 200 | 93,00 % | 18.599,14 | 8 | Punishment Mask (285.240) | 1,63 % |
| 16 | Underwater Lab | 30.000 | 300 | 93,00 % | 27.899,95 | 8 | Punishment Mask (285.240) | 2,22 % |
| 17 | Launch Site | 45.000 | 450 | 93,00 % | 41.849,33 | 8 | Big Grin (133.574) | 6,59 % |
| 18 | Large Present | 65.000 | 650 | 93,00 % | 60.449,81 | 8 | Punishment Mask (285.240) | 5,91 % |
| 19 | Missile Silo | 100.000 | 1.000 | 93,00 % | 92.999,98 | 8 | Punishment Mask (285.240) | 10,69 % |
| 20 | Gold Egg | 150.000 | 1.500 | 93,00 % | 139.499,29 | 8 | Punishment Mask (285.240) | 23,19 % |

## Alle Kisten im Detail

### Barrel · 100 Scrap (≈ 1 $)

RTP 93,00 % · Erwartungswert 93,00 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Comics AR | Legendär | 2.489 | 24,89 × | 0,933 % | 107 |
| Reptile Hunter Large Backpack | Episch | 798 | 7,98 × | 2,13 % | 47 |
| Slime Monster Tommy | Selten | 300 | 3,00 × | 4,31 % | 23 |
| Star Bedroll | Ungewöhnlich | 140 | 1,40 × | 7,49 % | 13 |
| Spring Carrot House | Gewöhnlich | 75 | 0,75 × | 11,76 % | 8,5 |
| Snow Camo Bandana | Gewöhnlich | 51 | 0,51 × | 15,55 % | 6,4 |
| Black Bandana | Gewöhnlich | 29 | 0,29 × | 23,40 % | 4,3 |
| Green Jacket | Gewöhnlich | 17 | 0,17 × | 34,43 % | 2,9 |

### Oil Barrel · 200 Scrap (≈ 2 $)

RTP 93,00 % · Erwartungswert 185,99 Scrap · 8 Items · Gewichtssumme 100.001

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Cow Moo Flage Pants | Legendär | 4.914 | 24,57 × | 0,946 % | 106 |
| Spooky Slime Furnace | Episch | 1.599 | 8,00 × | 2,13 % | 47 |
| Shadowborn Metal Double Door | Selten | 600 | 3,00 × | 4,32 % | 23 |
| Punkish Gloves | Ungewöhnlich | 281 | 1,41 × | 7,46 % | 13 |
| Sunrise Bucket Helmet | Gewöhnlich | 150 | 0,75 × | 11,74 % | 8,5 |
| Star Python | Gewöhnlich | 101 | 0,51 × | 15,62 % | 6,4 |
| Scrap Robot Door | Gewöhnlich | 60 | 0,30 × | 22,75 % | 4,4 |
| Forest Camo Bandana | Gewöhnlich | 33 | 0,17 × | 35,03 % | 2,9 |

### Wooden Crate · 350 Scrap (≈ 3,50 $)

RTP 92,99 % · Erwartungswert 325,47 Scrap · 8 Items · Gewichtssumme 100.001

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Rustigé Egg - Blue | Legendär | 9.147 | 26,13 × | 0,921 % | 109 |
| Desert Raiders Roadsign Pants | Episch | 2.775 | 7,93 × | 2,15 % | 46 |
| Heat Seeker Revolver | Selten | 1.050 | 3,00 × | 4,30 % | 23 |
| Stone Pick Axe from Hell | Ungewöhnlich | 491 | 1,40 × | 7,40 % | 14 |
| Sky Seal Hoodie | Gewöhnlich | 264 | 0,75 × | 11,51 % | 8,7 |
| Shimmering Custom SMG | Gewöhnlich | 176 | 0,50 × | 15,37 % | 6,5 |
| Sunbaked Salvage Axe | Gewöhnlich | 105 | 0,30 × | 22,20 % | 4,5 |
| Angler Fish Miners Hat | Gewöhnlich | 53 | 0,15 × | 36,14 % | 2,8 |

### Ration Box · 500 Scrap (≈ 5 $)

RTP 93,00 % · Erwartungswert 464,98 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Stainless Facemask | Legendär | 11.651 | 23,30 × | 1,02 % | 98 |
| Scarecrow | Episch | 3.942 | 7,88 × | 2,20 % | 46 |
| Neon Clothes Storage | Selten | 1.500 | 3,00 × | 4,35 % | 23 |
| Desert Raiders Gloves | Ungewöhnlich | 701 | 1,40 × | 7,43 % | 13 |
| Protector Armored Double Door | Gewöhnlich | 375 | 0,75 × | 11,56 % | 8,6 |
| Zap Slasher | Gewöhnlich | 251 | 0,50 × | 15,35 % | 6,5 |
| Stealth Python | Gewöhnlich | 150 | 0,30 × | 22,08 % | 4,5 |
| Shippy Crate | Gewöhnlich | 75 | 0,15 × | 36,01 % | 2,8 |

### Food Box · 750 Scrap (≈ 7,50 $)

RTP 92,99 % · Erwartungswert 697,43 Scrap · 8 Items · Gewichtssumme 100.011

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Alien Red | Legendär | 18.819 | 25,09 × | 0,960 % | 104 |
| Surgeon Scrubs | Episch | 5.807 | 7,74 × | 2,21 % | 45 |
| Raven | Selten | 2.250 | 3,00 × | 4,33 % | 23 |
| Playmaker AK47 | Ungewöhnlich | 1.049 | 1,40 × | 7,44 % | 13 |
| Pearl Python | Gewöhnlich | 563 | 0,75 × | 11,54 % | 8,7 |
| Black Gold L96 | Gewöhnlich | 375 | 0,50 × | 15,40 % | 6,5 |
| Snake Lord Garage Door | Gewöhnlich | 225 | 0,30 × | 22,11 % | 4,5 |
| Sunflowers Garage Door | Gewöhnlich | 113 | 0,15 × | 36,02 % | 2,8 |

### Tool Box · 1.000 Scrap (≈ 10 $)

RTP 93,00 % · Erwartungswert 930,00 Scrap · 8 Items · Gewichtssumme 100.007

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Hot-tempered Longsword | Legendär | 25.580 | 25,58 × | 0,949 % | 105 |
| Forest Raiders Helmet | Episch | 7.635 | 7,64 × | 2,23 % | 45 |
| AK-47 From Hell | Selten | 2.966 | 2,97 × | 4,36 % | 23 |
| Cobalt Container Double Door | Ungewöhnlich | 1.400 | 1,40 × | 7,42 % | 13 |
| Abyss Sleeping Bag | Gewöhnlich | 750 | 0,75 × | 11,54 % | 8,7 |
| Neon Food Storage | Gewöhnlich | 500 | 0,50 × | 15,37 % | 6,5 |
| Optimized SAP | Gewöhnlich | 300 | 0,30 × | 22,07 % | 4,5 |
| Scary Kilt | Gewöhnlich | 150 | 0,15 × | 36,06 % | 2,8 |

### Medical Crate · 1.500 Scrap (≈ 15 $)

RTP 92,99 % · Erwartungswert 1.394,85 Scrap · 8 Items · Gewichtssumme 100.002

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Glory AK47 | Legendär | 37.223 | 24,82 × | 0,979 % | 102 |
| Legendary Gold Facemask | Episch | 10.949 | 7,30 × | 2,32 % | 43 |
| Forest Raiders Pants | Selten | 4.463 | 2,98 × | 4,37 % | 23 |
| Scorched Hammer | Ungewöhnlich | 2.097 | 1,40 × | 7,45 % | 13 |
| Whiteout Roadsign Gloves | Gewöhnlich | 1.124 | 0,75 × | 11,55 % | 8,7 |
| Winter Scout | Gewöhnlich | 750 | 0,50 × | 15,37 % | 6,5 |
| Runic Ice Pick | Gewöhnlich | 450 | 0,30 × | 22,03 % | 4,5 |
| Skullkiller Kilt | Gewöhnlich | 225 | 0,15 × | 35,92 % | 2,8 |

### Military Crate · 2.000 Scrap (≈ 20 $)

RTP 93,00 % · Erwartungswert 1.859,90 Scrap · 8 Items · Gewichtssumme 99.998

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Neon Dragon Garage Door | Legendär | 58.260 | 29,13 × | 0,842 % | 119 |
| Digital Camo MP5 | Episch | 16.143 | 8,07 × | 2,11 % | 47 |
| AK Royale | Selten | 5.780 | 2,89 × | 4,39 % | 23 |
| Dragon Furnace | Ungewöhnlich | 2.865 | 1,43 × | 7,25 % | 14 |
| Military Vest | Gewöhnlich | 1.499 | 0,75 × | 11,51 % | 8,7 |
| Red Skull Bandana | Gewöhnlich | 999 | 0,50 × | 15,39 % | 6,5 |
| Murderer T-Shirt | Gewöhnlich | 599 | 0,30 × | 22,17 % | 4,5 |
| JPEG MP5 | Gewöhnlich | 300 | 0,15 × | 36,35 % | 2,8 |

### Supply Drop · 3.000 Scrap (≈ 30 $)

RTP 93,00 % · Erwartungswert 2.789,98 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Freshly Dug Grave | Legendär | 65.699 | 21,90 × | 1,07 % | 94 |
| Tempered Mask | Episch | 24.249 | 8,08 × | 2,16 % | 46 |
| Desert Raiders Facemask | Selten | 9.528 | 3,18 × | 4,18 % | 24 |
| Double Door from Hell | Ungewöhnlich | 4.205 | 1,40 × | 7,44 % | 13 |
| Dragon Glass Stone Pickaxe | Gewöhnlich | 2.252 | 0,75 × | 11,57 % | 8,6 |
| Dark Arts Icepick | Gewöhnlich | 1.499 | 0,50 × | 15,42 % | 6,5 |
| Yellow Police Jacket | Gewöhnlich | 900 | 0,30 × | 22,10 % | 4,5 |
| Dragon Door | Gewöhnlich | 450 | 0,15 × | 36,06 % | 2,8 |

### Elite Crate · 4.500 Scrap (≈ 45 $)

RTP 92,99 % · Erwartungswert 4.184,76 Scrap · 8 Items · Gewichtssumme 100.001

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Horror Bag | Legendär | 122.061 | 27,12 × | 0,888 % | 113 |
| Glory AK47 | Episch | 37.223 | 8,27 × | 2,07 % | 48 |
| Incarceration Armored Door | Selten | 13.881 | 3,08 × | 4,20 % | 24 |
| Shard of True Ice | Ungewöhnlich | 6.348 | 1,41 × | 7,34 % | 14 |
| Desert Raiders Hoodie | Gewöhnlich | 3.372 | 0,75 × | 11,53 % | 8,7 |
| Brutalist Sheet Metal Door | Gewöhnlich | 2.252 | 0,50 × | 15,39 % | 6,5 |
| Christmas Bag | Gewöhnlich | 1.349 | 0,30 × | 22,19 % | 4,5 |
| Werewolf Rug | Gewöhnlich | 675 | 0,15 × | 36,39 % | 2,7 |

### Locked Crate · 6.000 Scrap (≈ 60 $)

RTP 92,99 % · Erwartungswert 5.579,41 Scrap · 8 Items · Gewichtssumme 100.013

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Big Grin | Legendär | 133.574 | 22,26 × | 1,04 % | 96 |
| Tempered Mp5 | Episch | 61.985 | 10,33 × | 1,79 % | 56 |
| Gold Rock | Selten | 18.077 | 3,01 × | 4,30 % | 23 |
| Desert Raiders Chest Plate | Ungewöhnlich | 7.439 | 1,24 × | 8,08 % | 12 |
| Desert Raiders Pants | Gewöhnlich | 4.362 | 0,73 × | 11,77 % | 8,5 |
| Blackout Hoodie | Gewöhnlich | 3.062 | 0,51 × | 15,12 % | 6,6 |
| No War Guitar | Gewöhnlich | 1.814 | 0,30 × | 21,91 % | 4,6 |
| Deluxe Christmas Lights | Gewöhnlich | 900 | 0,15 × | 36,00 % | 2,8 |

### Bradley Crate · 8.000 Scrap (≈ 80 $)

RTP 93,00 % · Erwartungswert 7.439,96 Scrap · 8 Items · Gewichtssumme 100.004

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Legendär | 285.240 | 35,66 × | 0,720 % | 139 |
| Fire jacket | Episch | 64.182 | 8,02 × | 2,09 % | 48 |
| *S* Door | Selten | 21.665 | 2,71 × | 4,56 % | 22 |
| Forest Raiders Roadsign Pants | Ungewöhnlich | 10.422 | 1,30 × | 7,69 % | 13 |
| Polymer MP5 | Gewöhnlich | 5.772 | 0,72 × | 11,74 % | 8,5 |
| Neon Boom Storage | Gewöhnlich | 4.077 | 0,51 × | 15,06 % | 6,6 |
| Forest Raiders Metal Chest Plate | Gewöhnlich | 2.405 | 0,30 × | 21,97 % | 4,6 |
| Spooky Speaker | Gewöhnlich | 1.199 | 0,15 × | 36,17 % | 2,8 |

### Heli Crate · 10.000 Scrap (≈ 100 $)

RTP 93,00 % · Erwartungswert 9.299,95 Scrap · 8 Items · Gewichtssumme 100.007

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Legendär | 285.240 | 28,52 × | 0,884 % | 113 |
| Alien Relic SMG | Episch | 92.835 | 9,28 × | 1,95 % | 51 |
| Glowing Skull | Selten | 20.634 | 2,06 × | 5,60 % | 18 |
| Frostbite | Ungewöhnlich | 14.031 | 1,40 × | 7,34 % | 14 |
| Rust Island Car Rug | Gewöhnlich | 7.326 | 0,73 × | 11,59 % | 8,6 |
| Howling Double Door | Gewöhnlich | 5.100 | 0,51 × | 14,96 % | 6,7 |
| Whiteout Kilt | Gewöhnlich | 2.877 | 0,29 × | 22,37 % | 4,5 |
| Redemption Kilt | Gewöhnlich | 1.503 | 0,15 × | 35,31 % | 2,8 |

### Large Oil Rig · 15.000 Scrap (≈ 150 $)

RTP 92,99 % · Erwartungswert 13.949,17 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Episch | 285.240 | 19,02 × | 1,25 % | 80 |
| Creepy Clown Bandana | Episch | 98.378 | 6,56 × | 2,59 % | 39 |
| Neon Dragon Garage Door | Selten | 58.260 | 3,88 × | 3,72 % | 27 |
| Christmas Lights | Ungewöhnlich | 19.349 | 1,29 × | 7,93 % | 13 |
| Creepy Jack | Gewöhnlich | 10.388 | 0,69 × | 12,16 % | 8,2 |
| Forest Raiders Roadsign Vest | Gewöhnlich | 7.307 | 0,49 × | 15,49 % | 6,5 |
| Soviet Carpet | Gewöhnlich | 4.305 | 0,29 × | 22,29 % | 4,5 |
| Scientific Fuel Storage | Gewöhnlich | 2.274 | 0,15 × | 34,57 % | 2,9 |

### Cargo Ship · 20.000 Scrap (≈ 200 $)

RTP 93,00 % · Erwartungswert 18.599,14 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Episch | 285.240 | 14,26 × | 1,63 % | 61 |
| Big Grin | Episch | 133.574 | 6,68 × | 2,70 % | 37 |
| Tempered Mp5 | Selten | 61.985 | 3,10 × | 4,49 % | 22 |
| Hot-tempered Longsword | Ungewöhnlich | 25.580 | 1,28 × | 8,09 % | 12 |
| Crime Bag | Gewöhnlich | 15.186 | 0,76 × | 11,45 % | 8,7 |
| Plate Carrier - Black | Gewöhnlich | 9.977 | 0,50 × | 15,14 % | 6,6 |
| Burlap Ninja Slippers | Gewöhnlich | 5.732 | 0,29 × | 21,88 % | 4,6 |
| Wakizashi | Gewöhnlich | 2.876 | 0,14 × | 34,62 % | 2,9 |

### Underwater Lab · 30.000 Scrap (≈ 300 $)

RTP 93,00 % · Erwartungswert 27.899,95 Scrap · 8 Items · Gewichtssumme 100.006

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Episch | 285.240 | 9,51 × | 2,22 % | 45 |
| Horror Bag | Selten | 122.061 | 4,07 × | 3,90 % | 26 |
| Alien Relic SMG | Selten | 92.835 | 3,09 × | 4,67 % | 21 |
| Fire jacket | Selten | 64.182 | 2,14 × | 5,96 % | 17 |
| *S* Door | Gewöhnlich | 21.665 | 0,72 × | 12,23 % | 8,2 |
| Banana Eoka | Gewöhnlich | 17.165 | 0,57 × | 14,27 % | 7,0 |
| Christmas Tree Door | Gewöhnlich | 9.656 | 0,32 × | 20,88 % | 4,8 |
| Polymer SAP | Gewöhnlich | 4.265 | 0,14 × | 35,87 % | 2,8 |

### Launch Site · 45.000 Scrap (≈ 450 $)

RTP 93,00 % · Erwartungswert 41.849,33 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Big Grin | Selten | 133.574 | 2,97 × | 6,59 % | 15 |
| Horror Bag | Selten | 122.061 | 2,71 × | 6,86 % | 15 |
| Creepy Clown Bandana | Selten | 98.378 | 2,19 × | 7,54 % | 13 |
| Freshly Dug Grave | Ungewöhnlich | 65.699 | 1,46 × | 8,99 % | 11 |
| Glory AK47 | Gewöhnlich | 37.223 | 0,83 × | 11,52 % | 8,7 |
| Tempered Mask | Gewöhnlich | 24.249 | 0,54 × | 13,89 % | 7,2 |
| Camo Netting | Gewöhnlich | 10.193 | 0,23 × | 20,28 % | 4,9 |
| Demonic Pistol | Gewöhnlich | 6.705 | 0,15 × | 24,34 % | 4,1 |

### Large Present · 65.000 Scrap (≈ 650 $)

RTP 93,00 % · Erwartungswert 60.449,81 Scrap · 8 Items · Gewichtssumme 100.002

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Selten | 285.240 | 4,39 × | 5,91 % | 17 |
| Big Grin | Selten | 133.574 | 2,05 × | 7,99 % | 13 |
| Creepy Clown Bandana | Ungewöhnlich | 98.378 | 1,51 × | 9,02 % | 11 |
| Alien Relic SMG | Ungewöhnlich | 92.835 | 1,43 × | 9,23 % | 11 |
| Neon Dragon Garage Door | Gewöhnlich | 58.260 | 0,90 × | 11,12 % | 9,0 |
| Glowing Skull | Gewöhnlich | 20.634 | 0,32 × | 16,81 % | 6,0 |
| Christmas Lights | Gewöhnlich | 19.349 | 0,30 × | 17,24 % | 5,8 |
| After Death AR | Gewöhnlich | 9.717 | 0,15 × | 22,69 % | 4,4 |

### Missile Silo · 100.000 Scrap (≈ 1.000 $)

RTP 93,00 % · Erwartungswert 92.999,98 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Selten | 285.240 | 2,85 × | 10,69 % | 9,4 |
| Big Grin | Ungewöhnlich | 133.574 | 1,34 × | 11,60 % | 8,6 |
| Horror Bag | Ungewöhnlich | 122.061 | 1,22 × | 11,71 % | 8,5 |
| Creepy Clown Bandana | Gewöhnlich | 98.378 | 0,98 × | 11,98 % | 8,3 |
| Freshly Dug Grave | Gewöhnlich | 65.699 | 0,66 × | 12,51 % | 8,0 |
| Tempered Mp5 | Gewöhnlich | 61.985 | 0,62 × | 12,59 % | 7,9 |
| Alien Red | Gewöhnlich | 18.819 | 0,19 × | 14,30 % | 7,0 |
| Crime Bag | Gewöhnlich | 15.186 | 0,15 × | 14,63 % | 6,8 |

### Gold Egg · 150.000 Scrap (≈ 1.500 $)

RTP 93,00 % · Erwartungswert 139.499,29 Scrap · 8 Items · Gewichtssumme 100.004

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Ungewöhnlich | 285.240 | 1,90 × | 23,19 % | 4,3 |
| Big Grin | Gewöhnlich | 133.574 | 0,89 × | 14,78 % | 6,8 |
| Horror Bag | Gewöhnlich | 122.061 | 0,81 × | 14,01 % | 7,1 |
| Creepy Clown Bandana | Gewöhnlich | 98.378 | 0,66 × | 12,33 % | 8,1 |
| Alien Relic SMG | Gewöhnlich | 92.835 | 0,62 × | 11,91 % | 8,4 |
| Freshly Dug Grave | Gewöhnlich | 65.699 | 0,44 × | 9,70 % | 10 |
| Fire jacket | Gewöhnlich | 64.182 | 0,43 × | 9,57 % | 10 |
| Gold Rock | Gewöhnlich | 18.077 | 0,12 × | 4,51 % | 22 |
