"""All settings come from environment variables (GitHub Actions secrets/vars)."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "out"
HISTORY_FILE = ROOT / "state" / "history.json"


def env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or default


# --- Claude (trend research + concept) ---
CLAUDE_MODEL = env("CLAUDE_MODEL", "claude-opus-5-5")
# Free-text steering for the channel's style, e.g. "Italian brainrot creatures, absurd humor"
CHANNEL_NICHE = env(
    "CHANNEL_NICHE",
    "absurd AI-generated brainrot characters (in the style of the Italian brainrot "
    "meme wave and similar viral AI character trends), short, loud, funny, loopable",
)
CONTENT_LANGUAGE = env("CONTENT_LANGUAGE", "English")

# --- Video generation (fal.ai queue API) ---
FAL_KEY = env("FAL_KEY")
FAL_MODEL = env("FAL_MODEL", "fal-ai/veo3/fast")
SCENES = int(env("SCENES", "2"))  # number of clips stitched together
CLIP_DURATION = env("CLIP_DURATION", "8s")

# --- YouTube ---
YT_CLIENT_ID = env("YT_CLIENT_ID")
YT_CLIENT_SECRET = env("YT_CLIENT_SECRET")
YT_REFRESH_TOKEN = env("YT_REFRESH_TOKEN")
YT_PRIVACY = env("YT_PRIVACY", "public")  # public | unlisted | private

# --- TikTok ---
TIKTOK_CLIENT_KEY = env("TIKTOK_CLIENT_KEY")
TIKTOK_CLIENT_SECRET = env("TIKTOK_CLIENT_SECRET")
TIKTOK_REFRESH_TOKEN = env("TIKTOK_REFRESH_TOKEN")
# Unaudited TikTok apps may only post SELF_ONLY (private). Switch to
# PUBLIC_TO_EVERYONE after TikTok approves your app's audit.
TIKTOK_PRIVACY = env("TIKTOK_PRIVACY", "SELF_ONLY")
