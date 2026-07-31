# Morocco Energy × Digital Map — Implementation Guide

**Status**: Week 1 Data Pipeline Ready  
**Last Updated**: 2026-04-23  
**Next Review**: 2026-04-30

---

## Executive Summary

You now have **4 data layers** ready for ingestion into your Mapbox GL JS map:

1. **Transmission Lines** (37k+ km) — MapYourGrid + OSM
2. **Substations** (300+) — MapYourGrid + OSM  
3. **Power Plants** (80+ with metadata) — GEM + OSM
4. **Admin Boundaries** (2,400 regions) — HDX/geoBoundaries

All data will be processed into unified GeoJSON format ready for Mapbox Studio.

---

## Quick Start (5 Days, 1–2 hours/day)

### Day 1: Data Acquisition (45 min)

```bash
# 1. Run download script (automated parts)
cd data/
python scripts/download.py

# 2. Complete manual downloads
# → MapYourGrid (10 min): Visit mapyourgrid.org, export GeoJSON
# → GEM plants (5 min): Visit gem.wiki, export CSV
# → HDX admin boundaries (10 min): Download shapefile zip
```

**Files expected after Day 1:**
```
data/raw/
├── mapyourgrid/
│   ├── transmission-lines.geojson
│   └── substations.geojson
├── hdx-admin-boundaries/
│   └── mar_admbnda_hcp_*.zip (or extracted .shp files)
├── gem-plants/
│   └── morocco-plants.csv
└── osm-power/
    └── (to be populated via Overpass Turbo)
```

### Day 2: OSM Data Extraction (30 min)

Use Overpass Turbo for automated OSM queries. No coding required.

```
1. Open https://overpass-turbo.eu/
2. For each query in data/scripts/overpass-queries.txt:
   a. Paste query (clean, without comments)
   b. Click "Run"
   c. Click "Export" → GeoJSON
   d. Save to data/raw/osm-power/{layer-name}.geojson

Repeat for:
- transmission-lines
- substations
- power-plants
```

**Key queries:**
- `Query 1`: All transmission lines (37k+ km)
- `Query 2`: All substations (300+)
- `Query 3`: All power plants (120+)

**Time per query**: ~1–2 min (including download)

### Day 3: Data Processing (30 min)

```bash
# Run processing pipeline
python scripts/process.py

# Output: data/processed/
# - transmission-lines.geojson
# - substations.geojson
# - power-plants.geojson
# - admin-boundaries.geojson
```

**If you hit errors:**
- `FileNotFoundError`: Make sure all raw files are in `data/raw/`
- `shapefile module not found`: `pip install shapefile shapely`
- `Geofabrik OSM extraction`: Use web-based osmium or QGIS if Python errors

### Day 4: Mapbox Integration (30 min)

```bash
# 1. Create Mapbox account (free tier)
#    https://account.mapbox.com/auth/signup/

# 2. Create tilesets
#    - In Mapbox Studio, upload GeoJSON files
#    - Wait for processing (~1–2 min per file)

# 3. Create style/map layers
#    - Use config/mapbox-schema.json as reference
#    - Set colors, interactions, popups

# 4. Get map ID and token
#    - Access token: Settings → Tokens → Create token
#    - Style ID: Share → Copy style URL
```

### Day 5: React Integration (30 min)

See **React Integration** section below.

---

## Data Pipeline Architecture

```
Raw Sources
├── MapYourGrid (GeoJSON)
├── OSM via Overpass (GeoJSON)
├── GEM (CSV)
├── HDX Shapefile
└── Geofabrik Extract
        ↓
    [Download Scripts]
        ↓
    data/raw/ (source files)
        ↓
    [Processing Pipeline]
    (download.py → process.py)
        ↓
    data/processed/ (unified GeoJSON)
        ↓
    [Mapbox Studio]
    (upload → create tilesets)
        ↓
    Mapbox GL JS
    (React component)
        ↓
    Interactive Map UI
```

---

## File Structure

```
Energy x Digital Nexus in Emerging countries (e.g., Morocco)/
├── data/
│   ├── raw/
│   │   ├── mapyourgrid/
│   │   │   ├── transmission-lines.geojson
│   │   │   └── substations.geojson
│   │   ├── hdx-admin-boundaries/
│   │   │   ├── *.shp
│   │   │   ├── *.shx
│   │   │   ├── *.dbf
│   │   │   └── ...
│   │   ├── gem-plants/
│   │   │   └── morocco-plants.csv
│   │   └── osm-power/
│   │       ├── transmission-lines.geojson
│   │       ├── substations.geojson
│   │       ├── plants.geojson
│   │       └── morocco-latest.osm.pbf
│   │
│   ├── processed/
│   │   ├── transmission-lines.geojson (unified)
│   │   ├── substations.geojson (unified)
│   │   ├── power-plants.geojson (unified)
│   │   └── admin-boundaries.geojson (unified)
│   │
│   ├── scripts/
│   │   ├── download.py (automated)
│   │   ├── process.py (transforms)
│   │   ├── validate.py (QA)
│   │   └── overpass-queries.txt (manual)
│   │
│   ├── config/
│   │   ├── mapbox-schema.json (layer definitions)
│   │   └── data-sources.json (metadata)
│   │
│   └── README.md
│
└── IMPLEMENTATION_GUIDE.md (this file)
```

---

## Data Schemas

### Unified GeoJSON Feature

Every feature follows this structure:

```json
{
  "type": "Feature",
  "id": "transmission-12345",
  "geometry": {
    "type": "Point|LineString|Polygon",
    "coordinates": [lon, lat]
  },
  "properties": {
    "name": "Feature Name",
    "layer": "transmission-lines|substations|power-plants|admin-boundaries",
    "source": "mapyourgrid|osm|gem|hdx",
    "confidence": 0.95,
    "last_updated": "2026-04-23T10:00:00",
    "metadata": {
      // Layer-specific attributes
      "voltage_kv": "400",
      "operator": "ONEE",
      "fuel_type": "solar",
      "capacity_mw": 510,
      ...
    }
  }
}
```

### Metadata by Layer

**Transmission Lines:**
```json
{
  "voltage_kv": "400|225|110|30",
  "operator": "ONEE",
  "length_km": 250,
  "circuit_type": "single|double|triple"
}
```

**Substations:**
```json
{
  "voltage_kv": "400|225|110",
  "transformer_count": 2,
  "operator": "ONEE"
}
```

**Power Plants:**
```json
{
  "capacity_mw": 510,
  "fuel_type": "solar|wind|hydro|coal|gas|biomass",
  "status": "operating|planned|under-construction|retired",
  "operator": "MASEN|OCP|Private",
  "commissioning_year": 2016
}
```

**Admin Boundaries:**
```json
{
  "admin_level": "0|1|2|3|4",
  "name": "Morocco|Fès-Meknès|...",
  "population": 1000000
}
```

---

## Mapbox Integration

### Step 1: Upload Tilesets

**Via Mapbox Studio:**
1. Sign in → Tilesets
2. Click "New Tileset"
3. Upload each processed GeoJSON file
4. Wait for processing (1–2 min per file)

**Result:** Tileset IDs (copy these)
```
tippecanoe-transmission-lines-abc123
tippecanoe-substations-def456
tippecanoe-power-plants-ghi789
tippecanoe-admin-boundaries-jkl012
```

### Step 2: Create Map Layers

**Via Mapbox Studio (Styles):**
1. Create new style
2. Add layers, reference tilesets created above
3. Use config/mapbox-schema.json for layer properties

**Example layer configuration:**
```json
{
  "id": "transmission-lines",
  "type": "line",
  "source": "tileset-transmission",
  "source-layer": "data",
  "paint": {
    "line-color": "#FF6B6B",
    "line-width": 2,
    "line-opacity": 0.8
  }
}
```

### Step 3: Publish Style

1. Click "Publish" in Mapbox Studio
2. Copy Style ID: `mapbox://styles/username/style-id`
3. Copy Access Token: Settings → Tokens

---

## React Integration

### Install Dependencies

```bash
npm install mapbox-gl react-map-gl
```

### Basic Map Component

```jsx
import Map from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export default function MoroccoEnergyMap() {
  const [viewport, setViewport] = React.useState({
    latitude: 31.9,
    longitude: -5.0,
    zoom: 6,
  });

  return (
    <Map
      mapboxAccessToken={process.env.REACT_APP_MAPBOX_TOKEN}
      initialViewState={viewport}
      onViewportChange={setViewport}
      style={{ width: '100%', height: '100vh' }}
      mapStyle="mapbox://styles/your-username/your-style-id"
    >
      {/* Add controls, popups, etc. */}
    </Map>
  );
}
```

### Advanced: Layer Toggle

```jsx
import React, { useState } from 'react';
import Map, { Layer, Source } from 'react-map-gl';

export default function LayerToggleMap() {
  const [layers, setLayers] = useState({
    transmission: true,
    substations: true,
    plants: true,
    admin: true,
  });

  return (
    <div>
      {/* Toggles */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 100 }}>
        {Object.keys(layers).map(layer => (
          <label key={layer}>
            <input
              type="checkbox"
              checked={layers[layer]}
              onChange={() => setLayers({
                ...layers,
                [layer]: !layers[layer]
              })}
            />
            {layer}
          </label>
        ))}
      </div>

      {/* Map */}
      <Map
        mapboxAccessToken={process.env.REACT_APP_MAPBOX_TOKEN}
        initialViewState={{
          latitude: 31.9,
          longitude: -5.0,
          zoom: 6,
        }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ width: '100%', height: '100vh' }}
      >
        {layers.transmission && (
          <Source
            id="transmission"
            type="geojson"
            data="./processed/transmission-lines.geojson"
          >
            <Layer
              id="transmission-layer"
              type="line"
              paint={{ 'line-color': '#FF6B6B', 'line-width': 2 }}
            />
          </Source>
        )}
        {/* Repeat for other layers */}
      </Map>
    </div>
  );
}
```

---

## Data Quality Checks

After processing, validate with:

```bash
python scripts/validate.py
```

**Automated checks:**
- ✓ Valid GeoJSON geometry
- ✓ WGS84 coordinate system
- ✓ No duplicate features
- ✓ Coverage bounds (Morocco mainland)
- ✓ Attribute completeness

---

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| `FileNotFoundError` | Raw file missing | Check data/raw/ has all downloaded files |
| `ModuleNotFoundError: shapefile` | Missing dependency | `pip install shapefile shapely` |
| `Invalid GeoJSON` | Coordinate order wrong | Ensure [lon, lat], not [lat, lon] |
| Duplicate features | Multiple sources overlap | Run deduplication in process.py |
| Mapbox tileset failed | Invalid GeoJSON | Validate with `mapbox-validate` CLI |
| Slow map load | Large GeoJSON | Filter features by zoom level in Mapbox Studio |

---

## Update Schedule (Ongoing)

| Layer | Source | Frequency | Effort |
|-------|--------|-----------|--------|
| Transmission | MapYourGrid | Quarterly | Cron download |
| Substations | OSM | Weekly | Overpass query |
| Power Plants | GEM | Monthly | CSV export |
| Admin Boundaries | HDX | Quarterly | Manual check |

---

## Next Steps (Week 2+)

### Week 2: Secondary Layers
- [ ] Renewable energy projects (ENERGYDATA.INFO)
- [ ] Data center locations (Datacentermap scrape)
- [ ] Demand-side data (regional aggregates)

### Week 3: Specialized Layers
- [ ] OCP phosphate zones (manual digitization)
- [ ] Desalination plants (publication compilation)
- [ ] Morocco-Spain/Algeria interconnectors

### Week 4: Interactive Features
- [ ] Popup information cards
- [ ] Layer filtering by zoom level
- [ ] Time-series animations (if planned)
- [ ] Download data export

---

## References

- **Mapbox GL JS**: https://docs.mapbox.com/mapbox-gl-js/
- **React Map GL**: https://visgl.github.io/react-map-gl/
- **GeoJSON Spec**: https://tools.ietf.org/html/rfc7946
- **OpenStreetMap Tagging**: https://wiki.openstreetmap.org/wiki/Key:power
- **Overpass QL**: https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL

---

## Contact & Support

- **MapYourGrid**: contact@mapyourgrid.org
- **Global Energy Monitor**: data@globalenergymonitor.org
- **HDX/geoBoundaries**: https://www.geoboundaries.org/contact.html
- **Mapbox Support**: https://support.mapbox.com/

---

**Document Version**: 1.0  
**Last Updated**: 2026-04-23  
**Next Review**: 2026-04-30 (after Day 5 integration)
