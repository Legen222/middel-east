# 11 · Bilder mit KI: Claude führt, das OpenAI-Bildmodell zeichnet

Stand: 25.10.2026.

## Rollen

| Wer | Aufgabe |
|---|---|
| **Claude (Chef)** | Stil festlegen, Briefings und Prompts schreiben, Bilder erzeugen lassen, jede Variante ansehen, verwerfen oder nachschärfen, die beste auswählen, optimieren und in die Seite einbauen |
| **ChatGPT** (Abo) oder **OpenAI-Bildmodell** (`gpt-image-1`, per API) | Zeichnet nur, nach den Briefings |
| **Du** | Stil-Test freigeben, Dateien zwischen ChatGPT und Claude weitergeben (oder API-Key und Budget für den automatischen Weg) |

Es gibt zwei Wege mit denselben Briefings:

| Weg | Wie | Braucht |
|---|---|---|
| **ChatGPT (von Hand)** | ChatGPT liest [`ART-BRIEFS-CHATGPT.md`](../../ART-BRIEFS-CHATGPT.md) im Hauptordner und zeichnet Batch für Batch. Die Dateien landen in `platform/web/art/incoming/` (per Pull Request) oder du gibst sie Claude. | Dein ChatGPT-Abo |
| **API (automatisch)** | `npm run art` erzeugt die Bilder direkt aus diesem Projekt. | API-Key und Netzwerk-Freigabe (unten) |

## ChatGPT-Weg

1. ChatGPT die Datei `ART-BRIEFS-CHATGPT.md` geben: über die GitHub-Verbindung (Branch `claude/busy-fermi-84hacd`) oder als hochgeladene Datei.
2. ChatGPT zeichnet zuerst den Stil-Test (5 Bilder). Du gibst ihn frei oder sagst, was anders werden soll.
3. Danach die Batches in dieser Reihenfolge: Kisten (20), Spielkacheln (14), Banner und Hintergründe (7), Items (51), Avatare (11), Illustrationen (9).
4. Die Dateien heißen genau wie die ID, z. B. `crate-barrel.png`. Sie kommen nach `platform/web/art/incoming/` oder direkt zu Claude.
5. Claude prüft jedes Bild, schneidet und komprimiert es nach `art/picked/<id>.webp` und baut es ein. Danach `npm run art:brief`, damit die Liste abgehakt ist.

Die Datei wird aus `platform/web/art/manifest.json` erzeugt; Änderungen an den Briefings gehören dorthin.

## API-Weg

**Wichtig:** Ein ChatGPT-Abo lässt sich hier nicht als Schlüssel nutzen. Nötig ist ein **API-Key** von platform.openai.com; die API wird getrennt vom ChatGPT-Abo abgerechnet.

## Was du einrichten musst

1. **API-Key anlegen** auf platform.openai.com:
   - als „Restricted“-Key, der nur Bilder erzeugen darf;
   - dazu ein monatliches Budget-Limit im Billing.
2. **Key in die Umgebung eintragen:** in den Einstellungen der Cloud-Umgebung als Secret bzw. Umgebungsvariable mit dem Namen **`OPENAI_API_KEY`**. Nicht in den Chat schreiben.
3. **Netzwerk freigeben:** unter Network access die Domain **`api.openai.com`** erlauben (Haken bei den Paketmanagern drin lassen).
4. **Neue Session starten:** Erst eine neue Session sieht Key und Freigabe.

## Ablauf

1. **Stil-Test:** Zuerst entstehen 5 Motive mit je 2 Varianten:
   - eine Kiste (Military Crate, freigestellt);
   - eine Spielkachel (Scrap Press, Hochformat);
   - das Lobby-Banner;
   - ein Item (Assault Rifle, freigestellt);
   - ein Avatar.

   Ich prüfe sie und zeige sie dir. Du gibst den Stil frei oder sagst, was anders werden soll.
2. **Batches `crates`, `tiles`, `banners`, `items`, `avatars`, `illustrations`:** die restlichen 112 Motive:
   - 20 weitere Kisten (mit der täglichen Scrap Crate);
   - 14 weitere Spielkacheln;
   - 4 Slider-Banner, Vorschaubild für Links, Seitenhintergrund für Desktop und Handy;
   - 51 Items (Grundgegenstände, Ersatzbilder je Item-Art, Sets);
   - 11 weitere Avatare (Demo-Bots und Spieler ohne Bild);
   - 9 Illustrationen (leere Listen, 404, keine Verbindung, Spiel pausiert, Pause/Limits, Belohnungen).

   Pro Motiv entstehen 2 Varianten. Ich wähle aus, Fehlversuche lasse ich mit geschärftem Prompt neu erzeugen.
3. **Einbau:**
   - Die gewählten Bilder ersetzen bzw. ergänzen die bisherigen Strichzeichnungen auf Kisten, Kacheln, Banner und Slider.
   - Die Seite lädt sie verzögert.
   - Die Demo bleibt unter 16 MB.

## Technik

| Was | Wo |
|---|---|
| Generator | `platform/web/tools/imagegen.mjs`, ohne Zusatzpakete |
| Briefings | `platform/web/art/manifest.json`: ein gemeinsamer Stil, ein Stil je Art (Kiste, Kachel, Banner, Item, Hintergrund, Avatar, Illustration), dazu das Motiv. 117 Motive. |
| ChatGPT-Datei | `ART-BRIEFS-CHATGPT.md` im Hauptordner, erzeugt mit `npm run art:brief`; hakt ab, was in `art/picked/` liegt, und zeigt, was in `art/incoming/` wartet |
| Varianten | `art/out/<id>/vN.webp` mit Protokoll (Prompt, Modell, Einstellungen); nicht im Repository |
| Gewählte Bilder | `art/picked/<id>.webp`; `art/picked.json` hält fest, aus welchem Briefing jedes Bild stammt |

```bash
cd platform/web
npm run art:brief                             # schreibt ART-BRIEFS-CHATGPT.md neu
npm run art -- --dry --batch style-test      # zeigt, was gesendet würde (ohne Key)
npm run art -- --batch style-test            # erzeugt 3 Motive × 2 Varianten
npm run art -- --only crate-gold-egg --variants 3
npm run art -- --pick crate-military-crate=2
```

## Regeln für die Bilder

- **Eigener Stil:** Rust-Endzeit aus Schrott, Graphit, Cyan- und Violett-Licht, Messing; passend zum bisherigen Clean-Neon-Look.
- **Keine Kopien:** keine Kopie von Rust-, Facepunch- oder Konkurrenz-Grafiken, kein Spieltitel im Prompt, keine Logos, keine Schrift im Bild.
- **Kein Rotes-Kreuz-Zeichen:** Das Zeichen ist rechtlich geschützt; die Medical Crate ist mint-grün mit Plus-Verschluss.
- **Kisten:** freigestellt (transparenter Hintergrund), damit sie in Walzen, Battles und Listen funktionieren. Je teurer die Kiste, desto mehr Leuchten.
- **Items:** nur Grundgegenstände und Ersatzbilder je Item-Art. Skins (Alien Red, Tempered AK47 …) zeigen ihr echtes Steam-Bild ([13-itembilder.md](13-itembilder.md)) und werden nicht nachgezeichnet.
- **Keine Gesichter, nichts Kindliches, kein echtes Geld:** Avatare tragen Masken oder Helme; Glücksspiel-Bilder dürfen Minderjährige nicht ansprechen; die Währung ist Schrott, keine Scheine, Münzen oder Chips.

## Kosten

Grob einige Cent bis etwa 0,20 $ pro Bild, je nach Größe und Qualität. Aktuelle Preise stehen auf platform.openai.com/pricing.

Bei 117 Motiven × 2 Varianten plus Nachbesserungen: grob 25–60 $. Über das ChatGPT-Abo fallen keine Extrakosten an, nur dessen Nutzungsgrenzen.
