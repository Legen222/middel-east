# SCRAPLINE Demo-Backend

Wallet mit doppelter Buchführung, Wett-Service (Würfel, Plinko, Werkbank, Kisten, Minenfeld, Raid), PvP (Münzwurf,
Kisten-Battle), Crash-Runden (Schrottpresse, Live per Server-Sent Events), Provably-Fair-Seeds,
Responsible Gambling, Geo-Blocking, Steam-OpenID, KYC- und AML-Hooks und eine JSON-API. Keine Laufzeit-Abhängigkeiten
(`node:http`, `node:sqlite`). Nutzt die Engine aus `../engine`. **Nur Demo-Modus, kein Echtgeld.**

```bash
npm install
npm test        # 28 Tests inkl. Nachspielen aus offengelegtem Seed, PvP, Crash und End-to-End-API-Test
npm start       # PORT=8787, DB_PATH=data/scrapline-demo.sqlite, PUBLIC_URL, BEACON=drand, CRASH_CHAIN=100000
```

Beispiel:

```bash
TOKEN=$(curl -s -X POST localhost:8787/auth/demo -H 'content-type: application/json' \
  -d '{"displayName":"Rust Ratte","ageConfirmed":true}' | jq -r .token)
curl -s -X POST localhost:8787/bets/dice -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"stake":10,"params":{"chance":49.5,"direction":"under"}}'
```

Hinter einem Proxy ohne `CF-IPCountry`-Header gilt das Land als unbekannt. Im Demo-Modus ist das erlaubt, für Echtgeld nicht.

Architektur, Abläufe und Risiken: [`docs/platform/04-architektur.md`](../../docs/platform/04-architektur.md).
