# Morocco Energy × Digital Map — Data Pipeline

## Directory Structure

```
data/
├── raw/                    # Downloaded source files
│   ├── mapyourgrid/
│   ├── hdx-admin-boundaries/
│   ├── osm-power/
│   └── gem-plants/
├── processed/              # Cleaned, unified GeoJSON
│   ├── transmission.geojson
│   ├── substations.geojson
│   ├── power-plants.geojson
│   ├── admin-boundaries.geojson
│   ├── data-centers.geojson
│   ├── industrial-zones.geojson
│   └── desalination-plants.geojson
├── scripts/                # Processing and validation
│   ├── download.py
│   ├── process.py
│   ├── validate.py
│   └── overpass-queries.txt
└── config/
    ├── mapbox-schema.json
    └── data-sources.json
```

## Data Sources (Week 1)

### 1. Transmission & Substations — MapYourGrid
- **URL**: [MapYourGrid](https://mapyourgrid.org/global-grid-data/)
- **License**: CC-BY 4.0
- **Download**: Use "Map It" interface → Morocco → GeoJSON
- **Expected**: 37k+ km transmission lines, 300+ substations
- **Format**: GeoJSON
- **Effort**: Low

### 2. Power Plants — Open Infrastructure Map (OSM)
- **URL**: [openinframap.org](https://openinframap.org)
- **License**: ODbL (OpenStreetMap)
- **Method**: Overpass Turbo query (automated)
- **Expected**: 120+ power plants
- **Format**: GeoJSON
- **Effort**: Low (automated query)

### 3. Admin Boundaries — HDX (Humanitarian Data Exchange)
- **URL**: [data.humdata.org/dataset/cod-ab-mar](https://data.humdata.org/dataset/cod-ab-mar)
- **License**: CC-BY 4.0 (geoBoundaries)
- **Expected**: Regional, Provincial, Commune boundaries
- **Format**: Shapefile (downloadable as zip)
- **Effort**: Low

### 4. Power Plant Metadata — Global Energy Monitor
- **URL**: [GEM Power Sector Morocco](https://www.gem.wiki/Power_Sector_Transition_in_Morocco)
- **License**: CC-BY 4.0
- **Method**: Manual CSV export or database query
- **Expected**: All Moroccan plants with capacity, fuel type, owner
- **Format**: CSV → GeoJSON
- **Effort**: Medium

---

## Quick Start (Execute in order)

### Step 1: Download Raw Data (5 min)
```bash
python scripts/download.py
```

### Step 2: Process to Unified GeoJSON (10 min)
```bash
python scripts/process.py
```

### Step 3: Validate Quality (5 min)
```bash
python scripts/validate.py
```

### Step 4: Upload to Mapbox (5 min)
```bash
# Use Mapbox Studio or mapbox-cli
```

---

## Data Schema (All GeoJSON layers follow this structure)

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "unique_id",
      "geometry": {
        "type": "Point|LineString|Polygon",
        "coordinates": [lon, lat]
      },
      "properties": {
        "name": "Feature name",
        "layer": "transmission|substation|power-plant|admin-boundary",
        "source": "mapyourgrid|osm|gem|hdx|manual",
        "confidence": 0.95,
        "last_updated": "2025-04-23",
        "metadata": {}
      }
    }
  ]
}
```

---

## Data Update Schedule

| Dataset | Frequency | Automation | Owner |
|---------|-----------|-----------|-------|
| MapYourGrid | Quarterly | Cron job | open-energy-transition |
| OSM Power | Weekly | Overpass query | OpenStreetMap community |
| GEM Plants | Monthly | Manual CSV export | Global Energy Monitor |
| HDX Admin | Quarterly | Manual check | geoBoundaries |

---

## Data Quality Metrics

After each ingest, validate:
- [ ] All features have valid geometry (Point/Line/Polygon)
- [ ] Coordinate system is WGS84 (EPSG:4326)
- [ ] No duplicate features (check by ID + geometry)
- [ ] Coverage: All of Morocco mainland
- [ ] Attribute completeness: 80%+ for critical fields

---

## Next: Specialized Layers (Weeks 2-4)

### Week 2
- Renewable energy projects (ENERGYDATA.INFO)
- Data center locations (Datacentermap scrape)

### Week 3
- OCP industrial zones (manual digitization)
- Desalination plants (compilation + geo-location)

### Week 4
- Morocco-Spain/Algeria interconnectors (manual GeoJSON)
- Demand side layers (load aggregations by province)
