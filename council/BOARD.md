# Council Board

The Atlas Nexus Council's **standing memory — current state, not history.**
See [README.md](./README.md) for how this differs from the daily minutes
files, and [COUNCIL.md](../COUNCIL.md) §8 for the rules that govern it.

**Read this before proposing objectives. Pull from here; don't reinvent.**

---

## In Progress (WIP limit: 1)

_none_

---

## Docketed — ranked, waiting to be picked (WIP limit: 5 per seat)

### frontend-engineer
1. **OBJ-frontend-engineer-2** | Add a visible loading state to `#layerList`/`#kpiGrid` while `loadAllData()` awaits its fetches in `docs/app.js`
   unlocks:  a DC developer on a slow connection doesn't mistake "still loading" for "this map has no data" and leave before the layers finish loading
   evidence: throttled-network reload shows a loading indicator in the panel between first paint and the first rendered layer row, not a blank sidebar
   size:     S
   risk:     low — additive UI only, no change to fetch logic
2. **OBJ-frontend-engineer-3** | Give `.topbar` explicit overflow handling at ≤375px in `docs/style.css`
   unlocks:  a DC developer checking the map on a phone can reach every topbar control (country switch, Methodology, GitHub, theme toggle) without one being clipped off-screen
   evidence: at 375px width no topbar control is clipped or unreachable and the page has no horizontal scrollbar
   size:     S
   risk:     low — layout-only change scoped to the existing 375px media query; `.topbar` is `display:flex` with `gap` and no `flex-wrap`/`overflow-x` today (confirmed by reading `docs/style.css:77-84,546-548`)
3. **OBJ-frontend-engineer-4** | Surface a distinct "layer failed to load" indicator per row in `#layerList` when its fetch fails in `docs/app.js`'s `loadAllData()`
   unlocks:  a DC developer reading a layer's feature count can tell "this dataset genuinely has zero features here" from "the fetch failed and this layer is silently missing" — today both render as an identical "0" with source/updated metadata shown as if it loaded fine (confirmed: catch block at `app.js:255-257` substitutes an empty `FeatureCollection` and only `console.warn`s, no user-facing signal)
   evidence: simulating a blocked/404 layer fetch (devtools request-blocking) shows a visible warning marker on that specific layer row, distinct from a layer that legitimately has 0 features
   size:     S
   risk:     low — additive UI keyed off a new per-layer load-failure flag; must not fire on the count-less "OIM live" virtual layer, which has no fetch to fail
   filed:    2026-08-05 sitting

### coord-validator
1. **OBJ-coord-validator-1** | Add a `vintage` field to all 13 features in `docs/data/morocco/industrial.geojson`
   unlocks:  a regulator citing OCP's, Renault's or another site's estimated demand can state which year the estimate is from, instead of it being presented as implicitly current (confirmed: file has `source`/`source_url` on every feature but no date field at all)
   evidence: all 13 features carry a `vintage` property; the popup source-row surfaces it
   size:     S
   risk:     none to the render path — additive property, no schema field renamed; ~1 KB file growth
2. **OBJ-coord-validator-2** | ~~Sample-verify `docs/data/morocco/national-hv.geojson` / `docs/data/morocco/transmission-lines.geojson`~~ — **CLOSED, REPORT delivered 2026-08-05**
   Verdict (see `council/2026-08-05.md` for full method): 15+15 sampled features (30 total) all PASS on Morocco-bbox, topology and voltage-consistency checks; a full-population bbox/topology sweep of all 1,488 features found zero out-of-country coordinates and zero degenerate geometries. Provenance UNVERIFIED — `national-hv.geojson` has no `source_url` at all, `transmission-lines.geojson`'s `source_url` is a generic WBG portal homepage (HTTP 403 on fetch), not a per-feature record. Overall: **structurally sound, provenance-unverified.** Flag for whoever wires these in: voltage-tier counts between the two independently-sourced files are suspiciously close (225kV 416 vs 418, 400kV 110 vs 113, 150kV 10 vs 10) — possible shared upstream (OSM) lineage despite differing `source` attribution, worth disclosing if/when these layers ship.
   This objective needs no further action from `coord-validator`. The actionable follow-up (actually wiring the layers in) lives at `OBJ-map-debugger-2`, now unblocked by this report.
3. **OBJ-coord-validator-3** | Remove or clearly mark deprecated `docs/data/morocco/grid-lines.geojson` (11 features)
   unlocks:  a developer or regulator who fetches `docs/data/` directly doesn't get a stale, unmaintained duplicate of `interconnectors.geojson`/`planned-corridors.geojson` data that can silently drift from the live files (confirmed: file is never loaded by `docs/app.js` — `app.js:86` only keeps a "legacy fallback" key-mapping comment referencing it; 2 of its 3 checked features are verbatim duplicates of `interconnectors.geojson`)
   evidence: file removed or a `deprecated: true` root note added; zero change to any rendered layer (file was never loaded); the "legacy fallback" comment at `app.js:86` removed
   size:     S
   risk:     none — file is unreferenced by any live code path

### map-debugger
1. **OBJ-map-debugger-1** | Fix the "Report an error" / "Report a data error" mailto targets in `docs/index.html:122` and `docs/app.js:968,997`
   unlocks:  a regulator or DC developer who spots a wrong coordinate or stale figure can actually get the correction to land, instead of every "Report an error" click going to `reda.tahiri@example.com` — `example.com` is IANA-reserved for documentation (RFC 2606) and is not a deliverable mailbox, confirmed identical placeholder in all 3 locations
   evidence: mailto target is a real, monitored address in all 3 locations
   size:     S
   risk:     none — string replacement in 2 files, no logic change
2. **OBJ-map-debugger-2** | Wire `docs/data/morocco/national-hv.geojson` (947 features) and `docs/data/morocco/transmission-lines.geojson` (541 features) into the live map as renderable layers
   unlocks:  a DC developer assessing grid headroom near a candidate site can currently see only 11 editorial grid lines (3 interconnectors + 8 planned corridors) plus whatever OpenInfraMap/OSM happens to have — ~1,488 curated ONEE/WBG transmission features already sit in this repo, fully unrendered, understating the network by orders of magnitude
   evidence: toggling the grid layer renders `national-hv` + `transmission-lines` features; panel layer counts match file feature counts
   size:     L
   risk:     performance (947+541 line features on one MapLibre source), visual clutter against the existing OIM grey grid layer
   status:   UNBLOCKED as of 2026-08-05 — OBJ-coord-validator-2's report came back "structurally sound, provenance-unverified" (see that entry above), so the data-quality blocker is cleared. Still L-sized and must be split into S-sized slices before it is SHIP-eligible; the provenance caveat (possible shared OSM lineage between the two files) should be surfaced in the eventual UI/popup, not silently dropped.
3. **OBJ-map-debugger-4** | Fix light-theme topbar button contrast in `docs/brand.css`
   unlocks:  a regulator or DC developer using light mode can actually read the Solaire/Methodology/GitHub/theme-toggle buttons, instead of white-on-white text — confirmed root cause by reading source and reproducing live: `docs/brand.css:32-36` sets `.topbar .ghost-btn,.topbar .icon-btn{color:rgba(255,255,255,.85)}` unconditionally (no `[data-theme="light"]` variant anywhere in that file, which per its own header comment loads *after* `docs/style.css` "so chrome rules win"); this silently overrides `docs/style.css:113-115`'s `[data-theme="light"] .ghost-btn{background:#fff;color:#18181a}` — the background flips to white but the text color does not, since brand.css's later, unconditional rule wins the cascade at equal specificity. Reproduced via `document.body.dataset.theme="light"` in a live browser (screenshot: all four topbar buttons render blank/unreadable) and confirmed present on the pre-edit file too (git-stash comparison), so it predates and is unrelated to OBJ-frontend-engineer-1.
   evidence: in light theme, all four topbar buttons show visible, sufficient-contrast text against their background
   size:     S
   risk:     low — brand.css is shared with Atlas Solar's chrome per its own header ("Single source of truth for both apps"); a fix must add a light-theme-conditional rule there without breaking Solar's topbar, which platform-engineer/security-engineer should confirm since they're dual-hatted across both apps
4. **OBJ-map-debugger-3** | Surface a visible error state for mid-session MapLibre runtime failures (`docs/app.js:224`, `map.on("error", ...)`)
   unlocks:  a regulator whose basemap tiles fail mid-session (CARTO rate-limit or outage after a successful load) sees a message explaining the map is degraded, instead of an unexplained frozen/blank canvas — confirmed: `#noTokenCard` is only ever shown from the `initMap()` try/catch (construction-time failure); the runtime `map.on("error", ...)` handler only `console.warn`s
   evidence: a simulated tile failure after successful init surfaces a visible in-page message, not just a console warning
   size:     S
   risk:     low — must not fire on benign/recoverable MapLibre warnings (e.g. missing icon) or it will falsely alarm users on a healthy map

### map-tester
1. **OBJ-map-tester-1** | Add an orphan-data check: list every `docs/data/morocco/*.geojson` file and flag any with zero references in `docs/countries.config.js`/`docs/app.js`
   unlocks:  the next time a data file is added or a `layers[]` entry is edited, a regulator or DC developer relying on "the map shows what's in `docs/data/`" doesn't silently lose a layer — this sitting only caught 3 orphans (`grid-lines`, `national-hv`, `transmission-lines`) by manual grep
   evidence: a script/checklist step reports the orphan list; currently returns 3 (see OBJ-map-debugger-2, OBJ-coord-validator-3)
   size:     S
   risk:     none — read-only verification script, no product code changed
2. **OBJ-map-tester-2** | Write down what "browser-level evidence" must contain for a release-gate GO (desktop/light/375px console + screenshot requirements)
   unlocks:  a Chair ruling a future SHIP can check a submitted GO against a fixed, written bar instead of a judgment call — closing the gap between `GO-STATIC` ("not shippable"; COUNCIL.md §5) and a real GO
   evidence: a short written checklist enumerating required evidence items, referenced by OBJ id the next time something ships
   size:     S
   risk:     none — documentation-only
3. **OBJ-map-tester-3** | Audit popup field-name mapping against each source file's actual property keys
   unlocks:  a DC developer reading a line's popup can trust that "Precision: approximate" reflects that specific line's real value, not a hardcoded fallback masking a wrong/missing field — confirmed live mismatch: `openLinePopup()` (`docs/app.js`) reads `p.precision`, but `national-hv.geojson` only has `coord_confidence` and `transmission-lines.geojson` has neither key at all, so the popup would silently show the hardcoded default "approximate" for both once rendered
   evidence: a per-layer field-mapping audit confirming every property the popup reads exists under that exact key in every file that layer draws from
   size:     S
   risk:     none — audit only; the fix belongs to whichever objective wires those layers in (OBJ-map-debugger-2)

### platform-engineer
1. **OBJ-platform-engineer-1** | Add a minimal CI check on push to `main`: JSON/GeoJSON-validate every `docs/data/**/*.geojson` file
   unlocks:  a regulator or DC developer visiting the map right after a bad commit is not served a broken page, because a check runs automatically instead of depending on a human remembering to run map-tester first — confirmed: no `.github/workflows/` directory exists anywhere in the repo
   evidence: `.github/workflows/validate.yml` exists, runs on push/PR to main, uses only stock `ubuntu-latest` tooling (`python3`, no npm/bundler), fails on a deliberately broken test commit (malformed JSON or a non-FeatureCollection root)
   size:     S — **rescoped 2026-08-05** (was M). REPORT delivered this sitting produced a concrete slice-(a) workflow (full YAML in `council/2026-08-05.md`): one job, one step, `python3 -c` JSON/FeatureCollection check, touches only a new file. Now genuinely S and SHIP-eligible.
   risk:     low — must stay pure shell/validation; the cross-reference check (does every `layers[].file` in `docs/countries.config.js` resolve to a real file) was deliberately deferred to `OBJ-platform-engineer-4` rather than folded in here, to keep this slice small
2. **OBJ-platform-engineer-4** | Add a second CI step: cross-reference every `layers[].file` entry in `docs/countries.config.js` against files actually present in `docs/data/`
   unlocks:  a regulator or DC developer isn't served a map with a layer toggle that silently 404s, because a config/data mismatch is caught in CI instead of by a user's browser console
   evidence: workflow step fails on a deliberately misconfigured `countries.config.js` entry pointing at a nonexistent file; passes on the current, correct config; correctly treats `null`-file (virtual/OIM) layers as expected non-failures
   size:     S
   risk:     low — needs the `null`-file/virtual-layer case handled explicitly or it will false-positive on layers that have no backing file by design
   filed:    2026-08-05 sitting (split out of OBJ-platform-engineer-1's original M scope)
3. **OBJ-platform-engineer-2** | Wire an uptime check against the live map URL (`https://atlas-nexus-69o.pages.dev/`, per README.md)
   unlocks:  a regulator or DC developer trying to reach the map during a real outage is not left assuming the map simply doesn't exist for however long it takes someone to notice by hand — confirmed: no scheduled liveness check exists anywhere in the repo
   evidence: a scheduled check exists and something (log/notification) proves it fired at least once
   size:     S
   risk:     low — read-only external HTTP check; must not require a new secret beyond what platform-engineer already holds
4. **OBJ-platform-engineer-3** | Add `docs/_headers` with an explicit cache-control policy for `docs/data/*.geojson`
   unlocks:  a regulator or DC developer who reloads the map right after a data correction ships actually sees the corrected figure, instead of a stale cached copy with no defined expiry — confirmed: no `docs/_headers` file or equivalent exists, so caching behavior for the data files is entirely undefined
   evidence: `docs/_headers` sets an explicit, short max-age (or must-revalidate) on `docs/data/*.geojson`; a fetch immediately after a data commit is confirmed to bypass/refresh the cache
   size:     S
   risk:     low — too short raises origin load, too long reintroduces the stale-data problem; value must be deliberate, not just "0"

### security-engineer
1. **OBJ-security-engineer-1** | Add Subresource Integrity (`integrity=`) hashes to the MapLibre `<script>`/`<link>` tags in `docs/index.html`
   unlocks:  a regulator's or DC developer's browser refuses to execute a tampered `maplibre-gl.js` if unpkg is ever compromised or MITM'd, instead of silently running whatever the CDN serves — confirmed: zero `integrity=` attributes anywhere in `docs/index.html`, and the map has no build step to pin dependencies any other way
   evidence: script/link tags carry a correct `integrity` hash matching the pinned 4.7.1 build; a deliberately wrong test hash causes the browser to block the resource
   size:     S
   risk:     low — hash must be regenerated if the pinned CDN version ever changes, or the resource silently fails to load
2. **OBJ-security-engineer-2** | Disclose the third-party requests the page makes on every load (Google Fonts, unpkg, CARTO/OSM tiles)
   unlocks:  a regulator evaluating whether the map meets the data-protection bar they'd apply to their own agency's tools can see the third-party data flow disclosed on the page, instead of finding it themselves via devtools — confirmed: 3 third-party origins are contacted on every load with zero disclosure anywhere in the existing "About this tool"/Methodology text
   evidence: the page states which third parties receive a request on load
   size:     S
   risk:     none — documentation-only addition, doesn't change which requests fire
3. **OBJ-security-engineer-3** | Add a Content-Security-Policy via `docs/_headers`
   unlocks:  a regulator's or DC developer's browser blocks/reports any unexpected script origin the moment one is injected (e.g. a compromised dependency or a future accidental tracker), instead of it running silently until someone greps the source by hand — confirmed: no CSP exists anywhere (`docs/index.html` has no CSP meta tag, and no `docs/_headers` file exists at all)
   evidence: a CSP restricts `script-src`/`style-src`/`connect-src` to the known-good origins (unpkg, fonts.googleapis/gstatic, carto/openstreetmap tile domains); the live page shows zero CSP console violations
   size:     S
   risk:     medium — an overly strict CSP silently breaks the map (blocked tile requests = blank map); must be tested at all three gates before ship, or it causes the exact rung-2 "site down" failure it exists to prevent

---

## Shipped

| Date | Sitting | OBJ | Commit | Unlocks |
|---|---|---|---|---|
| 2026-08-04 | 14:15 | OBJ-frontend-engineer-1 | `c808b1e` | a regulator or DC developer navigating by keyboard/screen reader can toggle which infrastructure layers are visible |

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

_none yet_

---

## ID ledger (next number to mint per seat — never reuse or renumber)

| Seat | Next OBJ number |
|---|---|
| frontend-engineer | 5 |
| coord-validator | 4 |
| map-debugger | 5 |
| map-tester | 4 |
| platform-engineer | 5 |
| security-engineer | 4 |
