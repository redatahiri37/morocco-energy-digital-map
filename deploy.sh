#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CANONICAL_HTML="$ROOT/index.html"
MIRROR_HTML="$ROOT/morocco-grid.html"
PUBLISH_HTML="$ROOT/morocco-grid/public/index.html"
EXISTING_TX="$ROOT/existingtransmissionlines.geojson"
FUTURE_TX="$ROOT/futuretransmissionlines.geojson"
PUBLISH_EXISTING_TX="$ROOT/morocco-grid/public/existingtransmissionlines.geojson"
PUBLISH_FUTURE_TX="$ROOT/morocco-grid/public/futuretransmissionlines.geojson"
DEPLOY_REPO="$ROOT/morocco-grid"

if [[ ! -f "$CANONICAL_HTML" ]]; then
  echo "Missing canonical app file: $CANONICAL_HTML" >&2
  exit 1
fi

echo "Syncing publish artifacts from root index.html..."
cp "$CANONICAL_HTML" "$MIRROR_HTML"
cp "$CANONICAL_HTML" "$PUBLISH_HTML"
cp "$EXISTING_TX" "$PUBLISH_EXISTING_TX"
cp "$FUTURE_TX" "$PUBLISH_FUTURE_TX"

echo ""
echo "Publish artifacts are up to date."
echo "Deployment repository: $DEPLOY_REPO"
echo ""
echo "Next steps:"
echo "1. cd \"$DEPLOY_REPO\""
echo "2. git status"
echo "3. git add public/index.html public/existingtransmissionlines.geojson public/futuretransmissionlines.geojson ../morocco-grid.html README.md"
echo "4. git commit -m \"Update MoroccoGrid\""
echo "5. git push"
echo ""
echo "GitHub Actions:"
echo "https://github.com/redatahiri37/morocco-grid/actions"
