# Phase 3 – Mathe & Provably Fair (SCRAPLINE)

Stand: 26.09.2026 · Richtung **A · SCRAPLINE** · Code: [`platform/engine`](../../platform/engine)

Diese Phase liefert die Spiel-Engine für alle MVP-Modi: einen Provably-Fair-Kern, die exakte Herleitung
jedes RTP, 57 automatische Tests, eine Monte-Carlo-Prüfung mit **10 Mio. Runden pro Lauf** und eine
öffentliche Prüfer-Seite. Alles läuft im **Demo-Modus**.

---

## 1. Ergebnis auf einen Blick

| Spiel (SCRAPLINE) | Code | House Edge | RTP | Beweis | Monte-Carlo |
|---|---|---:|---:|---|---|
| Würfel | `dice` | 2 % | **98,00 %** exakt | Aufzählung aller 10 000 Werte | ✔ |
| Schrottpresse (Crash) | `crash` | 2 % | **98,00 %** je Ziel ≥ 1,01× | Grenzwert-Beweis, P(≥x) = 0,98/x | ✔ |
| Minenfeld | `mines` | 3 % | **97,00 %** jede Kombination | alle 300 (m, k)-Paare exakt | ✔ |
| Schrottrutsche (Plinko) | `plinko` | ≥ 3 % | **96,55–96,99 %** je Tabelle | Binomial, exakt | ✔ |
| **Raid** (Signature) | `raid` | 3 % | **97,00 %** jede Strategie | Martingal + alle 1 092 Pläne | ✔ |
| Werkbank (Upgrader) | `upgrader` | 5 % | **95,00 %** exakt | algebraisch | ✔ |
| Münzwurf (PvP) | `coinflip` | 4 % vom Pot | **96,00 %** je Spieler | algebraisch | ✔ |
| Kisten | `cases` | ≥ 7 % | **≤ 93,00 %** (92,73–93,00 %) | Ticket-Aufzählung | ✔ |
| Kisten-Battle | `cases` | = Kisten | **92,97 %** je Platz | Symmetrie der Plätze | ✔ je Platz |

Alle 40 Monte-Carlo-Läufe liegen innerhalb von 4 Standardfehlern der Theorie (Tabelle in Abschnitt 5).

---

## 2. Provably Fair

### 2.1 Zufallsquelle (alle Spiele außer Crash)

```
bytes_r = HMAC-SHA256( key = serverSeed, msg = clientSeed + ":" + nonce + ":" + r )    r = 0, 1, 2 …
float   = b0/256 + b1/256² + b2/256³ + b3/256⁴                                        je 4 Bytes
```

- Eine HMAC-Ausgabe ergibt 8 Floats in [0, 1) mit einer Auflösung von 2⁻³². Werden mehr gebraucht
  (Plinko 16 Reihen, Battles), zählt `r` hoch.
- **Commitment:** Vor der ersten Wette wird `sha256(serverSeed)` angezeigt. Der Seed bleibt geheim,
  bis der Spieler rotiert. Dann wird er offengelegt, und ein neuer Hash wird veröffentlicht.
- **Einfluss des Spielers:** Der Client-Seed ist jederzeit änderbar. Die Nonce zählt pro Wette hoch.
- **Warum HMAC:** Ohne den Server-Seed kann niemand ein Ergebnis vorhersagen. Ohne den Client-Seed zu kennen,
  kann der Betreiber kein Ergebnis gezielt wählen. Nach dem Reveal kann jeder alles nachrechnen.

**Testvektor** (im Test fest verankert, im Prüfer als Beispiel vorausgefüllt):
`serverSeed = 3f1e9c2a…273645`, `clientSeed = scrapline`, `nonce = 0`
→ HMAC Runde 0 = `333ce1db714c00d1…` → erster Float **0,2001477394** → Würfel 20,01.

### 2.2 Schrottpresse (Crash): Hash-Kette

Crash ist eine gemeinsame Runde für alle Spieler. Deshalb gibt es hier keinen Client-Seed pro Spieler:

1. Es wird eine Kette mit 10 Mio. Seeds erzeugt: `seed_i = sha256(seed_{i+1})`. Veröffentlicht wird
   nur der **Terminal-Hash** `sha256(seed_0)`.
2. Danach wird ein **öffentlicher Block** festgelegt, der erst in der Zukunft gemint wird (Bitcoin oder EOS).
   Sein Hash wird zum Client-Seed der ganzen Kette. So kann der Betreiber die Kette nicht auf ein
   günstiges Ergebnis hin auswählen („grinden“).
3. Runde i nutzt `seed_i`. Jeder Spieler prüft `sha256(seed_i) = seed_{i−1}`. Damit ist bewiesen,
   dass die Runde schon vor Beginn der Kette feststand.

### 2.3 PvP (Münzwurf, Kisten-Battle)

Der Client-Seed ist der Hash eines öffentlichen Blocks, der erst gewählt wird, wenn der letzte Platz
besetzt ist. Die Nonce ist die Spiel-ID. Weder der Betreiber noch ein Spieler kennt das Ergebnis vorher.
Bei Battles werden die Floats Runde für Runde und Platz für Platz aus **einem** Strom gezogen. Die
Reihenfolge ist fest und im Prüfer nachvollziehbar.

### 2.4 Prüfer-Seite

`platform/engine/verify/verify.html` ist eine eigenständige Seite, die auch offline funktioniert. Sie
bündelt **denselben Engine-Code** wie der Server, inklusive SHA-256 in reinem JavaScript. Sie zeigt
Commitment-Check, HMAC, alle verbrauchten Floats und die Rechenschritte je Spiel.

---

## 3. Spiele: Formeln und Beweise

### Würfel
`wurf = ⌊f · 10000⌋ / 100` ist gleichverteilt auf 0,00 … 99,99. Die Gewinnchance c liegt zwischen 0,01 und 98 %, in Schritten von 0,01.
„Unter“ gewinnt bei `wurf < c`, „über“ bei `wurf ≥ 100 − c`. In beiden Fällen sind das genau c · 100 von 10 000 Werten.
Multiplikator `0,98 · 100 / c` ⇒ **RTP = c/100 · 0,98 · 100/c = 98 %**. Der Test zählt alle 10 000 Werte
für 12 Einstellungen vollständig durch.

### Schrottpresse (Crash)
`h` = die ersten 52 Bit von `HMAC(seed_i, clientSeed)`, `E = 2⁵²`,
`crash = max(1, ⌊100 · 0,98 · E / (E − h)⌋ / 100)`.
Für jedes Ziel x mit 100x ∈ ℕ gilt: `⌊y⌋ ≥ 100x ⇔ y ≥ 100x`. Daraus folgt
`crash ≥ x ⇔ h ≥ E(1 − 0,98/x)`, also **P(crash ≥ x) = 0,98/x** und **RTP = 98 %** für jedes Ziel.
Ziele unter 1,01× sind gesperrt, weil ein Ziel von 1,00× wegen `max(1, …)` immer genau den Einsatz zurückgäbe.
Instant-Crash-Rate `P(crash < 1,01) = 1 − 0,98/1,01 ≈ 2,97 %`. Maximales Ziel: 10 000× (Haftungsgrenze).
Der Test prüft die Grenze `h*` exakt für 8 Ziele von 1,01× bis 9 999,99×.

### Minenfeld
Die Minen werden per Fisher–Yates gelegt (`j = i + ⌊f · (25 − i)⌋`), jedes Feld ist gleich wahrscheinlich.
Der χ²-Test über 100 000 Bretter bestätigt das.
`mult(k) = 0,97 · C(25, k) / C(25 − m, k)` und `P(k sichere Felder) = C(25 − m, k) / C(25, k)`
⇒ **RTP = 97 % für jede Minenzahl m und jedes k**. Weil der Erwartungswert für jedes k gleich ist,
gilt er auch für jede Stopp-Strategie. Der Test rechnet alle 300 (m, k)-Paare exakt durch.
Höchster Multiplikator: 24 Minen, 1 Feld = 24,25×. 12 Minen, 13 Felder = 5,0 Mio.× (Haftungsgrenze nötig).

### Schrottrutsche (Plinko)
n Reihen mit je einem Float (`f ≥ 0,5` → rechts), Fach = Anzahl „rechts“ ⇒ `P(k) = C(n, k)/2ⁿ`.
Eigene SCRAPLINE-Tabellen, symmetrisch, auf lesbare Werte gerundet:

| Reihen | Risiko | Multiplikatoren (Rand → Mitte) | RTP exakt |
|---|---|---|---:|
| 8 | niedrig | 6 · 3,1 · 1,41 · 0,65 · **0,49** | 96,742 % |
| 8 | mittel | 15 · 4,7 · 1,17 · 0,44 · **0,4** | 96,875 % |
| 8 | hoch | 30 · 6,4 · 0,87 · 0,21 · **0,19** | 96,852 % |
| 12 | niedrig | 10 · 6,4 · 3,8 · 2 · 1,03 · 0,59 · **0,5** | 96,960 % |
| 12 | mittel | 35 · 17 · 7,1 · 2,4 · 0,71 · 0,33 · **0,29** | 96,796 % |
| 12 | hoch | 150 · 43 · 9,3 · 1,45 · 0,28 · 0,2 · **0,19** | 96,855 % |
| 16 | niedrig | 16 · 11 · 7,5 · 4,7 · 2,8 · 1,54 · 0,84 · 0,55 · **0,5** | 96,994 % |
| 16 | mittel | 100 · 53 · 26 · 11 · 4 · 1,24 · 0,44 · 0,3 · **0,29** | 96,881 % |
| 16 | hoch | 800 · 255 · 67 · 14 · 2,2 · 0,37 · 0,21 · 0,2 · **0,2** | 96,548 % |

Durch die Rundung liegen alle Tabellen leicht **unter** der Ziel-Edge von 3 %, nie darüber.

### Raid (Signature)
6 Schichten, pro Schicht ein Float: Die Wand bricht bei `f < p` (C4 0,80 · Rakete 0,60 · Satchel 0,40).
Beim Aussteigen nach j Schichten ist die Auszahlung `0,97 / Π pᵢ`.
**Beweis für jede Strategie:** Sei `V_j` der aktuelle Auszahlungswert. Ein weiterer Sprengsatz liefert
`E[V_{j+1} | V_j] = p · V_j/p + (1 − p) · 0 = V_j`. V ist also ein Martingal, und nach dem ersten Sprengsatz
gilt `E[V_1] = 0,97`. Nach dem Optional-Stopping-Theorem (höchstens 6 Schritte) folgt **RTP = 97 %**,
egal welches Werkzeug der Spieler wählt oder wann er aussteigt. Der Test prüft alle 1 092 festen Pläne exakt.
Spanne: 6× C4 = 3,70×, 6× Satchel = 236,82×.

### Werkbank (Upgrader)
`chance = Einsatz / Ziel · 0,95`, gewonnen bei `f < chance` ⇒ **RTP = 95 %** exakt.
Die Chance muss zwischen 1 % und 80 % liegen, sonst wird die Wette abgelehnt. So wird die Formel nie gekappt, und der RTP bleibt exakt.

### Münzwurf (PvP)
`f < 0,5` → Rust, sonst Scrap. Der Gewinner erhält `2B · 0,96` ⇒ **RTP = 96 %** je Spieler.
Die Rake ist klar als **4 % vom Pot** ausgewiesen. Das entspricht 4 % Edge auf den Einsatz, nicht 2 %.

### Kisten
`ticket = ⌊f · W⌋` über ganzzahlige Gewichte, `EV = Σ wᵢ · Wertᵢ / W`, `Preis = ⌈EV / 0,93⌉` in ganzen Frags.
Das Aufrunden kostet höchstens 1 Frag. Das sind 0,27 Prozentpunkte bei der 3,44-$-Werkzeugkiste und unter 0,001 Prozentpunkten beim Tresor.

| Kiste | Preis | EV | RTP |
|---|---:|---:|---:|
| Werkzeugkiste | 344 Frags (3,44 $) | 319,00 | 92,733 % |
| Militärkiste | 969 Frags (9,69 $) | 900,54 | 92,935 % |
| Elite-Crate | 5 226 Frags (52,26 $) | 4 859,65 | 92,990 % |
| Tresor | 21 784 Frags (217,84 $) | 20 258,80 | 92,999 % |

Die Artikelwerte sind **Platzhalter**. Im Betrieb liest ein Preis-Job die Skinpreise ein (z. B. SCMM
oder mehrere Marktplätze), rechnet mit `priceCase()` die Preise neu und protokolliert jede Änderung.

### Kisten-Battle
Normal (höchste Summe), Crazy (niedrigste Summe), Terminal (höchster Wert der letzten Runde). Bei Gleichstand
wird geteilt. Weil alle Plätze symmetrisch sind, erwartet jeder Platz den Kisten-RTP (92,97 % für die
Testkombination aus Werkzeug-, Militär- und Elite-Kiste). Der Monte-Carlo-Lauf prüft **jeden Platz einzeln**,
damit keine Position bevorzugt wird.

---

## 4. Monte-Carlo-Methode

- **Umfang:** 40 Läufe mit je **10 Mio. Runden**. Bei Battles bekommt jeder Platz einen eigenen Lauf mit
  10 Mio. Battles. Zusätzlich misst ein Lauf die Crash-Überlebenskurve an 10 Mio. neuen Crash-Punkten.
- **Zufall:** xoshiro128** mit 2⁻³²-Auflösung, also derselben Auflösung wie FairStream, fester Seed `20260926`.
  Durch die Floats laufen die **Produktionsfunktionen** der Spiele, kein Nachbau.
- **Kompletter Provably-Fair-Pfad:** Ein Würfel-Lauf zieht jede der 10 Mio. Runden über HMAC-SHA256 aus
  node:crypto mit fortlaufender Nonce. Damit ist belegt, dass die Ableitung selbst unverzerrt ist.
- **Bestanden, wenn** `|z| < 4` mit `z = (RTP_MC − RTP_Theorie) / SE`. Bei 40 Läufen liegt die Fehlalarm-Rate unter 0,3 %.
- **Gemischte Läufe** ziehen die Parameter pro Runde zufällig (Würfel-Chance, Crash-Ziel, Minen-Kombination,
  Raid-Strategie, Upgrader-Chance). Beim Minenfeld sind dabei nur Kombinationen bis 1 000× dabei: Darüber
  (bis 5,04 Mio.×) ist die Varianz so groß, dass auch 10 Mio. Runden nichts aussagen. Diese Fälle deckt der exakte Test ab.

Reproduzieren: `cd platform/engine && npm install && npm run sim`

---

## 5. Monte-Carlo-Ergebnisse

Seed `20260926` · v22.22.2 · alle 40 Läufe bestanden, größter Ausschlag |z| = 1.96.

| Spiel | Konfiguration | Runden | RTP Theorie | RTP Monte-Carlo | ±95 % | z | Treffer | max × | OK |
|---|---|---:|---:|---:|---:|---:|---:|---:|:-:|
| dice | under 49.50 % | 10.000.000 | 98.0000 % | 97.9936 % | 0.0614 pp | -0.20 | 49.50 % | 1.98 | ✔ |
| dice | over 2.00 % (49× payout) | 10.000.000 | 98.0000 % | 97.9348 % | 0.4250 pp | -0.30 | 2.00 % | 49 | ✔ |
| dice | mixed: chance 0.01…98, both sides | 10.000.000 | 98.0000 % | 98.0880 % | 0.2040 pp | 0.85 | 49.01 % | 4900 | ✔ |
| dice | under 49.50 % via HMAC stream | 10.000.000 | 98.0000 % | 98.0582 % | 0.0614 pp | 1.86 | 49.53 % | 1.98 | ✔ |
| crash | auto cash-out 1.01× | 10.000.000 | 98.0000 % | 98.0038 % | 0.0106 pp | 0.71 | 97.03 % | 1.01 | ✔ |
| crash | auto cash-out 2.00× | 10.000.000 | 98.0000 % | 97.9984 % | 0.0620 pp | -0.05 | 49.00 % | 2 | ✔ |
| crash | auto cash-out 10.00× | 10.000.000 | 98.0000 % | 97.9869 % | 0.1843 pp | -0.14 | 9.80 % | 10 | ✔ |
| crash | auto cash-out 100.00× | 10.000.000 | 98.0000 % | 98.0140 % | 0.6106 pp | 0.04 | 0.98 % | 100 | ✔ |
| crash | mixed: target log-uniform 1.01…1000× | 10.000.000 | 98.0000 % | 98.1994 % | 0.7364 pp | 0.53 | 14.17 % | 999.96 | ✔ |
| mines | 3 mines, cash out after 5 | 10.000.000 | 97.0000 % | 97.0099 % | 0.0606 pp | 0.32 | 49.57 % | 1.96 | ✔ |
| mines | 24 mines, cash out after 1 | 10.000.000 | 97.0000 % | 97.0502 % | 0.2946 pp | 0.33 | 4.00 % | 24.25 | ✔ |
| mines | mixed: 229 (m, k) with ≤ 1 000× | 10.000.000 | 97.0000 % | 96.5266 % | 0.5820 pp | -1.59 | 21.47 % | 989.85 | ✔ |
| plinko | 8 rows / low | 10.000.000 | 96.7422 % | 96.7238 % | 0.0492 pp | -0.73 | 100.00 % | 6 | ✔ |
| plinko | 8 rows / medium | 10.000.000 | 96.8750 % | 96.9038 % | 0.1006 pp | 0.56 | 100.00 % | 15 | ✔ |
| plinko | 8 rows / high | 10.000.000 | 96.8516 % | 96.6680 % | 0.1839 pp | -1.96 | 100.00 % | 30 | ✔ |
| plinko | 12 rows / low | 10.000.000 | 96.9595 % | 96.9621 % | 0.0515 pp | 0.10 | 100.00 % | 10 | ✔ |
| plinko | 12 rows / medium | 10.000.000 | 96.7964 % | 96.8205 % | 0.1205 pp | 0.39 | 100.00 % | 35 | ✔ |
| plinko | 12 rows / high | 10.000.000 | 96.8545 % | 96.7601 % | 0.3022 pp | -0.61 | 100.00 % | 150 | ✔ |
| plinko | 16 rows / low | 10.000.000 | 96.9938 % | 96.9891 % | 0.0550 pp | -0.17 | 100.00 % | 16 | ✔ |
| plinko | 16 rows / medium | 10.000.000 | 96.8811 % | 96.7962 % | 0.1575 pp | -1.06 | 100.00 % | 100 | ✔ |
| plinko | 16 rows / high | 10.000.000 | 96.5480 % | 96.5261 % | 0.5194 pp | -0.08 | 100.00 % | 800 | ✔ |
| raid | always C4, all 6 layers | 10.000.000 | 97.0000 % | 96.9705 % | 0.1009 pp | -0.57 | 26.21 % | 3.7 | ✔ |
| raid | always satchel, all 6 layers | 10.000.000 | 97.0000 % | 97.0474 % | 0.9377 pp | 0.10 | 0.41 % | 236.82 | ✔ |
| raid | mixed: random tool, 30 % stop chance | 10.000.000 | 97.0000 % | 97.0656 % | 0.1847 pp | 0.70 | 31.41 % | 236.82 | ✔ |
| upgrader | 100 → 200 (47.5 %) | 10.000.000 | 95.0000 % | 94.9613 % | 0.0619 pp | -1.23 | 47.48 % | 2 | ✔ |
| upgrader | mixed: chance 1 %…80 % | 10.000.000 | 95.0000 % | 95.0388 % | 0.1256 pp | 0.60 | 40.54 % | 94.97 | ✔ |
| coinflip | creator seat, random side | 10.000.000 | 96.0000 % | 95.9714 % | 0.0595 pp | -0.94 | 49.99 % | 1.92 | ✔ |
| cases | Werkzeugkiste (Preis 344 Frags) | 10.000.000 | 92.7326 % | 92.7903 % | 0.2648 pp | 0.43 | 100.00 % | 61.05 | ✔ |
| cases | Militärkiste (Preis 969 Frags) | 10.000.000 | 92.9350 % | 92.8709 % | 0.1194 pp | -1.05 | 100.00 % | 21.67 | ✔ |
| cases | Elite-Crate (Preis 5226 Frags) | 10.000.000 | 92.9899 % | 92.9797 % | 0.0468 pp | -0.43 | 100.00 % | 4.02 | ✔ |
| cases | Tresor (Preis 21784 Frags) | 10.000.000 | 92.9985 % | 92.9882 % | 0.0858 pp | -0.24 | 100.00 % | 5.51 | ✔ |
| battles | 2 Plätze / normal / Platz 1 | 10.000.000 | 92.9682 % | 93.0046 % | 0.0720 pp | 0.99 | 51.11 % | 11.98 | ✔ |
| battles | 2 Plätze / normal / Platz 2 | 10.000.000 | 92.9682 % | 92.9719 % | 0.0720 pp | 0.10 | 51.09 % | 11.57 | ✔ |
| battles | 3 Plätze / crazy / Platz 1 | 10.000.000 | 92.9682 % | 93.0189 % | 0.0916 pp | 1.08 | 34.80 % | 13.82 | ✔ |
| battles | 3 Plätze / crazy / Platz 2 | 10.000.000 | 92.9682 % | 92.9258 % | 0.0916 pp | -0.91 | 34.78 % | 14.48 | ✔ |
| battles | 3 Plätze / crazy / Platz 3 | 10.000.000 | 92.9682 % | 92.9789 % | 0.0916 pp | 0.23 | 34.79 % | 13.82 | ✔ |
| battles | 4 Plätze / terminal / Platz 1 | 10.000.000 | 92.9682 % | 92.8789 % | 0.0965 pp | -1.81 | 36.49 % | 14.1 | ✔ |
| battles | 4 Plätze / terminal / Platz 2 | 10.000.000 | 92.9682 % | 92.8943 % | 0.0965 pp | -1.50 | 36.51 % | 14.58 | ✔ |
| battles | 4 Plätze / terminal / Platz 3 | 10.000.000 | 92.9682 % | 92.9614 % | 0.0966 pp | -0.14 | 36.52 % | 13.97 | ✔ |
| battles | 4 Plätze / terminal / Platz 4 | 10.000.000 | 92.9682 % | 92.9336 % | 0.0965 pp | -0.70 | 36.52 % | 14.05 | ✔ |

**Crash-Überlebenskurve** (10 Mio. neue Crash-Punkte):

| x | P(Crash ≥ x) Monte-Carlo | Theorie 0,98/x |
|---:|---:|---:|
| 1.01× | 97.0284 % | 97.0297 % |
| 2× | 48.9998 % | 49.0000 % |
| 10× | 9.7894 % | 9.8000 % |
| 100× | 0.9753 % | 0.9800 % |
| 1000× | 0.0989 % | 0.0980 % |

---

## 6. Entscheidungen und Befunde aus dieser Phase

1. **Kistenpreise in ganzen Frags** (1 Frag = 0,01 $). Beim ersten Entwurf mit feinerer Einheit hat der Test
   einen Fehler bei der Preisrundung gefunden. Jetzt gilt nachweislich: Rundung ≤ 1 Frag, RTP ≤ 93 %.
2. **Crash-Mindestziel 1,01×.** Andernfalls wäre 1,00× eine risikofreie Wette mit 100 % RTP.
3. **Upgrader-Chance zwischen 1 und 80 %.** Innerhalb dieses Bereichs muss nie gekappt werden, deshalb bleibt der RTP exakt.
4. **Haftungsgrenzen gehören in die Wallet, nicht ins RNG.** Minenfeld und Raid können extreme Multiplikatoren
   erreichen. Eine Obergrenze für den Maximalgewinn pro Wette in Frags gehört in die Wallet-Schicht (Phase 4).
   Wird sie erreicht, sinkt der RTP für genau diese Kombination. Das muss dem Spieler vor der Wette angezeigt werden.
5. **Auszahlungen in Milli-Frags.** Die Engine liefert exakte Multiplikatoren. Die Wallet rundet pro Wette
   auf 0,001 Frag ab. Dadurch sinkt der RTP bei Einsätzen ab 1 Frag um höchstens 0,1 %.
6. **Keine Skalierung der Plinko-Tabellen zur Laufzeit.** Die Tabellen sind fest, und ihr RTP ist dokumentiert.
   Jede Änderung braucht einen neuen Test und einen neuen Monte-Carlo-Lauf.

## 7. Offen für den Echtgeld-Betrieb (nicht Teil des Demo-Modus)

- Server-Seeds in einem KMS/HSM speichern. Die Nonce muss atomar pro Wette hochzählen (DB-Transaktion mit Wallet-Buchung).
- Quelle für den öffentlichen Block festlegen (Bitcoin-Block-Hash oder EOS) und den Ablauf bis zur Auswahl dokumentieren.
- **Externes RNG- und Spielmathematik-Audit** (z. B. iTech Labs, GLI, BMM) als Voraussetzung für die Lizenz.
- Den Preis-Feed für Skins mit mehreren Quellen, Ausreißer-Filter und Änderungsprotokoll anbinden.
- Den tatsächlichen RTP je Spiel laufend überwachen (Alarm bei |z| > 4 über ein rollierendes Fenster) und öffentlich zeigen.
