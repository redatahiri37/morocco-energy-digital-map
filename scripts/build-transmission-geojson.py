"""Convert WBG 2018 transmission-line shapefiles (Merchich Nord Maroc) to WGS84
GeoJSON for the Morocco infrastructure map. Drops 60 kV distribution; keeps
150 / 225 / 400 kV (HV + EHV) as per the Pawel Czyzak / Ember convention.

Usage:
    WBG_DIR=/path/containing/shapefile-folders python3 scripts/build-transmission-geojson.py

WBG_DIR must contain:
    existingtransmissionlines/Existing_transmission_lines.{shp,dbf,shx,prj}
    futuretransmissionlines/Future_transmission_lines.{shp,dbf,shx,prj}

Writes docs/data/morocco/transmission-lines.geojson (relative to repo root).
"""
import json, os, shapefile
from pyproj import Transformer
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WBG  = Path(os.environ.get("WBG_DIR", REPO.parent)).resolve()
OUT  = REPO / "docs/data/morocco/transmission-lines.geojson"

MERCHICH = (
    "+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 "
    "+x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 +units=m +no_defs"
)
to_wgs = Transformer.from_crs(MERCHICH, "EPSG:4326", always_xy=True)

KEEP = {"150 kV", "225 kV", "400 kV"}
VOLTAGE_KV = {"150 kV": 150, "225 kV": 225, "400 kV": 400}

features = []

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

ingest(WBG / "existingtransmissionlines/Existing_transmission_lines", "existing")
ingest(WBG / "futuretransmissionlines/Future_transmission_lines", "planned")

fc = {"type": "FeatureCollection", "features": features}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")))
print(f"wrote {len(features)} features → {OUT.relative_to(REPO)}")
