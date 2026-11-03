# shorts-bot – jeden Tag ein KI-Short auf YouTube & TikTok

Läuft täglich per GitHub Actions (`.github/workflows/daily-short.yml`):

1. **Trends recherchieren**: Claude durchsucht das Web nach aktuellen KI-Shortform-Trends (Italian Brainrot, virale KI-Figuren, Sounds, Hooks …) → `out/<datum>/trends.md`
2. **Konzept schreiben**: Claude erfindet eine **eigene** Figur im Trend-Format, mit Titel, Beschreibung, Hashtags und 2 Szenen-Prompts → `concept.json`. Bereits gepostete Ideen (`state/history.json`) werden nicht wiederholt.
3. **Video generieren**: jede Szene wird über fal.ai erzeugt (Standard: Veo 3 Fast, 9:16, mit Ton) und mit ffmpeg zu einem 1080×1920-Short zusammengeschnitten.
4. **Hochladen** auf YouTube Shorts und TikTok, jeweils mit **KI-Kennzeichnung** (`containsSyntheticMedia` / `is_aigc`).

Das fertige Video liegt außerdem 14 Tage lang als Artifact am Workflow-Run.

## Einrichtung

### 1. API-Keys
| Secret | Woher |
|---|---|
| `ANTHROPIC_API_KEY` | platform.claude.com → API Keys |
| `FAL_KEY` | fal.ai → Dashboard → Keys (Guthaben aufladen) |

### 2. YouTube
1. Google Cloud Console → neues Projekt → **YouTube Data API v3** aktivieren.
2. OAuth-Zustimmungsbildschirm einrichten (dich selbst als Testnutzer eintragen), dann OAuth-Client vom Typ **Desktop-App** anlegen.
3. Auf deinem Rechner: `pip install requests && python scripts/get_youtube_token.py <CLIENT_ID> <CLIENT_SECRET>` → mit dem Kanal-Account anmelden.
4. Secrets: `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`.

> ⚠️ Solange die OAuth-App im Modus „Testing“ ist, läuft der Refresh-Token nach 7 Tagen ab → App auf „In production“ stellen. Bei nicht verifizierten API-Projekten setzt YouTube Uploads automatisch auf **privat**, bis das Projekt den YouTube-API-Audit bestanden hat (Formular „YouTube API Services – Audit and Quota Extension“).

### 3. TikTok
1. developers.tiktok.com → App anlegen → Produkte **Login Kit** + **Content Posting API** (Direct Post aktivieren), Scopes `video.publish`, `video.upload`, Redirect-URI eintragen.
2. `python scripts/get_tiktok_token.py <CLIENT_KEY> <CLIENT_SECRET> <REDIRECT_URI>`
3. Secrets: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN`.

> ⚠️ Ohne bestandenen TikTok-Audit darf eine App **nur privat (`SELF_ONLY`) posten**. Audit beantragen und danach die Variable `TIKTOK_PRIVACY=PUBLIC_TO_EVERYONE` setzen. Der Refresh-Token gilt ca. 1 Jahr.

Fehlen die Secrets für eine Plattform, wird sie einfach übersprungen.

### 4. Optional: Variablen (Settings → Variables)
| Variable | Standard | Zweck |
|---|---|---|
| `CHANNEL_NICHE` | Brainrot-KI-Figuren | Stil/Nische des Kanals |
| `CONTENT_LANGUAGE` | English | Sprache von Titel & gesprochenem Text (z. B. `German`) |
| `FAL_MODEL` | `fal-ai/veo3/fast` | anderes fal-Videomodell (muss `prompt`, `aspect_ratio`, `duration`, `generate_audio` können) |
| `SCENES` | `2` | Anzahl 8-s-Clips pro Video |
| `YT_PRIVACY` | `public` | `public`/`unlisted`/`private` |
| `TIKTOK_PRIVACY` | `SELF_ONLY` | nach Audit `PUBLIC_TO_EVERYONE` |

### 5. Starten
- Der Zeitplan (`cron`) läuft **nur auf dem Standard-Branch** des Repos → Workflow dorthin mergen.
- Erst testen: Actions → *Daily AI Short* → *Run workflow* → `concept-only`, dann `no-upload`, dann `full`.

Lokal: `pip install -r requirements.txt` (plus ffmpeg), Keys als Umgebungsvariablen setzen, `python -m bot.main --no-upload`.

## Kosten (grob)
Pro Tag ein paar Cent für Claude + die Videogenerierung (bei Veo 3 der größte Posten, je nach Modell und Länge ca. 1–6 $ pro Video – aktuelle Preise auf fal.ai prüfen). `SCENES=1` halbiert die Videokosten.

## Regeln, die der Bot einhält
- Eigene Figuren statt Kopien fremder Creator-Charaktere; keine echten Personen, Marken oder geschützten Figuren.
- Jedes Video ist auf beiden Plattformen als KI-generiert gekennzeichnet.
