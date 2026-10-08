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

## Session handoff — 2026-10-08 (solar: « Trouver un installateur »)
- New card after « Et maintenant ? »: two Taqa Pro-labelled installers
  (Econosol, Shamsiyah — owner's pick), shuffled per visit, no commission,
  link to the official Taqa Pro list. Hidden from the PDF print.
- Method, scores and sources: solar/INSTALLERS.md (review every 6 months).
  Websites were not opened during research — check them before merging.
- New analytics event `installer_click` (src = company id). Needs a manual
  `wrangler deploy` of solar/proxy, or the Worker drops it.

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
- Owner to do (checklist in SECURITY.md): branch protection on main,
  `production` environment for the Cloudflare secrets, Dependabot, record
  revocation dates of old tokens.

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