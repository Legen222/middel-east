"""Run ONCE to get a TikTok refresh token (valid ~365 days).

  python scripts/get_tiktok_token.py <CLIENT_KEY> <CLIENT_SECRET> <REDIRECT_URI>

REDIRECT_URI must exactly match one registered in your TikTok developer app
(Login Kit). After you approve in the browser, TikTok redirects to that URI;
copy the full URL from the address bar and paste it here.
"""
import secrets
import sys
import urllib.parse

import requests

SCOPES = "user.info.basic,video.publish,video.upload"


def main() -> None:
    key, secret, redirect = sys.argv[1], sys.argv[2], sys.argv[3]
    state = secrets.token_urlsafe(16)
    url = "https://www.tiktok.com/v2/auth/authorize/?" + urllib.parse.urlencode({
        "client_key": key, "scope": SCOPES, "response_type": "code",
        "redirect_uri": redirect, "state": state,
    })
    print("1) Open and approve:\n", url)
    pasted = input("\n2) Paste the full URL you were redirected to:\n> ").strip()
    q = urllib.parse.parse_qs(urllib.parse.urlparse(pasted).query)
    if q.get("state", [None])[0] != state:
        sys.exit("State mismatch - start again.")
    r = requests.post("https://open.tiktokapis.com/v2/oauth/token/", data={
        "client_key": key, "client_secret": secret, "code": q["code"][0],
        "grant_type": "authorization_code", "redirect_uri": redirect,
    }, headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=30)
    data = r.json()
    if "refresh_token" not in data:
        sys.exit(f"Failed: {data}")
    print("\nTIKTOK_REFRESH_TOKEN =", data["refresh_token"])


if __name__ == "__main__":
    main()
