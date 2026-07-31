# DATA SOURCES — Morocco Infrastructure Map v1.0

Every feature in `/docs/data/morocco/*.geojson` carries a `source` and
`source_url` property. This file lists those sources in one place, with
the license or reuse terms for each.

*Compiled 2026-04-17. If any terms below are out of date, open an issue
or a PR on GitHub.*

---

## Layer 1 — Power Generation
**File:** `docs/data/morocco/power-plants.geojson`

| Source | URL | License / terms |
|---|---|---|
| Global Energy Monitor — Global Power Plant Tracker | https://globalenergymonitor.org/projects/global-power-plant-tracker/ | CC BY 4.0 with attribution |
| Global Energy Monitor — Global Solar / Wind / Coal / Gas Power Trackers | https://globalenergymonitor.org/projects/ | CC BY 4.0 |
| ONEE — public disclosures | http://www.one.org.ma/ | Public information, attribution required |
| MASEN project pages | https://www.masen.ma/ | Public information |
| TAQA Morocco financials | https://www.taqamorocco.ma/ | Public filings |
| World Bank — Aïn Beni Mathar ISCC | https://www.worldbank.org/en/news/feature/2011/07/12/combining-sun-and-gas-morocco | Editorial reference |

**Attribution template (for screenshots):**
`Data: Global Energy Monitor · ONEE · MASEN · operator disclosures`

## Layer 2 — Transmission Grid
**File:** `docs/data/morocco/grid-lines.geojson` (editorial overlay only)

As of v1.2 the full transmission grid and substations are rendered
directly from **OpenInfraMap** vector tiles — no ingest, always
fresh, full OSM coverage. Our `grid-lines.geojson` now carries only
the editorial overlay: cross-border interconnectors and planned
HVDC corridors that are either absent from OSM or tell a
strategic story OSM doesn't (status=idle, status=planned with
commissioning year, capacity).

| Source | URL | License |
|---|---|---|
| **OpenInfraMap vector tiles** (live grid + substations) | https://openinframap.org/ | ODbL 1.0 via OSM — attribution required |
| OpenStreetMap (underlying OIM data) | https://www.openstreetmap.org/copyright | ODbL 1.0 |
| REE — Spain/Morocco interconnection | https://www.ree.es/en/activities/operation-of-the-electricity-system/international-interconnections | Public disclosure |
| Xlinks — Morocco-UK Power Project | https://xlinks.co/morocco-uk-power-project/ | Company press material |
| MIICEN announcements (Dakhla-Agadir HVDC) | https://www.mem.gov.ma/ | Government press material |
| **Gridfinder** — predictive distribution network (cross-validation) | https://gridfinder.rdrn.me · Dataset: https://zenodo.org/records/3628142 | CC BY 4.0 |
| **Africa Electricity Grids Explorer** — regional transmission (cross-validation) | https://africagrid.energydata.info/ | World Bank / ESMAP open data |

**Attribution:** `OpenInfraMap · © OpenStreetMap contributors, ODbL 1.0`

**Note on precision:** The OIM overlay is as accurate as OSM — survey-grade
in populated areas, patchy in remote ones. The editorial interconnector
geometries are indicative great-circle routes, not actual cable paths.

**Cross-validation:** OIM coverage for Morocco's HV network is dense in
the north (Casablanca–Rabat–Fès corridor) and thinner in the south and
east. The [Gridfinder dataset](https://zenodo.org/records/3628142)
(Arderne, Nicolas, Zorn & Koks, *Scientific Data* 7, 19, 2020 —
[doi:10.1038/s41597-019-0347-4](https://doi.org/10.1038/s41597-019-0347-4))
uses nighttime satellite imagery + OSM roads to *predict* distribution
line locations globally (CC BY 4.0). It is used here as a diagnostic
tool to identify OIM coverage gaps, not as a displayed geometry source.
The [Africa Electricity Grids Explorer](https://africagrid.energydata.info/)
(World Bank / ESMAP) provides Africa-specific regional transmission
topology, used to cross-check strategic corridor routing.

## Layer 3 — Industrial Consumers
**File:** `docs/data/morocco/industrial.geojson`

| Source | URL | License |
|---|---|---|
| OCP Group annual reports | https://www.ocpgroup.ma/en | Public disclosure |
| LafargeHolcim Morocco | https://www.lafargeholcim.ma/ | Public disclosure |
| SONASID annual reports | https://www.sonasid.ma/ | Public disclosure |
| Maghreb Steel | https://www.maghrebsteel.ma/ | Company disclosures |
| Renault Media | https://www.media.renault.com/ | Press material |
| Stellantis | https://www.stellantis.com/ | Press material |
| SAMIR filings | https://www.samir.ma/ | Public filings |
| Managem | https://www.managemgroup.com/ | Public disclosure |

**Note:** `estimated_demand_mw` is a public-source **estimate**, not an
audited figure. Treat as order-of-magnitude.

## Layer 4 — Digital Infrastructure
**File:** `docs/data/morocco/digital.geojson`

| Source | URL | License |
|---|---|---|
| Datacentermap.com | https://www.datacentermap.com/morocco/ | Free-to-use with attribution |
| OpenStreetMap — `telecom=data_center` | https://overpass-turbo.eu/ | ODbL 1.0 |
| Datacenter Dynamics (DCD) reporting | https://www.datacenterdynamics.com/ | Editorial reference |
| Reuters / press announcements | https://www.reuters.com/ | Editorial reference |
| MIICEN announcements | https://www.mcinet.gov.ma/ | Government press |
| ADD (Agence de Développement du Digital) | https://www.add.gov.ma/ | Government press |
| TeleGeography — Submarine Cable Map | https://www.submarinecablemap.com/ (Morocco landings: filter by country) | Public reference — 597 systems, 1 712 landings, rolling updates |
| **PeeringDB** — internet exchange points (planned v1.1) | https://www.peeringdb.com · Maroc IX: https://www.peeringdb.com/ix/2274 | Community-maintained, free API with attribution |

**Note:** `capacity_estimate_mw` for announced projects is the headline
figure from press releases, not energised capacity.

**PeeringDB note:** Maroc IX (Casablanca) is Morocco's primary Internet
Exchange Point. It is not yet a rendered feature in v1.0 — adding it as
a point in the digital layer is a v1.1 backlog item. PeeringDB provides
a free JSON API at `https://www.peeringdb.com/api/ixlan/?id=<id>`.

## Layer 5 — Renewable Potential (v1.1)
Not shipped in v1.0. Intended sources for v1.1:

| Source | URL | License |
|---|---|---|
| Global Solar Atlas (World Bank / Solargis) | https://globalsolaratlas.info/ | CC BY 4.0 (data download), tile use under TOS |
| Global Wind Atlas (DTU) | https://globalwindatlas.info/ | Free, with attribution |

---

## Base map (v1.1)
- **MapLibre GL JS** — open-source WebGL map renderer (BSD-3).
- **CARTO basemaps** — `dark-matter-gl-style` / `positron-gl-style`.
  Free for use with attribution: `© CARTO, © OpenStreetMap contributors`.
  https://carto.com/basemaps · https://carto.com/attributions
- **OpenStreetMap** (underlying source for CARTO) — ODbL 1.0.
  https://www.openstreetmap.org/copyright

No account, token, or API key is required.

## Country boundary
- **Natural Earth** — 1:50m Admin 0 Countries (public domain).
  https://www.naturalearthdata.com/
  The boundary layer renders Morocco only; the Western Sahara
  territorial question is outside the scope of this energy-infrastructure
  project and is not drawn.

## Known gaps (as of 2026-04-17)
- No sub-60 kV distribution network — [Gridfinder](https://zenodo.org/records/3628142)
  (Arderne et al. 2020, CC BY 4.0) provides a predictive global estimate
  that could fill this gap in v1.1 for remote regions where OSM is sparse.
- No substation dataset — only line endpoints. (OIM renders substations
  as polygons/points at zoom ≥ 5; no ingest needed.)
- No demand time-series — demand is a single annual estimate.
- No cross-border interconnection capacities with Spain/Algeria (to be
  added in v1.1).
- No renewable potential raster (Layer 5).
- No Internet Exchange Point feature (Maroc IX, Casablanca) — intended
  for v1.1 using PeeringDB API.

---

## Related platforms & peer tools

These are not data sources for this project but comparable or
complementary tools worth knowing.

| Platform | Focus | Geographic strength | License | Used here |
|---|---|---|---|---|
| [OpenInfraMap](https://openinframap.org) | Power + telco + oil & gas via OSM | Global, continuous | ODbL 1.0 | ✅ Primary grid tiles |
| [Gridfinder](https://gridfinder.rdrn.me) | Predictive distribution network | Global; strong in data-scarce Africa / Asia | CC BY 4.0 | Cross-validation only |
| [Africa Electricity Grids Explorer](https://africagrid.energydata.info) | Africa regional transmission | Africa | World Bank open data | Cross-validation only |
| [OpenGridWorks](https://opengridworks.com) | Power plants + transmission + substations | Global (US-agency data primary) | Free | No — monitor for MENA expansion |
| [MapYourGrid](https://mapyourgrid.org) | OSM grid-coverage improvement campaign | Global | CC BY 4.0 | No — improves OIM upstream |
| [Electricity Maps](https://app.electricitymaps.com) | Live grid carbon intensity + flow | Global, 15-min updates | API (key required) | No — v1.2 candidate for live mix chart |
| [TeleGeography Submarine Cable Map](https://www.submarinecablemap.com) | Submarine cables, 597 systems | Global, rolling | Public reference | ✅ Cable layer source |
| [PeeringDB](https://www.peeringdb.com) | Internet exchange points | Global, ~1 300 IXPs | Free API | Planned v1.1 (Maroc IX) |

---

## How to contribute corrections
1. Open an issue or PR on the [GitHub repo](https://github.com/redatahiri37/morocco-energy-digital-map).
2. Every correction must include a **public source URL** — no unsourced edits.
3. Updating a feature: change the GeoJSON, update `source`, `source_url`,
   and bump the `updated` date in `countries.config.js`.
