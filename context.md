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
Work through the map correction issues (#59, #60, #61) — see handoff below.

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
- Next: the fuel palette fails the dataviz validator (gas/oil too close);
  changing it changes the map dots.

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