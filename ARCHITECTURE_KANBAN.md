# Architecture Kanban — Daily Routine

## Goal

Each working day, surface **one** architecture improvement worth doing today.
Not a big refactor — a 30–90 min change that increases code clarity, data
quality, or deploy safety. Compounds over time.

## The board

Three columns: **Backlog** → **Today** → **Done**.
The whole thing lives in `ARCHITECTURE_BACKLOG.md` (markdown checklist).

Each card has:

```
- [ ] <imperative title>
  • why: <1 sentence — what problem does this solve>
  • effort: S (≤30min) / M (1–2h) / L (half-day)
  • impact: 1–5 (1 = nice-to-have, 5 = unblocks new capability)
  • files: <paths likely to change>
  • verify: <how to know it's done>
```

## The daily routine (10 minutes)

A scheduled task at **08:30 Paris time, Mon–Fri** runs an `architect` subagent:

1. **Inventory drift detection** — git log since yesterday, count features
   per GeoJSON, check for orphan files / dead imports, scan for inline data
   that should be in registry, list TODO/FIXME comments added.
2. **Score backlog cards** by `impact × urgency / effort`. Urgency increases
   for cards that block other cards (dependencies tracked in card body).
3. **Pick the top 1** card, move to "Today" column.
4. **Brief**: post a 5-line summary in the chat / a daily note —
   "today's pick + why + verification step".
5. End of day check: if "Today" card not closed, it stays; if closed,
   move to Done with the commit SHA.

## Prioritization framework

Three lenses, applied in this order:

| Lens | Question |
|---|---|
| **Foundation** | Will this break if we add a 2nd country? (Egypt next) |
| **Truth** | Does the map show what the data actually says? (data lineage, sources cited, confidence visible) |
| **Speed** | Can a new GeoJSON file be added in <5 min, end-to-end? |

A card scoring high on all three is a "5" impact. A card scoring on only
one is a "2-3".

## Pre-seeded backlog (for THIS project, today)

Cards I'd put on the board immediately:

```
Foundation
- [ ] Move src-grid line layers to a per-id source naming scheme
  • why: v1.6 has a bug — calling buildLineLayer twice clobbers src-grid.
    interconnectors and planned-corridors share the same source/layer IDs.
  • impact: 4 (silent data loss, hard to debug)
  • effort: M (1–2h)
  • files: docs/app.js (buildLineLayer)
  • verify: both interconnectors AND planned-corridors render simultaneously

- [ ] Externalize per-country layer config to JSON (not JS)
  • why: countries.config.js mixes config and code. JSON enables non-dev
    contributors and runtime overrides.
  • impact: 3
  • effort: M
  • files: docs/countries.config.js → docs/config/morocco.json + loader
  • verify: page boots identically with config loaded via fetch

- [ ] Add a /docs/data/_schema/feature.schema.json + CI validator
  • why: 6 GeoJSON files, no schema enforcement. One bad commit silently
    breaks the popup.
  • impact: 4
  • effort: M
  • files: new docs/data/_schema/, scripts/validate-geojson.py
  • verify: pre-commit hook fails when status="under_construction" sneaks in

Truth
- [ ] Add data-quality flag per asset (verified / estimated / planned)
  • why: 22 of 42 power plants are "approximate" or "centroid". Users
    need to see which dots are exact vs estimates. Extends beyond
    coord_confidence to cover status and source reliability.
  • impact: 4
  • effort: S–M
  • files: docs/app.js (buildPowerLayer paint expressions), GeoJSON schemas
  • verify: hover a "centroid" plant → marker has dashed ring;
    popup shows "Estimated" badge

- [ ] Add per-feature provenance in popups (source, last updated, confidence)
  • why: source attribution in detail panel is text-only. Popups must
    show clickable source_url, last-updated date, and confidence level
    for full auditability.
  • impact: 4
  • effort: S–M
  • files: docs/app.js (renderDetailPanel)
  • verify: click any feature → popup shows clickable source link +
    "last updated" date + confidence badge

- [ ] Surface per-layer "last refreshed" date in the layer panel
  • why: top bar says "v1.0", but layers were last updated at different
    times. Users need per-layer freshness, not a global version stamp.
  • impact: 2
  • effort: S
  • files: docs/app.js (buildLayerList rendering)
  • verify: each layer toggle shows "Updated: 2026-MM-DD"

Speed
- [ ] One-command country bootstrap script
  • why: adding Egypt today requires touching 4 files. Should be 1 cmd.
  • impact: 5 (unblocks roadmap)
  • effort: M
  • files: scripts/new-country.sh, docs/config/_template/
  • verify: ./scripts/new-country.sh egypt EG → Egypt placeholder renders

- [ ] Pre-build power-plants.geojson on commit, not at runtime
  • why: build-power-plants.py runs manually. Should run in pre-commit
    so docs/data/ is always in sync with data/energy/*.
  • impact: 3
  • effort: S
  • files: .pre-commit-config.yaml + hook script
  • verify: edit gen_solar.geojson → commit → docs/data is auto-updated

- [ ] Replace the boundary.geojson manual dissolve with a build step
  • why: scripts/build-transmission-geojson.py companion pass is referenced
    in code comments but doesn't exist in the repo.
  • impact: 2
  • effort: M

Reliability & Resilience
- [ ] Implement basemap fallback chain (CARTO → OSM → Stadia → self-hosted PMTiles)
  • why: single-provider basemap is a SPOF. If Mapbox/CARTO goes down,
    map is blank.
  • impact: 3
  • effort: M
  • files: docs/app.js (map init), docs/config/
  • verify: block primary tile URL → map auto-falls back to next provider

- [ ] Add retry logic with exponential backoff for tile loading
  • why: transient network errors cause blank tiles with no recovery.
  • impact: 2
  • effort: S
  • files: docs/app.js (tile error handler)
  • verify: simulate tile 503 → tiles retry and load after delay

- [ ] Add service worker for offline tile + GeoJSON caching
  • why: field users in Morocco may have spotty connectivity. Cached
    layers keep the map usable offline.
  • impact: 3
  • effort: L
  • files: docs/sw.js (new), docs/index.html (registration)
  • verify: load map online → go offline → map still renders cached layers
    with "offline mode" indicator

Information Design
- [ ] Split left rail into collapsible accordion sections
  • why: layer list is flat and growing. Grouping by Generation /
    Transmission / Demand / Projects improves scannability.
  • impact: 3
  • effort: M
  • files: docs/app.js (buildLayerList), docs/style.css
  • verify: each section collapses/expands independently

- [ ] Move KPIs to a top dashboard strip (total capacity, active projects, etc.)
  • why: key numbers are buried. A persistent top bar gives instant
    context before any interaction.
  • impact: 3
  • effort: M
  • files: docs/app.js (new KPI bar component), docs/style.css
  • verify: top strip shows total MW, project count, updates live with filters

- [ ] Add inline bubble-size legend for capacity encoding
  • why: marker sizes encode capacity but there's no legend.
    Users can't decode what "big" vs "small" means.
  • impact: 2
  • effort: S
  • files: docs/app.js (legend component)
  • verify: legend shows 2–3 reference dots with MW labels

- [ ] Add "X of Y visible" counter after filters
  • why: after filtering, users have no feedback on how many features
    are hidden vs shown.
  • impact: 2
  • effort: S
  • files: docs/app.js (filter UI)
  • verify: toggle a layer off → counter updates "12 of 42 visible"

Interaction & Filtering
- [ ] Add capacity range slider filter
  • why: no way to filter out small plants or focus on large ones.
  • impact: 3
  • effort: M
  • files: docs/app.js (filter panel), docs/style.css
  • verify: drag slider → only plants within range visible on map

- [ ] Add fuel-type multi-select filter (Solar, Wind, Gas, Coal, Hydro, etc.)
  • why: users exploring renewables can't isolate solar vs wind vs gas.
  • impact: 4
  • effort: M
  • files: docs/app.js (filter panel)
  • verify: select "Solar" + "Wind" → only those fuel types shown

- [ ] Add project status filter (Operational / Under Construction / Planned)
  • why: mixing all statuses makes the map noisy. Users want to see
    only the pipeline, or only operational assets.
  • impact: 3
  • effort: S
  • files: docs/app.js (filter panel)
  • verify: select "Planned" → only planned projects shown

- [ ] Add click-to-inspect detail panel (capacity, operator, COD, source, status)
  • why: current popups are minimal. A proper side panel gives room
    for rich per-asset details.
  • impact: 4
  • effort: M
  • files: docs/app.js (renderDetailPanel), docs/style.css
  • verify: click a plant → right panel slides in with full details

- [ ] Add search box with autocomplete (by project name, location, operator)
  • why: no way to find a specific project without panning and scanning.
  • impact: 3
  • effort: M
  • files: docs/app.js (search component)
  • verify: type "Noor" → autocomplete shows Noor Ouarzazate → click flies to it

- [ ] Implement URL-state sync (#lng/lat/zoom&layers=pg,dc&fuel=solar)
  • why: map state is ephemeral. Users can't bookmark or share a
    specific filtered view.
  • impact: 3
  • effort: M
  • files: docs/app.js (URL hash read/write)
  • verify: apply filters → URL updates → paste URL in new tab → same view

- [ ] Add "share this view" button (copy URL to clipboard)
  • why: completes the URL-state sync story for non-technical users.
  • impact: 2
  • effort: S (depends on URL-state sync)
  • files: docs/app.js (share button component)
  • verify: click share → URL copied → paste in new tab → same view

Analytical Value
- [ ] Add stacked bar chart of installed capacity by fuel type
  • why: map shows spatial distribution but not aggregate mix.
    A small chart panel gives the macro picture.
  • impact: 3
  • effort: M
  • files: docs/app.js (chart panel, likely Chart.js or recharts)
  • verify: chart renders with correct MW totals per fuel type

- [ ] Add donut chart of data center capacity by provider
  • why: DC layer has no aggregate view. Users can't see market share.
  • impact: 2
  • effort: S
  • files: docs/app.js (chart panel)
  • verify: donut shows MW or rack count per provider

- [ ] Add compare mode: 2026 current vs 2030 pipeline split-screen
  • why: the project's value proposition is "where is Morocco heading?"
    Side-by-side comparison makes the story visual.
  • impact: 4
  • effort: L
  • files: docs/app.js (split-screen map component)
  • verify: toggle compare → two synced maps, left=operational, right=planned

- [ ] Add time slider for transmission/HVDC projects by commissioning year
  • why: Xlinks and interconnectors have distinct timelines. A slider
    lets users scrub through the build-out sequence.
  • impact: 3
  • effort: M
  • files: docs/app.js (time slider component)
  • verify: drag slider to 2028 → only projects commissioned by then visible

Cartography
- [ ] Switch basemap to dark-matter-nolabels + selective city labels (>100k pop)
  • why: current basemap competes visually with data layers.
    Dark basemap + minimal labels improves data-layer contrast.
  • impact: 3
  • effort: S
  • files: docs/app.js (map style URL), city-labels layer
  • verify: basemap is dark, only major cities labeled, data pops

- [ ] Add actual submarine cable polylines (not just landing points)
  • why: landing-point dots don't convey cable routing or connectivity.
    Polylines show the infrastructure story.
  • impact: 3
  • effort: M
  • files: docs/data/submarine-cables.geojson (new), docs/app.js
  • verify: cables render as lines from Morocco to Europe/other continents

- [ ] Cluster power-generation points at low zoom levels
  • why: 42+ overlapping markers at country zoom are unreadable.
    Clustering with count badges solves this.
  • impact: 3
  • effort: M
  • files: docs/app.js (Mapbox cluster source config)
  • verify: zoom out → markers merge into numbered clusters → zoom in → expand

- [ ] Add neighboring-country context (fade at high zoom)
  • why: Morocco in isolation lacks geographic context. Showing faded
    neighbors at low zoom helps orientation.
  • impact: 2
  • effort: S
  • files: docs/data/neighbors.geojson (new), docs/app.js
  • verify: low zoom shows Spain/Algeria/Mauritania faded → high zoom fades out

Trust & Methodology
- [ ] Add methodology page/modal (data sources, update frequency, coverage)
  • why: no documentation of how data was collected, how often it's
    updated, or what's included/excluded. Breaks credibility.
  • impact: 3
  • effort: M
  • files: docs/methodology.html or modal component
  • verify: "About the data" link opens methodology explanation

- [ ] Add "report an error" link on each feature popup
  • why: crowd-sourced corrections are the only scalable way to fix
    bad data. No mechanism exists today.
  • impact: 3
  • effort: S
  • files: docs/app.js (popup template)
  • verify: popup shows "Report error" → opens pre-filled form/email

- [ ] Add dataset version history / changelog
  • why: users returning to the map can't tell what changed since
    their last visit.
  • impact: 2
  • effort: S
  • files: docs/CHANGELOG.md, link in UI footer
  • verify: changelog link shows dated list of dataset updates

Performance
- [ ] Convert GeoJSON to vector tiles (tippecanoe → PMTiles) for >500 features
  • why: GeoJSON fetch-all-at-once won't scale past a few hundred
    features. Vector tiles stream only what's in viewport.
  • impact: 4 (unblocks Egypt + data expansion)
  • effort: L
  • files: scripts/build-pmtiles.sh (new), docs/app.js (source swap)
  • verify: 500+ feature layer loads fast, no full GeoJSON fetch

- [ ] Lazy-load OpenInfraMap tiles only above zoom level 10
  • why: OIM tiles at low zoom are noisy and expensive. Load them
    only when zoomed in enough to be useful.
  • impact: 3
  • effort: S
  • files: docs/app.js (OIM layer minzoom config)
  • verify: zoom <10 → no OIM request; zoom >10 → OIM loads

- [ ] Add loading skeleton/placeholder for layer panels
  • why: layer panel appears empty while data loads, looks broken.
  • impact: 2
  • effort: S
  • files: docs/app.js (layer panel), docs/style.css
  • verify: on slow connection, skeleton pulses until data arrives

Accessibility
- [ ] Add keyboard navigation for layer toggles (Tab + Space/Enter)
  • why: layer toggles are mouse-only. Keyboard users can't operate them.
  • impact: 3
  • effort: S
  • files: docs/app.js (layer toggle), docs/style.css (:focus-visible)
  • verify: Tab to toggle → Space activates → focus ring visible

- [ ] Add ARIA labels to all status dots and icons
  • why: screen readers can't interpret icon-only UI elements.
  • impact: 3
  • effort: S
  • files: docs/app.js (all icon/dot rendering)
  • verify: VoiceOver reads "Solar, operational, 200 MW" not just ""

- [ ] Ensure color-blind friendly palette (add pattern overlays)
  • why: fuel-type colors alone are indistinguishable for ~8% of men.
    Pattern fills or shape variations are needed.
  • impact: 3
  • effort: M
  • files: docs/app.js (marker styles), docs/style.css
  • verify: simulate deuteranopia → all fuel types still distinguishable

Editorial & Sharing
- [ ] Add full-screen mode button
  • why: embedded or laptop users want more map real estate.
  • impact: 2
  • effort: S
  • files: docs/app.js (fullscreen toggle), docs/style.css
  • verify: click button → map goes fullscreen → click again → exits

- [ ] Add mobile-responsive layout (bottom sheet for filters)
  • why: left rail doesn't work on phones. Filters need a bottom
    sheet pattern on small screens.
  • impact: 3
  • effort: M
  • files: docs/style.css (media queries), docs/app.js
  • verify: resize to 375px → filters move to swipeable bottom sheet

- [ ] Add "embed this map" snippet generator (iframe code)
  • why: journalists, researchers, and bloggers can't embed the map
    in their own pages.
  • impact: 2
  • effort: S
  • files: docs/app.js (embed modal)
  • verify: click "embed" → copies iframe snippet preserving current view

Data Expansion
- [ ] Add renewable energy zones as polygons (solar parks, wind corridors)
  • why: point markers don't convey the scale of planned energy zones.
    Polygon overlays show the real footprint.
  • impact: 4
  • effort: M
  • files: docs/data/rez.geojson (new), docs/app.js
  • verify: toggle REZ layer → colored polygons show Midelt, Ouarzazate zones

- [ ] Add power grid interconnections to Europe (Xlinks, Spain-Morocco)
  • why: cross-border interconnectors are core to the energy export
    thesis. Currently missing as proper line features.
  • impact: 5 (core to project thesis)
  • effort: M
  • files: docs/data/interconnections.geojson (new), docs/app.js
  • verify: toggle layer → HVDC lines render Morocco↔Spain, Xlinks↔UK

- [ ] Add green hydrogen project layer
  • why: Morocco's green H2 strategy is a major emerging infrastructure
    story. The map should reflect it.
  • impact: 4
  • effort: M
  • files: docs/data/green-hydrogen.geojson (new), docs/app.js
  • verify: toggle layer → H2 project sites visible with details

- [ ] Add energy storage (battery) project layer
  • why: BESS is critical to Morocco's renewable integration strategy.
    No visibility today.
  • impact: 3
  • effort: S–M
  • files: docs/data/storage.geojson (new), docs/app.js
  • verify: toggle layer → battery project sites visible

- [ ] Add EV charging infrastructure layer
  • why: EV charging is the demand-side complement to generation.
    Relevant for digital-energy nexus story.
  • impact: 2
  • effort: M
  • files: docs/data/ev-charging.geojson (new), docs/app.js
  • verify: toggle layer → charging stations visible

Backlog (later)
- [ ] HTTP caching headers for /data/*.geojson (Cache-Control, ETag)
- [ ] Move OIM tiles fetch behind a CORS-proof proxy (currently breaks if
      OIM rate-limits a viewer)
- [ ] Strip docs/SUBSTACK_POST.md and docs/CALC_ENGINE.md from production
      build (they ship to Pages currently)
- [ ] Migrate to Astro/Vite — only when 3rd country is added (premature now)
- [ ] Add e2e smoke test (Playwright) — load page, toggle each layer,
      assert no console errors
```

## Wiring it up (concrete next step)

Two ways to run the daily routine:

**Option A — local cron + Claude Code subagent**
- A scheduled task fires at 08:30, runs the `architect` agent in this repo
- Agent reads ARCHITECTURE_BACKLOG.md, scores it, edits "Today" column
- Posts the brief to a notes file you read with morning coffee
- Cost: ~$0.10/day (Sonnet 4.5, 10k tokens scan)

**Option B — Claude Code `/architect` slash command**
- Manual trigger from inside Claude Code: you type `/architect` once a day
- Same agent logic but on-demand
- No scheduling needed, no cost when idle

Recommend **Option B** until the routine proves valuable, then graduate
to A. I can scaffold the slash command on request.

## Done log

Move closed cards here with their commit SHA + date:

```
- [x] 2026-05-04 — Hybrid v1.6 + AI Atlas data merge (eea69e4 → 9525676)
- [x] 2026-05-03 — Wire real ONEE grid (947 features) (0f19a8b)
- [x] 2026-05-03 — Expand generation 16→42 features (a57bd5c)
```
