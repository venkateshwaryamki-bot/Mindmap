#!/bin/bash
# MindFlow for macOS / Linux: double-click (macOS) or run ./start-mindflow.command
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org and run this again."
  (open https://nodejs.org 2>/dev/null || xdg-open https://nodejs.org 2>/dev/null) &
  read -r -p "Press Enter to close"
  exit 1
fi
[ -d node_modules ] || { echo "Installing MindFlow - first run only, this takes a minute..."; npm install; }
[ -f .env ] || cp .env.example .env
echo
echo "Starting MindFlow. Keep this window open while you use it."
echo "Your browser will open at http://localhost:8787"
echo "To use MindFlow on your phone, open the \"On your Wi-Fi\" address shown below."
echo
( sleep 8; open http://localhost:8787 2>/dev/null || xdg-open http://localhost:8787 2>/dev/null ) &
npm run app
