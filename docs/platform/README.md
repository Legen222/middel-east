# SCRAPLINE · Rust-Skin-Plattform (Demo)

| Phase | Dokument | Ergebnis |
|---|---|---|
| 1 | [01-wettbewerbsanalyse.md](01-wettbewerbsanalyse.md) | RustyPot, BanditCamp, RustyLoot, RustClash, RustEasy, RustMagic u. a.: Modi, Edges, Provably Fair, Economy, Style, Lücken |
| 2 | [02-konzept.md](02-konzept.md) · [mockups/konzepte.html](mockups/konzepte.html) | drei Richtungen, gewählt: **A · SCRAPLINE** (Industrial Rust) |
| 3 | [03-mathe-und-fairness.md](03-mathe-und-fairness.md) · [`platform/engine`](../../platform/engine) | Engine, RTP-Beweise, Monte-Carlo (40 × 10 Mio. Runden), Prüfer-Seite |
| 4 | [04-architektur.md](04-architektur.md) · [`platform/server`](../../platform/server) | Architektur, Demo-Backend (Ledger, Wetten, RG, Geo, Steam, KYC/AML-Hooks) |
| 5–7 | [`platform/web`](../../platform/web) | Web-App: alle Spiele, PvP, Crash live, Belohnungen, RG-Center |
| 8 | [05-go-live.md](05-go-live.md) | Lizenz, Recht, Checkliste und Budget für Echtgeld |

```bash
cd platform/engine && npm install && npm test && npm run sim      # 57 Tests, Monte-Carlo
cd platform/server && npm install && npm test && npm start        # 33 Tests, API auf :8787
cd platform/web    && npm install && npm run dev                  # App auf :5174
```

Alles läuft im **Demo-Modus mit Spielgeld**. Echtgeld erst nach den Punkten in [05-go-live.md](05-go-live.md).
