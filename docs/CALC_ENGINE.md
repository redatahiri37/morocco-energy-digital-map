# v0.2 — Node-capacity engine (design doc, NOT YET BUILT)

**Goal.** For any user-picked location on the Morocco map, answer:
*"What MW of new load (DC, industrial, electrolyser) could reasonably plug
in at the nearest HV node today, and at the nearest planned node in 2030?"*

Inspired by Pawel Czyzak's EU grid-suitability map for Ember
(`ember-energy.org` — "Where can Europe build new data centres?").
Same mental model, lighter weight, fully open-source inputs.

## Model — four steps

1. **Node extraction.** From `transmission-lines.geojson`, detect line
   endpoints and junctions as nominal "nodes". Merge endpoints within
   500 m. Each node inherits the **max kV of incident lines**.
   Output: `nodes.geojson` (points) + `edges.json` (adjacency list).

2. **Per-line thermal capacity.** Rule-of-thumb SIL ratings (MVA) used
   as first-order capacity:

   | kV  | Typical SIL (MW) | Thermal limit (MW, 1 circuit) |
   |-----|------------------|-------------------------------|
   | 150 | 50               | ~180                          |
   | 225 | 120              | ~400                          |
   | 400 | 400              | ~1400                         |

   (Numbers align with CIGRE / IEEE 738 ampacity tables at 30 °C; will
   refine once we have conductor cross-sections.)

3. **Node injection headroom.** For each node *n*:
   - `generation_connected_mw` = sum of `power-plants.geojson` whose
     nearest node is *n* and `commissioning_year <= target_year`.
   - `load_connected_mw` = same for `industrial` + `digital`.
   - `export_capacity_mw` = sum of incident lines' thermal limits
     (N−1 contingency: drop the largest incident line).
   - `headroom_mw = export_capacity_mw − max(0, generation − load)`.

4. **Suitability score (1–5).** Blend of: node headroom, distance from
   user-picked lat/lng to node (km), local renewables share within
   50 km, water-stress index. Weights configurable. Output on click.

## Deliverables for v0.2

- `scripts/build-grid-graph.py` — offline, one-shot. Reads
  `transmission-lines.geojson` + `power-plants.geojson` + `industrial`
  + `digital`, writes `docs/data/morocco/grid-graph.json`.
- `docs/app.js` — "Click anywhere on map → popup shows nearest-node
  score, headroom, distance, dominant kV".
- `docs/CALC_ENGINE.md` (this file) — kept in repo as the audit trail.

## Explicit non-goals (still)

- No AC power-flow solver. A real PSS/E-style sim needs load profiles,
  generator dispatch, and reactive limits — out of scope until v0.3+.
- No congestion forecasting across hours. Static, peak-ish, first-order.
- No sub-150 kV visibility. Distribution network is WBG's 60 kV layer
  that we dropped — fair for siting big loads, useless for retail.

## Data caveat

Transmission network is **World Bank Group, 2018**. Frozen snapshot.
The 4 ES–MA interconnectors and the Xlinks corridor are added as
editorial overlay in `grid-lines.geojson`. Anything commissioned in
2019–2025 (e.g. new 400 kV segments in the south) is missing until we
cross-check against ONEE's most recent Plan d'Équipement.
