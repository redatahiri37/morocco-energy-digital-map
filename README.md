# MoroccoGrid — Energy × Digital Infrastructure Map

Interactive intelligence map of Morocco's power grid, renewable generation,
industrial demand nodes, and digital infrastructure pipeline.

Live: https://redatahiri.github.io/morocco-grid/

---

## Project Layout

```
index.html          ← app entry (markup + CSS only)
js/
  layers.js         ← layer registry: single source of truth for all map layers
  map.js            ← Mapbox GL init, fetch loop, render engine, chart
  popups.js         ← info panel logic, confidence labeling
data/
  energy/           ← generation (solar/wind/thermal/hydro), grid, RE zones
  industrial/       ← OCP phosphate sites, cement plants
  digital/          ← data centers, submarine cables
  sources/          ← original shapefiles (reference only, not served)
editorial-system/   ← blog content pipeline (Platform 2)
scripts/            ← shapefile → GeoJSON conversion utilities
deploy.sh           ← push to GitHub Pages
context.md          ← project context and decisions log
```

## Adding a new layer

1. Create `data/<sector>/<layer_id>.geojson` with the standard schema
2. Add one entry to `js/layers.js` — file path, type, color, defaultOn
3. Done. No other files need editing.

## GeoJSON feature schema

Every feature must include:
- `id`, `name`, `layer`, `sector`, `subsector`
- `status` — `operational` | `under_construction` | `announced` | `planned`
- `source` — attribution string
- `coord_confidence` — `exact` | `approximate` | `centroid`
- `coord_method` — `satellite_verified` | `osm_derived` | `address_geocoded` | `manual_estimate`

## Deploy

```bash
./deploy.sh           # push main to origin → GitHub Pages serves from root
./deploy.sh --dry-run # verify files only
```

GitHub Pages config: Settings → Pages → Branch: `main` → Folder: `/`

## Stack

- **Map**: Mapbox GL JS 3.4 (token stored in localStorage)
- **Data**: GeoJSON, fetched at runtime via `fetch()`
- **Chart**: Chart.js 4.4
- **Icons**: Lucide
- No build step. Requires HTTP server (not `file://`) for `fetch()` to work locally.

Local dev:
```bash
python3 -m http.server 8080
# → http://localhost:8080
```
