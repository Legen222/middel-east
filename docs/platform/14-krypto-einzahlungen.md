# 14 · Krypto-Einzahlungen

Stand: 03.11.2026. Code: `platform/server/src/crypto.ts`, Oberfläche im Wallet (`#/wallet`) und im Backoffice (Reiter **Crypto**).

## Was gebaut ist

**Bitcoin-Einzahlungen, die sich selbst gutschreiben.** Jeder Spieler bekommt eine eigene Bitcoin-Adresse. Was dort ankommt, landet nach zwei Bestätigungen automatisch auf seinem Konto, zum Dollarkurs dieses Moments (1 Scrap = 1 $).

- **Kein Zahlungsanbieter nötig.** Der Server bekommt nur den **öffentlichen** Schlüssel (zpub) deiner Wallet. Daraus leitet er pro Spieler eine Adresse ab (`<zpub>/0/<Nummer>`). Er kann damit **nichts ausgeben**: Die privaten Schlüssel bleiben in deiner Wallet.
- **Erkennung:** Der Server fragt alle 30 Sekunden die öffentliche Blockchain-API (mempool.space) nach den Adressen der Spieler.
- **Zuordnung:** Jede Adresse gehört genau einem Spielerkonto. Das Spielerkonto hängt am Steam-Login (`users.steam_id`).
- **Speicherung:** Alles liegt in der Datenbank. Die Tabelle `crypto_addresses` hält die Adresse pro Spieler, `crypto_deposits` jede einzelne Zahlung mit Betrag, Bestätigungen, Status, Kurs und Gutschrift. Die Gutschrift läuft als Buchung im Ledger (`deposit`, von `house:crypto` an den Spieler). Die Spielerstatistik (`player_stats.deposited`) zählt per Trigger mit, das Audit-Log protokolliert jeden Schritt.

## Ablauf einer Einzahlung

```
Spieler öffnet Wallet → „Show my BTC address“  ── Adresse wird einmal erzeugt und gespeichert
            │
Spieler schickt BTC   ── im Mempool:  Status „Confirming 0/2“
            │
1. Block   ── „Confirming 1/2“
2. Block   ── Abrechnung, genau einmal:
            ├─ alles in Ordnung            → „Credited“, Guthaben steigt, Toast im Wallet
            └─ etwas spricht dagegen       → „On hold“, nichts gutgeschrieben, Backoffice entscheidet
```

**Zurückgehalten (On hold)** wird eine Einzahlung, wenn
- sie unter dem Mindestbetrag liegt (Standard 5 $),
- der Spieler eine Pause oder einen Selbstausschluss hat,
- sie ein Einzahlungslimit des Spielers überschreiten würde,
- die Identität noch nicht geprüft ist (`KYC_BEFORE_DEPOSIT=true`).

Eine Blockchain-Überweisung lässt sich nicht ablehnen. Darum geht nichts verloren: Im Backoffice wählst du **Credit** (nach Prüfung gutschreiben) oder **Sent back** (du hast die Coins aus deiner Wallet zurückgeschickt, die Transaktions-ID kommt in die Begründung). Bei Pause oder Selbstausschluss ist nur „Sent back“ möglich. Beides braucht eine Begründung und landet im Audit-Log.

**Sicher gegen doppelte Gutschrift:** Jede Zahlung hat die ID `BTC:<txid>:<Ausgang>`. Erneutes Abfragen, zwei Server gleichzeitig oder ein Neustart ändern nichts, weil die Abrechnung in einer Transaktion über den Status abgesichert ist.

## Einrichten

1. **Wallet:** Eine eigene Wallet nur für die Seite anlegen, z. B. mit [Sparrow Wallet](https://sparrowwallet.com) (Desktop) oder einer Hardware-Wallet. Typ: *Native SegWit (P2WPKH)*.
2. **Gap Limit hochsetzen:** Wallets suchen normalerweise nur 20 unbenutzte Adressen voraus. Bei vielen Spielern siehst du sonst nicht alle Einzahlungen. In Sparrow: *Settings → Advanced → Gap limit* auf z. B. 5 000 setzen. Für das Guthaben der Spieler ist das egal, das rechnet der Server; es geht nur darum, dass du die Coins in deiner Wallet siehst.
3. **zpub exportieren:** In Sparrow unter *Settings → Keystores* den **zpub** (beginnt mit `zpub…`) kopieren. **Niemals** `zprv`/`xprv` oder die Seed-Wörter.
4. **Server-Umgebung** (siehe `deploy/.env.example`):
   ```
   DEMO=false
   LICENCE_ID=…
   CRYPTO_BTC_XPUB=zpub…
   CRYPTO_CONFIRMATIONS=2
   CRYPTO_MIN_DEPOSIT=5
   ```
   Beim Start prüft der Server den Schlüssel. Ist er falsch oder privat, startet er nicht.
5. **Erst im Testnetz ausprobieren:** Eine Testnet-Wallet in Sparrow anlegen (*Tools → Restart in Testnet*), deren `vpub` eintragen. Der Server nutzt dann automatisch mempool.space/testnet4. Kostenlose Testnet-Coins gibt es bei Faucets.

## Was geprüft ist

- **Adressen:** stimmen mit dem offiziellen BIP84-Testvektor überein (Test `derives BIP84 receive addresses …`).
- **Ablauf:** Mempool → 1/2 → Gutschrift, keine doppelte Gutschrift, Mindestbetrag, Selbstausschluss, Einzahlungslimit, Backoffice-Entscheidungen, Ledger bleibt bei null (Test `gives each player one address …`).
- **Echte Blockchain:** Gegen mempool.space mit der öffentlich bekannten Adresse aus dem Testvektor geprüft. 89 echte Zahlungen wurden erkannt, bewertet, gutgeschrieben oder wegen Kleinstbetrag zurückgehalten. Der zweite Durchlauf brauchte nur zwei Anfragen und schrieb nichts doppelt gut.

## Grenzen und nächste Schritte

| Thema | Stand | Empfehlung |
|---|---|---|
| **Nur Bitcoin** | Gebaut | Litecoin geht mit demselben Code (andere Adressvorsilbe und API). Bei Bedarf ergänzen. |
| **USDT/USDC (Stablecoins)** | Fehlt | Spieler mögen Stablecoins, weil der Wert fest ist. Per-Spieler-Adressen auf Ethereum/Tron brauchen Gas zum Einsammeln. Das macht man besser über einen Anbieter (siehe unten). Der Kern (`settleDeposit`, Zurückhalten, Backoffice) bleibt gleich; ein Anbieter ist nur eine weitere Quelle von Zahlungen. |
| **Auszahlungen** | Von Hand aus deiner Wallet | Automatisch nur über einen Anbieter oder eine Hot-Wallet. Eine Hot-Wallet auf dem Server ist ein Ziel für Angreifer und sollte nur kleine Beträge halten. |
| **Herkunftsprüfung (AML)** | Nur Muster-Flags (große Einzahlung, viele kleine) | Lizenzgeber verlangen meist eine Prüfung auf gesperrte Adressen und Mixer (Chainalysis, TRM, Elliptic). Anbieter für Glücksspiel haben das oft eingebaut. |
| **Öffentliche API** | mempool.space | Ab ein paar hundert aktiven Adressen eine eigene Instanz (mempool/Esplora mit eigenem Bitcoin-Knoten) betreiben und `CRYPTO_BTC_API` darauf zeigen lassen. |
| **Kursrisiko** | Kurs zum Zeitpunkt der 2. Bestätigung | Üblich. Wer es anders will, rechnet zum Kurs beim Eingang im Mempool. |

## Anbieter für Stablecoins und Auszahlungen

Die Recherche (November 2026) ergab viele Anbieter mit fester Adresse pro Spieler und Webhook. Die Angaben stammen fast alle aus Werbetexten der Anbieter selbst. Vor einer Wahl unbedingt prüfen: Glücksspiel erlaubt für deine Lizenz? Adressen-Screening eingebaut? Gebühren? Verwahrung (custodial) oder nicht?

- **Selbst gehostet:** [BTCPay Server](https://btcpayserver.org), kostenlos, nicht verwahrend, Bitcoin und Litecoin; Webhooks mit HMAC-Signatur. Kein Screening.
- **Gehostete Gateways mit Adresse pro Spieler** (laut eigener Werbung): [CCPayment](https://ccpayment.com/blog/ccpayment-esports-betting-crypto-api-igaming-stablecoin-gateway/), [GatewayCrypto](https://gatewaycrypto.io/industries/igaming/), [Paycan](https://paycan.io/products/static-address); NOWPayments listet iGaming als Branche ([Übersicht](https://www.sitepoint.com/best-crypto-payments-gateways-in-2024/)). Überblick zu Stablecoins im iGaming: [EukaPay](https://eukapay.com/blog/best-crypto-payment-gateway-igaming-2026).
- **NOWPayments-Webhooks** werden mit HMAC-SHA512 im Header `x-nowpayments-sig` signiert; ob der rohe oder der sortierte JSON-Text signiert wird, ist in den Quellen widersprüchlich ([Ruby-Gem](https://rubydoc.info/gems/nowpayments/NOWPayments/Webhook), [Adapter-Referenz](https://ledgerline-docs.onrender.com/docs/reference/nowpayments-adapter)). Das muss man mit einem echten Sandbox-Webhook testen.

Sobald du dich für einen Anbieter entschieden hast, kommt ein Webhook-Endpunkt dazu, der dessen Signatur prüft und die Zahlung in denselben Kern gibt. Alles andere (Zuordnung, Zurückhalten, Backoffice, Ledger) bleibt.
