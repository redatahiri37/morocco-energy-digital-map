# ASSUMPTIONS — Morocco Infrastructure Map v1.0

*Written before any code. Documents the decisions, shortcuts, and known
limits so future-me (and any reviewer) can separate what was measured
from what was asserted.*

Date: 2026-04-17
Scope: Morocco only. Structured for MENA scaling in later versions.

---

## 1. Data sourcing — "curated GeoJSON" rather than live pipelines

The spec calls for datasets from GEM (CSV), Overpass (live query),
Global Solar Atlas (API), and datacentermap.com (scrape / manual).
For v1.0 I am **not** building download/transform pipelines. Instead,
every GeoJSON in `/docs/data/morocco/` is **hand-curated from public
sources** and committed as a static file.

Why:
- A single HTML/CSS/JS repo has no ETL layer. Running Overpass or GEM
  exports inline would force a build step.
- The v1 goal is a credible, shippable map, not a data platform.
- Each feature in each GeoJSON carries `source` and `source_url`
  properties so provenance is still inspectable.

Consequence: every entry has a name, a coordinate, a capacity, and a
link to where it came from, but the list is **not exhaustive**. Roughly
the top 10–15 items per layer.

A v1.1 task is to replace each hand-curated file with a script
(`/tools/fetch_*.{py,sh}`) that regenerates it from the primary source.
That is tracked at the bottom of this file.

## 2. Coordinate accuracy

- Power plants: coordinates are taken from OSM / GEM / operator sites.
  Accuracy ~100–500 m. Fine for a country-level map.
- Transmission lines: approximate 400 kV / 225 kV backbone corridors,
  traced from ONEE network maps and OSM. **Not a substitute for a
  real grid-operator shapefile.** Intended to convey topology, not
  routing.
- Industrial sites: plant-centroid coordinates, not fence-line polygons.
- Data centers: announced projects may not yet have a built address;
  coordinates are city-level where no site has been confirmed.

Every line/marker that is **approximate** is tagged
`"precision": "approximate"` in the GeoJSON so the UI can surface it.

## 3. Capacity and demand numbers

- Generation capacities: nameplate in MW, from operator press releases
  or GEM. No capacity-factor adjustment applied.
- Industrial demand: `estimated_demand_mw` is a **rough public-source
  estimate**, not an audited figure. Tooltip flags it as "estimate".
- Data centers: `capacity_estimate_mw` refers to announced total IT
  load, not currently energised capacity. Reality for "announced"
  projects is usually a fraction of headline.

## 4. Layer 5 — renewable potential

Deferred to v1.1. Global Solar Atlas and Global Wind Atlas both require
either tile-server integration or an API key flow. Out of scope for a
static-hosted, token-only v1. Tracked as an explicit gap.

## 5. Scalability — the MENA argument

The architectural bet: adding a country = drop in one GeoJSON folder
and one entry in `countries.config.js`. No code change.

To hold that line:
- Layer logic is data-driven. `app.js` reads a layer manifest; it does
  not hard-code "Morocco" anywhere except as the default country.
- Data lives under `./data/<country>/` so the path is a template.
- Styling is by `properties.type` and `properties.fuel_type`, not by
  file name.

Countries already reserved as config stubs: Egypt, Senegal, Namibia.
No data for them in v1 — they will no-op until files are dropped in.

## 6. Token handling

- `config.js` holds the Mapbox token and is gitignored.
- `config.example.js` is committed as a template.
- README instructs each contributor to create their own token.
- After deploy, the user restricts the production token by URL in the
  Mapbox dashboard. Nothing automated here — it is a manual step
  called out in the README.

**Important for Claude Code**: I will **not** auto-commit a
`config.js` file. If one exists, `.gitignore` excludes it. I verify by
running `git status` after staging.

## 7. Fallback rendering

If `mapboxgl` fails to load (token missing, quota, network), the page
must still render the left panel, the bottom bar, and a "Map
unavailable — paste your token" card. The KPIs and the methodology
panel are not map-dependent.

The MapLibre + OpenFreeMap fallback mentioned in the spec is **not
wired as an auto-failover in v1**. It is documented as a v1.1 path.
Why: two map engines in the same page doubles bundle size and state
management for a case (Mapbox quota exhaustion) that is unlikely at
v1 traffic.

## 8. Transparency UX — learning from Pawel Czyzak

Explicit pattern from his Data Center Siting Tool:
- Every layer has a data source shown in the left panel and linked in
  every tooltip.
- A "methodology" expandable section lists assumptions plainly.
- A "known gaps" section is its own UI element, not a footnote.
- Error reporting is a one-click `mailto:` — low friction, signals
  "this is a living document".

All four patterns are in v1.

## 9. What is *not* in v1.0 (explicit non-goals)

- No user accounts, no contributed data, no moderation pipeline.
- No cross-country view yet — the URL is hard-coded to Morocco.
- No time-series / commissioning timeline.
- No 3D or Deck.gl layers.
- No scoring index ("grid-suitability 1-5" — Pawel's core feature).
  That is v2. v1 is a map; v2 is a tool.

## 10. Operational posture for this build

- Repo does not yet exist on GitHub. I will build the folder locally
  in `morocco-map/` under this worktree. Creating the public repo,
  pushing, and enabling GitHub Pages are separate steps that the
  user will trigger explicitly — I will not push to a remote I
  didn't create.
- All file paths in the code are relative so the `docs/` folder is
  portable to any `morocco-energy-digital-map` repo under GitHub
  Pages `/docs` config.

---

## v1.1 backlog surfaced by these assumptions

- [ ] `tools/fetch_gem.py` — regenerate `power-plants.geojson` from GEM CSV
- [ ] `tools/fetch_overpass.sh` — regenerate `grid-lines.geojson` via Overpass
- [ ] Layer 5 — solar/wind irradiation raster via GSA tiles
- [ ] MapLibre + OpenFreeMap fallback engine
- [ ] Grid-suitability index (Pawel-style 1–5 score) for siting DCs
- [ ] Egypt, Senegal, Namibia data folders
