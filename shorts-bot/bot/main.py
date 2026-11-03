"""Daily pipeline: trends -> concept -> video -> YouTube Shorts + TikTok.

Usage:
  python -m bot.main               # full run
  python -m bot.main --no-upload   # generate everything, upload nothing
  python -m bot.main --concept-only
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys

from . import config, tiktok, trends, video, youtube


def load_history() -> list[dict]:
    if config.HISTORY_FILE.exists():
        return json.loads(config.HISTORY_FILE.read_text())
    return []


def save_history(history: list[dict]) -> None:
    config.HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    config.HISTORY_FILE.write_text(json.dumps(history[-200:], indent=2, ensure_ascii=False) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-upload", action="store_true")
    ap.add_argument("--concept-only", action="store_true")
    args = ap.parse_args()

    today = dt.date.today().isoformat()
    out = config.OUT_DIR / today
    out.mkdir(parents=True, exist_ok=True)
    history = load_history()

    print("1/4 researching trends ...")
    report = trends.research_trends()
    (out / "trends.md").write_text(report)

    print("2/4 writing concept ...")
    concept = trends.write_concept(report, [h["title"] for h in history])
    (out / "concept.json").write_text(concept.model_dump_json(indent=2))
    print(f"  -> {concept.title}  [{concept.trend}]")
    if args.concept_only:
        return 0

    print("3/4 generating video ...")
    final = video.make_video([s.video_prompt for s in concept.scenes], out)
    print(f"  -> {final}")

    tags = concept.hashtags + ["AI", "AIgenerated"]
    hashtag_line = " ".join(f"#{t}" for t in dict.fromkeys(tags))
    entry = {"date": today, "title": concept.title, "character": concept.character_name,
             "trend": concept.trend, "uploads": {}}

    failures = 0
    if not args.no_upload:
        print("4/4 uploading ...")
        if youtube.enabled():
            try:
                entry["uploads"]["youtube"] = youtube.upload(
                    final, concept.title, f"{concept.description}\n\n{hashtag_line}", tags)
                print(f"  YouTube: {entry['uploads']['youtube']}")
            except Exception as e:  # keep going so TikTok still gets its post
                failures += 1
                print(f"  YouTube FAILED: {e}", file=sys.stderr)
        else:
            print("  YouTube skipped (secrets not set)")
        if tiktok.enabled():
            try:
                entry["uploads"]["tiktok"] = tiktok.upload(final, f"{concept.title} {hashtag_line}")
                print(f"  TikTok: {entry['uploads']['tiktok']}")
            except Exception as e:
                failures += 1
                print(f"  TikTok FAILED: {e}", file=sys.stderr)
        else:
            print("  TikTok skipped (secrets not set)")

    history.append(entry)
    save_history(history)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
