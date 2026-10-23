# 10 · Weg online: Name, Lücken, To-do (Phase 18)

Stand: 21.10.2026.

**Neu gebaut in Phase 18:**
- Steam-Login übernimmt Name, Avatar und Profil-Link des Spielers.
- Live-Statistik pro Spieler in der Datenbank.
- Skin-Einzahlung über einen Steam-Trade-Bot.
- Auszahlung per Warteschlange, in der Beta von Hand verschickt.
- Identitätsprüfung im Backoffice.
- Deploy-Konfiguration für den Bot.

Was noch fehlt und was du selbst erledigen musst, steht in § 3 und § 4.

---

## 1. Neuer Name

**Anforderungen an den Namen:**
- kurz und auf Englisch aussprechbar;
- eine `.gg`- oder `.com`-Domain muss möglich sein;
- Rust-Spieler sollen den Bezug sofort verstehen.

**Kein „Rust“ im Namen.** „Rust“ ist eine Marke von Facepunch. Viele Wettbewerber nutzen das Wort, aber es ist ein vermeidbares Risiko: Facepunch oder Valve könnten Abmahnungen schicken oder die Domain sperren lassen.

| Name | Domain-Idee | Warum |
|---|---|---|
| **OILRIG** ⭐ | oilrig.gg | Das Oil Rig ist in Rust *der* Ort für die beste Beute. Kurz, sofort verständlich, passt zum schon vorhandenen „Oil Rain“ im Chat. |
| FURNACE | furnace.gg | Im Ofen wird Schrott zu Wert eingeschmolzen, ein Bild für Kisten und Upgrades. Klingt wertig. |
| HAZMAT | hazmat.gg | Der Hazmat-Anzug ist das bekannteste Rust-Outfit. Stark als Logo und Maskottchen. |
| OUTPOST | outpost.gg | Der sichere Handelsort in Rust, ein Bild für Vertrauen und Fairness. Eher generisch. |
| RADTOWN | radtown.gg | Bekannte Monument-Ruine, rau und eigenständig. Für Nicht-Spieler weniger eingängig. |
| TIER3 | tier3.gg | Werkbank Stufe 3 steht für das Maximum. Spielt mit Levels und VIP-Stufen, ist aber schwer als Marke zu schützen. |

**Empfehlung: OILRIG.** Der Name ist am stärksten und lässt sich am besten als Marke nutzen. „Oil Rain“ und die Bohrinsel ergeben ein fertiges Bildmotiv.

**Vor der Entscheidung von dir prüfen:**
- ob die Domain frei ist;
- ob die Marke frei ist (EUIPO und USPTO, Klassen 9, 41 und 42).

Beides konnte ich aus dieser Umgebung nicht prüfen.

**Umbenennung:** Der Code heißt weiter SCRAPLINE, bis du dich entschieden hast. Dann benenne ich alles in einem Schritt um: Oberfläche, Logo-Text, Rechtstexte, Prüfer, Mails und Bot-Nachrichten. Die Bot-Nachricht kann schon jetzt per `SITE_NAME` umgestellt werden.

---

## 2. Was in Phase 18 gebaut wurde

### Steam-Login mit Profil

Beim Steam-Login fragt der Server mit dem Web-API-Key `ISteamUser/GetPlayerSummaries` ab und übernimmt drei Dinge:
- **Steam-Name als Anzeigename:** Steuerzeichen und `<>` werden entfernt, der Name hat 2–24 Zeichen.
- **Avatar:** nur von Steams Bild-CDN.
- **Profil-Link.**

Der Abgleich läuft bei jedem Steam-Login neu. Ändert der Spieler seinen Namen bei Steam, ändert er sich auch hier. Umbenennen auf der Seite ist für Steam-Konten gesperrt.

Antwortet die Steam-API nicht, klappt der Login trotzdem; der Name ist dann „Steam ####“.

Den Login schaltet `STEAM_LOGIN` an. Standard: an, sobald `STEAM_API_KEY` gesetzt ist oder der Echtgeld-Modus läuft.

**Trade-URL:** Der Spieler trägt sie im Profil ein. Der Server prüft dabei, dass die Partner-ID zur eigenen SteamID gehört. Skins können so nur an das Konto gehen, das sich angemeldet hat.

**Oberfläche:**
- Avatar oben rechts und im Menü.
- Profil mit Steam-Link und Trade-URL.
- Im Echtgeld-Modus nur „Sign in with Steam“.

### Live-Statistik in der Datenbank

- Neue Tabelle `player_stats` mit Einsatz, Auszahlung, Rundenzahl, Ein- und Auszahlungen, Belohnungen, Spielgeld, Korrekturen und letzter Aktivität.
- Ein **Trigger auf dem Ledger** aktualisiert sie bei jeder Buchung in derselben Transaktion, egal welches Spiel oder welcher Teil der Seite bucht.
- Das aktuelle Guthaben steht wie bisher in `balances`.
- Die Summen erklären das Guthaben exakt; ein Test prüft das.
- Bestehende Datenbanken werden einmalig aus dem Ledger nachgerechnet.
- Migration: Postgres v9, SQLite über `user_version`. Sie lief auf der Entwicklungsdatenbank, die Nachrechnung stimmte mit dem Ledger überein.
- Sichtbar unter `GET /me/stats` (Feld `totals`) und auf der Wallet-Seite.

„Serverseitig und live“ heißt in Produktion: Postgres auf dem Server, alle API-Instanzen schreiben dorthin. Nur die Demo-Datei im Browser speichert lokal, weil sie keinen Server hat.

### Skin-Einzahlung über den Bot

**Ablauf:**
1. Der Spieler wählt Items aus seinem Steam-Inventar.
2. Pro Item sieht er den Preis und warum ein Item nicht geht: nicht handelbar, kein Preis, zu billig, zu selten gehandelt.
3. Der Server legt eine Einzahlung mit Preis-Snapshot und **Sicherheitscode** an.
4. Der Bot prüft, ob das Konto des Spielers eine Handelssperre (Trade Hold) hätte.
5. Dann schickt er ein Angebot, das **nur fordert** und nichts gibt. Code und Einzahlungsnummer stehen in der Nachricht.
6. Der Spieler nimmt in Steam an.
7. Der Bot erkennt die Annahme und schreibt die Scrap gut.

**Absicherungen:**
- **Genau eine Gutschrift:** Der Statuswechsel und die Buchung stehen in derselben Transaktion.
- **Ablehnen, Gegenangebot oder Ablauf:** keine Gutschrift. Nach 10 Minuten bricht der Bot das Angebot ab.
- **Absturz nach dem Senden:** Der Bot findet das Angebot über die Nummer in der Nachricht wieder und schickt es nicht doppelt.
- **Schon vor dem Angebot:**
  - Einzahlungslimits und Sperren aus dem Spielerschutz;
  - eine offene Einzahlung pro Spieler;
  - AML-Markierung bei großen oder gehäuften Einzahlungen;
  - auf Wunsch KYC vor der ersten Einzahlung (`KYC_BEFORE_DEPOSIT`).

**Preise:**
- Quelle ist Skinport, alle 10 Minuten, oder eine eigene Quelle per `PRICE_FEED_URL`.
- Es gilt der niedrigere Wert aus Vorschlags- und Medianpreis, damit ein einzelnes dünnes Angebot den Preis nicht hochtreibt.
- Preise älter als 6 Stunden werden nicht verwendet.

**Bestand:**
- Erhaltene Items landen im Bestand des Bots.
- Ein Abgleich alle 5 Minuten nimmt neue Items auf und markiert verschwundene.

**Bot-Prozess (`bot-main.mjs`):**
- Login mit Passwort und Steam-Guard-Code aus dem `shared_secret`.
- Geheimnisse nur aus der Umgebung, nie im Code oder Log.
- Mit Postgres läuft nur eine Instanz; eine zweite wartet.
- Docker: `--profile skins`.

### Auszahlung (Beta: von Hand)

1. Der Spieler wählt Items aus dem Bestand. Der Betrag wird sofort abgebucht, die Items sind reserviert.
2. Vorher prüft die Seite:
   - verifizierte Identität;
   - Umsatz mindestens in Höhe der Einzahlungen seit der letzten Auszahlung (AML).

   Eine stornierte Auszahlung setzt diese Regel nicht zurück. Der Fehler dazu ist behoben.
3. Im **Backoffice → Skins** siehst du die Warteschlange: Spieler, Items, Betrag und einen Button, der die Trade-URL öffnet.
4. Du schickst das Angebot vom Bot-Konto in der Steam-App und trägst die Angebotsnummer ein: „Mark sent“.
5. „Cancel“ mit Begründung erstattet die Scrap und legt die Items zurück. Der Spieler kann selbst stornieren, solange nichts verschickt ist.

### Identitätsprüfung (Beta)

Backoffice → Players → „Identity check“ setzt KYC-Stufe 0, 1 oder 2. Pflicht ist eine Notiz, was geprüft wurde; sie geht ins Audit-Log. Das ersetzt einen KYC-Anbieter, bis einer angebunden ist.

### Tests und Prüfung im Browser

**Server: 79 Tests auf SQLite und Postgres, 7 davon neu.** Sie decken ab:
- Steam-Profil: Bereinigung, fremde Bild-Hosts abgelehnt, Name folgt Steam, Umbenennen gesperrt;
- Trade-URL nur für das eigene Konto;
- Trigger gegen eine Nachrechnung aus dem Ledger;
- die ganze Skin-Strecke mit einem Test-Bot:
  - Annahme genau einmal gutgeschrieben;
  - Ablehnung, Trade Hold und Zeitablauf;
  - Wiederanlauf nach Absturz;
  - AML-Sperre, Storno mit Erstattung, „gesendet“ durch den Operator;
  - Bestandsabgleich, veraltete Preise.

**Im Browser durchgespielt** mit einem lokalen Steam-Ersatz (Inventar, Preisliste, Test-Bot):
- Einzahlung mit Code und automatischer Gutschrift;
- AML-Sperre, danach Auszahlung;
- „Mark sent“ im Backoffice;
- Wallet-Summen.

Desktop und 390 px: keine Konsolenfehler, kein seitliches Scrollen.

**Nicht getestet** gegen das echte Steam: Login, Inventar, Angebote und Skinport. Diese Adressen sind aus dieser Umgebung gesperrt. Der erste echte Test läuft mit deinem Bot-Konto (§ 4).

---

## 3. Was noch fehlt, um online zu gehen

### Blocker: ohne das kein Echtgeld und keine echten Skins

| # | Punkt | Stand |
|---|---|---|
| 1 | **Glücksspiellizenz** (z. B. Curaçao, Anjouan; Vergleich in [05-go-live.md](05-go-live.md)) | Fehlt. Skins haben Geldwert, daher braucht auch die Skin-Beta eine Lizenz. Die API startet ohne `LICENCE_ID` nicht im Echtgeld-Modus. |
| 2 | **Firma als Lizenznehmer**, Bankkonto | Fehlt |
| 3 | **Rechtstexte für Echtgeld**: AGB, Datenschutz, Impressum, Richtlinie zum Spielerschutz, Bonusbedingungen | Die jetzigen Texte gelten für Spielgeld. Ein Anwalt muss sie für die Lizenz schreiben. |
| 4 | **Länder-Sperrliste passend zur Lizenz** | Technik fertig (`realMoneyBlocked`). Die Liste kommt mit der Lizenz. |
| 5 | **Risiko Valve und Steam** | Siehe Kasten unten |

> **Risiko Valve und Steam.** Valves Bedingungen verbieten, Steam-Konten und Trades für kommerzielles Glücksspiel zu nutzen. Seit 2016 hat Valve Bot-Konten von Skin-Glücksspielseiten gesperrt und Abmahnungen verschickt.
>
> Folgen einer Sperre:
> - Der Bestand des Bots wäre eingefroren.
> - Spieler könnten nicht mehr auszahlen.
>
> Schutz:
> - wenig Bestand auf einem Bot halten;
> - mehrere Bots;
> - regelmäßig an einen Marktplatz verkaufen.
>
> Langfristig robuster ist ein **P2P-Modell**: Spieler handeln direkt miteinander, die Seite hält nur das Guthaben (Muster in `rails.ts`). Eine andere Möglichkeit ist, Items über die API eines Marktplatzes wie Skinport oder Waxpeer zu kaufen und zu verkaufen.

### Technik vor dem Start

| # | Punkt | Stand |
|---|---|---|
| 6 | Server, Domain, TLS, Cloudflare (setzt `CF-IPCountry`) | Docker-Stack fertig. Fehlt: Server und Domain. |
| 7 | Postgres-Backups (täglich plus Point-in-Time-Recovery) und ein Test der Wiederherstellung | Beschrieben in [07-produktion.md](07-produktion.md). Einrichten auf dem Server. |
| 8 | Alarme: Bot offline, Preise veraltet, Fehler, Erreichbarkeit | Daten liegen in `/ready` und `bot_status`. Fehlt: ein Dienst, der alarmiert (z. B. UptimeRobot, Grafana). |
| 9 | **KYC-Anbieter** (Sumsub, Veriff, Onfido) | Schnittstelle vorbereitet. Beta: Prüfung von Hand im Backoffice. |
| 10 | **Inventar-Abfrage im großen Stil**: Steam drosselt Abfragen pro Server-IP | Gebaut mit 60 s Cache. Ab einigen hundert Spielern einen bezahlten Spiegel (z. B. steamapis) über `INVENTORY_URL` nutzen. |
| 11 | Automatische Auszahlung durch den Bot | Bewusst von Hand in der Beta. Später: Bot gibt Items, Bestätigung per `identity_secret`. |
| 12 | Krypto- und Kartenzahlung | Nicht gebaut, nur die Schnittstelle (`rails.ts`). Braucht einen Zahlungsanbieter mit Glücksspiel-Freigabe. |
| 13 | E-Mail und Support (Ticket-System oder Discord) | Fehlt |
| 14 | Lasttest, Sicherheitsprüfung (Pentest), Bug-Bounty | Fehlt. Vor dem Echtgeldstart einplanen. |
| 15 | Neuer Name im Code (§ 1) | Wartet auf deine Wahl |
| 16 | Öffentlicher Zufall `BEACON=drand` (braucht ausgehend `api.drand.sh`) | Fertig, auf dem Server einschalten |
| 17 | Deutsche Oberfläche | Optional |
| 18 | **Lücken in den Steam-Bibliotheken.** `npm audit` meldet 16 Lücken in Unterpaketen von `steam-user`, `steamcommunity` und `steam-tradeoffer-manager` (u. a. `request`, `protobufjs`, `form-data`, `adm-zip`). Die vorgeschlagenen „Fixes“ sind Downgrades auf ältere Versionen, also keine echte Lösung. | Eingrenzung: Die Pakete laufen nur im Bot-Prozess. Der hat keinen offenen Port und spricht nur mit Steam; die API lädt sie nie. Vor dem Start neu prüfen und auf neue Versionen der Bibliotheken achten. Im Lasttest oder Pentest bewerten lassen. |

---

## 4. Was du machen musst

**Wichtig:** Schick mir nie Passwörter, das maFile oder Secrets in den Chat. Die gehören nur in `deploy/.env` auf dem Server. Diese Datei wird nie committet.

1. **Namen wählen** (§ 1). Domain und Marke prüfen, Domain kaufen. Danach benenne ich alles um.
2. **Lizenz klären:**
   - einen Lizenz-Dienstleister oder Anwalt beauftragen;
   - eine Firma gründen.

   Ohne Lizenz bleibt die Seite eine Spielgeld-Demo, auch mit Bot. Der Server startet ohne `LICENCE_ID` nicht im Echtgeld-Modus.
3. **Server mieten:** Linux mit Docker, z. B. 4 vCPU und 8 GB RAM. Domain über Cloudflare laufen lassen. `PUBLIC_URL` auf die Adresse der Seite setzen, z. B. `https://oilrig.gg`, ohne `/api`.
4. **Steam-Web-API-Key holen** unter <https://steamcommunity.com/dev/apikey>. Als Domain deine Seite eintragen. Dein Steam-Konto braucht dafür mindestens 5 $ Umsatz. Den Key trägst du als `STEAM_API_KEY` ein.
5. **Bot-Konto vorbereiten:**
   - eigenes Steam-Konto, nicht dein Hauptkonto;
   - mindestens 5 $ ausgegeben, sonst ist es eingeschränkt und kann nicht handeln;
   - **Steam Guard Mobile Authenticator** seit mindestens 7 Tagen aktiv, sonst hält Steam jeden Trade zurück;
   - das **maFile** exportieren, z. B. mit Steam Desktop Authenticator. Darin stehen `shared_secret` (Pflicht) und `identity_secret` (optional);
   - Inventar und Profil öffentlich.

   Eintragen: `BOT_ACCOUNT_NAME`, `BOT_PASSWORD`, `BOT_SHARED_SECRET`, optional `BOT_IDENTITY_SECRET`.
6. **`.env` ausfüllen:**
   - Vorlage `deploy/.env.example` nach `deploy/.env` kopieren.
   - Setzen: `DEMO=false`, `LICENCE_ID`, `SKINS=true`, Raten, `SITE_NAME`.
   - Starten:

     ```bash
     docker compose -f deploy/docker-compose.yml --env-file deploy/.env --profile skins up -d --build
     ```
7. **Ersten Admin anlegen und absichern:**
   - mit Steam anmelden;
   - einmalig per SQL `role='admin'` setzen (deine SteamID64 steht im Profil):

     ```bash
     docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec db \
       psql -U scrapline -c "UPDATE users SET role = 'admin' WHERE steam_id = '7656119…'"
     ```
   - 2FA im Backoffice einrichten;
   - `OPERATOR_IP_ALLOWLIST` setzen.
8. **Probelauf mit kleinen Beträgen:**
   1. 1–2 billige Items einzahlen.
   2. Sicherheitscode in Steam vergleichen.
   3. Gutschrift prüfen.
   4. Eine Auszahlung von Hand senden und als „sent“ markieren.
9. **Täglicher Ablauf in der Beta:**
   - Backoffice → Skins: Warteschlange abarbeiten, Bot-Status und Preise im Blick behalten;
   - Players: Identitäten prüfen;
   - RG cases: Fälle zum Spielerschutz ansehen.
10. **KYC:** in der Beta von Hand (Ausweis, Selfie und Adresse ansehen, Stufe setzen, Notiz schreiben). Für mehr Spieler einen Anbieter wählen; ich binde ihn an.
11. **Rechtstexte** vom Anwalt: AGB, Datenschutz, Impressum, Spielerschutz. Ich baue sie ein.
12. **Support-Kanal** festlegen (E-Mail oder Discord), dazu Moderatoren für den Chat.
13. **Backups:** einmal eine Wiederherstellung auf einem zweiten Server testen.

---

## 5. Datenbank und API (Phase 18)

**Tabellen:**
- `item_prices`, `skin_deposits`, `skin_deposit_items`, `skin_items` (Bestand), `skin_withdrawals`, `bot_status`, `player_stats`.
- `users` bekommt `steam_name`, `avatar_url`, `profile_url` und `trade_url`.

**Migration:** Postgres v9, SQLite über `user_version`.

**Neue Routen:** siehe [04-architektur.md](04-architektur.md) § 7.

**Neue Umgebungsvariablen:** siehe `platform/server/src/env.ts`, `src/bot-main.ts` und `deploy/.env.example`.
