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
| `labelFr` | yes | French name, shown on the French page (`/fr/`). |
| `iso` | yes | ISO 3166-1 alpha-2, e.g. `SN`. |
| `center`, `zoom` | yes | Initial view. |
| `bounds` | yes (with data) | `[[west, south], [east, north]]`. Every point feature must be inside it. Every line must have at least one vertex inside it. |
| `dataPath` | yes | `./data/<key>/` |
| `layers` | yes (with data) | See below. |
| `boundary` | if `boundary.geojson` exists | `{ source, sourceUrl, note }`. This is the provenance of the outline, shown in Methodology. |
| `operators` | no | `[{ key, short }]`: short operator names for tooltips. `key` matches `operator` in the data. |
| `mix` | no (warned if missing) | File name of the national electricity mix in `dataPath`, e.g. `mix.json`. See [Electricity mix](#electricity-mix-mixjson). |
| `snapshotSource` | no | Short credit for the plant figures in the "Mapped assets" tiles. |
| `snapshotSourceFr` | no | The same credit in French, when it has words to translate. |
| `credits` | no | Data credits in the footer. |
| `creditsFr` | no | The same credits in French, when they have words to translate. |
| `demand` | no | `{ source, sourceUrl, figures: [{ label, labelFr, value, unit }] }`. Dated national figures (peak, annual demand), shown as tiles under the KPIs with their source. `value` is a number. |
| `lenses` | no | `[{ id, label, labelFr, layers?, fuel?, note?, noteFr? }]`. The Energy / Water / Nexus switch above the layers. One must be `energy` (the default view). `layers` lists the layer ids a lens switches on (none: each layer's own default); `fuel` narrows the plants to one fuel type (Water: `hydro`). The `water` lens shows water figures in place of the plant tiles and hides the electricity mix; any other non-energy lens shows both. Shareable as `#lens=<id>`. |
| `liveFlow` | no | `{ path, features, partner, partnerFr, source, sourceUrl }`. Live net flow on an interconnector, read from the Wattu Worker at `path` (`/flow/<route>`, see `solar/proxy/flow.js`). Shown as a KPI tile and in the popup of each line whose `id` is in `features`; every id must belong to a `grid` feature. |
| `siteGrid` | no | `{ file, source, sourceUrl, updated }`. A national line file in `dataPath` that only **Site check** reads (not drawn), so distance-to-grid works anywhere in the country. LineString / MultiLineString features with a numeric `voltage_kv`; `status: "planned"` marks planned lines. |
| `placeholder` | no | `true` means listed as "(soon)" and not validated. |

Each layer needs `id` (unique within the country, lowercase and dashes),
`kind`, `file`, `title`, `titleFr` (French title), `source`, `sourceUrl`
(https) and `updated`.

**French.** A `source` (layers, `demand`, `liveFlow`, `siteGrid`,
`boundary`), a boundary `note`, `credits` or `snapshotSource` with words to
translate carries its French in `sourceFr` / `noteFr` / `creditsFr` /
`snapshotSourceFr`, shown on `/fr/`. Names of datasets, organisations and
licences stay as cited. The validator asks for the French whenever the
English has a lowercase word of three letters or more (domains and version
numbers aside): "Global Energy Monitor · ONEE · operator disclosures" needs
it, "Natural Earth 1:50m Admin 0" does not.

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
| `gppd_id` | recommended (hand-curated plants) | The plant's WRI Global Power Plant Database id, e.g. `WRI1023674`. CI (`scripts/check-gppd.mjs`) then holds its capacity within 10 % of WRI's, its point within 15 km and its fuel. Plants built from WRI already use it as `id`. |
| `gppd_capacity_note` | no | Why the capacity differs from WRI's (e.g. an extension WRI predates). Turns that check's failure into a note. |
| `annual_generation_gwh`, `annual_generation_year` | no | A typical year's output in GWh and the year it describes (Moroccan dams: WRI's estimate for 2017). Shown in the popup as "Annual output ≈ … GWh". Numbers. |

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

Large industrial consumers. Points, drawn as slate squares; the sector is in the tooltip and popup.

| Field | Required | Notes |
|---|---|---|
| `sector` | yes | Free text, shown in the tooltip, popup and search. |
| `estimated_demand_mw` | yes | Number, or `null` if unknown. |
| `status` | yes | As for `power`. |
| `grid_connection` | recommended | e.g. "225 kV, Jorf Lasfar substation". |

## `digital`

Data centres and submarine-cable landings. Points.

| Field | Required | Notes |
|---|---|---|
| `operator` | yes | Shown in the tooltip; an `operators` entry gives its short name. |
| `category` | yes | `cable_landing` draws as a violet ring. Anything else (`colocation`, `telco`, `hyperscale`, `government`) draws as a violet diamond. |
| `capacity_estimate_mw` | yes | Number, or `null`. Sets the diamond's size and feeds "DC pipeline". |
| `status` | yes | As for `power`. `announced`, `planned` and `construction` render faded. |
| `year` | recommended | Year energised, or target year. |
| `investment_usd` | recommended | Number. Feeds "DC investment". |

## `water`

Water infrastructure: inter-basin transfers ("water highways"), dams and
desalination plants. One kind, three categories; each category has its
own geometry and its own mark (teal lines, triangles, hexagons). The point
of the layer is the water–energy nexus: transfers and desalination are
electrical loads, so the popup gives their pumping or plant power where a
source states it, and for desalination an average load estimated at
3.5 kWh/m³ when it doesn't.

| Field | Required | Notes |
|---|---|---|
| `category` | yes | `transfer` (LineString or MultiLineString, drawn with flow arrows from the first vertex to the last), `dam` or `desalination` (Point). The validator rejects a geometry that doesn't match. |
| `status` | yes | As for `power`. `operational` transfers are solid, the others dashed; `construction`, `announced` and `planned` points get a halo. |
| `year` | recommended | Year commissioned, or target year. |
| `region` | recommended | Shown under the title. |
| `name_fr` | no | French name, shown on the French page. |
| `note`, `note_fr` | no | One or two sentences of context, shown in the popup (`note_fr` on the French page). Say there when a position is approximate and why. |
| `flow_m3s`, `length_km`, `pumping_stations`, `pumping_mva` | no | Transfers. Numbers. `flow_m3s` sets the line width. |
| `from_basin`, `to_basin` | no | Transfers. Text. |
| `storage_hm3`, `height_m` | no | Dams. Numbers; `storage_hm3` (million m³) sets the triangle's size. |
| `river`, `purpose`, `purpose_fr` | no | Dams. Text; `purpose_fr` on the French page. |
| `capacity_hm3_yr` | no | Desalination: million m³ a year, number or `null` when the operator publishes no per-plant figure. Sets the hexagon's size. |
| `power_mw` | no | Desalination: installed or dedicated power, as the source states it (the `note` says which). |
| `operator`, `energy_supply`, `energy_supply_fr` | no | Desalination. Text; `energy_supply_fr` on the French page. |

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

## Electricity mix (`mix.json`)

The country's own generation and capacity by fuel, drawn as the "Electricity
mix" bar above the layers. It is national data, not a sum of the plants on
the map. Built from Ember's yearly data by
`python3 scripts/build-country-mix.py` (see DATA_SOURCES.md); not GeoJSON.

| Field | Required | Notes |
|---|---|---|
| `year` | yes | Integer. Latest year Ember has generation for. |
| `source`, `source_url` | yes | Citation and https link, shown under the bar and in Methodology. |
| `source_fr` | yes | The citation in French, for `/fr/`. |
| `generation_twh` | yes | Total generation. |
| `capacity_gw` | yes | Sum of the fuels' capacity. |
| `renewables_pct_generation` | yes | Ember's renewables share of generation. |
| `renewables_pct_capacity` | no | Number or `null`; `null` when `capacity_gaps` is not empty. |
| `demand_twh`, `net_imports_twh`, `co2_intensity_g_per_kwh` | no | Number or `null`. Negative net imports are net exports. |
| `capacity_gaps` | yes | Fuels that generate at least 1 % but have no capacity in the source (Kenya: geothermal). The capacity view says it undercounts them. |
| `fuels` | yes | In bar order: `{ fuel, label, generation_twh, generation_pct, capacity_gw }`. `fuel` is one of the `power` fuel types, so the segment takes the plant colour; the `generation_pct` add up to 100 (± 1). |
