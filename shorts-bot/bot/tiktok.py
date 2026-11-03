"""Step 4b: post to TikTok via the Content Posting API (Direct Post)."""
from __future__ import annotations

import time
from pathlib import Path

import requests

from . import config

API = "https://open.tiktokapis.com/v2"


def enabled() -> bool:
    return all([config.TIKTOK_CLIENT_KEY, config.TIKTOK_CLIENT_SECRET, config.TIKTOK_REFRESH_TOKEN])


def _access_token() -> str:
    r = requests.post(
        f"{API}/oauth/token/",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "client_key": config.TIKTOK_CLIENT_KEY,
            "client_secret": config.TIKTOK_CLIENT_SECRET,
            "grant_type": "refresh_token",
            "refresh_token": config.TIKTOK_REFRESH_TOKEN,
        },
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    if "access_token" not in data:
        raise RuntimeError(f"TikTok token refresh failed: {data}")
    if data.get("refresh_token") and data["refresh_token"] != config.TIKTOK_REFRESH_TOKEN:
        print("  ! TikTok issued a new refresh token - update the TIKTOK_REFRESH_TOKEN secret soon.")
    return data["access_token"]


def _post(token: str, path: str, body: dict) -> dict:
    r = requests.post(
        f"{API}{path}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=UTF-8"},
        json=body,
        timeout=60,
    )
    data = r.json()
    err = data.get("error", {})
    if r.status_code != 200 or err.get("code") not in (None, "ok"):
        raise RuntimeError(f"TikTok {path} failed: {data}")
    return data["data"]


def upload(video: Path, caption: str) -> str:
    token = _access_token()
    creator = _post(token, "/post/publish/creator_info/query/", {})
    privacy = config.TIKTOK_PRIVACY
    options = creator.get("privacy_level_options") or []
    if options and privacy not in options:
        print(f"  ! privacy {privacy} not allowed for this account/app, using {options[0]}")
        privacy = options[0]

    size = video.stat().st_size
    if size > 64 * 1024 * 1024:
        raise RuntimeError("Video > 64 MB; chunked upload not implemented")
    init = _post(
        token,
        "/post/publish/video/init/",
        {
            "post_info": {
                "title": caption[:2200],
                "privacy_level": privacy,
                "disable_duet": False,
                "disable_comment": False,
                "disable_stitch": False,
                "video_cover_timestamp_ms": 1000,
                "is_aigc": True,  # AI-generated content label
            },
            "source_info": {
                "source": "FILE_UPLOAD",
                "video_size": size,
                "chunk_size": size,
                "total_chunk_count": 1,
            },
        },
    )
    with open(video, "rb") as f:
        put = requests.put(
            init["upload_url"],
            headers={"Content-Type": "video/mp4", "Content-Range": f"bytes 0-{size - 1}/{size}"},
            data=f,
            timeout=900,
        )
    put.raise_for_status()

    publish_id = init["publish_id"]
    for _ in range(60):
        status = _post(token, "/post/publish/status/fetch/", {"publish_id": publish_id})
        state = status.get("status")
        if state == "PUBLISH_COMPLETE":
            return f"publish_id={publish_id} ({privacy})"
        if state == "FAILED":
            raise RuntimeError(f"TikTok publish failed: {status}")
        time.sleep(10)
    return f"publish_id={publish_id} (still processing)"
