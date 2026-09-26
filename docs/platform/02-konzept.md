# Phase 2 – Konzept: drei Richtungen

Stand: 26.09.2026 · baut auf [01-wettbewerbsanalyse.md](01-wettbewerbsanalyse.md) auf.
Klickbare Mockups: [`mockups/konzepte.html`](mockups/konzepte.html) (auch als Artifact veröffentlicht).

Alle drei Richtungen teilen denselben Kern aus der Analyse:
**Trust by Design · sichtbares Responsible Gambling · faire Edges · echte Rust-Mechaniken.**
Sie unterscheiden sich in Marke, Optik, Tonalität und Signature-Modus.

Alle Werte für House Edge sind **Zielwerte**. Die Mathematik der Signature-Modi ist
unten exakt hergeleitet. Die Verifikation per Monte-Carlo mit ≥ 10 Mio. Runden folgt in Phase 3.

---

## Übersicht

| | **A · SCRAPLINE** | **B · AFTERWIPE** | **C · BLUEPRINT** |
|---|---|---|---|
| Richtung | Industrial Rust / Scrap-Yard | Neon Raid Night | Clean Premium / Transparenz |
| Gefühl | Werkbank, Rost, Klebeband | Nacht-Raid, Leuchtfackel, Rauch | Planungstisch, Präzision, Ruhe |
| Zielgruppe | Rust-Core-Spieler, die das Spiel lieben | Streamer, Event-Jäger, Mobile | Vielspieler mit Misstrauen gegenüber Skin-Sites |
| Signature | **Raid** (Sprengstoff-Wahl pro Wand) | **Airdrop Crash** + Wipe-Day-Saison | **Monument Run** + öffentliches Fair-Ledger |
| Risiko | Nischig, starker Rust-Bezug | Laut, austauschbarer ohne Disziplin | Wirkt evtl. „zu ruhig“ für Hype-Publikum |
| Stärke | Unverwechselbar im Markt | Content- und Stream-tauglich | Maximales Vertrauen, lizenztauglich |

---

## A · SCRAPLINE — Industrial Rust

### Markenidee
Eine Werkstatt am Rand der Map. Hier wird Schrott sortiert, geprüft und getauscht.
Alles sieht selbstgebaut aus, funktioniert aber präzise. Der Kontrast *rau aussehen, exakt rechnen*
trägt die Marke.

**Namensvorschläge:** SCRAPLINE · Salvage Row · Tin Shed · Workbench.gg · FRAGYARD
**Claim:** „Ehrlicher Schrott. Faire Rechnung.“
**Tonalität:** trocken, knapp, Survivor-Slang ohne Übertreibung („Loot gesichert.“, „Wand hält.“,
„Kein Glück heute, Werkbank bleibt offen.“). Kein „Get rich“, keine Emojis.

### Moodboard in Worten
Gewelltes Blech mit Rostläufern, graues Klebeband mit Filzstift-Beschriftung,
Sprühschablonen-Ziffern, gelb-schwarze Warnstreifen, Nieten, Grünspan an Kupferrohren,
Neonröhre über der Werkbank, Kreidestriche als Zähler.

### Tokens
| Token | HEX | Rolle |
|---|---|---|
| `--bg` | `#15120F` | ölverschmiertes Schwarz |
| `--surface` | `#211C17` | Blech dunkel |
| `--surface-2` | `#2E2720` | Blech hell / Karten |
| `--line` | `#4A3F33` | Kanten, Trenner |
| `--rust` | `#B7471D` | Primär-Akzent, CTAs |
| `--hazard` | `#E8B21A` | Warnung, Multiplikator, Highlight |
| `--patina` | `#5E8C7A` | Gewinn, „fair geprüft“ |
| `--text` | `#EAE2D3` | Text |
| `--muted` | `#9C8F7C` | Sekundärtext |

**Fonts:** Big Shoulders Stencil (Display, Schablonen-Look) · Barlow / Barlow Condensed (UI) · JetBrains Mono (Zahlen, Seeds)
**Icons:** 2 px Kontur, eckige Enden, Schablonen-Unterbrechungen in der Linie
**Textur/Effekte:** Wellblech als `repeating-linear-gradient`, Klebeband-Labels leicht rotiert,
Warnstreifen an Risiko-Elementen, Funkenflug bei Gewinn (kurz, 600 ms), Stempel „GEPRÜFT“ an verifizierten Runden.

### Signature: RAID
Eine Basis mit bis zu 6 Schichten: **Twig → Holz → Stein → Metall → HQM → Tool Cupboard**.
Pro Schicht wählt der Spieler seinen Sprengstoff. Das ist die eigentliche Entscheidung:

| Sprengstoff | Erfolgschance p | Faktor pro Schicht (1/p) |
|---|---|---|
| C4 | 80 % | ×1,25 |
| Rakete | 60 % | ×1,667 |
| Satchel | 40 % | ×2,50 |

**Auszahlung beim Aussteigen nach j Schichten:** `B · (1 − e) / Π pᵢ`
→ Erwartungswert immer `B · (1 − e)`, egal welcher Weg. **e = 3 %** → RTP 97 %.
Beispiele: 6× C4 = **3,70×**, 6× Satchel = **236,8×**. Das Risikoprofil wählt der Spieler selbst
pro Schicht, nicht vorab.
Provably Fair: Pro Schicht `roll = HMAC-SHA256(serverSeed, clientSeed:nonce:layer)` → Float in [0,1) → Erfolg, wenn `roll < p`.

**PvP-Variante „Raid Battle“ (später):** 2–4 Spieler raiden dieselbe geseedete Basis, wer am tiefsten
kommt, gewinnt den Pot; Rake 4 % vom Pot. Seed über zukünftigen öffentlichen Block (EOS o. Ä.).

### Launch-Lineup
**MVP:** Cases · Case Battles (1v1, 1v1v1, 2v2; Normal / Crazy / Terminal) · Coinflip · Upgrader („Werkbank“) ·
Crash („Schrottpresse“) · Mines („Minenfeld“) · Plinko („Schrottrutsche“) · Dice · **Raid**
**Später:** Raid Battle · Jackpot („Loot-Haufen“) · Wheel („Bandit-Rad“-Variante, eigene faire Verteilung) · Towers · Blackjack · Hi-Lo

### Retention & Economy
- **Währung:** *Frags* (1 Frag = 0,01 $ Anzeige-Äquivalent, $-Wert immer daneben).
- **Level:** „Werkbank-Stufe 1–3“ als Meta-Ränge (je 33 Level), XP gewichtet nach erwartetem Verlust, damit Spiele mit niedriger Edge nicht zum XP-Farmen taugen.
- **Rakeback:** % des *erwarteten Verlusts*, nicht des Einsatzes (siehe „Gemeinsames Fundament“).
- **Daily:** „Schrottkiste“ – 1 Gratis-Case pro 24 h ab Level 2.
- **Rain:** „Ölregen“ im Chat, aus 1 % der Rake finanziert.
- **Affiliate:** „Crew-Code“ – 3 Stufen NGR-Anteil.

---

## B · AFTERWIPE — Neon Raid Night

### Markenidee
Der erste Abend nach dem Wipe: alles ist neu, jeder Server voll, Fackeln am Horizont.
Die Marke lebt vom **Event-Rhythmus**, also Countdown, Saison und Live-Momenten. Streamer-tauglich,
mobile-first, laut in den richtigen Momenten und ruhig im Rest.

**Namensvorschläge:** AFTERWIPE · Flarepoint · NIGHTRAID · Wipeday · SIGNAL
**Claim:** „Jeder Wipe ein neuer Anfang.“
**Tonalität:** energetisch, kurz, Event-Sprache („Drop in 00:42“, „Signal gezündet“).
Klare Grenze: keine Druck-Mechaniken wie Fake-Timer oder „nur noch 3 Plätze“.

### Moodboard in Worten
Rote Straßenfackel in der Hand, violetter Rauch einer Supply-Signal-Granate, grünes Nachtsichtbild,
Leuchtspur-Streifen am Himmel, Fallschirm eines Airdrops gegen Mondlicht, feuchter Beton,
kaltes Cyan von HUD-Linien.

### Tokens
| Token | HEX | Rolle |
|---|---|---|
| `--bg` | `#0A0B12` | Nachthimmel |
| `--surface` | `#12142A` | Panels |
| `--surface-2` | `#1B1E3A` | Karten |
| `--line` | `#2B2F57` | Kanten |
| `--flare` | `#FF4D2E` | Primär, CTAs, Crash-Kurve |
| `--smoke` | `#B06CFF` | Signal-Rauch, Events, Level |
| `--nvg` | `#7CFFB2` | Gewinn, Cash-out |
| `--hud` | `#43D9F0` | Linien, Fokus, Fair-Badges |
| `--text` | `#EEF0FF` | Text |
| `--muted` | `#8A8FB8` | Sekundärtext |

**Fonts:** Oxanium (Display, technisch-eckig) · Manrope (UI) · Space Mono (Zahlen, Seeds)
**Icons:** 1,75 px, runde Enden, dezenter Glow (`drop-shadow`) nur im aktiven Zustand
**Textur/Effekte:** Scanlines mit 3 % Deckkraft, Rauch-Partikel (Canvas, gedrosselt), Glow nur auf
*einem* Element pro Screen, Haptik-Vibration bei Cash-out (Mobile), `prefers-reduced-motion` schaltet alle Partikel ab.

### Signature: AIRDROP CRASH
Ein Frachtflugzeug zieht über die Map, der Crate fällt am Fallschirm. Der Multiplikator steigt,
solange der Crate fällt. Ein Heli-Abschuss beendet die Runde. **Landung = 1.000×** (Maximalwert).
- Verteilung: `P(X ≥ x) = (1 − e) / x`, **e = 2 %** → RTP 98 %, sofern das Auto-Cash-out ≤ 1.000× liegt.
- Formel: `h` = erste 52 Bit von `HMAC-SHA256(serverSeed, clientSeed)`, `E = 2^52`,
  `crash = max(1, ⌊100 · (1 − e) · E / (E − h)⌋ / 100)`. Da `h` gleichverteilt ist, gilt
  `P(crash ≥ x) = (1 − e)/x` (bis auf die Rundung auf 0,01). Den Beweis und die Monte-Carlo-Prüfung liefert Phase 3.
- Server-Seed-Kette (10 Mio. rückwärts gehashte Seeds, letzter Hash vorab veröffentlicht), Client-Seed = zukünftiger öffentlicher Block.
- **Social Layer:** Alle Cash-outs erscheinen als kleine Fallschirme, die vom Crate abspringen.
  Das ist die Signature-Animation.

**Wipe-Day-Saison:** Die Saison läuft synchron zum Rust-Force-Wipe (erster Donnerstag im Monat).
Battle-Pass mit 50 Stufen, Reset am Wipe-Tag, Saison-Case als Belohnung. Das ist ein eingebauter
monatlicher Rückkehr-Anlass, den kein Konkurrent nutzt.

### Launch-Lineup
**MVP:** **Airdrop Crash** · Cases · Case Battles · Coinflip · Upgrader · Mines · Plinko · Limbo („Signal“)
**Später:** Cargo-Event (stündliches Community-Event mit gemeinsamem Pot) · Jackpot · Towers · Dice · Blackjack

### Retention & Economy
- **Währung:** *Charge* (1 Charge = 0,01 $).
- **Saison-Pass** (kostenloser Track) statt klassischer Level-Tabelle; Rakeback-Stufe hängt am Konto-Level, nicht an der Saison.
- **Events:** Live-Countdown bis zum nächsten Airdrop-Bonus (fester Plan, öffentlich).
- **Rain:** „Supply Drop“ im Chat.
- **Affiliate:** Creator-Programm mit eigener Landing-Page und Saison-Case im Creator-Branding.

---

## C · BLUEPRINT — Clean Premium

### Markenidee
In Rust schaltet ein Blueprint ein Item dauerhaft frei, sobald man es verstanden hat. BLUEPRINT
überträgt das auf Glücksspiel: **Jede Runde hat einen offenen Bauplan.** Seeds, Formeln,
Edge und Auszahlungszeiten sind jederzeit sichtbar. Die Marke wirkt ruhig, erwachsen und präzise.
Sie ist gebaut für den Lizenzbetrieb.

**Namensvorschläge:** BLUEPRINT · Outpost · LEDGER · Keycard · Monument
**Claim:** „Jede Runde mit offenem Bauplan.“
**Tonalität:** sachlich, freundlich, genau („Runde #48 213 verifiziert.“, „Auszahlung in 4 min 12 s.“).
Zahlen statt Adjektive.

### Moodboard in Worten
Technische Zeichnung auf Graphit, feine Cyan-Linien mit Bemaßungspfeilen, Schlüsselkarten in
Grün, Blau und Rot, Messing-Schilder, gedämpftes Werkstattlicht, sauberes Raster, viel Luft.

### Tokens
| Token | HEX | Rolle |
|---|---|---|
| `--bg` | `#0F1113` | Graphit |
| `--surface` | `#171A1D` | Panels |
| `--surface-2` | `#20252A` | Karten |
| `--line` | `#2E353C` | Raster, Kanten |
| `--blueprint` | `#5AA9E6` | Linien, Links, Fokus |
| `--brass` | `#C9A45C` | VIP, Premium-Akzente |
| `--ok` | `#6CCB8E` | verifiziert, Gewinn |
| `--card-green` / `--card-blue` / `--card-red` | `#3FB950` / `#4C8DF6` / `#E5534B` | Keycard-Stufen (Risiko) |
| `--text` | `#E9ECEF` | Text |
| `--muted` | `#8B949E` | Sekundärtext |

**Fonts:** Archivo (Display mit Breitenachse, schmal für Zahlen, breit für Headlines) · IBM Plex Sans (UI) · IBM Plex Mono (Seeds, Formeln)
**Icons:** 1,5 px, technische Linien, Bemaßungs-Details
**Textur/Effekte:** 8-px-Raster als Hintergrund (2 % Deckkraft), Bemaßungslinien an Gewinn-Multiplikatoren,
jede Runde klappt ein „Proof“-Panel mit Hash-Kette aus. Bewegung ist sparsam und exakt (200–300 ms, kein Bounce).

### Signature: MONUMENT RUN (+ Fair-Ledger)
Ein Lauf durch ein Monument mit 8 Räumen und Keycard-Türen:

| Räume | Keycard | Türen / Fallen | p pro Raum |
|---|---|---|---|
| 1–3 | Grün | 4 Türen / 1 Falle | 3/4 |
| 4–6 | Blau | 3 Türen / 1 Falle | 2/3 |
| 7–8 | Rot | 2 Türen / 1 Falle | 1/2 |

**Auszahlung nach Raum j:** `B · (1 − e) / Π pᵢ`, **e = 3 %**.
Leiter (exakt): 1,29× · 1,72× · 2,30× · 3,45× · 5,17× · 7,76× · 15,52× · **31,04×** (voller Lauf, P = 3,125 %).
Variante „Launch Site“ (später): rote Räume mit 3 Türen und 2 Fallen → höhere Leiter.

**Fair-Ledger:** öffentliche Seite mit jeder Runde der Plattform (anonymisiert): Hash vorab,
Seed nach Rotation, Ergebnis und ein Verify-Button, der im Browser nachrechnet. Dazu die Live-Statistik
„tatsächlicher RTP je Spiel der letzten 30 Tage“ und „Median-Auszahlungszeit“.

### Launch-Lineup
**MVP:** Cases · Case Battles · Coinflip · Upgrader · Crash · Mines · Plinko · Dice · Limbo · **Monument Run**
**Später:** Blackjack (einziger Skill-Modus im Rust-Segment) · Hi-Lo · Towers · Jackpot · Turniere

### Retention & Economy
- **Währung:** direkt in **$-Guthaben** (Demo: „Demo-$“). Keine Fantasiewährung, das ist hier Teil der Transparenz.
- **VIP-Ränge:** Grün, Blau, Rot, Messing, entlang der Keycard-Farben.
- **Rakeback:** wie unten, plus Monatsauszug („Du hast 412,50 $ gesetzt, erwarteter Verlust 12,10 $, Rakeback 1,82 $.“).
- **Keine Rain-Lotterie im Chat.** Stattdessen transparente tägliche „Blueprint Drops“ mit fester Verteilung.
- **Affiliate:** NGR-basiert, mit öffentlichem Konditionsblatt.

---

## Gemeinsames Fundament (alle Richtungen)

### Edge-Zielwerte (Phase 3 verifiziert per Monte-Carlo)
| Modus | Ziel-Edge | Markt (Phase 1) |
|---|---|---|
| Crash / Dice / Limbo | **2 %** | 2 % (RustEasy) bis unbekannt |
| Mines / Plinko / Towers / Signature | **3 %** | 5–10 % |
| Upgrader | **5 %** | 7,3–10 % |
| Cases / Battles | **7 %** | 10 % |
| Coinflip / Jackpot (PvP) | **4 % vom Pot**, klar so benannt | 5–22 % |

### Rakeback auf erwarteten Verlust
`Rakeback = r · Σ (Einsatz × Edge des Spiels)`. Das ist nachhaltig und nicht farmbar. Außerdem kann man es ehrlich erklären.

| Level | r | Auszahlung |
|---|---|---|
| 1–9 | 5 % | täglich |
| 10–24 | 10 % | täglich + wöchentlich |
| 25–49 | 15 % | täglich + wöchentlich |
| 50–74 | 20 % | + monatlich |
| 75–99 | 25 % | + monatlich |
| 100+ | 30 % | + persönlicher Kontakt |

**XP:** 1 XP pro 0,01 $ erwartetem Verlust. Level-Kurve `XP(L) = 100 · L^1,6`.

### Responsible Gambling als sichtbares Feature
- **Session-Leiste** in der Topbar: Spielzeit und Netto-Ergebnis der Session, immer sichtbar.
- **Reality-Check** alle 30 oder 60 Minuten (wählbar), mit Zusammenfassung und „Pause 15 min“.
- **Limits:** Einzahlung, Verlust und Einsatz (täglich, wöchentlich, monatlich). Senken wirkt sofort, Erhöhen erst nach 24 h Wartezeit.
- **Cooldown** (24 h bis 6 Wochen) und **Self-Exclusion** (6 Monate bis dauerhaft) mit zwei Klicks im Profil.
- Während Cooldown oder Exclusion gibt es **kein Rain, kein Rakeback-Pushing und keine Promo-Mails.**
- **Keine Kredite und keine Loans** (RustClash-Anti-Pattern).

### Affiliate (alle)
Drei Stufen, 5 / 7,5 / 10 % vom **NGR** der geworbenen Spieler. Keine Kickbacks auf Einzahlungen,
sonst entsteht ein Anreiz, Verlierer zu werben.

---

## Prompts für Bild-KIs

Allgemeine Regeln für alle Prompts: **keine Rust- oder Facepunch-Logos, keine echten Skin-Designs,
keine Personen unter 25, kein Geld- oder Luxus-Protz.** Negativ-Prompts gelten für SDXL; bei Midjourney
nutzt man `--no`.

### A · SCRAPLINE
**Logo**
> Midjourney: `flat vector logo mark for "SCRAPLINE", stencil-cut bold letterforms, a single wrench merged into the letter S, spray-paint stencil edges, two colors only rust orange #B7471D and hazard yellow #E8B21A on oil-black #15120F, centered, generous margin, no gradients, no 3D --ar 1:1 --style raw --v 7 --no text artifacts, mockup, photo`

**Hero (16:9)**
> `cinematic wide shot of a makeshift scrapyard workshop at dusk, corrugated rusted sheet metal walls, a workbench with a glowing fluorescent tube, grey duct tape labels with marker writing, yellow-black hazard stripes, sparks from a grinder, color palette #15120F #B7471D #E8B21A #5E8C7A, shallow depth of field, empty space on the left third for headline text, no people, no logos --ar 16:9 --v 7`

**Case-Artworks (je 1:1, transparenter Hintergrund)**
> `isometric 3/4 view of a battered military loot crate, riveted steel, rust streaks, stencil number "07" on the side, duct tape on one corner, soft rim light in hazard yellow #E8B21A, studio render, isolated on plain background, game item icon style --ar 1:1 --v 7`
> Varianten: „Holzkiste mit Seil“, „Werkzeugkoffer mit Aufklebern“, „Tresor mit Schweißnähten“, „Elite-Crate mit Kupfer-Patina #5E8C7A“.

**Hintergrund-Textur**
> `seamless tileable texture of dark corrugated metal with subtle rust bleed, top-down, even lighting, low contrast, dark tones #211C17 to #2E2720 --tile --ar 1:1 --v 7`

**SDXL-Negativ:** `text, watermark, logo, signature, people, blurry, oversaturated, cartoon, lowres`

### B · AFTERWIPE
**Logo**
> `minimal logo mark for "AFTERWIPE", geometric sans wordmark with a stylised parachute formed by the letter A, single stroke weight, flare red #FF4D2E on night navy #0A0B12 with a thin cyan #43D9F0 accent line, flat vector, no gradients --ar 1:1 --style raw --v 7`

**Hero (16:9)**
> `night sky over a foggy post-apocalyptic island, a supply crate descending under a red-white parachute, a red road flare burning in the foreground, violet signal smoke #B06CFF drifting, faint green night-vision tint in the distance, tracer lines, color palette #0A0B12 #FF4D2E #B06CFF #7CFFB2, cinematic, volumetric light, empty right third for UI --ar 16:9 --v 7`

**Case-Artworks**
> `hard-shell supply drop crate with glowing seams, parachute straps, neon rim light in #B06CFF and #FF4D2E, dark background, clean 3D render, game icon, 3/4 view --ar 1:1 --v 7`
> Varianten: „Saison-Case mit Wipe-Datum-Plakette“, „Nachtsicht-Case (grün)“, „Cargo-Container klein“.

**Animation (Firefly Video / Runway)**
> `loop, 4 seconds, a supply crate swaying under a parachute, slow descent, dark sky, subtle flare glow, camera static, seamless loop`

### C · BLUEPRINT
**Logo**
> `technical logo mark for "BLUEPRINT", a square keycard outline with a single cut-out notch and a thin dimension line beneath it, line art, stroke #5AA9E6 on graphite #0F1113, brass accent dot #C9A45C, precise, flat vector, no shading --ar 1:1 --style raw --v 7`

**Hero (16:9)**
> `top-down technical drawing of a Rust-style monument floor plan on graphite paper, fine cyan construction lines #5AA9E6, dimension arrows, three keycard slots colored green #3FB950 blue #4C8DF6 red #E5534B, subtle brass label plates #C9A45C, calm, minimal, lots of negative space, no text --ar 16:9 --v 7`

**Case-Artworks**
> `precision-machined aluminium case, closed, engraved blueprint grid on the lid, small brass nameplate, soft studio light, graphite background, product photography, 3/4 view --ar 1:1 --v 7`
> Varianten: je Keycard-Farbe eine Case-Serie (grüne, blaue, rote Stripe-Linie).

**Hintergrund**
> `seamless blueprint grid pattern, 8px minor lines and 64px major lines, cyan #5AA9E6 at very low opacity on graphite #0F1113, flat --tile --v 7`

---

## Empfehlung

**BLUEPRINT (C) als Plattform-Fundament, mit Signature-Modi und Materialität aus A.**
- C passt zur Lizenzstrategie und zur größten Marktlücke (Vertrauen). Das Fair-Ledger ist schwer zu kopieren,
  weil es echte Transparenz voraussetzt.
- Mit C allein fehlt Emotion. Die Rust-Materialität von A (Case-Artworks, Raid-Modus, Werkbank-Upgrader)
  kann C als „Welt“ der Spiele ergänzen, während Shell, Konto und Zahlen im Blueprint-Look bleiben.
- B lohnt sich als **Saison- und Event-Layer** (Wipe-Day-Pass, Airdrop Crash) unabhängig von der Hauptmarke.

Entscheidung liegt bei dir. Phase 3 kann jede Kombination umsetzen.
