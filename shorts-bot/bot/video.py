"""Step 3: generate clips with a fal.ai video model and stitch them with ffmpeg."""
from __future__ import annotations

import subprocess
import time
from pathlib import Path

import requests

from . import config

QUEUE = "https://queue.fal.run"


def _headers() -> dict:
    if not config.FAL_KEY:
        raise RuntimeError("FAL_KEY is not set")
    return {"Authorization": f"Key {config.FAL_KEY}"}


def generate_clip(prompt: str, dest: Path, timeout_s: int = 900) -> Path:
    payload = {
        "prompt": prompt,
        "aspect_ratio": "9:16",
        "duration": config.CLIP_DURATION,
        "generate_audio": True,
    }
    r = requests.post(f"{QUEUE}/{config.FAL_MODEL}", json=payload, headers=_headers(), timeout=60)
    r.raise_for_status()
    job = r.json()
    status_url, response_url = job["status_url"], job["response_url"]

    deadline = time.time() + timeout_s
    while True:
        s = requests.get(status_url, headers=_headers(), timeout=60)
        s.raise_for_status()
        status = s.json().get("status")
        if status == "COMPLETED":
            break
        if status not in ("IN_QUEUE", "IN_PROGRESS"):
            raise RuntimeError(f"fal job failed: {s.text[:500]}")
        if time.time() > deadline:
            raise TimeoutError("fal video generation timed out")
        time.sleep(10)

    res = requests.get(response_url, headers=_headers(), timeout=60)
    res.raise_for_status()
    data = res.json()
    video_url = (data.get("video") or {}).get("url")
    if not video_url:
        raise RuntimeError(f"No video in fal response: {str(data)[:500]}")

    with requests.get(video_url, stream=True, timeout=300) as dl:
        dl.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in dl.iter_content(1 << 20):
                f.write(chunk)
    return dest


def stitch(clips: list[Path], dest: Path) -> Path:
    """Normalize every clip to 1080x1920/30fps and concatenate (with audio)."""
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    for c in clips:
        cmd += ["-i", str(c)]
    parts = []
    for i in range(len(clips)):
        parts.append(
            f"[{i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,"
            f"pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v{i}];"
            f"[{i}:a]aresample=44100,aformat=channel_layouts=stereo[a{i}];"
        )
    concat_inputs = "".join(f"[v{i}][a{i}]" for i in range(len(clips)))
    graph = "".join(parts) + f"{concat_inputs}concat=n={len(clips)}:v=1:a=1[v][a]"
    cmd += [
        "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(dest),
    ]
    subprocess.run(cmd, check=True)
    return dest


def make_video(prompts: list[str], workdir: Path) -> Path:
    workdir.mkdir(parents=True, exist_ok=True)
    clips = []
    for i, p in enumerate(prompts):
        print(f"  generating clip {i + 1}/{len(prompts)} with {config.FAL_MODEL} ...")
        clips.append(generate_clip(p, workdir / f"clip_{i}.mp4"))
    return stitch(clips, workdir / "final.mp4")
