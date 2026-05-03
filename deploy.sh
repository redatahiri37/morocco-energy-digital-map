#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "── MoroccoGrid deploy sanity check ──"

# Sanity: required entry files
for f in "$ROOT/index.html" "$ROOT/js/map.js" "$ROOT/js/layers.js" "$ROOT/js/popups.js"; do
  if [[ ! -f "$f" ]]; then
    echo "MISSING: $f" >&2
    exit 1
  fi
  echo "  ok  $f"
done

# Sanity: count GeoJSON data files (excluding raw sources/)
GEOJSON_COUNT=$(find "$ROOT/data" -name "*.geojson" ! -path "*/sources/*" | wc -l | tr -d ' ')
echo "  ok  data/ — $GEOJSON_COUNT GeoJSON files"

if [[ $GEOJSON_COUNT -lt 8 ]]; then
  echo "WARNING: expected ≥8 GeoJSON files, found $GEOJSON_COUNT" >&2
fi

echo ""
echo "Pushing to GitHub Pages (main branch)..."
git -C "$ROOT" add -A
git -C "$ROOT" commit -m "Deploy: update MoroccoGrid $(date +%Y-%m-%d)" || echo "(nothing new to commit)"
git -C "$ROOT" push origin main

echo ""
echo "Done. Live at: https://redatahiri.github.io/morocco-grid/"
