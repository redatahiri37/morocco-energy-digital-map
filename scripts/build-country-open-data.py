#!/usr/bin/env python3
"""
Build a country's outline and curated power-plant layer from open datasets,
with the same checks used when Senegal was added.

  python3 scripts/build-country-open-data.py <key> <ISO2> <ISO3> [<ISO2> <ISO3> <key> ...]

For each country it writes
  docs/data/<key>/boundary.geojson      Natural Earth 1:50m Admin 0 (public domain)
  docs/data/<key>/power-plants.geojson  WRI Global Power Plant Database v1.3 (CC BY 4.0)
and prints a report: plants kept, plants held out and why, and the bounds,
center and zoom to put in countries.config.js.

Checks on every plant (a failure holds the plant out; nothing is edited):
  - inside the country outline, or within COAST_KM of it (coastal plants
    fall just outside a 1:50m coastline)
  - positive capacity and a fuel the map knows
  - not a duplicate: same coordinates and same capacity as another plant
    (separate units on one site, e.g. Aswan High Dam and Aswan II, are kept)
WRI's database was last updated in 2021 and lists existing plants only, so
every plant is marked `precision: approximate`, `status: operational`.

Standard library only. Downloads are cached in scripts/.cache/ (git-ignored).
"""
import csv
import hashlib
import json
import math
import os
import shutil
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / ".cache"

# Pinned to a commit, and each download checked against its sha256: a
# rebuild uses exactly the files the published layers were built from. To
# move to a newer upstream, change the commit and the hash together.
NE_URL = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
          "ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_50m_admin_0_countries.geojson")
GPPD_URL = ("https://raw.githubusercontent.com/wri/global-power-plant-database/"
            "7a91cfbb2a4e272597acbc00506d61fc1ec73b3d/output_database/global_power_plant_database.csv")
SHA256 = {
    "ne_50m_admin_0_countries.geojson": "3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb",
    "gppd.csv": "4b1f93e0fd93664f18684d9b05d0a52ed9658c6a8cf0d21ff2520791379ba7fc",
    "powerplantmatching.csv": "faddf9a165e227b7866a6b4f42485ffc22041f20a75a8638c38e405cfc786136",
}
GPPD_HOME = "https://datasets.wri.org/dataset/globalpowerplantdatabase"

COAST_KM = 5
# Islands further than this from the mainland are dropped from the outline
# (e.g. South Africa's Prince Edward Islands), so bounds stay on the country.
ISLAND_KM = 1000
# ...except where those islands are the country: Spain's Canaries lie
# ~1,700 km from the Iberian centroid and carry several GW of plants.
ISLAND_KM_BY_ISO = {"ES": 2200}

FUEL = {"Solar": "solar", "Wind": "wind", "Hydro": "hydro", "Coal": "coal",
        "Gas": "gas", "Oil": "oil", "Nuclear": "nuclear",
        "Geothermal": "geothermal", "Biomass": "biomass", "Waste": "waste"}


def fetch(url, name):
    """Download once into scripts/.cache. A partial download never lands
    under the final name, and a file whose hash is wrong is refused."""
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if not path.exists():
        print(f"downloading {url}", file=sys.stderr)
        part = path.with_suffix(path.suffix + ".part")
        with urllib.request.urlopen(url, timeout=60) as r, open(part, "wb") as fh:
            shutil.copyfileobj(r, fh)
        os.replace(part, path)
    want = SHA256.get(name)
    if want:
        got = hashlib.sha256(path.read_bytes()).hexdigest()
        if got != want:
            sys.exit(f"{path}: sha256 {got}, expected {want}. Delete it and rerun, "
                     "or update SHA256 if the source was moved on purpose.")
    return path


def haversine(lon1, lat1, lon2, lat2):
    dl, dp = math.radians(lon2 - lon1), math.radians(lat2 - lat1)
    a = (math.sin(dp / 2) ** 2 + math.cos(math.radians(lat1))
         * math.cos(math.radians(lat2)) * math.sin(dl / 2) ** 2)
    return 6371 * 2 * math.asin(math.sqrt(a))


def ring_contains(ring, lon, lat):
    inside, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def polygon_contains(poly, lon, lat):
    return ring_contains(poly[0], lon, lat) and not any(ring_contains(h, lon, lat) for h in poly[1:])


def km_to_edge(polys, lon, lat):
    return min(haversine(lon, lat, x, y) for poly in polys for ring in poly for x, y in ring)


def centroid(ring):
    return (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))


def outline(ne, iso2):
    # Natural Earth codes a few countries -99 in ISO_A2 (France, Norway);
    # ISO_A2_EH carries the code for those.
    feats = [f for f in ne["features"]
             if iso2 in (f["properties"].get("ISO_A2"), f["properties"].get("ISO_A2_EH"))]
    if len(feats) != 1:
        sys.exit(f"{iso2}: expected one Natural Earth feature, found {len(feats)}")
    f = feats[0]
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    main = max(polys, key=lambda p: len(p[0]))
    cx, cy = centroid(main[0])
    limit = ISLAND_KM_BY_ISO.get(iso2, ISLAND_KM)
    kept = [p for p in polys if haversine(cx, cy, *centroid(p[0])) <= limit]
    rnd = lambda ring: [[round(x, 4), round(y, 4)] for x, y in ring]
    kept = [[rnd(r) for r in p] for p in kept]
    return f["properties"]["NAME"], kept


def view(polys):
    xs = [x for p in polys for x, _ in p[0]]
    ys = [y for p in polys for _, y in p[0]]
    w, s, e, n = min(xs), min(ys), max(xs), max(ys)
    bounds = [[math.floor((w - 0.2) * 10) / 10, math.floor((s - 0.2) * 10) / 10],
              [math.ceil((e + 0.2) * 10) / 10, math.ceil((n + 0.2) * 10) / 10]]
    span = max(e - w, (n - s) * 1.3)
    # MapLibre renders 512 px tiles: at zoom z the world is 512·2^z px wide.
    zoom = round(max(4.0, min(8.0, math.log2(900 / 512 * 360 / span))), 1)
    return bounds, [round((w + e) / 2, 2), round((s + n) / 2, 2)], zoom


def build(key, iso2, iso3, ne, gppd):
    name, polys = outline(ne, iso2)
    out = ROOT / "docs" / "data" / key
    out.mkdir(parents=True, exist_ok=True)
    geom = ({"type": "Polygon", "coordinates": polys[0]} if len(polys) == 1
            else {"type": "MultiPolygon", "coordinates": polys})
    (out / "boundary.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [{
        "type": "Feature",
        "properties": {"name": name, "source": "Natural Earth 1:50m Admin 0 — Countries",
                       "source_url": "https://www.naturalearthdata.com/"},
        "geometry": geom}]}, ensure_ascii=False, separators=(",", ":")))

    kept, held, seen = [], [], {}
    for r in gppd:
        if r["country"] != iso3:
            continue
        lon, lat, mw = float(r["longitude"]), float(r["latitude"]), float(r["capacity_mw"] or 0)
        why = None
        if r["primary_fuel"] not in FUEL:
            why = f"fuel '{r['primary_fuel']}' not mapped"
        elif mw <= 0:
            why = "no capacity"
        elif (round(lon, 4), round(lat, 4), round(mw, 1)) in seen:
            why = f"duplicate of {seen[(round(lon, 4), round(lat, 4), round(mw, 1))]} (same point, same MW)"
        elif not any(polygon_contains(p, lon, lat) for p in polys):
            d = km_to_edge(polys, lon, lat)
            if d > COAST_KM:
                why = f"outside {name}, {d:.0f} km from its outline"
        if why:
            held.append((r["name"], mw, lat, lon, why))
            continue
        seen[(round(lon, 4), round(lat, 4), round(mw, 1))] = r["name"]
        year = r["commissioning_year"]
        src = r["source"].strip()
        url = r["url"].strip()
        props = {
            "id": r["gppd_idnr"],
            "name": r["name"],
            "capacity_mw": round(mw, 1),
            "fuel_type": FUEL[r["primary_fuel"]],
            "status": "operational",
            "precision": "approximate",
            "source": f"WRI Global Power Plant Database v1.3 · {src}" if src else "WRI Global Power Plant Database v1.3",
            "source_url": url if url.startswith("http") else GPPD_HOME,
        }
        if year:
            props["commissioning_year"] = int(float(year))
        if r["owner"].strip():
            props["operator"] = r["owner"].strip()
        kept.append({"type": "Feature", "properties": props,
                     "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]}})

    kept.sort(key=lambda f: -f["properties"]["capacity_mw"])
    (out / "power-plants.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "features": kept}, ensure_ascii=False, indent=1))

    bounds, center, zoom = view(polys)
    total = sum(f["properties"]["capacity_mw"] for f in kept)
    print(f"\n## {name} ({key})")
    print(f"kept {len(kept)} plants, {total / 1000:.1f} GW; held out {len(held)}")
    for n, mw, lat, lon, why in held:
        print(f"  HELD  {n} ({mw:g} MW) at {lat:.3f}, {lon:.3f}: {why}")
    print(f"  config: center {center}, zoom {zoom}, bounds {bounds}")


def main(argv):
    if len(argv) % 3 or not argv:
        sys.exit(__doc__)
    ne = json.loads(fetch(NE_URL, "ne_50m_admin_0_countries.geojson").read_text())
    with open(fetch(GPPD_URL, "gppd.csv"), newline="", encoding="utf-8") as fh:
        gppd = list(csv.DictReader(fh))
    for i in range(0, len(argv), 3):
        build(argv[i], argv[i + 1], argv[i + 2], ne, gppd)


if __name__ == "__main__":
    main(sys.argv[1:])
