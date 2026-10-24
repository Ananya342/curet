#!/usr/bin/env bash
# Preview the download page locally. Plain static files, so this needs nothing
# but python3 — no npm, no Netlify CLI, no build step.
#
#   ./scripts/site-serve.sh          -> http://localhost:8080
#   ./scripts/site-serve.sh 3000     -> http://localhost:3000
#
# Edit site/index.html or site/style.css and just refresh the browser.
# Ctrl-C to stop.
set -euo pipefail

PORT="${1:-8080}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)/site"

if [ ! -f "$ROOT/index.html" ]; then
  echo "No site/index.html found at $ROOT" >&2
  exit 1
fi

URL="http://localhost:$PORT"
echo "Serving $ROOT"
echo "  -> $URL"
echo "  Ctrl-C to stop."
echo

# Open a browser once the server is actually accepting connections.
( for _ in $(seq 1 40); do
    if (exec 3<>/dev/tcp/127.0.0.1/"$PORT") 2>/dev/null; then
      exec 3<&- 2>/dev/null || true
      xdg-open "$URL" >/dev/null 2>&1 || true
      break
    fi
    sleep 0.25
  done ) &

exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT"
