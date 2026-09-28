# Phase 8 – Weg zum Echtgeld-Betrieb (SCRAPLINE)

Stand: 28.09.2026 · Status: **Demo-Modus.** Dieses Dokument ist eine Entscheidungsvorlage und eine Checkliste, **keine Rechtsberatung**.
Jede Zeile mit „Anwalt“ oder „Lizenzgeber“ braucht eine fachliche Bestätigung, bevor Geld fließt.

---

## 1. Die drei Entscheidungen, die zuerst fallen müssen

| # | Entscheidung | Warum zuerst | Empfehlung |
|---|---|---|---|
| 1 | **Steam-Frage klären** (Rechtsgutachten) | Valve untersagt Glücksspiel über OpenID und Steam-Trades (Abmahnungen gegen 23 Seiten 2016, siehe [04-architektur.md](04-architektur.md) Abschnitt 0). Das betrifft das Geschäftsmodell, nicht nur die Technik. | Skins **nur** über einen P2P-Partner, keine eigenen Bots, Steam-Login optional. Zuerst mit einem Anwalt klären, ob und wie Skin-Einzahlungen überhaupt angeboten werden. Ein Betrieb nur mit Krypto und Karte ist der Rückfallplan. |
| 2 | **Lizenz** | bestimmt Zielmärkte, Zahlungswege, Pflichten und Budget | **Curaçao (LOK/CGA)** als Hauptweg, Anjouan als Plan B (Abschnitt 2) |
| 3 | **Zielmärkte** | Die Geo-Liste im Code (`realMoneyBlocked`) ist nur ein Startwert | pro Land prüfen und mit der Lizenz abgleichen. **Deutschland bleibt gesperrt:** Online-Tischspiele und Originals dieser Art sind nach GlüStV 2021 ohne deutsche Erlaubnis nicht zulässig |

---

## 2. Lizenz im Vergleich

| | **Curaçao (LOK, CGA)** | **Anjouan** | MGA (Malta) |
|---|---|---|---|
| Status | seit 24.12.2024 neues Gesetz (LOK), direkte Lizenz bei der CGA, keine Sublizenzen mehr | Offshore-Lizenz, deckt Casino, Sportwetten und Krypto ab | EU-Premiumlizenz |
| Kosten (Behörde) | ca. **4 592 €** Antrag + ca. **47 450 €/Jahr** (Abgabe + Aufsichtsgebühr) | ab ca. **18–30 T€** im ersten Jahr (Anbieterangaben) | deutlich höher; hier nicht recherchiert |
| Dauer | zweistufige Prüfung (Integrität und Finanzen, dann Technik und Recht) | laut Anbietern 2–8 Wochen | lang |
| Pflichten | AML, **ADR (Streitschlichtung) Pflicht**, Spielerdaten auf einem **Tier-IV-Server in Curaçao**, ab 2028/29 lokales Personal und Büro | AML/KYC, RG, RNG-Zertifikat, Fit-and-proper-Prüfung | umfassend |
| Präzedenz im Skin-Markt | CSGOEmpire arbeitet unter Curaçao-Lizenz | – | – |
| Ruf bei Banken und PSPs | besser als früher, weiterhin „high risk“ | schwächer | am besten |

**Folge für die Architektur:** Unter LOK müssen die Spielerdaten auf einem Tier-IV-Server in Curaçao liegen. Die Postgres-Primärinstanz (Abschnitt 1 in 04-architektur.md) muss also dort oder in einem anerkannten Rechenzentrum stehen. Die Konfiguration muss mit der CGA abgestimmt werden.

Quellen: [Point Legal – Curaçao Kosten 2026](https://www.thepointlegal.com/guides/curacao-gaming-licence), [GFLO – Curaçao LOK](https://gflolaw.com/en/curacao-gambling-license/), [SOFTSWISS – Anjouan 2026](https://www.softswiss.com/knowledge-base/anjouan-igaming-licence-guide/), [Track360 – Anjouan](https://track360.io/blog/anjouan-gaming-license-operator-setup-2026), [CSGOEmpire (Wikipedia)](https://en.wikipedia.org/wiki/CSGOEmpire).

---

## 3. Rechtslage Skins (Auswahl)

- **UK:** Nach Ansicht der Gambling Commission braucht eine Lizenz, wer virtuelle Items als Währung zum Spielen einsetzt. Die Commission hat Seiten wegen Werbung für unerlaubtes Glücksspiel und Minderjährigen-Glücksspiel verfolgt. DCMS fordert strengere Regeln ([DLA Piper 2025](https://www.dlapiper.com/en-gb/insights/blogs/mse-today/2025/skins-gambling-in-the-uk-dcms-calls-for-stronger-regulation-and-safeguards), [CMS](https://cms.law/en/gbr/legal-updates/inside-the-skins-gambling-surge-dcms-review-exposes-risks-and-regulatory-gaps-in-skins-gambling)). → **UK bleibt gesperrt.**
- **Minderjährige** sind das zentrale Risiko des Segments. KYC Stufe 1 (Ausweis + Liveness) vor der **ersten** Echtgeld-Einzahlung ist deshalb Pflicht und nicht verhandelbar. Die Selbstauskunft 18+ reicht nur für die Demo.
- **Werbung:** keine Streamer-Deals mit Zielgruppe unter 18, keine Gratis-Guthaben-Codes auf Kinder-Kanälen, Kennzeichnung als Werbung.

---

## 4. Go-Live-Checkliste

Legende: ✔ im Repo umgesetzt · ◐ vorbereitet (Schnittstelle/Hook) · ☐ offen

### Recht und Lizenz
| | Punkt |
|---|---|
| ☐ | Rechtsgutachten Steam/Valve und Skin-Einzahlungen |
| ☐ | Gesellschaft, Geschäftsführung und wirtschaftlich Berechtigte (Fit-and-proper-Prüfung) |
| ☐ | Lizenzantrag (Curaçao LOK), Geo-Liste final |
| ☐ | AGB, Datenschutz (DSGVO für EU-Nutzer), Bonusregeln, Beschwerdeprozess, ADR-Stelle |
| ☐ | MLRO (Geldwäschebeauftragter) benennen, AML-Richtlinie, Risikoanalyse |

### Spiele und Fairness
| | Punkt |
|---|---|
| ✔ | Provably Fair (HMAC-SHA256, Commit/Reveal, Hash-Kette, Beacon) mit öffentlichem Prüfer |
| ✔ | RTP-Beweise und Monte-Carlo, 10 Mio. Runden je Lauf, 40 Läufe (Phase 3) |
| ✔ | Live-RTP-Statistik je Spiel (`/stats/rtp`) |
| ☐ | **Externes RNG- und Spielmathematik-Zertifikat** (iTech Labs, GLI oder BMM) |
| ☐ | Beacon auf drand umstellen (`BEACON=drand`) und die BLS-Signatur prüfen |
| ☐ | Echte Kisteninhalte und Preis-Feed (`PriceFeed`) mit Ausreißer-Filter und Änderungsprotokoll |

### Spieler-Schutz
| | Punkt |
|---|---|
| ✔ | Limits (Einzahlung, Verlust, Einsatz), 24-h-Verzögerung beim Lockern, Pause, Selbstausschluss, Reality-Check, Session-Leiste |
| ✔ | Keine Kredite, keine Promos während einer Pause, Belohnungen nur auf erwarteten Verlust |
| ◐ | KYC-Stufen 1 und 2 (`KycProvider`-Schnittstelle), Anbieter anbinden |
| ☐ | Abgleich mit nationalen Sperrdateien, soweit die Lizenz das verlangt |
| ☐ | Früherkennung (Verhaltensmodell: Einzahlungsfrequenz, Verlust-Jagd, Nachtspiel) mit Kontaktpflicht |

### Geld
| | Punkt |
|---|---|
| ✔ | Doppelte Buchführung, Integritätsprüfung, Rundung zugunsten der Kasse um höchstens 0,001 Frag |
| ✔ | Maximalgewinn je Wette, Escrow für PvP mit Nachschuss aus der Bankroll |
| ◐ | Zahlungswege `CryptoRail`, `CardRail`, `SkinRail` (Schnittstellen) |
| ◐ | AML-Hooks: Umsatzbedingung vor Auszahlung, Flags für große und gestückelte Einzahlungen |
| ☐ | Krypto-Processor mit Sanktions- und Mixer-Screening, PSP für MCC 7995, P2P-Skin-Partner |
| ☐ | Bankroll-Management: Rücklage mindestens der Maximalgewinn × erwartete gleichzeitige Spitzen, Stresstest |

### Betrieb
| | Punkt |
|---|---|
| ✔ | Rate-Limit, Größenlimit, Geo-Prüfung per Edge-Header, gehashte Session-Tokens, Audit-Log |
| ☐ | Postgres statt SQLite, KMS für Server-Seeds, Idempotenz-Keys, WORM-Audit-Log |
| ☐ | Rechenzentrum passend zur Lizenz (Curaçao: Tier IV für Spielerdaten) |
| ☐ | Penetrationstest, Bug-Bounty, Incident-Runbook, Kill-Switch je Spiel |
| ☐ | Monitoring: RTP-Alarm (|z| > 4), Ledger-Integrität stündlich, Auszahlungszeit-Median öffentlich |

---

## 5. Budget erstes Jahr (grobe Größenordnung, ohne Personal)

| Posten | Größenordnung | Grundlage |
|---|---|---|
| Lizenz Curaçao | ca. 52 T€ | 4,6 T€ Antrag + 47,5 T€ jährlich (Behörde), zzgl. Beratung |
| RNG- und Spielzertifikat | Angebot einholen | 9 Originals, Umfang nach Labor |
| KYC | pro Prüfung | Anbieterangebot. Kosten entstehen erst bei der ersten Einzahlung |
| Rechtsgutachten Steam und Märkte | Angebot einholen | – |
| Infrastruktur | abhängig vom Rechenzentrum | Tier IV in Curaçao |
| Bankroll | = Haftungsrahmen | Maximalgewinn je Wette aktuell 10 000 $ |

Die Zahlen zur Lizenz stammen aus öffentlichen Anbieter- und Kanzleiquellen (Abschnitt 2) und müssen mit der CGA bestätigt werden.

---

## 6. Reihenfolge

1. Rechtsgutachten (Steam, Zielmärkte). Nach dem Ergebnis entscheiden: mit oder ohne Skins.
2. Gesellschaft und Lizenzantrag. Parallel externes RNG-Zertifikat auf Basis von Phase 3.
3. KYC-Anbieter, Krypto-Processor, PSP und (falls erlaubt) P2P-Partner anbinden.
4. Umstieg auf Postgres, KMS und Rechenzentrum, dann Penetrationstest.
5. Geschlossene Beta mit Echtgeld und niedrigem Maximalgewinn, danach öffentlicher Start.
