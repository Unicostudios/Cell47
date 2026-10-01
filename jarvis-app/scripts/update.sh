#!/bin/bash
# Updates Jarvis from a downloaded ZIP of the repo, rebuilds the app and installs it.
#   bash ~/Downloads/Cell47-claude-fitbit-sense-clock-face-k7b4i1/jarvis-app/scripts/update.sh
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Cell47/jarvis-app"

step() { printf "\n\033[1m%s\033[0m\n" "$1"; }
die() { printf "\n\033[31m✗ %s\033[0m\n" "$1"; exit 1; }

step "1/5  Quitting Jarvis"
osascript -e 'quit app "Jarvis"' >/dev/null 2>&1 || true
pkill -x Jarvis >/dev/null 2>&1 || true
sleep 1

step "2/5  Copying the new files to $DEST"
mkdir -p "$DEST"
if [ "$SRC" != "$DEST" ]; then
  rsync -a --delete --exclude node_modules --exclude models --exclude dist "$SRC/" "$DEST/" || die "Couldn't copy the files."
fi
cd "$DEST"

step "3/5  Installing (downloads the voice models the first time, ~650 MB)"
npm install || die "npm install failed — scroll up for the reason, or send it to Claude."

step "4/5  Building and installing Jarvis.app"
MODELS="$HOME/Library/Application Support/Jarvis/models"
mkdir -p "$MODELS"
rsync -a --delete "$DEST/models/" "$MODELS/" || die "Couldn't copy the voice models."
npm run app || die "The build failed — scroll up for the reason, or send it to Claude."
rm -rf /Applications/Jarvis.app
cp -R dist/mac-arm64/Jarvis.app /Applications/ || die "Couldn't copy Jarvis.app into Applications."
touch /Applications/Jarvis.app
killall Dock >/dev/null 2>&1 || true   # refresh the Dock icon

step "5/5  Checking everything"
npm run doctor || printf "\n(The check above found a problem — send a screenshot of it to Claude.)\n"
open /Applications/Jarvis.app

printf "\n\033[32m✓ Jarvis $(node -p "require('./package.json').version") is installed and open.\033[0m\n\n"
