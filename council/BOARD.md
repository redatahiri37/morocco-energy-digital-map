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
   risk:     **severity raised twice.** (1) The 2026-08-27 sitting found 3 of 4 topbar controls sit *fully off-screen and unreachable* at 375px, not merely clipped. (2) Measured 2026-08-28: `document.documentElement.scrollWidth` is 375 — so the evidence line above **passes while the bug is live** — but `document.body.scrollWidth` is **690**. The evidence line must assert control reachability and `body.scrollWidth`, or this can be closed without fixing anything. Otherwise low — layout-only change scoped to the existing 375px media query; `.topbar` is `display:flex` with `gap` and no `flex-wrap`/`overflow-x` today (confirmed by reading `docs/style.css:77-84,546-548`)
   note (2026-08-27 12:11): independently reproduced live via Playwright, A/B tested against baseline (`git stash`) to confirm pre-existing, not a regression — `document.body.scrollWidth` is 600 vs `clientWidth` 375 at 375px width; `html`/`body` have `overflow-x:hidden` so no page-level scrollbar appears, but the topbar itself is not a scroll container and has no wrap/collapse, so **Methodology, GitHub, and the theme-toggle are genuinely unreachable off-screen (x = 387–600px)** — only "Solaire" is visible. This is worse than "clipped"; it's fully inaccessible. Raises this objective's real-world severity; still S, still next in line for a SHIP slot.

### coord-validator
1. **OBJ-coord-validator-1** | Establish a defensible `vintage` for the 13 features in `docs/data/morocco/industrial.geojson`
   unlocks:  a regulator citing OCP's or Renault's estimated demand can state which year the estimate is from, instead of it being presented as implicitly current
   evidence: every feature carries a `vintage` traceable to a dated citation, **or** the page states plainly that the estimates are undated
   size:     M — **re-sized from S on 2026-08-28**
   risk:     **truth veto.** The popup display support shipped in this consolidation (`source · vintage`), but the data half did **not**. PR #19 proposed writing `"vintage": "2026"` on all 13 features; all 13 `source_url` values are undated corporate homepages (`ocpgroup.ma/en`, `sonasid.ma`, `lafargeholcim.ma`, `media.renault.com`, `stellantis.com`, `managemgroup.com`), so that year is derivable from no citation in the repo and publishing it would breach COUNCIL.md §5. Either do the per-site research (M), or record an honest "undated" and say so on the page.
2. **OBJ-coord-validator-2** | Sample-verify `docs/data/morocco/national-hv.geojson` (947 ONEE 60 kV line features, `coord_method: osm_derived`) and `docs/data/morocco/transmission-lines.geojson` (541 WBG line features)
   unlocks:  a regulator who directly fetches either public file (both cite ONEE/WBG as authoritative) can trust the routing, or the map withdraws the citation — instead of the map silently hosting 1,488 "ONEE/WBG-sourced" line segments that have never been checked, because neither file is loaded by `docs/app.js`/`docs/countries.config.js` (confirmed: zero references anywhere in the load path)
   evidence: a coord-validator report with a stated sample size and a FAIL/PASS/UNVERIFIED count — note: features are anonymously named ("ONEE 60 kV line" ×947), so the standard Nominatim/Wikipedia named-lookup method doesn't apply; needs a bbox/topology/endpoint-cluster method instead
   size:     M
   risk:     none to ship (read-only); reputational risk is what's already live — two unchecked "ONEE/WBG" -sourced files sitting in production
### map-debugger
1. **OBJ-map-debugger-8** | Digital-infrastructure layer renders zero features although its source holds 10
   unlocks:  a DC developer opening the map to look at data centres — the single audience the map most exists for — actually sees them; today `Digital infrastructure` reads "10" in the panel and draws nothing, which is the same panel-says-N/map-draws-zero class of defect as OBJ-map-debugger-5 and misleads exactly the same way
   evidence: `lyr-dig-points` returns a non-zero `queryRenderedFeatures` count with 9 features inside the viewport
   size:     S–M — unknown until the cause is found
   risk:     none to diagnose
   **Found 2026-08-29 by map-tester while gating the consolidation.** `src-digital` holds 10 features, 9 are inside the viewport, and `lyr-dig-points` / `lyr-dig-halo` / `lyr-dig-cables` all report `visibility: "visible"` — yet all three render **0**. Confirmed **identical on the live site and on `origin/main`**, so it is pre-existing and was explicitly not treated as a gate failure for that bundle. Rung 3, and arguably rung 1 given the panel publishes a count the map does not draw.
2. **OBJ-map-debugger-7** | Replace or key the CARTO raster basemap — it is serving "API KEY REQUIRED" watermarks in production
   unlocks:  a regulator or DC developer opening the map sees a usable basemap instead of one stamped diagonally "API KEY REQUIRED / carto.com/basemaps/apikey" across every tile — the entire geographic context the infrastructure is plotted against is defaced, and it is the first thing either audience sees
   evidence: tiles render clean at z5–z12 in both `dark_all` and `light_all`; no watermark text in a sampled tile
   size:     S–M depending on route; the diagnosis is done
   risk:     **decision reserved to the principal.** Route (a) obtain a CARTO API key — introduces the project's first basemap credential, which cannot live in a keyless static site without exposure and conflicts with the no-token posture for `docs/`. Route (b) switch to a genuinely keyless raster provider. **Do not ship either unattended.**
   Confirmed independently twice on 2026-08-28: all four `basemaps.cartocdn.com` subdomains, both `dark_all` and `light_all`, return **HTTP 200 with a valid 256×256 PNG** whose painted content is the watermark. Because it is a 200 and not a 4xx, MapLibre loads it, `map.loaded()` stays `true`, and nothing errors — so no existing alarm catches it. This also invalidates OBJ-map-debugger-3's premise of a "CARTO rate-limit or outage": the failure mode is a *successful* request serving degraded content.
3. **OBJ-map-debugger-2** | Wire `docs/data/morocco/national-hv.geojson` (947 features) and `docs/data/morocco/transmission-lines.geojson` (541 features) into the live map as renderable layers
   unlocks:  a DC developer assessing grid headroom near a candidate site can currently see only 11 editorial grid lines (3 interconnectors + 8 planned corridors) plus whatever OpenInfraMap/OSM happens to have — ~1,488 curated ONEE/WBG transmission features already sit in this repo, fully unrendered, understating the network by orders of magnitude
   evidence: toggling the grid layer renders `national-hv` + `transmission-lines` features; panel layer counts match file feature counts
   size:     L
   risk:     performance (947+541 line features on one MapLibre source), visual clutter against the existing OIM grey grid layer, and it inherits the unresolved validation status from OBJ-coord-validator-2 — must not ship ahead of that; needs splitting before it is shippable
4. **OBJ-map-debugger-3** | Surface a visible error state for mid-session MapLibre runtime failures (`docs/app.js:224`, `map.on("error", ...)`)
   unlocks:  a regulator whose basemap tiles fail mid-session (CARTO rate-limit or outage after a successful load) sees a message explaining the map is degraded, instead of an unexplained frozen/blank canvas — confirmed: `#noTokenCard` is only ever shown from the `initMap()` try/catch (construction-time failure); the runtime `map.on("error", ...)` handler only `console.warn`s
   evidence: a simulated tile failure after successful init surfaces a visible in-page message, not just a console warning
   size:     S
   risk:     low — must not fire on benign/recoverable MapLibre warnings (e.g. missing icon) or it will falsely alarm users on a healthy map

### map-tester
1. **OBJ-map-tester-4** | Fix the missing bold map-label glyphs (404s on `demotiles.maplibre.org`)
   unlocks:  a regulator reading place names on the map sees the labels the design intends, instead of bold labels silently failing to paint
   evidence: zero 404s for `.../font/...` on load
   size:     S
   risk:     low — a font-stack string change; `Noto Sans Bold` is confirmed HTTP 200 on that host whereas `Open Sans Bold,Arial Unicode MS Bold` is 404
   **Found 2026-08-29 by map-tester.** Pre-existing on `origin/main` and on the live site; the consolidation touches zero glyph/`text-font` lines.
2. **OBJ-map-tester-1** | Add an orphan-data check: list every `docs/data/morocco/*.geojson` file and flag any with zero references in `docs/countries.config.js`/`docs/app.js`
   unlocks:  the next time a data file is added or a `layers[]` entry is edited, a regulator or DC developer relying on "the map shows what's in `docs/data/`" doesn't silently lose a layer — this sitting only caught 3 orphans (`grid-lines`, `national-hv`, `transmission-lines`) by manual grep
   evidence: a script/checklist step reports the orphan list; currently returns 3 (see OBJ-map-debugger-2, OBJ-coord-validator-3)
   size:     S
   risk:     none — read-only verification script, no product code changed
3. **OBJ-map-tester-2** | Write down what "browser-level evidence" must contain for a release-gate GO (desktop/light/375px console + screenshot requirements)
   unlocks:  a Chair ruling a future SHIP can check a submitted GO against a fixed, written bar instead of a judgment call — closing the gap between `GO-STATIC` ("not shippable"; COUNCIL.md §5) and a real GO
   evidence: a short written checklist enumerating required evidence items, referenced by OBJ id the next time something ships
   size:     S
   risk:     none — documentation-only
   flag (2026-08-27 12:11): `unlocks:` names the Chair, not a regulator or DC developer — fails COUNCIL.md §6's admissibility rule. Disqualified from ranking until map-tester rewords it to name whose trust in a shipped fix actually depends on a real evidence bar (e.g. a regulator who has been burned by an unverified "it works" claim). The underlying need is real; only the framing is inadmissible.
4. **OBJ-map-tester-3** | Audit popup field-name mapping against each source file's actual property keys
   unlocks:  a DC developer reading a line's popup can trust that "Precision: approximate" reflects that specific line's real value, not a hardcoded fallback masking a wrong/missing field — confirmed live mismatch: `openLinePopup()` (`docs/app.js`) reads `p.precision`, but `national-hv.geojson` only has `coord_confidence` and `transmission-lines.geojson` has neither key at all, so the popup would silently show the hardcoded default "approximate" for both once rendered
   evidence: a per-layer field-mapping audit confirming every property the popup reads exists under that exact key in every file that layer draws from
   size:     S
   risk:     none — audit only; the fix belongs to whichever objective wires those layers in (OBJ-map-debugger-2)

### platform-engineer
1. **OBJ-platform-engineer-2** | Wire an uptime check against the live map URL (`https://atlas-nexus-69o.pages.dev/`, per README.md)
   unlocks:  a regulator or DC developer trying to reach the map during a real outage is not left assuming the map simply doesn't exist for however long it takes someone to notice by hand — confirmed: no scheduled liveness check exists anywhere in the repo
   evidence: a scheduled check exists and something (log/notification) proves it fired at least once
   size:     S
   risk:     low — read-only external HTTP check; must not require a new secret beyond what platform-engineer already holds
2. **OBJ-platform-engineer-3** | Add `docs/_headers` with an explicit cache-control policy for `docs/data/*.geojson`
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
2. **OBJ-security-engineer-3** | Add a Content-Security-Policy via `docs/_headers`
   unlocks:  a regulator's or DC developer's browser blocks/reports any unexpected script origin the moment one is injected (e.g. a compromised dependency or a future accidental tracker), instead of it running silently until someone greps the source by hand — confirmed: no CSP exists anywhere (`docs/index.html` has no CSP meta tag, and no `docs/_headers` file exists at all)
   evidence: a CSP restricts `script-src`/`style-src`/`connect-src` to the known-good origins (unpkg, fonts.googleapis/gstatic, carto/openstreetmap tile domains); the live page shows zero CSP console violations
   size:     S
   risk:     medium — an overly strict CSP silently breaks the map (blocked tile requests = blank map); must be tested at all three gates before ship, or it causes the exact rung-2 "site down" failure it exists to prevent

---

## Shipped

| Date | Sitting | OBJ | Commit | Unlocks |
|---|---|---|---|---|
| 2026-08-04 | 14:15 | OBJ-frontend-engineer-1 | `c808b1e` | a regulator or DC developer navigating by keyboard/screen reader can toggle which infrastructure layers are visible |
| 2026-08-06 | 00:04 | OBJ-map-debugger-1 | consolidation | a regulator or DC developer who spots a wrong figure can file a correction that actually lands — "Report an error" now opens a GitHub issue instead of a dead `example.com` mailto. **Resolved differently than specified:** the objective asked for "a real, monitored address"; publishing a personal mailbox was declined by the principal, so the route is the public issue tracker |
| 2026-08-11 | 08:00 | OBJ-coord-validator-3 | consolidation | a regulator following the site's own "fetch it directly" instruction cannot land on `grid-lines.geojson`, an unmaintained duplicate that already published conflicting routes for the same named WBG lines |
| 2026-08-11 | 12:55 | OBJ-security-engineer-2 | consolidation | a regulator evaluating the map against their own agency's data-protection bar can read which third parties the page contacts on load, on the page itself |
| 2026-08-12 | 18:00 | OBJ-map-debugger-5 | consolidation | a DC developer sizing an export-linked load, and a regulator assessing cross-border transfer capacity, can see the two operational 400 kV Spain–Morocco interconnectors and the idle Algeria–Morocco link — the panel published "Interconnectors — 3" while the map drew zero |
| 2026-08-20 | 23:00 | OBJ-platform-engineer-1 | consolidation | a regulator visiting right after a bad commit is not served a broken page — GeoJSON and reference validation now run in CI. **Note:** sized M on the Board; an M is not eligible for an autonomous SHIP slot and this shipped anyway |
| 2026-08-27 | 12:11 | OBJ-map-debugger-4 | consolidation | a regulator or DC developer using light mode can read the Solaire/Methodology/GitHub/theme-toggle buttons instead of white-on-white text — resting contrast 17.73:1 |

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

| OBJ | Deferred because | Revisit trigger |
|---|---|---|
| **OBJ-map-debugger-1** *(the mailbox half)* | The objective's original evidence line demanded "a real, monitored address". Seven separate sittings executed that by publishing the principal's personal Gmail in three public locations on a crawled site; two later sittings refused on the grounds that it is a one-way disclosure decision reserved to the principal. Asked directly on 2026-08-28, the principal declined. The *functional* half is shipped — reports route to the GitHub issue tracker. | The principal supplies a dedicated address they are willing to publish. Until then, **no agent may substitute any mailbox.** |

---

## ID ledger (next number to mint per seat — never reuse or renumber)

| Seat | Next OBJ number |
|---|---|
| frontend-engineer | 5 |
| coord-validator | 4 |
| map-debugger | 9 |
| map-tester | 5 |
| platform-engineer | 4 |
| security-engineer | 4 |
