# SCRAPLINE Engine

Spielmathematik und Provably Fair für die SCRAPLINE-Originals. Keine Laufzeit-Abhängigkeiten, reines TypeScript,
läuft identisch auf dem Server (Node) und im Browser (Prüfer-Seite). **Nur Demo-Modus, kein Echtgeld.**

```bash
npm install
npm test              # 57 Tests: SHA-256 vs node:crypto, Testvektoren, exakte RTP-Beweise
npm run sim           # Monte-Carlo, 10 Mio. Runden pro Lauf → sim/RESULTS.md, sim/results.json
npm run sim -- 1000000 42   # Runden pro Lauf, Seed
npm run build:verify  # verify/verify.html: eigenständige Prüfer-Seite
```

| Pfad | Inhalt |
|---|---|
| `src/pf/sha256.ts` | SHA-256 und HMAC-SHA256 ohne Abhängigkeiten |
| `src/pf/stream.ts` | `FairStream`: HMAC(serverSeed, `client:nonce:runde`) → Floats in [0, 1) |
| `src/pf/seeds.ts` | Commit/Reveal, Hash-Kette für Crash |
| `src/games/*.ts` | Würfel, Schrottpresse, Minenfeld, Schrottrutsche, Raid, Werkbank, Münzwurf, Kisten, Kisten-Battle |
| `src/config.ts` | House Edge je Spiel, die einzige Quelle für RTP |
| `test/all.test.ts` | Tests |
| `sim/montecarlo.ts` | Monte-Carlo-Prüfung |
| `verify/` | öffentliche Prüfer-Seite |

Herleitungen, Beweise und Ergebnisse: [`docs/platform/03-mathe-und-fairness.md`](../../docs/platform/03-mathe-und-fairness.md).
