# Council Board

The Atlas Nexus Council's **standing memory — current state, not history.**
See [README.md](./README.md) for how this differs from the daily minutes
files, and [COUNCIL.md](../COUNCIL.md) §8 for the rules that govern it.

**Read this before proposing objectives. Pull from here; don't reinvent.**

---

## In Progress (WIP limit: 1)

_empty — nothing currently executing. OBJ-coord-validator-1 was attempted
2026-08-04 13:05 (rung-1, Data+Secrets gates PASS) but could not clear the
Release gate (GO-STATIC only — see Structural note below) and was reverted
off its branch, so it sits back in Docketed, top-ranked, ready to re-attempt._

---

## ⚠ Structural: Release gate cannot be cleared in this sandbox

`docs/index.html` depends on `unpkg.com` (MapLibre GL JS) and
`basemaps.cartocdn.com` (basemap tiles) to render at all. This execution
environment's outbound network policy blocks both hosts (confirmed via
proxy CONNECT-tunnel 403s and a live headless-Chromium run showing
`net::ERR_TUNNEL_CONNECTION_FAILED` on both, map never initializes). Every
unattended sitting that reaches a SHIP ruling on `docs/**` will hit this
same wall — no genuine browser-level verification is possible here,
regardless of what changed. Flagged to the user 2026-08-04. Until the
sandbox's network allowlist includes these hosts (or a sitting runs
somewhere that can reach them), the autonomous SHIP slot for the map is
effectively inert — objectives can be ruled and Data/Secrets-gated, but not
announced shipped.

---

## Docketed — ranked, waiting to be picked (WIP limit: 5 per seat)

### frontend-engineer
1. OBJ-frontend-engineer-1 | Make the six layer-toggle checkboxes keyboard- and screen-reader-operable (`display:none` drops them from tab order + a11y tree)
2. OBJ-frontend-engineer-2 | Give `loadAllData()` a visible per-layer failure state instead of silently swallowing fetch errors
3. OBJ-frontend-engineer-3 | Fix topbar overflow at the Council's own ≤375px gate (no wrap/overflow handling today)

### coord-validator
1. OBJ-coord-validator-1 | Correct the Renault Tangier Plant coordinate in `industrial.geojson` (~22km off despite `precision:"exact"`) — **ready to ship**: Data ✓ Secrets ✓, only blocked on Release gate (see Structural note). Exact diff: `coordinates` → `[-5.684, 35.695]`, `precision` → `"approximate"`.
2. OBJ-coord-validator-2 | Add `vintage`/`source_url` to all 947 features in `national-hv.geojson`
3. OBJ-coord-validator-3 | Add explicit `vintage` field to all 541 features in `transmission-lines.geojson`

### map-debugger
1. OBJ-map-debugger-1 | Point Methodology modal source-doc links at files that exist in the deployed site (`../DATA_SOURCES.md`/`../ASSUMPTIONS.md` 404 in production)
2. OBJ-map-debugger-2 | Replace the fake `@example.com` error-report email (index.html:122, app.js:968,997)
3. OBJ-map-debugger-3 | Fix feature-id mismatch disabling hover-dim on industrial/digital layers (app.js:670/709 vs. 850-871) — **root-caused 2026-08-04, ready to implement**: `promoteId:"id"` vs. numeric `f.id` are disjoint key spaces

### map-tester
1. OBJ-map-tester-2 | Record layer load failures to `window.__loadErrors` instead of only a transient `console.warn`
2. OBJ-map-tester-3 | Detect and report basemap tile failures that occur after map init

### platform-engineer
1. OBJ-platform-engineer-1 | CI: `node --check app.js` + validate every geojson as parseable JSON on push/PR to main
2. OBJ-platform-engineer-2 | Scheduled hourly health check against both Pages URLs

### security-engineer
1. OBJ-security-engineer-1 | Reject `javascript:`/`data:` URI schemes before rendering `source_url` as `<a href>` (XSS-shaped) — **root-caused 2026-08-04, ready to implement**: app.js lines 893, 903, 961, 969, 990
2. OBJ-security-engineer-2 | Add Subresource Integrity to the unpkg `maplibre-gl@4.7.1` tags
3. OBJ-security-engineer-3 | Self-host Inter + JetBrains Mono instead of Google Fonts (leaks visitor IP to Google today)

---

## Shipped

| Date | Sitting | OBJ | Commit | Unlocks |
|---|---|---|---|---|
| — | — | — | — | — |

---

## Vetoed (kept — never silently dropped)

| OBJ | Seat | Reason | First proposed | Last reaffirmed | Times vetoed |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

---

## Blocked — structural (vetoed 3×; may not be re-proposed without a noted change)

_none yet_

---

## Icebox (explicitly deferred, with a stated revisit trigger)

| OBJ | Reason | Revisit trigger |
|---|---|---|
| OBJ-platform-engineer-3 | Auto-deploy workflow needs a `CLOUDFLARE_API_TOKEN` repo secret; Council hard rule forbids handling credentials | A human adds the `CLOUDFLARE_API_TOKEN` secret to the repo |

---

## Rejected — failed North Star Test (not a veto, kept for the record)

| OBJ | Reason | Sitting |
|---|---|---|
| OBJ-map-tester-1 | `unlocks:` named "a map-tester GO" — the Council's own process, not a regulator/DC developer's job | 2026-08-04 13:05 |

---

## ID ledger (next number to mint per seat — never reuse or renumber)

| Seat | Next OBJ number |
|---|---|
| frontend-engineer | 4 |
| coord-validator | 4 |
| map-debugger | 4 |
| map-tester | 4 |
| platform-engineer | 4 |
| security-engineer | 4 |
