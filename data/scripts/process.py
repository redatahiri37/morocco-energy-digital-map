#!/usr/bin/env python3
"""
Morocco Energy × Digital Map — Data Processing Pipeline
Converts raw data from multiple sources to unified GeoJSON format

Usage:
    python scripts/process.py
    python scripts/process.py --layer transmission
    python scripts/process.py --validate
"""

import json
import csv
import argparse
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional
import shutil

# Directory setup
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
PROCESSED_DIR.mkdir(exist_ok=True)


class GeoJSONUnifier:
    """Unified GeoJSON schema for all Morocco energy layers."""

    SCHEMA_VERSION = "1.0"

    @staticmethod
    def create_feature(
        feature_id: str,
        layer: str,
        geometry: Dict,
        properties: Dict,
        source: str,
        confidence: float = 0.9
    ) -> Dict:
        """Create a standardized feature matching project schema."""
        return {
            "type": "Feature",
            "id": feature_id,
            "geometry": geometry,
            "properties": {
                "name": properties.get("name", "Unknown"),
                "layer": layer,
                "source": source,
                "confidence": confidence,
                "last_updated": datetime.now().isoformat(),
                "metadata": properties,  # Store all original properties
            }
        }

    @staticmethod
    def create_feature_collection(features: List[Dict]) -> Dict:
        """Create a FeatureCollection with metadata."""
        return {
            "type": "FeatureCollection",
            "schema_version": GeoJSONUnifier.SCHEMA_VERSION,
            "generated": datetime.now().isoformat(),
            "total_features": len(features),
            "features": features
        }


class TransmissionLineProcessor:
    """Process transmission lines from MapYourGrid and OSM."""

    @staticmethod
    def process_mapyourgrid_geojson(file_path: Path) -> List[Dict]:
        """Process MapYourGrid GeoJSON export."""
        features = []
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)

            for feature in data.get('features', []):
                props = feature.get('properties', {})
                geometry = feature.get('geometry', {})

                # Extract key attributes
                line_id = props.get('id') or props.get('osm_id') or f"mg-{len(features)}"
                name = props.get('name', f"Line {line_id}")
                voltage = props.get('voltage', 'Unknown')
                operator = props.get('operator', 'Unknown')

                unified = GeoJSONUnifier.create_feature(
                    feature_id=f"transmission-{line_id}",
                    layer="transmission-lines",
                    geometry=geometry,
                    properties={
                        "name": name,
                        "voltage_kv": voltage,
                        "operator": operator,
                        "length_km": props.get('length_km'),
                        "original_properties": props
                    },
                    source="mapyourgrid",
                    confidence=0.95
                )
                features.append(unified)

            print(f"  ✓ Processed {len(features)} transmission lines from MapYourGrid")
            return features

        except FileNotFoundError:
            print(f"  ⚠ MapYourGrid file not found: {file_path}")
            return []
        except Exception as e:
            print(f"  ✗ Error processing MapYourGrid: {e}")
            return []

    @staticmethod
    def process_osm_lines_geojson(file_path: Path) -> List[Dict]:
        """Process OSM power lines from Overpass Turbo export."""
        features = []
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)

            for feature in data.get('features', []):
                props = feature.get('properties', {})
                geometry = feature.get('geometry', {})

                line_id = props.get('id') or props.get('osm_id')
                name = props.get('name', f"OSM Line {line_id}")
                voltage = props.get('voltage', 'Unknown')
                operator = props.get('operator', 'ONEE')

                unified = GeoJSONUnifier.create_feature(
                    feature_id=f"transmission-osm-{line_id}",
                    layer="transmission-lines",
                    geometry=geometry,
                    properties={
                        "name": name,
                        "voltage_kv": voltage,
                        "operator": operator,
                        "original_properties": props
                    },
                    source="osm",
                    confidence=0.85
                )
                features.append(unified)

            print(f"  ✓ Processed {len(features)} transmission lines from OSM")
            return features

        except FileNotFoundError:
            print(f"  ⚠ OSM transmission file not found: {file_path}")
            return []
        except Exception as e:
            print(f"  ✗ Error processing OSM lines: {e}")
            return []


class SubstationProcessor:
    """Process substations from MapYourGrid and OSM."""

    @staticmethod
    def process_mapyourgrid_substations(file_path: Path) -> List[Dict]:
        """Process MapYourGrid substations."""
        features = []
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)

            for feature in data.get('features', []):
                props = feature.get('properties', {})
                geometry = feature.get('geometry', {})

                sub_id = props.get('id') or props.get('osm_id')
                name = props.get('name', f"Substation {sub_id}")
                voltage = props.get('voltage', 'Unknown')

                unified = GeoJSONUnifier.create_feature(
                    feature_id=f"substation-{sub_id}",
                    layer="substations",
                    geometry=geometry,
                    properties={
                        "name": name,
                        "voltage_kv": voltage,
                        "original_properties": props
                    },
                    source="mapyourgrid",
                    confidence=0.95
                )
                features.append(unified)

            print(f"  ✓ Processed {len(features)} substations from MapYourGrid")
            return features

        except FileNotFoundError:
            print(f"  ⚠ MapYourGrid substations file not found: {file_path}")
            return []
        except Exception as e:
            print(f"  ✗ Error processing MapYourGrid substations: {e}")
            return []

    @staticmethod
    def process_osm_substations(file_path: Path) -> List[Dict]:
        """Process OSM substations."""
        features = []
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)

            for feature in data.get('features', []):
                props = feature.get('properties', {})
                geometry = feature.get('geometry', {})

                sub_id = props.get('id') or props.get('osm_id')
                name = props.get('name', f"Substation {sub_id}")
                voltage = props.get('voltage', 'Unknown')

                unified = GeoJSONUnifier.create_feature(
                    feature_id=f"substation-osm-{sub_id}",
                    layer="substations",
                    geometry=geometry,
                    properties={
                        "name": name,
                        "voltage_kv": voltage,
                        "original_properties": props
                    },
                    source="osm",
                    confidence=0.80
                )
                features.append(unified)

            print(f"  ✓ Processed {len(features)} substations from OSM")
            return features

        except FileNotFoundError:
            print(f"  ⚠ OSM substations file not found: {file_path}")
            return []
        except Exception as e:
            print(f"  ✗ Error processing OSM substations: {e}")
            return []


class PowerPlantProcessor:
    """Process power plants from GEM, OSM, and ENERGYDATA."""

    @staticmethod
    def process_gem_csv(file_path: Path) -> List[Dict]:
        """Process GEM plants CSV export."""
        features = []
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)

                for idx, row in enumerate(reader):
                    # Extract coordinates
                    try:
                        lat = float(row.get('latitude') or row.get('Latitude', 0))
                        lon = float(row.get('longitude') or row.get('Longitude', 0))
                    except (ValueError, TypeError):
                        continue

                    if lat == 0 or lon == 0:
                        continue

                    plant_id = row.get('id') or row.get('Plant Name', f"plant-{idx}")
                    capacity_mw = row.get('capacity_mw') or row.get('Capacity (MW)', 'Unknown')
                    fuel_type = row.get('fuel_type') or row.get('Fuel Type', 'Unknown')
                    status = row.get('status') or row.get('Status', 'Operating')

                    unified = GeoJSONUnifier.create_feature(
                        feature_id=f"plant-gem-{idx}",
                        layer="power-plants",
                        geometry={
                            "type": "Point",
                            "coordinates": [lon, lat]
                        },
                        properties={
                            "name": row.get('Plant Name') or plant_id,
                            "capacity_mw": capacity_mw,
                            "fuel_type": fuel_type,
                            "status": status,
                            "operator": row.get('operator') or row.get('Owner'),
                            "commissioning_year": row.get('commissioning_year'),
                            "original_properties": row
                        },
                        source="gem",
                        confidence=0.90
                    )
                    features.append(unified)

            print(f"  ✓ Processed {len(features)} power plants from GEM CSV")
            return features

        except FileNotFoundError:
            print(f"  ⚠ GEM plants file not found: {file_path}")
            return []
        except Exception as e:
            print(f"  ✗ Error processing GEM CSV: {e}")
            return []

    @staticmethod
    def process_osm_plants_geojson(file_path: Path) -> List[Dict]:
        """Process OSM power plants."""
        features = []
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)

            for feature in data.get('features', []):
                props = feature.get('properties', {})
                geometry = feature.get('geometry', {})

                plant_id = props.get('id') or props.get('osm_id')
                name = props.get('name', f"Plant {plant_id}")
                fuel_type = props.get('power:source', 'Unknown')
                capacity = props.get('power:output:electrical:megawatt', 'Unknown')

                unified = GeoJSONUnifier.create_feature(
                    feature_id=f"plant-osm-{plant_id}",
                    layer="power-plants",
                    geometry=geometry,
                    properties={
                        "name": name,
                        "fuel_type": fuel_type,
                        "capacity_mw": capacity,
                        "operator": props.get('operator'),
                        "original_properties": props
                    },
                    source="osm",
                    confidence=0.75
                )
                features.append(unified)

            print(f"  ✓ Processed {len(features)} power plants from OSM")
            return features

        except FileNotFoundError:
            print(f"  ⚠ OSM plants file not found: {file_path}")
            return []
        except Exception as e:
            print(f"  ✗ Error processing OSM plants: {e}")
            return []


class AdminBoundaryProcessor:
    """Process administrative boundaries from HDX/geoBoundaries."""

    @staticmethod
    def process_hdx_shapefile_to_geojson(shp_dir: Path) -> List[Dict]:
        """
        Process HDX shapefile. This requires ogr2ogr or shapely.
        Falls back to guidance if dependencies not available.
        """
        features = []

        try:
            import shapefile
            from shapely.geometry import shape
        except ImportError:
            print(f"  ⚠ shapefile/shapely not installed")
            print(f"    To convert shapefiles to GeoJSON, run:")
            print(f"    pip install shapefile shapely")
            print(f"    or use ogr2ogr: ogr2ogr -f GeoJSON output.geojson input.shp")
            return []

        try:
            # Find .shp files in directory
            shp_files = list(shp_dir.glob("*.shp"))

            for shp_file in shp_files:
                print(f"  Processing: {shp_file.name}")

                with shapefile.Reader(str(shp_file)) as shp:
                    for idx, record in enumerate(shp.shapeRecords()):
                        geom = shape(record.shape.__geo_interface__)
                        props = dict(zip([field[0] for field in shp.fields[1:]], record.record))

                        admin_level = props.get('ADM_PCODE', props.get('NAME', f"region-{idx}"))

                        unified = GeoJSONUnifier.create_feature(
                            feature_id=f"admin-{admin_level}",
                            layer="admin-boundaries",
                            geometry=json.loads(json.dumps(geom.__geo_interface__)),
                            properties={
                                "name": props.get('NAME'),
                                "admin_level": admin_level,
                                "original_properties": props
                            },
                            source="hdx",
                            confidence=0.99
                        )
                        features.append(unified)

            print(f"  ✓ Processed {len(features)} admin boundaries from HDX shapefiles")
            return features

        except Exception as e:
            print(f"  ✗ Error processing HDX shapefiles: {e}")
            return []


def merge_features_by_layer(all_features: Dict[str, List[Dict]]) -> None:
    """Merge and save features grouped by layer."""
    for layer_name, features in all_features.items():
        if not features:
            print(f"  ⊘ No features for {layer_name}")
            continue

        fc = GeoJSONUnifier.create_feature_collection(features)
        output_file = PROCESSED_DIR / f"{layer_name}.geojson"

        with open(output_file, 'w') as f:
            json.dump(fc, f, indent=2)

        print(f"  ✓ Saved: {output_file.name} ({len(features)} features)")


def main():
    parser = argparse.ArgumentParser(
        description="Process raw data to unified GeoJSON format"
    )
    parser.add_argument(
        "--layer",
        choices=["all", "transmission", "substations", "plants", "admin"],
        default="all",
        help="Which layer(s) to process"
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate output GeoJSON files"
    )

    args = parser.parse_args()

    print("=" * 70)
    print("MOROCCO ENERGY × DIGITAL MAP — DATA PROCESSOR")
    print("=" * 70)
    print(f"Raw data directory: {RAW_DIR}")
    print(f"Output directory: {PROCESSED_DIR}")

    all_features = {
        "transmission-lines": [],
        "substations": [],
        "power-plants": [],
        "admin-boundaries": []
    }

    # Process transmission lines
    if args.layer in ["all", "transmission"]:
        print("\n[1/4] Processing Transmission Lines")
        all_features["transmission-lines"].extend(
            TransmissionLineProcessor.process_mapyourgrid_geojson(
                RAW_DIR / "mapyourgrid" / "transmission-lines.geojson"
            )
        )
        all_features["transmission-lines"].extend(
            TransmissionLineProcessor.process_osm_lines_geojson(
                RAW_DIR / "osm-power" / "transmission-lines.geojson"
            )
        )

    # Process substations
    if args.layer in ["all", "substations"]:
        print("\n[2/4] Processing Substations")
        all_features["substations"].extend(
            SubstationProcessor.process_mapyourgrid_substations(
                RAW_DIR / "mapyourgrid" / "substations.geojson"
            )
        )
        all_features["substations"].extend(
            SubstationProcessor.process_osm_substations(
                RAW_DIR / "osm-power" / "substations.geojson"
            )
        )

    # Process power plants
    if args.layer in ["all", "plants"]:
        print("\n[3/4] Processing Power Plants")
        all_features["power-plants"].extend(
            PowerPlantProcessor.process_gem_csv(
                RAW_DIR / "gem-plants" / "morocco-plants.csv"
            )
        )
        all_features["power-plants"].extend(
            PowerPlantProcessor.process_osm_plants_geojson(
                RAW_DIR / "osm-power" / "plants.geojson"
            )
        )

    # Process admin boundaries
    if args.layer in ["all", "admin"]:
        print("\n[4/4] Processing Administrative Boundaries")
        all_features["admin-boundaries"].extend(
            AdminBoundaryProcessor.process_hdx_shapefile_to_geojson(
                RAW_DIR / "hdx-admin-boundaries"
            )
        )

    # Merge and save
    print("\n[Saving] Merging features by layer")
    merge_features_by_layer(all_features)

    # Validation
    if args.validate:
        print("\n[Validating] GeoJSON structure and geometry")
        # Add validation logic here

    print("\n" + "=" * 70)
    print("PROCESSING COMPLETE")
    print("=" * 70)
    print(f"\nOutput files ready in: {PROCESSED_DIR}")
    print("\nNEXT STEP: Upload to Mapbox Studio")
    print("  1. Create Mapbox account (free tier available)")
    print("  2. Create new tileset from GeoJSON")
    print("  3. Create map layers from tilesets")
    print("  4. Embed in React/HTML with Mapbox GL JS")


if __name__ == "__main__":
    main()
