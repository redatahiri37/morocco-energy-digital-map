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
3. **OBJ-frontend-engineer-4** | Add Escape-key close and focus management (trap + return-focus) to `#methodologyModal` in `docs/app.js`
   unlocks:  a regulator or DC developer navigating by keyboard who opens Methodology can close it and get focus back where they were, instead of being stuck needing a mouse click on the X or backdrop — confirmed zero `keydown`/`Escape` handling anywhere in `docs/app.js`, and no focus-in-on-open / focus-return-on-close
   evidence: opening Methodology via keyboard, pressing Escape closes it and focus returns to `#methodologyBtn`; Tab cycles only within the modal while open
   size:     S
   risk:     low — additive event listeners on the existing open/close functions, no markup restructuring

### coord-validator
1. **OBJ-coord-validator-1** | Add a `vintage` field to all 13 features in `docs/data/morocco/industrial.geojson`
   unlocks:  a regulator citing OCP's, Renault's or another site's estimated demand can state which year the estimate is from, instead of it being presented as implicitly current (confirmed: file has `source`/`source_url` on every feature but no date field at all)
   evidence: all 13 features carry a `vintage` property; the popup source-row surfaces it
   size:     S
   risk:     none to the render path — additive property, no schema field renamed; ~1 KB file growth
2. **OBJ-coord-validator-2** | Sample-verify `docs/data/morocco/national-hv.geojson` (947 ONEE 60 kV line features, `coord_method: osm_derived`) and `docs/data/morocco/transmission-lines.geojson` (541 WBG line features)
   _(Partial REPORT delivered 2026-08-06: exhaustive bbox/structural scan, 0/1,488 FAIL, 0 out-of-Morocco, 0 degenerate; 26-endpoint topology sample geographically plausible; several per-file features UNVERIFIED only because Nominatim is blocked by this session's own egress policy, not a data issue — reconfirmed blocked again this sitting (2026-08-07 08:01), see Outcome. Stays M pending real named-lookup access.)_
   unlocks:  a regulator who directly fetches either public file (both cite ONEE/WBG as authoritative) can trust the routing, or the map withdraws the citation — instead of the map silently hosting 1,488 "ONEE/WBG-sourced" line segments that have never been checked, because neither file is loaded by `docs/app.js`/`docs/countries.config.js` (confirmed: zero references anywhere in the load path)
   evidence: a coord-validator report with a stated sample size and a FAIL/PASS/UNVERIFIED count — note: features are anonymously named ("ONEE 60 kV line" ×947), so the standard Nominatim/Wikipedia named-lookup method doesn't apply; needs a bbox/topology/endpoint-cluster method instead
   size:     M
   risk:     none to ship (read-only); reputational risk is what's already live — two unchecked "ONEE/WBG"-sourced files sitting in production
3. **OBJ-coord-validator-3** | Remove or clearly mark deprecated `docs/data/morocco/grid-lines.geojson` (11 features)
   unlocks:  a developer or regulator who fetches `docs/data/` directly doesn't get a stale, unmaintained duplicate of `interconnectors.geojson`/`planned-corridors.geojson` data that can silently drift from the live files (confirmed: file is never loaded by `docs/app.js` — `app.js:86` only keeps a "legacy fallback" key-mapping comment referencing it; 2 of its 3 checked features are verbatim duplicates of `interconnectors.geojson`)
   evidence: file removed or a `deprecated: true` root note added; zero change to any rendered layer (file was never loaded); the "legacy fallback" comment at `app.js:86` removed
   size:     S
   risk:     none — file is unreferenced by any live code path
4. **OBJ-coord-validator-4** | Dedupe `docs/data/morocco/transmission-lines.geojson`'s WBG "planned corridor" segments against the already-live `docs/data/morocco/planned-corridors.geojson` before OBJ-map-debugger-2 wires it in
   unlocks:  a DC developer toggling the grid layer sees each real corridor once, not a duplicate rendering of the same ~15 planned 225kV/400kV segments the map already shows via `planned-corridors.geojson` — confirmed: 5 of 8 live `planned-corridors.geojson` features have a vertex at exact (0.0 km) coordinate match in the orphaned `transmission-lines.geojson`; `national-hv.geojson` shows no such duplication and is clear to proceed
   evidence: no feature in `transmission-lines.geojson` shares an exact-match vertex with any feature in `planned-corridors.geojson` after the fix; coord-validator re-check confirms zero remaining overlaps
   size:     S
   risk:     low — read/compare + feature removal in one data file; must not touch `national-hv.geojson` (unaffected) or `planned-corridors.geojson` (the file being deduped against, stays canonical)

### map-debugger
1. **OBJ-map-debugger-5** | Give `interconnectors.geojson` and `planned-corridors.geojson` distinct MapLibre source ids in `buildLineLayer()` (`docs/app.js:489-494,527-528`)
   unlocks:  a DC developer assessing cross-border interconnection headroom (Spain–Morocco I/II, Algeria–Morocco) can see and click those 3 real, live interconnector lines, instead of them being silently dropped from the map because `buildMapLayers`' second `buildLineLayer()` call (`planned-corridors`) overwrites the shared `"src-grid"` source the first call (`interconnectors`) wrote
   evidence: after the fix, all 3 interconnector features and all 8 planned-corridor features render and open correct popups simultaneously; existing layer-id scheme (`lyr-grid-hv/mv/lv/planned/idle`) that other objectives reference is preserved
   size:     S
   risk:     must not break the existing planned-corridors rendering while un-clobbering interconnectors; both layers' popups need re-verification at all three browser gates
   chair note: re-confirmed live on `main` (`docs/app.js:528`, `const srcId = "src-grid"`, hardcoded and shared by both call sites) at 2026-08-07 08:01 and again at 12:53 — top-ranked candidate for the next open SHIP slot (budget stays closed until ≈2026-08-07 22:21 UTC / 00:21 Paris, 24h after the last ship commit `7c27e5a`)
2. **OBJ-map-debugger-2** | Wire `docs/data/morocco/national-hv.geojson` (947 features) and `docs/data/morocco/transmission-lines.geojson` (541 features) into the live map as renderable layers
   unlocks:  a DC developer assessing grid headroom near a candidate site can currently see only 11 editorial grid lines (3 interconnectors + 8 planned corridors) plus whatever OpenInfraMap/OSM happens to have — ~1,488 curated ONEE/WBG transmission features already sit in this repo, fully unrendered, understating the network by orders of magnitude
   evidence: toggling the grid layer renders `national-hv` + `transmission-lines` features; panel layer counts match file feature counts
   size:     L
   risk:     performance (947+541 line features on one MapLibre source), visual clutter against the existing OIM grey grid layer, and it inherits the unresolved validation status from OBJ-coord-validator-2 and the dedupe from OBJ-coord-validator-4 — must not ship ahead of either; needs splitting before it is shippable
3. **OBJ-map-debugger-3** | Surface a visible error state for mid-session MapLibre runtime failures (`docs/app.js:224`, `map.on("error", ...)`)
   unlocks:  a regulator whose basemap tiles fail mid-session (CARTO rate-limit or outage after a successful load) sees a message explaining the map is degraded, instead of an unexplained frozen/blank canvas — confirmed: `#noTokenCard` is only ever shown from the `initMap()` try/catch (construction-time failure); the runtime `map.on("error", ...)` handler only `console.warn`s
   evidence: a simulated tile failure after successful init surfaces a visible in-page message, not just a console warning
   size:     S
   risk:     low — must not fire on benign/recoverable MapLibre warnings (e.g. missing icon) or it will falsely alarm users on a healthy map

### map-tester
1. **OBJ-map-tester-1** | Add an orphan-data check: list every `docs/data/morocco/*.geojson` file and flag any with zero references in `docs/countries.config.js`/`docs/app.js`
   unlocks:  the next time a data file is added or a `layers[]` entry is edited, a regulator or DC developer relying on "the map shows what's in `docs/data/`" doesn't silently lose a layer
   evidence: re-verified fresh at this sitting (2026-08-07 08:01) by direct grep, unchanged since 2026-08-04: 3 orphans — `grid-lines.geojson`, `national-hv.geojson`, `transmission-lines.geojson` (see OBJ-map-debugger-2, OBJ-coord-validator-3). A script/checklist step would make this a standing check instead of a manual grep.
   size:     S
   risk:     none — read-only verification script, no product code changed
2. **OBJ-map-tester-2** | Write down what "browser-level evidence" must contain for a release-gate GO (desktop/light/375px console + screenshot requirements)
   _(REPORT delivered 2026-08-07 08:01 — see `council/2026-08-07.md`.)_
   unlocks:  a Chair ruling a future SHIP can check a submitted GO against a fixed, written bar instead of a judgment call — closing the gap between `GO-STATIC` ("not shippable"; COUNCIL.md §5) and a real GO
   evidence: a short written checklist enumerating required evidence items, referenced by OBJ id the next time something ships
   size:     S
   risk:     none — documentation-only
3. **OBJ-map-tester-3** | Audit popup field-name mapping against each source file's actual property keys
   _(REPORT delivered 2026-08-06: all 5 currently-live layers checked — every key the popup code reads exists under the same name in its source file; the `precision`-fallback defect does not recur there. Two cosmetic gaps found (`region` absent from `industrial.geojson`/`digital.geojson`, already blank-guarded). One materially significant defect surfaced, not a key-name mismatch: `buildLineLayer()` shares one MapLibre source id across two callers — minted as `OBJ-map-debugger-5`.)_
   unlocks:  a DC developer reading a line's popup can trust that "Precision: approximate" reflects that specific line's real value, not a hardcoded fallback masking a wrong/missing field — confirmed live mismatch: `openLinePopup()` (`docs/app.js`) reads `p.precision`, but `national-hv.geojson` only has `coord_confidence` and `transmission-lines.geojson` has neither key at all, so the popup would silently show the hardcoded default "approximate" for both once rendered
   evidence: a per-layer field-mapping audit confirming every property the popup reads exists under that exact key in every file that layer draws from
   size:     S
   risk:     none — audit only; the fix belongs to whichever objective wires those layers in (OBJ-map-debugger-2)

### platform-engineer
1. **OBJ-platform-engineer-5** | Add a GitHub Action that auto-merges a PR labeled `council-ship` into `main` once its checks pass
   _(Mergeability REPORT delivered 2026-08-07 08:01 — see `council/2026-08-07.md`. Re-ranked to top this sitting: confirmed by `git merge-tree` that the two already-Council-ruled, already-committed fixes currently stuck unmerged — OBJ-map-debugger-1 and OBJ-map-debugger-4, see Shipped table — are BOTH clean fast-forwards from `main` touching mutually disjoint product files; the only merge friction on either is in `council/2026-08-06.md`, a documentation-only collision. The blocker is process, not a real code conflict.)_
   unlocks:  a regulator or DC developer sees a Chair-approved fix live on the map within a reasonable time of the sitting that approved it, instead of it sitting unmerged indefinitely — `main` is still at `9a4d5a4` (2026-08-04) while a growing stack of council-sitting branches sit unmerged with no alarm, and two of them carry real, already-ruled fixes the audience has not received
   evidence: a `council-ship`-labeled PR merges automatically post-checks; the existing branch backlog is triaged (merged or explicitly closed) in the sitting this ships
   size:     S
   risk:     auto-merge must fire only on the explicit label and only after checks pass; the deeper problem is the branching pattern itself (every sitting forks fresh from `main`, so sittings' own minutes/Board edits collide with each other even when product code doesn't) — auto-merge alone doesn't fix that pattern
   chair note: filed, not endorsed for autonomous execution — this changes how the repository merges code, a workflow decision COUNCIL.md §4 reserves for the user to weigh out of band. The mergeability finding above is handed to the user as-is; the Chair is not merging anything.
2. **OBJ-platform-engineer-4** | Add `.github/workflows/validate.yml`: JSON-validate every `docs/data/morocco/*.geojson`, `node --check` on `docs/app.js`/`docs/countries.config.js`, grep-verify every `file:` reference in `docs/countries.config.js` resolves to a real file
   unlocks:  a regulator or DC developer visiting the map right after a bad commit is not served a broken page, because a check runs automatically instead of depending on a human remembering to run map-tester first — confirmed: no `.github/workflows/` directory exists anywhere in the repo
   evidence: the workflow exists on `main`, fails on a deliberately broken test commit (bad JSON / broken JS syntax / dangling file reference), passes on a clean one
   size:     S
   risk:     low — pure shell/validation only; must not grow into `npm ci`/a linter package or it trips the COUNCIL.md §5 build-step veto it was scoped to avoid
3. **OBJ-platform-engineer-2** | Wire an uptime check against the live map URL (`https://atlas-nexus-69o.pages.dev/`, per README.md)
   _(← REPORT delivered 2026-08-07 12:53: prior sittings' inability to curl/WebFetch the live URL is this coding sandbox's own egress policy, not a constraint on a GitHub Actions scheduled (`schedule:` cron) workflow, which runs on GitHub-hosted runners with normal outbound internet access. Should not be deprioritized as "unverifiable from here.")_
   unlocks:  a regulator or DC developer trying to reach the map during a real outage is not left assuming the map simply doesn't exist for however long it takes someone to notice by hand — confirmed: no scheduled liveness check exists anywhere in the repo; this sitting's own sandbox cannot even reach the URL to check (outbound proxy denies the CONNECT), underscoring that nothing external is currently watching this
   evidence: a scheduled check exists and something (log/notification) proves it fired at least once
   size:     S
   risk:     low — read-only external HTTP check; must not require a new secret beyond what platform-engineer already holds

_(`OBJ-platform-engineer-3` — cache-control headers for `docs/data/*.geojson` — stays Docketed, unchanged, not in this sitting's filed 3; WIP still within the 5-per-seat cap at 4 items.)_
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
   _(REPORT delivered 2026-08-06: every origin the page actually contacts enumerated — unpkg, fonts.googleapis/gstatic, 4 hardcoded CARTO tile subdomains, openinframap.org, demotiles.maplibre.org, 'self'. Full directive draft written. Explicitly NOT shippable as-is: needs a live-browser Network-tab pass to confirm `worker-src blob:` is required by MapLibre's tile worker, and currently needs `style-src 'unsafe-inline'` because `docs/app.js` generates inline styles pervasively for popup badges/legend swatches.)_
   _(← REPORT delivered 2026-08-07 12:53: quantified the inline-style gap — 13 literal `style="..."` attributes in `docs/app.js` + 7 in `docs/index.html` = 20 sites needing `'unsafe-inline'` or a refactor to CSS classes; separately 8 JS `.style.<property> =` assignments whose CSP treatment still needs security-engineer confirmation. No `blob:`/`Worker` reference found anywhere in the source — `worker-src` need stays unconfirmed pending a live Network-tab pass. Stays not-shippable, sharpened not resolved.)_
   unlocks:  a regulator's or DC developer's browser blocks/reports any unexpected script origin the moment one is injected (e.g. a compromised dependency or a future accidental tracker), instead of it running silently until someone greps the source by hand — confirmed: no CSP exists anywhere (`docs/index.html` has no CSP meta tag, and no `docs/_headers` file exists at all)
   evidence: a CSP restricts `script-src`/`style-src`/`connect-src` to the known-good origins (unpkg, fonts.googleapis/gstatic, carto/openstreetmap tile domains); the live page shows zero CSP console violations
   size:     medium — an overly strict CSP silently breaks the map (blocked tile requests = blank map); must be tested at all three gates before ship, or it causes the exact rung-2 "site down" failure it exists to prevent

---

## Shipped

Ruled and committed by a sitting. **"Shipped" records a Council ruling, not
deploy status** — see the merge-status column. Only the first row below is
confirmed live on `main`/production; the other two are stuck on unmerged
branches (see `council/2026-08-07.md` 08:01 sitting for the mergeability
finding, re-confirmed still unmerged at the 12:53 sitting).

| Date | Sitting | OBJ | Commit | Branch | Merged to main? | Unlocks |
|---|---|---|---|---|---|---|
| 2026-08-04 | 14:15 | OBJ-frontend-engineer-1 | `c808b1e` | (PR #1) | **yes** — live at `9a4d5a4` | a regulator or DC developer navigating by keyboard/screen reader can toggle which infrastructure layers are visible |
| 2026-08-06 | 07:57 | OBJ-map-debugger-4 | `f29beca` | `council/2026-08-06-0757` | **no** — clean fast-forward from `main`, confirmed mergeable, just not merged | a regulator or DC developer using light mode can actually read the Solaire/Methodology/GitHub/theme-toggle buttons, instead of white-on-white text |
| 2026-08-06 | ~00:20 (commit ts) | OBJ-map-debugger-1 | `7c27e5a` | `council/2026-08-06-0004` | **no** — clean fast-forward from `main`, confirmed mergeable, just not merged | a regulator or DC developer who spots a wrong coordinate or stale figure can actually get the correction to land, instead of "Report an error" going to a dead `example.com` mailbox |

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
| coord-validator | 5 |
| map-debugger | 6 |
| map-tester | 4 |
| platform-engineer | 6 |
| security-engineer | 4 |
