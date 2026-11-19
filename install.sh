#!/usr/bin/env bash
# BLOCKQUEST installer — run once on any machine after cloning the repo.
# Builds the game (if Node is available and needed), then installs a desktop
# application entry with an icon. After this, launch BLOCKQUEST from your
# applications menu.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
DIR="$(pwd)"

echo "Installing BLOCKQUEST from: $DIR"

# --- 1. Ensure a game build exists -----------------------------------------
if [ ! -f dist/index.html ]; then
  if command -v node >/dev/null 2>&1; then
    echo "• No build found — building (one-time, needs Node.js)..."
    npm install --no-audit --no-fund
    npm run build
  else
    echo "ERROR: no dist/ build and no Node.js to build one."
    echo "Either install Node.js and re-run, or ask for a repo that ships dist/."
    exit 1
  fi
else
  echo "• Found existing game build (dist/)."
fi

# --- 2. Launcher executable --------------------------------------------------
chmod +x "$DIR/launch-blockquest.sh"

# --- 3. Pick a server engine -------------------------------------------------
if command -v node >/dev/null 2>&1; then
  echo "• Server engine: Node.js"
elif command -v python3 >/dev/null 2>&1; then
  echo "• Server engine: python3 (Node not found)"
else
  echo "ERROR: need either Node.js or python3 to serve the game."
  exit 1
fi

# --- 4. Desktop entry ---------------------------------------------------------
APP_DIR="$HOME/.local/share/applications"
mkdir -p "$APP_DIR"

ICON_LINE=""
[ -f "$DIR/icons/blockquest-icon.png" ] && ICON_LINE="Icon=$DIR/icons/blockquest-icon.png"

cat > "$APP_DIR/blockquest.desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=BLOCKQUEST
GenericName=Voxel Sandbox
Comment=Explore, build, and blow things up in a blocky world
Exec=$DIR/launch-blockquest.sh
$ICON_LINE
Terminal=false
Categories=Game;AdventureGame;
StartupNotify=true
EOF

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APP_DIR" || true

echo ""
echo "✓ Installed! Look for BLOCKQUEST in your applications menu."
echo "  (The game runs at http://localhost:8044 whenever the icon is clicked.)"
