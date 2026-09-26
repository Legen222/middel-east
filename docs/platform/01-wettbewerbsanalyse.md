# Phase 1 – Wettbewerbsanalyse Rust-Skin-Gambling

Stand: 26.09.2026 · Arbeitstitel der eigenen Plattform: **[NAME]**

---

## 0. Methodik & Quellenlage

- Grundlage sind öffentlich zugängliche Reviews, Help-Center-Artikel, Fairness-Seiten
  und Trustpilot-Zusammenfassungen (Quellen am Ende).
- **Einschränkung:** In dieser Arbeitsumgebung sind die Seiten selbst (rustclash.com,
  bandit.camp, rustyloot.gg …) und die meisten Review-Portale per Netzwerk-Policy
  gesperrt. Zahlen stammen daher aus Suchergebnis-Auszügen und sind als
  **„berichtet"** zu lesen. Wo ich einen Wert selbst nachgerechnet habe, steht **✔ verifiziert**.
- **Style & Animationen:** Für RustyLoot und RustMagic sind die Werte per Asset-Analyse
  verifiziert (Abschnitt 5.0). Die übrigen Seiten blockt eine Cloudflare-JS-Challenge,
  dort bleibt es bei einer **Einschätzung**.
- „Rusty.Easy" = **RustEasy** (rusteasy.com).

---

## 1. Überblick

| Seite | Seit | Betreiber / Sitz | Lizenz | Trustpilot | Währung | Modi |
|---|---|---|---|---|---|---|
| **BanditCamp** | 2019 | APEGANG Ltd., Zypern | keine erkennbar | ~3.6 (1.300+) | **Scrap** | 7–8 |
| **RustClash** | 2021 | Zypern, Gründer: Rust-Spieler *Hobbes* | Sweepstakes-Modell | ~4.1 (239) | **Gems** (Coins → Gems) | 8–10 |
| **RustyLoot** | 2022 | anonym | keine | ~4.4 (259) | Coins | 8 |
| **RustEasy** | – | – | keine Multi-Lizenz | ~4.0 | Coins | 9 |
| **RustyPot** | 2017 | – | keine | ~1.8 (20) | Skins + „Grub Bucks" | 2 |
| **RustMagic** | 2023 | Qualitas Services LLC, Belize | **Curaçao** | ~3.4 | Coins | 7 + 3rd-Party-Slots/Live |
| RustChance | – | – | – | – | – | Jackpot, Coinflip, Crash, Tower |
| Howl.gg | – | – | – | – | – | Multi-Game (CS2 + Rust + Crypto) |

**Erste Beobachtung:** Nur RustMagic hat eine erkennbare Lizenz – und genau dort ist
die Trustpilot-Bewertung schwach. Eine lizenzierte Seite mit *gutem* Ruf gibt es im
Rust-Segment aktuell nicht.

---

## 2. Profile je Seite

### 2.1 BanditCamp — der Platzhirsch

| # | Bereich | Befund |
|---|---|---|
| 1 | **Gamemodes** | Wheel of Fortune, Coinflip, Jackpot, Case Opening, Case Battles („Crate Battles"), Crash, Plinko, Mines („Minefield Madness", 5×5, 2–24 Minen, Max-Win 50.000), Spinners. |
| 2 | **Mathematik** | Kein vollständiger House-Edge-Katalog veröffentlicht; Reviews nennen **4–6 %** auf den meisten Spielen, Jackpot-Fee ~**5 %**. **Wheel:** Kopie des In-Game-Rads am Bandit-Camp-Monument – 25 Felder (12/6/4/2/1) für 1×/3×/5×/10×/20×. Nachgerechnet (Auszahlung n:1 + Einsatz): RTP 96 / 96 / 96 / **88** / **84** % → Edge 4 % auf kleine, bis **16 %** auf 20× ✔ verifiziert. |
| 3 | **Provably Fair** | **EOS-Blockchain**: Bei Rundenstart wird die aktuelle EOS-Block-Nummer genommen, Countdown + 2 s addiert, ×2 (2 Blöcke/s) → zukünftiger Block, dessen Hash das Ergebnis seedet. PvP-Spiele (Coinflip, Battles, Jackpot) nehmen den Block erst beim Lock (letzter Spieler joint) + 3–5 s Countdown. Verifizierung über öffentliche EOS-Explorer. |
| 4 | **Economy** | Währung **Scrap** (1 Scrap ≈ 0,01 $). Deposit: Rust-Skins (inkl. **P2P-Marktplatz**), alle großen Kryptos, Karte. Withdraw: Skins, Krypto. Beschwerden über Withdraw-Sperren an Level-/Deposit-Bedingungen. |
| 5 | **Retention** | Volumenbasierter Rakeback, **„Rakeback Rain"** (mehrmals/Std., Höhe abhängig vom eigenen jüngsten Wager), tägliches Gratis-Wheel, Level-Cases, Races (daily/weekly/monthly; Daily-Pot ~5.000 $, Top 15), Affiliate in 4 Tiers mit 1 / 1,5 / 2 / 2,5 % (bis 3 %) Deposit-Kickback. |
| 6 | **Style** *(Einschätzung)* | Stark am Spiel selbst angelehnt (Scrap, Monument-Wheel, Rust-Vokabular), dunkles UI, Chat rechts, Spiele-Navigation oben/links. Markenkern = „Rust-Immersion". |
| 7 | **Animationen** *(Einschätzung)* | Wheel mit Countdown-Timer und Ease-out-Spin; Crash-Kurve; horizontale Case-Reel. |
| 8 | **Stärken / Schwächen** | + Größte Community, längste Historie, EOS-PF ist für PvP vorbildlich. − Keine Lizenz, House Edge nicht zentral dokumentiert, Wheel-Top-Felder 12–16 % Edge, Withdraw-Hürden. |

### 2.2 RustClash — Case-Battle-Spezialist

| # | Bereich | Befund |
|---|---|---|
| 1 | **Gamemodes** | Cases, **Battles**, Double, Upgrader, Mines, Plinko, Crash, **Tiles**, Roll, Reward Pot. Battles: 1v1, 1v1v1, 1v1v1v1, 6er-FFA, 2v2, 3v3 · Typen: Normal, Group (Gewinn geteilt), **Terminal** (nur letzter Case zählt), Clash Spin, **Crazy** (niedrigster gewinnt), Jackpot (Chance ∝ Wert), Private. Demo-Spin ohne Einsatz. |
| 2 | **Mathematik** | Offizielle Fairness-Seite: Double **6,67 %**, Tiles 7,5 %, Upgrader **7,3 %** (RTP 92,7 %), Cases/Battles **10 %**. Ø ~8,3 %. **Double** nachgerechnet: 15 Felder (7 Rot, 7 Schwarz, 1 Grün), 2× / 14× → RTP 14/15 = 93,33 % ✔ verifiziert. |
| 3 | **Provably Fair** | Server-Seed (SHA-256-Hash vorab), änderbarer Client-Seed, Nonce – klassisches Schema für PvE. Für PvP/Battles branchenüblich EOS-Block als öffentlicher Zufall. Kein externes Audit. |
| 4 | **Economy** | Coins kaufen → **Gems** als Spielwährung (Sweepstakes-Konstrukt). Deposit: Skins, Krypto. Withdraw: Skins, Krypto (**2–5 % Fee** auf Krypto), Balance-Transfer zu Cases.gg / Clash.gg (Schwesterseiten). |
| 5 | **Retention** | Rakeback daily/weekly/monthly, Level-Cases (Lvl 5, 10, 20 … 90, 200), Free Case täglich, Missionen (Discord beitreten, Battle gewinnen …), Rain alle 30 min, Daily Race, Faucet, **Loan-System ab Level 30** (!), Affiliate-Codes. |
| 6 | **Style** *(Einschätzung)* | Dunkles UI, hochwertige Case-Artworks, Streamer-orientiert (Battles sind „content-fähig"). |
| 7 | **Animationen** *(Einschätzung)* | Horizontale Reel mit Near-Miss-Stopp, alternative „Clash Spin"-Animation (gleiche Odds, andere Präsentation), Battle-Spalten laufen synchron. |
| 8 | **Stärken / Schwächen** | + Bestes Battle-Feature-Set, transparente Edge-Tabelle, Netzwerk-Effekt mit Schwesterseiten. − 10 % auf Cases/Battles ist teuer, Loan-System ist ein Responsible-Gambling-Red-Flag, Sweepstakes-Grauzone. |

### 2.3 RustyLoot — Breite + PvP-Innovation

| # | Bereich | Befund |
|---|---|---|
| 1 | **Gamemodes** | Case Battles, Case Opening, Coinflip, Wheel, Upgrader, Mines, Plinko, **PvP Mines** (zwei Spieler auf eigenem Grid – wer mehr sichere Felder aufdeckt, gewinnt den Pot; gilt als das eigenständigste Original). |
| 2 | **Mathematik** | House Edge **5–10 %** je nach Modus; Coinflip am niedrigsten. Wheel-Edge über Feldverteilung. |
| 3 | **Provably Fair** | Server/Client-Seed mit öffentlicher Verifizierung. |
| 4 | **Economy** | Deposit & Skin-/Krypto-Withdraw „instant in practice". Steam-OAuth-Login + 2FA optional. $2 Free-Coin Welcome-Bonus. |
| 5 | **Retention** | **Rakeback 4 % → 12,5 %** nach Level (Bronze → Diamond), Giveaways (standard/booster/flash), Daily Cases. |
| 6–7 | **Style / Animation** *(Einschätzung)* | Klassisches Skin-Site-Layout; PvP Mines als Split-Screen. |
| 8 | **Stärken / Schwächen** | + Bester Trustpilot-Score im Feld, schnelle Payouts, eigener PvP-Twist. − Anonymer, unlizenzierter Betreiber. |

### 2.4 RustEasy — Arcade & niedrige Crash-Edge

| # | Bereich | Befund |
|---|---|---|
| 1 | **Gamemodes** | Cases, Case Battles, Coinflip, Upgrader, Mines, Jackpot, Double/Roulette, **Bust** (Crash), **Champion** (eigener PvP-Modus). |
| 2 | **Mathematik** | **Bust 2 %**, Mines 5 %, Cases/Battles/Upgrader **10 %**. PvP (Coinflip, Jackpot, Champion): keine Edge, sondern **7–10 % Commission** auf den Gewinn. |
| 3 | **Provably Fair** | Server + Client-Seed, verifizierbar. Sehr geringe UI-Latenz bei Bust/Roulette gelobt. |
| 4 | **Economy** | Breitestes Deposit-Menü (Skins, Cash, E-Wallets, Krypto), Skin-Withdraw instant, **1× Wager des Deposits** vor Withdraw (Anti-Laundering). P2P über Steam-Trade-URL. |
| 5 | **Retention** | **VIP Club wie ein Battle Pass** (sichtbare XP-Leiste, Reward je Level), Rakeback daily/weekly/monthly, Tip-into-Rain, Weekly Leaderboard. |
| 8 | **Stärken / Schwächen** | + Battle-Pass-Progression ist die beste Retention-UX im Feld, Crash mit 2 % sehr fair. − Cases 10 %, keine Lizenz. |

### 2.5 RustyPot — der Veteran

| # | Bereich | Befund |
|---|---|---|
| 1 | **Gamemodes** | Nur **Jackpot** und **Coinflip**. Keine Cases, kein Crash, kein Roulette. |
| 2 | **Mathematik** | Jackpot-Fee berichtet **22 %** (Branche 5–10 %), Coinflip **6 %**. |
| 3 | **Provably Fair** | Server-Seed + **Random.org** als Drittquelle. |
| 4 | **Economy** | Direkte Skin-Trades via Steam-Bot (10 min Annahmefrist), Min-Deposit 0,50 $. Nicht-Rust-Skins (CS2/TF2/Dota) → „Grub Bucks" mit +50 %-Kurs; Withdraw über Grub-Shop. |
| 5 | **Retention** | Kaum mehr als Deposit-Bonus/Giveaways. |
| 8 | **Stärken / Schwächen** | + Seit 2017 ohne großen Betrugsfall, „Old-School"-Skin-in-Skin-out. − Extrem hohe Fee, veraltetes Produkt, 1,8 Trustpilot. |

### 2.6 RustMagic — lizenziert, aber schlecht bewertet

| # | Bereich | Befund |
|---|---|---|
| 1 | **Gamemodes** | Roulette, Case Opening, Mines, Flipper u. a. (7 Originals) + **Third-Party-Slots und Live-Games**. |
| 2 | **Mathematik** | **Pauschal 10 %** Edge, auch auf Mines (Konkurrenz ~5–6 %). |
| 3 | **Provably Fair** | EOS-basiert. |
| 4 | **Economy** | Curaçao-Lizenz. Beschwerden: blockierte Withdraws bei großen Beträgen, Bans. |
| 5 | **Retention** | Instant/daily/weekly/monthly Rakeback, Weekly Leaderboard (Top 14, 10k $ Pool). |
| 8 | **Stärken / Schwächen** | + Einzige Lizenz im Feld, Slots-Angebot. − 50 % 1-Stern-Reviews, Support „eine Woche", teuer. **Beweis: Lizenz allein erzeugt kein Vertrauen.** |

### 2.7 Kurz: RustChance & Howl.gg

- **RustChance:** Jackpot, Coinflip, Crash, **Tower**; keine Cases; „Supply Drop" Free-Case + Level-Rewards.
- **Howl.gg:** Hybrid aus Crypto-Casino + CS2/Rust-Skins; Deposit auch via PaySafe, PayPal, Google Pay, Bank. Zeigt, wohin sich der Markt bewegt: Skin-Site → Multi-Asset-Casino.

---

## 3. Vergleichsmatrizen

### 3.1 Gamemodes

| Modus | Bandit | Clash | Loot | Easy | Pot | Magic | Chance |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Coinflip | ✔ | – | ✔ | ✔ | ✔ | (Flipper) | ✔ |
| Jackpot | ✔ | (Battle-Typ) | – | ✔ | ✔ | – | ✔ |
| Wheel / Double / Roulette | ✔ | ✔ | ✔ | ✔ | – | ✔ | – |
| Case Opening | ✔ | ✔ | ✔ | ✔ | – | ✔ | – |
| Case Battles | ✔ | ✔✔ | ✔ | ✔ | – | – | – |
| Upgrader | – | ✔ | ✔ | ✔ | – | – | – |
| Crash | ✔ | ✔ | – | ✔ | – | – | ✔ |
| Mines | ✔ | ✔ | ✔ | ✔ | – | ✔ | – |
| Plinko | ✔ | ✔ | ✔ | – | – | – | – |
| Towers / Tiles | – | ✔ | – | – | – | – | ✔ |
| **Eigener PvP-Twist** | – | Battle-Typen | **PvP Mines** | **Champion** | – | – | – |
| Dice / Limbo / Blackjack | – | – | – | – | – | 3rd-Party | – |

→ **Dice, Limbo, Blackjack, Keno, Hi-Lo** bietet *kein* Rust-Original an. Blackjack fehlt als Skill-Element komplett.

### 3.2 House Edge (berichtet)

| Modus | Bandit | Clash | Loot | Easy | Pot | Magic |
|---|---|---|---|---|---|---|
| Coinflip / PvP-Rake | ~5 % | – | ~5 % | 7–10 % | 6 % | 10 % |
| Jackpot-Fee | ~5 % | – | – | 7–10 % | **22 %** | – |
| Wheel/Double | 4–16 % ✔ | 6,67 % ✔ | ? | ? | – | 10 % |
| Crash | ? | ? | – | **2 %** | – | – |
| Mines | ? | ? | ? | 5 % | – | 10 % |
| Upgrader | – | 7,3 % | ? | 10 % | – | – |
| Cases / Battles | ? | 10 % | ? | 10 % | – | 10 % |

**Erkenntnis:** Die Spanne liegt bei **2–22 %**. Krypto-Casinos (Stake-Originals) laufen mit 1–3 %. Cases bei 10 % sind der Cashcow-Modus des gesamten Segments.

### 3.3 Provably Fair

| Schema | Wer | Vorteil | Schwäche |
|---|---|---|---|
| Server-Seed-Hash + Client-Seed + Nonce (HMAC-SHA256) | Clash, Loot, Easy | Standard, User kann Seed ändern | Server-Seed-Rotation muss sauber sein |
| **EOS-Future-Block** | Bandit, Magic, (Clash PvP) | Kein Betreiber kennt Zufall vorab – ideal für PvP | Abhängig von EOS-Chain & Explorern |
| Random.org | Pot | Externe Quelle | Vertrauen in Dritten, schwer nachprüfbar |

**Lücke:** Niemand hat ein **externes Audit** (z. B. iTech Labs / GLI / eCOGRA), und niemand bietet einen **In-Browser-Verifier mit Open-Source-Code** auf GitHub, der Case-Rollen, Battle-Slots und Plinko-Pfade 1:1 nachspielt.

### 3.4 Economy

| | Bandit | Clash | Loot | Easy | Pot | Magic |
|---|---|---|---|---|---|---|
| Währung | Scrap | Coins→Gems | Coins | Coins | Skins/Grub | Coins |
| Skin-Deposit | ✔ P2P | ✔ | ✔ | ✔ P2P | ✔ Bot | ✔ |
| Krypto | ✔ | ✔ | ✔ | ✔ | – | ✔ |
| Karte/E-Wallet | ✔ | ? | ? | ✔✔ | – | ? |
| Withdraw-Fee | ? | Krypto 2–5 % | ? | ? | ? | ? |
| Withdraw-Hürde | Level/Deposit | – | – | 1× Wager | – | Limits |

**Pricing-Quellen im Markt:** Steam Community Market, SCMM (aggregiert 20+ Quellen, API), SIH-API, RustSkins.net. Seiten zeigen i. d. R. **nicht**, welche Quelle sie nutzen → Deposit-/Withdraw-Spread ist intransparent.

**Steam-Kontext 2025/26:** Die im Juli 2025 eingeführte **Trade Protection (7-Tage-Reversal)** gilt nur für CS2 – Rust-Items sind nicht betroffen. Dadurch ist Rust für Skin-Sites aktuell attraktiver als CS2 (kein Reversal-Risiko), aber CS2- und Rust-Items können nicht mehr in einem Trade gemischt werden.

### 3.5 Retention

| Feature | Bandit | Clash | Loot | Easy | Pot | Magic |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Rakeback | ✔ Volumen + Rain | ✔ d/w/m | ✔ 4–12,5 % | ✔ d/w/m | – | ✔ i/d/w/m |
| Level / XP | ✔ | ✔ | ✔ Tiers | ✔✔ Battle Pass | – | ? |
| Daily Free | Wheel | Case | Case | ? | – | ? |
| Rain | ✔ | ✔ 30 min | Giveaways | ✔ Tip-Rain | – | ? |
| Races / Leaderboard | ✔ d/w/m | ✔ daily | ? | ✔ weekly | – | ✔ weekly |
| Missionen | – | ✔ | – | – | – | – |
| Affiliate | ✔ 4 Tiers | ✔ | ✔ | ✔ | – | ✔ |
| Kredit / Loan | – | **✔ (RG-Risiko)** | – | – | – | – |
| **Responsible-Gambling-Tools sichtbar** | ✗ | ✗ | ✗ | ✗ | ✗ | (Lizenz-Pflicht) |

---

## 4. Mathematik-Referenz (Branchen-Formeln)

Diese Formeln sind Grundlage für Phase 3 (eigene Spiele, dort mit ≥ 10 Mio. Runden Monte-Carlo).

| Modus | Formel | Beispiel |
|---|---|---|
| **Upgrader** | `chance = input / target × (1 − e)` | e = 7,3 % → 100 $ auf 200 $ = 46,35 % |
| **Crash** (bustabit-Stil) | `h = HMAC(seed)[0..52 bit]`, `E = 2^52`; `crash = max(1, floor((100·E − h) / (E − h)) / 100)`; Edge über Instant-Bust-Anteil oder Faktor `(1−e)` | P(crash ≥ x) = (1 − e) / x |
| **Wheel / Double** | `RTP_i = (slots_i / N) × payout_i` | Clash Double 7/15 × 2 = 93,33 % ✔ |
| **Mines** (5×5, m Minen, k Klicks) | `mult(k) = (1 − e) × C(25, k) / C(25 − m, k)` | m = 3, k = 5, e = 5 % → 1,92× ✔ |
| **Plinko** (n Reihen) | `RTP = Σ C(n,k) / 2^n × mult_k` | Multiplikator-Tabelle so wählen, dass RTP = 1 − e |
| **Coinflip** | Rake auf Pot: Gewinner erhält `2·B·(1 − r)` → Edge = r · Rake nur auf Netto-Gewinn: Gewinner erhält `B + B·(1 − r)` → Edge = r / 2 | r = 5 %: 5 % bzw. 2,5 % ✔ |
| **Jackpot** | `P(win_i) = v_i / Σv`; Fee `f` vom Pot | EV Spieler = −f · v_i |
| **Case EV** | `EV = Σ p_j × price_j`; `edge = 1 − EV / case_price` | Branche: 5–15 % |
| **Battle** | Case-Edge × Anzahl Cases; Gewinner erhält alle Drops | Edge = Case-Edge (keine Extra-Rake bei Clash) |

⚠ **Wichtiger Punkt Coinflip/Jackpot:** „5 % Fee" auf den *Pot* ist für den Spieler 5 % seines Einsatzes; „5 % auf den *Gewinn*" ist nur ~2,5 %. Seiten vermischen das in der Kommunikation → Chance für uns, es sauber auszuweisen.

---

## 5. Style & Animationen

### 5.0 Verifiziert per Asset-Analyse (26.09.2026)

Nach Freigabe des Netzwerks wurden HTML, CSS und JS-Bundles direkt ausgewertet.
**RustClash, BanditCamp, RustEasy und RustyPot** liefern nur eine Cloudflare-JS-Challenge
(„Just a moment…“). Sie brauchen einen echten Browser, der in dieser Umgebung dem
Proxy-Zertifikat nicht vertraut. Für diese vier bleibt 5.1 eine Einschätzung.

**RustyLoot** (SolidJS + Tailwind, Bundle 5,5 MB)

| Aspekt | Befund ✔ |
|---|---|
| Hintergründe | Navy-Violett-Stufen `#16182E` · `#1A1B30` · `#1D1F30` · `#1F2344` · `#1D2352` · `#2A2F57`, Linien `#404472` |
| Akzent | Amber `#FFB436` (häufigste Farbe), hell `#FFD58F`/`#FFD691`, dunkel `#EEB351`; Win-Grün als Gradient `#27F278 → #86FFB6` |
| Fonts | **Space Grotesk** (Headlines/Zahlen), **Lato** (Body), **Quicksand** (vereinzelt) |
| UI-Transitions | Tailwind-Standard `200 ms cubic-bezier(.4,0,.2,1)`; Modals/Pops mit Overshoot `cubic-bezier(.4,0,0,1.2/1.5)` |
| Case-/Battle-Spinner | **vertikal** (`translateY`), **3850 ms**, Timeline mit anime.js; Gewinn-Item danach `scale 1.2` in 478,5 ms, Verlierer-Items `scale 0`, Pot-Count-up 500 ms, Winner-Highlight 300 ms |
| Upgrader | `upgraderSpin` mit `cubic-bezier(0.12, 0.8, 0.38, 1)` (starker Ease-out) |
| Win-Effekte | `winBgGoldAnimation`, `textAnimation` mit `cubic-bezier(0.25, 1, 0.5, 1)`; `ping-won` (Ring skaliert auf 5×, 1 s); `flip-and-grow` (rotateY 360° + Scale 0.25→1, 0,5 s) |
| Plinko/Upgrader-Deko | **Sprite-Sheets** mit `steps()` (Pipes, Wires, Skull, Zap-Tiles), z. B. `playv-pipe 3s steps(5)` + `playh-pipe .6s steps(15)` |
| Media | ~100 vorgerenderte **WebM/MP4-Clips** und MP3/WAV-Sounds (Case-Intros, Effekte); Timeline-Label `video-started+=640` → Spinner startet 640 ms nach Clip-Start |
| Ambient | Live-Ticker `slide 32s linear infinite`, Promo-Glimmer 3 s, Countdown-Ring über `stroke-dashoffset` |
| A11y | Einzelne `motion-safe:`-Varianten vorhanden (Reduced-Motion teilweise respektiert) |

**RustMagic** (Next.js + styled-components)

| Aspekt | Befund ✔ |
|---|---|
| Hintergründe | Violett-Anthrazit `#1B192F` · `#1F1D34` · `#25243E` · `#292843` · `#373651`; Muted-Text `#9793BA` / `#686584` |
| Akzente | **Hot Pink `#FD1B62`** (Primär), Lime `#A5EC60` (Win), Orange `#F99750`, Gelb `#FFDD59`, Blau `#3A89EB` |
| Fonts | **Golos Text** (UI), **Integral CF** (Display, ultrabreit), vereinzelt **Chakra Petch** |
| Buttons | „3D-Raise“-Buttons (`--button-raise-level: 4px`, Press → 0 px), Transform-Speed 150 ms ease-out |
| Effekte | Shimmer/Skeleton-Loader, `stars-inf`, `MOVE-BG`, Loading-Bar 6 s ease-out |

**Folgerung:** Beide verifizierten Seiten nutzen **dunkles Blau-/Violett-Anthrazit + ein warmer Akzent**
(Amber bzw. Pink). Echte Rust-Materialität (Rost, Metall, Tape) setzt keine der beiden ein.
RustyLoot investiert stark in **vorgerenderte Video-Effekte + Sprite-Animationen**. Das ist die
Messlatte für „Juice“.

### 5.1 Branchenmuster *(Einschätzung für die übrigen Seiten)*

Die folgenden segmentweiten Muster sollten per Screenshot-Audit bestätigt werden, sobald ein Browser-Zugang möglich ist:

**Layout-Standard**
- Topbar: Logo · Balance-Pill mit Deposit-CTA · Level-Badge · Avatar (Steam).
- Linke Sidebar: Spiele-Liste mit Icons; **rechte Sidebar: Live-Chat** mit Rain-Banner.
- Unten/oben: Live-Drops-Ticker („X hat Y gezogen").
- Mobile: Chat als Drawer, Games als Grid; häufig nur „responsive geschrumpft", selten mobile-first.

**Farbwelt**
- Fast alle: sehr dunkles Blau-Grau / Anthrazit (`#0f1117`–`#1a1d26`-Bereich), ein Akzent (Orange, Gelb oder Grün), Raritäts-Farben aus dem Spiel (Grau → Blau → Lila → Pink/Rot → Gold).
- Schrift: geometrische Sans (Inter, Montserrat, Poppins-artig), Zahlen oft tabellarisch.
- Rust-Bezug meist nur über Skins und Wörter (Scrap, Crates) – **kaum echte Material-/Texturwelt** (Rost, Wellblech, Tape, Sprühfarbe).

**Animationen**
| Element | Muster | Typ. Dauer / Easing |
|---|---|---|
| Case-Reel | horizontal (Clash/Bandit) oder **vertikal (RustyLoot ✔)**, Near-Miss-Stop, Tick-Sound pro Item | 3,85 s (RustyLoot ✔) bis ~7 s, starker Ease-out |
| Wheel/Double | Countdown-Balken → Spin → Glow auf Gewinnfeld | 6–8 s Spin |
| Coinflip | 3D-Münze (CSS/Lottie), 2–3 s | ease-in-out |
| Crash | Kurve wächst exponentiell, Achsen skalieren mit; Rakete/Figur | Echtzeit, 20–60 fps |
| Mines | Tile-Flip, Gem- vs. Explosions-Sprite, Multiplikator-Counter | 150–300 ms |
| Win-Effekt | Konfetti/Partikel, Raritäts-Glow, Count-up der Summe | 0,8–1,5 s |
| Battles | parallele Reels pro Spieler, Round-Counter, Gewinner-Spalte leuchtet | pro Runde 4–6 s |

---

## 6. Stärken, Schwächen, Lücken (Feld-übergreifend)

**Stärken des Marktes**
- Case Battles als Content-Maschine für Streamer (Clash).
- EOS-Future-Block für PvP (Bandit) ist technisch sauber.
- Battle-Pass-Progression (Easy) und Level-Rakeback (Loot) als Retention-Motor.

**Schwächen**
- **Vertrauen:** Top-Beschwerden sind Withdraw-Sperren, Bans nach Gewinnen, versteckte Level-/Wager-Hürden, nicht nachvollziehbare Rain-/Giveaway-Ergebnisse.
- **Intransparente Edge:** Nur Clash veröffentlicht eine Tabelle; Wheel-Top-Felder bis 16 %, Jackpot bis 22 %.
- **Kein Responsible Gambling:** keine sichtbaren Limits, kein Reality-Check; Clash bietet sogar **Kredite**.
- **Lizenz ≠ Vertrauen:** Die einzige lizenzierte Seite (Magic) ist gleichzeitig eine der unbeliebtesten.
- **Generische Optik:** Dark-UI + Akzentfarbe, austauschbar mit jeder CS2-Seite.

---

## 7. Fazit

### Was ist Standard (Table Stakes für Launch)
1. Steam-Login, Skin-Deposit/-Withdraw (P2P), Krypto.
2. Case Opening, Case Battles (mind. 1v1 / 1v1v1 / 2v2, Normal + Crazy + Terminal), Coinflip, Jackpot, Wheel/Double, Upgrader, Mines, Crash, Plinko.
3. Provably Fair mit Server-/Client-Seed; EOS o. Ä. für PvP.
4. Rakeback (d/w/m), Level-Cases, Daily Free, Rain, Races, Affiliate-Codes.
5. Chat mit Rain, Live-Drop-Ticker.

### Was differenziert heute
- Battle-Varianten & Streamer-Tauglichkeit (Clash)
- Eigene PvP-Modi (PvP Mines, Champion)
- Battle-Pass-XP (Easy), niedrige Crash-Edge (Easy 2 %)
- Community-Größe & Rust-Immersion (Bandit)

### Die Marktlücke
1. **„Trust by Design":** Lizenziert **und** radikal transparent – öffentliche Edge-Tabelle je Modus, Open-Source-Verifier, externes RNG-Audit, Withdraw-SLA mit Live-Statistik, keine versteckten Wager-/Level-Hürden (AML-Regel klar kommuniziert). Das hat *niemand*.
2. **Responsible Gambling als Feature statt Pflicht:** Limits, Cooldown, Reality-Check, Session-Summary – sichtbar im UI, nicht im Footer. Gleichzeitig Voraussetzung für die Lizenz.
3. **Faire Edges:** Crash/Dice/Limbo bei 1–3 %, Cases bei 5–7 % statt 10 %, Jackpot/Coinflip-Rake klar als „% vom Pot" ausgewiesen.
4. **Echte Rust-Gameplay-Mechaniken als Originals:** Bisher ist „Rust" nur Skin-Lieferant und Vokabular. Modi, die Rust-Spielschleifen abbilden (Raid, Monument-Run, Airdrop, Wipe-Zyklus), existieren nicht. → Signature-Feature-Kandidaten für Phase 2.
5. **Echte Rust-Ästhetik:** Rost, Wellblech, Klebeband, Sprühschablonen, Leuchtstoffröhren, Tool-Cupboard-UI – statt generischem Dark-Mode.
6. **Lückenmodi:** Dice, Limbo, Hi-Lo, Blackjack (Skill-Element) – im Rust-Segment unbesetzt.
7. **Mobile-first** mit Haptik, kurzen Runden, Bottom-Nav.

### Regulatorische Notiz für Phase 2+
- Das Feld operiert fast komplett ohne Lizenz → unser Launch im **Demo-Modus** und späterer Echtgeld-Betrieb mit Lizenz (Curaçao-LOK, Anjouan oder MGA) ist ein echtes Unterscheidungsmerkmal, aber mit Kosten für KYC/AML-Reibung. Das muss UX-seitig abgefedert werden (gestaffeltes KYC nach Schwellenwerten).
- Geo-Blocking mindestens für Länder mit expliziten Verboten bzw. eigener Lizenzpflicht (u. a. USA-Bundesstaaten, UK, FR, NL, DE, AU – finale Liste mit der gewählten Lizenz abstimmen).
- Keine Kredit-/Loan-Features (Clash-Anti-Pattern).

---

## Quellen

- RustyPot: [riskyskins](https://riskyskins.com/blog/rustypot-review/), [fairness.gg](https://fairness.gg/reviews/rustypot/), [csgocorn](https://csgocorn.com/reviews/rustypot), [rustypot FAQ](https://rustypot.com/faq)
- BanditCamp: [Help Center – Provably Fair](https://help.bandit.camp/en/articles/6109230-provably-fair), [Help Center – Free scrap](https://help.bandit.camp/en/articles/6088700-free-scrap-and-promo-codes), [SynTSkins](https://www.syntskins.com/rust/review/bandit-camp), [riskyskins](https://riskyskins.com/blog/banditcamp-review/), [skinlords](https://skinlords.com/review/banditcamp/), [skincasereviewer](https://skincasereviewer.com/rust/reviews/bandit-camp), [Trustpilot](https://www.trustpilot.com/review/bandit.camp), [Rust-Wheel-Odds](https://whenisforcewiperust.com/bandit-camp-rust)
- RustClash: [rustclash.com](https://rustclash.com/), [fairness.gg](https://fairness.gg/reviews/rustclash/), [riskyskins](https://riskyskins.com/blog/rustclash-review/), [freeskinshub](https://freeskinshub.net/rust-gambling-sites/rustclash-review/), [SkinsVault](https://skinsvault.gg/blog/rust-skin-gambling-guide-2026), [sweepskings](https://sweepskings.com/reviews/rustclash/)
- RustyLoot: [casinorankr](https://casinorankr.com/reviews/rustyloot), [riskyskins](https://riskyskins.com/blog/rustyloot-review/), [wagertruth](https://wagertruth.com/reviews/rustyloot), [PvP Mines](https://rustyloot.gg/pvpmines)
- RustEasy: [skincasereviewer](https://skincasereviewer.com/rust/reviews/rusteasy), [topskinsites](https://topskinsites.com/casino/rusteasy-review/), [wagertruth](https://wagertruth.com/reviews/rusteasy/), [Champion](https://www.rusteasy.com/champion)
- RustMagic: [skincasereviewer](https://skincasereviewer.com/rust/reviews/rustmagic), [fairness.gg](https://fairness.gg/reviews/rustmagic/), [casinorankr](https://casinorankr.com/reviews/rustmagic)
- Weitere: [RustChance (skinlords)](https://skinlords.com/review/rustchance/), [Howl.gg (flashyflashy)](https://flashyflashy.com/casino/howl/), [Übersicht riskyskins](https://riskyskins.com/blog/rust-gambling-sites/)
- Pricing: [SCMM](https://rust.scmm.app/skins), [SIH](https://sih.app/), [RustSkins.net](https://rustskins.net/)
- Steam Trade Protection: [DMarket](https://dmarket.com/blog/trade-protection-for-cs2-skins/), [Skinswap Help](https://intercom.help/skinswap/en/articles/11841490-steam-trade-protection-what-it-means-for-your-balance)
- Spielerbeschwerden: [Trustpilot RustClash](https://at.trustpilot.com/review/rustclash.com), [Noonkick – Red Flags](https://www.noonkick.com/post/rust-gambling-how-to-spot-a-scammy-gambling-site-rust-gambling-blog)
