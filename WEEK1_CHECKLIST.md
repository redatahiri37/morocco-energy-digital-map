# Week 1 Checklist — Morocco Energy × Digital Map

**Objective**: Get 4 prioritized data layers into Mapbox  
**Time Commitment**: 1–2 hours/day, 5 days  
**Outcome**: Interactive map with transmission, substations, power plants, admin boundaries

---

## Day 1 (Monday) — Automated Downloads & Manual Prep (45 min)

**Goal**: Kick off downloads, get raw files in place

- [ ] **[5 min] Run automated download script**
  ```bash
  cd data/
  python scripts/download.py
  ```
  Expected output:
  - `data/raw/hdx-admin-boundaries/` (created, awaiting manual download)
  - `data/raw/mapyourgrid/` (created, awaiting manual download)
  - `data/raw/osm-power/` (created, including morocco-latest.osm.pbf)
  - `data/raw/gem-plants/` (created, awaiting CSV export)

- [ ] **[10 min] Download HDX Morocco Admin Boundaries**
  - Visit: https://data.humdata.org/dataset/cod-ab-mar
  - Look for "geoBoundaries" resource (most recent)
  - Download the shapefile ZIP (mar_admbnda_hcp_*.zip)
  - Extract to: `data/raw/hdx-admin-boundaries/`
  - ✓ You should now have `.shp`, `.shx`, `.dbf` files

- [ ] **[10 min] Download MapYourGrid Data**
  - Visit: https://mapyourgrid.org/global-grid-data/
  - Click "Map It" button
  - Select "Morocco" on the map
  - Under "Download", select:
    - [ ] Transmission Lines → GeoJSON → Save as `data/raw/mapyourgrid/transmission-lines.geojson`
    - [ ] Substations → GeoJSON → Save as `data/raw/mapyourgrid/substations.geojson`
  - ✓ Expected size: ~5–10 MB each

- [ ] **[10 min] Find GEM Plants CSV**
  - Visit: https://www.gem.wiki/Power_Sector_Transition_in_Morocco
  - Look for "Global Integrated Power Tracker" link
  - Click "Download Data"
  - Filter for Morocco
  - Export as CSV
  - Save as: `data/raw/gem-plants/morocco-plants.csv`
  - ⚠️ If form is unavailable, manually visit: https://globalenergymonitor.org/projects/global-integrated-power-tracker/
  - ✓ Expected: 80–100 power plants with capacity, fuel type, location

- [ ] **[10 min] Verify directory structure**
  ```bash
  ls -la data/raw/
  # Expected:
  # ├── hdx-admin-boundaries/  (with .shp, .shx, .dbf files)
  # ├── mapyourgrid/           (with .geojson files)
  # ├── osm-power/             (with .pbf file)
  # └── gem-plants/            (with .csv file)
  ```

- [ ] **[1 min] Log progress**
  - Update `CONTEXT.md` or task tracker

---

## Day 2 (Tuesday) — OSM Data Extraction via Overpass (30 min)

**Goal**: Extract 3 power infrastructure layers from OpenStreetMap

**Note**: No coding required. Using web browser tool.

### Part A: Extract Transmission Lines (8 min)

- [ ] **[2 min] Open Overpass Turbo**
  - Visit: https://overpass-turbo.eu/
  - Map should show Morocco (if not, adjust zoom manually)

- [ ] **[4 min] Run transmission line query**
  - Copy the **CLEAN** query from `data/scripts/overpass-queries.txt` (Query 1)
  - Paste into Overpass editor (left side)
  - **Remove comments** (lines starting with #)
  - Click blue "Run" button
  - Wait 2–3 sec for results
  - Should see red lines on map (Morocco transmission network)

- [ ] **[2 min] Export as GeoJSON**
  - Click "Export" button (top right)
  - Select "GeoJSON"
  - Browser downloads file (likely `export.geojson`)
  - Save to: `data/raw/osm-power/transmission-lines.geojson`
  - ✓ Expected: 37,000+ line segments

### Part B: Extract Substations (8 min)

- [ ] **[4 min] Run substation query**
  - Copy Query 2 from `data/scripts/overpass-queries.txt`
  - Remove comments
  - Paste into Overpass editor
  - Click "Run"
  - Should see orange circles on map (substations)

- [ ] **[2 min] Export as GeoJSON**
  - Click "Export" → "GeoJSON"
  - Save to: `data/raw/osm-power/substations.geojson`
  - ✓ Expected: 300+ substations

### Part C: Extract Power Plants (8 min)

- [ ] **[4 min] Run power plant query**
  - Copy Query 3 from `data/scripts/overpass-queries.txt`
  - Remove comments
  - Paste into Overpass editor
  - Click "Run"
  - Should see blue/red circles on map (power plants)

- [ ] **[2 min] Export as GeoJSON**
  - Click "Export" → "GeoJSON"
  - Save to: `data/raw/osm-power/plants.geojson`
  - ✓ Expected: 120+ plants

### Part D: Verify Downloads (6 min)

- [ ] **[3 min] Check file sizes**
  ```bash
  ls -lh data/raw/osm-power/
  # transmission-lines.geojson should be ~5 MB
  # substations.geojson should be ~1 MB
  # plants.geojson should be ~0.5 MB
  ```

- [ ] **[3 min] Quick validation**
  - Open each GeoJSON file in a text editor
  - Verify first line is `{"type":"FeatureCollection"`
  - Verify last line has closing `}`
  - ✓ Files should be valid JSON

---

## Day 3 (Wednesday) — Data Processing Pipeline (30 min)

**Goal**: Transform raw data into unified GeoJSON format

- [ ] **[2 min] Check Python dependencies**
  ```bash
  pip install requests shapefile shapely
  ```

- [ ] **[15 min] Run processing script**
  ```bash
  cd data/
  python scripts/process.py
  ```
  Expected output:
  ```
  [Saving] Merging features by layer
  ✓ Saved: transmission-lines.geojson (XXXXX features)
  ✓ Saved: substations.geojson (XXXXX features)
  ✓ Saved: power-plants.geojson (XXXXX features)
  ✓ Saved: admin-boundaries.geojson (XXXXX features)
  ```

- [ ] **[10 min] Verify processed files**
  ```bash
  ls -lh data/processed/
  # Should have 4 .geojson files
  # Total size: ~20–30 MB
  ```

- [ ] **[3 min] Quick spot check**
  ```bash
  # Check one file is valid GeoJSON
  head -20 data/processed/transmission-lines.geojson
  # Should see: {"type":"FeatureCollection", "features": [...]
  ```

- [ ] **Troubleshooting**
  - If `FileNotFoundError`: Raw files missing → Check Day 1 & 2 completeness
  - If `shapefile module error`: Install with `pip install shapefile shapely`
  - If invalid GeoJSON error: Check coordinate order is [lon, lat]

---

## Day 4 (Thursday) — Mapbox Studio Setup (45 min)

**Goal**: Upload GeoJSON files to Mapbox, create map style

### Part A: Mapbox Account & Access Token (5 min)

- [ ] **[3 min] Create Mapbox account (if needed)**
  - Visit: https://account.mapbox.com/auth/signup/
  - Sign up with email
  - Verify email
  - ✓ You get free tier: 50,000 tileset queries/month

- [ ] **[2 min] Generate access token**
  - Log in → Account → Tokens
  - Click "Create a token"
  - Name: "Morocco Energy Map Dev"
  - Scopes: Check `tilesets:read`, `tilesets:write`, `styles:read`, `styles:write`
  - Click "Create token"
  - **Copy token and save safely** (you'll need it later)
  - ✓ Token format: `pk.xxxxxxxxxxxxxxxxxxxx`

### Part B: Upload Tilesets (20 min)

- [ ] **[5 min] Upload transmission lines**
  - In Mapbox Studio, go to "Tilesets"
  - Click "New tileset"
  - Upload: `data/processed/transmission-lines.geojson`
  - Wait for processing (1–2 min)
  - ✓ Note the tileset ID (appears in list)

- [ ] **[5 min] Upload substations**
  - Click "New tileset"
  - Upload: `data/processed/substations.geojson`
  - Wait for processing
  - ✓ Note tileset ID

- [ ] **[5 min] Upload power plants**
  - Click "New tileset"
  - Upload: `data/processed/power-plants.geojson`
  - Wait for processing
  - ✓ Note tileset ID

- [ ] **[5 min] Upload admin boundaries**
  - Click "New tileset"
  - Upload: `data/processed/admin-boundaries.geojson`
  - Wait for processing
  - ✓ Note tileset ID

### Part C: Create Map Style (20 min)

- [ ] **[5 min] Create new style**
  - Go to "Styles"
  - Click "New style"
  - Start with "Light" template
  - Name: "Morocco Energy Map"
  - Click "Create style"
  - Opens style editor

- [ ] **[15 min] Add layers**
  For each tileset above:
  - Click "+" (Add layer)
  - Select tileset
  - Configure:
    - Layer ID: e.g., "transmission-lines"
    - Layer type: line (for transmission), circle (for substations/plants)
    - Paint properties (colors):
      - Transmission: Red (#FF6B6B)
      - Substations: Orange (#FFA500)
      - Power Plants: Blue/Yellow by fuel type
  - Reference: `data/config/mapbox-schema.json` for exact colors

- [ ] **[Publish style]**
  - Click "Publish" (top right)
  - ✓ Note the style URL: `mapbox://styles/username/style-id`
  - ✓ Copy this for React integration

---

## Day 5 (Friday) — React Integration & Testing (30 min)

**Goal**: Embed Mapbox map in React, test interactivity

### Part A: React Setup (10 min)

- [ ] **[5 min] Install Mapbox GL**
  ```bash
  # In your React project root
  npm install mapbox-gl react-map-gl
  ```

- [ ] **[5 min] Environment variables**
  - Create `.env` file in project root
  - Add:
    ```
    REACT_APP_MAPBOX_TOKEN=pk.xxxxxxxxxxxx
    ```
  - Replace with your actual token from Day 4

### Part B: Create Map Component (15 min)

- [ ] **[10 min] Create component file**
  - Create: `src/components/MoroccoEnergyMap.jsx`
  - Copy basic template from `IMPLEMENTATION_GUIDE.md`
  - Update:
    - Mapbox token
    - Style URL (from Day 4)
    - Initial coordinates (center on Morocco)

- [ ] **[5 min] Test in browser**
  ```bash
  npm start
  ```
  - Component should load
  - Map should show Morocco
  - Layers should be visible (transmission red, substations orange, etc.)
  - Can zoom/pan

### Part C: Verify Interactivity (5 min)

- [ ] **Test layer visibility**
  - Zoom in/out → Lines/points should scale appropriately
  - Pan around → Should see full Morocco coverage

- [ ] **Test popups (if implemented)**
  - Click on feature → Popup should show name, capacity, operator, etc.

- [ ] **Check console for errors**
  - Open browser DevTools (F12)
  - Console tab should be clean (no red errors)

---

## Day 5 (Friday) — Final Validation (15 min)

**Goal**: Ensure data quality and completeness

- [ ] **[5 min] Data coverage check**
  ```bash
  # Check each processed file
  # Transmission lines: 37,000+ features
  # Substations: 300+ features
  # Power plants: 100+ features
  # Admin boundaries: 2,000+ features
  python scripts/validate.py
  ```

- [ ] **[5 min] Map visual check**
  - Transmission lines form interconnected grid ✓
  - Substations clustered at grid nodes ✓
  - Power plants distributed across country ✓
  - Admin boundaries match Morocco geography ✓

- [ ] **[5 min] Update documentation**
  - [ ] CONTEXT.md: Add "Data pipeline complete, Week 1 ✓"
  - [ ] Log any issues found for Week 2
  - [ ] Note any additional data needed (e.g., missing industrial zones)

---

## Deliverables by End of Week 1

✅ **Data Layer 1**: Transmission Lines (37,000+ km)  
✅ **Data Layer 2**: Substations (300+ nodes)  
✅ **Data Layer 3**: Power Plants (100+ generators)  
✅ **Data Layer 4**: Admin Boundaries (2,400 regions)  
✅ **Mapbox Tilesets**: 4 uploaded and indexed  
✅ **Map Style**: Created with 4 layers, published  
✅ **React Component**: Embedded in web app  
✅ **Documentation**: Implementation guide + this checklist  

---

## If You Get Stuck

| Problem | Quick Fix | Time |
|---------|-----------|------|
| Overpass query times out | Reduce bbox or split into quarters | 5 min |
| Mapbox tileset fails | Check GeoJSON validity, re-export from Overpass | 5 min |
| React component won't load | Check token in .env, verify style URL | 5 min |
| Shapefile extraction error | Install `pip install shapefile shapely` | 2 min |
| Missing raw files | Re-do Days 1–2 for that specific data | 10 min |

---

## Next Steps (Week 2+)

- [ ] Week 2: Add renewable energy projects layer
- [ ] Week 2: Add data center locations
- [ ] Week 3: Add OCP industrial zones (manual)
- [ ] Week 3: Add desalination plants
- [ ] Week 4: Add interconnectors (Spain/Algeria)
- [ ] Week 4: Refine UI (filters, legends, animations)

---

**Good luck! You have everything you need. Check off items as you complete them.** 🚀

