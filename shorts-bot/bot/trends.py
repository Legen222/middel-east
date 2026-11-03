"""Step 1+2: Claude researches today's trends on the web, then writes a concept."""
from __future__ import annotations

import datetime as dt

import anthropic
from pydantic import BaseModel, Field

from . import config

# Opt into server-side refusal fallbacks so a declined request is retried on
# another model instead of simply stopping.
FALLBACK_HEADERS = {"anthropic-beta": "server-side-fallback-2026-07-01"}
FALLBACK_BODY = {"fallbacks": "default"}


class Scene(BaseModel):
    video_prompt: str = Field(
        description="Self-contained text-to-video prompt for ONE ~8s vertical 9:16 clip. "
        "Describe the character, setting, camera, action, lighting and the spoken "
        "line/sound effects (the model generates audio). Repeat the full character "
        "description in every scene so it stays consistent."
    )


class Concept(BaseModel):
    trend: str = Field(description="Which current trend this video rides on and why")
    character_name: str
    title: str = Field(description="Catchy title, max 90 characters, no hashtags")
    description: str = Field(description="1-3 short sentences for the video description")
    hashtags: list[str] = Field(description="5-10 hashtags without the # sign")
    scenes: list[Scene]


def _client() -> anthropic.Anthropic:
    return anthropic.Anthropic()


def _check(message) -> None:
    if message.stop_reason == "refusal":
        raise RuntimeError(f"Claude declined: {message.stop_details}")


def research_trends() -> str:
    """Use Claude + web search to summarize what is trending today."""
    today = dt.date.today().isoformat()
    prompt = (
        f"Today is {today}. Research what is trending RIGHT NOW (last 7 days) in "
        "AI-generated short-form video on TikTok and YouTube Shorts, focused on this niche: "
        f"{config.CHANNEL_NICHE}.\n\n"
        "Find: viral AI character/meme formats, sounds or catchphrases, popular "
        "character names, visual styles, and hooks that get views. Prefer concrete, "
        "recent examples over general advice. Finish with a compact bullet summary "
        "of the 5 most promising formats to copy the *format* of (not specific creators' "
        "characters)."
    )
    with _client().messages.stream(
        model=config.CLAUDE_MODEL,
        max_tokens=32000,
        output_config={"effort": "medium"},
        tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 8}],
        messages=[{"role": "user", "content": prompt}],
        extra_headers=FALLBACK_HEADERS,
        extra_body=FALLBACK_BODY,
    ) as stream:
        message = stream.get_final_message()
    _check(message)
    text = "\n".join(b.text for b in message.content if b.type == "text").strip()
    if not text:
        raise RuntimeError(f"Trend research returned no text (stop_reason={message.stop_reason})")
    return text


def write_concept(trend_report: str, recent_titles: list[str]) -> Concept:
    """Turn the trend report into a concrete, original video concept."""
    recent = "\n".join(f"- {t}" for t in recent_titles[-30:]) or "(none yet)"
    prompt = (
        "You run a faceless channel that posts one AI-generated vertical short per day.\n"
        f"Niche: {config.CHANNEL_NICHE}\n"
        f"Language of title, description and spoken lines: {config.CONTENT_LANGUAGE}\n\n"
        f"Today's trend research:\n<trends>\n{trend_report}\n</trends>\n\n"
        f"Videos we already posted (do NOT repeat these characters/ideas):\n{recent}\n\n"
        f"Create today's video as exactly {config.SCENES} scenes that play back to back "
        "and form one mini-story with a strong hook in the first second and a punchline "
        "or loop at the end.\n"
        "Rules: invent an ORIGINAL character (ride the trend's format, don't copy an "
        "existing creator's character); no real people, celebrities, brands or "
        "copyrighted characters; nothing hateful, sexual or dangerous; family-friendly."
    )
    response = _client().messages.parse(
        model=config.CLAUDE_MODEL,
        max_tokens=16000,
        output_config={"effort": "medium"},
        messages=[{"role": "user", "content": prompt}],
        output_format=Concept,
        extra_headers=FALLBACK_HEADERS,
        extra_body=FALLBACK_BODY,
    )
    _check(response)
    concept = response.parsed_output
    if concept is None or not concept.scenes:
        raise RuntimeError("Claude returned no usable concept")
    concept.scenes = concept.scenes[: config.SCENES]
    concept.hashtags = [h.lstrip("#").replace(" ", "") for h in concept.hashtags if h.strip()]
    return concept
