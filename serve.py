#!/usr/bin/env python3
"""BLOCKQUEST static server (python3 fallback) with a local /__update
endpoint that runs `git pull`. Equivalent to serve.mjs for machines
without Node.js."""
import json
import os
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

REPO = os.path.dirname(os.path.abspath(__file__))
PORT = 8044


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.join(REPO, "dist"), **kwargs)

    def do_POST(self):
        if self.path == "/__update":
            # custom header => cross-origin pages can't call this
            # (forces a CORS preflight we never answer)
            if self.headers.get("X-Requested-With") != "blockquest":
                self.send_response(403)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "output": "forbidden"}).encode())
                return
            try:
                proc = subprocess.run(
                    ["git", "pull"], cwd=REPO, capture_output=True, text=True, timeout=120
                )
                output = ((proc.stdout or "") + (proc.stderr or "")).strip()[:4000]
                ok = proc.returncode == 0
            except Exception as e:  # noqa: BLE001
                ok, output = False, str(e)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": ok, "output": output or "done"}).encode())
            return
        self.send_error(404)

    def log_message(self, fmt, *args):  # quieter logs
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"BLOCKQUEST running at http://localhost:{PORT}", file=sys.stderr)
    server.serve_forever()
