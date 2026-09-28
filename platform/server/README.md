# SCRAPLINE Demo-Backend

Wallet mit doppelter Buchführung, Wett-Service (Dice, Scrap Chute, Workbench, Cases, Minefield, Raid), PvP (Coinflip,
Case Battle), Crash-Runden (Scrap Press, live per Server-Sent Events), Belohnungen (Level, Rakeback, Scrap Crate,
Oil Rain, Crew-Codes), Live-Chat mit Moderation, Operator-Backoffice (RTP-Monitor, Kill-Switch, Holds, RG-Fälle, Audit), Provably-Fair-Seeds,
Responsible Gambling, Geo-Blocking, Steam-OpenID, KYC- und AML-Hooks und eine JSON-API. Keine Laufzeit-Abhängigkeiten
(`node:http`, `node:sqlite`). Nutzt die Engine aus `../engine`. **Nur Demo-Modus, kein Echtgeld.**

```bash
npm install
npm test        # 40 Tests inkl. Nachspielen aus offengelegtem Seed, PvP, Crash und End-to-End-API-Test
npm start       # PORT=8787, DB_PATH=data/scrapline-demo.sqlite, PUBLIC_URL, BEACON=drand, CRASH_CHAIN=100000
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
