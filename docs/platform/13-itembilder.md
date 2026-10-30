# 13 · Itembilder von Steam und größere Battle-Walzen

## 1 · Was sich im Case Battle ändert

**Walzen:**
- Die Walze pro Platz ist größer: Ein Symbol ist 104 px hoch statt 72 px, die Walze also 312 px statt 216 px. Auf dem Handy sind es 80 px statt 58 px.
- Die Zeichnungen in der Walze sind entsprechend größer.
- Ein Steam-Bild füllt fast das ganze Feld (96 px).
- Name und Wert des Treffers unter der Walze sind größer geschrieben.

**Drop-Kacheln** (die Items, die ein Spieler gezogen hat):
- Jede Kachel ist mindestens 112 px breit statt 88 px.
- Das Bild ist 56 px hoch statt 30 px; Name und Wert sind größer.
- Auf dem Handy bleiben es zwei Spalten mit 40 px hohen Bildern.

Die Dreh-Animation selbst (Dauer, Unschärfe, Überschwingen) bleibt gleich.

## 2 · Woher die Bilder kommen

Jedes Item mit dem gleichen Namen auf dem **Steam Community Market** (Rust, App 252490) zeigt dessen Bild. Das sind die Skins, zum Beispiel:
- Alien Red, Tempered AK47, Glory AK47;
- Big Grin, Punishment Mask, Whiteout Facemask;
- die Desert-Raiders- und Forest-Raiders-Teile.

**So kommt das Bild auf die Seite:**
- Gespeichert wird nur der Bild-Schlüssel (`icon_url` des Markts).
- Der Browser lädt das Bild direkt vom Steam-CDN (`community.cloudflare.steamstatic.com`).
- Kein Bild wird gebündelt oder auf unserem Server abgelegt.
- Die Content-Security-Policy erlaubt den Steam-CDN schon (`nginx.conf`).

**Items ohne Steam-Bild:**
- **Grundgegenstände** (Rope, Bandage, Assault Rifle, Metal Spring …) werden auf dem Markt nicht gehandelt und haben dort kein Bild. Sie behalten unsere Zeichnung.
- **Sets** zeigen das Bild ihres Hauptteils, zum Beispiel Glory Set → Glory AK47 und Punishment Set → Punishment Mask. Die Liste steht in `ALIASES`.
- Lädt ein Bild nicht (Steam nicht erreichbar, Schlüssel veraltet), erscheint an seiner Stelle wieder die Zeichnung.

**Woher der Server den Schlüssel nimmt** (der erste Treffer zählt):

| Quelle | Wann |
|---|---|
| Tabelle `item_icons` | Der Server sucht im laufenden Betrieb selbst nach Items, für die er noch keinen Schlüssel hat, zum Beispiel aus Kisten, die ein Operator anlegt. Alle 10 Minuten höchstens 6 Suchen mit Pause, weil Steam die Marktsuche drosselt. Findet er nichts, merkt er sich das und fragt nach einer Woche wieder. |
| `ITEM_ICON_SEED` (`platform/server/src/item-icon-seed.ts`) | Feste Liste für die eingebauten Kisten. So zeigt die Seite die Bilder vom ersten Start an, auch in der Browser-Demo. |

Die Seite bekommt die Liste Name → Schlüssel mit `/config` (`itemIcons`).

**Wann ein Item als gefunden gilt:**
- Der Name auf dem Markt muss genau dem Itemnamen entsprechen. Groß- und Kleinschreibung, Leerzeichen und Bindestriche zählen nicht.
- Ein Skin wird also nie als Bild für den Grundgegenstand genommen (Tempered AK47 ≠ Assault Rifle).

## 3 · Liste füllen

```bash
cd platform/server && npm run item-icons            # sucht alle Items, die in der Liste fehlen
cd platform/server && npm run item-icons -- --all   # sucht alle neu
```

**Was das Werkzeug macht:**
- Es fragt die Marktsuche alle 3 Sekunden ab.
- Bei einer Drosselung durch Steam (HTTP 429) wartet es eine Minute.
- Am Ende schreibt es `item-icon-seed.ts` neu und listet die Items ohne Treffer.
- Danach `npm run build:demo` in `platform/web`, damit die Demo die Bilder zeigt.

**Voraussetzung:** Zugang zu `steamcommunity.com`, und für die Anzeige zu `community.cloudflare.steamstatic.com`.

## 4 · Einstellungen

| Variable | Standard | Wirkung |
|---|---|---|
| `ITEM_ICON_LOOKUP` | `true` | Der Server sucht fehlende Bilder selbst (nur die Leader-Instanz). |
| `ITEM_ICON_SEARCH_URL` | Steam-Marktsuche | Eigene Quelle mit derselben Antwortform (`results[].hash_name`, `results[].asset_description.icon_url`); `{query}` wird ersetzt. |

- Datenbank: Tabelle `item_icons`, in Postgres über Migration v11.
- Tests: Treffer nur bei gleichem Namen, Sets über ihr Hauptteil, gemerkte Fehltreffer, Abbruch bei 429, Liste in `/config`.
