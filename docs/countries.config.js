// Adding a country to the platform:
//   1. Drop GeoJSON files into  ./data/<key>/  (+ boundary.geojson, optional)
//   2. Add an entry below: label, iso, center, zoom, bounds, dataPath, layers
//   3. Add the country key to COUNTRIES_ENABLED to surface it in the UI
//   4. Run  node scripts/validate-countries.mjs  (CI runs it too)
//
// No code change is required — app.js reads this file at boot.
//
// Layer `kind` picks the renderer (see DATA_SCHEMA.md for the fields each
// one reads):
//   power       power plants — clustered, coloured by fuel_type
//   grid        transmission lines — styled by status and voltage_kv
//   industrial  industrial consumers — coloured by palette.sectors
//   digital     data centres + cable landings — coloured by palette.providers
//   oim         OpenInfraMap live grid tiles (worldwide; file: null)
//   oim-plants  OpenInfraMap live OSM power plants (worldwide; file: null).
//               Not counted in the KPIs; `visible: false` starts it unticked.
// Layer ids must be unique within a country; map ids derive from them.
//
// Optional per country:
//   palette:        { providers: [{ key, color, short }], sectors: { name: color } }
//   boundary:       { source, sourceUrl, note } — provenance of boundary.geojson
//   snapshotSource: short credit shown above the KPI tiles
//   credits:        data credits in the footer, e.g. "GEM · ONEE · Datacentermap"

// Layers for countries built from open data (see the entries below).
const GPPD_COUNTRY_LAYERS = [
  { id: "power-plants", file: "power-plants.geojson", kind: "power",
    title: "Power plants",
    source: "WRI Global Power Plant Database v1.3 (2021, CC BY 4.0); unmaintained since 2022, so recent plants are missing",
    sourceUrl: "https://datasets.wri.org/dataset/globalpowerplantdatabase",
    updated: "2021" },
  { id: "datacentres", file: "datacentres.geojson", kind: "digital",
    title: "Data centres",
    source: "PeeringDB facility registry (operator-maintained); colocation sites only, no MW figures",
    sourceUrl: "https://www.peeringdb.com/",
    updated: "2026-09" },
  { id: "osm-plants", file: null, kind: "oim-plants",
    title: "OSM power plants",
    source: "OpenStreetMap contributors · OpenInfraMap (ODbL); all plants from zoom 8, larger ones earlier",
    sourceUrl: "https://openinframap.org/",
    updated: "live" },
  { id: "oim-grid", file: null, kind: "oim",
    title: "Transmission grid",
    source: "OpenStreetMap contributors · OpenInfraMap (ODbL)",
    sourceUrl: "https://openinframap.org/",
    updated: "live" }
];

// Layers for European countries built from powerplantmatching (see
// scripts/build-power-plants-ppm.py). Data centres wait for a PeeringDB export.
const PPM_COUNTRY_LAYERS = [
  { id: "power-plants", file: "power-plants.geojson", kind: "power",
    title: "Power plants ≥ 10 MW",
    source: "powerplantmatching v0.9.0 (PyPSA / KIT, 2026-10-03, CC BY 4.0): ENTSO-E, JRC, Open Power System Data, Global Energy Monitor and others reconciled; units on one site merged; plants under 10 MW, rooftop solar included, left out; closures as dated by the dataset",
    sourceUrl: "https://github.com/PyPSA/powerplantmatching",
    updated: "2026-10" },
  { id: "osm-plants", file: null, kind: "oim-plants",
    title: "OSM power plants",
    source: "OpenStreetMap contributors · OpenInfraMap (ODbL); all plants from zoom 8, larger ones earlier",
    sourceUrl: "https://openinframap.org/",
    updated: "live", visible: false },
  { id: "oim-grid", file: null, kind: "oim",
    title: "Transmission grid",
    source: "OpenStreetMap contributors · OpenInfraMap (ODbL)",
    sourceUrl: "https://openinframap.org/",
    updated: "live" }
];

window.COUNTRIES = {
  morocco: {
    label: "Morocco",
    iso:   "MA",
    center: [-6.3, 31.8],
    zoom:   5.5,
    bounds: [[-17.5, 20.5], [-0.8, 36.35]],
    dataPath: "./data/morocco/",
    snapshotSource: "ONEE 2025",
    credits: "GEM · ONEE · Datacentermap",
    boundary: { source: "Natural Earth 1:50m Admin 0, dissolved",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "Morocco and the Southern Provinces drawn as one territory" },
    palette: {
      providers: [
        { key:"N+ONE",                     color:"#9B6BF0", short:"N+ONE" },
        { key:"inwi",                      color:"#5BBFD9", short:"inwi" },
        { key:"Maroc Telecom (IAM)",       color:"#EC4899", short:"Maroc Telecom" },
        { key:"Naver / Nvidia consortium", color:"#F59E0B", short:"Naver × Nvidia" },
        { key:"Iozera",                    color:"#F97316", short:"Iozera" },
        { key:"Government of Morocco",     color:"#10B981", short:"Government" },
        { key:"ADD (Agence de Développement du Digital)",
                                           color:"#10B981", short:"ADD" }
      ],
      sectors: {
        "phosphates / fertilisers": "#F59E0B",
        "phosphate mining":         "#F59E0B",
        "cement":                   "#A1A1AA",
        "steel":                    "#64748B",
        "automotive":               "#0EA5E9",
        "oil refining":             "#DC2626",
        "mining / metallurgy":      "#92400E"
      }
    },
    layers: [
      { id: "power-plants", file: "power-plants.geojson", kind: "power",
        title: "Power plants",
        source: "Global Energy Monitor · ONEE · operator disclosures",
        sourceUrl: "https://globalenergymonitor.org/projects/global-power-plant-tracker/",
        updated: "2026-04" },
      { id: "oim-grid", file: null, kind: "oim",
        title: "Transmission grid",
        source: "OpenStreetMap contributors · OpenInfraMap (ODbL)",
        sourceUrl: "https://openinframap.org/",
        updated: "live" },
      { id: "osm-plants", file: null, kind: "oim-plants", visible: false,
        title: "OSM power plants",
        source: "OpenStreetMap contributors · OpenInfraMap (ODbL); all plants from zoom 8, larger ones earlier",
        sourceUrl: "https://openinframap.org/",
        updated: "live" },
      { id: "interconnectors", file: "interconnectors.geojson", kind: "grid",
        title: "Interconnectors",
        source: "REE · ONEE · editorial overlay on OpenInfraMap",
        sourceUrl: "https://openinframap.org/",
        updated: "2026-04" },
      { id: "planned-corridors", file: "planned-corridors.geojson", kind: "grid",
        title: "Planned corridors",
        source: "Xlinks · MIICEN · World Bank Group 2018 masterplan",
        sourceUrl: "https://datacatalog.worldbank.org/",
        updated: "2026-04" },
      { id: "industrial", file: "industrial.geojson", kind: "industrial",
        title: "Industry",
        source: "OCP · Holcim · SONASID · Renault · public disclosures",
        sourceUrl: "https://www.ocpgroup.ma/",
        updated: "2026-04" },
      { id: "digital", file: "digital.geojson", kind: "digital",
        title: "Data centres & cables",
        source: "Datacentermap.com · OSM · press releases",
        sourceUrl: "https://www.datacentermap.com/morocco/",
        updated: "2026-03" },
      // PeeringDB sites not already in the curated layer above (same
      // operator within 15 km is dropped by the build script).
      { id: "datacentres", file: "datacentres.geojson", kind: "digital",
        title: "More colocation sites (PeeringDB)",
        source: "PeeringDB facility registry (operator-maintained); no MW figures",
        sourceUrl: "https://www.peeringdb.com/",
        updated: "2026-09" }
    ]
  },

  // Reserved — no data in v1, will no-op until GeoJSON files are dropped in.
  // Built by scripts/build-country-open-data.py: Natural Earth outline and
  // WRI's Global Power Plant Database (v1.3, 2021, unmaintained), each plant
  // checked against the outline. Data centres are not mapped yet.
  "cote-divoire": {
    label: "C\u00f4te d'Ivoire",
    iso:   "CI",
    center: [-5.55, 7.54],
    zoom:   6.3,
    bounds: [[-8.9, 4.1], [-2.3, 11.0]],
    dataPath: "./data/cote-divoire/",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries" },
    layers: GPPD_COUNTRY_LAYERS
  },
  egypt: {
    label: "Egypt",
    iso:   "EG",
    center: [30.79, 26.82],
    zoom:   5.3,
    bounds: [[24.5, 21.7], [37.1, 31.9]],
    dataPath: "./data/egypt/",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries: the Halaib Triangle is drawn as administered by Egypt, Bir Tawil is not included" },
    layers: GPPD_COUNTRY_LAYERS
  },
  ethiopia: {
    label: "Ethiopia",
    iso:   "ET",
    center: [40.49, 9.15],
    zoom:   5.4,
    bounds: [[32.7, 3.2], [48.2, 15.1]],
    dataPath: "./data/ethiopia/",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries" },
    layers: GPPD_COUNTRY_LAYERS
  },
  ghana: {
    label: "Ghana",
    iso:   "GH",
    center: [-1.03, 7.96],
    zoom:   6.2,
    bounds: [[-3.5, 4.5], [1.4, 11.4]],
    dataPath: "./data/ghana/",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries" },
    layers: GPPD_COUNTRY_LAYERS
  },
  kenya: {
    label: "Kenya",
    iso:   "KE",
    center: [37.89, 0.4],
    zoom:   5.6,
    bounds: [[33.6, -4.9], [42.1, 5.7]],
    dataPath: "./data/kenya/",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries" },
    layers: GPPD_COUNTRY_LAYERS
  },
  nigeria: {
    label: "Nigeria",
    iso:   "NG",
    center: [8.66, 9.08],
    zoom:   5.7,
    bounds: [[2.4, 4.0], [14.9, 14.1]],
    dataPath: "./data/nigeria/",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries" },
    layers: GPPD_COUNTRY_LAYERS
  },
  rwanda: {
    label: "Rwanda",
    iso:   "RW",
    center: [29.87, -1.94],
    zoom:   8.0,
    bounds: [[28.6, -3.1], [31.1, -0.8]],
    dataPath: "./data/rwanda/",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries" },
    layers: GPPD_COUNTRY_LAYERS
  },
  "south-africa": {
    label: "South Africa",
    iso:   "ZA",
    center: [24.67, -28.47],
    zoom:   4.9,
    bounds: [[16.2, -35.0], [33.1, -21.9]],
    dataPath: "./data/south-africa/",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries; Prince Edward Islands omitted" },
    layers: GPPD_COUNTRY_LAYERS
  },

  // Power plants are an owner-supplied list, marked unverified per feature
  // until each is checked against a primary source. Industry and data
  // centres are not mapped yet.
  senegal: {
    label: "Senegal",
    iso:   "SN",
    center: [-14.4, 14.5],
    zoom:   6.2,
    bounds: [[-17.6, 12.3], [-11.3, 16.7]],
    dataPath: "./data/senegal/",
    snapshotSource: "owner list, unverified",
    credits: "owner-supplied plant list (unverified) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain" },
    layers: [
      { id: "power-plants", file: "power-plants.geojson", kind: "power",
        title: "Power plants",
        source: "Owner-supplied list (compiled with ChatGPT), not yet checked against primary sources",
        sourceUrl: "https://github.com/redatahiri37/morocco-energy-digital-map/blob/main/docs/data/senegal/power-plants.geojson",
        updated: "2026-09" },
      { id: "datacentres", file: "datacentres.geojson", kind: "digital",
        title: "Data centres",
        source: "PeeringDB facility registry (operator-maintained); colocation sites only, no MW figures",
        sourceUrl: "https://www.peeringdb.com/",
        updated: "2026-09" },
      { id: "osm-plants", file: null, kind: "oim-plants",
        title: "OSM power plants",
        source: "OpenStreetMap contributors · OpenInfraMap (ODbL); all plants from zoom 8, larger ones earlier",
        sourceUrl: "https://openinframap.org/",
        updated: "live" },
      { id: "oim-grid", file: null, kind: "oim",
        title: "Transmission grid",
        source: "OpenStreetMap contributors · OpenInfraMap (ODbL)",
        sourceUrl: "https://openinframap.org/",
        updated: "live" }
    ]
  },
  france: {
    label: "France",
    iso:   "FR",
    center: [2.4, 46.4],
    zoom:   5.4,
    bounds: [[-5.0, 41.1], [9.8, 51.3]],
    dataPath: "./data/france/",
    snapshotSource: "powerplantmatching 2026, ≥ 10 MW",
    credits: "powerplantmatching (CC BY 4.0)",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; metropolitan France and Corsica" },
    layers: PPM_COUNTRY_LAYERS
  },
  spain: {
    label: "Spain",
    iso:   "ES",
    center: [-3.7, 40.2],
    zoom:   5.4,
    bounds: [[-18.4, 27.4], [4.6, 44.0]],
    dataPath: "./data/spain/",
    snapshotSource: "powerplantmatching 2026, ≥ 10 MW",
    credits: "powerplantmatching (CC BY 4.0)",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; peninsula, Balearic and Canary Islands" },
    layers: PPM_COUNTRY_LAYERS
  },
  namibia: { label: "Namibia", iso: "NA", center: [17.5, -22.5], zoom: 5.2,
             dataPath: "./data/namibia/", layers: [], placeholder: true }
};

window.COUNTRIES_ENABLED = ["morocco", "cote-divoire", "egypt", "ethiopia", "ghana",
  "kenya", "nigeria", "rwanda", "senegal", "south-africa", "france", "spain"];
