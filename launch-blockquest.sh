#!/usr/bin/env bash
# BLOCKQUEST launcher: starts the local game server (if not already running)
# and opens the game in the default browser.
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8044
URL="http://localhost:$PORT"
LOG="/tmp/blockquest-server.log"

already_running() { curl -s -o /dev/null --max-time 1 "$URL"; }

if ! already_running; then
  if [ ! -f "$DIR/dist/index.html" ]; then
    echo "BLOCKQUEST: no game build found. Run ./install.sh in the repo first." >&2
    exit 1
  fi

  if command -v node >/dev/null 2>&1; then
    nohup node "$DIR/serve.mjs" > "$LOG" 2>&1 &
  elif command -v python3 >/dev/null 2>&1; then
    ( cd "$DIR" && nohup python3 serve.py > "$LOG" 2>&1 & )
  else
    echo "BLOCKQUEST: need Node.js or python3 to run the game server." >&2
    exit 1
  fi
  disown 2>/dev/null || true

  # wait until it responds (max ~5s)
  for _ in $(seq 1 50); do
    already_running && break
    sleep 0.1
  done
fi

if [ "${1:-}" != "--no-browser" ]; then
  xdg-open "$URL" >/dev/null 2>&1 &
fi
