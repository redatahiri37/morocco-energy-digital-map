#!/usr/bin/env python3
"""
Merge our 4 generation GeoJSON files (gen_solar/wind/thermal/hydro) into a
single power-plants.geojson matching the v1.6 schema.

v1.6 schema:
  id, name, capacity_mw, fuel_type, tech, status, commissioning_year,
  operator, region, precision, source, source_url
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "data" / "energy"
OUT = ROOT / "docs" / "data" / "morocco" / "power-plants.geojson"

PRECISION_MAP = {
    "exact": "exact",
    "approximate": "~5km",
    "centroid": "centroid",
}

# subsector → fuel_type (v1.6 vocabulary)
def fuel_type(props: dict) -> str:
    sub = (props.get("subsector") or "").lower()
    tech = (props.get("technology") or "").lower()
    desc = (props.get("description") or "").lower()
    if sub.startswith("solar"):
        return "solar_csp" if "csp" in sub or "trough" in tech or "tower" in tech else "solar_pv"
    if sub == "wind":
        return "wind"
    if sub == "hydro":
        return "pumped_storage" if "pumped" in tech.lower() or "step" in props.get("name","").lower() else "hydro"
    if sub == "thermal":
        if "coal" in tech or "coal" in desc:
            return "coal"
        if "iscc" in tech or "iscc" in desc:
            return "gas_iscc"
        if "ccgt" in tech or "combined cycle" in tech:
            return "gas_ccgt"
        if "fuel oil" in tech or "hfo" in tech.lower():
            return "hfo"
        return "thermal"
    return sub or "unknown"

# rough region buckets from coordinates (lon, lat)
def region_for(lon: float, lat: float) -> str:
    if lat >= 34.5: return "North"
    if lat >= 32.5 and lon >= -7: return "Central / Atlas"
    if lat >= 30 and lon <= -7: return "Atlantic"
    if lat < 30: return "Southern Provinces"
    return "Central"

def transform(feat: dict) -> dict:
    p = feat["properties"]
    coords = feat["geometry"]["coordinates"]
    lon, lat = coords[0], coords[1]
    return {
        "type": "Feature",
        "geometry": feat["geometry"],
        "properties": {
            "id": p.get("id"),
            "name": p.get("name"),
            "capacity_mw": p.get("capacity_mw"),
            "fuel_type": fuel_type(p),
            "tech": p.get("technology") or "",
            "status": p.get("status") or "operational",
            "commissioning_year": p.get("year_operational"),
            "operator": p.get("operator") or "",
            "region": region_for(lon, lat),
            "precision": PRECISION_MAP.get(p.get("coord_confidence",""), "approximate"),
            "source": p.get("source") or "",
            "source_url": "",
            "description": p.get("description") or "",
        },
    }

def main():
    all_feats = []
    for fname in ["gen_solar.geojson", "gen_wind.geojson", "gen_thermal.geojson", "gen_hydro.geojson"]:
        d = json.loads((SRC_DIR / fname).read_text())
        for ft in d["features"]:
            all_feats.append(transform(ft))
    fc = {"type": "FeatureCollection", "features": all_feats}
    OUT.write_text(json.dumps(fc, separators=(",", ":")))
    print(f"Wrote {OUT} — {len(all_feats)} features")
    # Summary
    from collections import Counter
    fuels = Counter(f["properties"]["fuel_type"] for f in all_feats)
    total_mw = sum(f["properties"]["capacity_mw"] or 0 for f in all_feats)
    print(f"Total capacity: {total_mw:,} MW")
    print(f"By fuel: {dict(fuels)}")

if __name__ == "__main__":
    main()
