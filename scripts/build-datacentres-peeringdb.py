#!/usr/bin/env python3
"""
Build each country's data-centre layer from a PeeringDB facility export,
with the same kind of checks used for power plants.

  python3 scripts/build-datacentres-peeringdb.py <peeringdb-fac.json> [ISO2=key ...]

The export is PeeringDB's public API response, e.g.
  https://www.peeringdb.com/api/fac?country__in=ZA,NG,KE,EG,GH,CI,RW,ET,SN
saved as JSON. Only name, operator, city, coordinates and the PeeringDB id
are published; contact fields in the export are ignored.

Writes docs/data/<key>/datacentres.geojson and prints a report.

Checks on every facility (a failure holds it out; nothing is edited):
  - with coordinates: inside the country outline (or within COAST_KM of it),
    and within CITY_KM of the city PeeringDB names, when the gazetteer knows
    that city (catches pins dropped in the wrong city)
  - without coordinates: placed at the named city's centre from the
    GeoNames gazetteer and marked `precision: approximate`; held out if the
    city is unknown
A city name matching several gazetteer places (districts often carry the
city's name) resolves to the most populous one.
Sites that share a point with another facility are kept and listed in the
report, since several operators can sit in one building or free zone.

Gazetteer: GeoNames cities with population > 15,000 via the `geonamescache`
package (pip install geonamescache). Without it, city checks are skipped
and facilities without coordinates are held out.
"""
import importlib.util
import json
import math
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
spec = importlib.util.spec_from_file_location("od", Path(__file__).with_name("build-country-open-data.py"))
od = importlib.util.module_from_spec(spec)
spec.loader.exec_module(od)

CITY_KM = 50
# Data centres sit in coastal cities that a 1:50m coastline cuts through
# (Lagos Island, central Accra); 15 km still catches a pin in the wrong country.
COAST_KM = 15
DEFAULT_KEYS = {"ZA": "south-africa", "NG": "nigeria", "KE": "kenya", "EG": "egypt",
                "GH": "ghana", "CI": "cote-divoire", "RW": "rwanda", "ET": "ethiopia",
                "SN": "senegal"}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return " ".join(s.lower().replace("-", " ").split())


def gazetteer():
    try:
        import geonamescache
    except ImportError:
        print("geonamescache not installed: city checks skipped", file=sys.stderr)
        return None
    by = {}
    for c in geonamescache.GeonamesCache().get_cities().values():
        names = {c["name"]} | set(c.get("alternatenames") or [])
        for n in names:
            by.setdefault((c["countrycode"], norm(n)), []).append(
                (c["longitude"], c["latitude"], c["name"], c.get("population") or 0))
    # Most populous first: "Cairo" is the capital, not a district named after it.
    return {k: sorted(v, key=lambda m: -m[3])[:1] for k, v in by.items()}


def load_outline(key):
    fc = json.loads((ROOT / "docs" / "data" / key / "boundary.geojson").read_text())
    polys = []
    for f in fc["features"]:
        g = f["geometry"]
        polys += g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    return polys


def main(argv):
    if not argv:
        sys.exit(__doc__)
    facs = json.loads(Path(argv[0]).read_text())["data"]
    keys = dict(DEFAULT_KEYS)
    for a in argv[1:]:
        iso, key = a.split("=")
        keys[iso] = key
    gaz = gazetteer()

    for iso, key in keys.items():
        polys = load_outline(key)
        kept, held, shared = [], [], {}
        for r in sorted((f for f in facs if f["country"] == iso and f.get("status") == "ok"),
                        key=lambda f: f["id"]):
            city = (r.get("city") or "").strip()
            matches = gaz.get((iso, norm(city)), []) if gaz is not None else []
            lon, lat = r.get("longitude"), r.get("latitude")
            precision, why = "exact", None
            if lon is None or lat is None:
                if len(matches) == 1:
                    lon, lat = matches[0][0], matches[0][1]
                    precision = "approximate"
                    # The facility's own name may name its real city ("CYNOX-KANO"
                    # listed under Nassarawa, a Kano district that is also a town
                    # 400 km away). Hold it out if that city is far from the placement.
                    for word in norm(r["name"]).replace(",", " ").split():
                        other = gaz.get((iso, word), [])
                        if other and od.haversine(lon, lat, other[0][0], other[0][1]) > CITY_KM:
                            why = (f"no coordinates; city '{city}' resolves to {matches[0][2]}, "
                                   f"but the name says {other[0][2]}")
                            break
                    # A bare name that another, precisely located facility already
                    # carries is the same site listed twice ("Icolo" vs "icolo.io NBO1").
                    twin = next((f for f in facs if f["country"] == iso and f["id"] != r["id"]
                                 and f.get("latitude") is not None
                                 and norm(r["name"]) in norm(f["name"])), None)
                    if twin and not why:
                        why = f"no coordinates; likely the same site as '{twin['name']}'"
                else:
                    why = f"no coordinates; city '{city}' not in gazetteer"
            else:
                if not any(od.polygon_contains(p, lon, lat) for p in polys) and \
                        od.km_to_edge(polys, lon, lat) > COAST_KM:
                    why = "outside the country outline"
                elif len(matches) == 1:
                    d = od.haversine(lon, lat, matches[0][0], matches[0][1])
                    if d > CITY_KM:
                        why = f"pin is {d:.0f} km from {matches[0][2]}, the city it lists"
            if why:
                held.append((r["id"], r["name"], why))
                continue
            lon, lat = round(lon, 5), round(lat, 5)
            shared.setdefault((lon, lat), []).append(r["name"])
            kept.append({"type": "Feature", "properties": {
                "id": f"peeringdb-fac-{r['id']}",
                "name": r["name"].strip(),
                "operator": r["org_name"].strip(),
                "category": "colocation",
                "capacity_estimate_mw": None,
                "status": "operational",
                "region": city,
                "precision": precision,
                "source": "PeeringDB",
                "source_url": f"https://www.peeringdb.com/fac/{r['id']}",
            }, "geometry": {"type": "Point", "coordinates": [lon, lat]}})

        out = ROOT / "docs" / "data" / key / "datacentres.geojson"
        out.write_text(json.dumps({"type": "FeatureCollection", "features": kept},
                                  ensure_ascii=False, indent=1))
        print(f"\n## {key} ({iso}): kept {len(kept)}, held out {len(held)}")
        for fid, name, why in held:
            print(f"  HELD  fac {fid} {name}: {why}")
        for pt, names in shared.items():
            if len(names) > 1:
                print(f"  SHARED POINT {pt}: " + "; ".join(names))
        for f in kept:
            if f["properties"]["precision"] == "approximate":
                print("  CITY CENTRE (approximate): %s -> %s"
                      % (f["properties"]["name"], f["geometry"]["coordinates"]))


if __name__ == "__main__":
    main(sys.argv[1:])
