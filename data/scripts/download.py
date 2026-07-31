#!/usr/bin/env python3
"""
Morocco Energy × Digital Map — Data Download Script
Downloads prioritized datasets from MapYourGrid, HDX, GEM, and Overpass

Usage:
    python scripts/download.py
    python scripts/download.py --source mapyourgrid
    python scripts/download.py --source hdx --output data/raw/
"""

import os
import sys
import json
import argparse
import zipfile
import requests
from pathlib import Path
from datetime import datetime
from typing import Optional

# Configuration
BASE_URL = "https://data.humdata.org/api/3/action"
MAPYOURGRID_BASE = "https://mapyourgrid.org"
GEM_BASE = "https://www.gem.wiki"
GEOFABRIK_BASE = "https://download.geofabrik.de/africa"

# Directory setup
DATA_DIR = Path(__file__).parent.parent
RAW_DIR = DATA_DIR / "raw"
RAW_DIR.mkdir(exist_ok=True)

def download_file(url: str, output_path: Path, timeout=30) -> bool:
    """Download file from URL with progress tracking."""
    try:
        print(f"  Downloading: {url}")
        response = requests.get(url, timeout=timeout, stream=True)
        response.raise_for_status()

        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0

        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size:
                        pct = (downloaded / total_size) * 100
                        print(f"    [{pct:3.0f}%] {downloaded / 1024 / 1024:.1f} MB", end='\r')

        print(f"  ✓ Saved: {output_path.name} ({total_size / 1024 / 1024:.1f} MB)")
        return True
    except Exception as e:
        print(f"  ✗ Error downloading {url}: {e}")
        return False


def extract_zip(zip_path: Path, extract_dir: Path) -> bool:
    """Extract ZIP file to directory."""
    try:
        print(f"  Extracting: {zip_path.name}")
        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(extract_dir)
        print(f"  ✓ Extracted to: {extract_dir}")
        return True
    except Exception as e:
        print(f"  ✗ Error extracting {zip_path}: {e}")
        return False


def download_hdx_morocco_boundaries():
    """Download Morocco administrative boundaries from HDX (geoBoundaries)."""
    print("\n[1/4] HDX Morocco Admin Boundaries")

    hdx_dir = RAW_DIR / "hdx-admin-boundaries"
    hdx_dir.mkdir(exist_ok=True)

    # HDX COD-AB dataset for Morocco
    dataset_url = "https://data.humdata.org/dataset/cod-ab-mar"

    # Direct download link for geoBoundaries shapefile (as of 2024)
    # You may need to visit the page and get the latest download link
    shapefile_url = "https://data.humdata.org/dataset/7c7d3d5b-8c9f-45f3-9e0c-1234567890ab/resource/shapefile-download"

    print(f"  Dataset: Morocco Administrative Boundaries (geoBoundaries)")
    print(f"  HDX page: {dataset_url}")
    print(f"  License: CC-BY 4.0")

    # Alternative: Use script to fetch from HDX API
    print(f"\n  → Using API to fetch latest resource...")
    try:
        # Get dataset info
        resp = requests.get(
            "https://data.humdata.org/api/3/action/package_show",
            params={"id": "cod-ab-mar"},
            timeout=10
        )
        resp.raise_for_status()
        data = resp.json()['result']

        # Find shapefile resource
        for resource in data.get('resources', []):
            if 'shapezip' in resource['name'].lower() or '.zip' in resource['url'].lower():
                download_url = resource['url']
                zip_path = hdx_dir / f"morocco-admin-boundaries.zip"

                if download_file(download_url, zip_path):
                    extract_zip(zip_path, hdx_dir)
                    return True

        print("  ⚠ Could not find shapefile in API response")
        print(f"  → Please manually download from: {dataset_url}")
        print("     Save to: data/raw/hdx-admin-boundaries/")

    except Exception as e:
        print(f"  ⚠ API error: {e}")
        print(f"  → Please manually download from: {dataset_url}")


def download_mapyourgrid_data():
    """
    MapYourGrid doesn't have a direct bulk download URL.
    This function guides the user through manual download.
    """
    print("\n[2/4] MapYourGrid Morocco Transmission Data")

    mapyourgrid_dir = RAW_DIR / "mapyourgrid"
    mapyourgrid_dir.mkdir(exist_ok=True)

    print(f"  MapYourGrid requires manual download via their web interface.")
    print(f"  ")
    print(f"  STEPS:")
    print(f"  1. Visit: https://mapyourgrid.org/global-grid-data/")
    print(f"  2. Click 'Map It' → Select Morocco")
    print(f"  3. Download GeoJSON for:")
    print(f"     - Transmission lines")
    print(f"     - Substations")
    print(f"  4. Save files to: data/raw/mapyourgrid/")
    print(f"     - transmission-lines.geojson")
    print(f"     - substations.geojson")
    print(f"  ")
    print(f"  Expected files:")
    print(f"    data/raw/mapyourgrid/transmission-lines.geojson")
    print(f"    data/raw/mapyourgrid/substations.geojson")

    # Create placeholder
    placeholder = mapyourgrid_dir / "README.txt"
    placeholder.write_text("""
MapYourGrid Data — Manual Download Required

1. Visit https://mapyourgrid.org/global-grid-data/
2. Click "Map It" button
3. Select Morocco
4. Export as GeoJSON for:
   - Transmission lines
   - Substations (nodes)
5. Save files here with names:
   - transmission-lines.geojson
   - substations.geojson

This dataset is maintained by open-energy-transition.org
License: CC-BY 4.0
""")


def download_osm_data_via_geofabrik():
    """Download raw Morocco OSM data from Geofabrik for manual filtering."""
    print("\n[3/4] OpenStreetMap Raw Extract (Geofabrik)")

    osm_dir = RAW_DIR / "osm-power"
    osm_dir.mkdir(exist_ok=True)

    # Geofabrik provides weekly updated OSM extracts
    morocco_pbf_url = f"{GEOFABRIK_BASE}/morocco-latest.osm.pbf"

    print(f"  Geofabrik OSM extract for Morocco")
    print(f"  Updated: Weekly")
    print(f"  ")
    print(f"  → Downloading PBF file (for QGIS or osmium processing)...")

    pbf_path = osm_dir / "morocco-latest.osm.pbf"
    download_file(morocco_pbf_url, pbf_path)

    print(f"\n  Alternative: Use Overpass Turbo for filtered queries")
    print(f"  See: data/scripts/overpass-queries.txt")
    print(f"  Run at: https://overpass-turbo.eu/")


def setup_gem_plants_guide():
    """Guide user through GEM data export."""
    print("\n[4/4] Global Energy Monitor — Morocco Power Plants")

    gem_dir = RAW_DIR / "gem-plants"
    gem_dir.mkdir(exist_ok=True)

    print(f"  GEM provides data through multiple tracker platforms.")
    print(f"  ")
    print(f"  OPTION A: Manual CSV Download")
    print(f"  1. Visit: https://www.gem.wiki/Power_Sector_Transition_in_Morocco")
    print(f"  2. Look for 'Global Integrated Power Tracker'")
    print(f"  3. Click 'Download Data'")
    print(f"  4. Export as CSV for Morocco")
    print(f"  5. Save to: data/raw/gem-plants/morocco-plants.csv")
    print(f"  ")
    print(f"  OPTION B: Direct API Query")
    print(f"  Visit: https://globalenergymonitor.org/projects/global-integrated-power-tracker/")
    print(f"  Request CSV export through their contact form")
    print(f"  ")
    print(f"  Expected columns in CSV:")
    print(f"    - Plant Name")
    print(f"    - Capacity (MW)")
    print(f"    - Fuel Type")
    print(f"    - Status (Operating, Planned, etc.)")
    print(f"    - Location / Latitude / Longitude")
    print(f"    - Owner / Operator")

    # Create placeholder
    placeholder = gem_dir / "README.txt"
    placeholder.write_text("""
Global Energy Monitor — Manual Export Required

Plants data available from:
https://www.gem.wiki/Power_Sector_Transition_in_Morocco
https://globalenergymonitor.org/projects/global-integrated-power-tracker/

Expected CSV format:
- Plant Name
- Capacity (MW)
- Fuel Type (Coal, Gas, Hydro, Wind, Solar, Nuclear, etc.)
- Status (Operating, Planned, Under Construction, Retired)
- Location (City/Region)
- Latitude / Longitude
- Owner / Operator
- Commissioning Date

Save as: morocco-plants.csv
License: CC-BY 4.0 (check current license on GEM site)
""")


def main():
    parser = argparse.ArgumentParser(
        description="Download prioritized datasets for Morocco Energy Map"
    )
    parser.add_argument(
        "--source",
        choices=["all", "hdx", "mapyourgrid", "osm", "gem"],
        default="all",
        help="Which data source to download"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=RAW_DIR,
        help="Output directory for raw data"
    )

    args = parser.parse_args()

    print("=" * 70)
    print("MOROCCO ENERGY × DIGITAL MAP — DATA DOWNLOADER")
    print("=" * 70)
    print(f"Output directory: {args.output}")
    print(f"Timestamp: {datetime.now().isoformat()}")

    # Create directories
    RAW_DIR.mkdir(exist_ok=True)

    # Download based on source selection
    if args.source in ["all", "hdx"]:
        download_hdx_morocco_boundaries()

    if args.source in ["all", "mapyourgrid"]:
        download_mapyourgrid_data()

    if args.source in ["all", "osm"]:
        download_osm_data_via_geofabrik()

    if args.source in ["all", "gem"]:
        setup_gem_plants_guide()

    print("\n" + "=" * 70)
    print("NEXT STEPS:")
    print("=" * 70)
    print("\n1. Complete manual downloads:")
    print("   - MapYourGrid (see above for URL)")
    print("   - GEM plants CSV (see above for URL)")
    print("")
    print("2. For automated OSM extraction, run Overpass Turbo queries:")
    print("   - See: data/scripts/overpass-queries.txt")
    print("   - Visit: https://overpass-turbo.eu/")
    print("")
    print("3. Once all raw files are in place, run:")
    print("   python scripts/process.py")
    print("")
    print("=" * 70)


if __name__ == "__main__":
    main()
