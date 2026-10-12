# data/ — source files behind the Morocco map

The map serves only what is in `docs/data/<country>/` (format: `DATA_SCHEMA.md`).
This folder keeps the inputs some of those files are built from.

| Path | What it is | Used by |
|---|---|---|
| `energy/gen_{solar,wind,thermal,hydro}.geojson` | Hand-curated Moroccan power plants | `scripts/build-power-plants.py` → `docs/data/morocco/power-plants.geojson` |
| `energy/grid_hv*.geojson`, `energy/re_zones.geojson` | Earlier grid and renewable-zone layers, kept for lineage | — |
| `sources/{existing,future}transmissionlines/` | World Bank 2018 transmission shapefiles | `scripts/build-transmission-geojson.py` (`WBG_DIR=data/sources`) → `docs/data/morocco/transmission-lines.geojson` |
| `*.xlsx` | Workbooks behind the editorial charts | `editorial-system/` |

Other countries are built straight from open sources by `scripts/build-country-open-data.py`
and `scripts/build-power-plants-ppm.py`; `DATA_SOURCES.md` lists every source.
