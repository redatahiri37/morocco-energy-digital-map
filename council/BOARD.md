# Council Board

The Atlas Nexus Council's **standing memory — current state, not history.**
See [README.md](./README.md) for how this differs from the daily minutes
files, and [COUNCIL.md](../COUNCIL.md) §8 for the rules that govern it.

**Read this before proposing objectives. Pull from here; don't reinvent.**

---

## In Progress (WIP limit: 1)

_none — OBJ-map-debugger-5 shipped as `bb0f017`, see Shipped below._

<details>
<summary>OBJ-map-debugger-5 — shipped 2026-08-28, retained for its root-cause record</summary>

**OBJ-map-debugger-5** | Merge `interconnectors` + `planned-corridors` into a single `src-grid` build so the interconnectors stop being destroyed on load
  unlocks:  a DC developer sizing an export-linked load, and a regulator assessing cross-border transfer capacity, can actually see Morocco's two operational 400 kV Spain–Morocco interconnectors and the idle Algeria–Morocco link — today the layer panel publishes "Interconnectors — 3" and the map draws zero of them
  evidence: after the change, `map.getSource("src-grid")._data.features.length === 11`; `lyr-grid-hv` renders the two operational 400 kV Spain–Morocco links and `lyr-grid-idle` renders the Algeria–Morocco link; the panel count and the rendered feature count agree
  size:     S
  risk:     low — visual change is additive (3 previously-invisible lines appear); no schema change, no data change, no new dependency; must confirm the five `lyr-grid-*` filters still partition correctly across the merged 11 features
  ruled:    SHIP at the 2026-08-28 10:15 sitting (rung 1 — a published fact is wrong)
  file:     `docs/app.js` only — clean at HEAD; must be committed alone

  Root cause, confirmed by source reading:
  - `buildLineLayer(dataLayerId, fc)` (`docs/app.js:527`) ignores `dataLayerId` and hardcodes `const srcId = "src-grid"`.
  - `addOrReplace` (`docs/app.js:522-524`) is `removeSource` + `addSource` — a destructive replace, not a merge.
  - Called at `docs/app.js:490` with `interconnectors` (3 features), then at `docs/app.js:494` with `planned-corridors` (8 features). The second call destroys the first.
  - All 8 planned corridors are `status: "planned"`, so only `lyr-grid-planned` matches. `lyr-grid-hv` (`operational` && `voltage_kv >= 300`), `lyr-grid-mv`, `lyr-grid-lv` and `lyr-grid-idle` (`status == "idle"`) match zero features.
  - The panel count comes straight from the file at `docs/app.js:289` (`fc.features.length`), which is why it says 3 while nothing is drawn.

  **Scope grew once during execution, deliberately.** `map-tester` returned
  NO-GO on the first submission: `layersFor()` returned all five `lyr-grid-*`
  layers for any `kind === "grid"` layer, so unchecking "Planned corridors"
  also blanked the interconnectors — with their own checkbox still reading
  checked. The coupling predates this objective; the *symptom* does not, because
  at HEAD the interconnectors never painted, so nobody could watch them vanish.
  Partitioning `layersFor()` by data layer was folded in as part of the same
  objective rather than docketed separately, since without it the SHIP fails its
  own `unlocks:` line on one click of an adjacent row.

</details>

---

## Docketed — ranked, waiting to be picked (WIP limit: 5 per seat)

### frontend-engineer
1. **OBJ-frontend-engineer-4** | Show an explicit empty state on a layer row whose source renders zero features
   unlocks:  a DC developer who toggles a layer on and sees nothing can tell "this infrastructure is not in the data here" apart from "this layer is broken", instead of concluding the infrastructure does not exist — the class of failure OBJ-map-debugger-5 proves is possible, where the panel count and the rendered count silently disagree
   evidence: a layer whose rendered feature count is zero shows a distinct state in `#layerList`, not a plain count
   size:     S
   risk:     low — additive UI; must read the rendered count, not `fc.features.length`, or it reproduces the exact blindness it exists to remove
2. **OBJ-frontend-engineer-2** | Add a visible loading state to `#layerList`/`#kpiGrid` while `loadAllData()` awaits its fetches in `docs/app.js`
   unlocks:  a DC developer on a slow connection doesn't mistake "still loading" for "this map has no data" and leave before the layers finish loading
   evidence: throttled-network reload shows a loading indicator in the panel between first paint and the first rendered layer row, not a blank sidebar
   size:     S
   risk:     low — additive UI only, no change to fetch logic
3. **OBJ-frontend-engineer-3** | Give `.topbar` explicit overflow handling at ≤375px in `docs/style.css`
   unlocks:  a DC developer checking the map on a phone can reach every topbar control (country switch, Methodology, GitHub, theme toggle) without one being clipped off-screen
   evidence: at 375px width no topbar control is clipped or unreachable and the page has no horizontal scrollbar
   size:     S
   risk:     low — layout-only change scoped to the existing 375px media query; `.topbar` is `display:flex` with `gap` and no `flex-wrap`/`overflow-x` today (confirmed by reading `docs/style.css:77-84,546-548`)
   **Severity raised twice, from two independent sittings.** (1) The 2026-08-27 sitting found 3 of 4 topbar controls sit *fully off-screen and unreachable* at 375px, not merely clipped — the evidence line above understates it. (2) Measured again 2026-08-28 during the OBJ-map-debugger-5 gate: at a 375px viewport `document.documentElement.scrollWidth` is 375 (so there is no page-level horizontal scrollbar, and the current evidence line would pass while the bug is live) but `document.body.scrollWidth` is **690** — nearly double. The evidence line must be rewritten to assert control *reachability* and `body.scrollWidth`, not just the absence of a page scrollbar, or this objective can be closed without fixing anything.

### coord-validator
1. **OBJ-coord-validator-3** | Delete the deprecated, never-fetched `docs/data/morocco/grid-lines.geojson` (11 features)
   unlocks:  a regulator or developer following the site's own instruction to "fetch it directly" from `docs/data/morocco/` cannot land on an unmaintained duplicate that already contradicts the live files — verified 2026-08-28: all 11 features name-match `interconnectors.geojson` + `planned-corridors.geojson` (0 unique), 7 are geometry-identical, and **4 carry the same feature name with different geometry**, so two publicly fetchable files already publish conflicting routes for the same named WBG 225/400 kV lines
   evidence: file removed; all five fetched layers still render unchanged (the file is fetched by nothing — `docs/countries.config.js` loads only `power-plants`, `interconnectors`, `planned-corridors`, `industrial`, `digital`, plus `boundary` at `docs/app.js:239`)
   size:     S
   risk:     none to the render path — but see the correction below; `docs/data/morocco/grid-lines.geojson` is clean at HEAD
   **RE-SCOPED 2026-08-28 — the previous evidence line was hazardous and is struck.** It instructed removing the `"grid-lines":"grid"` entry and its "legacy fallback" comment at `docs/app.js:86`. That entry is **not** legacy: it is the live `LAYER_KIND` key that `docs/app.js:803-807` passes as `dataLayer` for all five rendered `lyr-grid-*` layers, and `layerKind()` (`docs/app.js:173`) falls back to `"other"`. Deleting it would silently downgrade the hover tooltip and click popup on every grid line actually drawn. **Do not touch `docs/app.js` for this objective.**
2. **OBJ-coord-validator-2** | Sample-verify `docs/data/morocco/national-hv.geojson` (947 ONEE 60 kV line features, `coord_method: osm_derived`) and `docs/data/morocco/transmission-lines.geojson` (541 WBG line features)
   unlocks:  a regulator who directly fetches either public file (both cite ONEE/WBG as authoritative) can trust the routing, or the map withdraws the citation — instead of the map silently hosting 1,488 "ONEE/WBG-sourced" line segments that have never been checked, because neither file is loaded by `docs/app.js`/`docs/countries.config.js` (confirmed: zero references anywhere in the load path)
   evidence: a coord-validator report with a stated sample size and a FAIL/PASS/UNVERIFIED count — note: features are anonymously named ("ONEE 60 kV line" ×947), so the standard Nominatim/Wikipedia named-lookup method doesn't apply; needs a bbox/topology/endpoint-cluster method instead
   size:     M
   risk:     none to ship (read-only); reputational risk is what's already live — two unchecked "ONEE/WBG"-sourced files sitting in production
   **Stakes raised 2026-08-28:** the new `docs/data/index.html` tells readers "Every file is static, versioned in git... Fetch it directly", actively directing regulators at this directory. ~713 KB of never-checked, ONEE/WBG-attributed geometry is publicly fetchable.
3. **OBJ-coord-validator-1** | Add a `vintage` field to all 13 features in `docs/data/morocco/industrial.geojson`
   unlocks:  a regulator citing OCP's, Renault's or another site's estimated demand can state which year the estimate is from, instead of it being presented as implicitly current
   evidence: all 13 features carry a `vintage` property; the popup source-row surfaces it
   size:     **S is CHALLENGED — must be resolved before this is ranked again**
   risk:     **truth veto exposure.** Verified 2026-08-28: all 13 `source_url` values are undated corporate homepages (`ocpgroup.ma/en`, `sonasid.ma`, `lafargeholcim.ma`, `media.renault.com`, `stellantis.com`, `managemgroup.com`). No per-feature `vintage` is derivable from any citation in the repo, so writing a year would publish a figure without an in-repo citation — exactly what COUNCIL.md §5 forbids. Resolve by either re-sizing to M with real per-site research, or re-scoping to record an honest "undated" and say so on the page.

### map-debugger
1. **OBJ-map-debugger-4** | Fix light-theme topbar button contrast in `docs/brand.css`
   unlocks:  a regulator or DC developer using light mode can actually read the Solaire/Methodology/GitHub/theme-toggle buttons, instead of white-on-white text
   evidence: in light theme, all four topbar buttons show visible, sufficient-contrast text against their background
   size:     S
   risk:     **downgraded 2026-08-28.** The Board previously warned that `docs/brand.css` is shared with Atlas Solar. It is not — `solar/README.md:24` records that "`brand.css` is duplicated deliberately, not imported across the boundary", and Solar's pages link their own copy. Editing `docs/brand.css` cannot reach Solar. Diagnosis re-confirmed: `docs/style.css:113` sets `[data-theme="light"] .ghost-btn,[data-theme="light"] .icon-btn` to a white background, and `docs/brand.css:32-36` sets `.topbar .ghost-btn,.topbar .icon-btn{color:rgba(255,255,255,.85)}` unconditionally at equal specificity, loading second — so the background flips and the text does not.
   **ALREADY SHIPPED — do not re-rank.** Struck 2026-08-28 by the executing seat: this objective was executed at the 2026-08-27 12:11 sitting and is in **PR #46** (open, unmerged), with a `map-tester` GO quoting 17.73:1 resting contrast. The Chair ranked it "next in line for the SHIP slot" because it read the Board on `main`, where PR #46 has not landed. Moved to Shipped. See the repository-state note in `council/2026-08-28.md`.
2. **OBJ-map-debugger-6** | Un-alias the `interconnectors` and `planned-corridors` panel toggles
   unlocks:  a DC developer can look at operational interconnection separately from speculative planned corridors, instead of one checkbox silently controlling both — `applyLayerVisibility()` routes both ids through `layersFor()` (`docs/app.js:359`), which returns the same five `lyr-grid-*` ids for any `kind === "grid"`, so unchecking either hides both
   evidence: unchecking "Interconnectors" leaves the planned corridors drawn, and vice versa
   size:     M — needs per-layer source and layer ids; splitting required before it is shippable
   risk:     touches the render loop's layer-id bookkeeping, which `wireLayerInteractions()` and `queryableLayers()` both depend on
   **RESOLVED 2026-08-28 inside OBJ-map-debugger-5 (`bb0f017`) — not carried forward.** It was filed as "deliberately not swept into -5", but `map-tester` returned **NO-GO** on -5 precisely because of this aliasing: once -5 made the interconnectors render, unchecking "Planned corridors" visibly erased them. Leaving it open would have shipped a SHIP that failed its own `unlocks:` line, so `layersFor()` was partitioned by data layer in the same commit. Sized M here on the assumption it needed per-layer sources; it did not — the five `lyr-grid-*` layers already partition one source by `status`, so only the id bookkeeping needed splitting. Measured both directions: planned-corridors OFF → hv 2 / idle 1 / planned 0; interconnectors OFF → hv 0 / idle 0 / planned 13; both restore on re-check.
3. **OBJ-map-debugger-7** | Replace or key the CARTO raster basemap — it is serving "API KEY REQUIRED" watermarks in production
   unlocks:  a regulator or DC developer opening the map sees a usable basemap instead of one stamped diagonally "API KEY REQUIRED / carto.com/basemaps/apikey" across every tile — right now the entire geographic context the infrastructure is plotted against is defaced, which is the first thing either audience sees and the fastest possible way to lose a regulator's trust
   evidence: tiles render clean at z5–z12 in both `dark_all` and `light_all`; no watermark text present in a sampled tile
   size:     S–M — depends on the route chosen (see risk); the *diagnosis* is done
   risk:     **this is a decision for the principal, not an unattended run.** Two routes: (a) obtain a CARTO API key — introduces the project's first basemap credential, which `security-engineer` must gate and which cannot live in a keyless static site without exposure; (b) switch to a genuinely keyless raster provider consistent with COUNCIL.md's no-token posture. Route (a) conflicts with the "no token in `docs/`" structural veto in spirit. **Do not ship either route unattended.**
   **Confirmed independently twice on 2026-08-28**, by the executing seat and by `map-tester`: `a`–`d`.basemaps.cartocdn.com, both `dark_all` and `light_all`, return **HTTP 200 with a valid 256×256 PNG** whose painted content is the watermark. Because it is a 200 and not a 4xx, MapLibre loads it happily, `map.loaded()` stays `true`, and nothing errors in the console — so no existing alarm catches it. Note this also invalidates OBJ-map-debugger-3's premise of a "CARTO rate-limit or outage": the failure mode is a *successful* request serving degraded content.
4. **OBJ-map-debugger-3** | Surface a visible error state for mid-session MapLibre runtime failures (`docs/app.js:224`, `map.on("error", ...)`)
   unlocks:  a regulator whose basemap tiles fail mid-session (CARTO rate-limit or outage after a successful load) sees a message explaining the map is degraded, instead of an unexplained frozen/blank canvas — confirmed: `#noTokenCard` is only ever shown from the `initMap()` try/catch (construction-time failure); the runtime `map.on("error", ...)` handler only `console.warn`s
   evidence: a simulated tile failure after successful init surfaces a visible in-page message, not just a console warning
   size:     S
   risk:     low — must not fire on benign/recoverable MapLibre warnings (e.g. missing icon) or it will falsely alarm users on a healthy map
4. **OBJ-map-debugger-2** | Wire `docs/data/morocco/national-hv.geojson` (947 features) and `docs/data/morocco/transmission-lines.geojson` (541 features) into the live map as renderable layers
   unlocks:  a DC developer assessing grid headroom near a candidate site can currently see only 11 editorial grid lines plus whatever OpenInfraMap/OSM happens to have — ~1,488 curated ONEE/WBG transmission features already sit in this repo, fully unrendered, understating the network by orders of magnitude
   evidence: toggling the grid layer renders `national-hv` + `transmission-lines` features; panel layer counts match file feature counts
   size:     L
   risk:     performance (947+541 line features on one MapLibre source), visual clutter against the existing OIM grey grid layer; inherits the unresolved validation status from OBJ-coord-validator-2 — must not ship ahead of it; needs splitting before it is shippable

### map-tester
1. **OBJ-map-tester-1** | Add an orphan-data check: list every `docs/data/morocco/*.geojson` file and flag any with zero references in `docs/countries.config.js`/`docs/app.js`
   unlocks:  the next time a data file is added or a `layers[]` entry is edited, a regulator or DC developer relying on "the map shows what's in `docs/data/`" doesn't silently lose a layer
   evidence: a script/checklist step reports the orphan list; independently re-confirmed 2026-08-28 as exactly 3 — `grid-lines`, `national-hv`, `transmission-lines` (`boundary.geojson` is fetched at `docs/app.js:239` and is not an orphan)
   size:     S
   risk:     none — read-only verification script, no product code changed
2. **OBJ-map-tester-3** | Audit popup field-name mapping against each source file's actual property keys
   unlocks:  a DC developer reading a line's popup can trust that "Precision: approximate" reflects that specific line's real value, not a hardcoded fallback masking a wrong/missing field — confirmed live mismatch: `openLinePopup()` reads `p.precision`, but `national-hv.geojson` only has `coord_confidence` and `transmission-lines.geojson` has neither key
   evidence: a per-layer field-mapping audit confirming every property the popup reads exists under that exact key in every file that layer draws from
   size:     S
   risk:     none — audit only
   **Materially strengthened 2026-08-28:** OBJ-map-debugger-5 proved this exact failure class is already live and undetected — a rendered layer silently disagreeing with the file it claims to draw from. This audit is the standing check that would have caught it.
3. **OBJ-map-tester-2** | Write down what "browser-level evidence" must contain for a release-gate GO (desktop/light/375px console + screenshot requirements)
   unlocks:  a Chair ruling a future SHIP can check a submitted GO against a fixed, written bar instead of a judgment call — closing the gap between `GO-STATIC` ("not shippable"; COUNCIL.md §5) and a real GO
   evidence: a short written checklist enumerating required evidence items, referenced by OBJ id the next time something ships
   size:     S
   risk:     none — documentation-only

### platform-engineer
1. **OBJ-platform-engineer-1** | Add a minimal CI check on push to `main` (no build step, no bundler — pure validation)
   unlocks:  a regulator or DC developer visiting the map right after a bad commit is not served a broken page, because a check runs automatically instead of depending on a human remembering to run map-tester first — confirmed: no `.github/workflows/` directory exists anywhere in the repo
   evidence: a CI config exists that JSON-validates every `docs/data/*.geojson` and checks `docs/index.html`/`docs/app.js` reference only files that exist; fails on a deliberately broken test commit
   size:     M
   risk:     must stay pure shell/validation steps — a careless implementation could itself introduce the build-step/bundler the structural veto forbids
   **Scope sharpened 2026-08-28 by a live hazard:** `wrangler pages deploy docs` publishes the *directory*, not the git index. Six untracked HTML pages now sit under `docs/` and will ship on the next deploy carrying ~40 unreviewed figures ("9 828 MW" generation with a fuel split, "roughly 1 465 MW" data-centre capacity, "roughly 1 085 MW" industrial demand), none of which passed coord-validator or map-tester. The check must cover *what the deploy will publish*, not only what is committed.
2. **OBJ-platform-engineer-3** | Add `docs/_headers` with an explicit cache-control policy for `docs/data/*.geojson`
   unlocks:  a regulator or DC developer who reloads the map right after a data correction ships actually sees the corrected figure, instead of a stale cached copy with no defined expiry — confirmed: no `docs/_headers` file or equivalent exists
   evidence: `docs/_headers` sets an explicit, short max-age (or must-revalidate) on `docs/data/*.geojson`; a fetch immediately after a data commit is confirmed to bypass/refresh the cache
   size:     S
   risk:     low — too short raises origin load, too long reintroduces the stale-data problem; value must be deliberate, not just "0"
3. **OBJ-platform-engineer-2** | Wire an uptime check against the live map URL (`https://atlas-nexus-69o.pages.dev/`, per README.md)
   unlocks:  a regulator or DC developer trying to reach the map during a real outage is not left assuming the map simply doesn't exist for however long it takes someone to notice by hand — confirmed: no scheduled liveness check exists anywhere in the repo
   evidence: a scheduled check exists and something (log/notification) proves it fired at least once
   size:     S
   risk:     low — read-only external HTTP check; must not require a new secret beyond what platform-engineer already holds

### security-engineer
1. **OBJ-security-engineer-1** | Add Subresource Integrity (`integrity=`) hashes to the MapLibre `<script>`/`<link>` tags in `docs/index.html`
   unlocks:  a regulator's or DC developer's browser refuses to execute a tampered `maplibre-gl.js` if unpkg is ever compromised or MITM'd, instead of silently running whatever the CDN serves — confirmed: zero `integrity=` attributes anywhere in `docs/index.html`, and the map has no build step to pin dependencies any other way
   evidence: script/link tags carry a correct `integrity` hash matching the pinned 4.7.1 build; a deliberately wrong test hash causes the browser to block the resource
   size:     S
   risk:     low — hash must be regenerated if the pinned CDN version ever changes
   **Blocked on tree state, not merit (2026-08-28):** `docs/index.html` is dirty with unrelated uncommitted SEO/JSON-LD/OG work. Shippable the moment the tree is clean.
2. **OBJ-security-engineer-3** | Add a Content-Security-Policy via `docs/_headers`
   unlocks:  a regulator's or DC developer's browser blocks/reports any unexpected script origin the moment one is injected, instead of it running silently until someone greps the source by hand — confirmed: no CSP exists anywhere
   evidence: a CSP restricts `script-src`/`style-src`/`connect-src` to the known-good origins (unpkg, fonts.googleapis/gstatic, carto/openstreetmap tile domains); the live page shows zero CSP console violations
   size:     S
   risk:     medium — an overly strict CSP silently breaks the map (blocked tile requests = blank map); must be tested at all three gates before ship, or it causes the exact rung-2 "site down" failure it exists to prevent
3. **OBJ-security-engineer-2** | Disclose the third-party requests the page makes on every load (Google Fonts, unpkg, CARTO/OSM tiles)
   unlocks:  a regulator evaluating whether the map meets the data-protection bar they'd apply to their own agency's tools can see the third-party data flow disclosed on the page, instead of finding it themselves via devtools — confirmed: 3 third-party origins are contacted on every load with zero disclosure
   evidence: the page states which third parties receive a request on load
   size:     S
   risk:     none — documentation-only addition, doesn't change which requests fire
   **Also blocked on dirty `docs/index.html` (2026-08-28).**

---

## Shipped

| Date | Sitting | OBJ | Commit | Unlocks |
|---|---|---|---|---|
| 2026-08-04 | 14:15 | OBJ-frontend-engineer-1 | `c808b1e` | a regulator or DC developer navigating by keyboard/screen reader can toggle which infrastructure layers are visible |
| 2026-08-27 | 12:11 | OBJ-map-debugger-4 | PR #46 (open, unmerged) | a regulator or DC developer in light mode can read the topbar buttons — resting contrast 17.73:1 |
| 2026-08-28 | 10:47 | OBJ-map-debugger-5 | `bb0f017` | a DC developer sizing an export-linked load, and a regulator assessing cross-border transfer capacity, can see the two operational 400 kV Spain–Morocco interconnectors and the idle Algeria–Morocco link — the panel published "Interconnectors — 3" while the map drew zero |

---

## Vetoed (kept — never silently dropped)

| OBJ | Seat | Reason | First proposed | Last reaffirmed | Times vetoed |
|---|---|---|---|---|---|
| OBJ-map-debugger-1 | security-engineer | The objective's own evidence requires "a real, monitored address". No agent may choose which mailbox is published under Reda's name in three public locations; substituting a personal address is an exposure decision reserved to the principal. Corroborating, not the reason: one of the three locations is `docs/index.html`, which is dirty. | 2026-08-03 | 2026-08-28 | 1 |

---

## Blocked — structural (vetoed 3×; may not be re-proposed without a noted change)

_none yet_

---

## Icebox (explicitly deferred, with a stated revisit trigger)

**OBJ-map-debugger-1** | Fix the "Report an error" / "Report a data error" mailto targets in `docs/index.html` and `docs/app.js:968,997`
  unlocks:  a regulator or DC developer who spots a wrong coordinate or stale figure can actually get the correction to land, instead of every "Report an error" click going to `reda.tahiri@example.com` — `example.com` is IANA-reserved for documentation (RFC 2606) and is not a deliverable mailbox; confirmed identical placeholder in all 3 locations, still present 2026-08-28 (`docs/app.js:968`, `docs/app.js:997`, `docs/index.html:164`)
  size:     S
  **Revisit trigger:** Reda names the real monitored mailbox to publish. The objective is sound and the defect is real — only the choice of address is out of the Council's authority. Iceboxed at the 2026-08-28 10:15 sitting to stop it being carried forward as "next-ranked for SHIP" every sitting when no agent can execute it.
  **Note on execution when unblocked:** `docs/index.html` must be clean first, or the two `docs/app.js` occurrences should be split into their own commit.

---

## ID ledger (next number to mint per seat — never reuse or renumber)

| Seat | Next OBJ number |
|---|---|
| frontend-engineer | 5 |
| coord-validator | 4 |
| map-debugger | 8 |
| map-tester | 4 |
| platform-engineer | 4 |
| security-engineer | 4 |
