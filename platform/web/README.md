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
| Minenfeld | `#/minenfeld` | 5×5, 1–24 Minen, Multiplikator-Leiter |
| Würfel | `#/wuerfel` | Chance per Slider, unter/über, Zählanimation |
| Schrottrutsche | `#/schrottrutsche` | 8/12/16 Reihen, 3 Risikostufen, RTP je Tabelle |
| Werkbank | `#/werkbank` | Ziel-Multiplikator, Chancen-Anzeige, Zeiger-Animation |
| Limits & Pausen | `#/limits` | Limits, Pause, Selbstausschluss, Reality-Check, Hilfe-Links |
| Provably Fair | `#/fair` | aktives Seed-Paar, Rotation, offengelegte Seeds |
| Verlauf | `#/verlauf` | letzte 100 Wetten mit Nonce und (nach Rotation) Server-Seed |

Immer sichtbar: Demo-Guthaben und die Session-Leiste mit Spielzeit und Netto-Ergebnis. Der Reality-Check öffnet
sich zu dem Zeitpunkt, den der Server vorgibt. Offene Minenfeld- und Raid-Runden werden nach einem Neuladen der Seite
fortgesetzt. `prefers-reduced-motion` schaltet alle Animationen ab. Auf dem Handy gibt es eine untere Navigation,
geprüft bei 390 px ohne horizontales Scrollen.
