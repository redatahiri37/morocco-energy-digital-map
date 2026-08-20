# Council Board

The Atlas Nexus Council's **standing memory — current state, not history.**
See [README.md](./README.md) for how this differs from the daily minutes
files, and [COUNCIL.md](../COUNCIL.md) §8 for the rules that govern it.

**Read this before proposing objectives. Pull from here; don't reinvent.**

**Status note (2026-08-20 07:53):** `main` is still `9a4d5a4` (2026-08-04).
This file's Docketed section is seeded from `council/2026-08-19-2315`
(PR #39), the most-advanced true record, since every sitting since 08-04
has landed on its own unmerged branch instead of `main`. **The "Shipped"
table below records what a sitting ruled and committed on its own branch —
not what is live.** 30 branches, 0 merges, since 2026-08-04 — see
`council/2026-08-20.md` for the full finding. Until a human reconciles the
backlog, treat every "Shipped" row here as *proposed-and-gated*, not
*deployed*.

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

### coord-validator
1. **OBJ-coord-validator-4** | Correct or withdraw the WBG-2018 citation on `docs/data/morocco/transmission-lines.geojson` (minted 2026-08-19 23:15, from the OBJ-coord-validator-2 investigation below)
   unlocks:  a regulator who fetches `transmission-lines.geojson` directly and cites its "World Bank Group — Morocco Power Sector Masterplan (2018)" attribution is not citing a false provenance — confirmed 2026-08-19: 510/541 features (94.3%) are geometric near-duplicates (endpoints offset 0.26–0.82 km, matching point counts) of `national-hv.geojson`'s own `coord_method: osm_derived`/`coord_confidence: approximate` features, and per-voltage-tier feature counts corroborate the overlap population-wide (150kV 10=10, 225kV 416≈418, 400kV 110≈113) — the two files cannot both be independently WBG- and OSM-sourced for the same 510 lines
   evidence: either (a) `transmission-lines.geojson`'s `source`/`source_url` is corrected to reflect the actual OSM-derived provenance for the 510 overlapping features (the remaining 31 may retain the WBG citation if individually confirmed independent), or (b) the file is marked `deprecated`/withdrawn in favor of `national-hv.geojson`, pending a coord-validator PASS with zero FAILs on whichever path is chosen
   size:     M — needs a decision (correct vs. withdraw) plus per-feature or per-file edit before it's a shippable S; not yet split
   risk:     none to the live map (file is not yet wired into `docs/app.js`/`countries.config.js` — this is a repo-hygiene/citation-integrity fix to a dormant, directly-fetchable file, not a live-page regression); reputational risk is the false citation sitting in the public repo right now
2. **OBJ-coord-validator-1** | Add a `vintage` field to all 13 features in `docs/data/morocco/industrial.geojson`
   unlocks:  a regulator citing OCP's, Renault's or another site's estimated demand can state which year the estimate is from, instead of it being presented as implicitly current (confirmed: file has `source`/`source_url` on every feature but no date field at all)
   evidence: all 13 features carry a `vintage` property; the popup source-row surfaces it
   size:     S
   risk:     none to the render path — additive property, no schema field renamed; ~1 KB file growth
3. **OBJ-coord-validator-2** | Sample-verify `docs/data/morocco/national-hv.geojson` (947 ONEE 60 kV line features, `coord_method: osm_derived`) and `docs/data/morocco/transmission-lines.geojson` (541 WBG line features) — investigated 2026-08-19 23:15, partially resolved, kept open on the live-Nominatim gap
   unlocks:  a regulator who directly fetches either public file (both cite ONEE/WBG as authoritative) can trust the routing, or the map withdraws the citation — instead of the map silently hosting 1,488 "ONEE/WBG-sourced" line segments that have never been checked, because neither file is loaded by `docs/app.js`/`docs/countries.config.js` (confirmed: zero references anywhere in the load path)
   evidence: **2026-08-19 findings** — Method 1 (bbox/degenerate-geometry, full population 1,488/1,488): PASS, 0 vertices outside Morocco, 0 degenerate geometries. Method 2 (live Nominatim confirmation, the originally-specified method): BLOCKED, 0/1,488 — `nominatim.openstreetmap.org` returns a 403 policy denial from this environment's egress proxy (re-confirmed 2026-08-20, see this sitting's finding). Method 3 (geographic-plausibility fallback vs. ~34 known-hub coordinates, full population 2,976/2,976 endpoints): WARN, 82–92% within 50–75km of a known hub, two outliers individually confirmed as real corridors (Figuig, Boujdour–Dakhla), not authoritative. Method 4 (cross-file duplication/provenance, full population 1,488/1,488): **FAIL — see OBJ-coord-validator-4**. Routing/geometry itself is provisionally trusted (Methods 1+3); the live-Nominatim leg (Method 2) stays the open gap — needs either a network-policy change for this environment or a human running it.
   size:     M — Method 2 requires working Nominatim access, which this environment does not have; not re-attemptable until that changes
   risk:     none to ship (read-only); reputational risk is what's already live — two unchecked "ONEE/WBG"-sourced files sitting in production, now partially characterized
4. **OBJ-coord-validator-3** | Remove or clearly mark deprecated `docs/data/morocco/grid-lines.geojson` (11 features)
   unlocks:  a developer or regulator who fetches `docs/data/` directly doesn't get a stale, unmaintained duplicate of `interconnectors.geojson`/`planned-corridors.geojson` data that can silently drift from the live files (confirmed: file is never loaded by `docs/app.js` — `app.js:86` only keeps a "legacy fallback" key-mapping comment referencing it; 2 of its 3 checked features are verbatim duplicates of `interconnectors.geojson`)
   evidence: file removed or a `deprecated: true` root note added; zero change to any rendered layer (file was never loaded); the "legacy fallback" comment at `app.js:86` removed
   size:     S
   risk:     none — file is unreferenced by any live code path

### map-debugger
1. **OBJ-map-debugger-1** | Fix the "Report an error" / "Report a data error" mailto targets in `docs/index.html:122` and `docs/app.js:968,997` — **ruled and committed on at least 10 separate unmerged branches since 2026-08-11 (see council/2026-08-20.md); implementations disagree on whether to publish a personal address. Not re-docketed as open work — a human must pick one branch's diff and reconcile, not re-ship again.**
   unlocks:  a regulator or DC developer who spots a wrong coordinate or stale figure can actually get the correction to land, instead of every "Report an error" click going to a non-deliverable `example.com` placeholder
   evidence: mailto target is a real, monitored address in all 3 locations, on `main`
   size:     S
   risk:     **privacy** — at least one open branch (PR #39) hardcodes the site owner's personal Gmail address into public unauthenticated page source; a different branch (`council/2026-08-18-0402`) deliberately avoided this and redirected to the repo's GitHub-issues page instead. These two approaches are incompatible and the choice has not been ratified by the user. Do not merge either without the user choosing.
2. **OBJ-map-debugger-2** | Wire `docs/data/morocco/national-hv.geojson` (947 features) and `docs/data/morocco/transmission-lines.geojson` (541 features) into the live map as renderable layers
   unlocks:  a DC developer assessing grid headroom near a candidate site can currently see only 11 editorial grid lines (3 interconnectors + 8 planned corridors) plus whatever OpenInfraMap/OSM happens to have — ~1,488 curated ONEE/WBG transmission features already sit in this repo, fully unrendered, understating the network by orders of magnitude
   evidence: toggling the grid layer renders `national-hv` + `transmission-lines` features; panel layer counts match file feature counts
   size:     L
   risk:     performance (947+541 line features on one MapLibre source), visual clutter against the existing OIM grey grid layer, and it inherits the unresolved validation status from OBJ-coord-validator-2/-4 — must not ship ahead of those; needs splitting before it is shippable
3. **OBJ-map-debugger-4** | Fix light-theme topbar button contrast in `docs/brand.css`
   unlocks:  a regulator or DC developer using light mode can actually read the Solaire/Methodology/GitHub/theme-toggle buttons, instead of white-on-white text — confirmed root cause by reading source and reproducing live: `docs/brand.css:32-36` sets `.topbar .ghost-btn,.topbar .icon-btn{color:rgba(255,255,255,.85)}` unconditionally (no `[data-theme="light"]` variant anywhere in that file, which per its own header comment loads *after* `docs/style.css` "so chrome rules win"); this silently overrides `docs/style.css:113-115`'s `[data-theme="light"] .ghost-btn{background:#fff;color:#18181a}` — the background flips to white but the text color does not, since brand.css's later, unconditional rule wins the cascade at equal specificity.
   evidence: in light theme, all four topbar buttons show visible, sufficient-contrast text against their background
   size:     S
   risk:     low, but **ruled and committed on at least 6 separate unmerged branches** (2026-08-06 ×3, 08-07, 08-11, 08-13) — likely 6 divergent implementations of the same fix; a human should pick one, not accept another
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
   note (2026-08-19): this environment's egress policy blocks `unpkg.com`, so MapLibre can't construct from the real CDN URL in headless testing here — re-confirmed 2026-08-20 (see this sitting's finding). Workaround established: `page.route()` intercept the two `unpkg.com/maplibre-gl@4.7.1/...` requests to a local `npm install maplibre-gl@4.7.1` copy (test-harness only, `docs/index.html` stays pointed at unpkg for the real deploy), then use `map.queryRenderedFeatures()` to find a real feature's screen pixel instead of guessing coordinates. Worth folding into the written checklist as the standard technique.
3. **OBJ-map-tester-3** | Audit popup field-name mapping against each source file's actual property keys
   unlocks:  a DC developer reading a line's popup can trust that "Precision: approximate" reflects that specific line's real value, not a hardcoded fallback masking a wrong/missing field — confirmed live mismatch: `openLinePopup()` (`docs/app.js`) reads `p.precision`, but `national-hv.geojson` only has `coord_confidence` and `transmission-lines.geojson` has neither key at all, so the popup would silently show the hardcoded default "approximate" for both once rendered
   evidence: a per-layer field-mapping audit confirming every property the popup reads exists under that exact key in every file that layer draws from
   size:     S
   risk:     none — audit only; the fix belongs to whichever objective wires those layers in (OBJ-map-debugger-2)

### platform-engineer
1. **OBJ-platform-engineer-1** | Add `.github/workflows/validate.yml`: JSON-validate every `docs/data/**/*.geojson` (`jq`) and confirm `docs/index.html` + `docs/countries.config.js` (scoped to `COUNTRIES_ENABLED`) reference only files that exist (`python3` stdlib, `.github/scripts/check_refs.py`) — runs on push to `main`. Resized M → S 2026-08-19 after a scoping report drafted and tested both the workflow YAML and the checker script against the real tree (clean pass) and a deliberately broken fixture: all failed as expected, `exit 1`. Both tools ship preinstalled on `ubuntu-latest` — zero installs, no `package.json`, no build step. **Drafted independently at least 3 times (2026-08-12, 08-13, 08-18) and shipped 0 times** — every prior attempt sat on an unmerged branch.
   unlocks:  a regulator or DC developer visiting the map right after a bad commit is not served a broken page — a check runs automatically instead of depending on a human remembering to run map-tester first — confirmed: no `.github/workflows/` directory exists anywhere on `main`
   evidence: workflow + script committed on `main`; a deliberately broken test commit fails the Action; the real tree passes clean
   size:     S
   risk:     none to the deployed site (CI has no deploy authority); scoped to `COUNTRIES_ENABLED` to avoid false-failing on placeholders with no `docs/data/` directory yet. Open call for a ruling Chair: "pure shell" vs. "jq + python3 stdlib, still zero-install" — not yet ruled on.
2. **OBJ-platform-engineer-2** | Wire an uptime check against the live map URL (`https://atlas-nexus-69o.pages.dev/`, per README.md)
   unlocks:  a regulator or DC developer trying to reach the map during a real outage is not left assuming the map simply doesn't exist for however long it takes someone to notice by hand — confirmed: no scheduled liveness check exists anywhere in the repo
   evidence: a scheduled check exists and something (log/notification) proves it fired at least once
   size:     S
   risk:     low — read-only external HTTP check; must not require a new secret beyond what platform-engineer already holds
3. **OBJ-platform-engineer-3** | Add `docs/_headers` with an explicit cache-control policy for `docs/data/*.geojson`
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

## Shipped (ruled + committed on a branch — see status note above: NOT confirmed live on `main`)

| Date | Sitting | OBJ | Commit | Unlocks |
|---|---|---|---|---|
| 2026-08-04 | 14:15 | OBJ-frontend-engineer-1 | `c808b1e` | a regulator or DC developer navigating by keyboard/screen reader can toggle which infrastructure layers are visible — **confirmed merged to `main`** |
| 2026-08-19 | 23:15 | OBJ-map-debugger-1 | `2ab1212` (branch `council/2026-08-19-2315`, PR #39, unmerged) | a regulator or DC developer who spots a data error can actually get the correction to land — **NOT merged; see the privacy caveat on OBJ-map-debugger-1 above before merging this or any of its ≥9 sibling branches** |

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
| frontend-engineer | 4 |
| coord-validator | 5 |
| map-debugger | 5 |
| map-tester | 4 |
| platform-engineer | 4 |
| security-engineer | 4 |
