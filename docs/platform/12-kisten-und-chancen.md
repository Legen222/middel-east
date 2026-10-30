# 12 · Kisten, Items und Chancen

Erzeugt aus den Spieldaten (`platform/engine/src/games/cases.ts`) mit `npm run crate-table` im Ordner `platform/engine`. Die Seite **Crate odds** (`#/crates`) zeigt dieselben Zahlen in der App.

**So entstehen die Zahlen:**
- **Chance:** Gewicht des Items ÷ Summe aller Gewichte der Kiste. Sie ist exakt und bei jeder Öffnung gleich.
- **Preis:** Erwartungswert ÷ 0,93, auf ganze Scrap aufgerundet. Damit zahlt jede Kiste höchstens 93 % zurück; der Hausvorteil ist mindestens 7 %.
- **Umrechnung:** 100 Scrap = 1 $.

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
| 1 | Barrel | 100 | 1 | 92,99 % | 92,99 | 8 | Alien Red (4.300) | 0,769 % |
| 2 | Oil Barrel | 200 | 2 | 93,00 % | 185,99 | 8 | AK-47 From Hell (3.509) | 1,47 % |
| 3 | Wooden Crate | 350 | 3,50 | 93,00 % | 325,50 | 8 | No Mercy Jacket (3.962) | 3,53 % |
| 4 | Ration Box | 500 | 5 | 93,00 % | 465,00 | 8 | Press Vest (3.468) | 5,85 % |
| 5 | Food Box | 750 | 7,50 | 93,00 % | 697,50 | 8 | Tempered AK47 (9.800) | 2,20 % |
| 6 | Tool Box | 1.000 | 10 | 93,00 % | 930,00 | 8 | Frostbite Facemask (14.200) | 2,75 % |
| 7 | Medical Crate | 1.500 | 15 | 93,00 % | 1.394,99 | 8 | Whiteout Facemask (18.500) | 3,07 % |
| 8 | Military Crate | 2.000 | 20 | 93,00 % | 1.860,00 | 8 | Glory AK47 (24.000) | 3,31 % |
| 9 | Supply Drop | 3.000 | 30 | 93,00 % | 2.789,99 | 8 | Big Grin (28.000) | 2,97 % |
| 10 | Elite Crate | 4.500 | 45 | 93,00 % | 4.184,99 | 8 | Punishment Mask (42.000) | 3,90 % |
| 11 | Locked Crate | 6.000 | 60 | 93,00 % | 5.579,99 | 8 | Glory AK47 (24.000) | 5,18 % |
| 12 | Bradley Crate | 8.000 | 80 | 93,00 % | 7.439,99 | 8 | Whiteout Set (48.000) | 0,791 % |
| 13 | Heli Crate | 10.000 | 100 | 93,00 % | 9.299,98 | 8 | Tempered Set (65.000) | 0,271 % |
| 14 | Large Oil Rig | 15.000 | 150 | 93,00 % | 13.949,97 | 8 | Glory Set (120.000) | 0,244 % |
| 15 | Cargo Ship | 20.000 | 200 | 93,00 % | 18.599,97 | 8 | Glory Set (120.000) | 0,403 % |
| 16 | Underwater Lab | 30.000 | 300 | 93,00 % | 27.899,99 | 8 | Punishment Set (210.000) | 0,098 % |
| 17 | Launch Site | 45.000 | 450 | 93,00 % | 41.849,99 | 8 | Raiders Collection (340.000) | 0,207 % |
| 18 | Large Present | 65.000 | 650 | 93,00 % | 60.449,97 | 8 | Gold Collection (480.000) | 0,280 % |
| 19 | Missile Silo | 100.000 | 1.000 | 93,00 % | 92.999,95 | 7 | Gold Collection (480.000) | 1,22 % |
| 20 | Gold Egg | 150.000 | 1.500 | 93,00 % | 139.499,79 | 6 | Gold Collection (480.000) | 3,57 % |

## Alle Kisten im Detail

### Barrel · 100 Scrap (≈ 1 $)

RTP 92,99 % · Erwartungswert 92,99 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Alien Red | Legendär | 4.300 | 43,00 × | 0,769 % | 130 |
| Assault Rifle | Episch | 900 | 9,00 × | 3,43 % | 29 |
| Python Revolver | Selten | 220 | 2,20 × | 6,98 % | 14 |
| Revolver | Gewöhnlich | 70 | 0,70 × | 11,23 % | 8,9 |
| Rope | Gewöhnlich | 15 | 0,15 × | 12,56 % | 8,0 |
| Hide Boots | Gewöhnlich | 8 | 0,08 × | 16,71 % | 6,0 |
| Burlap Shirt | Gewöhnlich | 6 | 0,06 × | 22,85 % | 4,4 |
| Bandage | Gewöhnlich | 5 | 0,05 × | 25,47 % | 3,9 |

### Oil Barrel · 200 Scrap (≈ 2 $)

RTP 93,00 % · Erwartungswert 185,99 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| AK-47 From Hell | Episch | 3.509 | 17,55 × | 1,47 % | 68 |
| Rocket Launcher | Episch | 1.800 | 9,00 × | 4,60 % | 22 |
| Thompson | Ungewöhnlich | 260 | 1,30 × | 9,03 % | 11 |
| Double Barrel Shotgun | Gewöhnlich | 90 | 0,45 × | 10,81 % | 9,2 |
| Metal Spring | Gewöhnlich | 50 | 0,25 × | 13,81 % | 7,2 |
| Metal Pipe | Gewöhnlich | 35 | 0,18 × | 18,79 % | 5,3 |
| Metal Fragments | Gewöhnlich | 15 | 0,08 × | 20,02 % | 5,0 |
| Low Grade Fuel | Gewöhnlich | 9 | 0,05 × | 21,47 % | 4,7 |

### Wooden Crate · 350 Scrap (≈ 3,50 $)

RTP 93,00 % · Erwartungswert 325,50 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| No Mercy Jacket | Episch | 3.962 | 11,32 × | 3,53 % | 28 |
| Bolt Action Rifle | Selten | 850 | 2,43 × | 9,13 % | 11 |
| Semi-Automatic Rifle | Gewöhnlich | 320 | 0,91 × | 12,01 % | 8,3 |
| Custom SMG | Gewöhnlich | 240 | 0,69 × | 15,93 % | 6,3 |
| Semi-Automatic Pistol | Gewöhnlich | 120 | 0,34 × | 17,10 % | 5,8 |
| Road Sign Kilt | Gewöhnlich | 40 | 0,11 × | 14,80 % | 6,8 |
| Sewing Kit | Gewöhnlich | 25 | 0,07 × | 14,78 % | 6,8 |
| Leather Gloves | Gewöhnlich | 10 | 0,03 × | 12,72 % | 7,9 |

### Ration Box · 500 Scrap (≈ 5 $)

RTP 93,00 % · Erwartungswert 465,00 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Press Vest | Episch | 3.468 | 6,94 × | 5,85 % | 17 |
| Timed Explosive Charge | Ungewöhnlich | 950 | 1,90 × | 10,85 % | 9,2 |
| Metal Facemask | Gewöhnlich | 480 | 0,96 × | 14,98 % | 6,7 |
| Hazmat Suit | Gewöhnlich | 300 | 0,60 × | 19,33 % | 5,2 |
| Large Medkit | Gewöhnlich | 90 | 0,18 × | 18,08 % | 5,5 |
| Road Sign Jacket | Gewöhnlich | 60 | 0,12 × | 11,28 % | 8,9 |
| Medical Syringe | Gewöhnlich | 40 | 0,08 × | 14,21 % | 7,0 |
| Bandage | Gewöhnlich | 5 | 0,01 × | 5,43 % | 18 |

### Food Box · 750 Scrap (≈ 7,50 $)

RTP 93,00 % · Erwartungswert 697,50 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Tempered AK47 | Episch | 9.800 | 13,07 × | 2,20 % | 45 |
| Blackout Pants | Selten | 3.037 | 4,05 × | 6,46 % | 15 |
| Assault Rifle | Ungewöhnlich | 900 | 1,20 × | 12,55 % | 8,0 |
| Metal Chest Plate | Gewöhnlich | 420 | 0,56 × | 14,27 % | 7,0 |
| Semi-Automatic Rifle | Gewöhnlich | 320 | 0,43 × | 18,41 % | 5,4 |
| Python Revolver | Gewöhnlich | 220 | 0,29 × | 21,15 % | 4,7 |
| Coffee Can Helmet | Gewöhnlich | 45 | 0,06 × | 14,51 % | 6,9 |
| Burlap Trousers | Gewöhnlich | 6 | 0,01 × | 10,46 % | 9,6 |

### Tool Box · 1.000 Scrap (≈ 10 $)

RTP 93,00 % · Erwartungswert 930,00 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Frostbite Facemask | Episch | 14.200 | 14,20 × | 2,75 % | 36 |
| Desert Raiders Hoodie | Selten | 3.081 | 3,08 × | 8,85 % | 11 |
| LR-300 Assault Rifle | Ungewöhnlich | 1.100 | 1,10 × | 13,15 % | 7,6 |
| Auto Turret | Gewöhnlich | 520 | 0,52 × | 16,64 % | 6,0 |
| Satchel Charge | Gewöhnlich | 120 | 0,12 × | 13,87 % | 7,2 |
| Metal Spring | Gewöhnlich | 50 | 0,05 × | 15,38 % | 6,5 |
| Tech Trash | Gewöhnlich | 45 | 0,05 × | 13,36 % | 7,5 |
| Gears | Gewöhnlich | 30 | 0,03 × | 16,00 % | 6,3 |

### Medical Crate · 1.500 Scrap (≈ 15 $)

RTP 93,00 % · Erwartungswert 1.394,99 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Whiteout Facemask | Episch | 18.500 | 12,33 × | 3,07 % | 33 |
| AK-47 From Hell | Selten | 3.509 | 2,34 × | 10,10 % | 9,9 |
| M39 Rifle | Gewöhnlich | 1.200 | 0,80 × | 11,20 % | 8,9 |
| Timed Explosive Charge | Gewöhnlich | 950 | 0,63 × | 15,94 % | 6,3 |
| Armored Door | Gewöhnlich | 600 | 0,40 × | 16,68 % | 6,0 |
| Hazmat Suit | Gewöhnlich | 300 | 0,20 × | 17,75 % | 5,6 |
| Holosight | Gewöhnlich | 180 | 0,12 × | 11,49 % | 8,7 |
| Large Medkit | Gewöhnlich | 90 | 0,06 × | 13,77 % | 7,3 |

### Military Crate · 2.000 Scrap (≈ 20 $)

RTP 93,00 % · Erwartungswert 1.860,00 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Glory AK47 | Episch | 24.000 | 12,00 × | 3,31 % | 30 |
| Neon Boom Storage | Ungewöhnlich | 3.785 | 1,89 × | 8,45 % | 12 |
| Rocket Launcher | Gewöhnlich | 1.800 | 0,90 × | 10,70 % | 9,3 |
| L96 Rifle | Gewöhnlich | 1.500 | 0,75 × | 15,53 % | 6,4 |
| Assault Rifle | Gewöhnlich | 900 | 0,45 × | 16,96 % | 5,9 |
| Auto Turret | Gewöhnlich | 520 | 0,26 × | 15,13 % | 6,6 |
| Rocket | Gewöhnlich | 380 | 0,19 × | 15,51 % | 6,4 |
| Weapon Lasersight | Gewöhnlich | 210 | 0,11 × | 14,41 % | 6,9 |

### Supply Drop · 3.000 Scrap (≈ 30 $)

RTP 93,00 % · Erwartungswert 2.789,99 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Big Grin | Episch | 28.000 | 9,33 × | 2,97 % | 34 |
| Desert Raiders Chest Plate | Selten | 6.999 | 2,33 × | 8,90 % | 11 |
| Forest Raiders Pants | Ungewöhnlich | 3.914 | 1,30 × | 11,15 % | 9,0 |
| Multiple Grenade Launcher | Gewöhnlich | 2.200 | 0,73 × | 14,16 % | 7,1 |
| L96 Rifle | Gewöhnlich | 1.500 | 0,50 × | 15,63 % | 6,4 |
| Timed Explosive Charge | Gewöhnlich | 950 | 0,32 × | 18,85 % | 5,3 |
| Assault Rifle | Gewöhnlich | 900 | 0,30 × | 15,71 % | 6,4 |
| Supply Signal | Gewöhnlich | 250 | 0,08 × | 12,64 % | 7,9 |

### Elite Crate · 4.500 Scrap (≈ 45 $)

RTP 93,00 % · Erwartungswert 4.184,99 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Mask | Episch | 42.000 | 9,33 × | 3,90 % | 26 |
| Forest Raiders Helmet | Ungewöhnlich | 6.693 | 1,49 × | 7,62 % | 13 |
| Double Door from Hell | Gewöhnlich | 4.099 | 0,91 × | 10,83 % | 9,2 |
| Whiteout Helmet | Gewöhnlich | 3.924 | 0,87 × | 14,60 % | 6,8 |
| M249 | Gewöhnlich | 2.600 | 0,58 × | 15,41 % | 6,5 |
| Rocket Launcher | Gewöhnlich | 1.800 | 0,40 × | 15,83 % | 6,3 |
| M39 Rifle | Gewöhnlich | 1.200 | 0,27 × | 15,49 % | 6,5 |
| Assault Rifle | Gewöhnlich | 900 | 0,20 × | 16,30 % | 6,1 |

### Locked Crate · 6.000 Scrap (≈ 60 $)

RTP 93,00 % · Erwartungswert 5.579,99 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Glory AK47 | Selten | 24.000 | 4,00 × | 5,18 % | 19 |
| Desert Raiders Set | Selten | 19.200 | 3,20 × | 1,94 % | 51 |
| Desert Raiders Facemask | Ungewöhnlich | 9.124 | 1,52 × | 9,17 % | 11 |
| Forest Raiders Roadsign Vest | Ungewöhnlich | 6.383 | 1,06 × | 13,01 % | 7,7 |
| Forest Raiders Roadsign Gloves | Gewöhnlich | 4.607 | 0,77 × | 16,17 % | 6,2 |
| Alien Red | Gewöhnlich | 4.300 | 0,72 × | 19,02 % | 5,3 |
| M249 | Gewöhnlich | 2.600 | 0,43 × | 18,30 % | 5,5 |
| L96 Rifle | Gewöhnlich | 1.500 | 0,25 × | 17,22 % | 5,8 |

### Bradley Crate · 8.000 Scrap (≈ 80 $)

RTP 93,00 % · Erwartungswert 7.439,99 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Whiteout Set | Episch | 48.000 | 6,00 × | 0,791 % | 126 |
| Big Grin | Selten | 28.000 | 3,50 × | 3,00 % | 33 |
| Frostbite Facemask | Ungewöhnlich | 14.200 | 1,78 × | 7,10 % | 14 |
| Tempered AK47 | Ungewöhnlich | 9.800 | 1,23 × | 15,34 % | 6,5 |
| Desert Raiders Facemask | Ungewöhnlich | 9.124 | 1,14 × | 11,26 % | 8,9 |
| Forest Raiders Roadsign Vest | Gewöhnlich | 6.383 | 0,80 × | 18,57 % | 5,4 |
| Alien Red | Gewöhnlich | 4.300 | 0,54 × | 20,80 % | 4,8 |
| M249 | Gewöhnlich | 2.600 | 0,33 × | 23,14 % | 4,3 |

### Heli Crate · 10.000 Scrap (≈ 100 $)

RTP 93,00 % · Erwartungswert 9.299,98 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Tempered Set | Episch | 65.000 | 6,50 × | 0,271 % | 369 |
| Punishment Mask | Selten | 42.000 | 4,20 × | 1,30 % | 77 |
| Glory AK47 | Selten | 24.000 | 2,40 × | 4,13 % | 24 |
| Whiteout Facemask | Ungewöhnlich | 18.500 | 1,85 × | 6,82 % | 15 |
| Frostbite Facemask | Ungewöhnlich | 14.200 | 1,42 × | 11,07 % | 9,0 |
| Tempered AK47 | Gewöhnlich | 9.800 | 0,98 × | 17,51 % | 5,7 |
| Forest Raiders Helmet | Gewöhnlich | 6.693 | 0,67 × | 24,06 % | 4,2 |
| Double Door from Hell | Gewöhnlich | 4.099 | 0,41 × | 34,84 % | 2,9 |

### Large Oil Rig · 15.000 Scrap (≈ 150 $)

RTP 93,00 % · Erwartungswert 13.949,97 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Glory Set | Episch | 120.000 | 8,00 × | 0,244 % | 410 |
| Whiteout Set | Selten | 48.000 | 3,20 × | 1,63 % | 61 |
| Big Grin | Ungewöhnlich | 28.000 | 1,87 × | 5,63 % | 18 |
| Glory AK47 | Ungewöhnlich | 24.000 | 1,60 × | 8,34 % | 12 |
| Whiteout Facemask | Ungewöhnlich | 18.500 | 1,23 × | 12,90 % | 7,8 |
| Frostbite Facemask | Gewöhnlich | 14.200 | 0,95 × | 17,60 % | 5,7 |
| Tempered AK47 | Gewöhnlich | 9.800 | 0,65 × | 23,39 % | 4,3 |
| Desert Raiders Chest Plate | Gewöhnlich | 6.999 | 0,47 × | 30,26 % | 3,3 |

### Cargo Ship · 20.000 Scrap (≈ 200 $)

RTP 93,00 % · Erwartungswert 18.599,97 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Glory Set | Episch | 120.000 | 6,00 × | 0,403 % | 248 |
| Tempered Set | Selten | 65.000 | 3,25 × | 1,63 % | 61 |
| Punishment Mask | Selten | 42.000 | 2,10 × | 4,69 % | 21 |
| Big Grin | Ungewöhnlich | 28.000 | 1,40 × | 8,97 % | 11 |
| Glory AK47 | Ungewöhnlich | 24.000 | 1,20 × | 13,18 % | 7,6 |
| Desert Raiders Set | Gewöhnlich | 19.200 | 0,96 × | 17,62 % | 5,7 |
| Frostbite Facemask | Gewöhnlich | 14.200 | 0,71 × | 22,65 % | 4,4 |
| Desert Raiders Facemask | Gewöhnlich | 9.124 | 0,46 × | 30,86 % | 3,2 |

### Underwater Lab · 30.000 Scrap (≈ 300 $)

RTP 93,00 % · Erwartungswert 27.899,99 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Punishment Set | Episch | 210.000 | 7,00 × | 0,098 % | 1.020 |
| Glory Set | Selten | 120.000 | 4,00 × | 0,683 % | 146 |
| Tempered Set | Selten | 65.000 | 2,17 × | 2,88 % | 35 |
| Whiteout Set | Ungewöhnlich | 48.000 | 1,60 × | 6,97 % | 14 |
| Punishment Mask | Ungewöhnlich | 42.000 | 1,40 × | 10,75 % | 9,3 |
| Big Grin | Gewöhnlich | 28.000 | 0,93 × | 18,72 % | 5,3 |
| Forest Raiders Set | Gewöhnlich | 21.600 | 0,72 × | 26,40 % | 3,8 |
| Whiteout Facemask | Gewöhnlich | 18.500 | 0,62 × | 33,50 % | 3,0 |

### Launch Site · 45.000 Scrap (≈ 450 $)

RTP 93,00 % · Erwartungswert 41.849,99 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Raiders Collection | Episch | 340.000 | 7,56 × | 0,207 % | 483 |
| Punishment Set | Selten | 210.000 | 4,67 × | 0,911 % | 110 |
| Glory Set | Selten | 120.000 | 2,67 × | 3,66 % | 27 |
| Tempered Set | Ungewöhnlich | 65.000 | 1,44 × | 9,91 % | 10 |
| Whiteout Set | Ungewöhnlich | 48.000 | 1,07 × | 14,96 % | 6,7 |
| Punishment Mask | Gewöhnlich | 42.000 | 0,93 × | 18,77 % | 5,3 |
| Big Grin | Gewöhnlich | 28.000 | 0,62 × | 23,87 % | 4,2 |
| Glory AK47 | Gewöhnlich | 24.000 | 0,53 × | 27,72 % | 3,6 |

### Large Present · 65.000 Scrap (≈ 650 $)

RTP 93,00 % · Erwartungswert 60.449,97 Scrap · 8 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Gold Collection | Episch | 480.000 | 7,38 × | 0,280 % | 357 |
| Raiders Collection | Episch | 340.000 | 5,23 × | 1,15 % | 87 |
| Punishment Set | Selten | 210.000 | 3,23 × | 3,00 % | 33 |
| Glory Set | Ungewöhnlich | 120.000 | 1,85 × | 9,45 % | 11 |
| Tempered Set | Ungewöhnlich | 65.000 | 1,00 × | 16,59 % | 6,0 |
| Whiteout Set | Gewöhnlich | 48.000 | 0,74 × | 20,43 % | 4,9 |
| Punishment Mask | Gewöhnlich | 42.000 | 0,65 × | 22,95 % | 4,4 |
| Big Grin | Gewöhnlich | 28.000 | 0,43 × | 26,16 % | 3,8 |

### Missile Silo · 100.000 Scrap (≈ 1.000 $)

RTP 93,00 % · Erwartungswert 92.999,95 Scrap · 7 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Gold Collection | Selten | 480.000 | 4,80 × | 1,22 % | 82 |
| Raiders Collection | Selten | 340.000 | 3,40 × | 3,67 % | 27 |
| Punishment Set | Selten | 210.000 | 2,10 × | 8,34 % | 12 |
| Glory Set | Ungewöhnlich | 120.000 | 1,20 × | 18,26 % | 5,5 |
| Tempered Set | Gewöhnlich | 65.000 | 0,65 × | 21,88 % | 4,6 |
| Whiteout Set | Gewöhnlich | 48.000 | 0,48 × | 23,47 % | 4,3 |
| Punishment Mask | Gewöhnlich | 42.000 | 0,42 × | 23,15 % | 4,3 |

### Gold Egg · 150.000 Scrap (≈ 1.500 $)

RTP 93,00 % · Erwartungswert 139.499,79 Scrap · 6 Items · Gewichtssumme 100.000

| Item | Seltenheit | Wert (Scrap) | × Preis | Chance | Etwa 1 von |
|---|---|---:|---:|---:|---:|
| Gold Collection | Selten | 480.000 | 3,20 × | 3,57 % | 28 |
| Raiders Collection | Selten | 340.000 | 2,27 × | 8,42 % | 12 |
| Punishment Set | Ungewöhnlich | 210.000 | 1,40 × | 17,72 % | 5,6 |
| Glory Set | Gewöhnlich | 120.000 | 0,80 × | 26,10 % | 3,8 |
| Tempered Set | Gewöhnlich | 65.000 | 0,43 × | 23,29 % | 4,3 |
| Whiteout Set | Gewöhnlich | 48.000 | 0,32 × | 20,89 % | 4,8 |
