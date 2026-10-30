# Phase 11 – Sechs neue Modi & komplettes Backoffice (SCRAPLINE)

Stand: 20.10.2026.
- Code:
  - `platform/engine/src/games/{wheel,jackpot,airdrop,towers,hilo,blackjack}.ts`
  - `platform/server/src/{wheel,jackpot,originals,site,cases,chains,explorer,reports}.ts`
  - `platform/web/src/views/{wheel,jackpot,towers,blackjack,hilo,airdrop,admin-ops}.ts`
- Die Oberfläche ist englisch, dieses Dokument bleibt deutsch.

## 1. Live-Analyse der Wettbewerber (Browser)

**Methode**

- Headless Chromium (Playwright) über den Proxy der Umgebung: Startseiten und Spielseiten geladen, Text, Links und Screenshots gesichert.
- Die Chrome-Erweiterung („Claude in Chrome“) war in dieser Sitzung nicht verbunden. Deshalb lief die Analyse im eingebauten Chromium des Containers.

**Nicht erreichbar**

Die Netzwerk-Policy dieser Umgebung hat folgende Hosts geblockt (kein Umgehungsversuch):

| Host | Wirkung |
|---|---|
| `challenges.cloudflare.com` | Cloudflare-Prüfung lädt nicht. bandit.camp bleibt im Ladebildschirm, Unterseiten von RustyPot und RustClash zeigen „Just a moment …“. |
| `api.rustyloot.gg` | RustyLoot lädt nur eine leere Hülle. RustMagic bleibt ebenfalls leer. |
| rusteasy.com, rain.gg, www.rustbet.com | `ERR_TUNNEL_CONNECTION_FAILED` |

Freigeben lassen sich diese Hosts in den Umgebungseinstellungen unter *Network access* → erlaubte Domains. Danach kann die Analyse mit denselben Skripten wiederholt werden.

### 1.1 Befunde

| Seite | Modi (live gesehen) | Bemerkenswert |
|---|---|---|
| **RustChance** | Jackpot in zwei Räumen (*High Rollers*: 100 Items oder Timer; *Low Ballers*: 50 Items), Coinflip, Wheel (Felder X2 / X14 / X2), Crash, Bonuses, Shop | Jeder Jackpot zeigt Hash, Secret, Ticket und einen random.org-Seed mit Seriennummer. Dazu Level-Belohnungen auf jeder Stufe (Bronze I … Silver …), Redeem-Code, Affiliates und ein Oster-Event (Sterne aus Einzahlungen → Cases und Gewinnspiel-Tickets). Auszahlung über einen Item-Shop mit Tageslimit. |
| **Howl.gg** | Cubes, Mines, Jackpot, Coinflip, **Hi-Lo**, Dice, **Blackjack**, Cases (Gratis-Tagescase), Slots von Drittanbietern, Live-Games, Sportsbook | Rain im Chat („131 users joined and received 310.72 coins“). VIP-„Rank Match“ für Spieler anderer Casinos, Reload- und Monatsboni. Einzahlung mit Rust-/CS2-Skins, Krypto, Karte, PayPal und Paysafe. Eigene Seiten zu Self-Exclusion, AML und KYC. Jede Wette hat eine öffentliche URL (`/bets/mines/…`). |
| **RustyPot** | Jackpot (200 Items, Timer), Coinflip | Ticket-Anzeige mit 8 Nachkommastellen, „[Admin] Server: Connecting …“-Status, Discord-Giveaways. |
| **bandit.camp** | (nur Ladebildschirm) | Namensgeber des In-Game-Rads: Das Bandit-Camp-Rad in Rust hat 25 Felder (1 × 12, 3 × 6, 5 × 4, 10 × 2, 20 × 1). |

### 1.2 Lücken, die SCRAPLINE schließt

- **Fairness**
  - Die Wettbewerber zeigen Hash und Seed.
  - Keiner zeigt einen RTP pro Spiel oder hat einen öffentlichen Prüfer, der Wheel, Hi-Lo oder Blackjack nachrechnet.
  - SCRAPLINE veröffentlicht RTP, Beweis und Monte-Carlo-Lauf für jedes Spiel.
  - Beacon-basierte Client-Seeds lassen weder Betreiber noch Spieler das Ergebnis steuern.
- **Spielerschutz**
  - Rank-Match und Reload-Boni zielen auf Vielspieler.
  - SCRAPLINE sperrt Boni (Promo-Codes, Rain, Kisten) während Pausen und Selbstsperren.
- **Betrieb**
  - Ein Admin-Status im öffentlichen UI (RustyPot) ist kein Backoffice.
  - SCRAPLINE hat jetzt ein vollständiges, auditiertes Backoffice (Abschnitt 3).

## 2. Die sechs neuen Modi

| Modus | Vorbild | Typ | House Edge | RTP | Seeds |
|---|---|---|---:|---:|---|
| **Bandit Wheel** | Rust-Bandit-Camp, RustChance Wheel | live, alle 25 s | 4 % | 96 % jedes Feld | Hash-Kette + Beacon |
| **Jackpot** | RustChance, Howl, RustyPot | PvP-Topf, 2 Räume | 4 % vom Topf | 96 % jeder Einsatz | Topf-Seed + Beacon (Runde +2 beim Schließen) |
| **Monument Run** | „Towers“-Spiele | Original, Schritt für Schritt | 3 % | 97 % jede Strategie | Spieler-Seed |
| **Hi-Lo** | Howl | Original, Karten | 3 % | 97 % jede Strategie | Spieler-Seed |
| **Blackjack** | Howl | Original, Skill | — | 99,31 % bei optimalem Spiel | Spieler-Seed |
| **Airdrop** | Limbo | Original, sofort | 2 % | 98 % jedes Ziel | Spieler-Seed |

### 2.1 Mathematik

**Bandit Wheel**
- Feld = ⌊f · 25⌋. Das Feld mit n Segmenten zahlt (1 − e) · 25 ÷ n, also 2 / 4 / 6 / 12 / 24 ×.
- E[Auszahlung] = n/25 · (1 − e) · 25/n = 1 − e für jedes Feld.

**Jackpot**
- Ein Ticket pro Milli-Scrap, vergeben in der Reihenfolge des Eintritts. Gewinnerticket = ⌊f · Σ⌋.
- Ein Einsatz a gewinnt mit a/Σ und erhält Σ · (1 − e).
- E = a/Σ · Σ(1 − e) = a(1 − e), also RTP = 1 − e für jede Topfgröße und jede Mischung.

**Monument Run**
- 8 Räume. Die Keycard bestimmt Türen und Fallen: Grün 4/1, Blau 3/1, Rot 2/1, Schwarz 3/2.
- Pro Raum gilt p = sicher ÷ Türen. Auszahlung nach k Räumen: (1 − e) / p^k.
- Der Gewinnfaktor ist ein Martingal, deshalb RTP = 1 − e für jede Stopp-Regel.
- Die Fallen werden beim Start gezogen (partieller Fisher–Yates je Raum) und bleiben bis zum Ende auf dem Server.

**Hi-Lo**
- Karte = ⌊f · 52⌋, Rang = Karte mod 13 + 1. Gleich zählt für beide Seiten.
- P(höher oder gleich) = (14 − r)/13 und P(niedriger oder gleich) = r/13.
- Faktor nach richtigen Tipps mit den Chancen pᵢ: (1 − e) / Πpᵢ. Das ist wieder ein Martingal, also 97 % für jede Strategie.
- Überspringen ist kostenlos. Tipps mit p = 1 werden abgelehnt, sonst ließe sich der Faktor ohne Risiko aufblähen.

**Blackjack**
- Unendliches Deck. Regeln:
  - S17, Blackjack zahlt 3:2, der Dealer schaut nach (Peek).
  - Double auf zwei beliebige Karten, ein Split.
  - Gesplittete Asse bekommen je eine Karte.
  - Kein Double nach Split, keine Versicherung, kein Surrender.
- Der exakte RTP bei optimalem Spiel kommt aus dynamischer Programmierung über (harte Summe, Ass): **0,9930976** (99,31 %).
- Es ist ein Skill-Spiel: Der RTP-Monitor zeigt den Ist-Wert, aber keinen z-Test.
- Double und Split setzen einen zweiten Einsatz, mit derselben RG-Prüfung und Buchung im Ledger.

**Airdrop**
- h = ⌊f₁ · 2³²⌋ · 2²⁰ + ⌊f₂ · 2²⁰⌋ (gleichverteilt auf 52 Bit).
- Landung = ⌊100 · (1 − e) · 2⁵² / (2⁵² − h)⌋ / 100, die Formel der Scrap Press.
- P(Landung ≥ x) = (1 − e)/x, also RTP = 1 − e für jedes Ziel von 1,01 × bis 10 000 ×.

### 2.2 Monte-Carlo (je 10 000 000 Runden, alle bestanden)

Ein Auszug, vollständig in [`platform/engine/sim/RESULTS.md`](../../platform/engine/sim/RESULTS.md). Insgesamt 60 Läufe, keiner mit |z| ≥ 4.

| Spiel | Konfiguration | Theorie | Simuliert | z |
|---|---|---:|---:|---:|
| Wheel | Feld 20 (24 ×) | 96,0000 % | 95,8932 % | −0,72 |
| Jackpot | 2–20 Einsätze, zufällige Höhen | 96,0000 % | 96,0315 % | 0,21 |
| Monument Run | zufällige Karte, Tür und Stopp | 97,0000 % | 96,7402 % | −0,49 |
| Hi-Lo | 25 % Stopp, 10 % Skip, Stopp ≥ 1 000 × | 97,0000 % | 98,3390 % | 1,58 |
| Blackjack | optimale Strategie | 99,3098 % | 99,3304 % | 0,58 |
| Airdrop | Ziel log-gleichverteilt 1,01–1 000 × | 98,0000 % | 98,1931 % | 0,51 |

Strategien mit sehr schweren Rändern (Hi-Lo ohne Stopp, Schwarz bis Raum 8) bekommen in der Simulation eine Obergrenze. Sonst dominieren einzelne Treffer mit 10⁴ × die Varianz. Der Beweis gilt trotzdem für jede Stopp-Regel.

### 2.3 Fairness im Betrieb

**Live-Spiele (Wheel, Scrap Press)**
- Die Rundenseeds stammen aus einer veröffentlichten Hash-Kette.
- Der Client-Seed ist eine Beacon-Runde, die erst nach der Veröffentlichung feststeht.
- Das Wheel-Feld wird erst nach Wettschluss gesendet, der Seed nach der Runde.

**Kettenwechsel**
- Ein Admin kann eine neue Kette veröffentlichen. Eine aufgebrauchte Kette wird automatisch ersetzt.
- Die laufende Runde endet auf der alten Kette, die nächste beginnt bei Index 0 der neuen.
- Der Tip einer stillgelegten Kette wird erst veröffentlicht, wenn ihre letzte Runde vorbei ist. Sonst ließe sich die laufende Runde aus ihm berechnen.

**Jackpot und PvP**
- Der Topf-Seed ist ab Öffnung als Hash sichtbar.
- Beim Schließen wird die Beacon-Runde *aktuell + 2* festgelegt, damit weder Spieler noch Betreiber den Ausgang kennen.
- Bleibt ein Topf 10 Minuten ohne zweiten Spieler, wird er erstattet.

**Hidden State**
- Fallen (Monument Run), künftige Karten (Hi-Lo) und die Hole Card (Blackjack) verlassen den Server erst mit dem Rundenende.
- Nach einem Reload liefert `/games/open` nur den öffentlichen Zustand.

## 3. Backoffice-Erweiterungen

| Tab | Inhalt | API |
|---|---|---|
| Reports | Tagesbericht (UTC): Wetten, aktive Spieler, Anmeldungen, Einsatz, Auszahlung, GGR, Marge, Bonuskosten (alle Belohnungen inkl. Promo-Codes) und Korrekturbuchungen, NGR; Aufteilung pro Spiel; CSV-Export | `GET /admin/reports/daily?days=` |
| Bets | Wett-Explorer über alle Spiele (Filter: Spiel, Spieler, Mindestauszahlung, Mindest-Multiplikator) mit Summen; Detail mit **serverseitiger Nachprüfung** | `GET /admin/bets`, `GET /admin/bets/:game/:ref` |
| Games | Kill-Switch und **Limits pro Spiel** (Min-/Max-Einsatz, Max-Gewinn) | `PUT /admin/games/:game/limits` |
| Cases | **Case-Manager**: anlegen, neue Version veröffentlichen, live schalten, Reihenfolge; Live-Vorschau von Preis, RTP und Chancen; Versionshistorie | `GET /admin/cases`, `POST /admin/cases/preview`, `PUT /admin/cases/:id`, `PUT /admin/cases/:id/state` |
| Promo codes | Codes mit Betrag, Nutzungen, Mindestlevel, Ablauf, Notiz; pausieren | `GET/POST /admin/promos`, `PUT /admin/promos/:code` |
| Settings | Banner (Info/Warnung), **Wartungsmodus**, Anmeldungen an/aus, Chat-Slow-Mode, Oil Rain an/aus; Seed-Ketten von Scrap Press und Wheel mit Wechsel | `GET/PUT /admin/settings`, `GET /admin/chains`, `POST /admin/chains/:game/rotate` |
| Players (Detail) | zusätzlich **Saldo-Korrektur**, **Notizen**, **alle Sitzungen beenden** | `POST /admin/players/:id/{adjust,notes,logout}` |

Öffentliche Endpunkte dazu:
- `GET /site`: Banner, Wartung, Anmeldung offen.
- `GET /cases` und `GET /cases/:id/v/:version`: jede je veröffentlichte Version, zum Nachprüfen.
- `GET /chains/:game`: aktive und stillgelegte Ketten.
- `POST /promo/redeem`.
- `/config` liefert die Cases aus dem Case-Manager und die effektiven Limits pro Spiel.

### 3.1 Regeln, die das Backoffice durchsetzt

**Wartung**
- Pausiert jedes Spiel auf einmal, mit derselben Prüfung wie der Kill-Switch.
- Auszahlungen laufender Runden funktionieren weiter, damit kein Guthaben festhängt.
- Das Banner erscheint in jedem offenen Browser innerhalb einer Sekunde (Event-Bus `site` → SSE).

**Limits pro Spiel**
- Sie gelten an jedem Einstieg: Sofortspiele, Mines, Raid, Monument Run, Hi-Lo, Blackjack, Crash, Wheel, Jackpot, Coinflip, Battle.
- Sie können die globalen Limits nur **verschärfen**. Werte außerhalb des globalen Rahmens werden abgelehnt.

**Cases sind Daten, keine Code-Konstanten**
- Jede Änderung erzeugt eine neue, unveränderliche Version. Öffnungen und Battles speichern die Version, mit der sie gespielt wurden.
- Ein Battle, das auf Spieler wartet, bleibt bei seiner Version, auch wenn der Case inzwischen geändert wurde.
- Der Preis wird nie eingetippt, sondern ist immer ⌈EV ÷ (1 − 7 %)⌉. Ein Case über dem House Edge lässt sich damit nicht veröffentlichen.
- Neue Cases starten deaktiviert.
- Der RTP-Monitor rechnet jede Öffnung gegen ihre Version.

**Promo-Codes**
- Pro Spieler und Code nur eine Einlösung. Die letzte Nutzung wird mit einem bedingten Update vergeben, das ist race-sicher.
- Betrag höchstens 10 000 Scrap, Budget (Betrag × Nutzungen) höchstens 1 000 000 Scrap.
- Eingelöst werden kann nicht während einer Pause oder Selbstsperre und nicht unter dem Mindestlevel.
- Gegen Raten: 10 falsche Codes pro Stunde, danach Sperre für eine Stunde.
- Promo-Codes zählen als Bonus: in den Bonuskosten und im NGR der Crew-Codes.

**Saldo-Korrektur**
- Aus dem Konto `house:adjustments`, höchstens ±100 000 Scrap, mit Pflicht-Begründung, auditiert.
- Belastungen nie unter null.
- **Nie auf das eigene Konto.**

**Nachprüfung im Explorer**
- Jede abgerechnete Runde wird aus ihren Seeds neu gespielt. Geprüft werden:
  - Commitment (Hash bzw. Kettenglied)
  - Beacon-Wert
  - Ergebnis
  - Auszahlung
- Blackjack speichert dafür die Aktionsfolge: Deal + Aktionen reproduzieren die Hand exakt.
- Ein noch aktiver Server-Seed eines Spielers wird für die Prüfung verwendet, aber **nicht angezeigt**. Auch Admins sehen ihn erst nach der Rotation durch den Spieler.

**Audit:** Jede Aktion ist auditiert (`admin_settings`, `admin_game_limits`, `admin_case_version`, `admin_case_state`, `admin_promo_*`, `admin_adjust`, `admin_note`, `admin_logout`, `admin_chain_rotate`).

### 3.2 Datenbank

- Neue Tabellen: `settings`, `cases`, `case_versions`, `promo_codes`, `promo_redemptions`, `player_notes`.
- `game_flags` bekommt `min_stake`, `max_stake`, `max_win`.
- Die View `wagers` bekommt die Spalte `ref` für den Explorer.
- Postgres-Migration v4 legt alles an und übernimmt die vier eingebauten Cases als Version 1.
- Der Cluster-Smoke-Test hat die Migration auf der bestehenden Datenbank ausgeführt.

### 3.3 Tests

- **Engine:** 75 Tests.
- **Server:** 59 Tests, auf SQLite und Postgres. Davon 8 für dieses Backoffice:
  - Einstellungen und Wartung
  - Limits
  - Case-Versionen inkl. Battle über eine Änderung hinweg
  - Promo-Codes inkl. Ratesperre
  - Spieler-Werkzeuge
  - Explorer über alle Spiele inkl. Manipulationserkennung
  - Kettenwechsel
  - API-Rechte
- **Browser:** alle sechs Modi gespielt, alle Backoffice-Tabs bedient, keine Konsolenfehler. Kein horizontales Scrollen bei 390 px und 820 px.

## 4. Vor Echtgeld zusätzlich

- **Vier-Augen-Prinzip** für Saldo-Korrekturen über einer Schwelle, für Case-Versionen und für Promo-Budgets über einer Schwelle (zweiter Admin bestätigt).
- **Case-Werte aus dem Preis-Feed** (Steam-Markt bzw. Händler) statt Platzhalter, mit geplanter Neuberechnung; jede Neuberechnung wird eine neue Version.
- **Bonusbedingungen** (Umsatzanforderung) für Promo-Guthaben, sobald Guthaben auszahlbar ist; in der Lizenz-Jurisdiktion prüfen.
- **Blackjack** braucht in manchen Jurisdiktionen eine eigene Spielzulassung (Tischspiel); Jackpot als PvP-Pool ebenfalls prüfen ([05-go-live.md](05-go-live.md)).
- **Berichte** an das Format der Aufsicht anpassen (z. B. tägliche GGR-Meldung pro Spielkategorie).

## 5. Nachtrag Phase 13 – Kisten, Case Battle, Workbench

Stand: 20.10.2026. Code:
- `platform/engine/src/games/{cases,upgrader}.ts`
- `platform/server/src/{bets,pvp}.ts`
- `platform/web/src/views/{cases,battle,upgrader}.ts`

### 5.1 Workbench mit verschiebbarer Gewinnzone

- Der Wurf f ∈ [0, 1) ist ein Punkt auf einem Ring. Der Spieler legt die Gewinnzone selbst auf den Ring: Sie beginnt bei s = zone / 10 000 (zone ganzzahlig 0 … 9 999) und ist so lang wie die Chance, über 1 hinaus wird umgebrochen.
  - Gewinn ⇔ (f − s) mod 1 < Chance, mit Chance = Einsatz ÷ Ziel · 0,95.
- f ist auf dem Ring gleichverteilt. Deshalb deckt jede Lage der Zone denselben Anteil ab: P(Gewinn) = Chance für jedes s, RTP = 95 %.
  - Die Lage bestimmt nur, *wo* man gewinnt, nie *wie oft*.
  - `zone = 0` entspricht dem bisherigen „Wurf unter der Chance“, alte Wetten bleiben gültig.
- Die Zone wird in den Parametern der Wette gespeichert. Prüfer und Wett-Explorer rechnen mit ihr nach.
- **Oberfläche:**
  - Ring mit 100 Teilstrichen. Die Zone lässt sich ziehen, per Tipp versetzen oder mit den Pfeiltasten verschieben; dazu die Vorgaben Low, Middle, High und Random.
  - Die Nadel dreht fünf Runden und bleibt auf dem Wurf stehen.
  - Ziel ist wahlweise ein Multiplikator oder ein Skin aus den Kisten. Die Chance muss zwischen 1 und 80 % liegen.

### 5.2 Kisten

- **Sechs neue Kisten**, jetzt zehn insgesamt (31 bis 21 784 Scrap):
  - Scrap Box, Road Sign, Tech Trash, Locked Crate, Bradley Crate, Cargo Ship.
- Preise wie immer ⌈EV ÷ 0,93⌉. Kleine Kisten verlieren durch das Aufrunden etwas RTP; die Scrap Box liegt bei 91,5 %.
- Die Postgres-Migration v5 legt die neuen Kisten als Version 1 an.
- **1 bis 5 Kisten auf einmal** (`POST /bets/cases/multi`):
  - Jede Kiste ist eine eigene Wette mit eigener Nonce.
  - Alle laufen in einer Transaktion: Scheitert eine (Guthaben, Limit), wird keine geöffnet.
- **Oberfläche:**
  - Eine Walze pro Kiste, alle drehen gleichzeitig. Dazu ein Schnell-Modus und eine Summe gegen die Kosten.
  - Drops der Sitzung und Inhaltstabelle mit allen Chancen.

### 5.3 Case Battle

- **Neuer Modus 2v2** (4 Plätze, Plätze 1+2 gegen 3+4):
  - Das Team mit der höheren Gesamtsumme gewinnt, seine zwei Spieler teilen den Pool.
  - Bei Gleichstand der Teams wird durch vier geteilt.
  - Die Plätze bleiben symmetrisch, also erwartet jeder Platz den RTP der Kisten.
- **Battle-Raum:**
  - Eine Spalte pro Spieler mit senkrechter Walze; die Runden laufen nacheinander ab, mit laufender Summe, Drop-Liste und Teamfarben.
  - Sieger hervorgehoben, Wiederholung mit Schnell-Modus.
  - Wer den Raum offen hat, während der Beacon zieht, sieht die Runden live.
- **Erstellen:**
  - Kisten mit + und − wählen, bis zu 10 Runden.
  - Formate 1v1, 1v1v1, 1v1v1v1 und 2v2; Regeln Normal, Crazy, Terminal.

### 5.4 Monte-Carlo (je 10 000 000 Runden, alle 71 Läufe bestanden)

| Lauf | Theorie | Simuliert | z |
|---|---:|---:|---:|
| Workbench, Chance 1–80 %, Zone irgendwo auf dem Ring | 95,0000 % | 94,9095 % | −1,42 |
| Case Battle 2v2, Platz 1 / 2 / 3 / 4 | 92,9682 % | 92,9578 / 92,9754 / 92,9392 / 92,9486 % | −0,31 / 0,22 / −0,87 / −0,59 |
| Scrap Box (31 Scrap) | 91,5161 % | 91,5669 % | 0,44 |
| Cargo Ship (20 556 Scrap) | 92,9996 % | 92,9863 % | −0,36 |

Engine 83 Tests, Server 62 Tests auf SQLite und Postgres. Ein Server-Test für das gleichzeitige Öffnen hing anfangs vom Glück der ersten Kisten ab; er prüft das „alles oder nichts“ jetzt über ein Einsatzlimit, das nur Einsätze zählt und deshalb deterministisch ist.

## 6. Nachtrag Phase 14 – 20 Rust-Kisten und Bonus-Battle

Stand: 21.10.2026. Code:
- `platform/engine/src/games/cases.ts` (Kisten, `BONUS`, `playBattle(…, 'bonus')`)
- `platform/server/src/{db,pg,pvp,explorer,config}.ts`
- `platform/web/src/loot-art.ts`, `platform/web/src/views/{cases,battle,upgrader}.ts`

### 6.1 Zwanzig Kisten von 1 bis 1 500 $

- Alle Kisten tragen Namen von Rust-Lootcontainern und -Monumenten, die Items heißen wie Rust-Items und -Skins.
  - Sets (z. B. „Whiteout Set“, „Gold Collection“) sind Bündel echter Skins.
  - Die Item-Werte sind Platzhalter, bis der Skin-Preisfeed angeschlossen ist.
- Die Gewichte sind so gelöst, dass jeder Preis genau auf seiner Stufe liegt und der RTP 93,00 % beträgt (Barrel 92,99 %, weil 100 Scrap kaum Spielraum zum Runden lassen).
- 100 Scrap = 1 $ Spielgeld, also 100 bis 150 000 Scrap:

| Kiste | Preis | Top-Item | Kiste | Preis | Top-Item |
|---|---:|---|---|---:|---|
| Barrel | 1 $ | Alien Red (43×) | Locked Crate | 60 $ | Desert Raiders Set |
| Oil Barrel | 2 $ | AK-47 From Hell | Bradley Crate | 80 $ | Whiteout Set |
| Wooden Crate | 3,50 $ | No Mercy Jacket | Heli Crate | 100 $ | Tempered Set |
| Ration Box | 5 $ | Press Vest | Large Oil Rig | 150 $ | Glory Set |
| Food Box | 7,50 $ | Tempered AK47 | Cargo Ship | 200 $ | Glory Set |
| Tool Box | 10 $ | Frostbite Facemask | Underwater Lab | 300 $ | Punishment Set |
| Medical Crate | 15 $ | Whiteout Facemask | Launch Site | 450 $ | Raiders Collection |
| Military Crate | 20 $ | Glory AK47 | Large Present | 650 $ | Gold Collection |
| Supply Drop | 30 $ | Big Grin | Missile Silo | 1 000 $ | Gold Collection |
| Elite Crate | 45 $ | Punishment Mask | Gold Egg | 1 500 $ | Gold Collection (3,2×) |

- **Limits angehoben**, damit die teuren Kisten spielbar sind:
  - Max. Einsatz 200 000 Scrap (2 000 $), max. Gewinn 5 000 000 Scrap (50 000 $).
  - Ein Battle mit 4 Plätzen über zwei Gold Eggs passt unter den Max-Gewinn (Pool-Obergrenze = Top-Items × Plätze).
  - Demo-Startguthaben und Nachfüllung 250 000 Scrap.
  - Pro Spiel lassen sich die Limits im Backoffice weiter senken.
- **Bilder:** jede Kiste hat eine eigene Zeichnung im Blueprint-Stil (Fass, Ölfass, Werkzeugkasten, Fallschirm, Bradley, Ölplattform, Containerschiff, Rakete, Ei …).
  - Items bekommen ein Symbol nach Typ (Gewehr, SMG, Pistole, Maske, Helm, Tür, Sprengstoff, Medizin, Set …), eingefärbt nach Seltenheit.
  - Das Symbol wird aus dem Namen erkannt, neue Items brauchen also keine eigene Grafik.
  - Seit Phase 24 zeigen Items mit einem Eintrag auf dem Steam-Markt dessen Bild direkt vom Steam-CDN; die Zeichnung bleibt für alle anderen ([13-itembilder.md](13-itembilder.md)).
- **Bestehende Datenbanken:**
  - Kisten, deren aktuelle Version aus dem Seed stammt, bekommen die neue Itemliste als nächste Version. Alte Versionen bleiben prüfbar.
  - Versionen, die ein Operator veröffentlicht hat, werden nie überschrieben.
  - Die vier Kisten, die herausfallen (Scrap Box, Road Sign, Tech Trash, Vault), werden einmal deaktiviert. Ein Operator kann sie wieder einschalten.
  - Postgres: Migration v6. SQLite: einmaliger Schritt über `PRAGMA user_version`.

### 6.2 Bonus-Modus im Case Battle

Für 2 bis 4 Plätze. Zum normalen Öffnen kommen fünf Features:

| Feature | Regel |
|---|---|
| Power-Runden | Vor jeder Runde wird ein Punkte-Multiplikator gezogen: ×1 (50 %), ×2 (30 %), ×3 (15 %), ×5 (5 %). |
| Goldene Runde | Die letzte Runde zählt zusätzlich doppelt, also bis ×10. |
| Jackpot-Drop | Wer das Top-Item einer Kiste zieht, behält es, egal wer gewinnt. Es zählt trotzdem für die Punkte. |
| Finaler Spin | Der Rest des Pools geht an einen Platz, der auf einem Rad gezogen wird. Jedes Feld ist so breit wie der Anteil des Platzes an den Punkten. |
| Scrap Back | 10 % dieses Rests werden auf die Plätze verteilt, die das Rad nicht gewählt hat. |

**Warum der House Edge gleich bleibt:**
- Das Haus verdient im Battle nur Kistenpreis minus Drops. Kein Feature fügt Wert hinzu oder nimmt welchen weg:
  - Jackpot-Drops plus Rest ergeben genau den Pool.
  - Der Spin verteilt genau diesen Rest.
- Multiplikatoren und Spin behandeln jeden Platz gleich. Die Reihenfolge der Felder auf dem Rad ändert nichts, denn P(Platz gewinnt) = sein Anteil, egal wo sein Feld liegt.
- Die Plätze sind also austauschbar: E[Auszahlung je Platz] = E[Pool] ÷ Plätze = Σ EV(Kisten). Das ist derselbe RTP wie beim Öffnen der Kisten, 7 % House Edge.
- Der Unterdog hat damit eine echte Chance, und ein Jackpot-Drop zahlt sich immer aus.

**Prüfung:**
- Ein Engine-Test rechnet die Erwartung exakt durch Aufzählen aller Power-Felder und aller Tickets jedes Platzes aus (2, 3 und 4 Plätze). Jeder Platz bekommt auf 10⁻⁹ genau Σ EV.
- Ein zweiter Test prüft an 10 000 echten Battles, dass die Auszahlungen immer genau den Pool ergeben.

**Provably fair:**
- Reihenfolge der Floats: pro Runde zuerst ein Power-Float, dann ein Float pro Platz; am Ende ein Float für den Spin.
- Die anderen Modi ziehen weiter genau Plätze × Runden Floats, alte Battles verifizieren unverändert.
- Explorer und Prüfer-Seite rechnen Power, Jackpots, Punkte, Felder und Spin nach. Der Explorer prüft jetzt bei jedem Battle auch die Auszahlung pro Platz.
- Für Kisten, die sich seitdem geändert haben, nimmt der Prüfer den Inhalt der alten Version als JSON.

**Battle-Raum:**
- Power-Badge pro Runde mit kurzem Würfeln; die goldene Runde ist mit ★ markiert.
- Punkte und Gewinnchance je Platz als Balken, Jackpot-Drops golden hervorgehoben.
- Am Ende läuft das Rad als horizontale Walze, die Nadel bleibt auf dem Spin-Float stehen.

### 6.3 Monte-Carlo (je 10 000 000 Runden, alle 90 Läufe bestanden)

| Lauf | Theorie | Simuliert | z |
|---|---:|---:|---:|
| Barrel (100 Scrap) | 92,9921 % | 92,8844 % | −0,84 |
| Tool Box (1 000 Scrap) | 93,0000 % | 92,9740 % | −0,34 |
| Gold Egg (150 000 Scrap) | 92,9999 % | 92,9788 % | −0,93 |
| Bonus 1v1, Platz 1 / 2 | 92,9972 % | 93,0529 / 93,0464 % | 1,06 / 0,93 |
| Bonus 1v1v1, Platz 1 / 2 / 3 | 92,9972 % | 93,2026 / 93,0895 / 92,9159 % | 3,59 / 1,61 / −1,42 |
| Bonus 1v1v1v1, Platz 1 / 2 / 3 / 4 | 92,9972 % | 92,9661 / 92,9168 / 92,9131 / 93,0497 % | −0,51 / −1,32 / −1,38 / 0,86 |

- Der Lauf mit z = 3,59 liegt unter der Grenze von 4. Die Kisten haben schwere Ränder (Barrel bis 43×), da streut ein Lauf stärker.
- Die exakte Rechnung oben zeigt, dass kein Platz bevorzugt wird. Zusätzlich lief ein gepaarter Test (Auszahlung minus Mittel derselben Battles, Spin herausgerechnet) mit 8 Mio. Battles aus dem Zufall des Betriebssystems: alle |z| < 2.

Engine 101 Tests, Server 65 Tests auf SQLite und Postgres.
