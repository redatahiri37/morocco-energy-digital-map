# BACKLOG — Energy × Digital Nexus Map

Kanban for the Morocco Infrastructure Map and its MENA expansion.
Moves top-to-bottom within a column; moves right across columns as work lands.

Last reshuffle: **2026-04-18**.

---

## 🟢 Now — in flight this week

- **v1.1 engine swap** — Mapbox GL → MapLibre GL + CARTO dark-matter / positron.
  No token, no URL restriction. Matches the Pawel Czyzak / Ember stack.
- **Styling bundle** — DC radius ∝ `capacity_estimate_mw`;
  planned/announced DCs rendered at lower opacity; Western Sahara
  border filtered out of boundary render.
- **Cross-border interconnectors** — ES–MA I/II (operational, 2×700 MW),
  ES–MA III (planned, 2030), DZ–MA (idle since 2021), Xlinks UK–MA
  HVDC (planned, 2031, 3.6 GW).
- **Public launch prep** — Substack post draft (`docs/SUBSTACK_POST.md`),
  in-app About modal stays, README updated with new quick-start.

## 🟡 Next — picked up once "Now" ships

- **Data-center pipeline refresh** — fold in operator-by-operator
  breakdown (N+ONE, inwi, Maroc Telecom, Atos, + announced Oracle MA region,
  Microsoft Azure MA region when confirmed). Add provider legend in the
  sidebar (color stripe per operator on the DC row).
- **Substation dataset** — currently we only have line endpoints.
  Overpass query `power=substation` in MA bbox, filter by
  `voltage>=60000`, render as squares. This unblocks any future
  grid-suitability scoring.
- **DC detail pane** — on click, show `Tier`, `PUE` (if public),
  `cooling` (air / liquid / immersion), `connected_substation_id`.
- **Bilingual UI (FR / EN)** — audience is split roughly 50/50;
  i18n dictionary in `docs/i18n/` driven by `<html lang>` + a top-bar toggle.

## 🔵 Later — v1.2+ scope

- **Capacity buildout timeline** — year slider (2000→2035). Filter
  `commissioning_year <= $year`, fade announced features in at their
  target year. This is the headline visual for the Substack post.
  Needs a bottom drawer with timeline + play button.
- **Grid-suitability index (Pawel-style 1–5 score)** — per 0.1° cell,
  blend: nearest HV line (km), available generation within 50 km,
  renewables share, cooling-water proximity, seismic risk.
- **Layer 5 — renewable potential raster** — Global Solar Atlas GHI +
  Global Wind Atlas capacity factor as colored hillshade overlays.
- **Submarine cable full routes** — right now we only show landings.
  Render 2Africa, ACE, Atlas Offshore full great-circle paths using
  the TeleGeography dataset.
- **MENA expansion — Egypt** — drop `docs/data/egypt/` + one manifest
  entry in `countries.config.js`. Same schema. Primary sources: EETC,
  NREA, GEM, Datacentermap EG.

## ⚪ Icebox — ideas to revisit

- Live grid-frequency readout from ENTSO-E (ES adjacent zone as proxy).
- Carbon-intensity overlay (electricityMap API) — API is paid, so deferred.
- 3D buildings around DC clusters (Mapbox `fill-extrusion`) — MapLibre
  supports it; cosmetic.
- Tile-serve the static GeoJSONs as vector tiles via `tippecanoe`
  once counts exceed ~5k features (won't happen in v1.x).
- CSV export button per layer — useful for researchers; low lift.
- Embed mode — `?embed=1` strips topbar/sidebar so the map can iframe
  cleanly into a Substack post.

## 💡 Brainstorm — unsorted ideas

*Things worth discussing before assigning a column. Prune aggressively.*

- **Animated capacity buildout** *(captured in Later as "timeline")* —
  year-by-year generation additions, location-aware. Substack
  headline visual. Confirm format: drawer slider vs autoplay GIF.
- **"What if" scenario toggle** — show MA grid with / without Xlinks, with /
  without DZ–MA interconnector restored.
- **Loss-of-load probability overlay** — needs Aramco / ONEE dispatch
  data that isn't public; probably icebox.
- **Show EU gas LNG terminals on the Iberian side** — Morocco imports
  gas via Medgaz + Maghreb-Europe; a one-screen view of the gas
  corridor explains why the gas plants are where they are.
- **Climate stress layer** — heat-stress days / water-stress index
  at DC locations. Makes the "Morocco as data-center hub" pitch
  honest about cooling constraints.
- **News ticker** — latest 5 press items per layer (RSS → GitHub Action
  → `docs/data/news.json`). Low-maintenance if the feed is stable.
- **Investor-facing view** — same data, different framing:
  sort DCs by `investment_usd`, show a `$/MW` ladder.

---

## How to move a card

Edit this file, commit `chore(backlog): <what changed>`. No separate
tool. If an item grows beyond a one-line blurb, promote it to an issue
on GitHub and link it here.

## Definition of Done per column

- **Now → Next**: merged to `main`, live on GitHub Pages, screenshot
  in the commit or PR body.
- **Next → Later**: scoped with a concrete data source identified.
- **Later → Icebox**: explicit decision *not* to build, with a reason.
