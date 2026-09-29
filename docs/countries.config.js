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
// Layer ids must be unique within a country; map ids derive from them.
//
// Optional per country:
//   palette:        { providers: [{ key, color, short }], sectors: { name: color } }
//   boundary:       { source, sourceUrl, note } — provenance of boundary.geojson
//   snapshotSource: short credit shown above the KPI tiles
//   credits:        data credits in the footer, e.g. "GEM · ONEE · Datacentermap"

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
        updated: "2026-03" }
    ]
  },

  // Reserved — no data in v1, will no-op until GeoJSON files are dropped in.
  egypt:   { label: "Egypt",   iso: "EG", center: [30.8, 26.8], zoom: 5.2,
             dataPath: "./data/egypt/",   layers: [], placeholder: true },
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
    credits: "owner-supplied plant list (unverified)",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain" },
    layers: [
      { id: "power-plants", file: "power-plants.geojson", kind: "power",
        title: "Power plants",
        source: "Owner-supplied list (compiled with ChatGPT), not yet checked against primary sources",
        sourceUrl: "https://github.com/redatahiri37/morocco-energy-digital-map/blob/main/docs/data/senegal/power-plants.geojson",
        updated: "2026-09" },
      { id: "oim-grid", file: null, kind: "oim",
        title: "Transmission grid",
        source: "OpenStreetMap contributors · OpenInfraMap (ODbL)",
        sourceUrl: "https://openinframap.org/",
        updated: "live" }
    ]
  },
  namibia: { label: "Namibia", iso: "NA", center: [17.5, -22.5], zoom: 5.2,
             dataPath: "./data/namibia/", layers: [], placeholder: true }
};

window.COUNTRIES_ENABLED = ["morocco", "senegal"];
