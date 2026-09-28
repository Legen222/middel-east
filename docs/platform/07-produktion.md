# Phase 10 – Produktionsbetrieb (SCRAPLINE)

Stand: 28.09.2026. Ziel dieser Phase: Das Demo-Backend soll betriebsbereit werden, weiterhin **nur mit Spielgeld**.

Die Umsetzung umfasst:

- Postgres statt SQLite,
- mehrere API-Instanzen,
- Live-Events über alle Instanzen,
- Operator-Login mit 2FA,
- Container, CI und Health-Checks.

Echtgeld bleibt gesperrt. `DEMO=false` startet nur mit `LICENCE_ID`, und auch dann erst nach den Punkten in [05-go-live.md](05-go-live.md).

## 1. Architektur im Betrieb

```
Cloudflare (TLS, WAF, CF-IPCountry)
        │
   nginx (web)  ── statische App, Security-Header, /api → API, SSE ohne Puffer
        │
   API × n  ── zustandslos, jede Instanz bedient alle Routen und SSE-Clients
        │            genau eine Instanz ist Leader (Advisory-Lock) und treibt die Ticker:
        │            Crash-Runden, PvP-Abrechnung, Oil Rain, RG-Scan
   Postgres 16 ── Daten, Transaktionen (SERIALIZABLE), LISTEN/NOTIFY für Events
```

## 2. Datenbank

| Thema | Umsetzung |
|---|---|
| Schnittstelle | `DB` in `src/db.ts`: `prepare().get/all/run`, `exec`, `transaction`, `afterCommit`. Alles asynchron. |
| Adapter | SQLite (Tests, Einzelknoten, Browser-Demo über sql.js) und Postgres (`src/pg.ts`, Paket `pg`). |
| SQL | Ein gemeinsamer Dialekt: `?`-Platzhalter, `ON CONFLICT`, `RETURNING`, `CASE`. Der Postgres-Adapter übersetzt `?` in `$n`. |
| Schema | Eine Quelle (`SCHEMA` in `db.ts`). Postgres leitet daraus ab: `INTEGER` → `BIGINT`, `AUTOINCREMENT` → Identity, `REAL` → `DOUBLE PRECISION`. |
| Migrationen | Tabelle `schema_migrations`. Migrator mit Advisory-Lock, damit bei parallelem Start nur eine Instanz migriert. v1 = Basisschema, v2 = MFA-Zustand in der DB. |
| Transaktionen | SQLite: eine Verbindung mit Sperre, Anfragen außerhalb warten (wie `BEGIN IMMEDIATE`). Postgres: `SERIALIZABLE`, bis zu 8 Wiederholungen bei 40001/40P01 mit Jitter. Der Code behält damit die Semantik „eine Transaktion nach der anderen“. |
| Hot Rows | Hauskonten (Bankroll, Escrow, Promo, Faucet) werden nicht mehr gecacht, sondern aus dem Ledger summiert. Ein gecachtes Bankroll-Konto würde bei jeder Wette geschrieben und alle Transaktionen gegeneinander abbrechen lassen. Spielerkonten bleiben gecacht (`balances`), die Integritätsprüfung vergleicht sie mit dem Ledger. |
| Garantien im Schema | Eindeutige Indizes für eine offene Minen- oder Raid-Runde pro Spieler, eine Crash-Wette pro Runde und Spieler, einen offenen RG-Fall pro Grund. |
| Typen | `BIGINT` und `NUMERIC` kommen als JS-Zahlen zurück (Beträge in Milli-Frags, weit unter 2^53). |

**Absicherung**

- Alle 44 Server-Tests laufen gegen SQLite und gegen Postgres (`TEST_PG_URL`, jeder Test in einem eigenen Schema).
- Ein Nebenläufigkeitstest belegt unter echter Parallelität:
  - 40 parallele Wetten bekommen 40 verschiedene Nonces.
  - Von 10 parallelen Minen-Starts gelingt genau einer.
  - Von 8 parallelen Einsätzen über 60 % des Guthabens geht nur einer durch.
  - Von 5 parallelen Rakeback-Claims wird genau einer ausgezahlt.
  - Das Ledger bleibt bei Σ = 0.
- `tools/check-floating.mjs` bricht den Build ab, wenn ein Promise nicht abgewartet wird. Ein vergessenes `await` in einer Transaktion würde sonst schreiben, nachdem die Transaktion schon committet ist.

## 3. Live-Events

- **Bus** (`src/events.ts`): lokal in einem Prozess, mit Postgres über `LISTEN/NOTIFY` auf dem Kanal `scrapline_events`.
- **Zustellung:** Dienste veröffentlichen erst nach dem Commit (`db.afterCommit`). Ein Event kündigt also nie etwas an, das zurückgerollt wurde.
- **SSE** `GET /events`:
  - Crash-Ereignisse (`betting`, `running`, `crashed`, `bet`, `cashout`),
  - Chat-Ereignisse (`chat`: neue oder gelöschte Nachricht, Oil Rain).

  Der Browser verbindet sich selbst neu. `/crash/stream` bleibt als reiner Crash-Stream erhalten.
- **Chat:** Der Client lädt bei einem Event nach. Ein Abruf alle 15 s dient nur als Rückfall, statt wie bisher alle 2,5 s.
- **Warum SSE statt WebSocket:** Server → Client reicht, weil Aktionen weiter über normale HTTP-Aufrufe laufen. SSE geht ohne Zusatzpaket durch jeden Proxy (nginx: `proxy_buffering off`).

## 4. Mehrere Instanzen

- **Leader:** `PgLeader` hält `pg_try_advisory_lock` auf einer eigenen Verbindung und versucht es alle 5 s neu. Fällt der Leader aus, gibt Postgres die Sperre frei, und eine andere Instanz übernimmt.
- **Ticker nur auf dem Leader:** Crash-Zustandsmaschine, PvP-Abrechnung, Oil Rain und der RG-Scan (jede Minute).
- **Wetten auf jeder Instanz:** Wetten und Crash-Einsätze laufen auf jeder Instanz. Die Hash-Kette, die Runden und die Beacon-Werte stehen in der Datenbank.
- **Beacon:** Mit mehreren Instanzen `BEACON=drand` verwenden. Der lokale Demo-Beacon ist nicht vertrauenslos. Er liefert trotzdem konsistente Ergebnisse, weil nur der Leader ihn abfragt und die Werte speichert.
- **Test** `tools/cluster-smoke.mjs`: zwei Instanzen, eine Datenbank. Geprüft wird:
  - Es gibt genau einen Leader.
  - Ein Chat-Event von A kommt per SSE bei B an.
  - Crash-Runden des Leaders erreichen B.
  - Ein Einsatz auf B ist auf A sichtbar.
  - 2FA-Einrichtung auf A lässt sich auf B bestätigen, und derselbe Code wird auf A als Wiederholung abgelehnt.
  - Beide Prozesse beenden sich auf SIGTERM mit Code 0.

## 5. Operator-Zugang

| Maßnahme | Umsetzung |
|---|---|
| 2FA | TOTP nach RFC 6238 (SHA-1, 30 s, 6 Stellen), geprüft gegen die RFC-Testvektoren. Einrichtung: `POST /mfa/enroll` → Schlüssel und `otpauth://`-URI, dann `POST /mfa/confirm` mit dem ersten Code. |
| Step-up | `POST /mfa/verify` pro Sitzung. `/admin/*` und `/mod/*` verlangen eine Bestätigung, die jünger als 12 h ist (`REQUIRE_OPERATOR_MFA`, außerhalb der Demo immer an). Ein Code gilt je Sitzung nur einmal (Replay-Schutz über `sessions.mfa_step`). Der Zustand liegt in der Datenbank und gilt damit auf allen Instanzen. |
| IP-Allowlist | `OPERATOR_IP_ALLOWLIST` mit IPs oder IPv4-CIDRs. Leer = keine Einschränkung. Hinter nginx mit `TRUST_PROXY=true` (X-Forwarded-For). |
| Audit | `mfa_enroll_started`, `mfa_enrolled`, `mfa_verified`, `mfa_failed` sowie alle `admin_*`- und `mod_*`-Aktionen. |
| Web | Das Backoffice zeigt vor den Tabs Einrichtung bzw. Code-Abfrage. Moderatoren schalten ihre Chat-Werkzeuge dort frei. |

**Noch offen für Echtgeld:**

- SSO (OIDC) für Mitarbeiter statt Spielerkonten mit Rolle,
- Vier-Augen-Freigabe für Holds, Rollen und Auszahlungen,
- getrennte Admin-Domain hinter VPN oder Zero-Trust-Proxy.

## 6. Betrieb

| Thema | Umsetzung |
|---|---|
| Konfiguration | Umgebungsvariablen (Kopf von `src/main.ts`): `DATABASE_URL`, `PG_POOL_MAX`, `DEMO`, `LICENCE_ID`, `REQUIRE_OPERATOR_MFA`, `OPERATOR_IP_ALLOWLIST`, `TRUST_PROXY`, `BEACON`, `PUBLIC_URL`, `PORT`, `LOG`. |
| Health | `GET /health` (lebt). `GET /ready` prüft die Datenbank und liefert Dialekt, Leader-Status, Beacon und Demo-Flag. Der Docker-HEALTHCHECK nutzt `/ready`. |
| Logs | Eine JSON-Zeile pro Anfrage (Zeit, Request-ID, Methode, Pfad, Status, Dauer, IP). Die Request-ID kommt von nginx (`X-Request-Id`) oder wird erzeugt und im Header zurückgegeben. Tickerfehler werden als `level: error` geloggt. |
| Shutdown | SIGTERM/SIGINT: Ticker stoppen, keine neuen Verbindungen, SSE-Streams schließen, laufende Anfragen abarbeiten, Leader-Sperre freigeben, Pool schließen. Nach spätestens 15 s wird hart beendet. |
| Rate-Limit | 20 Anfragen/s pro IP mit 40 Burst. Einträge untätiger IPs werden aufgeräumt. In Produktion zusätzlich an der Kante (Cloudflare). |
| Security-Header | nginx: CSP (nur eigene Skripte, Fonts von Google), HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`. Die API setzt `nosniff`, `no-referrer`, `DENY` und `CORP`. |
| Geo | `CF-IPCountry` kommt von der Kante. nginx setzt `XX`, wenn der Header fehlt; unbekanntes Land ist für Echtgeld gesperrt. |

## 7. Container und CI

| Datei | Zweck |
|---|---|
| `platform/server/Dockerfile` | Mehrstufig: `npm ci`, Typprüfung, Promise-Prüfung und Tests laufen schon beim Build. Laufzeit `node:22-slim` als Nutzer `node` mit HEALTHCHECK. |
| `platform/web/Dockerfile` | Vite-Build, danach `nginx:1.27-alpine` mit `nginx.conf` und `sse.inc`. |
| `deploy/docker-compose.yml` | Postgres 16, API mit 2 Replikaten, Web. `deploy/.env.example` zeigt die Variablen, `deploy/.env` ist in `.gitignore`. |
| `.github/workflows/ci.yml` | Engine (Typen, Tests, Monte-Carlo mit 200 000 Runden je Konfiguration), Server (Prüfungen, Tests auf SQLite und Postgres, Cluster-Test), Web (Typen, Build, Demo), Images. |

**Lokal geprüft (28.09.2026):**

- Beide Images bauen; im API-Build laufen die 44 Tests.
- Der Compose-Stack startet mit Postgres, zwei API-Instanzen und nginx; alle Healthchecks sind grün.
- Browser-Test gegen `localhost:8080` über nginx:
  - Anmeldung, Wette,
  - Chat über SSE,
  - Crash-Phasen,
  - Backoffice mit 2FA-Einrichtung (Code im Test berechnet), Overview und RTP-Monitor.
- Die Security-Header sind gesetzt.
- Die Monte-Carlo-Kurzversion läuft ohne Fehler.

```bash
cp deploy/.env.example deploy/.env   # POSTGRES_PASSWORD setzen
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up --build
# App: http://localhost:8080  ·  Backoffice: in der Demo „Become admin (demo)“, dann 2FA einrichten
```

## 8. Offene Punkte

- **Postgres:** Backups (Point-in-Time-Recovery), Replikat für Lesezugriffe (Admin, Statistik), Partitionierung von `ledger`, `bets` und `audit` nach Monat.
- **Monitoring:** Metriken (Prometheus), Traces, Alarme. Der RTP-Monitor-Alarm und die Ledger-Integrität sollen zusätzlich als Job mit Pager laufen, nicht nur im Dashboard.
- **Secrets:** über einen Secret-Manager statt `.env`; Rotation des Datenbankpassworts.
- **Last:** Lasttest (k6), Ziel: p95 unter 150 ms bei 500 Wetten/s. Messen, wie oft SERIALIZABLE-Transaktionen wiederholt werden müssen; bei Bedarf Sperren je Spieler (`pg_advisory_xact_lock`) statt SERIALIZABLE für Wett-Transaktionen.
- **Kryptografie des Fairness-Systems:** Ein externes RNG-Audit steht aus (siehe 05-go-live.md). Der Serverseed wird verschlüsselt gespeichert (KMS).
