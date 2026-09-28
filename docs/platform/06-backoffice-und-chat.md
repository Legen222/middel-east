# Phase 9 – Backoffice & Live-Chat (SCRAPLINE)

Stand: 28.09.2026. Code: `platform/server/src/{admin,chat,flags}.ts`, `platform/web/src/{chatpanel.ts,views/admin.ts}`.
Die Oberfläche ist englisch, dieses Dokument bleibt deutsch.

## 1. Rollen

| Rolle | Darf |
|---|---|
| `player` | spielen, chatten |
| `moderator` | zusätzlich Chat-Nachrichten löschen, Spieler stummschalten und wieder freigeben |
| `admin` | zusätzlich das komplette Backoffice: KPIs, RTP-Monitor, Spielerkonten, Kill-Switch, RG-Fälle, Audit-Log, Rollen vergeben |

- Die Rolle steht in `users.role` (additive Migration, Standard `player`).
- Jede Backoffice- und Moderationsaktion schreibt einen Audit-Eintrag mit der ID des Operators (`admin_*`, `mod_*`).
- **Demo:** `POST /demo/role` gibt dem eigenen Konto eine Rolle, damit man sich das Backoffice ansehen kann. Außerhalb des Demo-Modus antwortet der Endpunkt mit 403. In Produktion vergibt nur ein Admin Rollen (`PUT /admin/players/:id/role`); der erste Admin wird per Datenbank-Migration angelegt.
- Für Echtgeld zusätzlich nötig (siehe [05-go-live.md](05-go-live.md)): Operator-Login getrennt vom Spieler-Login mit 2FA/SSO, IP-Allowlist für `/admin/*` und Vier-Augen-Prinzip für Holds und Rollenwechsel.

## 2. Backoffice (`#/admin`)

| Tab | Inhalt | Quelle |
|---|---|---|
| Overview | Spieler (gesamt, neu, aktiv 24 h), Wetten, Einsatz, GGR, Bonuskosten, NGR der letzten 24 h; Health-Checks; Hauskonten und Spieler-Float | `GET /admin/overview` |
| RTP monitor | pro Spiel: Wetten, Einsatz, Auszahlung, RTP, Theorie, z-Wert, Status; Fenster 1/7/30/90 Tage | `GET /admin/rtp?days=` |
| Players | Suche nach Name oder ID; Detail mit Netto 24 h/30 d/gesamt, Limits, letzten Wetten, Ledger, Boni, RG-Fällen, Audit; Aktionen Hold, Hold aufheben, Stummschaltung aufheben, Rolle | `GET /admin/players`, `GET /admin/players/:id` |
| Games | Kill-Switch pro Spiel mit Pflicht-Begründung | `GET/PUT /admin/games` |
| RG cases | automatisch eröffnete Fälle, Status open → contacted → closed (mit Notiz) | `GET/PUT /admin/rg-cases` |
| Audit log | alle Audit-Einträge, filterbar nach Admin, Moderation, RG, Sign-ups | `GET /admin/audit` |

### 2.1 Health-Checks

- **Ledger:** Σ aller Buchungen = 0 und jeder gecachte Kontostand stimmt mit dem Ledger überein (`ledgerIntegrity`).
- **Bilanz:** Bankroll + Escrow + Promo + Faucet + Spieler-Float = 0. Der Demo-Faucet ist absichtlich negativ, weil er das Spielgeld schöpft.
- **RTP-Monitor:** kein Spiel mit |z| > 3 im 30-Tage-Fenster.
- **Spiele:** pausierte Spiele werden gelistet.
- **RG-Fälle** und **Chat** (Nachrichten 24 h, aktive Stummschaltungen).

### 2.2 RTP-Monitor

Pro abgerechneter Wette gilt x = Auszahlung ÷ Einsatz und θ = theoretischer RTP genau dieser Wette. θ kommt aus:

- der Plinko-Tabelle (Reihen, Risiko),
- der Kiste (`caseRtp`),
- dem Case-Set eines Battles (nach Preis gewichtet),
- sonst aus der Edge des Spiels.

Mit Δ = Σ(x − θ) gilt:

```
z = Δ / √( Σ(x − θ)² − Δ² / n )
```

| Status | Bedingung |
|---|---|
| `alarm` | \|z\| > 4 und n ≥ 1000 |
| `watch` | \|z\| > 3 |
| `low sample` | n < 1000 |

Ehrliche Varianz hält z nahe 0. Ein Fehler in einer Auszahlungstabelle verschiebt den Mittelwert, und z wächst mit √n über jede Grenze. Der Test `RTP monitor: honest play is ok, a paytable bug raises an alarm` simuliert genau das: 2000 Würfelwetten, dann +30 % Auszahlung → `alarm`.

Bei Spielen mit schweren Rändern (Minenfeld mit vielen Minen, Raid mit Satchels) ist die Varianzschätzung bei kleinem n unzuverlässig. Deshalb wird ein Alarm erst ab 1000 Wetten ausgelöst. In Produktion läuft der Monitor als Job und alarmiert per Pager, statt nur im Dashboard zu erscheinen.

### 2.3 Kill-Switch

- Ein pausiertes Spiel lehnt neue Runden ab, ebenso weitere Schritte in offenen Runden (Minenfeld aufdecken, Raid sprengen). Fehler: `game_disabled`, HTTP 503.
- Auszahlen und Abrechnen laufender Runden funktionieren weiter, auch bei Crash-Runden und bereits gesperrten PvP-Spielen. Kein Guthaben wird eingefroren.
- Die Lobby markiert pausierte Spiele (`GET /games/status`).
- Pausieren braucht eine Begründung. Jede Änderung wird auditiert.

### 2.4 Holds

- Ein Hold (`rg_blocks.kind = 'operator'`) sperrt Wetten (`account_hold`). Lesen und Auszahlen offener Runden bleiben möglich.
- Operatoren können nur ihre eigenen Holds aufheben. **Pausen und Selbstausschlüsse des Spielers kann niemand verkürzen**, auch kein Admin. Das ist per Test abgesichert.

### 2.5 RG-Fälle

`rgScan` läuft jede Minute (Server-Ticker und Browser-Demo) sowie bei jedem Aufruf der Liste. Je Spieler und Grund gibt es höchstens einen offenen Fall (partieller Unique-Index).

| Auslöser | Standard (`cfg.rgAlert`) |
|---|---|
| Netto-Verlust in 24 h (offene Einsätze zählen als verloren) | > 50 000 Frags (500 $) |
| Limit erhöht oder entfernt | ≥ 3× in 30 Tagen |
| Sitzung mit Wette in den letzten 15 min | > 3 h |

Ablauf: **open → contacted** (RG-Nachricht mit Limit-Werkzeugen gesendet) **→ closed**. Schließen erfordert eine Notiz. Für Echtgeld kommen die Vorgaben der jeweiligen Lizenz hinzu, etwa Interaktionspflichten der UKGC oder der MGA.

## 3. Live-Chat

- **Anzeige:** rechte Spalte ab 1280 px Breite, sonst `#/chat` (Bottom-Nav „Chat“).
- **Abruf:** Polling alle 2,5 s über `GET /chat` (letzte 50 Nachrichten, Oil-Rain-Status, eigene Stummschaltung). Das funktioniert identisch über `node:http` und in der Browser-Demo.
- **Regeln** (serverseitig):
  - 1–200 Zeichen,
  - keine Links (URL, `www.`, `discord.gg`, gängige TLDs),
  - höchstens eine Nachricht alle 3 s,
  - keine Nachrichten bei Stummschaltung oder während einer Pause (Lesen bleibt möglich).
- **Moderation:** Löschen (`DELETE /mod/chat/:id`, der Text bleibt im Audit erhalten), Stummschalten für 10 min, 1 h, 24 h oder bis zur Aufhebung, jeweils mit Begründung (`POST /mod/mute`). Aufheben über `DELETE /mod/mute/:userId`.
- **Systemnachrichten:** nur echte Ereignisse, keine Fake-Aktivität.
  - Oil Rain öffnet (Topf, Level-Voraussetzung).
  - Oil Rain ausgezahlt (Betrag je Spieler, Anzahl).
  - Großgewinn ab 10× und 100 Frags (`BIG_WIN` in `bets.ts`).
- **Oil-Rain-Box** im Chat: Topf, Countdown und Teilnahme-Button. Die Regeln aus Phase 5 gelten weiter: Level 5+, 100 Frags Einsatz in 24 h, nicht während einer Pause.

Für Produktion vorgesehen:

- WebSocket bzw. SSE statt Polling;
- Wortfilter pro Sprache;
- Meldefunktion für Spieler;
- Slow-Mode bei Last;
- keine Tipps/Transfers zwischen Spielern (AML).

## 4. API-Übersicht (neu)

| Methode | Pfad | Rolle |
|---|---|---|
| GET | `/games/status` | öffentlich |
| GET | `/chat` | öffentlich (mit Token: eigene Nachrichten markiert) |
| POST | `/chat` | Spieler |
| DELETE | `/mod/chat/:id` | Moderator, Admin |
| POST / DELETE | `/mod/mute`, `/mod/mute/:userId` | Moderator, Admin |
| GET | `/admin/overview`, `/admin/rtp`, `/admin/players`, `/admin/players/:id`, `/admin/games`, `/admin/rg-cases`, `/admin/audit` | Admin |
| POST / DELETE | `/admin/players/:id/hold` | Admin |
| PUT | `/admin/players/:id/role`, `/admin/games/:game`, `/admin/rg-cases/:id` | Admin |
| POST | `/demo/role` | nur Demo |

## 5. Tests

Neue Server-Tests (insgesamt 40):

- Kill-Switch: neue Runden und nächste Schritte gesperrt, Auszahlung möglich, Audit.
- Chat-Regeln: Länge, Links, Takt, Stummschaltung, Pause, Löschen.
- Systemnachrichten.
- RTP-Monitor: ehrlich vs. fehlerhafte Tabelle.
- Holds und die Unantastbarkeit von Pause und Selbstausschluss.
- RG-Fälle.
- Rollen-Gates über die API.
- Kein Selbst-Upgrade außerhalb der Demo.
