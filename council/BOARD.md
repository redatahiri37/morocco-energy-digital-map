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

### coord-validator
1. **OBJ-coord-validator-1** | Add a `vintage` field to all 13 features in `docs/data/morocco/industrial.geojson`
   unlocks:  a regulator citing OCP's, Renault's or another site's estimated demand can state which year the estimate is from, instead of it being presented as implicitly current (confirmed: file has `source`/`source_url` on every feature but no date field at all)
   evidence: all 13 features carry a `vintage` property; the popup source-row surfaces it
   size:     S
   risk:     none to the render path — additive property, no schema field renamed; ~1 KB file growth
2. **OBJ-coord-validator-4** | Correct or withdraw the ONEE/WBG source citations on `docs/data/morocco/national-hv.geojson` (947 features) and `docs/data/morocco/transmission-lines.geojson` (541 features)
   unlocks:  a regulator or DC developer who fetches either public file and trusts its stated source (ONEE for one, World Bank Group for the other) is not misled about where the data actually came from — OBJ-coord-validator-2's sample-verify report (delivered 2026-08-11, see minutes) found 98.7% of transmission-lines' features share near-identical geometry with national-hv at a constant ~0.30 km offset across matched vertices, a pattern consistent with one file being mechanically derived from the other rather than two genuinely independent authoritative sources
   evidence: every feature's `source` property in both files reflects the true, disclosed provenance status (verified-ONEE / verified-WBG / unverified-derived, whichever is honest) instead of the current blanket claims; a coord-validator re-check confirms zero features still cite ONEE or WBG without the caveat
   size:     S — both files' `source` values are uniform per-file (confirmed: no per-feature variation), so this is a scripted global rewrite plus a `metadata` note, not 1,488 hand edits
   risk:     none to ship (both files are still unloaded by the live map — see OBJ-map-debugger-2); reputational risk is what's already live if left uncorrected
   note:     supersedes OBJ-coord-validator-2, whose sample-verify report was delivered this sitting (2026-08-11) and is now closed — see council/2026-08-11.md for the full report. OBJ-map-debugger-2 (wiring these files into the live map) stays blocked on this, now more firmly than before: the citation problem is a reason to withdraw, not just a reason to wait.

### map-debugger
1. **OBJ-map-debugger-1** | Fix the "Report an error" / "Report a data error" mailto targets in `docs/index.html:122` and `docs/app.js:968,997`
   unlocks:  a regulator or DC developer who spots a wrong coordinate or stale figure can actually get the correction to land, instead of every "Report an error" click going to `reda.tahiri@example.com` — `example.com` is IANA-reserved for documentation (RFC 2606) and is not a deliverable mailbox, confirmed identical placeholder in all 3 locations
   evidence: mailto target is a real, monitored address in all 3 locations
   size:     S
   risk:     none — string replacement in 2 files, no logic change
   note:     ranked #1 for SHIP at the 2026-08-11 08:00 sitting but not executed — no real, monitored replacement address exists anywhere else in the repo to source from, and an unattended run guessing/publishing a personal email on a public page is a judgment call outside the autonomous budget's authority. Needs the site owner to supply the actual address before this can ship.
2. **OBJ-map-debugger-2** | Wire `docs/data/morocco/national-hv.geojson` (947 features) and `docs/data/morocco/transmission-lines.geojson` (541 features) into the live map as renderable layers
   unlocks:  a DC developer assessing grid headroom near a candidate site can currently see only 11 editorial grid lines (3 interconnectors + 8 planned corridors) plus whatever OpenInfraMap/OSM happens to have — ~1,488 curated ONEE/WBG transmission features already sit in this repo, fully unrendered, understating the network by orders of magnitude
   evidence: toggling the grid layer renders `national-hv` + `transmission-lines` features; panel layer counts match file feature counts
   size:     L
   risk:     performance (947+541 line features on one MapLibre source), visual clutter against the existing OIM grey grid layer, and — as of 2026-08-11 — it now inherits a confirmed citation-integrity problem, not just an unresolved-validation status: blocked on OBJ-coord-validator-4, not merely waiting on it
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
2. **OBJ-map-tester-3** | Audit popup field-name mapping against each source file's actual property keys
   unlocks:  a DC developer reading a line's popup can trust that "Precision: approximate" reflects that specific line's real value, not a hardcoded fallback masking a wrong/missing field — confirmed live mismatch: `openLinePopup()` (`docs/app.js`) reads `p.precision`, but `national-hv.geojson` only has `coord_confidence` and `transmission-lines.geojson` has neither key at all, so the popup would silently show the hardcoded default "approximate" for both once rendered
   evidence: a per-layer field-mapping audit confirming every property the popup reads exists under that exact key in every file that layer draws from
   size:     S
   risk:     none — audit only; the fix belongs to whichever objective wires those layers in (OBJ-map-debugger-2)

### platform-engineer
1. **OBJ-platform-engineer-1** | Add a minimal CI check on push to `main` (no build step, no bundler — pure validation)
   unlocks:  a regulator or DC developer visiting the map right after a bad commit is not served a broken page, because a check runs automatically instead of depending on a human remembering to run map-tester first — confirmed: no `.github/workflows/` directory exists anywhere in the repo
   evidence: a CI config exists (e.g. GitHub Action) that JSON-validates every `docs/data/*.geojson` and checks `docs/index.html`/`docs/app.js` reference only files that exist; fails the check on a deliberately broken test commit
   size:     S — rescoped from M on 2026-08-11: platform-engineer's REPORT delivered a complete, ready-to-commit `.github/workflows/docs-ci.yml` (3 checks: GeoJSON validity, `node --check` on both JS files, referenced-file-exists audit; zero installs beyond checkout, no build step) — see council/2026-08-11.md for the full draft YAML and red-test plan
   risk:     must stay pure shell/validation steps — a careless implementation could itself introduce the build-step/bundler the structural veto forbids; low now that the concrete YAML exists and was reasoned through against that constraint
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

## Shipped

| Date | Sitting | OBJ | Commit | Unlocks |
|---|---|---|---|---|
| 2026-08-04 | 14:15 | OBJ-frontend-engineer-1 | `c808b1e` | a regulator or DC developer navigating by keyboard/screen reader can toggle which infrastructure layers are visible |
| 2026-08-11 | 08:00 | OBJ-coord-validator-3 | *(this sitting's branch — see council/2026-08-11.md)* | a developer or regulator fetching `docs/data/` directly no longer finds a stale, unmaintained duplicate of `interconnectors.geojson`/`planned-corridors.geojson` that could silently drift |

---

## Vetoed (kept — never silently dropped)

| OBJ | Seat | Reason | First proposed | Last reaffirmed | Times vetoed |
|---|---|---|---|---|---|
| OBJ-map-tester-2 | map-tester | Chair — North Star Test fail (COUNCIL.md §6): `unlocks:` named "a Chair ruling a future SHIP," i.e. the Council itself, not a regulator or DC developer doing their job. Sat un-caught on the Board for 2 prior sittings before this rejection. | 2026-08-03 | 2026-08-04 | 1 |

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
