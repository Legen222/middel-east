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

<!-- MC-TABLE -->

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
