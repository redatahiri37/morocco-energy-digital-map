# Council Board

The Atlas Nexus Council's **standing memory — current state, not history.**
See [README.md](./README.md) for how this differs from the daily minutes
files, and [COUNCIL.md](../COUNCIL.md) §8 for the rules that govern it.

**Read this before proposing objectives. Pull from here; don't reinvent.**

---

## In Progress (WIP limit: 1)

_none._

<details>
<summary>OBJ-map-debugger-5 — root-cause record (NOT shipped — corrected 2026-09-15, see Awaiting merge)</summary>

**OBJ-map-debugger-5** | Merge `interconnectors` + `planned-corridors` into a single `src-grid` build so the interconnectors stop being destroyed on load

  Root cause, confirmed by source reading on `origin/main` as of 2026-09-15
  (the bug is **still live in production** — `main`'s `docs/app.js:527-531`
  is unchanged since commit `4100942`):
  - `buildLineLayer(dataLayerId, fc)` (`docs/app.js:527`) ignores `dataLayerId` and hardcodes `const srcId = "src-grid"`.
  - `addOrReplace` (`docs/app.js:522-524`) is `removeSource` + `addSource` — a destructive replace, not a merge.
  - Called at `docs/app.js:490` with `interconnectors` (3 features), then at `docs/app.js:494` with `planned-corridors` (8 features). The second call destroys the first.
  - Net effect on `main` right now: the layer panel publishes "Interconnectors — 3" (count read straight from the file, `docs/app.js:289`) while the map renders zero of them.

  **Corrected 2026-09-15.** The 2026-08-28 10:47 sitting shipped a fix as
  commit `bb0f017` on branch `council/2026-08-28-1047` and the Board recorded
  it as "Shipped." That was wrong: the PR carrying it (**#47**) was **closed
  without merging** on 2026-08-29, superseded by **#48**, which carries a
  different (and better — per-source, not shared-source) implementation of
  the same fix originally authored in **#24** on 2026-08-12. `bb0f017` is a
  dead end on an unmerged branch; treat it as historical only. The live,
  mergeable fix is in **PR #48** — see Awaiting merge, below.

</details>

---

## Awaiting merge (COUNCIL.md §9 rule 4 — code done, gated, sitting in an open PR; may NOT be re-proposed or re-implemented)

**PR #48** — `council/consolidation-2026-08-28` → `main`. Open since 2026-08-29
(~17 days), state **MERGEABLE / CLEAN**, +8212/−562 across 26 files
(`docs/**` + `council/**`). Carries `map-tester` **GO** in its own
description (real Chrome 151 over CDP, console clean, counterfactual
verified against pristine `origin/main`). This is a **human merge decision**,
not something any seat can execute — it bundles 26 files and is far past S
size as a unit, even though each objective inside it was individually gated.

Objectives it resolves (do not re-propose these until #48 either merges or
is explicitly rejected):

| OBJ | Resolved via | What it does |
|---|---|---|
| OBJ-map-debugger-5 | PR #24 (bundled) | Per-source split of `src-grid`; interconnectors stop being destroyed by planned-corridors. **This is rung 1, still live on `main` today.** |
| OBJ-map-debugger-1 | PR #13 (bundled) | "Report an error" → GitHub issues, not a mailbox. Different route than the vetoed/iceboxed mailbox idea — no personal address published. |
| OBJ-map-debugger-4 | PR #46 (bundled) | Light-theme topbar contrast fix, 17.73:1. (PR #46 itself is also closed/unmerged — this is the only surviving path for this fix.) |
| OBJ-coord-validator-3 | PR #17 (bundled) | Deletes unfetched `grid-lines.geojson` (−411 lines). Does **not** touch `docs/app.js:86` (the re-scoping from 2026-08-28 holds). |
| OBJ-coord-validator-1 | PR #19 (bundled) | **Re-sized S→M by the PR itself**: ships popup display support only, does *not* write an undated `"vintage": "2026"` value (that half was refused inside #48's own gate for breaching the truth veto — no per-feature date is derivable from any in-repo citation). |
| OBJ-security-engineer-2 | PR #18 (bundled) | Third-party request disclosure on the page. No longer blocked on dirty `docs/index.html` in this implementation (built on a clean base). |
| OBJ-platform-engineer-1 | PR #42 (bundled) | CI validation workflow (pure shell, no build step per the structural veto). |

**Merge-queue alarm — COUNCIL.md §9 rule 5, triggered.** Seven SHIPs are
`Awaiting merge` in a single open PR, several times over the "three or more"
threshold. **No new SHIP may be approved by this Council until PR #48 (or
an equivalent split of it) lands.** This is not a judgment call — it is
disclosed plainly in this sitting's minutes per the rule's own requirement.

Two further objectives were minted by `map-tester`'s own gate of #48 (not
yet fixed by it — confirmed pre-existing on `main` and on the live site,
not a regression from the bundle):

- **OBJ-map-debugger-8** (new, see Docketed) — digital-infrastructure layer renders zero features though `src-digital` holds 10 and 9 are in the viewport. Same panel-says-N/map-draws-zero class as OBJ-map-debugger-5, live on `main` right now.
- **OBJ-map-tester-4** (new, see Docketed) — bold map labels 404 against `demotiles.maplibre.org`.

Also unresolved by #48 and separately flagged inside it: **OBJ-map-debugger-7**
(CARTO "API KEY REQUIRED" watermark) — needs a principal decision, explicitly
not shipped by #48 either.

---

## Docketed — ranked, waiting to be picked (WIP limit: 5 per seat)

### frontend-engineer
1. **OBJ-frontend-engineer-3** | Give `.topbar` explicit overflow handling at ≤375px in `docs/style.css`
   unlocks:  a DC developer checking the map on a phone can reach every topbar control (country switch, Methodology, GitHub, theme toggle) without one being clipped off-screen
   evidence: at 375px width `document.body.scrollWidth` equals the viewport width (currently measured 690 vs a 375 viewport) and no topbar control is clipped or unreachable — the evidence line must assert `body.scrollWidth`, not just the absence of a page-level scrollbar, per the 2026-08-28 correction
   size:     S
   risk:     low — layout-only change scoped to the existing 375px media query
   **Severity raised twice across two sittings; still unresolved, not touched by PR #48.**
2. **OBJ-frontend-engineer-4** | Show an explicit empty state on a layer row whose source renders zero features
   unlocks:  a DC developer who toggles a layer on and sees nothing can tell "this infrastructure is not in the data here" apart from "this layer is broken" — the exact class of failure both OBJ-map-debugger-5 and the newly found OBJ-map-debugger-8 prove is live in production right now
   evidence: a layer whose rendered feature count is zero shows a distinct state in `#layerList`, not a plain count
   size:     S
   risk:     low — must read the rendered count, not `fc.features.length`, or it reproduces the exact blindness it exists to remove
3. **OBJ-frontend-engineer-2** | Add a visible loading state to `#layerList`/`#kpiGrid` while `loadAllData()` awaits its fetches in `docs/app.js`
   unlocks:  a DC developer on a slow connection doesn't mistake "still loading" for "this map has no data" and leave before the layers finish loading
   evidence: throttled-network reload shows a loading indicator in the panel between first paint and the first rendered layer row, not a blank sidebar
   size:     S
   risk:     low — additive UI only, no change to fetch logic

### coord-validator
1. **OBJ-coord-validator-2** | Sample-verify `docs/data/morocco/national-hv.geojson` (947 ONEE 60 kV line features) and `docs/data/morocco/transmission-lines.geojson` (541 WBG line features)
   unlocks:  a regulator who directly fetches either public file (both cite ONEE/WBG as authoritative) can trust the routing, or the map withdraws the citation — instead of the map silently hosting 1,488 "ONEE/WBG-sourced" line segments that have never been checked
   evidence: a coord-validator report with a stated sample size and a FAIL/PASS/UNVERIFIED count; features are anonymously named, so this needs a bbox/topology/endpoint-cluster method, not Nominatim named-lookup
   size:     M
   risk:     none to ship (read-only); reputational risk is what's already live
   **Only genuinely open coord-validator item this sitting** — OBJ-coord-validator-1 and -3 are now Awaiting merge in PR #48 (see above) and may not be re-proposed per COUNCIL.md §9 rule 4. Oldest unresolved item on the Board; blocks OBJ-map-debugger-2 (L).

### map-debugger
1. **OBJ-map-debugger-8** | Fix the digital-infrastructure layer rendering zero features despite `src-digital` holding 10, 9 of which are in the default viewport — NEW, discovered 2026-08-29 by `map-tester`'s gate of PR #48, confirmed pre-existing on `main` and live today
   unlocks:  a DC developer looking for existing data-centre/fibre infrastructure sees the panel claim data exists and the map show nothing — on the single layer category the map most exists to answer for a siting question
   evidence: toggling "Digital infrastructure" on renders visible points/cables matching the panel's count; identify whether this is the same destructive-overwrite class as OBJ-map-debugger-5 or a distinct cause
   size:     S–M, diagnosis not yet done by this Council
   risk:     unknown until root-caused; likely render-path only, no data change
2. **OBJ-map-debugger-7** | Replace or key the CARTO raster basemap — it is serving "API KEY REQUIRED" watermarks in production
   unlocks:  a regulator or DC developer opening the map sees a usable basemap instead of one stamped diagonally "API KEY REQUIRED" across every tile — the first thing either audience sees
   evidence: tiles render clean at z5–z12 in both `dark_all` and `light_all`; no watermark text present in a sampled tile
   size:     S–M depending on route chosen; diagnosis is done
   risk:     **principal decision required, not unattended.** (a) obtain a CARTO key — introduces the project's first basemap credential; (b) switch to a genuinely keyless provider. Confirmed independently three times now (2026-08-28 twice, and again inside PR #48's gate) that it is a *successful* 200 response serving degraded content, so no existing alarm catches it.
3. **OBJ-map-debugger-3** | Surface a visible error state for mid-session MapLibre runtime failures (`docs/app.js:224`, `map.on("error", ...)`)
   unlocks:  a regulator whose basemap tiles fail mid-session sees a message explaining the map is degraded, instead of an unexplained frozen/blank canvas
   evidence: a simulated tile failure after successful init surfaces a visible in-page message, not just a console warning
   size:     S
   risk:     low — must not fire on benign/recoverable MapLibre warnings or it will falsely alarm users on a healthy map
4. **OBJ-map-debugger-2** | Wire `docs/data/morocco/national-hv.geojson` (947) and `docs/data/morocco/transmission-lines.geojson` (541) into the live map as renderable layers
   unlocks:  a DC developer assessing grid headroom near a candidate site can currently see only 11 editorial grid lines plus whatever OSM happens to have — ~1,488 curated ONEE/WBG features sit in this repo, fully unrendered
   evidence: toggling the grid layer renders `national-hv` + `transmission-lines` features; panel layer counts match file feature counts
   size:     L
   risk:     performance, visual clutter; inherits the unresolved validation status from OBJ-coord-validator-2 — must not ship ahead of it; needs splitting
   **OBJ-map-debugger-4, -5, -6, -1 removed from this list — -4/-5/-1 are Awaiting merge in PR #48 (see above), -6 was resolved inside `bb0f017`'s work (itself now superseded by #48's equivalent fix) and is not carried forward.**

### map-tester
1. **OBJ-map-tester-3** | Audit popup field-name mapping against each source file's actual property keys
   unlocks:  a DC developer reading a line's popup can trust that "Precision: approximate" reflects that specific line's real value, not a hardcoded fallback masking a wrong/missing field — confirmed live mismatch: `openLinePopup()` reads `p.precision`, but `national-hv.geojson` only has `coord_confidence` and `transmission-lines.geojson` has neither key
   evidence: a per-layer field-mapping audit confirming every property the popup reads exists under that exact key in every file that layer draws from
   size:     S
   risk:     none — audit only
   **Materially strengthened twice now** — both OBJ-map-debugger-5 and OBJ-map-debugger-8 are live instances of "a rendered layer silently disagrees with the file it claims to draw from." This audit is the standing check that would catch the whole class.
2. **OBJ-map-tester-4** | Fix bold map labels 404ing against `demotiles.maplibre.org` — NEW, discovered 2026-08-29 during `map-tester`'s gate of PR #48
   unlocks:  a regulator or DC developer relying on bold place-name labels for orientation doesn't silently lose them to a broken font-glyph request
   evidence: no 404 against `demotiles.maplibre.org` in the network panel; bold labels render
   size:     S
   risk:     low — likely a font-stack/glyph-URL fix only
3. **OBJ-map-tester-1** | Add an orphan-data check: list every `docs/data/morocco/*.geojson` file and flag any with zero references in the load path
   unlocks:  the next time a data file is added or a `layers[]` entry is edited, a regulator or DC developer relying on "the map shows what's in `docs/data/`" doesn't silently lose a layer
   evidence: a script/checklist step reports the orphan list; currently exactly 3 (`grid-lines`, `national-hv`, `transmission-lines`)
   size:     S
   risk:     none — read-only verification script

### platform-engineer
1. **OBJ-platform-engineer-3** | Add `docs/_headers` with an explicit cache-control policy for `docs/data/*.geojson`
   unlocks:  a regulator or DC developer who reloads the map right after a data correction ships actually sees the corrected figure, instead of a stale cached copy with no defined expiry
   evidence: `docs/_headers` sets an explicit, short max-age (or must-revalidate) on `docs/data/*.geojson`; a fetch immediately after a data commit is confirmed to bypass/refresh the cache
   size:     S
   risk:     low — value must be deliberate, not just "0"
2. **OBJ-platform-engineer-2** | Wire an uptime check against the live map URL (`https://atlas-nexus-69o.pages.dev/`)
   unlocks:  a regulator or DC developer trying to reach the map during a real outage is not left assuming the map simply doesn't exist for however long it takes someone to notice by hand
   evidence: a scheduled check exists and something (log/notification) proves it fired at least once
   size:     S
   risk:     low — read-only external HTTP check
   **OBJ-platform-engineer-1 removed from this list — Awaiting merge in PR #48 (see above).** Only two genuinely open items this sitting; no third was invented rather than pad the docket with an unobserved item (COUNCIL.md: a new objective is only for something actually observed).

### security-engineer
1. **OBJ-security-engineer-3** | Add a Content-Security-Policy via `docs/_headers`
   unlocks:  a regulator's or DC developer's browser blocks/reports any unexpected script origin the moment one is injected, instead of it running silently until someone greps the source by hand
   evidence: a CSP restricts `script-src`/`style-src`/`connect-src` to the known-good origins; the live page shows zero CSP console violations
   size:     S
   risk:     medium — an overly strict CSP silently breaks the map (blocked tile requests = blank map); must be tested at all three gates or it causes the exact rung-2 failure it exists to prevent
2. **OBJ-security-engineer-1** | Add Subresource Integrity (`integrity=`) hashes to the MapLibre `<script>`/`<link>` tags in `docs/index.html`
   unlocks:  a regulator's or DC developer's browser refuses to execute a tampered `maplibre-gl.js` if unpkg is ever compromised or MITM'd, instead of silently running whatever the CDN serves
   evidence: script/link tags carry a correct `integrity` hash matching the pinned 4.7.1 build; a deliberately wrong test hash causes the browser to block the resource
   size:     S
   risk:     low — hash must be regenerated if the pinned CDN version ever changes
   **Still blocked on tree state, not merit, re-confirmed 2026-09-15:** `docs/index.html` remains dirty (unrelated uncommitted SEO/JSON-LD/OG work). Shippable the moment the tree is clean. **OBJ-security-engineer-2 removed from this list — Awaiting merge in PR #48 (a clean-tree implementation resolves the block, see above).**

---

## Shipped

| Date | Sitting | OBJ | Commit | Unlocks |
|---|---|---|---|---|
| 2026-08-04 | 14:15 | OBJ-frontend-engineer-1 | `c808b1e` (confirmed on `origin/main`) | a regulator or DC developer navigating by keyboard/screen reader can toggle which infrastructure layers are visible |

**Corrected 2026-09-15.** Two rows previously listed here were removed
because they were never true: **OBJ-map-debugger-4** (claimed via PR #46)
and **OBJ-map-debugger-5** (claimed via `bb0f017`/PR #47) were both recorded
as "Shipped" by prior sittings while their PRs were, in fact, **closed
without merging**. Neither commit is reachable from `origin/main`. Verified
directly: `origin/main`'s `docs/app.js` is byte-for-byte the version from
`4100942`, still carrying the OBJ-map-debugger-5 defect live in production
today. Both objectives are corrected to **Awaiting merge** (see above),
where a different, gated implementation of each already exists in PR #48.
**Lesson for future sittings: "Shipped" means merged to `origin/main`,
verified by `git log origin/main`, never inferred from a local branch or a
minutes file.**

---

## Vetoed (kept — never silently dropped)

| OBJ | Seat | Reason | First proposed | Last reaffirmed | Times vetoed |
|---|---|---|---|---|---|
| OBJ-map-debugger-1 (mailbox route) | security-engineer | The objective's own evidence requires "a real, monitored address". No agent may choose which mailbox is published under Reda's name in three public locations; substituting a personal address is an exposure decision reserved to the principal. | 2026-08-03 | 2026-08-28 | 1 |

Note: a **different** implementation of OBJ-map-debugger-1 (GitHub issues
route, no mailbox) is Awaiting merge in PR #48 — see above. The veto above
applies only to the mailbox approach and stands.

---

## Blocked — structural (vetoed 3×; may not be re-proposed without a noted change)

_none yet_

---

## Icebox (explicitly deferred, with a stated revisit trigger)

**OBJ-map-debugger-1 (mailbox route)** | Fix the "Report an error" / "Report a data error" mailto targets in `docs/index.html` and `docs/app.js:968,997`
  unlocks:  a regulator or DC developer who spots a wrong coordinate or stale figure can actually get the correction to land, instead of every "Report an error" click going to `reda.tahiri@example.com`
  size:     S
  **Revisit trigger:** Reda names the real monitored mailbox to publish. Superseded in practice by the GitHub-issues implementation Awaiting merge in PR #48, which needs no mailbox decision at all.

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
