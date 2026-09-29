# Data schema

What a country's GeoJSON must contain for the map to render it. Each layer
in `docs/countries.config.js` has a `kind`, and the kind decides which
renderer draws it and which fields that renderer reads.

`scripts/validate-countries.mjs` enforces this document. CI runs it on every
push and pull request that touches `docs/`, `scripts/` or this file:

```
node scripts/validate-countries.mjs         # errors → exit 1; warnings are listed
node scripts/test-validate-countries.mjs    # proves each check still fires
```

If you change a required field here, change `SCHEMA` in the validator too.
The validator fails if a required field it checks is missing from this file.

**Required** fields are read by the renderer or the popup. A feature without
one either doesn't draw or shows `undefined`, so a missing one is an error.
**Recommended** fields are provenance and detail. A missing one is a warning
with a count, so gaps stay visible without blocking a deploy.

All files are GeoJSON `FeatureCollection`s in WGS84, with coordinates as
`[lng, lat]`.

---

## Country entry (`countries.config.js`)

| Field | Required | Notes |
|---|---|---|
| key | yes | Lowercase, e.g. `senegal`. Folder is `docs/data/<key>/`. |
| `label` | yes | Display name. |
| `iso` | yes | ISO 3166-1 alpha-2, e.g. `SN`. |
| `center`, `zoom` | yes | Initial view. |
| `bounds` | yes (with data) | `[[west, south], [east, north]]`. Every point feature must be inside it. Every line must have at least one vertex inside it. |
| `dataPath` | yes | `./data/<key>/` |
| `layers` | yes (with data) | See below. |
| `boundary` | if `boundary.geojson` exists | `{ source, sourceUrl, note }`. This is the provenance of the outline, shown in Methodology. |
| `palette` | no | `{ providers: [{ key, color, short }], sectors: { "<sector>": "#rrggbb" } }`. `key` matches `operator` in the data. Unlisted values use the default colour. |
| `snapshotSource` | no | Short credit above the KPI tiles. |
| `credits` | no | Data credits in the footer. |
| `placeholder` | no | `true` means listed as "(soon)" and not validated. |

Each layer needs `id` (unique within the country, lowercase and dashes),
`kind`, `file`, `title`, `source`, `sourceUrl` (https) and `updated`.

`boundary.geojson` is optional. It holds Polygon or MultiPolygon features
only.

Disputed borders are an editorial decision. Record it in `boundary.note`
so the Methodology panel states it.

## Fields shared by every point and line

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Tooltip and popup title. |
| `status` | yes | Allowed values depend on the kind. |
| `source` | yes | Human-readable citation. |
| `source_url` | recommended | http(s) link, shown as "source ↗". |
| `precision` | recommended | `exact` or `approximate`. |
| `id` | recommended | Stable string, unique in the file, e.g. `sn-cap-des-biches`. Used in "Report an error" issues. |

## `power`

Power plants. Points, clustered at low zoom, coloured by fuel.

| Field | Required | Notes |
|---|---|---|
| `capacity_mw` | yes | Nameplate MW, number. Feeds "Tracked capacity". |
| `fuel_type` | yes | One of `solar`, `wind`, `hydro`, `coal`, `gas`, `oil`, `nuclear`, `geothermal`, `biomass`, `waste`. `solar`, `wind`, `hydro`, `geothermal` and `biomass` count toward "Renewables share". Use `oil` for HFO and diesel plants. |
| `status` | yes | `operational`, `construction`, `announced`, `planned` or `idle`. `construction` and `announced` get a halo. |
| `commissioning_year` | recommended | Year commissioned, or target year if not operational. |
| `tech`, `operator`, `region` | recommended | Shown in the popup. |

## `grid`

Transmission lines and interconnectors. LineString or MultiLineString.

| Field | Required | Notes |
|---|---|---|
| `voltage_kv` | yes | Number, in kV. Sets the width: ≥300 is HV, 100–299 is MV, <100 is LV. |
| `status` | yes | `operational`, `planned` or `idle` only. The renderer draws nothing else. A layer where every feature is `planned` gets a dashed purple swatch in the sidebar. |
| `kind` | recommended | Free text such as `interconnector_ac`. `hvdc_planned` shows as "HVDC (planned)". |

Lines may leave the country (interconnectors, export corridors) but must
touch it.

## `industrial`

Large industrial consumers. Points, coloured by `palette.sectors`.

| Field | Required | Notes |
|---|---|---|
| `sector` | yes | Free text. Matches a `palette.sectors` key for its colour. |
| `estimated_demand_mw` | yes | Number, or `null` if unknown. |
| `status` | yes | As for `power`. |
| `grid_connection` | recommended | e.g. "225 kV, Jorf Lasfar substation". |

## `digital`

Data centres and submarine-cable landings. Points.

| Field | Required | Notes |
|---|---|---|
| `operator` | yes | Matches a `palette.providers` key for its colour. |
| `category` | yes | `cable_landing` draws as a teal ring. Anything else (`colocation`, `telco`, `hyperscale`, `government`) draws as a data-centre bubble. |
| `capacity_estimate_mw` | yes | Number, or `null`. Sets the bubble size and feeds "DC pipeline". |
| `status` | yes | As for `power`. `announced`, `planned` and `construction` render faded. |
| `year` | recommended | Year energised, or target year. |
| `investment_usd` | recommended | Number. Feeds "DC investment". |

## `oim`

The OpenInfraMap live grid (OSM data, worldwide). No file: set `file: null`.
It needs no data from us, so any country can include it.

## `oim-plants`

OpenStreetMap power plants, live from OpenInfraMap's `power_plant_point`
tile layer (name, output in MW, fuel, construction, disused, start date).
No file: set `file: null`. It covers every country, but OpenInfraMap thins
it by size at low zoom (all plants from zoom 8), so it is not counted in the
KPI tiles. Those come from the curated `power` layer. The two layers overlap
where both know a plant; set `visible: false` to start this one unticked.
Errors in it are fixed on OpenStreetMap; the popup links there.
