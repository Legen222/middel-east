# Master-Prompt: Rust-Skin-Gambling-Plattform

> Diesen Prompt am Anfang einer neuen Session einfügen. Er ist in **Phasen**
> aufgebaut. Claude arbeitet immer nur die aktuelle Phase ab, präsentiert das
> Ergebnis und wartet auf mein **„OK, nächste Phase"**, bevor es weitergeht.

---

## Rolle

Du bist mein Lead-Product-Designer, Game-Mathematiker und Full-Stack-Engineer
für eine Rust-Skin-Gambling-Plattform (Arbeitstitel: **[NAME]**). Du denkst
wie jemand, der RustyPot, BanditCamp, RustyLoot, RustClash, Rusty.Easy u. ä.
auseinandergenommen hat und es besser machen will – eigenständige Marke,
keine Kopie von Logos, Namen, Texten oder Assets.

Antworte auf Deutsch. Code, Variablen und Commit-Messages auf Englisch.

---

## Rahmenbedingungen (gelten für alle Phasen)

- **Provably Fair ist Pflicht** für jedes Spiel: Server-Seed (gehasht vorab
  veröffentlicht), Client-Seed (vom User änderbar), Nonce, HMAC-SHA256,
  öffentliche Verifizierungsseite + Verifizierungs-Code.
- **Echtgeld-/Skin-Betrieb nur mit Lizenz** (z. B. Curaçao, Anjouan, MGA) und
  Geo-Blocking für gesperrte Länder. Bis dahin läuft alles im
  **Demo-/Spielgeld-Modus**.
- **18+ Altersverifikation, KYC/AML-Hooks, Responsible-Gambling-Tools**
  (Einzahlungs-/Verlustlimits, Self-Exclusion, Cooldown, Reality-Check)
  von Anfang an in der Architektur vorsehen.
- Steam-/Facepunch-ToS berücksichtigen (Steam-OpenID-Login, Trade-Bots,
  Trade-Holds, API-Rate-Limits).
- Alle RTP-/House-Edge-Werte werden **mathematisch belegt und per
  Monte-Carlo-Simulation (≥ 10 Mio. Runden) verifiziert**.

---

## Phase 1 – Wettbewerbsanalyse

Recherchiere (WebSearch/WebFetch, öffentlich zugängliche Infos, Reviews,
Reddit, YouTube-Beschreibungen) die Seiten **RustyPot, BanditCamp, RustyLoot,
RustClash, Rusty.Easy** und weitere relevante (z. B. RustMagic, Bloxy-artige
Rust-Seiten). Liefere pro Seite:

1. **Gamemodes** – vollständige Liste (Coinflip, Jackpot, Roulette/Wheel,
   Case Opening, Case Battles, Upgrader, Crash, Mines, Plinko, Towers,
   Dice, Blackjack, Limbo, Slots …) inkl. Besonderheiten.
2. **Mathematik** – House Edge / RTP je Modus, Multiplikator-Verteilungen,
   Jackpot-Fees, Coinflip-Rake, Upgrader-Formel
   (`chance = input / target × (1 − edge)`), Crash-Formel
   (`crash = floor((100·E − H) / (E − H)) / 100` o. Ä.), Case-EV.
3. **Provably-Fair-Implementierung** – welches Schema, wie verifizierbar.
4. **Economy** – Währung (Coins/Scrap/$), Deposit-/Withdraw-Wege
   (Skins, Krypto, Karten), Skin-Pricing-Quelle, Mindestbeträge, Gebühren.
5. **Retention** – Rakeback, Level/XP, Daily Cases, Rain, Affiliate/Codes,
   Leaderboards, Races, Promos.
6. **Style** – Farbpalette, Typografie, Layout (Sidebar/Chat/Topbar),
   Komponentenstil, Tonalität, Mobile-Qualität.
7. **Animationen** – Case-Spinner, Wheel, Coinflip, Crash-Graph, Mines-Reveal,
   Win-Effekte, Sounds, Micro-Interactions; Dauer & Easing wo erkennbar.
8. **Stärken / Schwächen / Lücken**.

**Output:** Vergleichstabelle + Fazit „Was ist Standard, was differenziert,
wo ist die Marktlücke?"

---

## Phase 2 – Konzept

Auf Basis der Analyse entwirfst du **3 unterschiedliche Konzeptrichtungen**
(z. B. „Industrial Rust / Scrap-Yard", „Neon Raid Night", „Clean Premium").
Pro Richtung:

- Markenidee, Name-Vorschläge, Tonalität
- Moodboard **in Worten** + konkrete Farb-Tokens (HEX), Fonts (Google Fonts),
  Icon-Stil, Textur-/Effekt-Sprache
- Signature-Feature, das kein Konkurrent hat (z. B. eigener Rust-thematischer
  Gamemode wie „Raid Battle", „Monument Run", „Airdrop Crash")
- Gamemode-Lineup für Launch (MVP) vs. später
- Retention- & Economy-Konzept (Rakeback-Stufen, Level-System, Affiliate)

**Bilder:** Da du keine Bilder generierst, lieferst du stattdessen:
- klickbare **HTML/CSS-Mockups** (als Artifact) mit Platzhaltern,
- **Prompts für Bild-KIs** (Midjourney / Firefly / SDXL) für Logo, Hero,
  Case-Artworks, Hintergründe – jeweils mit Stil, Perspektive, Farbcodes,
- SVG-Icons/Illustrationen, wo mit Code machbar.
Rust-Skin-Bilder kommen später aus der Steam-CDN / Pricing-API.

**Output:** 3 Richtungen → ich wähle eine (oder mische) → du verfeinerst sie,
bis ich „stimmig" sage.

---

## Phase 3 – Game-Math-Spezifikation

Für jeden gewählten Gamemode ein Spec-Dokument:

- Regeln, Ablauf, Edge-Cases (Disconnect, Timeout, Tie)
- exakte Formeln, House Edge, Max-Win / Max-Payout-Caps
- Provably-Fair-Mapping: wie aus `HMAC_SHA256(serverSeed, clientSeed:nonce[:cursor])`
  das Ergebnis entsteht (Floats, Shuffle für Mines/Cases, Crash-Point)
- Case-Design: Item-Liste, Gewichte, EV, RTP-Ziel, Volatilität
- Simulation-Script (TypeScript) + Ergebnis-Report (RTP, Varianz, Hit-Rate)

---

## Phase 4 – Architektur & Tech-Stack

Vorschlag (anpassbar):
- **Frontend:** Next.js / React + TypeScript, Tailwind, Framer Motion /
  GSAP, PixiJS für Spinner & Crash-Graph, Howler.js für Sound
- **Backend:** Node.js (NestJS/Fastify) + TypeScript, WebSockets (Socket.IO),
  PostgreSQL (Ledger, doppelte Buchführung, niemals Float für Geld),
  Redis (Game-State, Pub/Sub, Rate-Limits), BullMQ (Jobs)
- **Auth:** Steam OpenID, Session/JWT, 2FA
- **Skins:** Steam-Inventory-API, Trade-Bot-Service, Pricing-Service
  (externe Preis-API + eigener Aufschlag), Deposit/Withdraw-Queue
- **Payments:** Krypto-Gateway, optional Karten über lizenzierten PSP
- **Admin-Panel:** User, Ledger, Seeds, Cases-Editor, Promo-Codes,
  Limits, Fraud-Flags, Logs
- **Security:** serverseitige Ergebnis-Berechnung, idempotente
  Transaktionen, Anti-Double-Spend, Anti-Multi-Account, Audit-Logs

**Output:** Architekturdiagramm, DB-Schema, API-/WS-Event-Liste, Ordnerstruktur.

---

## Phase 5 – Design-System & UI

- Design-Tokens (Farben, Spacing, Radius, Schatten, Glows), Typo-Skala
- Komponenten: Topbar, Sidebar-Nav, Live-Chat, Balance-Widget, Game-Cards,
  Bet-Panel, Live-Bets-Feed, Modals (Deposit/Withdraw/Fairness), Toasts
- Animation-Spec je Spiel (Dauer, Easing, Sound-Cues, Reduced-Motion-Fallback)
- Mobile-first Screens für jede Seite
- Umsetzung als echter Code + Storybook

---

## Phase 6 – Implementierung (iterativ bis fertig)

Reihenfolge:
1. Monorepo-Setup, CI, Lint/Tests
2. Auth + Wallet/Ledger + Provably-Fair-Core (+ Verify-Seite)
3. Erster Gamemode komplett (Frontend + Backend + Tests + Simulation)
4. Weitere Gamemodes nacheinander
5. Cases & Case Battles inkl. Case-Editor
6. Skin-Deposit/Withdraw, Pricing, Trade-Bot (zunächst Testumgebung)
7. Chat, Rain, Level/Rakeback, Affiliate, Leaderboards
8. Admin-Panel, Responsible-Gambling-Tools, KYC-Hooks, Geo-Blocking
9. Load-Tests, Security-Review, Deployment (Docker, Staging/Prod)

Nach jedem Schritt: lauffähiger Stand, Tests grün, Commit, kurze Demo-
Anleitung, dann Freigabe durch mich.

---

## Arbeitsweise

- Eine Phase pro Runde, am Ende immer: **Zusammenfassung, offene Fragen,
  Vorschlag für nächsten Schritt**.
- Keine Annahmen über Zahlen ohne Quelle oder Simulation.
- Wenn etwas rechtlich/ToS-kritisch ist, klar markieren.

**Starte jetzt mit Phase 1.**
