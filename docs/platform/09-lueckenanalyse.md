# 09 · Lückenanalyse der Seitenlogik (Phase 16)

Stand: 21.10.2026.

**Methode:**
- Alle 104 Server-Routen gegen die Aufrufe im Frontend abgeglichen.
- Jede Ansicht im Browser durchgespielt, am Desktop und bei Handy-Breite.
- Geprüft, ob ein Spieler jeden Schritt selbst abschließen kann: spielen, nachprüfen, sein Geld nachvollziehen, sein Konto verwalten, Hilfe finden.

**Code:**
- Server: `platform/server/src/player.ts` (neu).
- Prüfer: `platform/engine/verify/core.ts` (neu).
- Web: `platform/web/src/views/{history,verify,wallet,profile,info}.ts`.

## 1. Gefundene Lücken und was jetzt gilt

| # | Lücke | Jetzt |
|---|---|---|
| 1 | **Historie unvollständig:** Sie las nur die Tabelle `bets`. Scrap Press, Bandit Wheel, Jackpot, Coinflip und Case Battle fehlten ganz. Sie zeigte höchstens 100 Einträge, ohne Filter und ohne Detail. | `GET /history` liest die Sicht `wagers` über alle 15 Spiele. Filter nach Spiel, „Mehr laden“ ohne Lücken (Cursor auf Zeit + Referenz, weil Multi-Open fünf Wetten in derselben Millisekunde anlegt). |
| 2 | **Keine Rundendetails für Spieler:** Nur das Backoffice konnte eine Runde nachrechnen lassen. | `GET /history/:game/:ref` liefert eigene Runden mit Seeds, Ergebnis und der Nachrechnung des Servers. Fremde Runden geben 404. Der Server-Seed erscheint erst nach der Rotation. |
| 3 | **Prüfer nicht erreichbar:** Die Fairness-Seite verwies auf eine Datei im Repository. | Neue Route `#/verify`: derselbe Engine-Code, im Browser des Spielers gerechnet. „Verify in browser“ im Rundendetail füllt Seeds und Spielparameter aus (Kisten- und Battle-Inhalte der benutzten Version inklusive). Die eigenständige Prüferseite nutzt denselben Kern und hat jetzt den Clean-Neon-Look, hell und dunkel. |
| 4 | **Aufgedeckte Seeds nur im Browser:** Sie lagen im `localStorage`, gingen auf anderen Geräten verloren und fehlten nach „Reset“. | `GET /seeds` aus der Datenbank. Die Fairness-Seite listet jedes aufgedeckte Paar mit Anzahl der Wetten und Prüf-Link. |
| 5 | **Kein Kontoauszug:** Belohnungen, Rain, Rakeback, Promo-Codes, Nachfüllungen und Korrekturen tauchten nirgends auf. | `GET /wallet/transactions` mit Typ-Filter und Paging. Neue Seite **Wallet** mit Guthaben, Nachfüllen und Hinweisen zu Ein- und Auszahlung. |
| 6 | **Kein Profil:** Name ließ sich nicht ändern, Statistiken fehlten, man konnte sich nicht überall abmelden. | Seite **Profile**: Kennzahlen, Spiele einzeln mit eigenem RTP, Namensänderung (einmal pro 24 h) und Abmelden auf allen Geräten (`/me/stats`, `/me/profile`, `/auth/logout-all`). |
| 7 | **Keine Privatsphäre in öffentlichen Listen:** Namen standen bei Crash, Wheel, Jackpot, PvP und in Gewinnmeldungen im Chat. | „Hide my name in public lists“ zeigt dort „Hidden player“. Man selbst erkennt seine Plätze weiter. Gelöst über eine gemeinsame SQL-Regel (`PUBLIC_NAME`). |
| 8 | **Kein Live-Wettfeed:** Ein Standard auf Rust-Seiten. | Lobby-Tabelle „Latest bets“ mit den Tabs All bets / High wins (≥ 5×) / My bets. `GET /feed`, 24-h-Fenster, 2 s gecacht. |
| 9 | **Abgelaufene Sitzung hing:** Ein 401 löschte nur den Token, die Oberfläche blieb stehen. | Jeder 401 im eingeloggten Zustand führt zurück zur Anmeldung, mit Hinweis. |
| 10 | **Unbekannte Adressen:** Sie landeten stumm in der Lobby. | Eigene 404-Seite. |
| 11 | **Kein Footer, keine Rechtstexte, keine Hilfe** | Footer auf jeder Seite (18+, Hilfe-Links, Navigation). Neue Seiten **Terms**, **Privacy** (beschreibt, was dieser Build speichert und wo) und **Help** (FAQ). |
| 12 | **Steam-Login ohne Oberfläche:** Die Server-Routen gab es, die Website nutzte sie nicht. | Außerhalb der Demo: Button „Sign in with Steam“ (nach 18+-Bestätigung). Die Rückkehr über `/auth/steam/return` wird beim Start erkannt; nginx liefert dafür schon `index.html`. |
| 13 | **Anmeldetext falsch:** Er nannte 100 000 statt 250 000 Scrap Startguthaben. | Wert kommt aus `/config` (`demoStartBalance`). |
| 14 | **Spielname uneinheitlich:** „Cases“ auf dem Server, „Crate opening“ auf der Seite. | Überall „Crate opening“. |
| 15 | **Dialoge:** Sie schlossen sich nicht per Klick daneben. Lange Inhalte liefen aus dem Bild. | Klick außerhalb schließt; Dialoge scrollen. |

## 2. Datenbank

`users` bekommt zwei Spalten:
- `name_changed_at`: Zeitpunkt der letzten Namensänderung.
- `hide_public`: 1 = in öffentlichen Listen verborgen.

Migration:
- Postgres: Migration v7.
- SQLite: Die bestehende Legacy-Migration ergänzt die Spalten.

Die Migration lief auf der bestehenden Entwicklungsdatenbank.

## 3. Tests

- Server: 71 Tests auf SQLite und Postgres, davon 6 neu:
  - Historie über alle Spiele mit Cursor, auch bei gleichem Zeitstempel.
  - Detail nur für eigene Runden, Seed erst nach Rotation.
  - Kontoauszug summiert sich zum Guthaben.
  - Profil: 24-h-Sperre, verborgene Namen in Feed und PvP.
  - Abmelden überall.
  - Alle neuen HTTP-Routen.
- Engine: 101 Tests.
- Im Browser durchgespielt: Würfel, Kiste und Coinflip, jeweils aus der Historie heraus im Browser nachgerechnet; dazu Wallet, Profil, Feed, die neuen Seiten, 404 und „Überall abmelden“. Desktop und 390 px: keine Konsolenfehler, kein seitliches Scrollen.

## 4. Was bewusst noch fehlt

| Thema | Warum noch nicht |
|---|---|
| Echte Ein- und Auszahlung (Skins, Krypto, Karte) | Braucht Lizenz, Zahlungsanbieter und KYC-Dienst ([05-go-live.md](05-go-live.md)). Die Prüfungen (`/wallet/withdrawal-check`, AML-Regel) sind schon gebaut. |
| Echte Steam-Itembilder und Preise | Kommen mit dem Skin-Preisfeed. Bilder von Facepunch werden nicht gebündelt. |
| E-Mail, Benachrichtigungen, Passwort-Login | Die Demo hat nur Demo- und Steam-Login, also gibt es nichts, wohin man schreiben könnte. |
| Support-Desk und Live-Hilfe | Betriebsfrage für den Echtgeldstart. Die FAQ deckt die häufigsten Fragen ab. |
| Deutsche Oberfläche | Die Oberfläche ist auf Englisch (Vorgabe aus Phase 6). Texte liegen in den Views, eine Übersetzung wäre der nächste Schritt. |
| Rennen und Bestenlisten (Wager Races) | Produktentscheidung: Sie fördern viel Einsatz in kurzer Zeit und brauchen deshalb eine eigene RG-Bewertung, bevor man sie baut. |

## 5. Nachtrag Phase 17 – Handy-Version und Slot-Walzen im Case Battle

Vorbild war der Aufbau von bandit.camp auf dem Handy. Übernommen wurde die Struktur, nicht deren Grafiken, Farben oder Marke.

**Ursache für „unübersichtlich“:** Der Demo-Seite fehlte das Viewport-Tag. Handys zeigten sie deshalb als verkleinerte 980-px-Desktopseite. Das Tag ist jetzt drin.

**Handy (bis 860 px):**
- **Kopfzeile:** Logo, Menü-Button, dann ein großer CTA. Für Gäste ist das „Sign up“, für Spieler das Guthaben mit „+“ zur Wallet. Die Spieleleiste entfällt.
- **Menü (Drawer):** alle Spiele nach Kategorie, Konto, Fair Play, Hilfe und Abmelden.
- **Untere Leiste:** Games (öffnet das Menü), Chat, Free Scrap, Account.
- **Lobby, von oben nach unten:**
  1. „Welcome to SCRAPLINE“ mit Spielern online und Runden heute (neu: `GET /stats/live`).
  2. Live-Wins-Karten zum Wischen.
  3. Slider mit vier echten Highlights (Kisten, Bonus-Battles, Prüfer, Oil Rain).
  4. Ein Spiele-Raster mit Filter-Chips und hohen Kacheln mit Banderole („New update!“, „Live now“, „Top pick“).
  5. „Get free Scrap“.

  Live-Tabellen, Fair-Ledger und Kennzahlen bleiben auf dem Desktop und der Fairness-Seite.
- **Spielseiten:** Der Kopf ist kompakt (Titel, zwei Zeilen Regeln, Kennzahlen in einer Zeile), das Spiel und der Einsatz-Button stehen weiter oben.
- **Footer:** Hinweis, dass SCRAPLINE nicht mit Rust, Facepunch, Steam oder Valve verbunden ist.

**Gastmodus:**
- Ohne Konto sind Lobby, Hilfe, AGB, Datenschutz, Prüfer und Chat (nur lesen) offen.
- Spiele und Kontoseiten öffnen das Anmelde-Fenster. Auf dem Handy ist das ein Bottom-Sheet mit 18+-Bestätigung. Die alte Vollbild-Anmeldeseite entfällt.

**Online-Zähler:**
- `sessions.last_seen` wird höchstens einmal pro Minute geschrieben.
- „Online“ zählt Konten mit einer Anfrage in den letzten 5 Minuten.
- Migration: Postgres v8, SQLite über die Legacy-Migration.

**Slot-Walzen im Case Battle:**
- Jeder Platz hat ein Fenster mit drei großen Item-Symbolen und einer Gewinnlinie.
- Die Streifen sind nach den echten Chancen der Kiste gefüllt.
- Ablauf einer Runde:
  - Alle Walzen starten und stoppen gleichzeitig, bei 2v2 also vier.
  - Sie rasen mit Bewegungsunschärfe los, werden langsamer, laufen ein Stück über und rasten auf dem gezogenen Item ein.
  - Danach leuchtet das Symbol in seiner Seltenheitsfarbe auf, Name und Wert erscheinen darunter.
- Dauer 3,6 s, im Schnell-Modus 1,1 s. Mit „Bewegung reduzieren“ springen die Walzen direkt.
- Im Browser gemessen: bei 1v1v1v1 und 2v2 alle Walzen exakt mittig auf der Linie.

**Robustheit:** Ein Fehler in einer Ansicht kippt nicht mehr die ganze Seite. Die Zeichen-Animation der auf dem Handy ausgeblendeten Hero-Zeichnung hatte nach der Anmeldung die Fehlerseite ausgelöst.

**Tests:** Server 72 Tests auf SQLite und Postgres. Ein bestehender Explorer-Test hing vom Zufall ab (Hi-Lo-Tipp bei König oder Ass) und ist jetzt deterministisch.
