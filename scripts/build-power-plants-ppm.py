#!/usr/bin/env python3
"""
Build a European country's outline and power-plant layer from
powerplantmatching, with the same checks as the other open-data countries.

  python3 scripts/build-power-plants-ppm.py <key> <ISO2> <Country name in ppm> [...]
  e.g.   python3 scripts/build-power-plants-ppm.py france FR France spain ES Spain

Writes
  docs/data/<key>/boundary.geojson      Natural Earth 1:50m Admin 0 (public domain)
  docs/data/<key>/power-plants.geojson  powerplantmatching (CC BY 4.0)
and prints a report: plants kept, plants held out and why, capacity by fuel,
and the bounds, center and zoom to put in countries.config.js.

powerplantmatching (PyPSA / Karlsruhe Institute of Technology) reconciles
ENTSO-E, the European Commission's JRC database, Open Power System Data,
Global Energy Monitor, WRI and others into one unit-level list, refreshed
in its GitHub repository. Its `projectID` field records which datasets
confirm each plant; the layer cites them.

Rules (a failure holds the plant out; nothing is edited):
  - storage-only entries (batteries, heat, hydrogen) are not generation: out
  - retired: DateOut on or before RETIRED_BY
  - smaller than MIN_MW (keeps the map readable; the KPI says so)
  - outside the country outline by more than COAST_KM (20 km; offshore wind:
    OFFSHORE_KM, since farms sit well out at sea)
Units sharing a site (same point, same fuel: Paluel 1–4, Almaraz 1–2) are
merged into one plant: summed MW, `units`, earliest commissioning year.
A plant whose DateIn is after RETIRED_BY is `construction`; others are
`operational`. Coordinates are site-level: `precision: approximate`.

Standard library only; downloads cached in scripts/.cache/ (git-ignored).
"""
import ast
import csv
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("od", Path(__file__).with_name("build-country-open-data.py"))
od = importlib.util.module_from_spec(spec)
spec.loader.exec_module(od)

PPM_REPO = "https://github.com/PyPSA/powerplantmatching"
# Pinned to one published release so a rebuild gives the same layer. To
# refresh: take the latest commit of powerplants.csv
# (git log -1 --format='%H %cs' -- powerplants.csv) and update both lines.
PPM_SHA = "c89765681db5b41acff38737c729f2b247fdcfb6"
PPM_RELEASE = "v0.9.0, 2026-10-03"
PPM_URL = f"https://raw.githubusercontent.com/PyPSA/powerplantmatching/{PPM_SHA}/powerplants.csv"

MIN_MW = 10
RETIRED_BY = 2025
# Europe's 1:50m coastline cuts estuaries and capes: Flamanville and Le
# Blayais (Gironde) sit 7–9 km outside it. 20 km still catches a plant
# placed in the wrong country.
COAST_KM = 20
OFFSHORE_KM = 80

FUEL = {"Nuclear": "nuclear", "Wind": "wind", "Hydro": "hydro", "Solar": "solar",
        "Natural Gas": "gas", "Hard Coal": "coal", "Lignite": "coal", "Oil": "oil",
        "Solid Biomass": "biomass", "Biogas": "biomass", "Waste": "waste",
        "Geothermal": "geothermal"}
STORAGE_ONLY = {"Battery", "Heat Storage", "Hydrogen Storage"}
# Dataset keys in projectID → names shown in the popup
DATASETS = {"ENTSOE": "ENTSO-E", "JRC": "JRC (European Commission)", "OPSD": "Open Power System Data",
            "GEM": "Global Energy Monitor", "GPD": "WRI GPPD", "OSM": "OpenStreetMap",
            "GEO": "GEO", "GHR": "Global Hydropower Resources", "EESI": "EESI"}


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def site_name(names):
    """'Paluel 1', 'Paluel 2' → 'Paluel'; unrelated names → the first."""
    import os, re
    if len(set(names)) == 1:
        return names[0]
    base = os.path.commonprefix(names).rstrip(" -–(").strip()
    base = re.sub(r"\s+(Unit|Tranche|Groupe|Grupo)$", "", base, flags=re.I)
    return base if len(base) >= 3 else names[0]


def build(key, iso2, country, ne, rows):
    name, polys = od.outline(ne, iso2)
    out = ROOT / "docs" / "data" / key
    out.mkdir(parents=True, exist_ok=True)
    geom = ({"type": "Polygon", "coordinates": polys[0]} if len(polys) == 1
            else {"type": "MultiPolygon", "coordinates": polys})
    (out / "boundary.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [{
        "type": "Feature",
        "properties": {"name": name, "source": "Natural Earth 1:50m Admin 0 — Countries",
                       "source_url": "https://www.naturalearthdata.com/"},
        "geometry": geom}]}, ensure_ascii=False, separators=(",", ":")))

    cite = f"powerplantmatching {PPM_RELEASE}"
    units, held, small = {}, [], 0
    for r in rows:
        if r["Country"] != country:
            continue
        mw, lat, lon = num(r["Capacity"]), num(r["lat"]), num(r["lon"])
        fuel, tech = r["Fueltype"], (r["Technology"] or "").strip()
        out_year, in_year = num(r["DateOut"]), num(r["DateIn"])
        if fuel in STORAGE_ONLY:
            continue
        if mw is not None and 0 < mw < MIN_MW:
            small += 1
            continue
        why = None
        if fuel not in FUEL:
            why = f"fuel '{fuel}' not mapped"
        elif not mw or mw <= 0:
            why = "no capacity"
        elif lat is None or lon is None:
            why = "no coordinates"
        elif out_year and out_year <= RETIRED_BY:
            why = f"retired in {int(out_year)}"
        elif not any(od.polygon_contains(p, lon, lat) for p in polys):
            d = od.km_to_edge(polys, lon, lat)
            limit = OFFSHORE_KM if tech == "Offshore" else COAST_KM
            if d > limit:
                why = f"outside {name}, {d:.0f} km from its outline"
        if why:
            held.append((r["Name"], mw or 0, lat, lon, why))
            continue

        try:
            ids = ast.literal_eval(r["projectID"]) if r["projectID"] else {}
        except (ValueError, SyntaxError):
            ids = {}
        site = (round(lon, 3), round(lat, 3), FUEL[fuel])
        units.setdefault(site, []).append({"r": r, "mw": mw, "ids": ids, "tech": tech,
                                           "fuel": fuel, "in": in_year})

    kept = []
    for (lon, lat, fuel_type), us in units.items():
        first = max(us, key=lambda u: u["mw"])
        r = first["r"]
        mw = sum(u["mw"] for u in us)
        datasets = []
        for u in us:
            datasets += [DATASETS.get(k, k) for k in u["ids"] if DATASETS.get(k, k) not in datasets]
        osm = next((o for u in us for o in u["ids"].get("OSM", []) if o.startswith("OSM_plant:")), "")
        years = [u["in"] for u in us if u["in"]]
        running = [u for u in us if not (u["in"] and u["in"] > RETIRED_BY)]
        tech = first["tech"]
        if first["fuel"] in ("Hard Coal", "Lignite"):
            tech = f"{tech} ({first['fuel'].lower()})" if tech else first["fuel"]
        props = {
            "id": f"ppm-{iso2.lower()}-{r['id']}",
            "name": site_name(sorted(u["r"]["Name"] for u in us)),
            "capacity_mw": round(mw, 1),
            "fuel_type": fuel_type,
            "status": "operational" if running else "construction",
            "precision": "approximate",
            "source": f"{cite} · {', '.join(datasets)}" if datasets else cite,
            "source_url": ("https://www.openstreetmap.org/" + osm.split(":", 1)[1]) if osm else PPM_REPO,
        }
        if len(us) > 1:
            props["units"] = len(us)
            tech = f"{tech} · {len(us)} units" if tech else f"{len(us)} units"
        if tech:
            props["tech"] = tech
        if years:
            props["commissioning_year"] = int(min(years))
        kept.append({"type": "Feature", "properties": props,
                     "geometry": {"type": "Point", "coordinates": [lon, lat]}})

    kept.sort(key=lambda f: -f["properties"]["capacity_mw"])
    # Compact: these layers run to a few thousand features.
    (out / "power-plants.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "features": kept}, ensure_ascii=False, separators=(",", ":")))

    bounds, center, zoom = od.view(polys)
    by_fuel = {}
    for f in kept:
        p = f["properties"]
        by_fuel[p["fuel_type"]] = by_fuel.get(p["fuel_type"], 0) + p["capacity_mw"]
    total = sum(by_fuel.values())
    print(f"\n## {name} ({key}) — {cite}")
    print(f"kept {len(kept)} plants ≥ {MIN_MW} MW, {total / 1000:.1f} GW; "
          f"{small} under {MIN_MW} MW left out; held out {len(held)}")
    print("  by fuel (GW): " + ", ".join(f"{k} {v / 1000:.1f}" for k, v in
                                         sorted(by_fuel.items(), key=lambda kv: -kv[1])))
    for n, mw, lat, lon, why in held:
        print(f"  HELD  {n} ({mw:g} MW): {why}")
    print(f"  config: center {center}, zoom {zoom}, bounds {bounds}")


def main(argv):
    if len(argv) % 3 or not argv:
        sys.exit(__doc__)
    ne = json.loads(od.fetch(od.NE_URL, "ne_50m_admin_0_countries.geojson").read_text())
    with open(od.fetch(PPM_URL, "powerplantmatching.csv"), newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    for i in range(0, len(argv), 3):
        build(argv[i], argv[i + 1], argv[i + 2], ne, rows)


if __name__ == "__main__":
    main(sys.argv[1:])
