"""Convert Morocco transmission shapefiles to WGS84 GeoJSON.

Drops 60 kV distribution and keeps 150 / 225 / 400 kV lines.

Run from repo root:
    python3 scripts/build-transmission-geojson.py

Optional output override:
    python3 scripts/build-transmission-geojson.py --out transmission-lines.geojson
"""
import argparse
import json
from pathlib import Path

import shapefile
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "transmission-lines.geojson"

MERCHICH = (
    "+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 "
    "+x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 +units=m +no_defs"
)
to_wgs = Transformer.from_crs(MERCHICH, "EPSG:4326", always_xy=True)

KEEP = {"150 kV", "225 kV", "400 kV"}
VOLTAGE_KV = {"150 kV": 150, "225 kV": 225, "400 kV": 400}

features = []


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="Output GeoJSON path. Defaults to transmission-lines.geojson at repo root.",
    )
    return parser.parse_args()

def ingest(path, status):
    r = shapefile.Reader(str(path))
    kept = dropped = 0
    for shp, rec in zip(r.shapes(), r.records()):
        legend = rec[0]
        if legend not in KEEP:
            dropped += 1
            continue
        kv = VOLTAGE_KV[legend]
        parts = list(shp.parts) + [len(shp.points)]
        segments = [shp.points[parts[i]:parts[i+1]] for i in range(len(parts)-1)]
        coords = [[list(to_wgs.transform(x, y)) for x, y in seg] for seg in segments]
        geom = (
            {"type": "LineString", "coordinates": coords[0]}
            if len(coords) == 1
            else {"type": "MultiLineString", "coordinates": coords}
        )
        features.append({
            "type": "Feature",
            "id": f"wbg-{status}-{len(features)+1}",
            "geometry": geom,
            "properties": {
                "name": f"{legend} line ({status})",
                "voltage_kv": kv,
                "status": status,
                "source": "World Bank Group — Morocco Power Sector Masterplan (2018)",
                "source_url": "https://datacatalog.worldbank.org/",
            },
        })
        kept += 1
    print(f"  {path.name}: kept {kept}, dropped {dropped}")

def main():
    args = parse_args()

    ingest(ROOT / "existingtransmissionlines/Existing_transmission_lines", "existing")
    ingest(ROOT / "futuretransmissionlines/Future_transmission_lines", "planned")

    fc = {"type": "FeatureCollection", "features": features}
    out_path = args.out if args.out.is_absolute() else ROOT / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {len(features)} features -> {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
