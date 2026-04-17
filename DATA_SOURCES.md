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
**File:** `docs/data/morocco/grid-lines.geojson`

| Source | URL | License |
|---|---|---|
| OpenStreetMap — Overpass API | https://overpass-turbo.eu/ | ODbL 1.0 — attribution required, share-alike on derived databases |
| ONEE network maps (public domain overview) | http://www.one.org.ma/ | Public information, attribution required |
| MIICEN announcements (HVDC corridor) | https://www.mem.gov.ma/ | Government press material |

**Attribution:** `© OpenStreetMap contributors, ODbL 1.0 · ONEE`

**Note:** Line routing is **approximate** — traced from ONEE schematic
maps and OSM power=line ways, not digitised from a grid-operator
shapefile.

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
| TeleGeography — Submarine Cable Map | https://www.submarinecablemap.com/ | Public reference |

**Note:** `capacity_estimate_mw` for announced projects is the headline
figure from press releases, not energised capacity.

## Layer 5 — Renewable Potential (v1.1)
Not shipped in v1.0. Intended sources for v1.1:

| Source | URL | License |
|---|---|---|
| Global Solar Atlas (World Bank / Solargis) | https://globalsolaratlas.info/ | CC BY 4.0 (data download), tile use under TOS |
| Global Wind Atlas (DTU) | https://globalwindatlas.info/ | Free, with attribution |

---

## Base map
- **Mapbox** — dark-v11 / light-v11. Requires an account token.
  Production deployments use a URL-restricted token.
- **Fallback (not yet wired):** MapLibre GL JS + OpenFreeMap tiles.
  See `ASSUMPTIONS.md` §7.

## Known gaps (as of 2026-04-17)
- No sub-60 kV distribution network.
- No substation dataset — only line endpoints.
- No demand time-series — demand is a single annual estimate.
- No cross-border interconnection capacities with Spain/Algeria (to be
  added in v1.1).
- No renewable potential raster (Layer 5).

---

## How to contribute corrections
1. Open an issue or PR on the [GitHub repo](https://github.com/redatahiri37/morocco-energy-digital-map).
2. Every correction must include a **public source URL** — no unsourced edits.
3. Updating a feature: change the GeoJSON, update `source`, `source_url`,
   and bump the `updated` date in `countries.config.js`.
