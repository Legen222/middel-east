# SCRAPLINE Web-App (Demo)

Frontend im SCRAPLINE-Design (Richtung A aus Phase 2). Vite und TypeScript ohne UI-Framework, angebunden an die Demo-API
aus `../server`. **Nur Spielgeld.**

```bash
# Terminal 1: API
cd platform/server && npm install && npm start          # http://localhost:8787
# Terminal 2: Web
cd platform/web && npm install && npm run dev           # http://localhost:5174 (Proxy /api → 8787)
npm run build                                           # dist/
```

| Ansicht | Route | Inhalt |
|---|---|---|
| Werkstatt | `#/` | Lobby, Originals mit RTP, tatsächlicher RTP der letzten 30 Tage |
| Raid | `#/raid` | Signature-Modus, Sprengstoff pro Wand, Multiplikator-Vorschau |
| Kisten | `#/kisten` | Kistenauswahl, Walze (4,2 s Ease-out), vollständige Chancen-Tabelle |
| Kisten-Battle | `#/battle` | PvP 2–4 Plätze, Normal/Crazy/Terminal, Demo-Bots |
| Schrottpresse | `#/schrottpresse` | Live-Crash per SSE, Kurve auf Canvas, Auto- und manuelle Auszahlung, Prüfung der Kette im Browser |
| Münzwurf | `#/muenzwurf` | PvP, Countdown bis zur Beacon-Runde, Seed nach der Entscheidung |
| Minenfeld | `#/minenfeld` | 5×5, 1–24 Minen, Multiplikator-Leiter |
| Würfel | `#/wuerfel` | Chance per Slider, unter/über, Zählanimation |
| Schrottrutsche | `#/schrottrutsche` | 8/12/16 Reihen, 3 Risikostufen, RTP je Tabelle |
| Werkbank | `#/werkbank` | Ziel-Multiplikator, Chancen-Anzeige, Zeiger-Animation |
| Belohnungen | `#/belohnungen` | Level-Fortschritt, Rakeback, Schrottkiste, Ölregen, Crew-Code |
| Limits & Pausen | `#/limits` | Limits, Pause, Selbstausschluss, Reality-Check, Hilfe-Links |
| Provably Fair | `#/fair` | aktives Seed-Paar, Rotation, offengelegte Seeds |
| Verlauf | `#/verlauf` | letzte 100 Wetten mit Nonce und (nach Rotation) Server-Seed |

Immer sichtbar: Demo-Guthaben und die Session-Leiste mit Spielzeit und Netto-Ergebnis. Der Reality-Check öffnet
sich zu dem Zeitpunkt, den der Server vorgibt. Offene Minenfeld- und Raid-Runden werden nach einem Neuladen der Seite
fortgesetzt. `prefers-reduced-motion` schaltet alle Animationen ab. Auf dem Handy gibt es eine untere Navigation,
geprüft bei 390 px ohne horizontales Scrollen.

## Browser-Demo ohne Server

```bash
npm run build:demo      # → demo/scrapline-demo.html (eine Datei, ca. 1,4 MB)
```

Die Demo bündelt App, **den echten Server-Code** aus `platform/server` und SQLite (sql.js, asm.js-Build ohne
WebAssembly) in eine Seite. `fetch('/api/…')` beantwortet der Router aus `platform/server/src/router.ts` direkt
im Browser. Der Crash-Stream kommt aus dem `CrashService`, und der Datenbank-Stand wird alle 5 Sekunden in
`localStorage` gesichert. Oben auf der Seite setzt „Demo zurücksetzen“ alles zurück. Der Zufalls-Beacon ist der
lokale Demo-Beacon (nicht vertrauenslos), das zeigt die App auch so an.
