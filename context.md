# Energy x Digital Nexus — Emerging Countries (Morocco focus)

## Goal
Two-part platform at the intersection of energy and digital 
infrastructure in emerging markets:
1. Interactive infrastructure map (web app)
2. Thought leadership blog

## Platform 1 — Infrastructure Map
Interactive web app displaying Morocco's infrastructure 
as toggleable map layers:
- Energy: power generation, grid, renewables (ONEE data)
- Industrial consumers: phosphates (OCP), cement, steel
- Digital: data centers, telecom nodes
Design reference: enersite.app

## Platform 2 — Blog
Platform: **Substack** (free, migrate to Astro later if needed)
Short analytical posts on:
- Morocco/MEA renewable export strategy
- Power constraints for hyperscalers in MEA
- Industrial demand response & grid flexibility
- North Africa's role in Europe's green supply chain

## Stack
Static HTML/JS in `docs/` + **MapLibre GL JS 4.7.1** + GeoJSON (no token, no build step)
Basemap: OpenFreeMap (Positron light / Dark). Grid overlay: OpenInfraMap vector tiles.
Hosting: Cloudflare Pages project `atlas-nexus` → https://energy.wattu.org/
(Pages default address https://atlas-nexus-69o.pages.dev/ redirects there)
(mirror: https://redatahiri37.github.io/morocco-energy-digital-map/)
Deploy: automatic — every push to `main` touching `docs/` runs
`.github/workflows/validate.yml` (validate → deploy with wrangler). Secrets
`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` are set. Manual redeploy:
Actions → docs-validate → Run workflow.

## Data Sources
ONEE, GEM, OpenStreetMap, Datacentermap.com

## My Profile
Energy & digital infrastructure expert, Paris-based,
MEA region focus. High technical fluency on energy systems,
grid economics, infrastructure finance.

## Current Task
Map correction issues #59, #60, #61 and #70 handled on 2026-11-08 (see the
handoff below). No open correction issue left.

## Session handoff — 2026-11-08 (map: water perspective, phase 1)
- New layer kind `water` (DATA_SCHEMA.md): `category` transfer (line, flow
  arrows first → last vertex, dashed unless in service), dam (triangle,
  sized by storage_hm3), desalination (hexagon, sized by capacity_hm3_yr).
  One teal (LAYER_COLORS.water, checked by check-map-palette.mjs).
- Morocco: water-transfers.geojson (Sebou–Bouregreg 2023, Al Massira–
  Marrakech 2022, phase II Bouregreg–Al Massira planned, Laou–Loukkos–Sebou
  study), dams.geojson (10 dams of the 2020–2027 programme), desalination.
  geojson (Casablanca, Jorf Lasfar, Safi, Chtouka, Laâyoune, Dakhla).
  Bilingual: name_fr, note_fr, purpose_fr, energy_supply_fr.
- Positions: OSM where the dam or plant is mapped (Tiddas, Agdez,
  Kaddoussa, Fask, Douira, Laâyoune); otherwise the commune or the distance
  the press gives, `precision: approximate`, said in the note. Transfer
  routes are schematic. Overpass and the Wikimedia APIs were unreachable
  (reset / 429) this session, so no coord-validator pass: re-run it when
  they are back, starting with Kheng Grou, M'Dez, Ghiss and Dakhla.
- Desalination popup: stated power if any, else average load at
  3.5 kWh/m³ (DESAL_KWH_PER_M3 in app.js), labelled as an estimate.
- Phase 2 (same PR): `lenses` in countries.config.js → Énergie / Eau /
  Nexus switch above the layers (app.js "Lens"), shareable as #lens=water.
  Water layers start unticked in Energy. Water lens: water layers + grid +
  hydro plants (fuel filter), mix hidden, water KPI tiles (transfers m³/s,
  new storage, desalination, est. desalination load vs the 8.4 GW record
  peak). Nexus: everything with both KPI sets.

## Session handoff — 2026-11-08 (map: data corrections #59–#61, #70)
- Moroccan dams (#61): capacities were wrong (Al Massira 232 → 128 MW,
  Bin el Ouidane 256 → 135, Idriss 1er 432 → 40.6) and three points sat
  13–18 km off the dam (Idriss 1er, Al Wahda, Oued el Makhazine). Now WRI
  GPPD v1.3 (pinned commit, as for the other countries) for capacity and
  year, OSM for the dam position (precision exact). New optional fields
  annual_generation_gwh / annual_generation_year (WRI estimate for 2017),
  shown as "Annual output ≈ … GWh" in the popup. Morocco's in-service total
  went from 7.7 to 7.1 GW (65 % of Ember's 10.9 GW).
- Guemassa (#60): moved to the Hajar mine, Guemassa massif (Mindat
  31°21'52"N 8°03'21"W), ~4.5 km from the old point; precision stays
  approximate (the complex spans mine and plant).
- Xlinks (#59): started ~190 km off Tan-Tan and ended in the sea off
  Devon. Now from the Tan-Tan generation area, into the sea NW of Tan-Tan
  (El Ouatia), to Bideford Bay and the Alverdiscott substation. Not Dakhla:
  Xlinks says its land part stays in the Tan-Tan region.
- South Africa (#70, "no DC data"): already fixed by 94dd89d the day the
  issue was filed (27 PeeringDB sites). PeeringDB has no MW, so the DC
  KPI tiles stay "—".
- Network: a personal environment "Wattu maps" allows nominatim,
  overpass-api.de (resets often), en/fr.wikipedia, wikidata, mindat
  (Cloudflare challenge: use search snippets) and energy.wattu.org.

## Session handoff — 2026-11-07 (solar: « immeuble » mode, co-ownership)
- New Maison / Appartement switch (landing and results hero), solar/copro.js
  (loaded before app.js; own 4-language table; zgh falls back to French
  until a native speaker writes it). Building mode: storeys (shared with the
  3D view; default R+3 when OSM has no levels) × flats per floor → the
  auto-size is capped at the flat's share of the roof, the roof score uses
  that share, and a « Copropriété » card shows whole roof / your share /
  coverage, a bar strip of coverage by building height (RDC…R+9), three
  routes (common-areas meter; one system per flat; one plant shared among
  meters) and the AG steps. URL: m=i, u=<per floor>, e=<storeys>.
- Law, our reading (reaconsult.ma summary of Law 18-00 as amended by
  106-12; the adala.justice.gov.ma PDF is a scan, not read): adding
  equipment = 3/4 of votes (art. 21); one owner's works at own cost on a
  common part = majority of votes present/represented (art. 20); quorum
  1st meeting = half the votes (art. 18). No sharing of output among
  meters found in Law 82-21 / decree 2.25.100 (Greenpeace MENA also calls
  11 kW low for a building). The card says « information, pas un avis
  juridique ». To confirm with a lawyer/syndic before promoting the mode.
- No figure for the common-areas route (no public data on their use).
  Roof capacity is an upper bound: stairwell, tanks, solar water heaters
  and dishes are not subtracted (the card says so).
- CI: copro.js in node --check, the innerHTML grep, both copy steps and
  the ?v= cache-busting (count 5 → 6); build-solar-i18n versions it too.
- Not seen with live PVGIS (localhost is refused by the Worker's CORS) nor
  with a real OSM building (Overpass did not answer locally): tested with a
  drawn 18 × 14 m roof, fr and ar, desktop and 375 px.

## Session handoff — 2026-11-03 (map: industry and data-centre markers)
- Industry and data centres are told apart from the plants by
  shape, not by more hues. Data centres = violet diamonds (sized by MW,
  pipeline faded with a lavender outline), cable landings = violet rings,
  industrial sites = slate squares. Diamonds and squares are SDF icons
  made in app.js (addShapeImages, re-added on every build: a new style
  drops images). LAYER_COLORS per theme next to FUEL_COLORS; markerOf /
  markHtml give the same shape to swatches (layer list, tooltip, popup,
  search). The per-country colours by operator and sector are gone (no
  legend explained them; each collided with a fuel): countries.config.js
  keeps `operators: [{ key, short }]` for tooltips, `palette` now fails
  validation. The map palette check covers these colours and that both
  layers stay shapes.
- Plant clusters: neutral bubbles (LAYER_COLORS cluster / clusterInk:
  slate-700 on light, slate-300 on dark), the picked fuel's colour under
  the fuel filter as before. Their source sums MW per fuel (mw_<fuel>,
  CLUSTER_FUELS, waste in bioenergy) and the tooltip lists the three
  largest ("Nuclear 77% · Hydro 18% · Wind 3%"). The pipeline halo round
  plants is that neutral too: no amber left among the map's data marks.
- Tooltips were placed a panel's width (320 px) right of what they
  describe on desktop (positionTooltip added the page offset to map
  pixels; audit item B6) and squeezed near the right edge: both fixed.

## Session handoff — 2026-10-18 (map: live Spain–Morocco flow, demand)
- Morocco has no public live consumption feed (ONEE: annual figures and
  peaks only; Electricity Maps' MA zone is modelled). The live signal is
  the Spain–Morocco interconnector from REE (`demanda.ree.es`, 5 min).
- Worker: `GET /flow/es-ma` (solar/proxy/flow.js) → `{ at, net_import_mw }`,
  edge-cached 5 min, 503 when REE's last point is over 2 h old. Deployed
  by worker.yml on merge. Not tested against live REE (blocked from cloud
  sessions); built and tested on REE's recorded payload format.
- Map: Snapshot gets « Record peak · 2026 » 8.4 GW (ONEE board, 27 Jul
  2026, via TelQuel) and a live tile (ONEE's 49 TWh for 2025 dropped on
  2026-11-01: the mix panel already carries Ember's 2025 year); the two
  Spain–Morocco cable popups show the same figure. Config: `demand` and
  `liveFlow` in countries.config.js, checked by validate-countries.mjs.
  CSP connect-src gains the Worker host.
- After deploy: open energy.wattu.org and check the tile shows a figure,
  not « Unavailable right now ».

## Session handoff — 2026-10-12 (solar: UX review, blocks 1 and 2)
- Fixed: browser/Android Back from the results now returns to the address
  (pushState on entering the results, popstate back); score tooltip no
  longer one unreadable line that also scrolled the desktop page sideways;
  « service indisponible » notice clears when PVGIS answers again.
- Results card: price (investissement) replaces CO₂ (now a line under the
  monthly chart); « pour une facture de X MAD par mois · c'est la vôtre ? »
  under the headline until the visitor sets their bill. Bill presets and
  default aligned on the city pages: 300/500/800/1 200, default 500 (was 400).
- Address not found → « Choisissez votre ville » (data/cities.json, now
  deployed; CSP connect-src gains 'self'), map at zoom 15, no OSM lookup,
  the drawn roof becomes the location. Analytics: estimate src `city`,
  param_change field `bill_ask`.
- PDF button in the installers card; top bar = Villes · Guides · Méthode ·
  العربية · English (Méthode hidden on phones); focus/aria-live/aria-valuetext/
  aria-pressed; « Dernier point » while drawing a roof.
- Merged with #89/#90: every new text is in app.js I18N and
  i18n/simulator.mjs (ar, en); the city list reads name_ar / name_en.
- 3D prototype (same PR): « Voir en 3D » on the roof map loads MapLibre
  (solar/vendor, the energy map's copy) on click; roof extruded to storeys
  (OSM or 2, adjustable), panels tilted as 10-strip stairs, shadows on the
  roof for 21 Dec/Mar/Jun and a solar hour. CSP gains worker-src/child-src
  blob:, img-src blob:, connect-src Esri. Hashes in CONFIG, checked by
  solar.yml. Not seen with real Esri imagery (CORS assumed, as MapLibre
  users commonly rely on) nor on a real phone GPU.
- Next (owner's call): a lifestyle question for self-consumption
  (calc-engine), summer/winter bills, shorter phone page.

## Session handoff — 2026-10-12 (map: electricity mix per country)
- New "Electricity mix" block at the top of the map panel, for all 12
  countries: national generation / capacity by fuel (toggle), renewables
  share of each, net imports or exports, CO₂ intensity, from Ember's yearly
  data (CC BY 4.0). Built by scripts/build-country-mix.py into
  docs/data/<key>/mix.json (Ember release 2026-06-23, sha256 pinned);
  validated by validate-countries.mjs (4 new self-test cases).
- The legend is the fuel colour key for the plant dots and filters the
  plant layers (and OSM plants) to one fuel; KPI tiles and layer counts
  follow the filter. A coverage line compares the mapped plants with
  Ember's national capacity (Morocco 71 %, Ethiopia 40 %, Egypt 54 %).
- KPI tiles: "Tracked capacity" + "Renewables share*" (capacity of mapped
  plants incl. announced ones, footnote missing) replaced by "In service"
  and "Pipeline". Morocco's snapshot credit no longer says "ONEE 2025".
- Plant dots now scale with capacity (area ∝ MW, floor for small plants,
  grows with zoom; OSM plants on the same curve; small drawn on top).
  Clusters show their summed MW/GW and size on the same scale (floor so the
  label fits, cap at 56 px); hover gives "N plants · X GW". A size key under
  the layer list redraws with the zoom.
- Status view above the layer list: All / In service / Pipeline (under
  construction, announced, planned) narrows every layer with a file and the
  OSM plants (construction / disused tags); kept across country switches.
  Only Morocco, France and Spain have a pipeline in their files; elsewhere
  the note says the sources list built assets only.
- Shareable link: the URL hash holds the country, map view, status view,
  fuel, mix measure, layers (when not the default) and the open feature
  (#country=france&map=8.00/50.1880/1.0270&status=pipeline&fuel=wind
  &feature=power-plants:ppm-fr-15839). Written with replaceState once the
  page has applied any incoming link; a plain visit keeps a clean URL until
  the first action. "Share" in the top bar (share sheet on phones, else
  clipboard) and "Copy link" in each popup. On phones the GitHub button
  makes room for Share (GitHub stays in the panel footer and bottom bar).
- Search at the top of the panel: names (and operator, sector, region,
  fuel) of every mapped asset in all 12 countries, plus country names;
  accents ignored. Other countries' files load on the first keystroke, not
  on page load. A result opens its popup (switching country if needed) and
  lifts a fuel or status filter that would hide it. Arrow keys / Enter /
  Escape; "/" focuses the box. OSM plants are live tiles: not searchable.
- French page: energy.wattu.org/fr/, built at deploy from docs/index.html
  by scripts/build-map-i18n.mjs with scripts/map-i18n-fr.mjs (CI fails on
  English left in it or a stale table); docs/fr/ is git-ignored. app.js
  picks its T table by <html lang>; numbers in French format (7,7 GW,
  62 %); countries.config.js has labelFr / titleFr (validator requires
  them). Sources, plant names, technology and operators stay as published.
  Data files load from the site root (dataUrl), so /fr/ shares ./data/.
  FR / EN link in the top bar keeps the view (#…). Top bar: icons only
  below 1024 px (it ran past the edge between 640 and 1000 px).
- Overview: "All countries — overview" at the top of the country menu
  (#view=overview, &metric=co2 for CO₂). Each enabled country's boundary
  filled by renewables share of generation (0–100 %) or CO₂ g/kWh (0–800),
  one sequential blue ramp, reversed in dark mode so low values recede.
  Ranked list in the panel (hover syncs with the map), tooltip with the top
  three fuels, click opens the country. Mix and boundary files load on
  first use only. Hides the mix, layers and KPI sections; leaving it goes
  through switchCountry. Ember years differ per country (note shows range).
- Phone sheet: below 900 px (landscape phones, max-height 500, keep the
  side panel) the panel is a bottom sheet over a full-height map, same
  media query in style.css and app.js (SHEET_MQ). Stops peek / half / full;
  peek ends under the mix bar (overview: under its colour key). Grip: tap
  goes up a stop (full → peek), drag with flick; in peek the whole sheet
  drags. Search focus → full, pick → peek; map drag, popup, overview row →
  peek. Map bottom padding = peek, or popup height while one is open
  (syncMapPad: changed without moving the view, never mid-animation), so
  flyTo / easeTo / fitBounds centre above them; a tapped feature eases
  above the popup. Popup on phones now ends above the bottom bar.
- Fuel palette (2026-10-27): FUEL_COLORS in app.js, one set per theme
  (setMapPalette on load and theme switch; waste = bioenergy's colour).
  Each fuel keeps its usual hue (coal brown, gas orange, oil crimson,
  nuclear purple, hydro blue, wind cyan, solar gold, bioenergy green,
  geothermal pink); L and C were optimised in OKLCH against the dataviz
  checks. scripts/check-map-palette.mjs (CI) re-checks: band, chroma,
  contrast with the panel, and the 14 fuel pairs that touch in some mix bar
  (Delta E >= 15, colour-blind >= 6; now >= 8.1). The map can't keep all 9
  apart for colour-blind readers (dark solar/gas collapse for deutans): the
  mix legend's fuel filter is the remedy.
- Sheet: a drag held still for 120 ms before release no longer counts as a
  flick (settles on the nearest stop).

## Session handoff — 2026-10-08 (solar: « Trouver un installateur »)
- New card after « Et maintenant ? »: two Taqa Pro-labelled installers
  (Econosol, Shamsiyah — owner's pick), shuffled per visit, no commission,
  link to the official Taqa Pro list. Hidden from the PDF print.
- Method, scores and sources: solar/INSTALLERS.md (review every 6 months).
  Websites were not opened during research — still to check.
- New analytics event `installer_click` (src = company id), allowlisted in
  the Worker (deployed by worker.yml on merge).

## Session handoff — 2026-10-08 (hardening by design)
- No third-party code: MapLibre, Leaflet and Chart.js are vendored
  (docs/vendor, solar/vendor) with SRI; scripts/check-sri.mjs fails CI on
  an external script/stylesheet, a hash mismatch or any style="" / <style>.
- CSP: scripts and styles 'self' only, no 'unsafe-inline' (map colours are
  set through the DOM: paint() in docs/app.js); COOP, CORP, X-Frame-Options.
- Worker CORS: Wattu origins only (localhost and github.io removed).
- Dependabot for the pinned actions. SECURITY.md: accepted risks, owner
  account settings (2FA, DNSSEC), how to update a vendored library.
- Owner chose not to move the Cloudflare secrets into `production`
  (accepted risk, recorded in SECURITY.md); don't ask again.

## Session handoff — 2026-10-05 (security audit and fixes)
- Two audits (web apps; Worker, CI, secrets). No secret in history
  (gitleaks, 178 commits). Fixes, see SECURITY.md:
  - CSP and security headers in docs/_headers and solar/_headers. A new
    host must be added there. CI checks the inline script hash.
  - Map: fixed attribution text (the style's HTML could run script),
    numbers and links checked before going into HTML, and the validator
    type-checks investment_usd and the other numeric fields.
  - Worker: values checked by shape before storage (the telemetry brief
    goes to an agent and into minutes), coordinates rounded server-side,
    normalised PVGIS parameters, rate limit even without the binding
    (`[[ratelimits]]`), errors not edge-cached. Deployed by the new
    worker.yml on merge (token needs Workers Scripts › Edit).
  - Solar: at most 400 panel slots (a stadium froze the page), bill slider
    debounced, address label only in the "Partager" link, link label
    cleaned, footer says which services see the address/position.
  - CI: actions pinned by SHA, read-only token, gitleaks on every push.
    Data downloads are pinned to commits and checked by sha256.
- 2026-10-08: ruleset on main is live (PR + gitleaks required, 0
  approvals). A PR must be up to date with main before it merges. Deploy
  jobs use the `production` environment.
- Owner to do (checklist in SECURITY.md): move the Cloudflare secrets into
  `production` (main only), Dependabot, record revocation dates of old
  tokens. The owner works from a phone during the day: give phone steps.

## Session handoff — 2026-10-05 (France and Spain)
- France and Spain added: power plants ≥ 10 MW from powerplantmatching
  v0.9.0 (CC BY 4.0, pinned commit c897656), units merged per site, built
  by scripts/build-power-plants-ppm.py; Natural Earth outlines (France
  metropolitan + Corsica; Spain incl. Balearics and Canaries). See
  DATA_SOURCES.md for rules and the RTE/REE cross-check.
- Dense layers (> 500 plants) cluster wider (radius 60, up to zoom 7).
- Pending: data centres for FR/ES — owner to save
  https://www.peeringdb.com/api/fac?country__in=FR,ES as JSON, then run
  scripts/build-datacentres-peeringdb.py with FR=france ES=spain and add a
  datacentres layer to PPM_COUNTRY_LAYERS.

## Session handoff — 2026-10-05 (Wattu identity + solar UX)
- Identity in brand.css (identical in docs/ and solar/, CI checks it with
  mark.svg, favicon.svg and fonts/): night navy, orange = sun/actions,
  cyan = signals/focus; Inter / Newsreader / IBM Plex Mono, self-hosted
  (no Google Fonts). Logo = striped sun.
- Solar: geolocation button, results in two columns on desktop (answer
  sticky on the right), estimate in the URL hash (share/bookmark/reopen),
  Partager + PDF (print CSS), next steps, French decimals.
- Map: Wattu lockup, night-navy dark theme, cyan UI accent (was wind teal).

## Session handoff — 2026-10-05 (code review of both apps)
- Solar: address search runs on « Estimer » only (Nominatim forbids
  as-you-type autocomplete); other matches show in step 2 under « Pas la
  bonne adresse ? ». PVGIS requests carry a sequence id (late ones dropped)
  and tilt/orientation sliders are debounced. No corsproxy.io fallback.
- Map: storage-blocked boot fixed, hover dimming no longer redone on every
  mousemove, boot/country-switch race fixed, Escape closes popup/modal.
- CDN libraries are pinned with SRI hashes. Upgrading MapLibre, Leaflet or
  Chart.js means recomputing them (command in each index.html comment).
- docs/brand.css and solar/brand.css must stay byte-identical (CI checks).
- Removed: root Mapbox prototype (index.html, js/), deploy.sh, .DS_Store;
  docs/CALC_ENGINE.md and docs/SUBSTACK_POST.md moved to the root (they
  were published on energy.wattu.org).
- Worker deploy: automatic since worker.yml (2026-10-06).

## Session handoff — 2026-10-02 (solar: roof area + panels)
Wattu Solar (`solar/`) now looks up the building under the address in
OpenStreetMap (Overpass, `way["building"]` within 25 m), shows its footprint
area and lays out 500 Wc panels (1.13 × 2.28 m) on it, Sunrise-style: rows
facing the chosen orientation, 1 m margin from the edges, row spacing for a
33° sun. No building found → "Dessiner mon toit" (click the corners). The
auto-size never exceeds what the roof holds. The area is the footprint, not
the sloped roof surface. Solar has no auto-deploy:
`wrangler pages deploy solar --project-name=atlas-solar`.
Pending: energy-map fonts inspired by normalcomputing.com (blocked from cloud
sessions; needs screenshots or font names from the owner).

## Session handoff — 2026-09-29 (African DC markets)
Added South Africa, Nigeria, Kenya, Egypt, Ghana, Côte d'Ivoire, Rwanda and
Ethiopia with `scripts/build-country-open-data.py`: Natural Earth outline +
WRI Global Power Plant Database v1.3 (2021, CC BY 4.0, unmaintained) plants,
each checked against the outline (1 held out: Rusizi I, DRC side of the
border) + live OSM plants and grid. Senegal's hand list is untouched (the
script would catch Cap des Biches 174 km at sea). New fuels: nuclear,
geothermal, biomass, waste.
Data centres: 77 sites from a PeeringDB facility export the owner saved
from Chrome (peeringdb.com is blocked from cloud sessions), built with
`scripts/build-datacentres-peeringdb.py` (needs `pip install geonamescache`).
4 held out (GPX Cairo 1 pinned in Alexandria, CYNOX-KANO, a duplicate Icolo,
Strand Exchange). Morocco keeps its curated layer and gets a second
"More colocation sites (PeeringDB)" layer (4 sites); PeeringDB sites whose
operator is already curated within 15 km are dropped (N+ONE). To refresh: open
https://www.peeringdb.com/api/fac?country__in=ZA,NG,KE,EG,GH,CI,RW,ET,SN
save as JSON, rerun the script.
GPPD is thin for Nigeria (13 plants) and Ghana (6); KPIs say "WRI GPPD 2021".

## Session handoff — 2026-09-29 (multi-country)
Branch `claude/gallant-maxwell-b0ho3a`: the map is now config-driven.
- Country switch fixed (it crashed and kept Morocco's data on screen).
- Layers render from `countries.config.js` by `kind`; palettes, boundary
  credit, footer credits and page text are per country.
- `scripts/validate-countries.mjs` + `DATA_SCHEMA.md` validate every country
  in CI; `scripts/test-validate-countries.mjs` self-tests the validator.
- **Senegal is enabled in the PR** with 13 power plants from an owner-supplied
  list (ChatGPT-compiled, Sep 2026). Every feature is `precision: approximate`
  and its `source` says it is unverified; none has `source_url`. The rows were
  checked against GeoNames towns (via the `geonamescache` PyPI package; cloud
  sessions can't reach Nominatim, Wikipedia, GEM or Overpass). Held out:
  - CSS (Compagnie Sucrière Sénégalaise): given 7 km from Saint-Louis city;
    the mill is at Richard-Toll, ~93 km east.
  - "Senegal Solar Project – Dagana": 39 km from Dagana.
  - Santhiou Mékhé: its point is WRI GPPD's point for Ten Merina (0.3 km).
  - Cap des Biches Senelec engines: same coordinate and MW as ContourGlobal.
  A live "OSM power plants" layer (kind `oim-plants`, OpenInfraMap's
  power_plant_point tiles) is on for Senegal and off by default for Morocco;
  use it to cross-check the curated list in a browser (cloud sessions can't
  reach openinframap.org).
  Next: a source_url + commissioning_year per plant; statuses were assumed
  operational. Biomass isn't a fuel_type the renderer knows yet.
- morocco-grid is superseded by this repo for the map.

## Session handoff — 2026-09-25
Merged today: #48 (45-PR consolidation), #56 (redesign: OpenFreeMap basemap,
data layers that survive font failures, one-line legend, light-mode topbar),
#57 (auto-deploy), #58 (theme switch no longer empties the map; data-centre
legend moved into the hover tooltip). morocco-grid #6 (integrity test fix).

Open:
- **PR #62** — ids for the 5 hydro dams so "Report an error" no longer says
  "Feature id: undefined" (#61, part 1). CI green, waiting for owner's OK to merge.
- **#59 Xlinks** — Moroccan end of the line is at sea (28.5N, 13.2W, off
  Tarfaya). Should land in Guelmim-Oued Noun (not Dakhla — Dakhla has its own
  corridor). Needs coordinates, or place roughly and keep "approximate".
  File: `docs/data/morocco/planned-corridors.geojson`, id `interconnector-xlinks-uk-ma`.
- **#60 Guemassa** — owner to send satellite coordinates; point is
  (31.394N, 8.022W) in `docs/data/morocco/industrial.geojson`, id `managem-guemassa`.
- **#61 part 2** — yearly production per dam: needs a sourced GWh figure per
  dam before adding an `annual_generation_gwh` field. Don't invent numbers.
- Owner reported "no info in the popup"; not reproducible in tests (popups
  show data). Likely the theme bug fixed in #58. Ask for a screenshot if it recurs.

Rules the owner set:
- Never merge a PR without the owner's explicit OK for that PR.
- `ainfrastructure.ma` was added to Cloudflare but never registered — ignore it.
- 2026-09-29: the map's address is **energy.wattu.org** (owner's domain
  wattu.org on Cloudflare). The solar tool is at **solar.wattu.org**.
- 2026-09-29: the project's public name is **Wattu** (was Atlas Nexus / Atlas
  Solar). Cloudflare Pages project names `atlas-nexus` / `atlas-solar` stay.
- Cloud sessions can't reach the live site, tile servers or satellite imagery;
  test with Playwright + vendored MapLibre (morocco-grid `vendor/maplibre-gl`).

## Decisions Log
- 2026-04-11: Map stack → Mapbox GL JS (simpler, better docs, used by enersite.app)
- 2026-04-11: Blog platform → Substack (free tier, existing account, zero setup)
- 2026-04-11: Sequencing → Blog first (faster to publish, builds audience before map launch)

## Open Questions
- [ ] First blog post angle — Morocco renewable export strategy (draft needed)
- [ ] Substack vs custom domain for SEO long-term

## Last Session
[paste session summary here after each session]