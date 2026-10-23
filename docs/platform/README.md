# SCRAPLINE · Rust-Skin-Plattform (Demo)

| Phase | Dokument | Ergebnis |
|---|---|---|
| 1 | [01-wettbewerbsanalyse.md](01-wettbewerbsanalyse.md) | RustyPot, BanditCamp, RustyLoot, RustClash, RustEasy, RustMagic u. a.: Modi, Edges, Provably Fair, Economy, Style, Lücken |
| 2 | [02-konzept.md](02-konzept.md) · [mockups/konzepte.html](mockups/konzepte.html) | drei Richtungen, gewählt: **A · SCRAPLINE** (Industrial Rust) |
| 3 | [03-mathe-und-fairness.md](03-mathe-und-fairness.md) · [`platform/engine`](../../platform/engine) | Engine, RTP-Beweise, Monte-Carlo (40 × 10 Mio. Runden), Prüfer-Seite |
| 4 | [04-architektur.md](04-architektur.md) · [`platform/server`](../../platform/server) | Architektur, Demo-Backend (Ledger, Wetten, RG, Geo, Steam, KYC/AML-Hooks) |
| 5–7 | [`platform/web`](../../platform/web) | Web-App: alle Spiele, PvP, Crash live, Belohnungen, RG-Center |
| 8 | [05-go-live.md](05-go-live.md) | Lizenz, Recht, Checkliste und Budget für Echtgeld |
| 9 | [06-backoffice-und-chat.md](06-backoffice-und-chat.md) | Operator-Backoffice (KPIs, RTP-Monitor, Spieler, Kill-Switch, RG-Fälle, Audit) und Live-Chat mit Moderation und Oil Rain |
| 10 | [07-produktion.md](07-produktion.md) · [`deploy/`](../../deploy) | Postgres, mehrere API-Instanzen mit Leader, Live-Events per SSE, Operator-2FA, Docker, CI |
| 11 | [08-modi-und-admin.md](08-modi-und-admin.md) | Live-Analyse der Wettbewerber im Browser; sechs neue Modi (Bandit Wheel, Jackpot, Monument Run, Hi-Lo, Blackjack, Airdrop); komplettes Backoffice (Reports, Wett-Explorer mit Nachprüfung, Limits pro Spiel, Case-Manager mit Versionen, Promo-Codes, Wartungsmodus, Seed-Ketten, Spieler-Werkzeuge) |
| 12 | [02-konzept.md](02-konzept.md) (Richtung C) · [`platform/web`](../../platform/web) | Redesign der Oberfläche im Stil **C · BLUEPRINT (Clean Premium)**: Graphit, Blueprint-Blau, Messing, Archivo/IBM Plex, 8-px-Raster, Bemaßungslinien, Proof-Panel pro Runde; neue Navigation (Top-Bar, Spielleiste, Konto-Menü, Chat ein-/ausblendbar), Lobby mit technischen Zeichnungen aller 15 Spiele. Name SCRAPLINE und alle Spiellogik bleiben. |
| 13 | [08-modi-und-admin.md § 5](08-modi-und-admin.md#5-nachtrag-phase-13--kisten-case-battle-workbench) | Workbench mit frei verschiebbarer Gewinnzone und Dreh-Animation, 1–5 Kisten auf einmal und sechs neue Kisten, Case-Battle-Raum mit Walzen pro Spieler und 2v2-Teammodus |
| 14 | [08-modi-und-admin.md § 6](08-modi-und-admin.md#6-nachtrag-phase-14--20-rust-kisten-und-bonus-battle) | 20 Kisten mit Rust-Namen und eigenen Zeichnungen von 1 bis 1 500 $ (je 93 % RTP), Item-Symbole, Bonus-Modus im Case Battle (Power-Runden, goldene Runde, Jackpot-Drop, finaler Spin, Scrap Back) bei gleichem House Edge |
| 15 | [02-konzept.md](02-konzept.md) (Clean Neon) | Oberfläche clean und dynamisch mit leichten Neon-Akzenten: Glas-Topbar, Glow nur an Aktionen und Gewinnen, Ansichten gleiten herein, Spotlight über Karten, Guthaben zählt hoch, Live-Leiste in der Lobby |
| 16 | [09-lueckenanalyse.md](09-lueckenanalyse.md) | Lückenanalyse der Seitenlogik und alles Fehlende gebaut: komplette Historie über alle Spiele mit Detail und Prüfung im Browser, Prüfer in der App, Wallet mit Kontoauszug, Profil mit Statistik und Privatsphäre, Live-Wettfeed, Footer, AGB/Datenschutz/Hilfe, 404, Sitzungsende, Steam-Login |
| 17 | [09-lueckenanalyse.md § 5](09-lueckenanalyse.md#5-nachtrag-phase-17--handy-version-und-slot-walzen-im-case-battle) | Handy-Version im Aufbau von bandit.camp (Menü, CTA, Live-Wins, Slider, Spiele-Raster mit Filter, Free Frags), Gastmodus mit Anmelde-Sheet, Spieler online, Slot-Walzen im Case Battle (alle Plätze gleichzeitig) |
| 18 | [10-online-plan.md](10-online-plan.md) | Weg online: Namensvorschläge (Empfehlung OILRIG), Lückenliste, To-do für den Betreiber. Gebaut: Steam-Login mit Name/Avatar/Profil, Trade-URL, Live-Statistik pro Spieler per Datenbank-Trigger, Skin-Einzahlung über Steam-Trade-Bot (Sicherheitscode, genau eine Gutschrift), Auszahlungs-Warteschlange (Beta: von Hand), KYC im Backoffice, Bot-Dienst im Docker-Stack |
| 19 | [06-backoffice-und-chat.md § 6](06-backoffice-und-chat.md#6-nachtrag-phase-19-chat-regeln-wortfilter-meldungen) | Chat-Regeln mit Popup, Wortfilter gegen Beleidigungen und Hassrede (inkl. Tricks wie `n1gg3r`, eigene Wörter im Backoffice), Auto-Mute nach drei Treffern, Mindest-Level zum Schreiben, gesperrte Staff-Namen, Melde-Button und Moderator-Warteschlange |

```bash
cd platform/engine && npm install && npm test && npm run sim      # 101 Tests, Monte-Carlo (90 × 10 Mio. Runden)
cd platform/server && npm install && npm test && npm start        # 83 Tests, API auf :8787 (SQLite)
cd platform/server && npm run test:pg                           # dieselben Tests gegen Postgres
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up --build   # kompletter Stack auf :8080
docker compose -f deploy/docker-compose.yml --env-file deploy/.env --profile skins up --build   # dazu der Steam-Trade-Bot (nur mit Lizenz)
cd platform/web    && npm install && npm run dev                  # App auf :5174
```

Die Produktoberfläche (Web-App, Demo, API-Fehlertexte, Prüfer, Mockups) ist englisch; die Planungsdokumente hier bleiben deutsch.

Alles läuft im **Demo-Modus mit Spielgeld**. Echtgeld erst nach den Punkten in [05-go-live.md](05-go-live.md).
