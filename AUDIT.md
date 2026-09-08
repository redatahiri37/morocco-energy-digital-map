# Code audit — Atlas Nexus / Atlas Solar

Scope: every executable file in the repository — `js/*.js` + root `index.html`
(the Mapbox root app), `docs/*.js` + `docs/index.html` (the live MapLibre map),
`solar/*.js` + `solar/index.html` (the PV estimator), `solar/proxy/worker.js`
(the Cloudflare Worker), and all of `scripts/` and `data/scripts/`.

Method: full read of all 3 969 lines of application code, schema extraction from
all 22 committed GeoJSON files, execution of the tariff/ROI model in Node to
check the arithmetic, and a run of `solar/proxy/worker.test.mjs` (20/20 pass —
the worker's *tested* behaviour is sound; the findings below are in the parts
the tests do not cover).

**101 findings.** Severity is about user impact, not effort:

| | |
|---|---|
| **S1** | The feature does not work at all, or the number shown is wrong |
| **S2** | Works, but degrades, leaks, or misleads under normal use |
| **S3** | Correctness/maintenance debt with no visible symptom yet |

Two findings are marked **UNVERIFIED** — the reasoning is sound but the
sandbox's egress policy blocked the check. They are called out inline.

---

## A. Root app — `index.html` + `js/` (Mapbox)

### A1 — S1 — `MAPBOX_TOKEN` is not defined anywhere in the repository
`js/map.js:492`
```js
const tk = localStorage.getItem('mg-token') || MAPBOX_TOKEN;
```
`grep -r MAPBOX_TOKEN` returns exactly this one line. On a first visit
`localStorage` is empty, the identifier resolves to nothing, and the module
throws `ReferenceError` at line 492 — *after* `buildSidebar()` but *before*
`initMap()`, `hideTokenBar()` and `rebuildChart()`. The root page renders a
sidebar over a permanently blank map placeholder, and the mix chart never
draws. This is the single most severe defect in the repo.

### A2 — S2 — Map event handlers accumulate without bound
`js/map.js:360-368, 380`

`addLineInteraction()` calls `map.on('click'|'mouseenter'|'mouseleave', …)`
and `renderFillLayer()` calls `map.on('click', …)`. Both run inside
`renderAllLayers()`, which `toggleLayer()`, `toggleSublayer()` and the theme
toggle re-run on every interaction. `clearAll()` removes *layers*, never
*handlers*. After ten sidebar toggles a single line click opens the info panel
ten times and ten closures still pin the previous feature arrays.

### A3 — S2 — Any map error permanently reveals the "broken" state
`js/map.js:159-163`
```js
map.on('error', e => { ph.classList.remove('hidden'); window.showTokenBar(); });
```
Mapbox emits `error` for a single failed tile. One transient 404 un-hides the
placeholder and pops the token bar over a map that is working fine, with no
path back except a reload.

### A4 — S2 — Sidebar counts are wrong for every non-point layer
`js/map.js:179-180` counts only `f.geometry.type === 'Point'` and only calls
`updateCount` when `pts > 0`. `grid_hv` (9 lines), `grid_hv_real` (947 lines)
and `re_zones` (2 polygons) therefore display `—` forever, so the two largest
datasets in the app look empty in the UI.

### A5 — S2 — `MultiLineString` features are silently dropped
`js/map.js:286, 296, 330, 387` all filter on `f.geometry.type === 'LineString'`.
`scripts/build-transmission-geojson.py:45-49` deliberately emits
`MultiLineString` for multi-part shapes. Any such feature vanishes with no
warning.

### A6 — S2 — Toggling one layer tears down and rebuilds all of them
`js/map.js:404-412`. `toggleLayer()` → `renderAllLayers()` → `clearAll()` +
full re-add. Hiding the 5-feature cement layer re-adds the 947-feature grid
source. Combined with A2, each toggle also doubles the handler count.

### A7 — S2 — HTML injection from data files, marker tooltips
`js/map.js:259-262` builds `<b>${props.name}</b>` and the capacity line with
`innerHTML` and no escaping. Every other renderer in the repo
(`docs/app.js:172`) has an `escapeHtml`; this one does not.

### A8 — S2 — HTML injection from data files, info panel
`js/popups.js:43` (`statusEl.innerHTML` with raw `props.status`) and
`js/popups.js:93-95` (`cell()` interpolates label and value unescaped into
`innerHTML`). All info-panel stat cells go through `cell()`.

### A9 — S2 — Zero-valued fields are dropped from the info panel
`js/popups.js:46-57` gates every row on truthiness: `if (props.capacity_mw)`.
A genuine `0` — a decommissioned unit, an unbuilt phase, `investment_usd: 0` —
is indistinguishable from a missing field and the row disappears.

### A10 — S2 — The info panel never links its source
`js/popups.js:77` renders `'Source: ' + props.source` as plain text.
`source_url` is present in the data and never used, so the "provenance is
inspectable" claim in `docs/index.html:193` does not hold for the root app.

### A11 — S1 — Sidebar KPIs are hardcoded and contradict the repo's own data
`index.html` (KPI block, near the sidebar footer) hardcodes
`12.8 GW`, `46 %`, `~1.4 GW`, `$1.7B+`. Nothing recomputes them from
`loadedData`. `docs/app.js:324-344` computes the same four figures from
`docs/data/morocco/*.geojson` and gets different answers. Two pages in one
repository publish different national statistics.

### A12 — S2 — The electricity-mix chart is hardcoded and unsourced
`js/map.js:451-455`: `data: [28, 21, 14, 13, 8, 16]` with no citation and no
year in the data (the label says 2025). `scales.x.max: 35` is arbitrary.

### A13 — S3 — Four dead source links
`index.html:446` — ONEE, IEA, Reuters and DCD all point at `href="#"`, in the
block headed "Sources:".

### A14 — S2 — Social/canonical metadata points at a repository that is not this one
`index.html:11-12, 18`: `og:url`, `og:image` and `<link rel=canonical>` all
use `https://redatahiri.github.io/morocco-grid/`. The repository is
`morocco-energy-digital-map`, and `og-image.png` does not exist anywhere in the
tree — every social share renders with a broken preview image.

### A15 — S2 — The Mapbox token is persisted in cleartext and echoed into the DOM
`js/map.js:128` writes it to `localStorage`; `js/map.js:493` reads it back into
`document.getElementById('token-input').value`, so it is visible in the
rendered DOM to anything running on the page.

### A16 — S3 — Token validation is a non-empty check
`js/map.js:125-126` rejects only the empty string. A malformed token fails
later and asynchronously through `map.on('error')`, which by A3 looks identical
to a network problem.

### A17 — S3 — `under_construction` is not treated as pipeline for data centres
`js/map.js:278` adds the `pulse` class for `['announced','planned']` only.
`data/digital/dig_datacenter.geojson` contains one `under_construction`
feature, and `docs/app.js:714` *does* halo construction — the two apps
disagree about what counts as pipeline.

### A18 — S3 — `data/energy/grid_hv_future.geojson` is orphaned and unusable
Not present in `LAYER_REGISTRY`. Its 5 features carry **no properties at all** —
no `id`, `name`, `status` or `grid_class` — so it could not be rendered,
filtered or popped up even if it were wired in.

### A19 — S3 — Placeholder is hidden before the data is there
`js/map.js:149-155`: the `load` handler hides `#map-placeholder` and shows
`#fit-btn`, then `await loadAllData()`. There is a window where the map is
declared ready and is empty.

### A20 — S3 — Per-feature fill sources collide when `properties.id` is absent
`js/map.js:230, 373` build source ids as `${layer.id}-${feat.properties.id}`.
Two features without `id` both become `re_zones-undefined`; `renderFillLayer`'s
`if (map.getSource(srcId)) return;` then silently drops the second. Latent
today (both zones have ids), guaranteed on the next fill dataset.

---

## B. Live map — `docs/app.js` + `docs/index.html` (MapLibre)

### B1 — S1 — The interconnectors layer is destroyed by the planned-corridors layer
`docs/app.js:489-494` calls `buildLineLayer()` twice. Both calls use the same
source id (`src-grid`, line 528) and the same five layer ids (line 529).
The second call removes the five layers, replaces `src-grid` with the
planned-corridor data, and re-adds them. **The three operational/idle
interconnector features (ES-MA I/II, DZ-MA) never appear on the map** — the
sidebar still shows "3", and toggling their checkbox toggles the planned
corridors instead.

### B2 — S1 — Rebuilding the map throws before it draws anything
`docs/app.js:404-412`
```js
addOrReplace("src-oim", {...});          // ← removeSource + addSource
const oimIds = [...];
oimIds.forEach(id=>{ if(map.getLayer(id)) map.removeLayer(id); });
```
`addOrReplace` (line 522) calls `map.removeSource("src-oim")` while the five
`lyr-oim-*` layers still reference it. MapLibre throws
*"Source 'src-oim' cannot be removed while layer … is using it."* On first boot
the layers do not exist yet, so it works; on **every theme toggle and every
country switch** it throws at the top of `buildMapLayers()`, outside the
`safe()` wrapper introduced at line 483, and the whole rebuild aborts. The map
is left with the new basemap and none of the overlays.

### B3 — S1 — Hover dimming dims the feature you are hovering
`docs/app.js:670, 709` set `promoteId:"id"` on `src-industrial` and
`src-digital`, so MapLibre derives feature-state ids from `properties.id`
(strings such as `"noor-ouarzazate"`). But `loadAllData` (line 253) assigns a
*numeric top-level* `f.id = idx*10000 + i`, and `setHoverDim` (line 855)
compares `f.id !== keepId` against that numeric id. The two id spaces never
intersect, so the hovered feature is dimmed along with everything else.

### B4 — S2 — `setHoverDim` reads a private MapLibre field, on every mousemove
`docs/app.js:852, 864`: `map.getSource(sourceId)._data`. No public fallback, no
guard beyond truthiness. It then iterates the *entire* feature collection
calling `setFeatureState` per feature — on `mousemove`, i.e. tens of times per
second.

### B5 — S2 — Interaction handlers accumulate on every rebuild
`docs/app.js:519` calls `wireLayerInteractions()` from `buildMapLayers()`,
which runs on boot, on theme change and on country change.
`docs/app.js:653, 661-662` add three more inside `buildPowerLayer`. None are
ever removed with `map.off`.

### B6 — S1 — The tooltip is positioned by the panel width
`docs/app.js:906-911`
```js
const rect = $("#map").getBoundingClientRect();
tooltip.style.left = (rect.left + point.x) + "px";
```
`.tooltip` is `position:absolute` (`docs/style.css:304-305`) inside
`.map-wrap`, which is `position:relative` (`docs/style.css:260`). Absolute
offsets are already relative to `.map-wrap`; adding its viewport rect
double-counts, so every tooltip appears displaced by the sidebar width
(~320 px) and the topbar height (44 px) from the feature it describes.

### B7 — S2 — The provider legend goes stale on country change
`renderProviderLegend()` is called in `boot()` (line 198) but is absent from
the `countrySelect` change handler (lines 1010-1023), which re-runs
`renderLayerList`, `renderKPIs` and `renderMethodologySources`.

### B8 — S2 — Layer visibility leaks across countries
The same handler never resets `visibility` (line 114). Keys from the previous
country survive, and `buildMapLayers:516` replays them through
`applyLayerVisibility` against the new country's layer ids.

### B9 — S2 — A failed boundary fetch keeps the previous country's outline
`docs/app.js:238-241`: `boundaryData` is only reset in the `catch`. A non-`ok`
response (404 for a country with no boundary file) leaves the previous
country's polygon on the map.

### B10 — S1 — Every "Report an error" link is dead
`docs/index.html:122`, `docs/app.js:968`, `docs/app.js:997` all use
`mailto:reda.tahiri@example.com`. `example.com` is IANA-reserved and cannot
receive mail. The correction loop the methodology advertises has no working
endpoint.

### B11 — S2 — The correction email reports `Feature id: undefined`
`docs/app.js:968` builds the body from `p.id`, i.e. `properties.id`. Five of
the eighteen features in `power-plants.geojson` have no `properties.id` —
precisely the ones most likely to need correcting.

### B12 — S2 — Unescaped interpolation into markup and into a class attribute
- `docs/app.js:902, 980, 983`: `${p.voltage_kv}` raw.
- `docs/app.js:957, 981`: `class="status-pill ${p.status || 'operational'}"` —
  a data-file value written straight into a class attribute.
`docs/style.css:371-380` defines only `operational|construction|announced|planned|idle`;
anything else renders as an unstyled pill.

### B13 — S3 — `renderKPIs` is the only reader without a null-properties guard
`docs/app.js:328-333` uses `f.properties.capacity_mw` directly, while every
other reader in the file uses `f.properties || {}`.

### B14 — S2 — "Renewables share*" is a nameplate ratio over 18 curated plants
`docs/app.js:329-331` filters `["solar","wind","hydro"]` and divides nameplate
by nameplate over `power-plants.geojson` only. The panel labels it
"Renewables share*" next to "source: ONEE 2025"; the asterisk is never
resolved anywhere in the page, and the modal's own caveat
("Capacity factors are not applied — figures are nameplate",
`docs/index.html:199`) sits behind a button.

### B15 — S2 — Two methodology links 404 in production
`docs/index.html:203` links `../DATA_SOURCES.md` and `../ASSUMPTIONS.md`.
`docs/` is the published site root, so `..` resolves above it. Both are
unreachable on the deployed site.

### B16 — S2 — "Built by Reda Tahiri" links to someone else's Substack
`docs/index.html:178`: the author byline href is
`https://paczyzak.substack.com/p/data-centers` — the third-party publication
credited separately at line 106 as inspiration.

### B17 — S2 — UNVERIFIED — the glyph endpoint may not serve the requested fonts
`docs/app.js:27` sets `glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf"`.
Five symbol layers request `["Open Sans Bold","Arial Unicode MS Bold"]` or
`["Open Sans Regular","Arial Unicode MS Regular"]` (lines 583, 639, 691, 762,
780). MapLibre walks the stack and renders **nothing** if no member resolves —
which would silently remove every plant label, every cluster count and the
cable-landing `◆` symbols. The MapLibre demo glyph server publishes a narrow
font set; `Arial Unicode MS *` is certainly not in it, so the whole stack rests
on `Open Sans *` alone. *I could not confirm which faces that endpoint serves:
egress to `demotiles.maplibre.org` is blocked by this sandbox's network policy
(403 on CONNECT).* Verify with
`curl -o /dev/null -w '%{http_code}' 'https://demotiles.maplibre.org/font/Open%20Sans%20Bold/0-255.pbf'`
before deciding whether to self-host glyphs.

### B18 — S2 — A failed data fetch produces a silently empty map
`loadAllData` (line 255-258) catches, warns to console and substitutes an empty
FeatureCollection. `showMapError()` is only reachable from `bootMap()`. If all
six GeoJSONs 404, the user sees a working basemap with nothing on it and no
message.

### B19 — S3 — `styledata` is the wrong event for a style swap
`docs/app.js:133`: `map.once("styledata", …)`. `styledata` fires for many
non-load style mutations; `style.load` is the load signal — and is what
`js/map.js:430` uses. Inconsistent between the two apps.

### B20 — S3 — `bounds` is documented as configuration and never read
`docs/countries.config.js:14` defines `bounds` for Morocco. `docs/app.js` never
references it — no `maxBounds`, no `fitBounds`. The file's own header
(lines 1-6) tells contributors that adding an entry is all that is required.

### B21 — S3 — The theme toggle gives no state feedback
`docs/index.html:61` `#themeIcon` is a fixed sun glyph. Nothing in
`docs/app.js:127-135` swaps it.

### B22 — S3 — Address suggestions and layer rows are keyboard-inaccessible
`docs/app.js:298` attaches `change` to a real checkbox (fine), but the popup
(`#popup`) toggles `aria-hidden` without moving focus and has no Escape
handler, while the methodology modal (line 160-162) has `role="dialog"
aria-modal="true"` with no focus trap and no Escape handler either.

---

## C. Estimator — `solar/app.js` + `solar/index.html`

### C1 — S1 — The tool can report savings larger than the entire electricity bill
`solar/app.js:299-308`
```js
const avoided = Tariff.avoidedCostPerKwh(monthlyConsumption, selfKwh);
annualSavingsMAD += selfKwh * avoided;
```
`avoidedCostPerKwh` (line 217, 224) clamps the displaced volume to
`min(monthlyPvKwh, monthlyConsumptionKwh)` and divides by that clamped figure —
but the caller multiplies by the **unclamped** `selfKwh`. Whenever a month's
self-consumption exceeds that month's consumption, the excess is paid at the
average retail price of electricity that was never bought.

Reproduced against the shipped constants:

| input | value |
|---|---|
| bill | 400 MAD/month |
| implied consumption (`kwhFromBill`) | 362.1 kWh/month |
| `selfKwh` (a high-summer month) | 507.0 kWh |
| avoided cost returned | 1.1046 MAD/kWh |
| **savings credited** | **560.00 MAD/month** |
| actual bill | 400.00 MAD/month |

40 % of the headline "MAD économisés / an" in that month is money the household
never spent. The fix is to clamp: `annualSavingsMAD += Math.min(selfKwh,
monthlyConsumption) * avoided`.

### C2 — S1 — Overlapping PVGIS fetches; a stale response wins
`solar/app.js:682-701`. `recalc()` awaits `PVGIS.fetchPerKw` and only then
writes `State.lastPvKey = key` (line 691). The angle and orientation sliders
fire `input` continuously and each call recomputes the key, so a drag issues
many concurrent requests with no generation counter and no `AbortController`.
Whichever resolves last wins — routinely an earlier, slower one — and the page
then shows production for an orientation the user has moved away from.

### C3 — S1 — The "approximate mode" warning is permanent once shown
`solar/app.js:705-708`
```js
if (State.lastPerKw.approximate && srcEl) { srcEl.innerHTML = "⚠ Service … indisponible …"; }
```
There is no `else`. After one PVGIS failure, every subsequent *successful*
result still carries the failure banner. The `innerHTML` write also destroys
the `.help` tooltip button that lives inside `.hero-source`
(`solar/index.html:134`), so the "how is this calculated" affordance is gone
for the rest of the session.

### C4 — S2 — The step-2 error element is write-only
`#step2-error` exists (`solar/index.html:100`) and `solar/app.js:692` only ever
*hides* it. Nothing sets its text or un-hides it. Errors after the address step
reach `console.error` (line 694) and the analytics beacon, and nothing else.

### C5 — S2 — Address suggestions race
`solar/app.js:558-577` is debounced (line 487) but not sequenced. A slow
response for "cas" can land after a fast one for "casablanca" and repaint the
dropdown with results for a query the user has left behind.

### C6 — S2 — The payback marker on the cashflow chart is never drawn
`Chart_.renderCashflow(cashflow, paybackYr)` (line 385) never reads
`paybackYr`, and its options declare `plugins: { annotation: {} }` (line 409)
while `chartjs-plugin-annotation` is not loaded anywhere in
`solar/index.html`. The chart titled "Gains cumulés sur 25 ans" has no
break-even marker.

### C7 — S2 — The documented self-consumption curve is not the implemented one
`solar/app.js:70` documents the calibration points; line 72 implements
`0.30 + 0.55·e^(-0.9r)`. Evaluated:

| sizing ratio | comment says | code returns |
|---|---|---|
| 0.5 | 0.85 | **0.651** |
| 1.0 | 0.55 | 0.524 |
| 1.5 | 0.42 | 0.443 |
| 2.0 | 0.33 | **0.391** |

Off by up to 20 percentage points at the small-system end. This ratio
multiplies straight into every savings figure, so the comment misdescribes the
model a reviewer would check first.

### C8 — S2 — O&M is held flat in nominal terms for 25 years while revenue inflates
`solar/app.js:319-334`: `opex` is computed once (line 319) and subtracted
un-inflated from a revenue stream escalated at `TARIFF_INFLATION_YR` (line
329). By year 25 the modelled O&M is ~39 % below its real-terms value,
inflating NPV and "Gains cumulés".

### C9 — S2 — Auto-sizing silently caps at 10 kWc
`solar/app.js:713-714` clamps `Math.min(10, …)`. The bill slider runs to
3000 MAD (`solar/index.html:130`) ≈ 2 100 kWh/month ≈ 15 kWc of demand. Past
about 1 400 MAD the "auto" badge keeps claiming a recommendation while the
result is a truncated system, with no notice.

### C10 — S2 — A hidden map is measured and never re-measured
`solar/app.js:456`: `setTimeout(() => this.map.invalidateSize(), 100)` runs
unconditionally, including when the user has already pressed
"← Changer d'adresse". `goToStep` (line 645) toggles a class; nothing calls
`invalidateSize` when step 2 becomes visible again, so the Leaflet canvas can
be left at 0×0.

### C11 — S3 — `kwhFromBill` returns negative consumption for a negative bill
`solar/app.js:256-269` has no lower guard. Nothing currently feeds it a
negative bill, but `renderParamLabels` (line 661) would print
"soit environ -55 kWh par mois".

### C12 — S3 — `activeTrancheLabel` is dead code — and would have caught a data bug
`solar/app.js:271-282` is never called. Had it been rendered, it would have
exposed that `ONEE_TRANCHES` (lines 20-27) prices the 100-150 kWh and
150-200 kWh tranches **identically at 1.0732 MAD/kWh** — either a duplicated
paste or a genuinely flat band that deserves a comment.

### C13 — S3 — `ROI.compute().lifetimeSavingsMAD` has no reader
`solar/app.js:349` computes it; nothing in `recalc()` consumes it.

### C14 — S3 — `Tariff.avoidedCostPerKwh` declares an unused accumulator
`solar/app.js:207`: `let remaining = monthlyConsumptionKwh;` — never read.

### C15 — S3 — `countUp` stores animation state on the DOM node
`solar/app.js:822-848` attaches `_raf` and `_timer` to the element. The
safety-net `setTimeout` (line 845) is only cancelled by the *next* `countUp` on
the same element, so leaving step 2 mid-animation leaves a pending write to a
hidden node.

### C16 — S3 — The address autocomplete is mouse-only
`solar/app.js:565-576` renders bare `<li>` elements with a `click` listener —
no `role="option"`, no `tabindex`, no arrow-key or Enter handling, and no
dismissal on blur or Escape. `<ul id="address-suggestions">`
(`solar/index.html:71`) carries no `role="listbox"` and the input no
`aria-expanded`/`aria-activedescendant`.

### C17 — S3 — `.main-panel` is used in the markup and has no stylesheet rule
`solar/index.html:179` vs `solar/style.css` — `grep -c '\.main-panel'` is 0.
The results column falls back to default block flow.

### C18 — S2 — Third-party scripts load with no SRI and no `crossorigin`
`solar/index.html:35-37` (Leaflet + Chart.js from unpkg/jsDelivr) and
`docs/index.html:18-19` (MapLibre from unpkg). A CDN compromise runs arbitrary
script on a page that collects street addresses. `index.html:24-27` has the
same exposure via cdnjs.

---

## D. Cloudflare Worker — `solar/proxy/worker.js`

`solar/proxy/worker.test.mjs` passes 20/20. Everything below is outside its
coverage.

### D1 — S2 — A disallowed origin still gets a served response
`worker.js:56`
```js
const allowed = ok ? origin : ALLOWED_ORIGINS[0];
```
On rejection the worker emits `access-control-allow-origin:
https://atlas-solar.pages.dev` and **still returns the body**. Only a browser
enforces this; `curl`, a script, or any server-side client gets the data.
Combined with D2 and D3 the Worker is an open, unmetered PVGIS relay.

### D2 — S2 — The rate limiter is optional, and the docs tell you to delete it
`worker.js:166-170, 187-193` gate on `if (env.RATE_LIMITER)`.
`wrangler.toml:10-12` says: *"if `wrangler deploy` rejects this block, delete
it — the worker degrades gracefully."* Graceful here means **no rate limit at
all**, on both `/pvcalc` and `/e`.

### D3 — S3 — Coordinate bounds are global, not Moroccan
`worker.js:41-42`: `lat: [-90, 90]`, `lon: [-180, 180]`. The service exists to
answer questions about Morocco; the bounds permit proxying PVGIS for anywhere
on Earth.

### D4 — S2 — The body-size cap counts UTF-16 code units, not bytes
`worker.js:131-132` compares `raw.length` against `MAX_BODY_BYTES = 8192`.
A body of 8 192 three-byte characters is ~24 KB and passes. The body is also
fully read before the check, so the cap does not prevent the read.

### D5 — S2 — The preflight advertises no allowed headers
`worker.js:157-159` returns `corsHeaders()` only:
`allow-origin`, `allow-methods`, `vary`. No `access-control-allow-headers`, no
`access-control-max-age`. Correct today only because the beacon is
`text/plain` (a CORS-simple request); the first non-simple request fails
preflight with no signal in the code that this is load-bearing.

### D6 — S2 — The privacy guarantee lives entirely on the client
`analytics.js:129` rounds coordinates to 0.1°; `worker.js:115, 147` accepts
`lat`/`lon` as doubles and writes them verbatim. A modified page or a replayed
beacon writes street-level coordinates into the dataset, and
`solar/ANALYTICS.md` states the coarsening as a property of the system. The
worker should re-round on ingest.

### D7 — S3 — `outputformat` is whitelisted and then always overridden
`worker.js:35` accepts it; `worker.js:202` unconditionally sets
`outputformat=json`. The whitelist advertises a parameter that has no effect.

---

## E. Build & data scripts

### E1 — S1 — `scripts/build-power-plants.py` emits a fuel vocabulary the map cannot render
`build-power-plants.py:24-44` returns `solar_pv`, `solar_csp`, `gas_ccgt`,
`gas_iscc`, `hfo`, `pumped_storage`, `thermal`.
`docs/app.js:606-615` matches only `solar|wind|hydro|coal|gas|oil`, falling
back to `#888`. Running the build turns **every plant grey**.

### E2 — S1 — …and drives the renewables KPI to zero
`docs/app.js:329` filters `["solar","wind","hydro"].includes(fuel_type)`.
None of the script's solar or hydro outputs match, so "Renewables share*"
would read a confident, wrong **0 %**.

### E3 — S1 — …and wipes every source URL
`build-power-plants.py:73`: `"source_url": ""`, hardcoded. The committed
`power-plants.geojson` has a populated `source_url` on **18 of 18** features.
One run destroys all of them.

### E4 — S2 — The script and its output have diverged with no guard
`build-power-plants.py:80` reads the four `data/energy/gen_*.geojson` files
(42 features, different schema) and unconditionally overwrites the curated
18-feature `docs/data/morocco/power-plants.geojson` (line 85). Nothing
compares the two or refuses to clobber.

### E5 — S3 — `region_for` has an uncovered band and two names for one region
`build-power-plants.py:47-52`. `lat ∈ [30, 32.5)` with `lon > -7` matches no
branch and falls through to the literal `"Central"` — while the branch above
returns `"Central / Atlas"`. Two labels for the same place.

### E6 — S3 — Redundant re-lowercasing
`build-power-plants.py:33, 41`: `tech.lower()` where `tech` was lowercased at
line 26. `desc` is consulted only for coal and ISCC, so a fuel-oil plant that
is described but not tagged falls through to `"thermal"`.

### E7 — S1 — `scripts/build-transmission-geojson.py` cannot run as documented
Line 19: `WBG = Path(os.environ.get("WBG_DIR", REPO.parent))`. The shapefiles
are committed inside the repo at
`data/sources/{existing,future}transmissionlines/`. The default resolves to the
repository's *parent* directory, so the documented bare invocation always
fails.

### E8 — S1 — …and emits statuses the map filters out
The script writes `status: "existing"` / `"planned"` (lines 65-66).
`docs/app.js:538-552` filters on `"operational"`, `"planned"` and `"idle"`.
Every "existing" line it produces would be invisible.

### E9 — S2 — No `__main__` guard — importing the module writes files
`build-transmission-geojson.py:65-71` runs both `ingest()` calls and the
`OUT.write_text` at module scope.

### E10 — S3 — The legend field is read positionally
`build-transmission-geojson.py:37`: `legend = rec[0]`. A field-order change in
the shapefile silently reclassifies every line's voltage.

### E11 — S2 — 1.2 MB of unreferenced payload in the published directory
`docs/data/morocco/transmission-lines.geojson` (541 features) and
`national-hv.geojson` (947 features) appear in no layer of
`docs/countries.config.js`. `grid-lines.geojson` (11 features) is referenced
only as a comment — `"grid-lines": "grid"` in `LAYER_KIND`
(`docs/app.js:86`, marked "legacy fallback") — and is likewise never fetched.

### E12 — S2 — `--validate` is advertised and does nothing
`data/scripts/process.py:9` documents it, lines 428-432 parse it, lines 505-507
are:
```python
if args.validate:
    print("\n[Validating] GeoJSON structure and geometry")
    # Add validation logic here
```

### E13 — S2 — The install instructions name the wrong package
`data/scripts/process.py:362`: `pip install shapefile shapely`. The shapefile
reader imported at line 357 is **pyshp**; `shapefile` on PyPI is an unrelated
project. Following the printed instruction does not fix the `ImportError` and
may install something unexpected.

### E14 — S2 — The pipeline output is connected to nothing
`process.py` writes `data/processed/*.geojson` (line 410) and closes with
"NEXT STEP: Upload to Mapbox Studio" (line 513). Both shipped apps read
`docs/data/morocco/*.geojson` and `data/{energy,industrial,digital}/*` directly
from disk, and the live map is MapLibre, not Mapbox Studio.

### E15 — S3 — Every feature carries its source properties twice
`process.py:53`: `"metadata": properties` — where `properties` already contains
`"original_properties": props` (lines 99, 141, 185, 284, 327).

### E16 — S3 — Both data scripts create directories at import time
`process.py:25` and `download.py:31` call `.mkdir()` at module scope.

### E17 — S2 — `download.py --output` is documented and ignored
Line 9 of the docstring shows `--output data/raw/`; lines 252-257 parse it;
every download function writes to the module-level `RAW_DIR`.

### E18 — S2 — A null HDX resource name raises inside a catch-all
`download.py:104`: `resource['name'].lower()` — HDX resources routinely have a
null `name`. The `AttributeError` is swallowed by the broad `except Exception`
at line 116 and reported as "API error", hiding the real cause.

### E19 — S3 — A fabricated URL is assigned and never used
`download.py:84`: `shapefile_url = ".../7c7d3d5b-…-1234567890ab/resource/shapefile-download"`.

### E20 — S3 — Progress output reports "0.0 MB" for chunked responses
`download.py:52` prints `total_size / 1024 / 1024` from the
`content-length` header, which is absent on chunked transfers.

### E21 — S3 — Failure is reported as success
`download_hdx_morocco_boundaries()` returns `True` on success and `None` on
both failure paths (lines 112-118). `main()` ignores the return value and
prints the same "NEXT STEPS" banner either way.

### E22 — S3 — Both data-script docstrings give the wrong path
`process.py:7-9` and `download.py:7-9` say `python scripts/…`. The files are in
`data/scripts/`; `scripts/` holds different scripts entirely.

---

## F. Deploy & operations

### F1 — S1 — `deploy.sh` validates the app it does not deploy
Lines 10-16 check `index.html` and `js/{map,layers,popups}.js` — the **root**
app. The published sites are `docs/` (Pages/GitHub Pages, per `docs/_redirects`
and `docs/sitemap.xml`) and `solar/`. Neither is checked. A deploy can ship a
broken `docs/app.js` and pass every gate.

### F2 — S2 — The GeoJSON count guard measures the wrong tree
Line 19 counts under `$ROOT/data`. The data the site serves is in
`docs/data/morocco/`.

### F3 — S2 — The success message names a repository that does not exist
Line 33: `https://redatahiri.github.io/morocco-grid/`. This repo is
`morocco-energy-digital-map`.

### F4 — S2 — `git add -A` + unconditional push to `main`
Lines 28-30 sweep whatever is dirty into a commit and push to `main` with no
review step and no branch.

### F5 — S3 — `.DS_Store` is git-ignored and still tracked
`.gitignore:6` lists it; `git ls-files` returns `.DS_Store` and
`Carrousel/.DS_Store`. An ignore rule has no effect on files already in the
index — they need `git rm --cached`.

### F6 — S2 — SQL injection in `scripts/solar-stats.sh`
Line 23: `DAYS="${1:-7}"`, interpolated unvalidated at line 31 into
`INTERVAL '${DAYS}' DAY` and sent to the Analytics Engine SQL API. There is no
numeric check.

### F7 — S3 — The query is sent as form-encoded
Line 45: `curl --data "$sql"` sets `content-type:
application/x-www-form-urlencoded`. The SQL API expects a raw query body; a
`+` anywhere in a query would be decoded as a space.

### F8 — S2 — `telemetry_brief.py` crashes instead of reporting a query failure
Line 45: `return body.get("data") or []`. If the endpoint returns a bare list,
`AttributeError` is raised — and it is **not** in the caught tuple at line 144
(`URLError, RuntimeError, KeyError, ValueError`). The carefully written
"Query failed" path (line 145) is bypassed and the user gets a traceback.

### F9 — S2 — The address dead-end rate can exceed 100 %
Line 166: `pct(fails, intent)`. `address_input` fires **once per session, on
the first keystroke** (`analytics.js:100`, `app.js:486`), while `geocode_fail`
also fires from the typed-submit path and can fire repeatedly. Numerator and
denominator count different populations.

### F10 — S3 — Markdown tables are built without escaping `|`
`telemetry_brief.py:61`. A referrer host containing a pipe breaks the table for
both consumers the docstring names (the Council minutes and the email digest).

### F11 — S2 — Do Not Track is only honoured when it says exactly `"1"`
`analytics.js:59-61`
```js
return navigator.doNotTrack === "1" || window.doNotTrack === "1" ||
       navigator.globalPrivacyControl === true;
```
Safari and older Firefox express the same signal as `"yes"`. The comment
directly above reads *"A visitor who has asked not to be tracked is not
tracked. No exceptions."* — those visitors are tracked.

### F12 — S3 — Events are dropped rather than requeued on a failed flush
`analytics.js:117` calls `this._queue.splice(0)` to build the body **before**
the send. If `sendBeacon` returns false *and* the `fetch` fallback throws, the
`catch` at line 125 discards the batch.

---

## Summary by area

| Area | S1 | S2 | S3 | Total |
|---|---|---|---|---|
| A. Root app (`index.html`, `js/`) | 2 | 12 | 6 | 20 |
| B. Live map (`docs/`) | 5 | 12 | 5 | 22 |
| C. Estimator (`solar/`) | 3 | 8 | 7 | 18 |
| D. Worker (`solar/proxy/`) | 0 | 5 | 2 | 7 |
| E. Build & data scripts | 5 | 8 | 9 | 22 |
| F. Deploy & ops | 1 | 7 | 4 | 12 |
| **Total** | **16** | **52** | **33** | **101** |

## The seven to fix first

Ordered by "how wrong is what the user sees, divided by effort":

1. **C1** — savings can exceed the bill. One-line clamp. It is the headline
   number of the whole estimator.
2. **A1** — `MAPBOX_TOKEN` undefined. The root page does not work at all.
3. **B1** — interconnectors destroyed by planned corridors. Give
   `buildLineLayer` per-dataset source and layer ids.
4. **B2** — `addOrReplace("src-oim")` before removing its layers. Swap two
   statements; it un-breaks every theme and country switch.
5. **E1/E2/E3** — the plant build script would grey out the map, zero the
   renewables KPI and delete every source URL. Do not run it until the fuel
   vocabulary matches `docs/app.js`.
6. **B6** — tooltips land a sidebar's width away from their feature. Drop the
   `rect.left`/`rect.top` terms.
7. **B10** — `example.com` correction address. Every "report an error" path in
   the product is dead.
