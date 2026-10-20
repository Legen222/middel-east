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

```bash
cd platform/engine && npm install && npm test && npm run sim      # 75 Tests, Monte-Carlo (60 × 10 Mio. Runden)
cd platform/server && npm install && npm test && npm start        # 59 Tests, API auf :8787 (SQLite)
cd platform/server && npm run test:pg                           # dieselben Tests gegen Postgres
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up --build   # kompletter Stack auf :8080
cd platform/web    && npm install && npm run dev                  # App auf :5174
```

Die Produktoberfläche (Web-App, Demo, API-Fehlertexte, Prüfer, Mockups) ist englisch; die Planungsdokumente hier bleiben deutsch.

Alles läuft im **Demo-Modus mit Spielgeld**. Echtgeld erst nach den Punkten in [05-go-live.md](05-go-live.md).
