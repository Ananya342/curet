#!/usr/bin/env bash
# One-click dev loop: start Vite and open Curet's panel in mock mode.
# The real Tauri app can't build on Linux (no Rust toolchain, no webkit2gtk-4.1),
# so this launches the browser-based mock instead. See README "Develop".
set -euo pipefail
cd "$(dirname "$0")/.."

# Vite 8 needs node ^20.19 || >=22.12; on older node it dies with an opaque
# "does not provide an export named 'styleText'" from rolldown. Say so plainly.
major=$(node -p "process.versions.node.split('.')[0]")
minor=$(node -p "process.versions.node.split('.')[1]")
if [ "$major" -lt 20 ] || { [ "$major" -eq 20 ] && [ "$minor" -lt 19 ]; } || { [ "$major" -eq 21 ]; }; then
  echo "Curet dev needs Node >= 20.19 (or >= 22.12). You have $(node -v)."
  echo "Install one without touching the system node:"
  echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  echo "  exec \$SHELL && nvm install 22 && nvm alias default 22"
  read -rp "Press Enter to close… " _
  exit 1
fi

(sleep 4 && xdg-open "http://localhost:1420/?mock#/panel" >/dev/null 2>&1) &
exec npm run dev
