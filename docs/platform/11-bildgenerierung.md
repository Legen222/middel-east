# 11 · Bilder mit KI: Claude führt, das OpenAI-Bildmodell zeichnet

Stand: 25.10.2026.

## Rollen

| Wer | Aufgabe |
|---|---|
| **Claude (Chef)** | Stil festlegen, Briefings und Prompts schreiben, Bilder erzeugen lassen, jede Variante ansehen, verwerfen oder nachschärfen, die beste auswählen, optimieren und in die Seite einbauen |
| **OpenAI-Bildmodell** (`gpt-image-1`, per API) | Zeichnet nur, nach den Briefings |
| **Du** | API-Key bereitstellen, Budget festlegen, Stil-Test freigeben |

**Wichtig:** Ein ChatGPT-Abo lässt sich nicht direkt verbinden. Nötig ist ein **API-Key** von platform.openai.com; die API wird getrennt vom ChatGPT-Abo abgerechnet.

## Was du einrichten musst

1. **API-Key anlegen** auf platform.openai.com:
   - als „Restricted“-Key, der nur Bilder erzeugen darf;
   - dazu ein monatliches Budget-Limit im Billing.
2. **Key in die Umgebung eintragen:** in den Einstellungen der Cloud-Umgebung als Secret bzw. Umgebungsvariable mit dem Namen **`OPENAI_API_KEY`**. Nicht in den Chat schreiben.
3. **Netzwerk freigeben:** unter Network access die Domain **`api.openai.com`** erlauben (Haken bei den Paketmanagern drin lassen).
4. **Neue Session starten:** Erst eine neue Session sieht Key und Freigabe.

## Ablauf

1. **Stil-Test:** Zuerst entstehen 3 Motive mit je 2 Varianten:
   - eine Kiste (Military Crate, freigestellt);
   - eine Spielkachel (Scrap Press, Hochformat);
   - das Lobby-Banner.

   Ich prüfe sie und zeige sie dir. Du gibst den Stil frei oder sagst, was anders werden soll.
2. **Batch v1:** die restlichen 37 Motive:
   - 19 weitere Kisten;
   - 14 weitere Spielkacheln;
   - 4 Slider-Banner.

   Pro Motiv entstehen 2 Varianten. Ich wähle aus, Fehlversuche lasse ich mit geschärftem Prompt neu erzeugen.
3. **Einbau:**
   - Die gewählten Bilder ersetzen bzw. ergänzen die bisherigen Strichzeichnungen auf Kisten, Kacheln, Banner und Slider.
   - Die Seite lädt sie verzögert.
   - Die Demo bleibt unter 16 MB.

## Technik

| Was | Wo |
|---|---|
| Generator | `platform/web/tools/imagegen.mjs`, ohne Zusatzpakete |
| Briefings | `platform/web/art/manifest.json`: ein gemeinsamer Stil, ein Stil je Art (Kiste, Kachel, Banner), dazu das Motiv. Alle 40 Motive sind schon beschrieben. |
| Varianten | `art/out/<id>/vN.webp` mit Protokoll (Prompt, Modell, Einstellungen); nicht im Repository |
| Gewählte Bilder | `art/picked/<id>.webp`; `art/picked.json` hält fest, aus welchem Briefing jedes Bild stammt |

```bash
cd platform/web
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

## Kosten

Grob einige Cent bis etwa 0,20 $ pro Bild, je nach Größe und Qualität. Aktuelle Preise stehen auf platform.openai.com/pricing.

Bei 40 Motiven × 2 Varianten plus Nachbesserungen: grob 10–25 $.
