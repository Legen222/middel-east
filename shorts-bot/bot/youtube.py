"""Step 4a: upload to YouTube (Shorts = vertical video <= 3 min)."""
from __future__ import annotations

from pathlib import Path

import requests

from . import config

TOKEN_URL = "https://oauth2.googleapis.com/token"
UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"


def _access_token() -> str:
    r = requests.post(
        TOKEN_URL,
        data={
            "client_id": config.YT_CLIENT_ID,
            "client_secret": config.YT_CLIENT_SECRET,
            "refresh_token": config.YT_REFRESH_TOKEN,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def enabled() -> bool:
    return all([config.YT_CLIENT_ID, config.YT_CLIENT_SECRET, config.YT_REFRESH_TOKEN])


def upload(video: Path, title: str, description: str, tags: list[str]) -> str:
    token = _access_token()
    size = video.stat().st_size
    metadata = {
        "snippet": {
            "title": f"{title} #Shorts"[:100],
            "description": description,
            "tags": tags[:15],
            "categoryId": "23",  # Comedy
        },
        "status": {
            "privacyStatus": config.YT_PRIVACY,
            "selfDeclaredMadeForKids": False,
            "containsSyntheticMedia": True,  # required disclosure for realistic AI content
        },
    }
    init = requests.post(
        UPLOAD_URL,
        params={"uploadType": "resumable", "part": "snippet,status"},
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "video/mp4",
            "X-Upload-Content-Length": str(size),
        },
        json=metadata,
        timeout=60,
    )
    init.raise_for_status()
    with open(video, "rb") as f:
        put = requests.put(
            init.headers["Location"],
            headers={"Authorization": f"Bearer {token}", "Content-Type": "video/mp4"},
            data=f,
            timeout=900,
        )
    put.raise_for_status()
    video_id = put.json()["id"]
    return f"https://youtube.com/shorts/{video_id}"
