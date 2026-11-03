"""Run ONCE on your own computer to get a YouTube refresh token.

  python scripts/get_youtube_token.py <CLIENT_ID> <CLIENT_SECRET>

Needs a Google Cloud OAuth client of type "Desktop app" with the
YouTube Data API v3 enabled. A browser opens; log in with the channel's account.
"""
import http.server
import sys
import urllib.parse
import webbrowser

import requests

PORT = 8765
REDIRECT = f"http://127.0.0.1:{PORT}"
SCOPE = "https://www.googleapis.com/auth/youtube.upload"


def main() -> None:
    client_id, client_secret = sys.argv[1], sys.argv[2]
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": REDIRECT, "response_type": "code",
        "scope": SCOPE, "access_type": "offline", "prompt": "consent",
    })
    code_box: dict = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            code_box["code"] = q.get("code", [None])[0]
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Done - you can close this tab.")

        def log_message(self, *a):
            pass

    print("Open this URL if the browser does not open:\n", url)
    webbrowser.open(url)
    http.server.HTTPServer(("127.0.0.1", PORT), Handler).handle_request()

    r = requests.post("https://oauth2.googleapis.com/token", data={
        "code": code_box["code"], "client_id": client_id, "client_secret": client_secret,
        "redirect_uri": REDIRECT, "grant_type": "authorization_code",
    }, timeout=30)
    r.raise_for_status()
    print("\nYT_REFRESH_TOKEN =", r.json()["refresh_token"])


if __name__ == "__main__":
    main()
