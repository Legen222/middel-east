# SCRAPLINE Demo-Backend

Wallet mit doppelter Buchführung, Wett-Service (Dice, Scrap Chute, Workbench, Cases, Minefield, Raid), PvP (Coinflip,
Case Battle), Crash-Runden (Scrap Press, live per Server-Sent Events), Belohnungen (Level, Rakeback, Scrap Crate,
Oil Rain, Crew-Codes), Live-Chat mit Moderation, Operator-Backoffice (RTP-Monitor, Kill-Switch, Holds, RG-Fälle, Audit), Provably-Fair-Seeds,
Responsible Gambling, Geo-Blocking, Steam-OpenID, KYC- und AML-Hooks, Operator-2FA (TOTP) und eine JSON-API mit
Live-Events per SSE (`/events`). Speicher: SQLite (`node:sqlite`, Tests und Einzelknoten) oder Postgres (`DATABASE_URL`,
mehrere Instanzen mit Leader-Wahl und LISTEN/NOTIFY). Nutzt die Engine aus `../engine`. **Nur Spielgeld.**

```bash
npm install
npm run check   # Typprüfung + Prüfung auf nicht abgewartete Promises
npm test        # 44 Tests (SQLite) inkl. Nachspielen aus offengelegtem Seed, PvP, Crash, Nebenläufigkeit, API
npm run test:pg # dieselben Tests gegen Postgres (TEST_PG_URL, Standard postgres://scrapline@127.0.0.1:5432/scrapline_test)
npm start       # baut dist/main.mjs und startet: PORT=8787, DB_PATH oder DATABASE_URL, weitere Variablen in src/main.ts
DATABASE_URL=postgres://… node tools/cluster-smoke.mjs   # zwei Instanzen, eine Datenbank (nach npm run build)
```

Beispiel:

```bash
TOKEN=$(curl -s -X POST localhost:8787/auth/demo -H 'content-type: application/json' \
  -d '{"displayName":"Rust Rat","ageConfirmed":true}' | jq -r .token)
curl -s -X POST localhost:8787/bets/dice -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"stake":10,"params":{"chance":49.5,"direction":"under"}}'
```

Hinter einem Proxy ohne `CF-IPCountry`-Header gilt das Land als unbekannt. Im Demo-Modus ist das erlaubt, für Echtgeld nicht.

API-Fehlertexte sind englisch, die Codes (`error`) bleiben stabil für das Frontend.

Architektur, Abläufe und Risiken: [`docs/platform/04-architektur.md`](../../docs/platform/04-architektur.md).
Backoffice und Chat: [`docs/platform/06-backoffice-und-chat.md`](../../docs/platform/06-backoffice-und-chat.md).
Produktionsbetrieb (Postgres, Cluster, Docker, CI): [`docs/platform/07-produktion.md`](../../docs/platform/07-produktion.md).
